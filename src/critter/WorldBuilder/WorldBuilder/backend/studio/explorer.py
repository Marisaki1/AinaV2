"""Owner world browsing and curated shelves of original records, never copied lore."""
import copy
import uuid
from collections import Counter
from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from .documents import plain_text, reference_ids
from .models import World
from .services import Conflict, serialize
from .worldsearch import norm

KEY = 'explorer'
SECTIONS = ('all', 'people', 'places', 'groups', 'stories', 'reference')


def section(record):
    if record.kind == 'character' or record.template == 'character': return 'people'
    if record.kind == 'map' or record.template in ('settlement', 'building', 'geography'): return 'places'
    if record.template == 'organization': return 'groups'
    if record.kind in ('campaign', 'session', 'quest', 'event'): return 'stories'
    return 'reference'


def current(world):
    value = copy.deepcopy(world.data.get(KEY, {'revision': 0, 'shelves': []}))
    if not isinstance(value, dict) or type(value.get('revision')) is not int or value['revision'] < 0 or not isinstance(value.get('shelves'), list) or len(value['shelves']) > 24:
        raise ValueError('Explorer shelves need review; no settings were replaced.')
    seen = set()
    for row in value['shelves']:
        try:
            identity = str(uuid.UUID(row['id']))
            valid = isinstance(row.get('name'), str) and 1 <= len(row['name'].strip()) <= 80
            ids = row['entries']
            valid = valid and isinstance(ids, list) and len(ids) <= 120 and all(isinstance(v, str) for v in ids) and len(set(ids)) == len(ids)
            for entry in ids: uuid.UUID(entry)
        except (TypeError, ValueError, KeyError, AttributeError):
            raise ValueError('A shelf needs review; no settings were replaced.')
        if not valid or identity in seen: raise ValueError('Shelves need distinct identities, names and original references.')
        seen.add(identity)
    return value


def save(world, value):
    original = copy.deepcopy(world.data); previous = current(world)
    if type(value.get('expected_revision')) is not int or value['expected_revision'] != previous['revision']:
        raise Conflict('Shelves changed elsewhere. Your selection is kept; reload shelf settings before saving.')
    try: identity = str(uuid.UUID(value.get('id', '')))
    except (TypeError, ValueError, AttributeError) as error: raise ValueError('Choose a valid shelf identity.') from error
    rows = copy.deepcopy(previous['shelves']); index = next((i for i, r in enumerate(rows) if r['id'] == identity), None)
    if value.get('action', 'save') == 'delete':
        if index is None: raise ValueError('This shelf no longer exists.')
        rows.pop(index)
    elif value.get('action', 'save') == 'save':
        name = value.get('name'); ids = value.get('entries')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80: raise ValueError('Use a shelf name of 1 to 80 characters.')
        if any(norm(r['name']) == norm(name) and r['id'] != identity for r in rows): raise ValueError('That shelf name already exists.')
        if not isinstance(ids, list) or len(ids) > 120 or any(not isinstance(v, str) for v in ids) or len(set(ids)) != len(ids): raise ValueError('Choose up to 120 distinct originals.')
        available = {str(v) for v in world.resources.filter(deleted_at=None).values_list('id', flat=True)}
        retained = set(rows[index]['entries']) if index is not None else set()
        if any(v not in available | retained for v in ids): raise ValueError('Shelf entries must belong to this world.')
        row = {**(rows[index] if index is not None else {}), 'id': identity, 'name': name.strip(), 'entries': ids}
        if index is None:
            if len(rows) >= 24: raise ValueError('Keep up to 24 shelves per world.')
            rows.append(row)
        else: rows[index] = row
    else: raise ValueError('Choose save or delete shelf.')
    updated = {**previous, 'revision': previous['revision'] + 1, 'shelves': rows}
    if not World.objects.filter(id=world.id, data=original).update(data={**original, KEY: updated}, updated_at=timezone.now()):
        raise Conflict('World settings changed. Reload shelves before saving.')
    world.data = {**original, KEY: updated}
    return updated


