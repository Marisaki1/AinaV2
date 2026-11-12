"""Database-backed party, inventory and session continuity workflows.

All durable records use Resource/Revision, including inventory movements. Stock and
its movement record commit together; no browser cache is authoritative for stock.
"""

import math
from contextvars import ContextVar
from uuid import UUID

from django.db import transaction
from django.http import Http404

from .models import Asset, Connection, Resource
from .tools import integer
from .workbench import membership

TYPES = (
    "item",
    "progression",
    "consequence",
    "relationship-event",
    "journey",
    "place-status",
    "media-collection",
    "loot",
    "transfer",
    "adjustment",
    "wrap-up",
)
MOVEMENTS = ("loot", "transfer", "adjustment")
ROLES = ("pc", "npc", "companion", "inactive")
REVIEW_SECTIONS = ("loot", "progression", "relationships", "consequences", "followups")
WRITING_STOCK = ContextVar("continuity_stock_write", default=False)
PRIVATE_KEYS = (
    "party_profiles",
    "party_location_id",
    "party_goals",
    "party_conditions",
    "continuity_graph",
    "continuity_dependencies",
    "holdings",
    "item_id",
    "quantity",
    "from_holder",
    "to_holder",
    "progression_type",
    "impact_status",
    "affected_entries",
    "connection_id",
    "location_id",
    "status_type",
    "controlled_by_id",
    "route_points",
    "collection_items",
    "reviewed",
    "review_sources",
    "wrap_up_note_id",
    "legacy_item",
)


def kindof(row):
    return row.data.get("continuity_type") or row.data.get("planning_type") or row.kind


def is_character(row):
    return (
        row.kind == "character" or row.kind == "article" and row.template == "character"
    )


def is_place(row):
    return row.kind == "article" and row.template in (
        "settlement",
        "building",
        "geography",
    )


def identity(value):
    if not isinstance(value, str):
        raise TypeError("Choose a valid source reference.")
    try:
        UUID(value)
    except (ValueError, AttributeError) as error:
        raise ValueError("Choose a valid source reference.") from error
    return value


