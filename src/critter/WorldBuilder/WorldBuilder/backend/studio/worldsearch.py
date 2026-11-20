"""Owner-only federated search and revisioned saved-search definitions."""
import copy
import json
import re
import unicodedata
import uuid
from collections import Counter
from django.utils import timezone
from .catalog import KINDS
from .documents import plain_text
from .models import World
from .services import Conflict

KEY = 'search_workspace'


def norm(value):
    return unicodedata.normalize('NFKC', str(value)).casefold().strip()


def filters(value):
    if not isinstance(value, dict) or set(value) - {'query', 'scope', 'kind', 'tag', 'status', 'visibility', 'sort'}:
        raise ValueError('Choose supported search filters.')
    result = {key: value.get(key, default) for key, default in {
        'query': '', 'scope': 'all', 'kind': '', 'tag': '', 'status': '', 'visibility': '', 'sort': 'relevance'}.items()}
    if any(not isinstance(v, str) for v in result.values()):
        raise ValueError('Search filters must be text.')
    if len(result['query']) > 200 or len(result['tag']) > 100:
        raise ValueError('Use up to 200 search characters and a tag up to 100 characters.')
    if result['scope'] not in ('all', 'entries', 'images', 'relationships') or result['sort'] not in ('relevance', 'recent', 'title'):
        raise ValueError('Choose a supported result scope and sort order.')
    if result['kind'] and result['kind'] not in KINDS:
        raise ValueError('Choose a supported entry type.')
    if result['status'] not in ('', 'draft', 'wip', 'done') or result['visibility'] not in ('', 'private', 'public'):
        raise ValueError('Choose a supported writing state or visibility.')
    return result


def terms(query):
    if query.count('"') % 2:
        raise ValueError('Close the quoted phrase before searching.')
    return [norm(a or b) for a, b in re.findall(r'"([^"]+)"|(\S+)', query) if norm(a or b)][:30]


def snippet(text, wanted):
    text = ' '.join(str(text).split())
    folded = norm(text)
    hits = [folded.find(term) for term in wanted if term in folded]
    start = max(0, min(hits) - 65) if hits else 0
    return ('…' if start else '') + text[start:start + 260] + ('…' if len(text) > start + 260 else '')


