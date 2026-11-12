"""Revision-checked connection editing, recoverable removal and history."""

from collections import defaultdict
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from .models import Connection, ConnectionRevision, Resource
from .tools import integer

FIELDS = ("source", "target", "kind", "label", "strength", "notes", "visibility")


def snapshot(edge):
    return {
        "source": str(edge.source_id),
        "target": str(edge.target_id),
        "kind": edge.kind,
        "label": edge.label,
        "strength": edge.strength,
        "notes": edge.notes,
        "visibility": edge.visibility,
        "deleted": edge.deleted_at is not None,
    }


def revisions(edge):
    rows = [
        {
            "number": r.number,
            "snapshot": r.snapshot,
            "action": r.action,
            "created_at": r.created_at.isoformat(),
        }
        for r in edge.revisions.all()
    ]
    return rows or [
        {
            "number": edge.revision,
            "snapshot": snapshot(edge),
            "action": "baseline",
            "created_at": edge.created_at.isoformat(),
        }
    ]


def owned(user, identity):
    try:
        return Connection.objects.select_related("world").get(
            id=identity, world__owner=user
        )
    except (Connection.DoesNotExist, ValueError):
        raise Http404()


def clean(world, data, current=None, force=False):
    from .services import short
    from .graphs import PARENTS, walk

    try:
        source = world.resources.get(id=data.get("source"), deleted_at=None)
        target = world.resources.get(id=data.get("target"), deleted_at=None)
    except Resource.DoesNotExist as error:
        raise ValueError("Choose two active entries from this world.") from error
    if source == target:
        raise ValueError("Choose two different entries.")
    kind = short(data.get("kind", "related"), "Relationship type", 40, False)
    visibility = data.get("visibility", "private")
    if visibility not in ("private", "public"):
        raise ValueError("Choose private or reader-visible connection.")
    unchanged = (
        not force
        and current
        and current.deleted_at is None
        and current.source_id == source.id
        and current.target_id == target.id
        and current.kind == kind
    )
    if kind in PARENTS and not unchanged:
        children = defaultdict(set)
        active = world.connections.filter(deleted_at=None, kind__in=PARENTS)
        if current:
            active = active.exclude(id=current.id)
        for a, b in active.values_list("source_id", "target_id"):
            children[a].add(b)
        if source.id in walk(target.id, children, 1000000000):
            raise ValueError("This parent relationship would create an ancestry cycle.")
    return {
        "source": source,
        "target": target,
        "kind": kind,
        "label": short(data.get("label", ""), "Relationship label", 120),
        "strength": integer(data.get("strength", 0), "Strength", -100, 100),
        "notes": short(data.get("notes", ""), "Notes", 10000),
        "visibility": visibility,
    }


def expected(edge, value):
    from .services import Conflict

    if isinstance(value, bool) or not isinstance(value, int) or value != edge.revision:
        raise Conflict(
            "This connection changed in another tab. Your edits were not applied. Reload its current version and try again."
        )


def record(edge, action):
    ConnectionRevision.objects.create(
        connection=edge, number=edge.revision, snapshot=snapshot(edge), action=action
    )


def save(world, value, identity=None, action="updated", number=None):
    from .services import connection_json

    with transaction.atomic():
        edge = None
        if identity:
            edge = world.connections.filter(id=identity).first()
            if edge is None:
                raise Http404()
            expected(edge, value.get("expected_revision"))
            if not edge.revisions.filter(number=edge.revision).exists():
                record(edge, "baseline")
            if action == "deleted":
                if edge.deleted_at:
                    raise ValueError("This connection is already removed.")
                edge.deleted_at = timezone.now()
            else:
                if action != "restored" and edge.deleted_at:
                    raise ValueError("Restore this connection before editing it.")
                previous = snapshot(edge)
                if action == "restored" and number is not None:
                    integer(number, "Connection revision", 1, 1000000000)
                    row = edge.revisions.filter(number=number).first()
                    if row is None:
                        raise Http404()
                    if row.snapshot.get("deleted"):
                        raise ValueError(
                            "Choose a revision in which the connection is active."
                        )
                    previous = row.snapshot
                changes = {k: v for k, v in value.items() if k != "expected_revision"}
                if action == "restored":
                    changes = {}
                if set(changes) - set(FIELDS):
                    raise ValueError("Unsupported connection fields.")
                fields = clean(
                    world, {**previous, **changes}, edge, force=action == "restored"
                )
                for key, val in fields.items():
                    setattr(edge, key, val)
                edge.deleted_at = None
            edge.revision += 1
            edge.save()
        else:
            edge = Connection.objects.create(world=world, **clean(world, value))
            action = "created"
        record(edge, action)
        return connection_json(edge)


