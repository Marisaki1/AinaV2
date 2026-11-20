import copy
import hashlib
import io
import json
import uuid
from unittest.mock import patch
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from PIL import Image
from .models import World, Resource, Asset, Connection
from .services import Conflict, save_resource, snapshot, serialize, store_asset
from .transfers import preview, commit, RECEIPTS
from .notebooks import act


@override_settings(ALLOWED_HOSTS=['testserver'])
class TransferTests(TestCase):
    def setUp(self):
        self.user=User.objects.create_user('transfer-owner');self.other=User.objects.create_user('transfer-other')
        self.source=World.objects.create(owner=self.user,name='Source',data={'unknown':'source settings'})
        self.target=World.objects.create(owner=self.user,name='Target',data={'unknown':'target settings'})
        self.folder=self.add('Folder','folder');self.note=self.add('Note','note',self.folder,data={'unknown':{'preserve':True}})
        self.client.force_login(self.user)

    def add(self,title,kind='article',parent=None,data=None,document=None):
        return save_resource(self.source,{'title':title,'kind':kind,'parent':str(parent.id) if parent else None,
            'data':data or {},'document':document or {'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'Original prose'}]}]}})

    def options(self,**values):
        return {'ids':[str(self.note.id)],'target':str(self.target.id),'key':str(uuid.uuid4()),'mode':'copy','descendants':True,**values}

    def review(self,value):
        self.source.refresh_from_db();self.target.refresh_from_db()
        return {**value,'token':preview(self.source,self.target,value)['token'],'acknowledge_references':True}

    def send(self,endpoint,value):
        return self.client.post(f'/api/worlds/{self.source.id}/transfer'+endpoint,json.dumps(value),content_type='application/json')

    def test_preview_does_not_write_and_expands_parent_dependencies(self):
        value=self.options();before=Resource.objects.count()
        result=preview(self.source,self.target,value)
        self.assertEqual(Resource.objects.count(),before)
        self.assertEqual({row['id'] for row in result['records']},{str(self.note.id),str(self.folder.id)})
        self.assertFalse(self.target.resources.exists());self.assertNotIn(RECEIPTS,self.source.data)

    def test_copy_preserves_source_prose_unknown_fields_and_target_settings(self):
        before=copy.deepcopy(snapshot(self.note));value=self.review(self.options())
        result=commit(self.source,self.target,value)
        self.note.refresh_from_db();self.assertEqual(snapshot(self.note),before)
        copied=self.target.resources.get(id=result['mapping'][str(self.note.id)])
        self.assertEqual(copied.document,self.note.document);self.assertEqual(copied.data,self.note.data)
        self.assertEqual(str(copied.parent_id),result['mapping'][str(self.folder.id)])
        self.assertNotEqual(copied.id,self.note.id)
        self.target.refresh_from_db();self.assertEqual(self.target.data['unknown'],'target settings')

    def test_move_trashes_selected_only_and_keeps_dependency_original(self):
        result=commit(self.source,self.target,self.review(self.options(mode='move')))
        self.note.refresh_from_db();self.folder.refresh_from_db()
        self.assertIsNotNone(self.note.deleted_at);self.assertIsNone(self.folder.deleted_at)
        self.assertIn(str(self.note.id),result['moved_ids']);self.assertGreater(self.note.revisions.count(),1)

    def test_move_descendants_keeps_new_copies_private(self):
        self.note.visibility='public';self.note.published={**snapshot(self.note),'_revision':self.note.revision};self.note.save()
        result=commit(self.source,self.target,self.review(self.options(ids=[str(self.folder.id)],mode='move')))
        self.assertEqual(len(result['moved_ids']),2)
        self.assertFalse(self.target.resources.exclude(visibility='private').exists())
        self.assertFalse(self.target.resources.filter(published__isnull=False).exists())

    def test_repeated_commit_reuses_receipt_even_with_old_preview(self):
        value=self.review(self.options());first=commit(self.source,self.target,value)
        value['token']='expired or lost';second=commit(self.source,self.target,value)
        self.assertTrue(second['reused']);self.assertEqual(second['mapping'],first['mapping'])
        self.assertEqual(self.target.resources.count(),2)
        changed={**value,'ids':[str(self.folder.id)]}
        with self.assertRaises(Conflict):commit(self.source,self.target,changed)

    def test_source_target_and_dependency_conflicts_leave_no_copy(self):
        for location in ('source','target','dependency'):
            with self.subTest(location=location):
                value=self.review(self.options())
                current=self.note if location=='source' else self.folder if location=='dependency' else None
                if current:save_resource(self.source,{'summary':location,'expected_revision':current.revision},current)
                else:self.target.data['changed']=True;self.target.save()
                with self.assertRaises(Conflict):commit(self.source,self.target,value)
                self.assertFalse(self.target.resources.exists())

    def test_literal_and_outside_references_require_explicit_acknowledgement(self):
        other=self.add('Other')
        save_resource(self.source,{'data':{**self.note.data,'opaque':'literal '+str(other.id)},'expected_revision':self.note.revision},self.note)
        value=self.options();result=preview(self.source,self.target,value)
        self.assertTrue(result['literal_references'])
        value.update(token=result['token'],acknowledge_references=False)
        with self.assertRaises(ValueError):commit(self.source,self.target,value)
        self.assertFalse(self.target.resources.exists())
        value['acknowledge_references']=True;copied=commit(self.source,self.target,value)
        original=self.target.resources.get(id=copied['mapping'][str(self.note.id)])
        self.assertEqual(original.data['opaque'],'literal '+str(other.id))

    def test_images_copy_and_existing_target_dedup_is_preserved_on_failure(self):
        image=io.BytesIO();Image.new('RGB',(4,4),'blue').save(image,format='PNG')
        asset=store_asset(self.source,SimpleUploadedFile('source.png',image.getvalue(),content_type='image/png'))
        existing=store_asset(self.target,SimpleUploadedFile('existing.png',image.getvalue(),content_type='image/png'))
        save_resource(self.source,{'data':{**self.note.data,'cover_asset':str(asset.id)},'expected_revision':self.note.revision},self.note)
        value=self.review(self.options())
        import studio.transfers as module
        original_check=module.check_json
        with patch.object(module,'check_json',side_effect=ValueError('Simulated receipt failure')):
            with self.assertRaises(ValueError):commit(self.source,self.target,value)
        self.assertTrue(existing.id in set(self.target.assets.values_list('id',flat=True)))
        from django.conf import settings
        self.assertEqual(hashlib.sha256((settings.MEDIA_ROOT/existing.storage_name).read_bytes()).hexdigest(),existing.digest)
        self.assertFalse(self.target.resources.exists())
        result=commit(self.source,self.target,value)
        self.assertEqual(result['mapping'][str(asset.id)],str(existing.id));self.assertEqual(self.target.assets.count(),1)

    def test_failed_move_rolls_back_source_trash_and_target_writes(self):
        value=self.review(self.options(mode='move'))
        with patch('studio.transfers.check_json',side_effect=ValueError('Fail before acknowledgement')):
            with self.assertRaises(ValueError):commit(self.source,self.target,value)
        self.note.refresh_from_db();self.assertIsNone(self.note.deleted_at)
        self.assertEqual(self.note.revision,1);self.assertFalse(self.target.resources.exists())

    def test_internal_relationships_are_private_and_boundary_relationships_reported(self):
        other=self.add('Related')
        edge=Connection.objects.create(world=self.source,source=self.note,target=self.folder,kind='related',visibility='public')
        Connection.objects.create(world=self.source,source=self.note,target=other,kind='outside')
        value=self.options();review=preview(self.source,self.target,value)
        self.assertEqual(review['relationship_count'],1);self.assertEqual(len(review['outside_relationships']),1)
        result=commit(self.source,self.target,{**value,'token':review['token'],'acknowledge_references':True})
        copied=self.target.connections.get(id=result['mapping'][str(edge.id)])
        self.assertEqual(copied.visibility,'private');self.assertEqual(copied.revision,1)

    def test_custom_templates_rich_links_and_capture_metadata(self):
        template=self.add('Template','template',data={'fields':[{'id':'home','name':'Home','type':'reference'}]})
        home=self.add('Home')
        note=self.add('Templated note','article',data={'fields':{'Home':str(home.id)},'unknown':'keep'})
        save_resource(self.source,{'template':'custom:'+str(template.id),'expected_revision':note.revision},note)
        value=self.review(self.options(ids=[str(note.id)]));result=commit(self.source,self.target,value)
        copied=self.target.resources.get(id=result['mapping'][str(note.id)])
        self.assertEqual(copied.template,'custom:'+result['mapping'][str(template.id)])
        self.assertEqual(copied.data['structured_values']['home'],result['mapping'][str(home.id)])

    def test_owner_and_anonymous_api_boundaries(self):
        value=self.options();self.assertEqual(Client().post(f'/api/worlds/{self.source.id}/transfer/preview',json.dumps(value),content_type='application/json').status_code,401)
        self.assertEqual(self.send('/preview?audience=reader',value).status_code,404)
        foreign=World.objects.create(owner=self.other,name='Foreign');value['target']=str(foreign.id)
        self.assertEqual(self.send('/preview',value).status_code,404)
        self.client.force_login(self.other);self.assertEqual(self.send('/preview',value).status_code,404)

    def test_invalid_tokens_selections_and_self_transfer(self):
        for override in ({'ids':[]},{'ids':[str(self.note.id)]*2},{'target':str(self.source.id)},{'mode':'bad'},{'descendants':'yes'}):
            with self.subTest(override=override),self.assertRaises(ValueError):preview(self.source,self.target,self.options(**override))
        value=self.options(token={})
        with self.assertRaises(Conflict):commit(self.source,self.target,value)

    def test_receipts_cannot_be_overwritten_by_generic_world_settings(self):
        commit(self.source,self.target,self.review(self.options()))
        response=self.client.patch(f'/api/worlds/{self.target.id}',json.dumps({'data':{'unknown':'edited'}}),content_type='application/json')
        self.assertEqual(response.status_code,200);self.target.refresh_from_db();self.assertEqual(len(self.target.data[RECEIPTS]),1)

    def test_new_media_files_are_removed_on_rollback(self):
        from django.conf import settings
        image=io.BytesIO();Image.new('RGB',(4,4),'red').save(image,format='PNG')
        asset=store_asset(self.source,SimpleUploadedFile('source.png',image.getvalue(),content_type='image/png'))
        save_resource(self.source,{'data':{**self.note.data,'cover_asset':str(asset.id)},'expected_revision':self.note.revision},self.note)
        before={path.name for path in settings.MEDIA_ROOT.iterdir() if path.is_file()}
        with patch('studio.transfers.check_json',side_effect=ValueError('Receipt failed')):
            with self.assertRaises(ValueError):commit(self.source,self.target,self.review(self.options()))
        self.assertEqual(before,{path.name for path in settings.MEDIA_ROOT.iterdir() if path.is_file()})
        self.assertFalse(self.target.assets.exists());self.assertFalse(self.target.resources.exists())

    def test_capture_replay_keys_are_reset_in_copy_not_source(self):
        key=str(uuid.uuid4())
        save_resource(self.source,{'data':{**self.note.data,'note_capture_key':key,'note_capture_fingerprint':'a'*64},'expected_revision':self.note.revision},self.note)
        result=commit(self.source,self.target,self.review(self.options()))
        copied=self.target.resources.get(id=result['mapping'][str(self.note.id)])
        self.assertNotIn('note_capture_key',copied.data);self.note.refresh_from_db();self.assertEqual(self.note.data['note_capture_key'],key)

    def test_external_owned_world_reference_is_reported_and_retained(self):
        other=World.objects.create(owner=self.user,name='Third world')
        external=save_resource(other,{'title':'External'})
        save_resource(self.source,{'data':{**self.note.data,'external':str(external.id)},'expected_revision':self.note.revision},self.note)
        value=self.options();review=preview(self.source,self.target,value)
        self.assertTrue(any(row['id']==str(external.id) for row in review['literal_references']))
        result=commit(self.source,self.target,{**value,'token':review['token'],'acknowledge_references':True})
        self.assertNotIn(str(external.id),result['mapping'])
        self.assertEqual(self.target.resources.get(id=result['mapping'][str(self.note.id)]).data['external'],str(external.id))

    def test_older_compact_receipts_still_prevent_duplicate_commits(self):
        first=self.review(self.options());commit(self.source,self.target,first)
        for index in range(21):commit(self.source,self.target,self.review(self.options()))
        result=commit(self.source,self.target,first)
        self.assertTrue(result['reused']);self.assertNotIn('mapping',result)
        self.assertEqual(self.target.resources.count(),44)

    def test_receipt_lookup_recovers_a_move_after_source_is_trashed(self):
        value=self.review(self.options(mode='move'));result=commit(self.source,self.target,value)
        response=self.client.get(f'/api/worlds/{self.source.id}/transfer',{'target':str(self.target.id),'key':value['key']})
        self.assertEqual(response.status_code,200);self.assertEqual(response.json()['receipt']['mapping'],result['mapping'])
        self.note.refresh_from_db();self.assertIsNotNone(self.note.deleted_at)

    def test_notebook_original_references_are_remapped(self):
        notebook=act(self.source,{'action':'book','title':'Research','sections':[{'id':str(uuid.uuid4()),'title':'People','parent_id':'','entry_ids':[str(self.note.id)]}]})['entry']
        result=commit(self.source,self.target,self.review(self.options(ids=[notebook['id']])))
        copied=self.target.resources.get(id=result['mapping'][notebook['id']])
        self.assertEqual(copied.data['notebook_sections'][0]['entry_ids'],[result['mapping'][str(self.note.id)]])

    def test_parent_first_source_recovery_preserves_original_ids(self):
        result=commit(self.source,self.target,self.review(self.options(ids=[str(self.folder.id)],mode='move')))
        for entry in (self.folder,self.note):
            entry.refresh_from_db();save_resource(self.source,{**snapshot(entry),'expected_revision':entry.revision},entry,restore=True)
            self.assertIsNone(entry.deleted_at)
        self.assertEqual(self.note.parent_id,self.folder.id);self.assertTrue(self.target.resources.filter(id=result['mapping'][str(self.note.id)]).exists())


@override_settings(ALLOWED_HOSTS=['testserver'])
class NoteConversionTests(TestCase):
    def setUp(self):
        self.user=User.objects.create_user('converter');self.world=World.objects.create(owner=self.user,name='Notes')
        self.note=save_resource(self.world,{'kind':'note','title':'Original','summary':'Summary','private_notes':'Secret',
            'data':{'unknown':{'keep':True},'note_capture_key':str(uuid.uuid4()),'note_capture_fingerprint':'a'*64},
            'document':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'Rich original','marks':[{'type':'bold'}]}]}]}})

    def convert(self,**values):
        return act(self.world,{'action':'note_article','id':str(self.note.id),'expected_revision':self.note.revision,**values})

    def test_conversion_preserves_rich_original_unknown_fields_and_private_defaults(self):
        original=copy.deepcopy(snapshot(self.note));result=self.convert(title='New article')
        article=self.world.resources.get(id=result['entry']['id']);self.note.refresh_from_db()
        self.assertEqual(article.document,self.note.document);self.assertEqual(article.data['unknown'],{'keep':True})
        self.assertEqual(article.private_notes,'Secret');self.assertEqual(article.visibility,'private');self.assertIsNone(article.published)
        self.assertEqual(self.note.kind,'note');self.assertEqual(self.note.document,original['document'])
        self.assertNotIn('note_capture_key',article.data);self.assertEqual(self.note.data['note_capture_key'],original['data']['note_capture_key'])
        self.assertEqual(self.note.data['note_article_id'],str(article.id))

    def test_repeat_is_idempotent_and_source_changes_do_not_overwrite_article(self):
        first=self.convert();second=self.convert();self.assertTrue(second['reused'])
        self.assertEqual(first['entry']['id'],second['entry']['id']);self.assertEqual(self.world.resources.filter(kind='article').count(),1)

    def test_stale_or_invalid_conversion_is_atomic(self):
        with self.assertRaises(Conflict):self.convert(expected_revision=0)
        with self.assertRaises(ValueError):self.convert(template='not-an-article-template')
        self.assertFalse(self.world.resources.filter(kind='article').exists())
        self.note.refresh_from_db();self.assertNotIn('note_article_id',self.note.data)

    def test_reader_cannot_obtain_private_source_note_identity(self):
        result=self.convert();article=self.world.resources.get(id=result['entry']['id'])
        article.visibility='public';article.published={**snapshot(article),'_revision':article.revision};article.save()
        public=serialize(article,reader=True)
        self.assertNotIn('source_note_id',public['data']);self.assertNotIn('Secret',json.dumps(public))

    def test_trashed_link_is_not_silently_duplicated(self):
        first=self.convert();article=self.world.resources.get(id=first['entry']['id']);article.deleted_at=timezone.now();article.save()
        with self.assertRaises(ValueError):self.convert()
        self.assertEqual(self.world.resources.filter(kind='article').count(),1)
