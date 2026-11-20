"""Manuscript assembly, original-record outlines and recoverable draft sets."""
import base64
import copy
import html
import uuid
from collections import defaultdict
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from .models import Resource
from .documents import plain_text
from .services import Conflict, public_references, save_resource, serialize, short, snapshot

KINDS = {'manuscript', 'chapter', 'scene', 'folder'}


def nodes(book):
    available = list(book.world.resources.filter(deleted_at=None, kind__in=KINDS))
    children = defaultdict(list)
    for entry in available:
        children[str(entry.parent_id)].append(entry)
    result = [book]
    pending = [book]
    seen = {book.id}
    while pending:
        parent = pending.pop()
        descendants = sorted(children[str(parent.id)], key=lambda r: (r.position, r.created_at, str(r.id)))
        for child in reversed(descendants):
            if child.id in seen or child.kind == 'manuscript':
                continue
            seen.add(child.id)
            pending.append(child)
        if parent.id != book.id:
            result.append(parent)
    return result


def validate(kind, data, world):
    if kind != 'manuscript':
        return
    for key in ('author', 'subtitle', 'label'):
        if key in data:
            short(data[key], key.title(), 240)
    if 'goal' in data and (type(data['goal']) is not int or not 0 <= data['goal'] <= 10000000):
        raise ValueError('Word goals must be between zero and ten million.')
    for key in ('writing_research', 'writing_include'):
        if key not in data:
            continue
        values = data[key]
        if not isinstance(values, list) or len(values) > 200 or any(not isinstance(v, str) for v in values) or len(values) != len(set(values)):
            raise ValueError('Choose up to 200 distinct manuscript references.')
        # Missing/trashed IDs are retained as recoverable references, as in notes.
        for value in values:
            try:
                identity = uuid.UUID(value)
            except ValueError as error:
                raise ValueError('Choose valid manuscript references.') from error
            if Resource.objects.filter(id=identity).exclude(world=world).exists():
                raise ValueError('Manuscript references must belong to this world.')
    checkpoints = data.get('writing_checkpoints', [])
    if not isinstance(checkpoints, list) or len(checkpoints) > 5:
        raise ValueError('Keep at most five named manuscript checkpoints. Export or remove one before adding another.')
    seen = set()
    for checkpoint in checkpoints:
        if not isinstance(checkpoint, dict) or not isinstance(checkpoint.get('id'), str) or checkpoint['id'] in seen:
            raise ValueError('Invalid manuscript checkpoint identity.')
        seen.add(checkpoint['id'])
        short(checkpoint.get('name'), 'Checkpoint name', 120, False)
        short(checkpoint.get('created_at'), 'Checkpoint timestamp', 80, False)
        rows = checkpoint.get('nodes')
        if not isinstance(rows, list) or not 1 <= len(rows) <= 200:
            raise ValueError('A checkpoint must contain between 1 and 200 manuscript records.')
        identities = set()
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get('snapshot'), dict):
                raise ValueError('Invalid checkpoint record.')
            saved = row['snapshot']
            if not isinstance(saved.get('data'), dict) or not isinstance(saved.get('document'), dict) or not isinstance(saved.get('title'), str):
                raise ValueError('Checkpoint records need valid original prose, data and titles.')
            try:
                identity = str(uuid.UUID(row.get('id', '')))
            except (ValueError, TypeError, AttributeError) as error:
                raise ValueError('Invalid checkpoint record identity.') from error
            if identity in identities or row['snapshot'].get('kind') not in KINDS:
                raise ValueError('Choose distinct manuscript checkpoint records.')
            identities.add(identity)
            if Resource.objects.filter(id=identity).exclude(world=world).exists():
                raise ValueError('Checkpoint records must belong to this world.')
            if row['snapshot'].get('data', {}).get('writing_checkpoints'):
                raise ValueError('Checkpoint snapshots cannot contain other checkpoints.')


def revisions_match(entries, expected):
    actual = {str(r.id): r.revision for r in entries}
    if not isinstance(expected, dict) or set(expected) != set(actual) or any(type(expected[k]) is not int or expected[k] != v for k, v in actual.items()):
        raise Conflict('The manuscript changed. Refresh and review the current version before continuing.')


