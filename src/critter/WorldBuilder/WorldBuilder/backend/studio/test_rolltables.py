import copy
import json
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone
from .models import World, Resource, Activity
from .services import save_resource, serialize, world_archive, import_world_archive
from .rolltables import generate, preview, export_table


@override_settings(ALLOWED_HOSTS=['testserver'])
class RollTableTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('table-owner')
        self.other = User.objects.create_user('table-other')
        self.world = World.objects.create(owner=self.user, name='Tables')
        self.foreign = World.objects.create(owner=self.other, name='Foreign')
        self.link = save_resource(self.world, {'title': 'Linked original'})
        self.data = {'columns': [{'id': 'a', 'label': 'Result', 'type': 'text'}, {'id': 'd', 'label': 'Dice', 'type': 'dice'}],
                     'rows': [{'id': 'one', 'weight': 0, 'cells': {'a': 'Never', 'd': '1d6'}}, {'id': 'two', 'weight': 1, 'cells': {'a': 'Chosen', 'd': '2d6+3'}}],
                     'unknown': {'retained': True}}
        self.table = self.add('Root', self.data)
        self.client.force_login(self.user)

    def add(self, title, data, world=None):
        return save_resource(world or self.world, {'title': title, 'kind': 'generator', 'data': copy.deepcopy(data)})

    def send(self, path, value):
        return self.client.post('/api/' + path, json.dumps(value), content_type='application/json')

    def update(self, data, target=None):
        target = target or self.table
        return save_resource(target.world, {'data': data, 'expected_revision': target.revision}, target)

    def exchange(self, value):
        return self.send(f'resources/{self.table.id}/table-exchange', value)

    def test_seed_controls_row_and_dice_repeatably(self):
        a, b = generate(self.table, 'repeat'), generate(self.table, 'repeat')
        self.assertEqual(a, b); self.assertEqual(a['cells']['a'], 'Chosen')
        self.assertIn('Dice: 2d6+3 = ', a['text'])
        self.assertTrue(5 <= a['rolled']['d']['total'] <= 15)
        self.assertEqual(self.table.data, self.data)

    def test_zero_weights_and_empty_tables_return_errors(self):
        for rows in ([], [{'id': 'zero', 'weight': 0, 'cells': {}}]):
            self.table.data['rows'] = rows
            with self.assertRaisesRegex(ValueError, 'row|weight'): generate(self.table)

    def test_typed_cells_reject_bad_values_without_save(self):
        for kind, val in [('number', 'oops'), ('number', True), ('checkbox', 'yes'), ('text', 3), ('dice', 'bad'), ('article', 'invalid')]:
            data = {'columns': [{'id': 'x', 'label': 'Value', 'type': kind}], 'rows': [{'id': 'a', 'cells': {'x': val}}]}
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, 'Row 1, Value'): self.update(data)
        self.table.refresh_from_db(); self.assertEqual(self.table.revision, 1)

    def test_valid_zero_false_blank_and_reference_values(self):
        columns = [{'id': k, 'label': k, 'type': t} for k, t in [('n', 'number'), ('b', 'checkbox'), ('r', 'article'), ('s', 'text')]]
        self.update({'columns': columns, 'rows': [{'id': 'a', 'cells': {'n': 0, 'b': False, 'r': str(self.link.id), 's': ''}}]})
        result = generate(self.table)
        self.assertIn('n: 0', result['text']); self.assertIn('b: No', result['text']); self.assertIn('Linked original', result['text'])

    def test_bad_reference_cannot_cross_world(self):
        foreign = save_resource(self.foreign, {'title': 'Private target'})
        with self.assertRaisesRegex(ValueError, 'this world'):
            self.update({'columns': [{'id': 'x', 'type': 'article'}], 'rows': [{'cells': {'x': str(foreign.id)}}]})

    def test_range_boundaries_are_inclusive_and_expose_selection_roll(self):
        data = {**self.data, 'roll_mode': 'range', 'range_formula': '1d20', 'rows': [
            {'id': 'a', 'min': 1, 'max': 10, 'cells': {'a': 'Low'}}, {'id': 'b', 'min': 11, 'max': 20, 'cells': {'a': 'High'}}]}
        self.update(data)
        for roll, expected in [(1, 'Low'), (10, 'Low'), (11, 'High'), (20, 'High')]:
            with patch('studio.rolltables.dice_roll', return_value={'total': roll}):
                result = generate(self.table); self.assertEqual(result['cells']['a'], expected); self.assertEqual(result['selection_roll']['total'], roll)

    def test_overlapping_and_inverted_ranges_reject(self):
        for rows in [[{'id': 'a', 'min': 1, 'max': 10}, {'id': 'b', 'min': 10, 'max': 20}], [{'id': 'a', 'min': 10, 'max': 1}]]:
            with self.assertRaises(ValueError): self.update({**self.data, 'roll_mode': 'range', 'rows': rows})

    def test_uncovered_range_has_no_activity_or_result(self):
        self.update({**self.data, 'roll_mode': 'range', 'rows': [{'id': 'a', 'min': 1, 'max': 1}]})
        count = Activity.objects.count()
        with patch('studio.rolltables.dice_roll', return_value={'total': 2}):
            result = self.send(f'resources/{self.table.id}/roll', {})
        self.assertEqual(result.status_code, 400); self.assertIn('no matching range', result.json()['error'])
        self.assertEqual(Activity.objects.count(), count)

    def test_conditional_steps_use_exact_selected_cell(self):
        child = self.add('Child', self.data)
        steps = [{'id': 'yes', 'label': 'Included', 'resource_id': str(child.id), 'when_column': 'a', 'when_value': 'Chosen'},
                 {'id': 'no', 'resource_id': str(child.id), 'when_column': 'a', 'when_value': 'No match'}]
        self.update({**self.data, 'generator_steps': steps})
        result = generate(self.table, 'same')
        self.assertEqual(len(result['children']), 1); self.assertEqual(result['children'][0]['step_label'], 'Included')
        self.assertEqual(result, generate(self.table, 'same'))

    def test_cycle_error_does_not_write_activity(self):
        child = self.add('Child', self.data)
        self.update({**self.data, 'generator_steps': [{'id': 'child', 'resource_id': str(child.id)}]})
        self.update({**self.data, 'generator_steps': [{'id': 'root', 'resource_id': str(self.table.id)}]}, child)
        count = Activity.objects.count()
        result = self.send(f'resources/{self.table.id}/roll', {})
        self.assertEqual(result.status_code, 400); self.assertIn('cycle', result.json()['error']); self.assertEqual(Activity.objects.count(), count)

    def test_depth_limit_and_fanout_limit(self):
        current = self.table
        for i in range(9):
            child = self.add('Nested ' + str(i), self.data)
            self.update({**self.data, 'generator_steps': [{'id': str(i), 'resource_id': str(child.id)}]}, current); current = child
        with self.assertRaisesRegex(ValueError, 'eight levels'): generate(self.table)
        leaf = self.add('Leaf', self.data)
        branch = self.add('Branch', {**self.data, 'generator_steps': [{'id': str(i), 'resource_id': str(leaf.id)} for i in range(12)]})
        self.update({**self.data, 'generator_steps': [{'id': str(i), 'resource_id': str(branch.id)} for i in range(3)]})
        with self.assertRaisesRegex(ValueError, '32 table rolls'): generate(self.table)

    def test_unavailable_linked_source_and_malformed_steps(self):
        child = self.add('Child', self.data)
        self.update({**self.data, 'generator_steps': [{'id': 'a', 'resource_id': str(child.id)}]})
        child.deleted_at = timezone.now(); child.save()
        with self.assertRaisesRegex(ValueError, 'available'): generate(self.table)
        for step in [{'id': 'a', 'resource_id': str(self.link.id)}, {'id': 'a', 'resource_id': 'no'}, {'id': 'a', 'resource_id': str(self.table.id), 'when_column': []}]:
            with self.assertRaises(ValueError): self.update({**self.data, 'generator_steps': [step]})

    def test_csv_quoted_newlines_bom_and_header_only(self):
        value = preview({'text': '\ufeffName,Notes\n"A, B","First\nSecond"\n'}, self.world)
        data = value['data']; self.assertEqual(data['rows'][0]['cells'][data['columns'][0]['id']], 'A, B')
        self.assertIn('\n', data['rows'][0]['cells'][data['columns'][1]['id']])
        self.assertEqual(preview({'text': 'Name\n'}, self.world)['data']['rows'], [])

    def test_csv_typed_roundtrip_retains_zero_false_dice_and_reference(self):
        data = {'columns': [{'id': k, 'label': k, 'type': t} for k, t in [('n', 'number'), ('b', 'checkbox'), ('d', 'dice'), ('r', 'article'), ('t', 'text')]],
                'rows': [{'id': 'x', 'cells': {'n': 0, 'b': False, 'd': '1d6', 'r': str(self.link.id), 't': 'quote " and, comma\nnext'}}]}
        self.update(data)
        result = preview({'text': export_table(self.table, 'csv'), 'columns': data['columns']}, self.world)
        self.assertEqual(result['data']['rows'][0]['cells'], data['rows'][0]['cells'])
        self.assertIn('cells only', result['warnings'][0])

    def test_csv_precise_errors_and_preview_never_writes(self):
        count = Resource.objects.count()
        for value, expected in [({'text': 'a,b\n1'}, 'CSV row 2'), ({'text': 'a\nno', 'columns': [{'type': 'number'}]}, 'CSV row 2, a'),
                                ({'text': 'a\nunknown', 'columns': [{'type': 'checkbox'}]}, 'CSV row 2, a'), ({'text': 'a\n1', 'columns': [None]}, 'mapping')]:
            result = self.exchange(value); self.assertEqual(result.status_code, 400); self.assertIn(expected, result.json()['error'])
        self.assertEqual(Resource.objects.count(), count); self.table.refresh_from_db(); self.assertEqual(self.table.revision, 1)

    def test_json_roundtrip_preserves_unknown_weights_ranges_and_steps(self):
        child = self.add('Child', self.data)
        data = {**self.data, 'roll_mode': 'range', 'rows': [{'id': 'range', 'min': 1, 'max': 20, 'weight': 9, 'cells': {'a': 'Choice'}, 'extra': ['retained']}], 'generator_steps': [{'id': 'x', 'label': 'Detail', 'resource_id': str(child.id)}]}
        self.update(data)
        result = preview({'format': 'json', 'text': export_table(self.table, 'json')}, self.world)
        self.assertEqual(result['data'], data)
        self.assertEqual(generate(self.table, 'export'), generate(self.add('Reimported', result['data']), 'export') | {'resource_id': str(self.table.id), 'source_title': self.table.title, 'source_revision': self.table.revision})

    def test_bad_json_and_nonfinite_unknown_data_reject(self):
        for text in ['{', '{}', '{"format":"worldbuilder-table","version":1,"data":{"unknown":NaN}}']:
            self.assertEqual(self.exchange({'format': 'json', 'text': text}).status_code, 400)

    def test_export_import_and_roll_are_owner_only_and_trash_safe(self):
        url = f'/api/resources/{self.table.id}/table-exchange'
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.send(f'resources/{self.table.id}/roll', {}).status_code, 404)
        self.client.logout(); self.assertEqual(self.client.get(url).status_code, 401)
        self.client.force_login(self.user); self.table.deleted_at = timezone.now(); self.table.save()
        self.assertEqual(self.client.get(url).status_code, 404); self.assertEqual(self.send(f'resources/{self.table.id}/roll', {}).status_code, 404)

    def test_reader_snapshot_omits_private_generation_steps_and_references(self):
        child = self.add('Private child', self.data)
        self.update({'columns': [{'id': 'r', 'type': 'article'}], 'rows': [{'id': 'x', 'cells': {'r': str(child.id)}}],
                     'generator_steps': [{'id': 'x', 'label': 'Private label', 'resource_id': str(child.id)}]})
        from .services import snapshot
        self.table.visibility = 'public'; self.table.published = snapshot(self.table); self.table.save()
        value = serialize(self.table, reader=True)
        self.assertNotIn('Private label', json.dumps(value)); self.assertNotIn(str(child.id), json.dumps(value))

    def test_archive_remaps_linked_steps_and_native_reference_cells(self):
        child = self.add('Child', self.data)
        self.update({**self.data, 'generator_steps': [{'id': 'detail', 'resource_id': str(child.id)}]})
        restored = import_world_archive(self.user, world_archive(self.world))
        root = restored.resources.get(title='Root'); linked = restored.resources.get(title='Child')
        self.assertEqual(root.data['generator_steps'][0]['resource_id'], str(linked.id))
        self.assertEqual(generate(root, 'restore')['children'][0]['resource_id'], str(linked.id))

    def test_stale_import_apply_cannot_replace_newer_data(self):
        data = preview({'text': 'Name\nNew'}, self.world)['data']
        self.update({**self.data, 'unknown': 'newer'})
        result = self.client.patch(f'/api/resources/{self.table.id}', json.dumps({'expected_revision': 1, 'data': data}), content_type='application/json')
        self.assertEqual(result.status_code, 409); self.table.refresh_from_db(); self.assertEqual(self.table.data['unknown'], 'newer')

    def test_generated_article_is_a_frozen_independent_snapshot(self):
        result = generate(self.table, 'frozen'); text = result['text']
        from .documents import plain_text
        article = save_resource(self.world, {'title': 'Saved result', 'document': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': text}]}]}})
        self.update({**self.data, 'rows': [{'id': 'new', 'cells': {'a': 'Changed'}}]})
        generate(self.table); article.refresh_from_db(); self.assertEqual(plain_text(article.document).strip(), text)

    def test_invalid_seed_is_rejected_and_export_has_correct_attachment(self):
        self.assertEqual(self.send(f'resources/{self.table.id}/roll', {'seed': []}).status_code, 400)
        for fmt in ('json', 'csv'):
            response = self.client.get(f'/api/resources/{self.table.id}/table-exchange?format={fmt}')
            self.assertEqual(response.status_code, 200); self.assertIn('attachment;', response['Content-Disposition'])
