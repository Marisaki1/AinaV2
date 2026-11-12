import json
from django.contrib.auth.models import User
from django.test import TestCase, Client, override_settings
from .models import World

@override_settings(ALLOWED_HOSTS=['testserver','127.0.0.1'])
class AinaAccountsTests(TestCase):
    def test_revision_preview_is_read_only_and_owner_scoped(self):
        from .services import save_resource
        owner = User.objects.create_user('revision-owner')
        other = User.objects.create_user('revision-other')
        world = World.objects.create(owner=owner, name='Revision test')
        entry = save_resource(world, {'title': 'Original note', 'kind': 'note', 'private_notes': 'Private original'})
        save_resource(world, {'title': 'Updated note', 'expected_revision': entry.revision}, entry)
        route = f'/api/resources/{entry.id}/revisions/1'
        c = Client()
        self.assertEqual(c.get(route).status_code, 401)
        c.force_login(other)
        self.assertEqual(c.get(route).status_code, 404)
        c.force_login(owner)
        response = c.get(route)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['snapshot']['title'], 'Original note')
        self.assertEqual(response.json()['snapshot']['private_notes'], 'Private original')
        self.assertIn('title', response.json()['changed_fields'])
        entry.refresh_from_db()
        self.assertEqual(entry.title, 'Updated note')
        self.assertEqual(entry.revisions.count(), 2)
        self.assertEqual(c.get(route[:-1] + '999').status_code, 404)

    def post(self, client, route, data):
        return client.post('/api/'+route, data=json.dumps(data), content_type='application/json')

    def test_first_account_username_is_editable_and_can_manage_backups(self):
        c=Client()
        response=self.post(c,'setup',{'username':'my_name','name':'My name','password':'test-password'})
        self.assertEqual(response.status_code,201,response.content)
        self.assertTrue(User.objects.get(username='my_name').is_staff)
        self.assertTrue(c.get('/api/bootstrap').json()['user']['installation_owner'])
        self.assertEqual(c.get('/api/backups').status_code,200)

    def test_legacy_display_name_login_keeps_original_account(self):
        user=User.objects.create_user('owner',first_name='a',password='original-password')
        original_hash=user.password
        world=World.objects.create(owner=user,name='Original world')
        c=Client()
        self.assertEqual(self.post(c,'login',{'username':'a','password':'wrong'}).status_code,401)
        self.assertEqual(self.post(c,'login',{'username':'a','password':'original-password'}).status_code,200)
        self.assertEqual(c.get('/api/bootstrap').json()['user']['name'],'a')
        self.assertEqual(c.get('/api/worlds').json()['worlds'][0]['id'],str(world.id))
        user.refresh_from_db();self.assertEqual(user.username,'owner');self.assertEqual(user.password,original_hash)

    def test_ambiguous_display_name_is_not_a_login_alias(self):
        User.objects.create_user('one',first_name='same',password='first-password')
        User.objects.create_user('two',first_name='same',password='second-password')
        self.assertEqual(self.post(Client(),'login',{'username':'same','password':'first-password'}).status_code,401)

    def test_register_login_logout_and_private_worlds(self):
        owner=User.objects.create_user('owner',password='existing-password')
        private=World.objects.create(owner=owner,name='Original campaign')
        c=Client()
        r=self.post(c,'register',{'username':'New_User','password':'test-password','name':'New user','world_name':'New world'})
        self.assertEqual(r.status_code,201,r.content)
        account=User.objects.get(username='new_user')
        self.assertTrue(account.check_password('test-password'))
        self.assertNotEqual(account.password,'test-password')
        self.assertEqual([w['name'] for w in c.get('/api/worlds').json()['worlds']],['New world'])
        self.assertEqual(c.get('/api/worlds/'+str(private.id)).status_code,404)
        self.assertEqual(c.get('/api/backups').status_code,403)
        self.assertEqual(self.post(c,'logout',{}).status_code,200)
        self.assertEqual(c.get('/api/worlds').status_code,401)
        self.assertEqual(self.post(c,'login',{'username':'NEW_USER','password':'wrong'}).status_code,401)
        self.assertEqual(self.post(c,'login',{'username':'NEW_USER','password':'test-password'}).status_code,200)
        self.post(c,'logout',{})
        self.assertEqual(self.post(c,'login',{'password':'existing-password'}).status_code,200)
        self.assertEqual(c.get('/api/worlds').json()['worlds'][0]['name'],'Original campaign')
        self.assertTrue(User.objects.get(username='owner').check_password('existing-password'))

    def test_duplicates_reserved_names_and_invalid_passwords(self):
        c=Client()
        for data in [{'username':'owner','password':'test-password'},{'username':'ab','password':'test-password'},{'username':'valid','password':'short'}]:
            self.assertEqual(self.post(c,'register',data).status_code,400)
        User.objects.create_user('used',password='test-password')
        self.assertEqual(self.post(c,'register',{'username':'USED','password':'test-password'}).status_code,409)
        self.assertEqual(User.objects.count(),1)

    def test_csrf_and_managed_frame_policy(self):
        c=Client(enforce_csrf_checks=True)
        self.assertEqual(self.post(c,'register',{'username':'valid','password':'test-password'}).status_code,403)
        response=c.get('/api/bootstrap')
        self.assertEqual(response['X-Frame-Options'],'DENY')
        with override_settings(AINA_PARENT='http://127.0.0.1:4317'):
            response=c.get('/api/bootstrap')
            self.assertNotIn('X-Frame-Options',response)
            self.assertIn('frame-ancestors http://127.0.0.1:4317',response['Content-Security-Policy'])
            self.assertEqual(response.json()['aina_parent'],'http://127.0.0.1:4317')