def validate(kind, data, world, historical=False, previous=None, resource_id=None):
    from .services import short

    previous = previous or {}
    ctype = data.get("continuity_type")
    if (
        not historical
        and previous.get("continuity_type") in (*MOVEMENTS, "item")
        and ctype != previous["continuity_type"]
    ):
        raise ValueError(
            "Keep inventory identity and movement facts; use stock actions for changes."
        )
    relevant = ctype or any(k in data for k in PRIVATE_KEYS)
    if not relevant:
        return
    if ctype and (
        ctype not in TYPES
        or kind != ("article" if ctype in ("item", "media-collection") else "note")
    ):
        raise ValueError("Choose a supported continuity record type.")
    campaign = (
        str(resource_id or "") if kind == "campaign" else data.get("campaign_id", "")
    )
    same_scope = previous.get("campaign_id") == campaign

    def ref(value, expected=None, campaign_scope=False, old=False):
        identity(value)
        row = Resource.objects.filter(id=value, world=world).first()
        if row is None or row.deleted_at and not (historical or old):
            raise ValueError("Choose an available original in this world.")
        if not historical and not old:
            if (
                expected == "character"
                and not is_character(row)
                or expected == "place"
                and not is_place(row)
            ):
                raise ValueError("Choose the expected character or location.")
            if (
                expected
                and expected not in ("character", "place")
                and kindof(row) != expected
            ):
                raise ValueError("Choose the expected source type.")
            if (
                campaign_scope
                and membership({"data": row.data, "parent": str(row.parent_id or "")})
                != campaign
            ):
                raise ValueError("Choose an original from this campaign.")
        return row

    if ctype:
        ref(campaign, "campaign")
        if ctype == "journey" and not data.get("map_id"):
            raise ValueError("Choose the journey map.")
        if ctype == "place-status" and not data.get("location_id"):
            raise ValueError("Choose the affected location.")
        if data.get("session_id"):
            ref(
                data["session_id"],
                "session",
                True,
                same_scope and data["session_id"] == previous.get("session_id"),
            )
        if data.get("map_id"):
            ref(
                data["map_id"],
                "map",
                old=same_scope and data["map_id"] == previous.get("map_id"),
            )
        linked = data.get("related_entries", [])
        if (
            not isinstance(linked, list)
            or len(linked) > 500
            or any(not isinstance(v, str) for v in linked)
            or len(set(linked)) != len(linked)
        ):
            raise ValueError("Choose up to 500 different related originals.")
        for value in linked:
            ref(value, old=same_scope and value in previous.get("related_entries", []))
    for key in ("party_goals", "party_conditions"):
        if key in data:
            short(data[key], key, 20000)
    if data.get("party_location_id"):
        ref(
            data["party_location_id"],
            "place",
            old=data["party_location_id"] == previous.get("party_location_id"),
        )
    profiles = data.get("party_profiles", [])
    if not isinstance(profiles, list) or len(profiles) > 200:
        raise ValueError("Use at most 200 campaign cast profiles.")
    seen = set()
    old_profiles = {p["entry_id"]: p for p in previous.get("party_profiles", [])}
    for profile in profiles:
        if (
            not isinstance(profile, dict)
            or set(profile)
            != {"entry_id", "role", "location_id", "goals", "conditions", "notes"}
            or profile.get("role") not in ROLES
        ):
            raise ValueError("Invalid campaign cast profile.")
        value = profile["entry_id"]
        ref(value, "character", old=value in old_profiles)
        if value in seen:
            raise ValueError("Each character has one campaign profile.")
        seen.add(value)
        if profile["location_id"]:
            ref(
                profile["location_id"],
                "place",
                old=profile["location_id"]
                == old_profiles.get(value, {}).get("location_id"),
            )
        for key in ("goals", "conditions", "notes"):
            short(profile[key], key, 10000)
    if ctype == "item":
        if (
            not historical
            and previous.get("continuity_type") == "item"
            and previous.get("campaign_id") != data.get("campaign_id")
        ):
            raise ValueError("Keep tracked equipment in its original campaign.")
        holdings = data.get("holdings", [])
        if not isinstance(holdings, list) or len(holdings) > 75:
            raise ValueError("Use at most 75 item holders.")
        old_holders = {p["holder_id"] for p in previous.get("holdings", [])}
        holders = set()
        total = 0
        for holding in holdings:
            if not isinstance(holding, dict) or set(holding) != {
                "holder_id",
                "quantity",
            }:
                raise ValueError("Invalid item holding.")
            holder = holding["holder_id"]
            if holder != "party":
                row = ref(holder, old=same_scope and holder in old_holders)
                if not (historical or same_scope and holder in old_holders) and not (
                    is_character(row) or is_place(row)
                ):
                    raise ValueError(
                        "An item holder must be a character, location or party storage."
                    )
            if holder in holders:
                raise ValueError("Each item holder must be unique.")
            holders.add(holder)
            total += integer(holding["quantity"], "Item quantity", 0, 1000000)
        if total > 1000000:
            raise ValueError("An item supports at most 1,000,000 units.")
        if (
            previous.get("continuity_type") == "item"
            and holdings != previous.get("holdings", [])
            and not (historical or WRITING_STOCK.get())
        ):
            raise ValueError(
                "Use a transfer, reward or adjustment to change stock with history."
            )
    if ctype in MOVEMENTS:
        if not (historical or WRITING_STOCK.get()) and (
            not previous
            or any(
                data.get(k) != previous.get(k)
                for k in (
                    "continuity_type",
                    "campaign_id",
                    "item_id",
                    "quantity",
                    "from_holder",
                    "to_holder",
                    "session_id",
                )
            )
        ):
            raise ValueError(
                "Inventory movement facts are written by inventory actions."
            )
        ref(
            data.get("item_id"),
            "item",
            True,
            same_scope and data.get("item_id") == previous.get("item_id"),
        )
        integer(data.get("quantity"), "Movement quantity", 1, 1000000)
        for key in ("from_holder", "to_holder"):
            if data.get(key) and data[key] != "party":
                ref(
                    data[key],
                    old=(WRITING_STOCK.get() and key == "from_holder")
                    or same_scope
                    and data[key] == previous.get(key),
                )
    if ctype == "progression" and data.get("progression_type", "milestone") not in (
        "milestone",
        "ability",
        "development",
    ):
        raise ValueError("Choose milestone, ability or personal development.")
    if "impact_status" in data and data["impact_status"] not in ("open", "resolved"):
        raise ValueError("Choose open or resolved.")
    affected = data.get("affected_entries", [])
    if (
        not isinstance(affected, list)
        or len(affected) > 100
        or any(not isinstance(v, str) for v in affected)
        or len(set(affected)) != len(affected)
    ):
        raise ValueError("Choose up to 100 different affected originals.")
    for value in affected:
        ref(value, old=same_scope and value in previous.get("affected_entries", []))
    if data.get("location_id"):
        ref(
            data["location_id"],
            "place",
            old=same_scope and data["location_id"] == previous.get("location_id"),
        )
    if data.get("controlled_by_id"):
        ref(
            data["controlled_by_id"],
            old=same_scope
            and data["controlled_by_id"] == previous.get("controlled_by_id"),
        )
    if ctype == "place-status" and data.get("status_type", "discovery") not in (
        "discovery",
        "threat",
        "control",
        "business",
    ):
        raise ValueError("Choose discovery, threat, control or unfinished business.")
    if data.get("connection_id"):
        value = identity(data["connection_id"])
        edge = Connection.objects.filter(id=value, world=world).first()
        if (
            not edge
            or edge.deleted_at
            and not (
                historical or same_scope and value == previous.get("connection_id")
            )
        ):
            raise ValueError("Choose an available relationship in this world.")
    dependencies = data.get("continuity_dependencies", [])
    if not isinstance(dependencies, list) or len(dependencies) > 100:
        raise ValueError("Use at most 100 dependencies per original.")
    seen = set()
    for dep in dependencies:
        if not isinstance(dep, dict) or set(dep) != {
            "target_id",
            "source_objective",
            "target_objective",
            "notes",
        }:
            raise ValueError("Invalid quest dependency.")
        unchanged = same_scope and dep in previous.get("continuity_dependencies", [])
        if dep["target_id"] == str(resource_id or ""):
            raise ValueError("Choose a different original for a dependency.")
        row = ref(dep["target_id"], campaign_scope=True, old=unchanged)
        if not (historical or unchanged) and kindof(row) not in (
            "quest",
            "task",
            "campaign-scene",
            "encounter",
        ):
            raise ValueError("Connect a quest, task, scene or encounter.")
        key = (dep["target_id"], dep["source_objective"], dep["target_objective"])
        if key in seen:
            raise ValueError("Each dependency must be unique.")
        seen.add(key)
        for key, objectives in (
            ("source_objective", data.get("objectives", [])),
            ("target_objective", row.data.get("objectives", [])),
        ):
            short(dep[key], "Objective reference", 80)
            if (
                dep[key]
                and not (historical or unchanged)
                and dep[key] not in {o["id"] for o in objectives}
            ):
                raise ValueError("Choose an existing objective on that original.")
        short(dep["notes"], "Dependency guidance", 5000)
    positions = (
        data.get("continuity_graph", {}).get("positions", {})
        if isinstance(data.get("continuity_graph", {}), dict)
        else None
    )
    if not isinstance(positions, dict) or len(positions) > 200:
        raise ValueError("Use at most 200 diagram positions.")
    for key, point in positions.items():
        original_id, separator, objective_id = key.partition("/objective/")
        ref(
            original_id,
            campaign_scope=True,
            old=key in previous.get("continuity_graph", {}).get("positions", {}),
        )
        if (
            separator
            and not historical
            and key not in previous.get("continuity_graph", {}).get("positions", {})
        ):
            original = Resource.objects.get(id=original_id, world=world)
            if objective_id not in {
                o["id"] for o in original.data.get("objectives", [])
            }:
                raise ValueError(
                    "Choose an existing objective for its diagram position."
                )
        if (
            not isinstance(point, dict)
            or set(point) != {"x", "y"}
            or any(
                type(v) not in (int, float) or not math.isfinite(v) or abs(v) > 100000
                for v in point.values()
            )
        ):
            raise ValueError("Diagram positions must be finite coordinates.")
    points = data.get("route_points", [])
    if not isinstance(points, list) or len(points) > 200:
        raise ValueError("Use at most 200 journey waypoints.")
    if points and not data.get("map_id"):
        raise ValueError("Choose the journey map first.")
    for point in points:
        if not isinstance(point, dict) or set(point) != {
            "x",
            "y",
            "label",
            "location_id",
        }:
            raise ValueError("Invalid journey waypoint.")
        if any(
            type(point[k]) not in (int, float)
            or not math.isfinite(point[k])
            or not 0 <= point[k] <= 1
            for k in ("x", "y")
        ):
            raise ValueError("Journey waypoints must stay within the map.")
        short(point["label"], "Waypoint label", 180)
        if point["location_id"]:
            ref(
                point["location_id"],
                "place",
                old=same_scope and point in previous.get("route_points", []),
            )
    items = data.get("collection_items", [])
    if not isinstance(items, list) or len(items) > 200:
        raise ValueError("Use at most 200 session media references.")
    seen = set()
    for item in items:
        if (
            not isinstance(item, dict)
            or set(item) != {"entry_id", "asset_id", "caption", "category"}
            or bool(item["entry_id"]) == bool(item["asset_id"])
        ):
            raise ValueError(
                "Choose exactly one original or image per media reference."
            )
        unchanged = same_scope and item in previous.get("collection_items", [])
        if item["entry_id"]:
            ref(item["entry_id"], old=unchanged)
        elif not Asset.objects.filter(
            id=identity(item["asset_id"]), world=world
        ).exists():
            raise ValueError("Choose an image from this world.")
        key = item["entry_id"] or item["asset_id"]
        if key in seen:
            raise ValueError("Each media source appears once per collection.")
        seen.add(key)
        short(item["caption"], "Media caption", 1000)
        if item["category"] not in ("portrait", "map", "illustration", "handout"):
            raise ValueError("Choose a supported media category.")
    if "reviewed" in data and (
        not isinstance(data["reviewed"], dict)
        or set(data["reviewed"]) != set(REVIEW_SECTIONS)
        or any(type(v) is not bool for v in data["reviewed"].values())
    ):
        raise ValueError("Invalid session review checklist.")
    sources = data.get("review_sources", [])
    if not isinstance(sources, list) or len(sources) > 700:
        raise ValueError("Use at most 700 wrap-up sources.")
    for source in sources:
        if not isinstance(source, dict) or set(source) != {"entry_id", "revision"}:
            raise ValueError("Invalid review source.")
        ref(
            source["entry_id"],
            campaign_scope=True,
            old=same_scope and source in previous.get("review_sources", []),
        )
        integer(source["revision"], "Source revision", 1, 1000000000)
    if data.get("wrap_up_note_id"):
        ref(
            data["wrap_up_note_id"],
            "wrap-up",
            True,
            data["wrap_up_note_id"] == previous.get("wrap_up_note_id"),
        )


