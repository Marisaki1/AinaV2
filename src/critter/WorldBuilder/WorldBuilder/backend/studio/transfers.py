"""Reviewed, bounded cross-world copy/move of original resource graphs."""
import copy
import hashlib
import json
import re
import uuid
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from .models import World, Resource, Asset, Connection
from .services import (Conflict, check_json, snapshot, connection_json, pack_archive,
                       import_world_archive, save_resource, index_resource)

UUID = re.compile(r'(?<![0-9a-f])[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}(?![0-9a-f])', re.I)
SALT = 'worldbuilder.reviewed-transfer.v1'
RECEIPTS = '_transfer_receipts'


def identity(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError('Choose valid transfer identities.') from error


def options(value):
    ids = value.get('ids')
    if not isinstance(ids, list) or not 1 <= len(ids) <= 100:
        raise ValueError('Select one to 100 original entries.')
    ids = [identity(v) for v in ids]
    if len(ids) != len(set(ids)):
        raise ValueError('Select each original only once.')
    mode = value.get('mode', 'copy')
    if mode not in ('copy', 'move') or type(value.get('descendants', True)) is not bool:
        raise ValueError('Choose copy or move and a valid descendants option.')
    return {'ids': sorted(ids), 'mode': mode, 'descendants': value.get('descendants', True),
            'key': identity(value.get('key')), 'target': identity(value.get('target'))}


def references(node, known, path='$', container=''):
    found, unhandled = set(), []
    if isinstance(node, str):
        for match in UUID.finditer(node):
            key = match.group().lower()
            if key not in known:
                continue
            found.add(key)
            supported = node == key or '/#/entry/' + key in node or '/media/' + key in node or 'custom:' + key in node or node.startswith(key + '/objective/')
            if not supported:
                unhandled.append({'path': path, 'id': key, 'reason': 'Embedded source ID is not a supported remapping pattern; retained literally.'})
    elif isinstance(node, list):
        for index, value in enumerate(node):
            other, warnings = references(value, known, f'{path}[{index}]', container)
            found.update(other); unhandled.extend(warnings)
    elif isinstance(node, dict):
        for key, value in node.items():
            if key in known:
                found.add(key)
                if container not in ('parents', 'positions'):
                    unhandled.append({'path': path + '.' + key, 'id': key, 'reason': 'Unknown ID-keyed property is preserved literally.'})
            other, warnings = references(value, known, path + '.' + str(key), str(key))
            found.update(other); unhandled.extend(warnings)
    return found, unhandled


def receipts(world):
    result = world.data.get(RECEIPTS, [])
    if not isinstance(result, list) or any(not isinstance(v, dict) for v in result):
        raise ValueError('Transfer receipt metadata has an unsupported format; no settings were overwritten.')
    return result


def reset_capture_metadata(node):
    if isinstance(node, dict):
        return {key: reset_capture_metadata(value) for key, value in node.items()
                if key not in ('note_capture_key', 'note_capture_fingerprint')}
    if isinstance(node, list):
        return [reset_capture_metadata(v) for v in node]
    return node


def plan(source, target, value):
    selected = options(value)
    if source.owner_id != target.owner_id or source.id == target.id or str(target.id) != selected['target']:
        raise ValueError('Choose a different world belonging to this account.')
    metadata = {str(r['id']): r for r in source.resources.values('id', 'title', 'parent_id', 'revision', 'kind', 'deleted_at')}
    assets = {str(a.id): a for a in source.assets.all()}
    known = set(metadata) | set(assets)
    external = {str(key) for key in Resource.objects.filter(world__owner_id=source.owner_id).exclude(world=source).values_list('id', flat=True)}
    external.update(str(key) for key in Asset.objects.filter(world__owner_id=source.owner_id).exclude(world=source).values_list('id', flat=True))
    if any(key not in metadata or metadata[key]['deleted_at'] for key in selected['ids']):
        raise ValueError('Choose available originals from the source world.')
    requested = set(selected['ids'])
    if selected['descendants']:
        while True:
            extra = {key for key, row in metadata.items() if not row['deleted_at'] and str(row['parent_id']) in requested}
            if extra <= requested: break
            requested.update(extra)
            if len(requested) > 200: raise ValueError('Transfer supports up to 200 records; use a complete world archive for larger batches.')
    included, wanted_assets, originals, warnings = set(requested), set(), {}, []
    pending = list(included)
    total_bytes = 0
    while pending:
        key = pending.pop()
        if key in originals: continue
        row = source.resources.get(id=key)
        raw = {'id': key, **snapshot(row), 'deleted_at': row.deleted_at.isoformat() if row.deleted_at else None, 'published_snapshot': None}
        raw['visibility'] = 'private'
        raw['data'] = reset_capture_metadata(raw['data'])
        total_bytes += len(json.dumps(raw, ensure_ascii=False).encode('utf-8'))
        if total_bytes > 12000000: raise ValueError('Transfer content exceeds 12 MB. Choose a smaller selection.')
        originals[key] = raw
        linked, unsupported = references(raw, known)
        warnings.extend({'source': key, **v} for v in unsupported)
        outside, _ = references(raw, external)
        warnings.extend({'source': key, 'path': '$', 'id': other, 'reason': 'Reference outside the source world remains unchanged; review it manually.'} for other in sorted(outside))
        wanted_assets.update(linked & set(assets))
        extra = linked & set(metadata) - included
        included.update(extra); pending.extend(extra)
        if len(included) > 200: raise ValueError('Dependencies exceed the 200-record transfer limit. Choose a smaller selection.')
    if sum(assets[key].size for key in wanted_assets) > 32000000:
        raise ValueError('Referenced media exceeds 32 MB. Choose a smaller selection.')
    edges, boundary = [], []
    for edge in source.connections.filter(deleted_at=None):
        ends = {str(edge.source_id), str(edge.target_id)}
        if ends <= included:
            edges.append({**connection_json(edge), 'revision': 1, 'visibility': 'private'})
        elif ends & included:
            boundary.append({'id': str(edge.id), 'source': str(edge.source_id), 'target': str(edge.target_id), 'label': edge.label})
    incoming = []
    if selected['mode'] == 'move':
        for row in source.resources.exclude(id__in=included).filter(deleted_at=None).iterator(chunk_size=10):
            linked, _ = references(snapshot(row), requested)
            if linked:
                incoming.append({'id': str(row.id), 'title': row.title, 'revision': row.revision})
    target_titles = set(target.resources.filter(deleted_at=None).values_list('title', flat=True))
    target_media = {asset.digest: asset for asset in target.assets.all()}
    report = {'source': str(source.id), 'target': str(target.id), 'source_name': source.name, 'target_name': target.name,
        'mode': selected['mode'], 'key': selected['key'], 'selected_ids': selected['ids'], 'descendants': selected['descendants'],
        'records': [{'id': key, 'title': metadata[key]['title'], 'kind': metadata[key]['kind'],
                     'revision': metadata[key]['revision'], 'trashed': bool(metadata[key]['deleted_at']),
                     'role': 'selected' if key in selected['ids'] else 'descendant' if key in requested else 'dependency',
                     'title_collision': metadata[key]['title'] in target_titles} for key in sorted(included)],
        'assets': [{'id': key, 'name': assets[key].filename, 'digest': assets[key].digest, 'revision': assets[key].revision,
                    'credit': assets[key].credit, 'tags': assets[key].tags,
                    'destination_reuse': ({'id': str(target_media[assets[key].digest].id),
                        'name': target_media[assets[key].digest].filename, 'credit': target_media[assets[key].digest].credit}
                        if assets[key].digest in target_media else None)} for key in sorted(wanted_assets)],
        'relationship_count': len(edges), 'outside_relationships': boundary,
        'incoming_references': incoming, 'literal_references': warnings,
        'history_policy': 'Current records and named checkpoint data are copied. General revision/activity histories stay with the source. All destination records start private; publication is not copied.',
        'move_policy': 'Move places only selected originals/descendants in source Trash; supporting dependencies remain. Outside links are not rewritten.',
        'metadata_policy': 'World settings are not copied. Unknown fields remain; capture replay keys are reset. Identical images reuse destination media and retain its existing name/credits. Dynamic filters re-evaluate in the destination.'}
    guards = {'report': report, 'source_data': source.data, 'target_data': target.data,
              'target_records': list(target.resources.order_by('id').values_list('id', 'revision', 'deleted_at')),
              'target_assets': list(target.assets.order_by('id').values_list('id', 'revision', 'digest')),
              'edges': [(row['id'], row['updated_at']) for row in edges]}
    digest = hashlib.sha256(json.dumps(guards, sort_keys=True, default=str, separators=(',', ':')).encode()).hexdigest()
    return report, digest, originals, assets, wanted_assets, edges, requested


def preview(source, target, value):
    report, digest, *_ = plan(source, target, value)
    return {**report, 'token': signing.dumps({'hash': digest, 'source': str(source.id), 'target': str(target.id),
             'owner': source.owner_id, 'key': report['key']}, salt=SALT, compress=True)}


def commit(source, target, value):
    selected = options(value)
    fingerprint = hashlib.sha256(json.dumps({'source': str(source.id), **selected}, sort_keys=True).encode()).hexdigest()
    created_files = []
    try:
        with transaction.atomic():
            source = World.objects.get(id=source.id); target = World.objects.get(id=target.id)
            if source.owner_id != target.owner_id or source.id == target.id:
                raise ValueError('Choose two owned worlds.')
            previous = next((v for v in receipts(target) if v.get('key') == selected['key']), None)
            if previous:
                if previous.get('fingerprint') != fingerprint:
                    raise Conflict('This transfer key was already used for a different selection.')
                return {**previous, 'reused': True}
            try:
                signed = signing.loads(value.get('token', ''), salt=SALT, max_age=900)
            except (signing.BadSignature, TypeError, ValueError, AttributeError) as error:
                raise Conflict('The transfer review expired or is invalid. Review again; no originals changed.') from error
            report, digest, records, assets, asset_ids, edges, requested = plan(source, target, value)
            if signed != {'hash': digest, 'source': str(source.id), 'target': str(target.id), 'owner': source.owner_id, 'key': selected['key']}:
                raise Conflict('Source, destination or dependencies changed. Review the transfer again.')
            if (report['literal_references'] or report['incoming_references'] or report['outside_relationships']) and value.get('acknowledge_references') is not True:
                raise ValueError('Review and acknowledge the references that will remain in the source or require manual correction.')
            files = {}
            payload = {'world': {'name': source.name, 'data': {}}, 'resources': list(records.values()), 'connections': edges,
                       'assets': [{'id': key, 'storage_name': assets[key].storage_name, 'name': assets[key].filename,
                                   'credit': assets[key].credit, 'tags': assets[key].tags} for key in sorted(asset_ids)]}
            files['world.json'] = json.dumps(payload, ensure_ascii=False).encode()
            for key in asset_ids:
                asset = assets[key]; path = settings.MEDIA_ROOT / asset.storage_name
                if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != asset.digest:
                    raise ValueError('A source image is missing or changed. Restore its media and review again.')
                files['media/' + asset.storage_name] = path.read_bytes()
            result = {}
            def finalize(world, mapping):
                if selected['mode'] == 'move':
                    moving = []
                    for key in sorted(requested):
                        original = source.resources.get(id=key)
                        save_resource(source, {'expected_revision': original.revision}, original)
                        moving.append(original)
                    # Record every revision while all parents remain available.
                    for original in moving:
                        original.deleted_at = timezone.now(); original.save(update_fields=['deleted_at']); index_resource(original)
                receipt = {'key': selected['key'], 'fingerprint': fingerprint, 'source': str(source.id), 'target': str(target.id),
                           'mode': selected['mode'], 'mapping': mapping, 'moved_ids': sorted(requested) if selected['mode'] == 'move' else [],
                           'created_at': timezone.now().isoformat(), 'record_count': len(records), 'asset_count': len(asset_ids),
                           'relationship_count': len(edges), 'reused': False}
                for current in (source, world):
                    old_data = copy.deepcopy(current.data)
                    ledger = [*receipts(current), receipt]
                    # Retain every idempotency key. Older detailed ID maps become
                    # compact tombstones, never forgotten/re-executed requests.
                    ledger = [{k: v for k, v in entry.items() if k not in ('mapping', 'moved_ids')} if index < len(ledger)-20 else entry
                              for index, entry in enumerate(ledger)]
                    updated = {**old_data, RECEIPTS: ledger}
                    check_json(updated)
                    if not World.objects.filter(id=current.id, data=old_data).update(data=updated, updated_at=timezone.now()):
                        raise Conflict('World settings changed before the transfer finished.')
                    current.data = updated
                result.update(receipt)
            import_world_archive(source.owner, pack_archive(files, 'worldbuilder-world-v1'), destination=target,
                                 finalize=finalize, created_files_out=created_files)
            return result
    except Exception:
        for name in created_files:
            (settings.MEDIA_ROOT / name).unlink(missing_ok=True)
        raise
