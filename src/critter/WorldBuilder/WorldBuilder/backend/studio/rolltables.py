"""Bounded owner-only table generation and portable typed table interchange."""
import copy
import csv
import io
import json
import math
import random
import uuid
from django.core.exceptions import ValidationError
from .models import Resource
from .tools import integer, dice_roll, weighted

TYPES = ('text', 'number', 'checkbox', 'article', 'dice')


def formula(value):
    # Use the same parser without consuming randomness during validation.
    from .tools import dice_spec
    dice_spec(value)


def validate(data, world, historical=False):
    columns, rows = data.get('columns', []), data.get('rows', [])
    if not isinstance(columns, list) or len(columns) > 40:
        raise ValueError('Use up to 40 table columns.')
    ids = set()
    for col in columns:
        if not isinstance(col, dict) or not isinstance(col.get('id'), str) or not col['id'] or col['id'] in ids or col.get('type', 'text') not in TYPES:
            raise ValueError('Each column needs a distinct ID and a supported type.')
        if not isinstance(col.get('label', ''), str) or len(col.get('label', '')) > 100:
            raise ValueError('Column labels must be text up to 100 characters.')
        ids.add(col['id'])
    if not isinstance(rows, list) or len(rows) > 5000:
        raise ValueError('Use up to 5,000 rows.')
    row_ids = set()
    for number, row in enumerate(rows, 1):
        if not isinstance(row, dict) or not isinstance(row.get('cells', {}), dict):
            raise ValueError(f'Row {number}: cells must be an object.')
        # Legacy value-only rows may lack IDs; keep their data readable/editable.
        if 'id' in row:
            if not isinstance(row['id'], str) or not row['id'] or row['id'] in row_ids:
                raise ValueError(f'Row {number}: use a distinct row ID.')
            row_ids.add(row['id'])
        weight = row.get('weight', 1)
        if type(weight) not in (int, float) or not math.isfinite(weight) or not 0 <= weight <= 1e9:
            raise ValueError(f'Row {number}: weight must be a finite non-negative number.')
        for col in columns:
            value = row.get('cells', {}).get(col['id'])
            if value is None or value == '':
                continue
            try:
                kind = col.get('type', 'text')
                if kind == 'number' and (type(value) not in (int, float) or not math.isfinite(value)):
                    raise ValueError('enter a finite number.')
                if kind == 'checkbox' and type(value) is not bool:
                    raise ValueError('use true or false.')
                if kind in ('text', 'dice', 'article') and not isinstance(value, str):
                    raise ValueError('enter text.')
                if kind == 'dice':
                    formula(value)
                if kind == 'article':
                    try:
                        valid = Resource.objects.filter(id=value, world=world).exists()
                    except (ValueError, ValidationError):
                        valid = False
                    if not valid:
                        raise ValueError('choose an entry in this world.')
            except ValueError as error:
                raise ValueError(f'Row {number}, {col.get("label") or col["id"]}: {error}') from error
    mode = data.get('roll_mode', 'weighted')
    if mode not in ('weighted', 'range'):
        raise ValueError('Choose weighted or range-based selection.')
    if mode == 'range':
        formula(data.get('range_formula', '1d20'))
        intervals = []
        for number, row in enumerate(rows, 1):
            low = integer(row.get('min'), f'Row {number} range start')
            high = integer(row.get('max'), f'Row {number} range end')
            if high < low:
                raise ValueError(f'Row {number}: range end must not precede its start.')
            intervals.append((low, high))
        intervals.sort()
        if any(b[0] <= a[1] for a, b in zip(intervals, intervals[1:])):
            raise ValueError('Row ranges must not overlap. Gaps are allowed but a roll in a gap fails explicitly.')
    steps = data.get('generator_steps', [])
    if not isinstance(steps, list) or len(steps) > 12:
        raise ValueError('Use up to 12 linked generation steps.')
    seen = set()
    for step in steps:
        if not isinstance(step, dict) or not isinstance(step.get('id'), str) or step['id'] in seen:
            raise ValueError('Generation steps need distinct IDs.')
        seen.add(step['id'])
        if not isinstance(step.get('label', ''), str) or len(step.get('label', '')) > 100:
            raise ValueError('Step labels must be text up to 100 characters.')
        try:
            target = Resource.objects.filter(id=step.get('resource_id'), world=world, kind__in=('table', 'generator'))
            if not historical:
                target = target.filter(deleted_at=None)
            exists = target.exists()
        except (ValueError, TypeError, ValidationError):
            exists = False
        if not exists:
            raise ValueError('Generation steps must reference available tables or generators in this world.')
        condition = step.get('when_column', '')
        if not isinstance(condition, str) or condition and condition not in ids:
            raise ValueError('A conditional step must use a column in this table.')
        if not isinstance(step.get('when_value', ''), str) or len(step.get('when_value', '')) > 1000:
            raise ValueError('Conditional matches must be text up to 1,000 characters.')