def browse(world, value):
    if set(value) - {'query', 'section', 'tag', 'parent', 'shelf', 'sort', 'page', 'include_internal'}: raise ValueError('Choose supported explorer filters.')
    query, selected, tag, parent, shelf, order = [value.get(k, d) for k, d in [('query', ''), ('section', 'all'), ('tag', ''), ('parent', ''), ('shelf', ''), ('sort', 'title')]]
    if any(not isinstance(v, str) for v in (query, selected, tag, parent, shelf, order)) or len(query) > 200 or len(tag) > 100 or selected not in SECTIONS or order not in ('title', 'recent', 'shelf'): raise ValueError('Choose valid explorer filters.')
    page = value.get('page', 0)
    if type(page) is not int or not 0 <= page <= 100000 or type(value.get('include_internal', False)) is not bool: raise ValueError('Choose a valid explorer page and internal-note option.')
    records = list(world.resources.filter(deleted_at=None))
    by_id = {str(r.id): r for r in records}
    selected_shelf = next((r for r in current(world)['shelves'] if r['id'] == shelf), None) if shelf else None
    if shelf and selected_shelf is None: raise ValueError('This shelf is unavailable. Choose another shelf.')
    if parent and (parent not in by_id or by_id[parent].kind != 'folder'): raise ValueError('This collection is unavailable.')
    descendants = {parent} if parent else set()
    if parent:
        while True:
            added = {str(r.id) for r in records if str(r.parent_id) in descendants} - descendants
            if not added: break
            descendants |= added
    base = [r for r in records if r.kind != 'folder' and (value.get('include_internal') or not (r.data.get('raw_transcript') or r.data.get('annotation_source_id')))]
    if selected_shelf: base = [r for r in base if str(r.id) in selected_shelf['entries']]
    if parent: base = [r for r in base if str(r.parent_id) in descendants]
    if tag: base = [r for r in base if norm(tag) in {norm(t) for t in r.tags}]
    if query:
        wanted = norm(query).split()
        base = [r for r in base if all(t in norm(' '.join([r.title, r.summary, ' '.join(r.aliases), plain_text(r.document)])) for t in wanted)]
    counts = Counter(section(r) for r in base)
    chosen = [r for r in base if selected == 'all' or section(r) == selected]
    if order == 'recent': chosen.sort(key=lambda r: (r.updated_at, str(r.id)), reverse=True)
    elif order == 'shelf' and selected_shelf:
        positions = {v: i for i, v in enumerate(selected_shelf['entries'])}; chosen.sort(key=lambda r: positions[str(r.id)])
    else: chosen.sort(key=lambda r: (norm(r.title), str(r.id)))
    total = len(chosen); pages = max(1, (total + 23) // 24); page = min(page, pages - 1)
    def card(r):
        return {'id': str(r.id), 'title': r.title, 'kind': r.kind, 'template': r.template, 'section': section(r), 'tags': r.tags,
                'summary': r.summary or plain_text(r.document)[:260], 'cover_asset': r.data.get('cover_asset', r.data.get('asset_id', '')), 'cover_url': r.data.get('cover_url', ''),
                'parent': str(r.parent_id) if r.parent_id and str(r.parent_id) in by_id else '', 'updated_at': r.updated_at.isoformat(), 'revision': r.revision}
    # Collection navigation is shallow per level; descendants affect the matching cards.
    collections = [card(r) for r in records if r.kind == 'folder' and (str(r.parent_id) if r.parent_id else '') == parent]
    collections.sort(key=lambda r: norm(r['title']))
    trail = []; cursor = parent; visited = set()
    while cursor and cursor in by_id and cursor not in visited:
        visited.add(cursor); row = by_id[cursor]; trail.insert(0, {'id': cursor, 'title': row.title}); cursor = str(row.parent_id) if row.parent_id else ''
    return {'entries': [card(r) for r in chosen[page * 24:page * 24 + 24]], 'total': total, 'page': page, 'pages': pages,
            'sections': {**{k: counts.get(k, 0) for k in SECTIONS if k != 'all'}, 'all': len(base)}, 'collections': collections, 'trail': trail}


def detail(resource):
    if resource.deleted_at or resource.kind == 'folder': raise Http404()
    world = resource.world
    edges = list(world.connections.filter(deleted_at=None, source__deleted_at=None, target__deleted_at=None, source__world=world, target__world=world).filter(Q(source=resource) | Q(target=resource)).select_related('source', 'target').order_by('label', 'id'))
    related = []
    for edge in edges[:60]:
        target = edge.target if edge.source_id == resource.id else edge.source
        related.append({'id': str(target.id), 'title': target.title, 'kind': target.kind, 'label': edge.label or edge.kind, 'direction': 'outgoing' if edge.source_id == resource.id else 'incoming'})
    refs = reference_ids(resource.document)
    links = world.resources.filter(id__in=refs, deleted_at=None).exclude(id=resource.id).order_by('title')[:60]
    return {'entry': serialize(resource), 'connections': related, 'connection_total': len(edges), 'links': [{'id': str(r.id), 'title': r.title, 'kind': r.kind} for r in links]}
