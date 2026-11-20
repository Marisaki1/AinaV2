import copy
import json
from django.test import TestCase, Client, override_settings
from django.contrib.auth.models import User
from .models import World, Resource
from .services import save_resource, serialize, snapshot, world_archive, import_world_archive
from .structured import review, required

@override_settings(ALLOWED_HOSTS=['testserver'])
class StructuredFieldTests(TestCase):
    def setUp(self):
        self.owner=User.objects.create_user('field-owner');self.other=User.objects.create_user('field-other')
        self.world=World.objects.create(owner=self.owner,name='Field world')
        self.fields=[{'id':'origin','name':'Origin','type':'text','required':True,'section':'Identity'},
            {'id':'score','name':'Score','type':'number'},{'id':'check','name':'Known','type':'check'},
            {'id':'choice','name':'Role','type':'select','options':['Guide','Merchant']},
            {'id':'link','name':'Home','type':'reference'},{'id':'list','name':'Clues','type':'list'},
            {'id':'secret','name':'Secret','type':'long','private':True}]
        self.template=save_resource(self.world,{'title':'Person template','kind':'template','data':{'fields':self.fields}})
        self.page=save_resource(self.world,{'title':'Person','kind':'article','template':'custom:'+str(self.template.id),'data':{'fields':{'Origin':'Mountain','Unknown legacy':'Keep me'},'custom_unknown':{'keep':True}}})
        self.client.force_login(self.owner)

    def edit_values(self,values):
        return save_resource(self.world,{'data':{**self.page.data,'structured_values':{**self.page.data['structured_values'],**values}},'expected_revision':self.page.revision},self.page)

    def upgrade(self):
        result=review(self.page)
        return self.client.post(f'/api/resources/{self.page.id}/field-schema',data=json.dumps({'expected_revision':self.page.revision,'template_revision':result['template_revision']}),content_type='application/json')

    def test_pinned_schema_and_all_field_types(self):
        target=save_resource(self.world,{'title':'Home','kind':'article'})
        self.edit_values({'origin':'Valley','score':0,'check':False,'choice':'Guide','link':str(target.id),'list':['Clue A','Clue B'],'secret':'Private text'})
        self.page.refresh_from_db();self.assertEqual(self.page.data['fields']['Origin'],'Valley')
        self.assertEqual(self.page.data['structured_schema']['template_revision'],1)
        self.assertEqual(self.page.data['fields']['Unknown legacy'],'Keep me');self.assertTrue(self.page.data['custom_unknown']['keep'])
        self.assertEqual(serialize(self.page)['data']['structured_labels']['link'],'Home')

    def test_schema_changes_are_explicit_and_renames_keep_values(self):
        fields=copy.deepcopy(self.fields);fields[0]['name']='Homeland'
        save_resource(self.world,{'data':{'fields':fields},'expected_revision':1},self.template)
        self.page.refresh_from_db();self.assertEqual(self.page.data['structured_schema']['fields'][0]['name'],'Origin')
        response=self.upgrade();self.assertEqual(response.status_code,200,response.content)
        self.page.refresh_from_db();self.assertEqual(self.page.data['structured_values']['origin'],'Mountain')
        self.assertEqual(self.page.data['structured_schema']['fields'][0]['name'],'Homeland')

    def test_removal_and_incompatible_types_retain_values(self):
        self.edit_values({'score':12,'choice':'Guide'})
        fields=[f for f in copy.deepcopy(self.fields) if f['id']!='score'];fields[0]['type']='number'
        save_resource(self.world,{'data':{'fields':fields},'expected_revision':1},self.template)
        self.assertEqual(self.upgrade().status_code,200)
        self.page.refresh_from_db();retained=self.page.data['structured_retired']
        self.assertIn('Mountain',[r['value'] for r in retained]);self.assertIn(12,[r['value'] for r in retained])
        self.assertEqual(self.page.data['structured_values']['choice'],'Guide')

    def test_stale_article_or_template_update_rejects(self):
        route=f'/api/resources/{self.page.id}/field-schema'
        response=self.client.post(route,data=json.dumps({'expected_revision':0,'template_revision':1}),content_type='application/json')
        self.assertEqual(response.status_code,409)
        response=self.client.post(route,data=json.dumps({'expected_revision':1,'template_revision':0}),content_type='application/json')
        self.assertEqual(response.status_code,409);self.page.refresh_from_db();self.assertEqual(self.page.revision,1)

    def test_invalid_values_and_foreign_references_reject(self):
        foreign=World.objects.create(owner=self.other,name='Foreign');target=save_resource(foreign,{'title':'Private home','kind':'article'})
        for value in [{'score':True},{'choice':'Invalid'},{'check':'true'},{'list':['ok',123]},{'link':str(target.id)}]:
            with self.assertRaises(ValueError):self.edit_values(value)

    def test_reader_filters_private_retired_unknown_and_reference_ids(self):
        home=save_resource(self.world,{'title':'PRIVATE HOME','kind':'article'})
        self.edit_values({'secret':'PRIVATE VALUE','link':str(home.id)})
        self.page.visibility='public';self.page.published={**snapshot(self.page),'_revision':self.page.revision};self.page.save()
        for full in (True,False):
            data=serialize(self.page,full=full,reader=True)['data'];encoded=json.dumps(data)
            self.assertNotIn('PRIVATE VALUE',encoded);self.assertNotIn('PRIVATE HOME',encoded);self.assertNotIn(str(home.id),encoded)
            self.assertNotIn('Unknown legacy',encoded);self.assertNotIn(str(self.template.id),encoded)

    def test_required_uses_pinned_version_and_false_zero_are_values(self):
        required(self.page)
        self.edit_values({'origin':''})
        with self.assertRaises(ValueError):required(self.page)
        fields=copy.deepcopy(self.fields);fields[0]['required']=False;fields[1]['required']=True;fields[2]['required']=True
        save_resource(self.world,{'data':{'fields':fields},'expected_revision':1},self.template)
        self.assertEqual(self.upgrade().status_code,200);self.page.refresh_from_db();self.edit_values({'score':0,'check':False});required(self.page)

    def test_cannot_forge_schema_and_other_account_cannot_review(self):
        data=copy.deepcopy(self.page.data);data['structured_schema']['fields']=[]
        with self.assertRaises(ValueError):save_resource(self.world,{'data':data,'expected_revision':1},self.page)
        c=Client();c.force_login(self.other);self.assertEqual(c.get(f'/api/resources/{self.page.id}/field-schema').status_code,404)

    def test_archive_preserves_schemas_values_and_remaps_template(self):
        self.edit_values({'score':5,'list':['Clue']})
        restored=import_world_archive(self.owner,world_archive(self.world))
        page=Resource.objects.get(world=restored,title='Person');template=Resource.objects.get(world=restored,title='Person template')
        self.assertEqual(page.data['structured_schema']['template_id'],str(template.id));self.assertEqual(page.template,'custom:'+str(template.id))
        self.assertEqual(page.data['structured_values']['score'],5);self.assertEqual(page.data['fields']['Unknown legacy'],'Keep me')

    def test_structured_html_and_notebook_exports_follow_privacy(self):
        from .notebooks import act, export_book
        import uuid
        self.edit_values({'secret':'PRIVATE FIELD','list':['First clue','Second clue'],'score':0,'check':False})
        rendered=serialize(self.page)['structured_html']
        self.assertIn('PRIVATE FIELD',rendered);self.assertIn('First clue',rendered);self.assertIn('Identity',rendered)
        self.page.visibility='public';self.page.published={**snapshot(self.page),'_revision':self.page.revision};self.page.save()
        self.assertNotIn('PRIVATE FIELD',serialize(self.page,reader=True)['structured_html'])
        book=act(self.world,{'action':'book','title':'Field notebook','sections':[{'id':str(uuid.uuid4()),'title':'People','parent_id':'','entry_ids':[str(self.page.id)]}]})['entry']
        resource=Resource.objects.get(id=book['id'])
        self.assertIn('First clue',export_book(resource,private=False));self.assertNotIn('PRIVATE FIELD',export_book(resource,private=False))
        self.assertIn('PRIVATE FIELD',export_book(resource,private=True))

    def test_removed_value_can_be_recovered_by_its_stable_field_id(self):
        self.edit_values({'score':12})
        save_resource(self.world,{'data':{'fields':[f for f in self.fields if f['id']!='score']},'expected_revision':1},self.template)
        self.assertEqual(self.upgrade().status_code,200);self.page.refresh_from_db()
        self.assertNotIn('score',self.page.data['structured_values'])
        save_resource(self.world,{'data':{'fields':self.fields},'expected_revision':2},self.template)
        self.assertEqual(self.upgrade().status_code,200);self.page.refresh_from_db()
        self.assertEqual(self.page.data['structured_values']['score'],12)

    def test_unknown_stored_values_survive_owner_round_trip(self):
        self.edit_values({'unknown-id':{'keep':True}})
        data=serialize(self.page)['data']
        self.assertEqual(data['structured_values']['unknown-id'],{'keep':True})
        save_resource(self.world,{'data':data,'expected_revision':self.page.revision},self.page)
        self.assertEqual(self.page.data['structured_values']['unknown-id'],{'keep':True})

    def test_reader_search_and_schema_do_not_expose_private_editor_metadata(self):
        from .services import search_resources
        self.edit_values({'secret':'HIDDEN SEARCH VALUE','choice':'Guide'})
        self.page.visibility='public';self.page.published={**snapshot(self.page),'_revision':self.page.revision};self.page.save()
        self.assertEqual(search_resources(self.world,'HIDDEN SEARCH VALUE',reader=True),[])
        data=serialize(self.page,reader=True)['data']
        self.assertNotIn('options',json.dumps(data['structured_schema']))
        self.assertNotIn('Merchant',json.dumps(data));self.assertIn('Guide',json.dumps(data))

    def test_reader_keeps_published_schema_after_owner_upgrade(self):
        self.page.visibility='public';self.page.published={**snapshot(self.page),'_revision':self.page.revision};self.page.save()
        fields=copy.deepcopy(self.fields);fields[0]['name']='Homeland'
        save_resource(self.world,{'data':{'fields':fields},'expected_revision':1},self.template)
        self.assertEqual(self.upgrade().status_code,200);self.page.refresh_from_db()
        self.assertEqual(self.page.data['structured_schema']['fields'][0]['name'],'Homeland')
        self.assertEqual(serialize(self.page,reader=True)['data']['structured_schema']['fields'][0]['name'],'Origin')

    def test_article_restore_recovers_schema_values_and_original_id(self):
        self.edit_values({'origin':'Valley','score':5})
        response=self.client.post(f'/api/resources/{self.page.id}/restore',data=json.dumps({'number':1,'expected_revision':self.page.revision}),content_type='application/json')
        self.assertEqual(response.status_code,200,response.content)
        self.page.refresh_from_db();self.assertEqual(self.page.data['structured_values']['origin'],'Mountain')
        self.assertEqual(response.json()['id'],str(self.page.id));self.assertEqual(self.page.revision,3)

    def test_reference_fields_participate_in_backlinks_and_audit(self):
        from .notebooks import audit
        from django.utils import timezone
        target=save_resource(self.world,{'title':'Linked home','kind':'article'})
        self.edit_values({'link':str(target.id)})
        backlinks=self.client.get(f'/api/resources/{target.id}').json()['backlinks']
        self.assertIn(str(self.page.id),[v['id'] for v in backlinks])
        target.deleted_at=timezone.now();target.save()
        self.assertIn(str(self.page.id),[v['id'] for v in audit(self.world)['broken']])
