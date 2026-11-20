import json
from django.test import TestCase, Client, override_settings
from django.contrib.auth.models import User
from .models import World, Resource
from .services import save_resource, serialize, snapshot, world_archive, import_world_archive
from .snippets import materialize

def prose(text):
    return {'type':'paragraph','content':[{'type':'text','text':text}]}

def ref(resource):
    return {'type':'snippet','attrs':{'id':str(resource.id),'label':resource.title}}

@override_settings(ALLOWED_HOSTS=['testserver'])
class SnippetWorkflowTests(TestCase):
    def setUp(self):
        self.owner=User.objects.create_user('snippet-owner')
        self.other=User.objects.create_user('snippet-other')
        self.world=World.objects.create(owner=self.owner,name='Snippet world')
        self.source=save_resource(self.world,{'title':'Read aloud','kind':'article','data':{'reusable_snippet':True,'snippet_collection':'Locations'},'document':{'type':'doc','content':[prose('Original rich text')]}})
        self.note=save_resource(self.world,{'title':'Session note','kind':'note','document':{'type':'doc','content':[ref(self.source)]}})

    def publish(self,r):
        r.visibility='public';r.published={**snapshot(r),'_revision':r.revision};r.save()

    def test_live_source_updates_without_changing_consumer(self):
        self.assertIn('Original rich text',serialize(self.note)['html'])
        save_resource(self.world,{'document':{'type':'doc','content':[prose('Updated source')]},'expected_revision':self.source.revision},self.source)
        self.assertIn('Updated source',serialize(self.note)['html'])
        self.note.refresh_from_db();self.assertEqual(self.note.revision,1)

    def test_reader_uses_published_source_and_hides_private_blocks(self):
        save_resource(self.world,{'document':{'type':'doc','content':[prose('PUBLIC SOURCE'),{'type':'privateBlock','content':[prose('PRIVATE BLOCK')]}]},'expected_revision':1},self.source)
        self.publish(self.source);self.publish(self.note)
        save_resource(self.world,{'document':{'type':'doc','content':[prose('DRAFT SECRET')]},'expected_revision':self.source.revision},self.source)
        result=serialize(self.note,reader=True)
        self.assertIn('PUBLIC SOURCE',result['html']);self.assertNotIn('PRIVATE BLOCK',result['html']);self.assertNotIn('DRAFT SECRET',result['html'])

    def test_unpublished_nested_source_does_not_leak(self):
        hidden=save_resource(self.world,{'title':'SECRET TITLE','kind':'article','data':{'reusable_snippet':True},'document':{'type':'doc','content':[prose('SECRET BODY')]}})
        save_resource(self.world,{'document':{'type':'doc','content':[ref(hidden)]},'expected_revision':1},self.source)
        self.publish(self.source);self.publish(self.note)
        result=json.dumps(serialize(self.note,reader=True))
        self.assertNotIn('SECRET TITLE',result);self.assertNotIn('SECRET BODY',result);self.assertNotIn(str(hidden.id),result)

    def test_nested_copy_is_separate_and_keeps_rich_marks(self):
        child=save_resource(self.world,{'title':'Child','kind':'article','data':{'reusable_snippet':True},'document':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'Nested bold','marks':[{'type':'bold'}]}]}]}})
        save_resource(self.world,{'document':{'type':'doc','content':[ref(child)]},'expected_revision':1},self.source)
        copied=materialize(self.source)
        self.assertNotIn('"type": "snippet"',json.dumps(copied));self.assertIn('Nested bold',json.dumps(copied));self.assertIn('bold',json.dumps(copied))
        save_resource(self.world,{'document':{'type':'doc','content':[prose('Changed')]},'expected_revision':1},child)
        self.assertIn('Nested bold',json.dumps(copied))

    def test_cycles_are_bounded_and_copy_rejects_them(self):
        save_resource(self.world,{'document':{'type':'doc','content':[ref(self.source)]},'expected_revision':1},self.source)
        self.assertIn('cycle or depth limit',serialize(self.note)['html'])
        with self.assertRaises(ValueError):materialize(self.source)

    def test_deleted_source_is_unavailable(self):
        from django.utils import timezone
        self.source.deleted_at=timezone.now();self.source.save()
        self.assertIn('Unavailable snippet',serialize(self.note)['html'])
        with self.assertRaises(ValueError):materialize(self.source)

    def test_copy_endpoint_is_owner_only_and_does_not_write(self):
        c=Client();route=f'/api/resources/{self.source.id}/snippet-copy'
        self.assertEqual(c.get(route).status_code,401);c.force_login(self.other);self.assertEqual(c.get(route).status_code,404)
        c.force_login(self.owner);self.assertEqual(c.get(route).status_code,200)
        self.source.refresh_from_db();self.assertEqual(self.source.revision,1)
        backlinks=c.get(f'/api/resources/{self.source.id}').json()['backlinks']
        self.assertIn(str(self.note.id),[entry['id'] for entry in backlinks])

    def test_world_archive_remaps_snippet_references(self):
        restored=import_world_archive(self.owner,world_archive(self.world))
        source=Resource.objects.get(world=restored,title=self.source.title);note=Resource.objects.get(world=restored,title=self.note.title)
        self.assertEqual(note.document['content'][0]['attrs']['id'],str(source.id));self.assertNotEqual(source.id,self.source.id)
        self.assertIn('Original rich text',serialize(note)['html'])

    def test_marker_validation_and_foreign_reference(self):
        with self.assertRaises(ValueError):save_resource(self.world,{'title':'Invalid','kind':'note','data':{'reusable_snippet':True}})
        with self.assertRaises(ValueError):save_resource(self.world,{'title':'Invalid','kind':'article','data':{'reusable_snippet':'yes'}})
        foreign=World.objects.create(owner=self.other,name='Other')
        with self.assertRaises(ValueError):save_resource(foreign,{'title':'Other note','kind':'note','document':{'type':'doc','content':[ref(self.source)]}})
        # Corrupt/legacy data still cannot reveal a foreign source at render time.
        note=Resource.objects.create(world=foreign,title='Legacy foreign note',kind='note',document={'type':'doc','content':[ref(self.source)]})
        self.assertIn('Unavailable snippet',serialize(note)['html']);self.assertNotIn('Original rich text',serialize(note)['html'])

    def test_notebook_html_expands_current_or_published_snippets(self):
        from .notebooks import act, export_book
        import uuid
        book=act(self.world,{'action':'book','title':'Notebook','sections':[{'id':str(uuid.uuid4()),'title':'Notes','parent_id':'','entry_ids':[str(self.note.id)]}]})['entry']
        source_book=Resource.objects.get(id=book['id'])
        self.assertIn('Original rich text',export_book(source_book,private=True))
        self.assertNotIn('Original rich text',export_book(source_book,private=False))
        self.publish(self.source);self.publish(self.note)
        self.assertIn('Original rich text',export_book(source_book,private=False))

    def test_copy_rejects_unavailable_nested_source(self):
        import uuid
        save_resource(self.world,{'document':{'type':'doc','content':[]},'expected_revision':1},self.source)
        # Simulate an unavailable legacy reference; normal writes reject new missing IDs.
        self.source.document={'type':'doc','content':[{'type':'snippet','attrs':{'id':str(uuid.uuid4()),'label':'Missing'}}]}
        self.source.save()
        with self.assertRaises(ValueError):materialize(self.source)

    def test_reader_redacts_private_marked_link_inside_snippet(self):
        hidden=save_resource(self.world,{'title':'SECRET PLACE','kind':'article'})
        document={'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'SECRET PLACE','marks':[{'type':'link','attrs':{'href':'/#/entry/'+str(hidden.id)}}]}]}]}
        save_resource(self.world,{'document':document,'expected_revision':1},self.source)
        self.publish(self.source);self.publish(self.note)
        result=serialize(self.note,reader=True)['html']
        self.assertNotIn('SECRET PLACE',result);self.assertNotIn(str(hidden.id),result)

    def test_render_has_shared_expansion_budget(self):
        from .documents import render
        refs={str(self.source.id):{'id':str(self.source.id),'title':'Source','data':{'reusable_snippet':True},'document':self.source.document}}
        result=render(self.note.document,refs,_budget=[2,100])
        self.assertIn('render limit reached',result);self.assertLess(len(result),1000)