def generate(resource, seed=None):
    if seed is not None and (not isinstance(seed, str) or len(seed) > 200):
        raise ValueError('A repeatable seed must be text up to 200 characters.')
    rng = random.Random(seed) if seed is not None else random.SystemRandom()
    remaining = [32]

    def visit(current, stack):
        key = str(current.id)
        if key in stack:
            raise ValueError('Generator cycle detected. Remove the circular linked step before rolling.')
        if len(stack) >= 8 or remaining[0] <= 0:
            raise ValueError('Generation exceeds eight levels or 32 table rolls. Simplify its linked steps.')
        remaining[0] -= 1
        if current.deleted_at or current.kind not in ('table', 'generator'):
            raise ValueError('A linked generation source is unavailable.')
        data = current.data
        validate(data, current.world)
        rows = data.get('rows', [])
        selection = None
        if data.get('roll_mode') == 'range':
            selection = dice_roll(data.get('range_formula', '1d20'), rng=rng)
            matches = [r for r in rows if r['min'] <= selection['total'] <= r['max']]
            if not matches:
                raise ValueError(f'{current.title}: roll {selection["total"]} has no matching range. No result was saved.')
            row = matches[0]
        else:
            row = weighted(rows, rng=rng)
        result = copy.deepcopy(row)
        result['rolled'] = {c['id']: dice_roll(row.get('cells', {}).get(c['id']), rng=rng)
                            for c in data.get('columns', []) if c.get('type') == 'dice' and row.get('cells', {}).get(c['id'])}
        parts = []
        for col in data.get('columns', []):
            val = row.get('cells', {}).get(col['id'], row.get('value', ''))
            if col.get('type') == 'article' and val:
                linked = Resource.objects.filter(id=val, world=current.world, deleted_at=None).first()
                val = linked.title if linked else 'Unavailable entry'
            elif col['id'] in result['rolled']:
                val = f'{val} = {result["rolled"][col["id"]]["total"]}'
            elif isinstance(val, bool):
                val = 'Yes' if val else 'No'
            if val != '' and val is not None:
                parts.append(f'{col.get("label") or "Result"}: {val}')
        result.update(resource_id=key, source_title=current.title, source_revision=current.revision,
                      selection_roll=selection, text='; '.join(parts) or str(row.get('value', '')), children=[])
        for step in data.get('generator_steps', []):
            condition = step.get('when_column')
            val = row.get('cells', {}).get(condition, '')
            comparable = json.dumps(val, ensure_ascii=False) if isinstance(val, (bool, int, float)) else str(val)
            if condition and comparable != step.get('when_value', ''):
                continue
            target = Resource.objects.filter(id=step['resource_id'], world=current.world, deleted_at=None).first()
            if target is None:
                raise ValueError('A linked generation source is unavailable.')
            child = visit(target, stack + [key])
            child['step_label'] = step.get('label', '') or target.title
            result['children'].append(child)
        return result

    return visit(resource, [])