def reader_data(data):
    for key in PRIVATE_KEYS:
        if data.get("continuity_type") or key in (
            "party_profiles",
            "party_location_id",
            "party_goals",
            "party_conditions",
            "continuity_graph",
            "continuity_dependencies",
            "wrap_up_note_id",
        ):
            data.pop(key, None)
    return data


def require_campaign(campaign):
    if campaign.kind != "campaign" or campaign.deleted_at:
        raise Http404()


def projection(campaign, session_id=""):
    from .campaigns import campaign_members
    from .graphs import graph_records
    from .services import connection_json, serialize
    from .workbench import decorated

    require_campaign(campaign)
    values = graph_records(campaign.world)
    scope = str(campaign.id)
    rows = {
        str(r.id): r
        for r in Resource.objects.filter(world=campaign.world, deleted_at=None)
    }
    local = [
        r
        for r in rows.values()
        if membership({"data": r.data, "parent": str(r.parent_id or "")}) == scope
        and r.id != campaign.id
    ]
    sessions = sorted(
        [r for r in local if r.kind == "session"],
        key=lambda r: (r.data.get("number", 1), str(r.id)),
    )
    session = next((r for r in sessions if str(r.id) == session_id), None)
    if session_id and not session:
        raise ValueError("Choose an available session in this campaign.")
    ids = campaign_members(values[scope], values) | {
        p["entry_id"] for p in campaign.data.get("party_profiles", [])
    }

    def full(row):
        return decorated(serialize(row, references=values), values, campaign.world)

    records = sorted(
        [r for r in local if r.kind in ("note", "task", "quest")],
        key=lambda r: (r.data.get("logged_on", str(r.updated_at)[:10]), r.updated_at),
        reverse=True,
    )
    if session_id:
        records = [
            r
            for r in records
            if r.data.get("session_id") == session_id
            or r.data.get("origin_session_id") == session_id
        ]
    items = [r for r in local if kindof(r) == "item"]
    media = [
        r
        for r in local
        if kindof(r) == "media-collection"
        and (not session_id or r.data.get("session_id") == session_id)
    ]
    quests = [
        r
        for r in local
        if kindof(r) in ("quest", "task", "campaign-scene", "encounter")
    ]
    cast = [r for key, r in rows.items() if key in ids and is_character(r)]
    locations = [r for key, r in rows.items() if key in ids and is_place(r)]
    edges = [
        e
        for e in Connection.objects.filter(world=campaign.world, deleted_at=None)
        if str(e.source_id) in ids or str(e.target_id) in ids
    ]
    totals = {
        "records": len(records),
        "items": len(items),
        "media": len(media),
        "quests": len(quests),
        "cast": len(cast),
        "locations": len(locations),
    }
    followups = [
        r
        for r in local
        if r.data.get("follow_up_state") in ("open", "scheduled")
        or r.kind == "task"
        and r.data.get("progress", "open") not in ("done", "failed")
        and r.data.get("follow_up_state") != "done"
    ]
    return {
        "campaign": full(campaign),
        "session": full(session) if session else None,
        "wrapup": full(rows[session.data["wrap_up_note_id"]])
        if session and session.data.get("wrap_up_note_id") in rows
        else None,
        "sessions": [serialize(r, full=False) for r in sessions],
        "cast": [full(r) for r in cast[:200]],
        "locations": [full(r) for r in locations[:200]],
        "items": [full(r) for r in items[:500]],
        "media": [full(r) for r in media[:200]],
        "quests": [full(r) for r in quests[:200]],
        "records": [full(r) for r in records[:500]],
        "relationships": [connection_json(e) for e in edges[:500]],
        "followups": [full(r) for r in followups[:200]],
        "totals": totals,
    }


