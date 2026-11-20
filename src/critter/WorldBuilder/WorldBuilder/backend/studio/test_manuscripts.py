import copy
import io
import json
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, Client, override_settings
from django.utils import timezone
from PIL import Image
from .models import World, Resource
from .services import Conflict, save_resource, serialize, snapshot, world_archive, import_world_archive, store_asset
from .manuscripts import nodes, outline, change, restore_plan, restore, compilation, export


@override_settings(ALLOWED_HOSTS=['testserver'])
class ManuscriptTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('writer')
        self.other = User.objects.create_user('other-writer')
        self.world = World.objects.create(owner=self.user, name='Writing world')
        self.book = self.create('Book', 'manuscript', data={'unknown': {'keep': True}})
        self.chapter = self.create('Chapter one', 'chapter', self.book, 0)
        self.scene = self.create('First scene', 'scene', self.chapter, 0, text='First scene words')
        self.second = self.create('Second scene', 'scene', self.chapter, 1, text='Second scene words')
        self.client.force_login(self.user)
        self.url = f'/api/resources/{self.book.id}/manuscript'

    def create(self, title, kind='scene', parent=None, position=0, data=None, text=''):
        return save_resource(self.world, {'title': title, 'kind': kind, 'parent': str(parent.id) if parent else None,
            'position': position, 'data': data or {}, 'document': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': text}]}]}})

    def change(self, action, **values):
        self.book.refresh_from_db()
        return change(self.book, {'action': action, 'expected_revisions': outline(self.book)['expected_revisions'], **values})

    def checkpoint(self):
        self.change('checkpoint', name='Before edits')
        return self.book.data['writing_checkpoints'][-1]['id']

    def publish(self, entry):
        entry.refresh_from_db();entry.visibility = 'public';entry.published = {**snapshot(entry), '_revision': entry.revision};entry.save()

    def test_outline_depth_first_and_counts(self):
        nested = self.create('Nested chapter', 'chapter', self.chapter, 2)
        last = self.create('Nested scene', 'scene', nested, text='Nested three words')
        self.assertEqual([r.title for r in nodes(self.book)], ['Book', 'Chapter one', 'First scene', 'Second scene', 'Nested chapter', 'Nested scene'])
        result = outline(self.book)
        self.assertEqual(result['statistics']['words'], 9)
        self.assertEqual(result['statistics']['chapters'], 2)
        self.assertEqual(result['statistics']['scenes'], 3)
        self.assertIn(str(last.id), result['expected_revisions'])

    def test_corkboard_reorder_preserves_ids_and_compilation_order(self):
        self.change('move', id=str(self.second.id), parent=str(self.chapter.id), position=0)
        self.assertEqual([r['title'] for r in compilation(self.book)['nodes']], ['Chapter one', 'Second scene', 'First scene'])
        self.assertEqual(Resource.objects.filter(world=self.world).count(), 4)
        self.assertEqual(outline(self.book)['statistics']['words'], 6)

    def test_move_between_chapters_preserves_prose_and_counts(self):
        chapter = self.create('Chapter two', 'chapter', self.book, 1)
        self.change('move', id=str(self.scene.id), parent=str(chapter.id), position=0)
        self.scene.refresh_from_db()
        self.assertEqual(self.scene.parent_id, chapter.id)
        self.assertEqual(outline(self.book)['statistics']['words'], 6)
        self.assertEqual(self.scene.document['content'][0]['content'][0]['text'], 'First scene words')

    def test_chapter_reorder_changes_assembled_order(self):
        chapter = self.create('Chapter two', 'chapter', self.book, 1)
        self.create('Last scene', parent=chapter, text='Last scene prose')
        self.change('move', id=str(chapter.id), parent=str(self.book.id), position=0)
        self.assertEqual([r['title'] for r in compilation(self.book)['nodes']],
            ['Chapter two', 'Last scene', 'Chapter one', 'First scene', 'Second scene'])

    def test_cycle_rolls_back_all_moves(self):
        nested = self.create('Nested', 'chapter', self.chapter)
        before = {str(r.id): (r.parent_id, r.revision) for r in nodes(self.book)}
        with self.assertRaises(ValueError):
            self.change('move', id=str(self.chapter.id), parent=str(nested.id), position=0)
        self.assertEqual(before, {str(r.id): (r.parent_id, r.revision) for r in nodes(self.book)})

    def test_stale_outline_and_membership_reject(self):
        expected = outline(self.book)['expected_revisions']
        self.create('New scene', parent=self.book)
        with self.assertRaises(Conflict):
            change(self.book, {'action': 'checkpoint', 'name': 'Stale', 'expected_revisions': expected})
        self.assertNotIn('writing_checkpoints', self.book.data)

    def test_selected_compilation_excludes_unselected_and_research_folders(self):
        folder = self.create('Research', 'folder', self.book, 1)
        self.create('Private research prose', parent=folder, text='Not in the book')
        self.assertEqual(outline(self.book)['statistics']['words'], 6)
        self.change('settings', settings={'writing_include': [str(self.chapter.id), str(self.second.id)]})
        result = compilation(self.book)
        self.assertEqual([r['id'] for r in result['nodes']], [str(self.chapter.id), str(self.second.id)])
        self.assertNotIn('Not in the book', export(self.book, 'text')[0].decode())

    def test_reader_requires_published_root(self):
        with self.assertRaises(ValueError): compilation(self.book, True)
        self.assertEqual(self.client.get(self.url + '/compile?audience=reader').status_code, 400)

    def test_reader_uses_published_selection_parent_and_prose(self):
        self.change('settings', settings={'writing_include': [str(self.chapter.id), str(self.scene.id)]})
        for entry in [self.book, self.chapter, self.scene, self.second]: self.publish(entry)
        save_resource(self.world, {'title': 'Draft secret title', 'parent': None, 'document': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Secret changed prose'}]}]}, 'expected_revision': self.scene.revision}, self.scene)
        result = compilation(self.book, True)
        self.assertEqual([r['title'] for r in result['nodes']], ['Chapter one', 'First scene'])
        text = export(self.book, 'html', True)[0].decode()
        self.assertNotIn('Secret changed prose', text)
        self.assertNotIn('Draft secret title', text)
        self.assertNotIn('Second scene words', text)
        self.assertIn('First scene words', text)

    def test_private_checkpoint_and_research_do_not_leak_to_reader(self):
        self.checkpoint()
        self.change('settings', settings={'writing_research': [str(self.second.id)]})
        self.publish(self.book)
        result = serialize(self.book, reader=True)
        self.assertNotIn('writing_checkpoints', result['data'])
        self.assertNotIn('writing_research', result['data'])
        self.assertNotIn('First scene words', json.dumps(result))

    def test_checkpoint_restores_prose_structure_and_original_ids(self):
        checkpoint = self.checkpoint()
        unchanged, _, _ = restore_plan(self.book, checkpoint)
        self.assertTrue(all(not row['changed_fields'] for row in unchanged['changes']))
        save_resource(self.world, {'title': 'Changed', 'parent': str(self.book.id),
            'document': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Different draft prose'}]}]},
            'expected_revision': self.scene.revision}, self.scene)
        self.scene.deleted_at = timezone.now();self.scene.save()
        self.book.refresh_from_db();plan, _, _ = restore_plan(self.book, checkpoint)
        restore(self.book, checkpoint, {'expected_revisions': plan['expected_revisions']})
        self.scene.refresh_from_db()
        self.assertEqual(self.scene.title, 'First scene')
        self.assertEqual(self.scene.parent_id, self.chapter.id)
        self.assertEqual(self.scene.document['content'][0]['content'][0]['text'], 'First scene words')
        self.assertIsNone(self.scene.deleted_at)
        self.assertGreater(self.scene.revision, 2)
        self.assertEqual(self.book.data['unknown'], {'keep': True})
        self.assertEqual(len(self.book.data['writing_checkpoints']), 1)

    def test_restore_retains_newer_subtree_outside_book(self):
        checkpoint = self.checkpoint()
        extra = self.create('Newer chapter', 'chapter', self.book)
        leaf = self.create('Newer scene', parent=extra, text='Keep later work')
        self.book.refresh_from_db();plan, _, _ = restore_plan(self.book, checkpoint)
        self.assertEqual(len(plan['retained_new_nodes']), 2)
        restore(self.book, checkpoint, {'expected_revisions': plan['expected_revisions']})
        extra.refresh_from_db();leaf.refresh_from_db()
        self.assertIsNone(extra.parent_id)
        self.assertEqual(leaf.parent_id, extra.id)
        self.assertEqual(leaf.document['content'][0]['content'][0]['text'], 'Keep later work')

    def test_stale_restore_does_not_partially_change_nodes(self):
        checkpoint = self.checkpoint();plan, _, _ = restore_plan(self.book, checkpoint)
        save_resource(self.world, {'title': 'Concurrent work', 'expected_revision': self.scene.revision}, self.scene)
        with self.assertRaises(Conflict): restore(self.book, checkpoint, {'expected_revisions': plan['expected_revisions']})
        self.scene.refresh_from_db();self.assertEqual(self.scene.title, 'Concurrent work')

    def test_restore_keeps_publication_and_visibility(self):
        checkpoint = self.checkpoint()
        self.publish(self.scene)
        published = copy.deepcopy(self.scene.published)
        self.book.refresh_from_db();plan, _, _ = restore_plan(self.book, checkpoint)
        restore(self.book, checkpoint, {'expected_revisions': plan['expected_revisions']})
        self.scene.refresh_from_db();self.assertEqual(self.scene.published, published)
        self.assertEqual(self.scene.visibility, 'public')

    def test_checkpoint_deletion_preserves_current_writing(self):
        checkpoint = self.checkpoint()
        self.change('delete_checkpoint', checkpoint_id=checkpoint)
        self.assertEqual(self.book.data['writing_checkpoints'], [])
        self.assertEqual(Resource.objects.filter(world=self.world).count(), 4)

    def test_checkpoint_survives_complete_archive_restore(self):
        checkpoint = self.checkpoint()
        restored = import_world_archive(self.user, world_archive(self.world))
        book = restored.resources.get(kind='manuscript')
        scene = restored.resources.get(title='First scene')
        save_resource(restored, {'title': 'Modified copy', 'expected_revision': scene.revision}, scene)
        plan, _, _ = restore_plan(book, checkpoint)
        restore(book, checkpoint, {'expected_revisions': plan['expected_revisions']})
        scene.refresh_from_db();self.assertEqual(scene.title, 'First scene')
        self.assertNotEqual(scene.id, self.scene.id)

    def test_search_matches_scene_body(self):
        self.assertEqual([r['id'] for r in outline(self.book, 'First scene words')['search_matches']], [str(self.scene.id)])

    def test_settings_preserve_unknown_data_and_validate(self):
        self.change('settings', settings={'author': 'Writer', 'goal': 1000})
        self.assertEqual(self.book.data['unknown'], {'keep': True})
        for settings in [{'goal': True}, {'goal': -1}, {'author': {}}, {'unknown': 'bad'}]:
            with self.subTest(settings=settings), self.assertRaises(ValueError): self.change('settings', settings=settings)

    def test_permissions_and_reader_boundaries(self):
        self.assertEqual(Client().get(self.url).status_code, 401)
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.get(self.url + '/compile').status_code, 404)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.url + '?audience=reader').status_code, 404)
        self.assertEqual(self.client.get(f'/api/resources/{self.scene.id}/manuscript').status_code, 404)

    def test_missing_parent_fails_restore_atomically(self):
        external = self.create('External folder', 'folder')
        save_resource(self.world, {'parent': str(external.id), 'expected_revision': self.book.revision}, self.book)
        checkpoint = self.checkpoint()
        external.deleted_at = timezone.now();external.save()
        plan, _, _ = restore_plan(self.book, checkpoint)
        before = {r.id: r.revision for r in Resource.objects.filter(world=self.world)}
        with self.assertRaises(ValueError): restore(self.book, checkpoint, {'expected_revisions': plan['expected_revisions']})
        self.assertEqual(before, {r.id: r.revision for r in Resource.objects.filter(world=self.world)})

    def test_standalone_html_has_images_toc_safe_titles_and_internal_links(self):
        image = io.BytesIO();Image.new('RGB', (4, 4), 'red').save(image, format='PNG')
        asset = store_asset(self.world, SimpleUploadedFile('cover.png', image.getvalue(), content_type='image/png'))
        self.change('settings', settings={'cover_asset': str(asset.id), 'author': '<script>writer</script>'})
        result, mime, extension = export(self.book, 'html')
        text = result.decode()
        self.assertIn('data:image/png;base64,', text)
        self.assertNotIn('/media/' + str(asset.id), text)
        self.assertIn('&lt;script&gt;writer', text)
        self.assertIn('#node-' + str(self.scene.id), text)
        self.assertEqual(extension, 'html')

    def test_foreign_research_and_forged_checkpoints_rejected(self):
        foreign = World.objects.create(owner=self.other, name='Other')
        entry = save_resource(foreign, {'title': 'Foreign'})
        with self.assertRaises(ValueError): self.change('settings', settings={'writing_research': [str(entry.id)]})
        self.checkpoint()
        saved = copy.deepcopy(self.book.data)
        saved['writing_checkpoints'][0]['nodes'][0]['snapshot']['document'] = []
        with self.assertRaises(ValueError):
            save_resource(self.world, {'data': saved, 'expected_revision': self.book.revision}, self.book)

    def test_publish_is_explicit_selected_and_preserves_future_draft_edits(self):
        self.change('settings', settings={'writing_include': [str(self.chapter.id), str(self.scene.id)]})
        self.change('publish')
        self.assertEqual([r['id'] for r in compilation(self.book, True)['nodes']], [str(self.chapter.id), str(self.scene.id)])
        self.scene.refresh_from_db(); self.second.refresh_from_db()
        self.assertIsNone(self.second.published)
        self.assertEqual(self.second.visibility, 'private')
        save_resource(self.world, {'title': 'Unpublished change', 'expected_revision': self.scene.revision}, self.scene)
        self.assertEqual(compilation(self.book, True)['nodes'][1]['title'], 'First scene')
        # New independently published children do not join the pinned edition.
        added = self.create('Later scene', parent=self.chapter)
        self.publish(added)
        self.assertNotIn(str(added.id), [r['id'] for r in compilation(self.book, True)['nodes']])

    def test_checkpoint_limits_and_reader_checkpoint_endpoint(self):
        for i in range(5): self.change('checkpoint', name=f'Draft {i}')
        with self.assertRaises(ValueError): self.change('checkpoint', name='Too many')
        self.book.refresh_from_db();self.assertEqual(len(self.book.data['writing_checkpoints']), 5)
        checkpoint = self.book.data['writing_checkpoints'][0]['id']
        self.assertEqual(self.client.get(self.url + '/checkpoints/' + checkpoint + '?audience=reader').status_code, 404)

    def test_publish_stale_revision_leaves_every_snapshot_unchanged(self):
        expected = outline(self.book)['expected_revisions']
        save_resource(self.world, {'title': 'Changed first', 'expected_revision': self.scene.revision}, self.scene)
        with self.assertRaises(Conflict): change(self.book, {'action': 'publish', 'expected_revisions': expected})
        self.assertFalse(Resource.objects.filter(world=self.world, published__isnull=False).exists())

    def test_revoked_scene_id_is_removed_from_reader_selection_metadata(self):
        self.change('publish')
        self.scene.refresh_from_db();self.scene.visibility = 'private';self.scene.save()
        result = compilation(self.book, True)
        self.assertNotIn(str(self.scene.id), result['book']['data']['writing_include'])
        self.assertNotIn(str(self.scene.id), [r['id'] for r in result['nodes']])

    def test_published_parent_survives_trashed_unpublished_new_parent(self):
        self.change('publish')
        self.scene.refresh_from_db()
        other_parent = self.create('Unpublished parent', 'chapter', self.book)
        save_resource(self.world, {'parent': str(other_parent.id), 'expected_revision': self.scene.revision}, self.scene)
        other_parent.deleted_at = timezone.now();other_parent.save()
        result = compilation(self.book, True)
        scene = next(r for r in result['nodes'] if r['id'] == str(self.scene.id))
        self.assertEqual(scene['parent'], str(self.chapter.id))
