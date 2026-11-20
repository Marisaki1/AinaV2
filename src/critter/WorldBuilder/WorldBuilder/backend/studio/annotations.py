"""Private, recoverable research notes linked to original world records."""
import copy
import hashlib
import json
import uuid
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from .models import Resource


def validate(kind, data, world, visibility, resource_id=None):
    if 'annotation_source_id' not in data:
        return
    if kind != 'note' or visibility != 'private':
        raise ValueError('Research notes must remain private notes. Copy the prose into another article to publish it.')
    try:
        source = str(uuid.UUID(data['annotation_source_id']))
    except (ValueError, TypeError, AttributeError) as error:
        raise ValueError('Choose a valid research source.') from error
    if source == str(resource_id) or not Resource.objects.filter(id=source, world=world).exists():
        raise ValueError('Research notes must reference another original in this world.')
    if data.get('annotation_status', 'open') not in ('open', 'resolved'):
        raise ValueError('Choose open or resolved research status.')
    if type(data.get('annotation_source_revision')) is not int or data['annotation_source_revision'] < 1:
        raise ValueError('Research notes need the source revision captured when they were created.')
    quote = data.get('annotation_quote', '')
    if not isinstance(quote, str) or len(quote) > 2000:
        raise ValueError('Source excerpts must be text up to 2,000 characters.')


def body(value):
    from .services import short
    return {'title': short(value.get('title', ''), 'Title', 180, False),
            'text': short(value.get('text', ''), 'Research note', 20000, False),
            'quote': short(value.get('quote', ''), 'Source excerpt', 2000)}


def document(source, values):
    nodes = []
    if values['quote']:
        nodes.append({'type': 'blockquote', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': values['quote']}]}]})
    for line in values['text'].split('\n'):
        nodes.append({'type': 'paragraph', 'content': [{'type': 'text', 'text': line}]} if line else {'type': 'paragraph'})
    nodes.append({'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Source: '}, {'type': 'resourceLink', 'attrs': {'id': str(source.id), 'label': source.title}}]})
    return {'type': 'doc', 'content': nodes}


def listing(source, include_resolved=False, page=0):
    from .services import serialize
    if type(page) is not int or page < 0:
        raise ValueError('Choose a valid research page.')
    rows = source.world.resources.filter(kind='note', deleted_at=None, data__annotation_source_id=str(source.id)).order_by('-updated_at', 'id')
    if not include_resolved:
        rows = rows.exclude(data__annotation_status='resolved')
    count = rows.count(); pages = max(1, (count + 9) // 10); page = min(page, pages - 1)
    return {'notes': [serialize(row) for row in rows[page * 10:page * 10 + 10]], 'total': count, 'page': page, 'pages': pages}


def act(source, value):
    from .services import Conflict, save_resource, serialize
    action = value.get('action', 'create')
    if action not in ('create', 'edit', 'status', 'trash'):
        raise ValueError('Choose a supported research-note action.')
    with transaction.atomic():
        source.refresh_from_db()
        if source.deleted_at:
            raise Http404('Source unavailable.')
        if action == 'create':
            values = body(value)
            try:
                key = str(uuid.UUID(value.get('key', '')))
            except (ValueError, TypeError, AttributeError) as error:
                raise ValueError('Use a valid research capture key.') from error
            fingerprint = hashlib.sha256(json.dumps(values, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            existing = source.world.resources.filter(data__annotation_source_id=str(source.id), data__annotation_key=key).first()
            if existing:
                if existing.deleted_at or existing.data.get('annotation_fingerprint') != fingerprint:
                    raise Conflict('This capture key was already used. Keep this draft and start a new capture.')
                return {'note': serialize(existing), 'replayed': True}
            if type(value.get('source_revision')) is not int or value['source_revision'] != source.revision:
                raise Conflict('The source changed. Your research draft is kept; reload the source before saving this excerpt.')
            record = save_resource(source.world, {'kind': 'note', 'title': values['title'], 'visibility': 'private',
                'document': document(source, values), 'data': {'annotation_source_id': str(source.id),
                    'annotation_source_revision': source.revision, 'annotation_quote': values['quote'],
                    'annotation_text': values['text'], 'annotation_status': 'open', 'annotation_key': key, 'annotation_fingerprint': fingerprint}})
            return {'note': serialize(record), 'replayed': False}
        try:
            record = source.world.resources.get(id=value.get('id'), kind='note', deleted_at=None, data__annotation_source_id=str(source.id))
        except (Resource.DoesNotExist, ValueError, TypeError):
            raise Http404('Research note unavailable.')
        expected = value.get('expected_revision')
        if type(expected) is not int or expected != record.revision:
            raise Conflict('This research note changed elsewhere. Your draft is kept; reload its current version.')
        if action == 'trash':
            Resource.objects.filter(id=record.id, revision=expected).update(deleted_at=timezone.now(), revision=expected + 1, updated_at=timezone.now())
            from .services import index_resource
            record.refresh_from_db(); index_resource(record)
            return {'removed': str(record.id)}
        data = copy.deepcopy(record.data)
        if action == 'status':
            if value.get('status') not in ('open', 'resolved'):
                raise ValueError('Choose open or resolved.')
            data['annotation_status'] = value['status']
            updated = save_resource(source.world, {'data': data, 'expected_revision': expected}, record)
        else:
            values = body(value); data.update(annotation_quote=values['quote'], annotation_text=values['text'])
            updated = save_resource(source.world, {'title': values['title'], 'document': document(source, values), 'data': data, 'expected_revision': expected}, record)
        return {'note': serialize(updated)}