def export(edge):
    from .services import connection_json

    return {**connection_json(edge), "history": revisions(edge)}


def import_connection(world, raw, mapping):
    from .services import short
    from django.utils.dateparse import parse_datetime

    def stamp(value):
        if value is None:
            return timezone.now()
        result = parse_datetime(value) if isinstance(value, str) else None
        if result is None or timezone.is_naive(result):
            raise ValueError("Invalid connection history timestamp.")
        return result

    def fields(value):
        if not isinstance(value, dict):
            raise ValueError("Invalid connection history snapshot.")
        source, target = mapping[value["source"]], mapping[value["target"]]
        if (
            source == target
            or not Resource.objects.filter(id=source, world=world).exists()
            or not Resource.objects.filter(id=target, world=world).exists()
        ):
            raise ValueError(
                "Connection history must reference two different entries in this world."
            )
        visibility = value.get("visibility", "private")
        if visibility not in ("private", "public"):
            raise ValueError("Invalid connection visibility.")
        return {
            "source_id": source,
            "target_id": target,
            "kind": short(value.get("kind", "related"), "Relation type", 40, False),
            "label": short(value.get("label", ""), "Relation label", 120),
            "strength": integer(
                value.get("strength", 0), "Relationship strength", -100, 100
            ),
            "notes": short(value.get("notes", ""), "Relationship notes", 10000),
            "visibility": visibility,
        }

    revision = integer(raw.get("revision", 1), "Connection revision", 1, 10000)
    edge = Connection.objects.create(
        **({"id": mapping[raw["id"]]} if raw.get("id") in mapping else {}),
        world=world,
        revision=revision,
        deleted_at=stamp(raw["deleted_at"]) if raw.get("deleted_at") else None,
        **fields(raw),
    )
    Connection.objects.filter(id=edge.id).update(
        created_at=stamp(raw.get("created_at")), updated_at=stamp(raw.get("updated_at"))
    )
    edge.refresh_from_db()
    history = raw.get("history")
    if history is None:
        if revision != 1:
            raise ValueError("Connection history is missing revisions.")
        record(edge, "baseline")
        return edge
    if not isinstance(history, list) or len(history) != revision:
        raise ValueError("Connection history must contain every revision.")
    rows = []
    dates = []
    seen = set()
    for item in history:
        if not isinstance(item, dict):
            raise ValueError("Invalid connection history row.")
        number = integer(item.get("number"), "Connection revision", 1, revision)
        action = item.get("action")
        if number in seen or action not in (
            "created",
            "updated",
            "deleted",
            "restored",
            "baseline",
        ):
            raise ValueError("Invalid or duplicate connection history revision.")
        seen.add(number)
        value = item.get("snapshot")
        if (
            not isinstance(value, dict)
            or set(value) != set(FIELDS) | {"deleted"}
            or not isinstance(value["deleted"], bool)
        ):
            raise ValueError("Invalid connection history snapshot fields.")
        clean = fields(value)
        projected = {
            "source": clean.pop("source_id"),
            "target": clean.pop("target_id"),
            **clean,
            "deleted": value["deleted"],
        }
        if number == revision and projected != snapshot(edge):
            raise ValueError("Connection history does not match its latest state.")
        rows.append(
            ConnectionRevision(
                connection=edge, number=number, action=action, snapshot=projected
            )
        )
        dates.append(stamp(item.get("created_at")))
    ConnectionRevision.objects.bulk_create(rows, batch_size=500)
    for row, date in zip(rows, dates):
        row.created_at = date
    ConnectionRevision.objects.bulk_update(rows, ["created_at"], batch_size=500)
    return edge
