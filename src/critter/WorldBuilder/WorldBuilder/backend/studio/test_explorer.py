import copy
import uuid
from django.contrib.auth.models import User
from django.test import TestCase, override_settings, Client
from django.utils import timezone
from .models import World, Resource, Connection
from .services import save_resource, snapshot, Conflict, world_archive, import_world_archive
from .explorer import browse, current, save, detail


@override_settings(ALLOWED_HOSTS=['testserver'])
class ExplorerTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user('explorer-owner')
        self.other = User.objects.create_user('explorer-other')
        self.world = World.objects.create(owner=self.owner, name='Field guide', data={'unknown': {'keep': True}})
        self.foreign = World.objects.create(owner=self.other, name='Elsewhere')
        self.folder = save_resource(self.world, {'kind':'folder', 'title':'Shrine records'})
        self.nested = save_resource(self.world, {'kind':'folder', 'title':'People', 'parent':str(self.folder.id)})
        self.person = save_resource(self.world, {'kind':'character', 'title':'Sanae Kochiya', 'aliases':['Shrine maiden'], 'parent':str(self.nested.id), 'tags':['Moriya'],
            'document':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'A silver bell at the shrine.'}]}]}, 'data':{'unknown':42}})
        self.place = save_resource(self.world, {'kind':'article','template':'settlement','title':'Moriya Shrine', 'tags':['Moriya']})
        self.group = save_resource(self.world, {'kind':'article','template':'organization','title':'Moriya Faction'})
        self.story = save_resource(self.world, {'kind':'session','title':'Arrival'})
        self.private = save_resource(self.world, {'kind':'note','title':'Raw transcript','data':{'raw_transcript':True}})
        self.edge = Connection.objects.create(world=self.world, source=self.person, target=self.place, kind='lives', label='Serves here')
        self.client.force_login(self.owner)

    def shelves(self, **kwargs):
        return save(self.world, {'expected_revision':current(self.world)['revision'],'id':str(uuid.uuid4()),'name':'Session references','entries':[str(self.person.id),str(self.place.id)],**kwargs})

    def test_subject_counts_and_original_identity(self):
        result = browse(self.world,{})
        self.assertEqual(result['sections']['people'],1);self.assertEqual(result['sections']['places'],1)
        self.assertEqual(result['sections']['groups'],1);self.assertEqual(result['sections']['stories'],1)
        self.assertNotIn(str(self.private.id),[r['id'] for r in result['entries']])
        self.assertEqual(browse(self.world,{'section':'people'})['entries'][0]['id'],str(self.person.id))

    def test_body_alias_tag_matching_and_unicode(self):
        self.assertEqual(browse(self.world,{'query':'ＳＩＬＶＥＲ shrine','tag':'moriya'})['total'],1)
        self.assertEqual(browse(self.world,{'query':'Shrine maiden'})['entries'][0]['id'],str(self.person.id))
        self.assertEqual(browse(self.world,{'query':'no such passage'})['total'],0)

    def test_internal_records_are_explicit(self):
        result = browse(self.world,{'include_internal':True})
        self.assertIn(str(self.private.id),[r['id'] for r in result['entries']])

    def test_nested_collections_and_breadcrumbs(self):
        self.assertEqual(browse(self.world,{'parent':str(self.folder.id)})['total'],1)
        result = browse(self.world,{'parent':str(self.nested.id)})
        self.assertEqual([r['id'] for r in result['trail']],[str(self.folder.id),str(self.nested.id)])
        self.assertEqual(browse(self.world,{})['collections'][0]['id'],str(self.folder.id))

    def test_deleted_collections_and_records(self):
        self.person.deleted_at=timezone.now();self.person.save()
        self.assertEqual(browse(self.world,{'section':'people'})['total'],0)
        self.folder.deleted_at=timezone.now();self.folder.save()
        with self.assertRaises(ValueError):browse(self.world,{'parent':str(self.folder.id)})

    def test_malformed_filters_and_foreign_ids_rejected(self):
        for value in [{'page':True},{'page':-1},{'section':'private'},{'query':[]},{'sort':'unsupported'},{'include_internal':1},{'audience':'reader'},{'parent':str(self.person.id)},{'shelf':str(uuid.uuid4())}]:
            with self.subTest(value=value), self.assertRaises(ValueError):browse(self.world,value)

    def test_pagination_and_recent_sort(self):
        for n in range(26):save_resource(self.world,{'title':f'Tower {n:02}'})
        first=browse(self.world,{'query':'Tower'});second=browse(self.world,{'query':'Tower','page':1})
        self.assertEqual(len(first['entries']),24);self.assertEqual(len(second['entries']),2)
        self.assertFalse({r['id'] for r in first['entries']} & {r['id'] for r in second['entries']})
        self.assertEqual(browse(self.world,{'query':'Tower','page':99})['page'],1)
        latest=browse(self.world,{'query':'Tower','sort':'recent'})['entries'][0]
        self.assertEqual(latest['title'],'Tower 25')

    def test_shelf_create_order_edit_delete_preserves_originals(self):
        before=snapshot(self.person);count=Resource.objects.count()
        value=self.shelves();row=value['shelves'][0]
        self.assertEqual(browse(self.world,{'shelf':row['id'],'sort':'shelf'})['entries'][0]['id'],str(self.person.id))
        self.shelves(id=row['id'],entries=list(reversed(row['entries'])),name='Reordered')
        self.assertEqual(browse(self.world,{'shelf':row['id'],'sort':'shelf'})['entries'][0]['id'],str(self.place.id))
        self.shelves(id=row['id'],action='delete')
        self.assertEqual(current(self.world)['shelves'],[]);self.person.refresh_from_db()
        self.assertEqual(snapshot(self.person),before);self.assertEqual(Resource.objects.count(),count)

    def test_shelf_write_conflicts_keep_previous(self):
        old=World.objects.get(id=self.world.id);self.shelves()
        with self.assertRaises(Conflict):save(old,{'expected_revision':0,'id':str(uuid.uuid4()),'name':'Stale','entries':[]})
        self.world.refresh_from_db();self.assertEqual(len(current(self.world)['shelves']),1)

    def test_same_profile_revision_but_changed_world_cas(self):
        stale=World.objects.get(id=self.world.id);self.world.data['new']='kept';self.world.save()
        with self.assertRaises(Conflict):save(stale,{'expected_revision':0,'id':str(uuid.uuid4()),'name':'Stale','entries':[]})

    def test_shelf_unknown_metadata_preserved(self):
        value=self.shelves();row=value['shelves'][0];value['unknown']='kept';row['extra']={'keep':True}
        self.world.data['explorer']=value;self.world.save()
        result=self.shelves(id=row['id'],name='Renamed')
        self.assertEqual(result['unknown'],'kept');self.assertTrue(result['shelves'][0]['extra']['keep'])
        self.assertTrue(self.world.data['unknown']['keep'])

    def test_shelf_validation_duplicate_and_foreign(self):
        foreign=save_resource(self.foreign,{'title':'Not ours'})
        for fields in [{'entries':[str(foreign.id)]},{'entries':[str(self.person.id)]*2},{'name':''},{'entries':['bad']},{'entries':list(range(121))}]:
            with self.subTest(fields=fields),self.assertRaises(ValueError):self.shelves(**fields)
        self.shelves()
        with self.assertRaises(ValueError):self.shelves(name='SESSION references')

    def test_trashed_shelf_refs_remain_recoverable_and_removable(self):
        row=self.shelves()['shelves'][0];self.person.deleted_at=timezone.now();self.person.save()
        self.assertEqual(browse(self.world,{'shelf':row['id']})['total'],1)
        self.shelves(id=row['id'],name='Still recoverable')
        self.person.deleted_at=None;self.person.save()
        self.assertEqual(browse(self.world,{'shelf':row['id']})['total'],2)

    def test_corrupt_shelf_configuration_not_overwritten(self):
        for bad in [[],{'revision':True,'shelves':[]},{'revision':0,'shelves':[{'id':'bad','name':'broken','entries':[]}]}]:
            self.world.data['explorer']=bad;self.world.save()
            with self.assertRaises(ValueError):current(self.world)
            with self.assertRaises(ValueError):self.shelves()

    def test_detail_connections_links_and_no_mutation(self):
        self.person=save_resource(self.world,{'expected_revision':self.person.revision,'document':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'resourceLink','attrs':{'id':str(self.group.id),'label':'Faction'}}]}]}},self.person)
        before=snapshot(self.person);result=detail(self.person)
        self.assertEqual(result['connections'][0]['id'],str(self.place.id));self.assertEqual(result['connections'][0]['label'],'Serves here')
        self.assertEqual(result['links'][0]['id'],str(self.group.id));self.assertEqual(snapshot(self.person),before)
        self.assertEqual(detail(self.place)['connections'][0]['direction'],'incoming')

    def test_detail_hides_deleted_edges_and_endpoints(self):
        self.edge.deleted_at=timezone.now();self.edge.save();self.assertEqual(detail(self.person)['connections'],[])
        self.edge.deleted_at=None;self.edge.save();self.place.deleted_at=timezone.now();self.place.save()
        self.assertEqual(detail(self.person)['connections'],[])
        foreign=save_resource(self.foreign,{'title':'Foreign identity'})
        Connection.objects.create(world=self.world,source=self.person,target=foreign,kind='bad-legacy',label='Must not leak')
        self.assertEqual(detail(self.person)['connections'],[])

    def test_shelf_limit_and_no_duplicate_after_lost_response(self):
        row=self.shelves()['shelves'][0]
        # Retrying an ambiguous write cannot create a second shelf with this ID.
        with self.assertRaises(Conflict):save(self.world,{'expected_revision':0,**row})
        self.shelves(id=row['id'],name='Recovered same original shelf')
        self.assertEqual(len(current(self.world)['shelves']),1)
        for n in range(23):self.shelves(name=f'Shelf {n}')
        with self.assertRaises(ValueError):self.shelves(name='One too many')
        self.assertEqual(len(current(self.world)['shelves']),24)

    def test_authentication_owner_and_reader_boundary(self):
        url=f'/api/worlds/{self.world.id}/explorer';self.assertEqual(self.client.post(url,data={},content_type='application/json').status_code,200)
        self.assertEqual(self.client.get(f'/api/resources/{self.person.id}/explorer?audience=reader').status_code,404)
        self.client.force_login(self.other)
        self.assertEqual(self.client.post(url,data={},content_type='application/json').status_code,404)
        self.assertEqual(self.client.get(f'/api/resources/{self.person.id}/explorer').status_code,404)
        self.client.logout();self.assertEqual(self.client.get(f'/api/worlds/{self.world.id}/explorer/shelves').status_code,401)

    def test_csrf_enforced(self):
        client=Client(enforce_csrf_checks=True);client.force_login(self.owner)
        self.assertEqual(client.post(f'/api/worlds/{self.world.id}/explorer/shelves',data={},content_type='application/json').status_code,403)

    def test_general_settings_cannot_overwrite_shelves(self):
        saved=self.shelves()
        result=self.client.patch(f'/api/worlds/{self.world.id}',data={'data':{'unknown':{'changed':True}}},content_type='application/json')
        self.assertEqual(result.status_code,200);self.world.refresh_from_db();self.assertEqual(current(self.world),saved)

    def test_archives_remap_shelves_and_keep_order(self):
        self.shelves();contents=world_archive(self.world);imported=import_world_archive(self.owner,contents)
        shelf=current(imported)['shelves'][0];titles={str(r.id):r.title for r in imported.resources.all()}
        self.assertEqual([titles[v] for v in shelf['entries']],['Sanae Kochiya','Moriya Shrine'])
        self.assertNotIn(str(self.person.id),shelf['entries']);self.assertEqual(imported.data['unknown'],{'keep':True})