def export_table(resource, fmt):
    if fmt == 'json':
        return json.dumps({'format': 'worldbuilder-table', 'version': 1, 'kind': resource.kind,
                           'title': resource.title, 'data': resource.data}, ensure_ascii=False, indent=2)
    if fmt != 'csv':
        raise ValueError('Choose CSV or JSON.')
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    columns = resource.data.get('columns', [])
    writer.writerow([c.get('label') or c['id'] for c in columns])
    for row in resource.data.get('rows', []):
        writer.writerow([json.dumps(v) if isinstance(v, bool) else '' if v is None else v
                         for v in [row.get('cells', {}).get(c['id'], '') for c in columns]])
    return output.getvalue()


def preview(value, world):
    fmt = value.get('format', 'csv')
    text = value.get('text')
    if not isinstance(text, str) or len(text) > 2000000:
        raise ValueError('Import text must be at most two million characters.')
    if fmt == 'json':
        try:
            incoming = json.loads(text)
        except (ValueError, RecursionError) as error:
            raise ValueError('This table JSON could not be read.') from error
        if not isinstance(incoming, dict) or incoming.get('format') != 'worldbuilder-table' or incoming.get('version') != 1 or not isinstance(incoming.get('data'), dict):
            raise ValueError('Choose a WorldBuilder table JSON export (version 1).')
        data = incoming['data']
        from .services import check_json
        check_json(data)
        validate(data, world)
        return {'data': data, 'warnings': ['JSON retains types, row/column IDs, weights, ranges, linked steps and unknown table data. References must already exist in this world. Use Copy & move for another world.']}
    if fmt != 'csv':
        raise ValueError('Choose CSV or JSON.')
    try:
        parsed = list(csv.reader(io.StringIO(text.lstrip('\ufeff')), strict=True))
    except csv.Error as error:
        raise ValueError('This CSV could not be read: ' + str(error)) from error
    if not parsed or not 1 <= len(parsed[0]) <= 40 or len(parsed) > 5001:
        raise ValueError('Use a header and up to 5,000 data rows / 40 columns.')
    schema = value.get('columns')
    if schema is not None and (not isinstance(schema, list) or len(schema) != len(parsed[0])):
        raise ValueError('Column type mapping must match the CSV header.')
    if schema is not None and any(not isinstance(c, dict) for c in schema):
        raise ValueError('Each column mapping must be an object.')
    columns = [{**(schema[i] if schema else {}), 'id': schema[i].get('id', str(uuid.uuid4())) if schema else str(uuid.uuid4()),
                'label': label[:100] or 'Column', 'type': schema[i].get('type', 'text') if schema else 'text'} for i, label in enumerate(parsed[0])]
    rows = []
    for n, cells in enumerate(parsed[1:], 2):
        if len(cells) != len(columns):
            raise ValueError(f'CSV row {n} has {len(cells)} columns; expected {len(columns)}.')
        converted = {}
        for col, cell in zip(columns, cells):
            try:
                if col['type'] == 'number' and cell != '':
                    number = float(cell)
                    if not math.isfinite(number):
                        raise ValueError('use a finite number.')
                    cell = int(number) if number.is_integer() else number
                elif col['type'] == 'checkbox' and cell != '':
                    if cell.strip().lower() not in ('true', 'false', '1', '0', 'yes', 'no'):
                        raise ValueError('use true/false, yes/no or 1/0.')
                    cell = cell.strip().lower() in ('true', '1', 'yes')
                converted[col['id']] = cell
            except (ValueError, OverflowError) as error:
                raise ValueError(f'CSV row {n}, {col["label"]}: {error}') from error
        rows.append({'id': str(uuid.uuid4()), 'weight': 1, 'cells': converted})
    data = {'columns': columns, 'rows': rows, 'roll_mode': 'weighted', 'generator_steps': []}
    validate(data, world)
    return {'data': data, 'warnings': ['CSV contains cells only. Import resets weights to 1 and replaces ranges/linked steps. Use JSON to retain table configuration.']}
