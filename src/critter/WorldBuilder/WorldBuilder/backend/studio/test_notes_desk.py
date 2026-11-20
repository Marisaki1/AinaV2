from django.test import TestCase, Client, override_settings
from django.contrib.auth.models import User
from .models import World, Resource
from .services import save_resource, Conflict
from .checklists import checklist_view, toggle_task
from .notebooks import act

@override_settings(ALLOWED_HOSTS=['testserver'])
class NotesDeskTests(TestCase):
    def setUp(self):
        self.owner=User.objects.create_user('notes-desk-owner')
        self.other=User.objects.create_user('notes-desk-other')
        self.world=World.objects.create(owner=self.owner,name='Notes')
        self.foreign=World.objects.create(owner=self.other,name='Foreign')
        self.doc={'type':'doc','content':[{'type':'taskList','content':[
            {'type':'taskItem','attrs':{'checked':False},'content':[{'type':'paragraph','content':[{'type':'text','text':'Find the lantern'}]}]},
            {'type':'taskItem','attrs':{'checked':True},'content':[{'type':'paragraph','content':[{'type':'text','text':'Speak to Reimu'}]}]}
        ]}]}
        self.note=save_resource(self.world,{'title':'Session notes','kind':'note','document':self.doc,'tags':['Clue','Keep']})

    def test_aggregate_filters_and_completion_preserve_original(self):
        result=checklist_view(self.world,{})
        self.assertEqual(result['total'],1)
        self.assertEqual(result['completed'],1)
        task=result['tasks'][0]
        toggle_task(self.world,{**task,'expected_revision':task['revision'],'checked':True})
        self.note.refresh_from_db()
        self.assertTrue(self.note.document['content'][0]['content'][0]['attrs']['checked'])
        self.assertEqual(self.note.tags,['Clue','Keep'])
        self.assertEqual(self.note.revisions.count(),2)
        self.assertEqual(checklist_view(self.world,{})['total'],0)
        self.assertEqual(checklist_view(self.world,{'state':'complete','q':'lantern'})['total'],1)

    def test_conflicts_and_other_worlds_do_not_change_notes(self):
        task=checklist_view(self.world,{})['tasks'][0]
        with self.assertRaises(Conflict):toggle_task(self.world,{**task,'expected_revision':0,'checked':True})
        with self.assertRaises(ValueError):toggle_task(self.foreign,{**task,'expected_revision':task['revision'],'checked':True})
        self.note.refresh_from_db();self.assertEqual(self.note.document,self.doc)

    def test_invalid_task_paths_and_boolean_values(self):
        for path,checked in [([0,999],True),([0,-1],True),([0,0],'true'),([],True)]:
            with self.assertRaises((ValueError,Conflict)):
                toggle_task(self.world,{'entry_id':str(self.note.id),'expected_revision':1,'path':path,'checked':checked})
        self.note.refresh_from_db();self.assertEqual(self.note.revision,1)

    def test_bulk_trash_undo_retains_documents_and_identity(self):
        result=act(self.world,{'action':'trash','entries':[{'id':str(self.note.id),'revision':1}]})
        self.note.refresh_from_db();self.assertIsNotNone(self.note.deleted_at)
        self.assertEqual(checklist_view(self.world,{})['total'],0)
        act(self.world,{'action':'restore_bulk','entries':result['entries']})
        self.note.refresh_from_db();self.assertIsNone(self.note.deleted_at)
        self.assertEqual(self.note.document,self.doc)
        self.assertEqual(self.note.revisions.count(),3)

    def test_bulk_conflict_rolls_back_every_entry(self):
        other=save_resource(self.world,{'title':'Second note','kind':'note'})
        with self.assertRaises(Conflict):act(self.world,{'action':'trash','entries':[{'id':str(self.note.id),'revision':1},{'id':str(other.id),'revision':0}]})
        self.note.refresh_from_db();self.assertIsNone(self.note.deleted_at);self.assertEqual(self.note.revision,1)

    def test_bulk_tag_removal_preserves_other_tags(self):
        act(self.world,{'action':'bulk','entries':[{'id':str(self.note.id),'revision':1}], 'add_tags':['Reviewed'],'remove_tags':['clue']})
        self.note.refresh_from_db();self.assertEqual(self.note.tags,['Keep','Reviewed']);self.assertEqual(self.note.document,self.doc)

    def test_checklist_endpoint_requires_world_owner(self):
        route=f'/api/worlds/{self.world.id}/checklists';c=Client()
        self.assertEqual(c.get(route).status_code,401)
        c.force_login(self.other);self.assertEqual(c.get(route).status_code,404)
        c.force_login(self.owner);self.assertEqual(c.get(route).status_code,200)

    def test_trash_view_and_restore_hide_then_return_original(self):
        from .notebooks import desk
        result=act(self.world,{'action':'trash','entries':[{'id':str(self.note.id),'revision':1}]})
        self.assertEqual(desk(self.world,{'view':'trash'})['total'],1)
        self.assertEqual(desk(self.world,{'view':'all'})['total'],0)
        self.assertEqual(desk(self.foreign,{'view':'trash'})['total'],0)
        act(self.world,{'action':'restore_bulk','entries':result['entries']})
        self.assertEqual(desk(self.world,{'view':'trash'})['total'],0)
        self.assertEqual(desk(self.world,{'view':'all'})['total'],1)

    def test_unfavorite_is_versioned_and_preserves_body(self):
        act(self.world,{'action':'bulk','entries':[{'id':str(self.note.id),'revision':1}],'starred':True})
        act(self.world,{'action':'bulk','entries':[{'id':str(self.note.id),'revision':2}],'starred':False})
        self.note.refresh_from_db();self.assertFalse(self.note.data['note_starred']);self.assertEqual(self.note.document,self.doc)
