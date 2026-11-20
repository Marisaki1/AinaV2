import copy
import io
import json
import uuid
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from .models import World, Resource, Connection
from .services import save_resource, snapshot, serialize, world_archive, import_world_archive, store_asset, public_references, Conflict
from .worldsearch import search, save, current
from .annotations import act, listing


def prose(value):
    return {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': value}]}]}


@override_settings(ALLOWED_HOSTS=['testserver'])
class SearchAndResearchTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user('research-owner'); self.other = User.objects.create_user('research-other')
        self.world = World.objects.create(owner=self.owner, name='Research', data={'unknown': {'keep': True}})
        self.foreign = World.objects.create(owner=self.other, name='Foreign')
        self.source = save_resource(self.world, {'title': 'Sanae Kochiya', 'kind': 'character', 'aliases': ['Shrine maiden'], 'tags': ['Moriya'],
            'private_notes': 'Confidential sapphire bargain', 'document': prose('The group met at the shrine gate.'), 'data': {'unknown': ['kept']}})
        self.target = save_resource(self.world, {'title': 'Byron', 'kind': 'character', 'status': 'wip'})
        self.edge = Connection.objects.create(world=self.world, source=self.source, target=self.target, kind='ally', label='Moriya faction', notes='Secret silver promise')
        out = io.BytesIO(); Image.new('RGB', (8, 8), 'green').save(out, format='PNG')
        self.asset = store_asset(self.world, SimpleUploadedFile('Shrine map.png', out.getvalue(), content_type='image/png'), credit='Artist silverbrush', tags=['Moriya'])
        self.client.force_login(self.owner)

    def send(self, path, value):
        return self.client.post('/api/' + path, json.dumps(value), content_type='application/json')

    def query(self, **filters):
        return search(self.world, {'filters': filters})

    def capture(self, **patch):
        return {'key': str(uuid.uuid4()), 'source_revision': self.source.revision, 'title': 'Verify the promise', 'text': 'Ask about the sapphire bargain.', 'quote': 'The group met at the shrine gate.', **patch}

    def test_search_body_alias_gm_and_phrase(self):
        for query, matched in [('"shrine gate"', 'Notes'), ('Shrine maiden', 'Aliases'), ('sapphire', 'GM notes')]:
            result = self.query(query=query)
            row = next(r for r in result['results'] if r['id'] == str(self.source.id))
            self.assertEqual(row['matched_in'], matched); self.assertNotIn('document', row)
        self.assertEqual(self.query(query='nonexistent promise')['total'], 0)

    def test_unicode_and_all_term_matching_across_fields(self):
        result = self.query(query='ＳＡＮＡＥ sapphire')
        self.assertEqual(result['total'], 1); self.assertEqual(result['results'][0]['id'], str(self.source.id))

    def test_relationship_and_image_credit_discovery(self):
        result = self.query(query='silver')
        self.assertEqual(result['scopes']['relationships'], 1); self.assertEqual(result['scopes']['images'], 1)
        row = next(r for r in result['results'] if r['scope'] == 'relationships')
        self.assertEqual(row['source'], str(self.source.id)); self.assertIn('Secret silver promise', row['excerpt'])
        self.assertEqual(self.query(query='silverbrush', scope='images')['results'][0]['id'], str(self.asset.id))

    def test_filters_and_counts_include_only_matching_records(self):
        result = self.query(tag='ｍｏｒｉｙａ', scope='entries', kind='character', status='draft', visibility='private')
        self.assertEqual(result['total'], 1); self.assertEqual(result['results'][0]['id'], str(self.source.id))
        self.assertEqual(self.query(tag='Moriya', scope='images')['total'], 1)
        self.assertEqual(self.query(status='wip')['total'], 1)

    def test_ranking_title_order_and_pagination(self):
        for i in range(25):
            save_resource(self.world, {'title': f'Page {i:02}', 'document': prose('Sanae is mentioned here.')})
        result = self.query(query='Sanae')
        self.assertEqual(result['results'][0]['id'], str(self.source.id)); self.assertEqual(len(result['results']), 20); self.assertEqual(result['pages'], 2)
        last = search(self.world, {'filters': {'query': 'Sanae'}, 'page': 999})
        self.assertEqual(last['page'], 1); self.assertEqual(len(last['results']), 7)
        alphabetical = self.query(query='Page', sort='title')
        self.assertEqual(alphabetical['results'][0]['title'], 'Page 00')

    def test_foreign_trash_and_dead_connection_endpoints_excluded(self):
        foreign = save_resource(self.foreign, {'title': 'Forbidden unique'})
        self.source.deleted_at = timezone.now(); self.source.save()
        result = self.query()
        self.assertNotIn(str(foreign.id), json.dumps(result)); self.assertNotIn(str(self.source.id), [r['id'] for r in result['results']]); self.assertEqual(result['scopes']['relationships'], 0)

    def test_invalid_filters_and_unclosed_phrase_reject(self):
        for filters in [{'query': '"unclosed'}, {'kind': 'fake'}, {'scope': 'outside'}, {'status': []}, {'query': 'x' * 201}, {'sort': 'sql'}, {'unexpected': 1}]:
            with self.subTest(filters=filters), self.assertRaises(ValueError): self.query(**filters)
        with self.assertRaises(ValueError): search(self.world, {'filters': {}, 'page': True})

    def test_search_api_auth_scope_and_reader_rejection(self):
        url = f'worlds/{self.world.id}/search'
        self.assertEqual(self.send(url, {'filters': {'query': 'sapphire'}}).status_code, 200)
        self.assertEqual(self.send(url, {'audience': 'reader'}).status_code, 400)
        self.client.force_login(self.other); self.assertEqual(self.send(url, {}).status_code, 404)
        self.client.logout(); self.assertEqual(self.send(url, {}).status_code, 401)

    def definition(self, **patch):
        return {'expected_revision': current(self.world)['revision'], 'id': str(uuid.uuid4()), 'name': 'Moriya leads', 'filters': {'query': 'shrine', 'tag': 'Moriya'}, **patch}

    def test_saved_search_create_rename_delete_and_unknown_settings(self):
        value = self.definition(); result = save(self.world, value)
        self.assertEqual(result['revision'], 1); self.assertEqual(self.world.data['unknown'], {'keep': True})
        value.update(expected_revision=1, name='Renamed', filters={'scope': 'relationships'}); result = save(self.world, value)
        self.assertEqual(result['saved'][0]['name'], 'Renamed')
        result = save(self.world, {'expected_revision': 2, 'action': 'delete', 'id': value['id']}); self.assertEqual(result['saved'], [])

    def test_saved_search_stale_duplicate_and_limits(self):
        value = self.definition(); save(self.world, value)
        with self.assertRaises(ValueError): save(self.world, self.definition())
        with self.assertRaises(Conflict): save(self.world, value)
        for patch in [{'id': 'bad'}, {'name': ''}, {'name': 'x' * 81}, {'filters': {'scope': 'bad'}}]:
            with self.assertRaises(ValueError): save(self.world, self.definition(name='Unique', **patch) if 'name' not in patch else self.definition(**patch))
        self.world.refresh_from_db(); self.assertEqual(len(current(self.world)['saved']), 1)

    def test_settings_form_cannot_overwrite_new_saved_searches(self):
        stale = copy.deepcopy(self.world.data); value = self.definition(); save(self.world, value)
        response = self.client.patch(f'/api/worlds/{self.world.id}', json.dumps({'data': {**stale, 'new_setting': 'kept'}}), content_type='application/json')
        self.assertEqual(response.status_code, 200); self.world.refresh_from_db(); self.assertEqual(current(self.world)['saved'][0]['id'], value['id'])

    def test_saved_search_archive_and_owner_boundary(self):
        save(self.world, self.definition()); restored = import_world_archive(self.owner, world_archive(self.world))
        self.assertEqual(current(restored)['saved'], current(self.world)['saved'])
        self.client.force_login(self.other); self.assertEqual(self.client.get(f'/api/worlds/{self.world.id}/saved-searches').status_code, 404)
        self.client.force_login(self.owner); self.assertEqual(self.client.get(f'/api/worlds/{self.world.id}/saved-searches?audience=reader').status_code, 404)

    def test_capture_preserves_original_and_creates_native_link(self):
        before = snapshot(self.source); value = act(self.source, self.capture())
        note = Resource.objects.get(id=value['note']['id'])
        self.assertEqual(note.kind, 'note'); self.assertEqual(note.visibility, 'private'); self.assertEqual(note.data['annotation_source_revision'], self.source.revision)
        self.assertIn(str(self.source.id), json.dumps(note.document)); self.source.refresh_from_db(); self.assertEqual(snapshot(self.source), before)

    def test_capture_replay_and_different_payload_no_duplicates(self):
        value = self.capture(); first = act(self.source, value); again = act(self.source, value)
        self.assertTrue(again['replayed']); self.assertEqual(first['note']['id'], again['note']['id'])
        with self.assertRaises(Conflict): act(self.source, {**value, 'text': 'Different body'})
        self.assertEqual(self.world.resources.filter(data__annotation_source_id=str(self.source.id)).count(), 1)

    def test_stale_source_rejects_and_replay_survives_later_source_edit(self):
        value = self.capture(); first = act(self.source, value)
        save_resource(self.world, {'title': 'Renamed source', 'expected_revision': self.source.revision}, self.source)
        self.assertTrue(act(self.source, value)['replayed'])
        with self.assertRaises(Conflict): act(self.source, {**value, 'key': str(uuid.uuid4())})
        self.assertEqual(first['note']['data']['annotation_source_revision'], 1)

    def test_resolve_reopen_edit_keep_unknown_fields_and_history(self):
        note = Resource.objects.get(id=act(self.source, self.capture())['note']['id'])
        save_resource(self.world, {'data': {**note.data, 'unknown': ['keep']}, 'expected_revision': 1}, note)
        for status in ['resolved', 'open']:
            act(self.source, {'action': 'status', 'id': str(note.id), 'expected_revision': note.revision, 'status': status}); note.refresh_from_db(); self.assertEqual(note.data['annotation_status'], status)
        act(self.source, {'action': 'edit', 'id': str(note.id), 'expected_revision': note.revision, 'title': 'Edited research', 'text': 'Updated body', 'quote': 'Kept excerpt'})
        note.refresh_from_db(); self.assertEqual(note.data['unknown'], ['keep']); self.assertIn('Updated body', json.dumps(note.document)); self.assertEqual(note.revisions.count(), 5)

    def test_stale_research_edit_is_rejected(self):
        note = act(self.source, self.capture())['note']
        act(self.source, {'action': 'status', 'id': note['id'], 'expected_revision': 1, 'status': 'resolved'})
        with self.assertRaises(Conflict): act(self.source, {'action': 'trash', 'id': note['id'], 'expected_revision': 1})
        self.assertIsNone(Resource.objects.get(id=note['id']).deleted_at)

    def test_trash_recovery_and_resolved_listing(self):
        note = Resource.objects.get(id=act(self.source, self.capture())['note']['id'])
        act(self.source, {'action': 'status', 'id': str(note.id), 'expected_revision': 1, 'status': 'resolved'}); self.assertEqual(listing(self.source)['total'], 0); self.assertEqual(listing(self.source, True)['total'], 1)
        act(self.source, {'action': 'trash', 'id': str(note.id), 'expected_revision': 2}); note.refresh_from_db(); self.assertIsNotNone(note.deleted_at)
        save_resource(self.world, {'expected_revision': note.revision}, note, restore=True); self.assertEqual(listing(self.source, True)['total'], 1)

    def test_research_cannot_publish_or_become_public(self):
        note = Resource.objects.get(id=act(self.source, self.capture())['note']['id'])
        with self.assertRaises(ValueError): save_resource(self.world, {'visibility': 'public', 'expected_revision': 1}, note)
        response = self.send(f'resources/{note.id}/publish', {'expected_revision': 1}); self.assertEqual(response.status_code, 400)
        note.visibility = 'public'; note.published = snapshot(note); note.save() # Corrupt/legacy import defense.
        self.assertIsNone(serialize(note, reader=True)); self.assertNotIn(str(note.id), public_references(self.world))
        public = save_resource(self.world, {'title': 'Published note', 'document': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'resourceLink', 'attrs': {'id': str(note.id), 'label': 'SECRET TITLE'}}]}]}})
        public.visibility = 'public'; public.published = snapshot(public); public.save()
        value = json.dumps(serialize(public, reader=True)); self.assertNotIn('SECRET TITLE', value); self.assertNotIn(str(note.id), value)

    def test_research_archive_remaps_source_and_native_link(self):
        note = Resource.objects.get(id=act(self.source, self.capture())['note']['id'])
        restored = import_world_archive(self.owner, world_archive(self.world)); source = restored.resources.get(title=self.source.title); copied = restored.resources.get(title=note.title)
        self.assertEqual(copied.data['annotation_source_id'], str(source.id)); self.assertIn(str(source.id), json.dumps(copied.document)); self.assertEqual(copied.visibility, 'private')

    def test_research_api_owner_boundary_and_deleted_source(self):
        url = f'resources/{self.source.id}/annotations'
        self.client.force_login(self.other); self.assertEqual(self.send(url, self.capture()).status_code, 404)
        self.client.logout(); self.assertEqual(self.send(url, self.capture()).status_code, 401)
        self.client.force_login(self.owner); self.assertEqual(self.client.get('/api/' + url + '?audience=reader').status_code, 404)
        self.source.deleted_at = timezone.now(); self.source.save(); self.assertEqual(self.send(url, self.capture()).status_code, 404)

    def test_invalid_capture_and_quote_html_stays_text(self):
        for patch in [{'key': 'bad'}, {'title': ''}, {'text': ''}, {'quote': 'x' * 2001}, {'source_revision': True}]:
            with self.assertRaises(ValueError): act(self.source, self.capture(**patch))
        value = act(self.source, self.capture(quote='<script>evil()</script>'))
        self.assertNotIn('<script>', value['note']['html']); self.assertIn('&lt;script&gt;', value['note']['html'])

    def test_research_pagination_and_search_discovery(self):
        for i in range(12): act(self.source, self.capture(title='Clipping ' + str(i)))
        result = listing(self.source); self.assertEqual(len(result['notes']), 10); self.assertEqual(result['pages'], 2)
        self.assertEqual(len(listing(self.source, page=1)['notes']), 2)
        self.assertEqual(self.query(query='Clipping', kind='note')['total'], 12)

    def test_saved_search_limit_and_malformed_definitions_are_not_overwritten(self):
        self.world.data['search_workspace'] = {'revision': 0, 'saved': [{'id': str(uuid.uuid4()), 'name': 'Search ' + str(i), 'filters': {}} for i in range(30)]}
        self.world.save()
        with self.assertRaisesRegex(ValueError, '30 saved'): save(self.world, self.definition(name='Thirty first'))
        self.world.data['search_workspace']['saved'] = [None]; self.world.save()
        with self.assertRaises(ValueError): current(self.world)
        self.world.refresh_from_db(); self.assertEqual(self.world.data['search_workspace']['saved'], [None])

    def test_saved_search_and_research_csrf_enforced(self):
        from django.test import Client
        client = Client(enforce_csrf_checks=True); client.force_login(self.owner)
        self.assertEqual(client.post(f'/api/worlds/{self.world.id}/saved-searches', json.dumps(self.definition()), content_type='application/json').status_code, 403)
        self.assertEqual(client.post(f'/api/resources/{self.source.id}/annotations', json.dumps(self.capture()), content_type='application/json').status_code, 403)

    def test_invalid_research_metadata_cannot_escape_private_note_rules(self):
        data = {'annotation_source_id': str(self.source.id), 'annotation_source_revision': 1}
        for patch in [{'kind': 'article'}, {'data': {**data, 'annotation_source_id': str(uuid.uuid4())}}, {'data': {**data, 'annotation_status': 'bad'}}, {'visibility': 'public'}]:
            with self.assertRaises(ValueError): save_resource(self.world, {'title': 'Invalid research', 'kind': 'note', 'data': data, **patch})

    def test_existing_research_cannot_strip_provenance_to_publish(self):
        record = Resource.objects.get(id=act(self.source, self.capture())['note']['id'])
        for data in ({}, {**record.data, 'annotation_source_revision': 999}, {**record.data, 'annotation_source_id': str(self.target.id)}):
            with self.assertRaises(ValueError): save_resource(self.world, {'data': data, 'expected_revision': record.revision}, record)
        record.refresh_from_db(); self.assertEqual(record.visibility, 'private'); self.assertEqual(record.revision, 1)

    def test_reader_notebook_export_excludes_research_but_keeps_published_source(self):
        from .notebooks import act as notebook_action, export_book
        record = Resource.objects.get(id=act(self.source, self.capture())['note']['id'])
        self.source.visibility = 'public'; self.source.published = snapshot(self.source); self.source.save()
        book = notebook_action(self.world, {'action': 'book', 'title': 'Notebook', 'sections': [{'id': str(uuid.uuid4()), 'title': 'Notes', 'parent_id': '', 'entry_ids': [str(self.source.id), str(record.id)]}]})
        original = Resource.objects.get(id=book['entry']['id'])
        reader = export_book(original, private=False)
        self.assertIn('The group met at the shrine gate.', reader); self.assertNotIn('Ask about the sapphire bargain.', reader); self.assertNotIn('Verify the promise', reader)
        self.assertIn('Ask about the sapphire bargain.', export_book(original, private=True))