def outline(book, query=''):
    entries = nodes(book)
    by_id = {r.id: r for r in entries}
    def is_research(entry):
        seen = set()
        while entry and entry.id not in seen:
            if entry.kind == 'folder':
                return True
            seen.add(entry.id)
            entry = by_id.get(entry.parent_id)
        return False
    writing = [r for r in entries if not is_research(r)]
    scenes = [r for r in writing if r.kind == 'scene']
    stages = defaultdict(int)
    for entry in scenes:
        stages[entry.data.get('label') or 'Unlabelled'] += 1
    value = {
        'book': serialize(book),
        'nodes': [serialize(r, full=False) for r in entries[1:]],
        'expected_revisions': {str(r.id): r.revision for r in entries},
        'statistics': {'words': sum(len(plain_text(r.document).split()) for r in scenes), 'scenes': len(scenes),
                       'chapters': sum(r.kind == 'chapter' for r in writing), 'stages': dict(stages)},
        'checkpoints': [{k: v for k, v in c.items() if k != 'nodes'} for c in book.data.get('writing_checkpoints', [])],
    }
    if query:
        needle = short(query, 'Manuscript search', 200).casefold()
        matches = []
        for entry in entries[1:]:
            text = entry.title + '\n' + entry.summary + '\n' + plain_text(entry.document)
            index = text.casefold().find(needle)
            if index >= 0:
                matches.append({'id': str(entry.id), 'excerpt': text[max(0, index - 60):index + 180]})
        value['search_matches'] = matches
    return value


def change(book, value):
    with transaction.atomic():
        entries = nodes(book)
        revisions_match(entries, value.get('expected_revisions'))
        by_id = {str(r.id): r for r in entries}
        action = value.get('action')
        if action == 'checkpoint':
            name = short(value.get('name'), 'Checkpoint name', 120, False)
            if len(entries) > 200:
                raise ValueError('A named checkpoint supports up to 200 manuscript records; export larger manuscripts instead.')
            records = []
            for entry in entries:
                saved = copy.deepcopy(snapshot(entry))
                saved['data'].pop('writing_checkpoints', None)
                records.append({'id': str(entry.id), 'snapshot': saved})
            checkpoints = copy.deepcopy(book.data.get('writing_checkpoints', []))
            checkpoints.append({'id': str(uuid.uuid4()), 'name': name, 'created_at': timezone.now().isoformat(), 'nodes': records})
            save_resource(book.world, {'data': {**book.data, 'writing_checkpoints': checkpoints}, 'expected_revision': book.revision}, book)
        elif action == 'delete_checkpoint':
            saved = book.data.get('writing_checkpoints', [])
            if not any(c['id'] == value.get('checkpoint_id') for c in saved):
                raise ValueError('Choose an existing checkpoint.')
            save_resource(book.world, {'data': {**book.data, 'writing_checkpoints': [c for c in saved if c['id'] != value['checkpoint_id']]}, 'expected_revision': book.revision}, book)
        elif action == 'move':
            entry = by_id.get(value.get('id'))
            parent = by_id.get(value.get('parent'))
            if not entry or entry.id == book.id or not parent or parent.kind not in ('manuscript', 'chapter', 'folder'):
                raise ValueError('Choose a manuscript node and a valid destination.')
            if parent.kind == 'folder' and entry.kind != 'folder' and entry.kind not in ('scene', 'chapter'):
                raise ValueError('Choose a manuscript destination.')
            siblings = [r for r in entries if r.parent_id == parent.id and r.id != entry.id]
            position = value.get('position')
            if type(position) is not int or not 0 <= position <= len(siblings):
                raise ValueError('Choose a valid position within the destination.')
            siblings.insert(position, entry)
            # save_resource checks the full ancestor chain and rolls this batch back on cycles.
            for index, sibling in enumerate(siblings):
                if sibling.position != index or sibling.parent_id != parent.id:
                    save_resource(book.world, {'parent': str(parent.id), 'position': index, 'expected_revision': sibling.revision}, sibling)
        elif action == 'settings':
            allowed = {'goal', 'label', 'writing_research', 'writing_include', 'author', 'subtitle', 'cover_asset'}
            changes = value.get('settings')
            if not isinstance(changes, dict) or set(changes) - allowed:
                raise ValueError('Choose supported manuscript settings.')
            if 'goal' in changes and (type(changes['goal']) is not int or not 0 <= changes['goal'] <= 10000000):
                raise ValueError('Word goals must be between zero and ten million.')
            for key in ('author', 'subtitle', 'label'):
                if key in changes:
                    short(changes[key], key.title(), 240)
            save_resource(book.world, {'data': {**book.data, **changes}, 'expected_revision': book.revision}, book)
        elif action == 'publish':
            selected = [row['id'] for row in compilation(book)['nodes']]
            # Pin the explicit publication list so future nodes do not silently
            # join an existing reader edition merely by being published elsewhere.
            save_resource(book.world, {'data': {**book.data, 'writing_include': selected}, 'expected_revision': book.revision}, book)
            for identity in [str(book.id), *selected]:
                entry = book if identity == str(book.id) else by_id[identity]
                if entry.visibility != 'public':
                    save_resource(book.world, {'visibility': 'public', 'expected_revision': entry.revision}, entry)
                saved = {**snapshot(entry), '_revision': entry.revision}
                if not Resource.objects.filter(id=entry.id, revision=entry.revision).update(published=saved, updated_at=timezone.now()):
                    raise Conflict('An entry changed before publication. Review the selected edition again.')
                entry.published = saved
        else:
            raise ValueError('Choose a supported manuscript action.')
        return outline(book)


