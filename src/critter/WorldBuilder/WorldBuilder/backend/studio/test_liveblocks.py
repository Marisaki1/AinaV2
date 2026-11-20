import copy
import io
import json
import uuid
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from .models import World, Resource, Activity
from .services import save_resource, serialize, snapshot, world_archive, import_world_archive, store_asset
from .documents import validate_document


def block(source):
    return {'type': 'sourceBlock', 'attrs': {'id': str(source.id), 'label': source.title}}


def doc(*nodes):
    return {'type': 'doc', 'content': list(nodes)}


def paragraph(text):
    return {'type': 'paragraph', 'content': [{'type': 'text', 'text': text}]}


@override_settings(ALLOWED_HOSTS=['testserver'])
class LiveBlockTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user('live-owner'); self.other = User.objects.create_user('live-other')
        self.world = World.objects.create(owner=self.owner, name='Live blocks')
        self.foreign = World.objects.create(owner=self.other, name='Foreign')
        self.table = save_resource(self.world, {'title': 'Live table', 'kind': 'table', 'data': {
            'columns': [{'id': 'a', 'type': 'text', 'label': 'Prompt'}],
            'rows': [{'id': 'x', 'cells': {'a': 'Original prompt'}, 'weight': 1}], 'unknown': {'keep': True}}})
        self.note = save_resource(self.world, {'title': 'Session notes', 'kind': 'note', 'document': doc(paragraph('Before'), block(self.table), paragraph('After'))})
        self.client.force_login(self.owner)

    def publish(self, entry):
        entry.visibility = 'public'; entry.published = {**snapshot(entry), '_revision': entry.revision}; entry.save()

    def source(self, entry=None, reader=False):
        return self.client.get(f'/api/resources/{(entry or self.table).id}/live-source' + ('?audience=reader' if reader else ''))

    def test_block_expands_current_source_without_writing_consumer(self):
        old = copy.deepcopy(self.note.document)
        self.assertIn('Original prompt', serialize(self.note)['html'])
        save_resource(self.world, {'title': 'Renamed table', 'data': {**self.table.data, 'rows': [{'id': 'x', 'cells': {'a': 'Changed prompt'}}]}, 'expected_revision': 1}, self.table)
        value = serialize(self.note)
        self.assertIn('Changed prompt', value['html']); self.assertEqual(value['document']['content'][1]['attrs']['label'], 'Renamed table')
        self.note.refresh_from_db(); self.assertEqual(self.note.document, old); self.assertEqual(self.note.revision, 1)
        self.assertLess(value['html'].index('Before'), value['html'].index('Changed prompt')); self.assertLess(value['html'].index('Changed prompt'), value['html'].index('After'))

    def test_backlinks_follow_original_id(self):
        value = self.client.get(f'/api/resources/{self.table.id}').json()
        self.assertIn(str(self.note.id), [r['id'] for r in value['backlinks']])

    def test_source_api_does_not_write_resources_or_activity(self):
        before = Activity.objects.count(); revisions = self.table.revisions.count()
        response = self.source(); self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['entry']['data']['unknown'], {'keep': True})
        self.assertEqual(response.json()['audience'], 'owner'); self.assertEqual(self.table.revisions.count(), revisions); self.assertEqual(Activity.objects.count(), before)

    def test_supported_sources_and_unsupported_articles(self):
        for kind in ('generator', 'map', 'timeline', 'relationship'):
            data = {'mode': 'all'} if kind == 'relationship' else {}
            source = save_resource(self.world, {'title': kind, 'kind': kind, 'data': data})
            save_resource(self.world, {'title': 'Contains ' + kind, 'document': doc(block(source))})
            self.assertEqual(self.source(source).status_code, 200)
        with self.assertRaisesRegex(ValueError, 'supported entries'): save_resource(self.world, {'title': 'Invalid block', 'document': doc(block(self.note))})
        self.assertEqual(self.source(self.note).status_code, 404)

    def test_foreign_and_missing_sources_are_not_accepted(self):
        foreign = save_resource(self.foreign, {'title': 'Other table', 'kind': 'table'})
        for identity in (str(foreign.id), str(uuid.uuid4()), '', 'not-a-uuid'):
            with self.subTest(identity=identity), self.assertRaises(ValueError):
                save_resource(self.world, {'title': 'Invalid block', 'document': doc({'type': 'sourceBlock', 'attrs': {'id': identity}})})
        self.assertEqual(self.source(foreign).status_code, 404)

    def test_source_api_requires_owner_even_for_local_reader_preview(self):
        self.publish(self.table)
        self.client.logout(); self.assertEqual(self.source().status_code, 401); self.assertEqual(self.source(reader=True).status_code, 401)
        self.client.force_login(self.other); self.assertEqual(self.source().status_code, 404); self.assertEqual(self.source(reader=True).status_code, 404)

    def test_reader_uses_only_published_source_snapshot(self):
        self.publish(self.table); self.publish(self.note)
        save_resource(self.world, {'title': 'DRAFT TITLE', 'data': {**self.table.data, 'rows': [{'id': 'x', 'cells': {'a': 'DRAFT SECRET'}}]}, 'expected_revision': 1}, self.table)
        value = serialize(self.note, reader=True)
        self.assertIn('Original prompt', value['html']); self.assertNotIn('DRAFT SECRET', value['html']); self.assertNotIn('DRAFT TITLE', value['html'])
        response = self.source(reader=True); self.assertEqual(response.status_code, 200)
        self.assertIn('Original prompt', json.dumps(response.json())); self.assertNotIn('DRAFT SECRET', json.dumps(response.json()))

    def test_unpublished_and_revoked_source_is_redacted(self):
        self.publish(self.note)
        value = json.dumps(serialize(self.note, reader=True))
        self.assertNotIn(str(self.table.id), value); self.assertNotIn('Live table', value); self.assertNotIn('Original prompt', value)
        self.assertEqual(self.source(reader=True).status_code, 404)
        self.publish(self.table); self.table.visibility = 'private'; self.table.save()
        self.assertNotIn('Original prompt', json.dumps(serialize(self.note, reader=True)))

    def test_private_sections_never_expose_embedded_source(self):
        self.publish(self.table)
        save_resource(self.world, {'document': doc(paragraph('Public note'), {'type': 'privateBlock', 'content': [block(self.table)]}), 'expected_revision': 1}, self.note)
        self.publish(self.note)
        value = json.dumps(serialize(self.note, reader=True))
        self.assertIn('Public note', value); self.assertNotIn(str(self.table.id), value); self.assertNotIn('Original prompt', value)

    def test_private_table_links_do_not_leak_names_or_ids(self):
        hidden = save_resource(self.world, {'title': 'SECRET LOCATION'})
        save_resource(self.world, {'data': {'columns': [{'id': 'link', 'label': 'Location', 'type': 'article'}], 'rows': [{'id': 'x', 'cells': {'link': str(hidden.id)}}]}, 'expected_revision': 1}, self.table)
        self.publish(self.table); self.publish(self.note)
        for value in (json.dumps(self.source(reader=True).json()), json.dumps(serialize(self.note, reader=True))):
            self.assertNotIn('SECRET LOCATION', value); self.assertNotIn(str(hidden.id), value)
        self.assertEqual(self.source(reader=True).json()['links'], {})

    def test_deleted_source_preserves_reference_for_recovery(self):
        original = copy.deepcopy(self.note.document)
        self.table.deleted_at = timezone.now(); self.table.save()
        self.assertIn('Unavailable live source', serialize(self.note)['html']); self.assertEqual(self.source().status_code, 404)
        save_resource(self.world, {'summary': 'Unrelated edit', 'expected_revision': 1}, self.note)
        self.assertEqual(self.note.document, original)
        self.table.deleted_at = None; self.table.save(); self.assertIn('Original prompt', serialize(self.note)['html'])

    def test_legacy_foreign_source_cannot_render_other_account(self):
        legacy = Resource.objects.create(world=self.foreign, title='Legacy', document=doc(block(self.table)))
        value = serialize(legacy)
        self.assertNotIn('Original prompt', value['html']); self.assertIn('Unavailable live source', value['html'])

    def test_html_fallback_escapes_cells_and_caps_large_tables(self):
        self.table.data['rows'] = [{'id': str(i), 'cells': {'a': '<script>alert(1)</script>'}} for i in range(30)]
        self.table.save()
        value = serialize(self.note)['html']
        self.assertNotIn('<script>', value); self.assertEqual(value.count('<tr>'), 13); self.assertIn('12 rows', value)

    def test_archive_preserves_and_remaps_live_blocks(self):
        restored = import_world_archive(self.owner, world_archive(self.world))
        table = restored.resources.get(title=self.table.title); note = restored.resources.get(title=self.note.title)
        self.assertEqual(note.document['content'][1]['attrs']['id'], str(table.id)); self.assertNotEqual(table.id, self.table.id)
        self.assertIn('Original prompt', serialize(note)['html'])

    def test_notebook_export_has_safe_readable_fallback(self):
        from .notebooks import act, export_book
        result = act(self.world, {'action': 'book', 'title': 'Session notebook', 'sections': [{'id': str(uuid.uuid4()), 'title': 'Notes', 'parent_id': '', 'entry_ids': [str(self.note.id)]}]})
        book = Resource.objects.get(id=result['entry']['id'])
        text = export_book(book, private=True)
        self.assertIn('Original prompt', text); self.assertNotIn('<button', text)
        self.assertNotIn('Original prompt', export_book(book, private=False))
        self.publish(self.note); self.publish(self.table); self.assertIn('Original prompt', export_book(book, private=False))

    def test_dice_preview_validates_without_rolling_or_logging(self):
        count = Activity.objects.count()
        for formula, low, high in [('2d6+3', 5, 15), ('4d6kh3', 3, 18), ('4df', -4, 4), ('2d20kl1-2', -1, 18)]:
            response = self.client.post('/api/tools/dice-preview', json.dumps({'formula': formula}), content_type='application/json')
            self.assertEqual(response.status_code, 200); self.assertEqual(response.json()['minimum'], low); self.assertEqual(response.json()['maximum'], high)
        self.assertEqual(Activity.objects.count(), count)

    def test_dice_node_validation_and_fallback(self):
        value = {'type': 'diceButton', 'attrs': {'formula': '2d20kh1+3', 'label': 'Check'}}
        note = save_resource(self.world, {'title': 'Roll note', 'document': doc({'type': 'paragraph', 'content': [value]})})
        text = serialize(note)['html']; self.assertIn('Check (2d20kh1+3)', text); self.assertNotIn('<button', text)
        for formula in ('eval(1)', '1000d20', '1d1', ''):
            value['attrs']['formula'] = formula
            with self.assertRaises(ValueError): validate_document(doc({'type': 'paragraph', 'content': [value]}))

    def test_live_blocks_reject_malformed_labels_hidden_children_and_excess_count(self):
        for node in [ {'type': 'sourceBlock', 'attrs': {'id': str(self.table.id), 'label': []}},
                      {'type': 'sourceBlock', 'attrs': {'id': str(self.table.id)}, 'content': [paragraph('hidden')]},
                      {'type': 'diceButton', 'attrs': {'formula': '1d20', 'label': 'x' * 181}}]:
            with self.assertRaises(ValueError): validate_document(doc(node))
        with self.assertRaisesRegex(ValueError, '40 interactive'): validate_document(doc(*[block(self.table) for i in range(41)]))

    def test_live_map_projection_only_includes_referenced_visible_assets(self):
        def image(name, color):
            out = io.BytesIO(); Image.new('RGB', (100, 100), color).save(out, format='PNG')
            return store_asset(self.world, SimpleUploadedFile(name, out.getvalue(), content_type='image/png'))
        base = image('map.png', 'white'); hidden = image('hidden.png', 'black'); unused = image('unused.png', 'red')
        source = save_resource(self.world, {'title': 'Map', 'kind': 'map', 'data': {'asset_id': str(base.id), 'layers': [
            {'id': 'secret', 'asset_id': str(hidden.id), 'private': True, 'visible': True, 'opacity': 1}]}})
        self.publish(source)
        owner_assets = {a['id'] for a in self.source(source).json()['assets']}
        reader_assets = {a['id'] for a in self.source(source, reader=True).json()['assets']}
        self.assertIn(str(base.id), owner_assets); self.assertIn(str(hidden.id), owner_assets); self.assertNotIn(str(unused.id), owner_assets)
        self.assertEqual(reader_assets, {str(base.id)})