def expected(row, value):
    from .services import Conflict

    if type(value) is not int or row.revision != value:
        raise Conflict(
            "This original changed. Your action was not applied; reload its current version."
        )


def text_document(text):
    from .services import short

    short(text, "Notes", 50000)
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]
        if text
        else [{"type": "paragraph"}],
    }


def owned_local(campaign, value, kind=None):
    identity(value)
    row = (
        Resource.objects.select_for_update()
        .filter(id=value, world=campaign.world, deleted_at=None)
        .first()
    )
    if (
        not row
        or kind
        and kindof(row) != kind
        or membership({"data": row.data, "parent": str(row.parent_id or "")})
        != str(campaign.id)
    ):
        raise ValueError("Choose an available original from this campaign.")
    return row


def act(campaign, payload):
    from .services import save_resource, short

    require_campaign(campaign)
    with transaction.atomic():
        campaign = Resource.objects.select_for_update().get(id=campaign.id)
        require_campaign(campaign)
        action = payload.get("action")
        if action == "party":
            expected(campaign, payload.get("expected_revision"))
            profiles = payload.get("profiles", campaign.data.get("party_profiles", []))
            data = {
                **campaign.data,
                "party_profiles": profiles,
                "party_location_id": payload.get(
                    "location_id", campaign.data.get("party_location_id", "")
                ),
                "party_goals": payload.get(
                    "goals", campaign.data.get("party_goals", "")
                ),
                "party_conditions": payload.get(
                    "conditions", campaign.data.get("party_conditions", "")
                ),
            }
            validate(
                "campaign",
                data,
                campaign.world,
                previous=campaign.data,
                resource_id=campaign.id,
            )
            # Preserve implicit existing PCs unless an explicit profile changes their role.
            role_ids = (
                {p.get("entry_id") for p in profiles if isinstance(p, dict)}
                if isinstance(profiles, list)
                else set()
            )
            data["party"] = (
                list(
                    dict.fromkeys(
                        [v for v in campaign.data.get("party", []) if v not in role_ids]
                        + [
                            p["entry_id"]
                            for p in profiles
                            if p.get("role") in ("pc", "companion")
                        ]
                    )
                )
                if isinstance(profiles, list)
                else []
            )
            result = save_resource(
                campaign.world,
                {"data": data, "expected_revision": campaign.revision},
                campaign,
            )
            return {"entry_id": str(result.id)}
        if action in ("transfer", "award", "adjust"):
            session_id = payload.get("session_id", "")
            if session_id:
                owned_local(campaign, session_id, "session")
            qty = integer(payload.get("quantity"), "Quantity", 1, 1000000)
            new = action == "award" and not payload.get("item_id")
            if new:
                expected(campaign, payload.get("campaign_revision"))
            token = WRITING_STOCK.set(True)
            try:
                if new:
                    item = save_resource(
                        campaign.world,
                        {
                            "kind": "article",
                            "template": "item",
                            "title": payload.get("title", ""),
                            "document": text_document(payload.get("description", "")),
                            "visibility": "private",
                            "parent": str(campaign.id),
                            "data": {
                                "continuity_type": "item",
                                "campaign_id": str(campaign.id),
                                "holdings": [],
                            },
                        },
                    )
                else:
                    item = owned_local(campaign, payload.get("item_id"), "item")
                    expected(item, payload.get("expected_revision"))
                holdings = {
                    h["holder_id"]: h["quantity"] for h in item.data.get("holdings", [])
                }
                source = (
                    payload.get("from_holder", "party")
                    if action == "transfer"
                    or action == "adjust"
                    and payload.get("direction") == "remove"
                    else ""
                )
                target = (
                    payload.get("to_holder", "party")
                    if action != "adjust" or payload.get("direction", "add") == "add"
                    else ""
                )
                if action == "adjust" and payload.get("direction", "add") not in (
                    "add",
                    "remove",
                ):
                    raise ValueError("Choose add or remove stock.")
                if source == target:
                    raise ValueError("Choose different source and destination holders.")
                if target and target != "party":
                    recipient = Resource.objects.filter(
                        id=identity(target), world=campaign.world, deleted_at=None
                    ).first()
                    if not recipient or not (
                        is_character(recipient) or is_place(recipient)
                    ):
                        raise ValueError(
                            "Choose an available character, location or party storage as recipient."
                        )
                if (
                    action == "transfer"
                    and (not source or not target)
                    or action == "award"
                    and not target
                ):
                    raise ValueError(
                        "Choose both holders for a transfer and a recipient for a reward."
                    )
                if source:
                    if holdings.get(source, 0) < qty:
                        raise ValueError(
                            "The source does not hold enough of this item."
                        )
                    holdings[source] -= qty
                if target:
                    holdings[target] = holdings.get(target, 0) + qty
                item = save_resource(
                    campaign.world,
                    {
                        "data": {
                            **item.data,
                            "holdings": [
                                {"holder_id": k, "quantity": v}
                                for k, v in holdings.items()
                            ],
                        },
                        "expected_revision": item.revision,
                    },
                    item,
                )
                ctype = {
                    "transfer": "transfer",
                    "award": "loot",
                    "adjust": "adjustment",
                }[action]
                movement = save_resource(
                    campaign.world,
                    {
                        "kind": "note",
                        "title": short(
                            payload.get("reason") or f"{ctype.title()}: {item.title}",
                            "Movement title",
                            180,
                            False,
                        ),
                        "document": text_document(payload.get("notes", "")),
                        "parent": str(campaign.id),
                        "visibility": "private",
                        "data": {
                            "continuity_type": ctype,
                            "campaign_id": str(campaign.id),
                            "session_id": session_id,
                            "record_type": "note",
                            "item_id": str(item.id),
                            "quantity": qty,
                            "from_holder": source,
                            "to_holder": target,
                            "related_entries": list(
                                dict.fromkeys(
                                    [str(item.id)]
                                    + [
                                        v
                                        for v in (source, target)
                                        if v
                                        and v != "party"
                                        and Resource.objects.filter(
                                            id=v, world=campaign.world, deleted_at=None
                                        ).exists()
                                    ]
                                )
                            ),
                        },
                    },
                )
                if new:
                    save_resource(
                        campaign.world,
                        {"data": campaign.data, "expected_revision": campaign.revision},
                        campaign,
                    )
                return {"entry_id": str(item.id), "movement_id": str(movement.id)}
            finally:
                WRITING_STOCK.reset(token)
        if action == "migrate-inventory":
            expected(campaign, payload.get("expected_revision"))
            old = campaign.data.get("inventory", [])
            if not old:
                raise ValueError("There is no legacy equipment to convert.")
            converted = []
            for raw in old[:100]:
                item = save_resource(
                    campaign.world,
                    {
                        "kind": "article",
                        "template": "item",
                        "title": raw["name"],
                        "document": text_document(str(raw.get("notes", ""))),
                        "visibility": "private",
                        "parent": str(campaign.id),
                        "data": {
                            "campaign_id": str(campaign.id),
                            "continuity_type": "item",
                            "legacy_item": raw,
                            "holdings": [
                                {
                                    "holder_id": "party",
                                    "quantity": raw.get("quantity", 1),
                                }
                            ],
                        },
                    },
                )
                converted.append(str(item.id))
            save_resource(
                campaign.world,
                {
                    "expected_revision": campaign.revision,
                    "data": {**campaign.data, "inventory": old[100:]},
                },
                campaign,
            )
            return {"converted_ids": converted}
        if action == "record":
            ctype = payload.get("type")
            if ctype not in (
                "progression",
                "consequence",
                "relationship-event",
                "journey",
                "place-status",
                "media-collection",
            ):
                raise ValueError("Choose a supported continuity note.")
            current = (
                owned_local(campaign, payload["entry_id"])
                if payload.get("entry_id")
                else None
            )
            if current:
                expected(current, payload.get("expected_revision"))
                if current.data.get("continuity_type") != ctype:
                    raise ValueError("Keep the original continuity type.")
            data = {
                **(current.data if current else {}),
                **payload.get("data", {}),
                "campaign_id": str(campaign.id),
                "continuity_type": ctype,
            }
            if ctype != "media-collection":
                data["record_type"] = "milestone" if ctype == "progression" else "note"
            related = list(data.get("related_entries", []))
            related.extend(data.get("affected_entries", []))
            if data.get("location_id"):
                related.append(data["location_id"])
            if ctype == "journey":
                related.extend(
                    p["location_id"]
                    for p in data.get("route_points", [])
                    if p.get("location_id")
                )
            if ctype == "relationship-event":
                edge = Connection.objects.filter(
                    id=identity(data.get("connection_id")),
                    world=campaign.world,
                    deleted_at=None,
                ).first()
                if not edge:
                    raise ValueError("Choose an available relationship.")
                related.extend([str(edge.source_id), str(edge.target_id)])
                if "relationship_change" in payload:
                    from .connection_history import save

                    change = payload["relationship_change"]
                    if not isinstance(change, dict) or set(change) - {
                        "expected_revision",
                        "label",
                        "strength",
                        "notes",
                    }:
                        raise ValueError("Invalid relationship development.")
                    save(campaign.world, change, edge.id)
            data["related_entries"] = list(dict.fromkeys(related))
            fields = {
                "title": payload.get("title", current.title if current else ""),
                "data": data,
            }
            if "text" in payload:
                fields["document"] = text_document(payload["text"])
            if current:
                fields["expected_revision"] = current.revision
            else:
                fields.update(
                    kind="article" if ctype == "media-collection" else "note",
                    template="generic",
                    parent=str(campaign.id),
                    visibility="private",
                )
            result = save_resource(campaign.world, fields, current)
            return {"entry_id": str(result.id)}
        if action == "wrap-up":
            session = owned_local(campaign, payload.get("session_id"), "session")
            expected(session, payload.get("expected_revision"))
            reviewed = payload.get("reviewed", {})
            if payload.get("complete") and (
                set(reviewed) != set(REVIEW_SECTIONS)
                or not all(v is True for v in reviewed.values())
            ):
                raise ValueError(
                    "Review all five sections before completing the session."
                )
            projection_value = projection(campaign, str(session.id))
            current_id = session.data.get("wrap_up_note_id")
            current = (
                owned_local(campaign, current_id, "wrap-up") if current_id else None
            )
            if current:
                expected(current, payload.get("note_revision"))
            source_rows = {
                r["id"]: r
                for r in projection_value["records"] + projection_value["followups"]
            }
            sources = [
                {"entry_id": r["id"], "revision": r["revision"]}
                for r in source_rows.values()
                if r["id"] != current_id
            ]
            note = save_resource(
                campaign.world,
                {
                    "kind": "note",
                    "title": f"Wrap-up: {session.title}"[:180],
                    "document": text_document(payload.get("text", "")),
                    "parent": str(campaign.id),
                    "visibility": "private",
                    "data": {
                        "continuity_type": "wrap-up",
                        "record_type": "note",
                        "campaign_id": str(campaign.id),
                        "session_id": str(session.id),
                        "reviewed": reviewed,
                        "review_sources": sources,
                    },
                    **({"expected_revision": current.revision} if current else {}),
                },
                current,
            )
            session = save_resource(
                campaign.world,
                {
                    "data": {
                        **session.data,
                        "campaign_id": str(campaign.id),
                        "wrap_up_note_id": str(note.id),
                        **(
                            {
                                "session_status": "completed",
                                "active_scene_id": "",
                                "agenda": [
                                    {
                                        **a,
                                        "state": "completed"
                                        if a["state"] == "active"
                                        else a["state"],
                                    }
                                    for a in session.data.get("agenda", [])
                                ],
                            }
                            if payload.get("complete")
                            else {}
                        ),
                    },
                    "expected_revision": session.revision,
                },
                session,
            )
            from .services import serialize

            return {
                "entry_id": str(note.id),
                "session": serialize(session),
                "note": serialize(note),
            }
        raise ValueError("Choose a supported campaign continuity action.")