def restore_plan(book, checkpoint_id):
    checkpoint = next((v for v in book.data.get('writing_checkpoints', []) if v['id'] == checkpoint_id), None)
    if not checkpoint:
        raise ValueError('Choose an existing checkpoint.')
    saved_ids = {r['id'] for r in checkpoint['nodes']}
    current = {str(r.id): r for r in nodes(book)}
    stored = {str(r.id): r for r in book.world.resources.filter(id__in=saved_ids)}
    if set(stored) != saved_ids or str(book.id) not in saved_ids:
        raise ValueError('This checkpoint has missing source records. Restore the complete world backup instead.')
    current.update(stored)
    rows = []
    for record in checkpoint['nodes']:
        entry = stored[record['id']]
        saved = record['snapshot']
        current_snapshot = copy.deepcopy(snapshot(entry))
        current_snapshot['data'].pop('writing_checkpoints', None)
        rows.append({'id': record['id'], 'title': entry.title, 'saved_title': saved['title'],
                     'current_text': plain_text(entry.document), 'saved_text': plain_text(saved['document']),
                     'current_parent': str(entry.parent_id) if entry.parent_id else None, 'saved_parent': saved.get('parent'),
                     'trashed': bool(entry.deleted_at),
                     'changed_fields': [key for key, value in saved.items() if key != 'visibility' and current_snapshot.get(key) != value]})
    return {'name': checkpoint['name'], 'changes': rows,
            'retained_new_nodes': [{'id': r.id, 'title': r.title} for key, r in current.items() if key not in saved_ids],
            'expected_revisions': {key: r.revision for key, r in current.items()}}, checkpoint, current


def restore(book, checkpoint_id, value):
    with transaction.atomic():
        plan, checkpoint, current = restore_plan(book, checkpoint_id)
        revisions_match(list(current.values()), value.get('expected_revisions'))
        saved = {r['id']: r['snapshot'] for r in checkpoint['nodes']}
        newer = set(current) - set(saved)
        for key in newer:
            entry = current[key]
            if str(entry.parent_id) not in newer:
                save_resource(book.world, {'parent': None, 'expected_revision': entry.revision}, entry)
        # Detach saved originals first to avoid temporary cycles during parent restoration.
        for key in saved:
            entry = current[key]
            if entry.parent_id:
                save_resource(book.world, {'parent': None, 'expected_revision': entry.revision}, entry)
        pending = dict(saved)
        while pending:
            ready = [key for key, row in pending.items() if row.get('parent') not in pending]
            if not ready:
                raise ValueError('The checkpoint contains a parent cycle.')
            for key in ready:
                entry = current[key]
                row = copy.deepcopy(pending.pop(key))
                # Restoring a working draft never changes published snapshots/access.
                row['visibility'] = entry.visibility
                if key == str(book.id):
                    row['data']['writing_checkpoints'] = book.data.get('writing_checkpoints', [])
                save_resource(book.world, {**row, 'expected_revision': entry.revision}, entry, restore=True)
        return outline(book)


