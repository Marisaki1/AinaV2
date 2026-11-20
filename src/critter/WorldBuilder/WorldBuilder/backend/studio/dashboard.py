"""Owner-only, portable overview preferences with optimistic concurrency."""
import copy
from django.utils import timezone
from .models import World
from .services import Conflict

WIDGETS = ('pinned', 'notes', 'tasks', 'recent', 'favorites', 'activity', 'stats', 'actions')


def default_layout():
    return {'revision': 0, 'widgets': [
        {'id': key, 'visible': key != 'favorites', 'wide': key == 'pinned', 'limit': 6}
        for key in WIDGETS
    ], 'pins': []}


def current(world):
    saved = world.data.get('overview')
    return copy.deepcopy(saved) if isinstance(saved, dict) else default_layout()


def validate(world, value, previous):
    rows = value.get('widgets')
    if not isinstance(rows, list) or len(rows) != len(WIDGETS):
        raise ValueError('Include each overview section exactly once.')
    seen = set()
    clean = []
    for row in rows:
        if not isinstance(row, dict) or row.get('id') not in WIDGETS or row['id'] in seen:
            raise ValueError('Choose distinct supported overview sections.')
        seen.add(row['id'])
        if type(row.get('visible')) is not bool or type(row.get('wide')) is not bool:
            raise ValueError('Section visibility and width must be checked or unchecked.')
        if type(row.get('limit')) is not int or not 1 <= row['limit'] <= 24:
            raise ValueError('Section entry limits must be between 1 and 24.')
        clean.append({key: row[key] for key in ('id', 'visible', 'wide', 'limit')})
    if not any(row['visible'] for row in clean):
        raise ValueError('Keep at least one overview section visible.')
    pins = value.get('pins')
    if not isinstance(pins, list) or len(pins) > 24 or any(not isinstance(v, str) for v in pins) or len(set(pins)) != len(pins):
        raise ValueError('Choose up to 24 distinct pinned entries.')
    # Previously pinned trashed entries remain removable/recoverable; new pins
    # must be active originals in this world. No UUID from another world is accepted.
    allowed = {str(v) for v in world.resources.filter(deleted_at=None).values_list('id', flat=True)}
    retained = set(previous.get('pins', []))
    if any(v not in allowed and v not in retained for v in pins):
        raise ValueError('Pinned entries must belong to this world and be available.')
    result = {'widgets': clean, 'pins': pins}
    if 'briefing' in value or 'briefing' in previous:
        briefing = value.get('briefing', previous.get('briefing', {}))
        if not isinstance(briefing, dict) or set(briefing) - {'overview', 'current', 'leads', 'reference', 'cast'}:
            raise ValueError('Choose supported campaign briefing sections.')
        prior = previous.get('briefing', {})
        if not isinstance(prior, dict):
            prior = {}
        retained_briefing = {v for k, v in prior.items() if k != 'cast' and isinstance(v, str)}
        retained_briefing.update(v for v in prior.get('cast', []) if isinstance(v, str))
        selected = {}
        for key in ('overview', 'current', 'leads', 'reference'):
            identity = briefing.get(key, '')
            if not isinstance(identity, str) or identity and identity not in allowed | retained_briefing:
                raise ValueError('Briefing entries must belong to this world and be available.')
            selected[key] = identity
        cast = briefing.get('cast', [])
        if not isinstance(cast, list) or len(cast) > 12 or any(not isinstance(v, str) for v in cast) or len(set(cast)) != len(cast):
            raise ValueError('Choose up to 12 distinct cast entries.')
        if any(v not in allowed | retained_briefing for v in cast):
            raise ValueError('Cast entries must belong to this world and be available.')
        selected['cast'] = cast
        result['briefing'] = selected
    return result


def save(world, value):
    original = copy.deepcopy(world.data)
    previous = current(world)
    if type(value.get('expected_revision')) is not int or value['expected_revision'] != previous['revision']:
        raise Conflict('The overview changed in another tab. Reload its layout before saving.')
    layout = validate(world, value, previous)
    layout['revision'] = previous['revision'] + 1
    updated = {**original, 'overview': layout}
    # Compare the whole JSON snapshot: SQLite does not implement row locks.
    if not World.objects.filter(id=world.id, data=original).update(data=updated, updated_at=timezone.now()):
        raise Conflict('World settings changed. Reload the overview before saving.')
    world.data = updated
    return layout
