import copy
import json
from django.contrib.auth.models import User
from django.test import TestCase, Client, override_settings
from django.utils import timezone
from .models import World
from .services import Conflict, save_resource, world_archive, import_world_archive
from .dashboard import current, save


@override_settings(ALLOWED_HOSTS=['testserver'])
class OverviewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('overview-owner')
        self.other = User.objects.create_user('overview-other')
        self.world = World.objects.create(owner=self.user, name='Overview world', data={'unknown': {'keep': 7}})
        self.entry = save_resource(self.world, {'title': 'Session guide', 'kind': 'note', 'data': {'note_starred': True}})
        self.url = f'/api/worlds/{self.world.id}/overview'
        self.client.force_login(self.user)

    def value(self):
        value = current(self.world)
        return {**value, 'expected_revision': value['revision']}

    def send(self, value):
        return self.client.post(self.url, json.dumps(value), content_type='application/json')

    def test_default_read_does_not_write_data(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['widgets']), 8)
        self.world.refresh_from_db()
        self.assertEqual(self.world.data, {'unknown': {'keep': 7}})

    def test_reorder_width_hide_limit_pins_persist(self):
        value = self.value()
        value['widgets'].reverse()
        value['widgets'][0].update(wide=True, limit=12)
        value['widgets'][1]['visible'] = False
        value['pins'] = [str(self.entry.id)]
        response = self.send(value)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['revision'], 1)
        self.assertEqual(Client().get(self.url).status_code, 401)
        self.assertEqual(self.client.get(self.url).json(), response.json())
        self.world.refresh_from_db()
        self.assertEqual(self.world.data['unknown'], {'keep': 7})

    def test_stale_revision_rejected_without_overwrite(self):
        value = self.value()
        self.assertEqual(self.send(value).status_code, 200)
        value['pins'] = [str(self.entry.id)]
        self.assertEqual(self.send(value).status_code, 409)
        self.assertEqual(self.client.get(self.url).json()['pins'], [])

    def test_concurrent_world_data_change_is_rejected(self):
        World.objects.filter(pk=self.world.pk).update(data={'new_setting': 'keep'})
        with self.assertRaises(Conflict):
            save(self.world, self.value())
        self.world.refresh_from_db()
        self.assertEqual(self.world.data, {'new_setting': 'keep'})

    def test_authentication_world_isolation_and_reader_boundary(self):
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.send(self.value()).status_code, 404)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.url + '?audience=reader').status_code, 404)

    def test_invalid_layouts_are_atomic(self):
        source = self.value()
        invalid = []
        for key, value in [('widgets', []), ('pins', 'bad'), ('pins', [str(self.entry.id)] * 2), ('expected_revision', False)]:
            changed = copy.deepcopy(source); changed[key] = value; invalid.append(changed)
        for key, value in [('limit', 0), ('limit', 25), ('limit', True), ('id', 'unknown'), ('wide', 1), ('visible', 'true')]:
            changed = copy.deepcopy(source); changed['widgets'][0][key] = value; invalid.append(changed)
        changed = copy.deepcopy(source)
        for row in changed['widgets']: row['visible'] = False
        invalid.append(changed)
        changed = copy.deepcopy(source); changed['widgets'][1] = changed['widgets'][0]; invalid.append(changed)
        for value in invalid:
            with self.subTest(value=value):
                self.assertIn(self.send(value).status_code, [400, 409])
                self.assertEqual(self.client.get(self.url).json()['revision'], 0)

    def test_foreign_nonexistent_and_new_trashed_pins_rejected(self):
        other_world = World.objects.create(owner=self.other, name='Foreign')
        foreign = save_resource(other_world, {'title': 'Foreign'})
        self.entry.deleted_at = timezone.now(); self.entry.save()
        for identity in [str(foreign.id), 'not-a-uuid', str(self.entry.id)]:
            value = self.value(); value['pins'] = [identity]
            self.assertEqual(self.send(value).status_code, 400)

    def test_previous_trashed_pin_can_be_retained_or_removed(self):
        value = self.value(); value['pins'] = [str(self.entry.id)]
        save(self.world, value)
        self.entry.deleted_at = timezone.now(); self.entry.save()
        self.assertEqual(self.send(self.value()).status_code, 200)
        self.world.refresh_from_db(); value = self.value(); value['pins'] = []
        self.assertEqual(self.send(value).status_code, 200)

    def test_generic_settings_cannot_clobber_or_inject_layout(self):
        value = self.value(); value['pins'] = [str(self.entry.id)]
        saved = save(self.world, value)
        response = self.client.patch(f'/api/worlds/{self.world.id}', json.dumps({'data': {'theme': 'new'}}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.world.refresh_from_db(); self.assertEqual(self.world.data['overview'], saved)
        blank = World.objects.create(owner=self.user, name='Blank')
        self.client.patch(f'/api/worlds/{blank.id}', json.dumps({'data': {'overview': {'bad': True}}}), content_type='application/json')
        blank.refresh_from_db(); self.assertNotIn('overview', blank.data)

    def test_archive_preserves_layout_and_remaps_pin_to_original_copy(self):
        value = self.value(); value['pins'] = [str(self.entry.id)]; value['widgets'].reverse()
        save(self.world, value)
        self.entry.deleted_at = timezone.now(); self.entry.save()
        restored = import_world_archive(self.user, world_archive(self.world))
        copied = restored.resources.get(title='Session guide')
        self.assertEqual(restored.data['overview']['pins'], [str(copied.id)])
        self.assertNotEqual(str(copied.id), str(self.entry.id))
        self.assertEqual(restored.data['overview']['widgets'], value['widgets'])
        self.assertEqual(restored.data['unknown'], {'keep': 7})
        self.assertIsNotNone(copied.deleted_at)

    def test_invalid_imported_layout_rolls_back_the_whole_world(self):
        for invalid in [{'revision': 0, 'widgets': [], 'pins': []}, {'revision': False}, ['bad']]:
            with self.subTest(invalid=invalid):
                self.world.data['overview'] = invalid
                self.world.save()
                before = World.objects.count()
                with self.assertRaises(ValueError):
                    import_world_archive(self.user, world_archive(self.world))
                self.assertEqual(World.objects.count(), before)

    def test_archive_cannot_pin_other_world_entries(self):
        foreign_world = World.objects.create(owner=self.other, name='Foreign')
        foreign = save_resource(foreign_world, {'title': 'Foreign'})
        self.world.data['overview'] = {**current(self.world), 'pins': [str(foreign.id)]}
        self.world.save()
        with self.assertRaises(ValueError):
            import_world_archive(self.user, world_archive(self.world))

    def test_task_completion_uses_original_revision_and_preserves_data(self):
        task = save_resource(self.world, {'kind': 'task', 'title': 'Prepare scene', 'data': {'progress': 'open', 'custom': 'keep'}})
        url = f'/api/resources/{task.id}'
        value = {'expected_revision': task.revision, 'data': {**task.data, 'progress': 'done'}}
        result = self.client.patch(url, json.dumps(value), content_type='application/json')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['data']['custom'], 'keep')
        self.assertEqual(self.client.patch(url, json.dumps(value), content_type='application/json').status_code, 409)
        task.refresh_from_db(); self.assertEqual(task.revisions.count(), 2)

    def test_briefing_persists_and_legacy_layout_save_retains_it(self):
        value = self.value()
        value['briefing'] = {'overview': str(self.entry.id), 'current': str(self.entry.id), 'cast': [str(self.entry.id)]}
        saved = save(self.world, value)
        self.assertEqual(saved['briefing']['current'], str(self.entry.id))
        legacy = {**copy.deepcopy(saved), 'expected_revision': saved['revision']}
        del legacy['briefing']
        legacy['widgets'][0]['limit'] = 12
        again = save(self.world, legacy)
        self.assertEqual(again['briefing'], saved['briefing'])
        self.world.refresh_from_db()
        self.assertEqual(self.world.data['unknown'], {'keep': 7})

    def test_briefing_rejects_foreign_deleted_and_malformed_references(self):
        foreign_world = World.objects.create(owner=self.other, name='Other')
        foreign = save_resource(foreign_world, {'title': 'Other secret'})
        removed = save_resource(self.world, {'title': 'Removed'})
        removed.deleted_at = timezone.now(); removed.save()
        bad = [[], {'unexpected': 'value'}, {'current': str(foreign.id)}, {'current': str(removed.id)},
               {'cast': [str(foreign.id)]}, {'cast': [str(self.entry.id)] * 2}, {'cast': None}, {'current': []},
               {'cast': [str(self.entry.id)] * 13}]
        for briefing in bad:
            with self.subTest(briefing=briefing):
                value = self.value(); value['briefing'] = briefing
                self.assertEqual(self.send(value).status_code, 400)
        self.world.refresh_from_db()
        self.assertNotIn('overview', self.world.data)

    def test_briefing_archive_remaps_references_including_recoverable_trash(self):
        value = self.value()
        value['briefing'] = {key: str(self.entry.id) for key in ('overview', 'current', 'leads', 'reference')}
        value['briefing']['cast'] = [str(self.entry.id)]
        save(self.world, value)
        self.entry.deleted_at = timezone.now(); self.entry.save()
        restored = import_world_archive(self.user, world_archive(self.world))
        copied = restored.resources.get(title=self.entry.title)
        for key in ('overview', 'current', 'leads', 'reference'):
            self.assertEqual(restored.data['overview']['briefing'][key], str(copied.id))
        self.assertEqual(restored.data['overview']['briefing']['cast'], [str(copied.id)])
        self.assertNotEqual(copied.id, self.entry.id)

    def test_briefing_import_rejects_missing_or_malformed_refs_and_rolls_back(self):
        foreign_world = World.objects.create(owner=self.other, name='Other')
        foreign = save_resource(foreign_world, {'title': 'Other'})
        for briefing in ({'current': str(foreign.id)}, {'cast': None}, {'overview': []}):
            with self.subTest(briefing=briefing):
                self.world.data['overview'] = {**current(self.world), 'briefing': briefing}
                self.world.save()
                before = World.objects.count()
                with self.assertRaises(ValueError):
                    import_world_archive(self.user, world_archive(self.world))
                self.assertEqual(World.objects.count(), before)

    def test_briefing_api_is_owner_only_and_revision_checked(self):
        value = self.value(); value['briefing'] = {'current': str(self.entry.id)}
        self.assertEqual(self.send(value).status_code, 200)
        self.assertEqual(self.send(value).status_code, 409)
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.send(value).status_code, 404)