def compilation(book, reader=False):
    if reader:
        references = public_references(book.world)
    else:
        references = {str(r.id): {'id': str(r.id), 'kind': r.kind, 'title': r.title, 'aliases': r.aliases,
                                 'data': r.data, 'document': r.document if r.data.get('reusable_snippet') else None}
                      for r in book.world.resources.filter(deleted_at=None)}
    root = serialize(book, reader=reader, references=references)
    if not root:
        raise ValueError('Publish the manuscript before compiling a reader edition.')
    if reader:
        available = []
        for entry in book.world.resources.filter(kind__in=KINDS, deleted_at=None, visibility='public', published__isnull=False):
            value = serialize(entry, reader=True, references=references)
            if value:
                available.append(value)
    else:
        available = [serialize(r, references=references) for r in nodes(book)]
    children = defaultdict(list)
    for entry in available:
        children[entry.get('parent')].append(entry)
    include = root['data'].get('writing_include')
    included = None if include is None else set(include)
    result = []
    pending = [(str(book.id), 0)]
    seen = set()
    while pending:
        identity, depth = pending.pop()
        for entry in reversed(sorted(children[identity], key=lambda r: (r['position'], r['id']))):
            if entry['id'] in seen or entry['kind'] in ('manuscript', 'folder'):
                continue
            seen.add(entry['id'])
            if included is not None and entry['id'] not in included:
                continue
            pending.append((entry['id'], depth + 1))
        if identity != str(book.id):
            entry = next(v for v in available if v['id'] == identity)
            result.append({**entry, 'depth': depth})
    return {'book': root, 'nodes': result, 'reader': reader,
            'words': sum(r['word_count'] for r in result if r['kind'] == 'scene')}


def export(book, format, reader=False):
    assembled = compilation(book, reader)
    root, entries = assembled['book'], assembled['nodes']
    if format == 'text':
        text = root['title'] + '\n' + root['data'].get('author', '') + '\n\n'
        text += plain_text(root.get('document', {}), reader=reader) + '\n\n'
        text += '\n\n'.join(r['title'] + '\n' + plain_text(r.get('document', {}), reader=reader) for r in entries)
        return text.encode('utf-8'), 'text/plain; charset=utf-8', 'txt'
    if format != 'html':
        raise ValueError('Choose HTML or plain text compilation.')
    escape = html.escape
    body = '<header><h1>' + escape(root['title']) + '</h1><p>' + escape(root['data'].get('subtitle', '')) + '</p><p>' + escape(root['data'].get('author', '')) + '</p></header>'
    cover = book.world.assets.filter(id=root['data'].get('cover_asset')).first() if root['data'].get('cover_asset') else None
    if cover:
        body += '<img alt="Cover" src="/media/' + str(cover.id) + '">'
    body += root.get('html', '')
    body += '<nav><h2>Contents</h2><ol>' + ''.join('<li><a href="#node-' + r['id'] + '">' + escape(r['title']) + '</a></li>' for r in entries) + '</ol></nav>'
    for entry in entries:
        body += '<article id="node-' + entry['id'] + '"><h2>' + escape(entry['title']) + '</h2>' + entry.get('html', '') + entry.get('structured_html', '') + '</article>'
    for entry in entries:
        body = body.replace('/#/entry/' + entry['id'], '#node-' + entry['id'])
    # Include local images so the file opens after the integration is stopped.
    embedded_bytes = 0
    for asset in book.world.assets.all():
        url = '/media/' + str(asset.id)
        if url in body:
            path = settings.MEDIA_ROOT / asset.storage_name
            if not path.exists():
                raise ValueError('A referenced image is missing. Restore its media before exporting.')
            embedded_bytes += path.stat().st_size
            if embedded_bytes > 32000000:
                raise ValueError('Embedded book images exceed 32 MB. Use smaller images or compile a smaller selection.')
            data = 'data:' + asset.mime + ';base64,' + base64.b64encode(path.read_bytes()).decode('ascii')
            body = body.replace(url, data)
    document = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + escape(root['title']) + '</title><style>body{max-width:850px;margin:40px auto;padding:0 24px;font:18px/1.7 Georgia,serif;color:#202820;background:#fffef8}img{max-width:100%;height:auto}article{break-before:page;margin:3em 0}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:8px}a{color:#315c45}pre{white-space:pre-wrap}@media print{nav{break-after:page}}</style></head><body>' + body + '</body></html>'
    return document.encode('utf-8'), 'text/html; charset=utf-8', 'html'