def search(world, value):
    selected = filters(value.get('filters', {}))
    page = value.get('page', 0)
    if type(page) is not int or not 0 <= page <= 100000:
        raise ValueError('Choose a non-negative result page.')
    wanted = terms(selected['query']); found = []
    def add(row, fields, aliases=()):
        combined = norm(' '.join(text for label, text in fields))
        if any(term not in combined for term in wanted):
            return
        if selected['tag'] and norm(selected['tag']) not in {norm(t) for t in row.get('tags', [])}:
            return
        if selected['status'] and row.get('status') != selected['status']:
            return
        if selected['visibility'] and row.get('visibility') != selected['visibility']:
            return
        matching = next(((label, text) for label, text in fields if wanted and any(term in norm(text) for term in wanted)), fields[0])
        row['matched_in'], row['excerpt'] = matching[0], snippet(matching[1], wanted)
        title = norm(row['title']); q = norm(selected['query'])
        row['_score'] = (100 if q and title == q else 85 if q and q in {norm(a) for a in aliases} else 70 if q and title.startswith(q) else 50 if q and q in title else 0)
        found.append(row)
    for record in world.resources.filter(deleted_at=None).select_related('parent').iterator(chunk_size=200):
        # Draft bodies are intentionally searchable by their owner, never by a public route.
        fields = [('Title', record.title), ('Aliases', ' '.join(record.aliases)), ('Summary', record.summary),
                  ('Notes', plain_text(record.document)), ('GM notes', record.private_notes), ('Tags', ' '.join(record.tags)),
                  ('Details', json.dumps(record.data, ensure_ascii=False))]
        add({'id': str(record.id), 'scope': 'entries', 'kind': record.kind, 'title': record.title,
             'template': record.template, 'tags': record.tags, 'status': record.status, 'visibility': record.visibility,
             'updated_at': record.updated_at.isoformat(), 'revision': record.revision,
             'context': record.parent.title if record.parent and not record.parent.deleted_at else ''}, fields, record.aliases)
    for asset in world.assets.iterator(chunk_size=200):
        add({'id': str(asset.id), 'scope': 'images', 'kind': 'media', 'title': asset.filename, 'tags': asset.tags,
             'updated_at': asset.created_at.isoformat(), 'revision': asset.revision, 'visibility': 'private', 'url': '/media/' + str(asset.id), 'context': f'{asset.width} × {asset.height}'},
            [('Image name', asset.filename), ('Credit', asset.credit), ('Tags', ' '.join(asset.tags))])
    edges = world.connections.filter(deleted_at=None, source__deleted_at=None, target__deleted_at=None).select_related('source', 'target')
    for edge in edges.iterator(chunk_size=200):
        add({'id': str(edge.id), 'scope': 'relationships', 'kind': 'connection', 'title': edge.label or edge.kind.replace('-', ' ').title(),
             'source': str(edge.source_id), 'target': str(edge.target_id), 'source_title': edge.source.title, 'target_title': edge.target.title,
             'tags': [], 'visibility': edge.visibility, 'updated_at': edge.updated_at.isoformat(), 'revision': edge.revision,
             'context': edge.source.title + ' → ' + edge.target.title},
            [('Relationship', edge.label + ' ' + edge.kind), ('Connected entries', edge.source.title + ' ' + edge.target.title), ('Connection notes', edge.notes)])
    scopes = Counter(r['scope'] for r in found)
    kinds = Counter(r['kind'] for r in found if r['scope'] == 'entries')
    found = [r for r in found if (selected['scope'] == 'all' or r['scope'] == selected['scope']) and (not selected['kind'] or r['kind'] == selected['kind'])]
    if selected['sort'] == 'title':
        found.sort(key=lambda r: (norm(r['title']), r['id']))
    else:
        found.sort(key=lambda r: (r['_score'] if selected['sort'] == 'relevance' else 0, r['updated_at'], r['id']), reverse=True)
    total = len(found); pages = max(1, (total + 19) // 20); page = min(page, pages - 1)
    rows = found[page * 20:page * 20 + 20]
    for row in rows:
        row.pop('_score', None)
    return {'results': rows, 'total': total, 'page': page, 'pages': pages,
            'scopes': {key: scopes.get(key, 0) for key in ('entries', 'images', 'relationships')}, 'kinds': dict(kinds), 'filters': selected}


def current(world):
    result = copy.deepcopy(world.data.get(KEY, {'revision': 0, 'saved': []}))
    if not isinstance(result, dict) or type(result.get('revision')) is not int or not isinstance(result.get('saved'), list):
        raise ValueError('Saved search settings need review; no definitions were overwritten.')
    seen = set()
    if result['revision'] < 0 or len(result['saved']) > 30:
        raise ValueError('Saved search settings exceed the supported limits.')
    for row in result['saved']:
        try:
            identity = str(uuid.UUID(row['id']))
            valid = isinstance(row.get('name'), str) and 1 <= len(row['name'].strip()) <= 80
        except (TypeError, KeyError, ValueError, AttributeError):
            raise ValueError('A saved search needs review; no definitions were overwritten.')
        if not valid or identity in seen:
            raise ValueError('Saved searches need distinct valid identities and names.')
        seen.add(identity); filters(row.get('filters', {}))
    return result


def save(world, value):
    original = copy.deepcopy(world.data); previous = current(world)
    if type(value.get('expected_revision')) is not int or value['expected_revision'] != previous['revision']:
        raise Conflict('Saved searches changed in another tab. Reload them before saving; your filters are kept.')
    action = value.get('action', 'save')
    if action not in ('save', 'delete'):
        raise ValueError('Choose save or delete search.')
    try:
        identity = str(uuid.UUID(value.get('id', '')))
    except (ValueError, TypeError, AttributeError) as error:
        raise ValueError('Choose a valid saved search identity.') from error
    rows = [copy.deepcopy(row) for row in previous['saved']]
    index = next((i for i, row in enumerate(rows) if row.get('id') == identity), None)
    if action == 'delete':
        if index is None:
            raise ValueError('This saved search no longer exists.')
        rows.pop(index)
    else:
        name = value.get('name')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
            raise ValueError('Name the saved search using 1–80 characters.')
        if any(norm(row.get('name', '')) == norm(name) and row.get('id') != identity for row in rows):
            raise ValueError('That saved search name already exists.')
        row = {**(rows[index] if index is not None else {}), 'id': identity, 'name': name.strip(), 'filters': filters(value.get('filters', {}))}
        if index is None:
            if len(rows) >= 30:
                raise ValueError('Keep up to 30 saved searches per world.')
            rows.append(row)
        else:
            rows[index] = row
    updated = {**previous, 'revision': previous['revision'] + 1, 'saved': rows}
    if not World.objects.filter(id=world.id, data=original).update(data={**original, KEY: updated}, updated_at=timezone.now()):
        raise Conflict('World settings changed. Reload saved searches before trying again.')
    world.data = {**original, KEY: updated}
    return updated
