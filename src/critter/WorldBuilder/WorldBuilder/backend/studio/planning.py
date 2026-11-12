"""Campaign adventure planning, per-session running and deliberate handoffs."""

import base64
import html
import math
import re
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.http import Http404

from .documents import plain_text
from .graphs import graph_records
from .models import Activity, Asset, Resource
from .workbench import decorated, membership

TYPES = ("adventure", "campaign-scene", "encounter", "handout")
SCENES = ("campaign-scene", "encounter")
AGENDA_TYPES = (*SCENES, "note", "task", "quest")
STATES = ("planned", "active", "paused", "completed", "skipped")
GM_FIELDS = (
    "stakes",
    "environment",
    "possible_outcomes",
    "branch_notes",
    "agenda",
    "active_scene_id",
    "handoff_target_id",
    "follow_up_state",
    "follow_up_session_id",
    "origin_session_id",
    "next_scenes",
    "prerequisites",
    "scene_ids",
)


def validate_planning(kind, data, world, historical=False, previous=None):
    from .services import short

    previous = previous or {}
    old_scope = not previous.get("campaign_id") or previous.get(
        "campaign_id"
    ) == data.get("campaign_id")
    if data.get("planning_type") and (
        kind != "article" or data["planning_type"] not in TYPES
    ):
        raise ValueError("Choose a supported campaign planning record.")
    if kind not in ("article", "session", "note", "task", "quest"):
        return
    for key in (
        "stakes",
        "environment",
        "possible_outcomes",
        "branch_notes",
        "public_summary",
        "handout_text",
    ):
        if key in data:
            short(data[key], key.replace("_", " "), 50000)
    if "follow_up_state" in data and data["follow_up_state"] not in (
        "",
        "open",
        "scheduled",
        "done",
    ):
        raise ValueError("Choose an open, scheduled or completed follow-up.")

    def target(identity, types=None, old=None):
        if not isinstance(identity, str):
            raise TypeError("Choose a valid planning reference.")
        try:
            UUID(identity)
        except (ValueError, AttributeError):
            raise ValueError("Choose a valid planning reference.")
        row = Resource.objects.filter(world=world, id=identity).first()
        unchanged = identity in (old or [])
        if not row or row.deleted_at and not historical and not unchanged:
            raise ValueError(
                "Planning references must belong to this world and be available."
            )
        if (
            types
            and not historical
            and not unchanged
            and row.data.get("planning_type", row.kind) not in types
        ):
            raise ValueError("Choose the expected planning record type.")
        if (
            not historical
            and not unchanged
            and (
                row.data.get("campaign_id")
                if row.data.get("campaign_id") is not None
                else str(row.parent_id or "")
            )
            != data.get("campaign_id", "")
        ):
            raise ValueError("Choose a planning reference from this campaign.")
        return row

    for key, types in (
        ("scene_id", SCENES),
        ("adventure_id", ("adventure",)),
        ("follow_up_session_id", ("session",)),
        ("origin_session_id", ("session",)),
        ("handoff_target_id", ("session",)),
    ):
        if data.get(key):
            target(
                data[key],
                types,
                [previous.get(key)]
                if previous.get("campaign_id") == data.get("campaign_id")
                else [],
            )
    for key in ("scene_ids", "prerequisites"):
        ids = data.get(key, [])
        if (
            not isinstance(ids, list)
            or len(ids) > 200
            or any(not isinstance(v, str) for v in ids)
            or len(set(ids)) != len(ids)
        ):
            raise ValueError("Choose at most 200 different scenes.")
        for identity in ids:
            target(identity, SCENES, previous.get(key, []) if old_scope else [])
    branches = data.get("next_scenes", [])
    if not isinstance(branches, list) or len(branches) > 40:
        raise ValueError("Use at most 40 scene branches.")
    seen = set()
    for branch in branches:
        if not isinstance(branch, dict) or set(branch) != {
            "target_id",
            "label",
            "condition",
        }:
            raise ValueError("Invalid scene branch.")
        target(
            branch["target_id"],
            SCENES,
            [b.get("target_id") for b in previous.get("next_scenes", [])]
            if old_scope
            else [],
        )
        short(branch["label"], "Branch label", 180)
        short(branch["condition"], "Branch condition", 2000)
        if branch["target_id"] in seen:
            raise ValueError("Each branch target must be unique.")
        seen.add(branch["target_id"])
    agenda = data.get("agenda", [])
    if not isinstance(agenda, list) or len(agenda) > 200:
        raise ValueError("Use at most 200 agenda items.")
    seen = set()
    active = []
    for item in agenda:
        if (
            not isinstance(item, dict)
            or set(item) != {"entry_id", "state", "notes"}
            or item.get("state") not in STATES
        ):
            raise ValueError("Invalid session agenda item.")
        target(
            item["entry_id"],
            AGENDA_TYPES,
            [v.get("entry_id") for v in previous.get("agenda", [])]
            if old_scope
            else [],
        )
        short(item["notes"], "Agenda notes", 10000)
        if item["entry_id"] in seen:
            raise ValueError("A scene can appear only once in a session agenda.")
        seen.add(item["entry_id"])
        if item["state"] == "active":
            active.append(item["entry_id"])
    if len(active) > 1 or (data.get("active_scene_id") or "") != (
        active[0] if active else ""
    ):
        raise ValueError("The current scene must match the single active agenda item.")
    for key, limit in (("handout_sources", 30), ("handout_images", 10)):
        ids = data.get(key, [])
        if (
            not isinstance(ids, list)
            or len(ids) > limit
            or any(not isinstance(v, str) for v in ids)
            or len(set(ids)) != len(ids)
        ):
            raise ValueError("Choose distinct handout sources/images within the limit.")
        for identity in ids:
            try:
                UUID(identity)
            except (ValueError, TypeError, AttributeError):
                raise ValueError("Choose a valid handout source.")
            model = Asset if key == "handout_images" else Resource
            if not model.objects.filter(world=world, id=identity).exists():
                raise ValueError("Handout sources must belong to this world.")
    if "positions" in data and data.get("planning_type") == "adventure":
        positions = data["positions"]
        if not isinstance(positions, dict) or len(positions) > 200:
            raise ValueError("Invalid scene diagram positions.")
        for identity, point in positions.items():
            target(identity, SCENES, previous.get("positions", {}) if old_scope else {})
            if not isinstance(point, dict) or set(point) != {"x", "y"}:
                raise ValueError("Invalid scene diagram point.")
            for coordinate in point.values():
                if (
                    isinstance(coordinate, bool)
                    or not isinstance(coordinate, (int, float))
                    or not math.isfinite(coordinate)
                    or abs(coordinate) > 100000
                ):
                    raise ValueError("Invalid scene position.")


def reader_planning(data, refs):
    for key in GM_FIELDS:
        data.pop(key, None)
    for key in ("scene_id", "adventure_id"):
        if data.get(key) not in refs:
            data.pop(key, None)
    for key in ("scene_ids", "prerequisites", "handout_sources"):
        if key in data:
            data[key] = [v for v in data[key] if v in refs]
    if "next_scenes" in data:
        data["next_scenes"] = [
            {"target_id": v["target_id"], "label": v["label"]}
            for v in data["next_scenes"]
            if v["target_id"] in refs
        ]
    if data.get("planning_type") == "adventure":
        data.pop("positions", None)
    return data


def lifecycle(resource, session_id="", q="", person="", place="", thread=""):
    from .services import serialize

    if resource.kind != "campaign" or resource.deleted_at:
        raise Http404()
    values = graph_records(resource.world)
    identity = str(resource.id)
    records = [
        v for v in values.values() if membership(v) == identity and v["id"] != identity
    ]
    sessions = sorted(
        [v for v in records if v["kind"] == "session"],
        key=lambda v: (v["data"].get("number", 1), v["id"]),
    )
    current = next((v for v in sessions if v["id"] == session_id), None)
    if session_id and not current:
        raise ValueError("Choose an available campaign session.")
    rows = {
        str(r.id): r
        for r in Resource.objects.filter(world=resource.world, deleted_at=None)
    }

    def full(v):
        return decorated(
            serialize(rows[v["id"]], references=values), values, resource.world
        )

    planning = [v for v in records if v["data"].get("planning_type") in TYPES]
    journal = [v for v in records if v["kind"] in ("note", "session", "task", "quest")]
    if session_id:
        journal = [
            v
            for v in journal
            if v["id"] == session_id or v["data"].get("session_id") == session_id
        ]
    if len(q) > 300:
        raise ValueError("Search text is too long.")
    for ref in (person, place, thread):
        if ref:
            journal = [
                v
                for v in journal
                if ref in v["data"].get("related_entries", [])
                or v["data"].get("thread_id") == ref
                or v["data"].get("link_id") == ref
            ]
    if q:
        journal = [
            v
            for v in journal
            if q.casefold()
            in (
                v["title"]
                + " "
                + v["summary"]
                + " "
                + plain_text(rows[v["id"]].document)
            ).casefold()
        ]
    journal.sort(
        key=lambda v: (
            str(v["data"].get("logged_on") or v["updated_at"])[:10],
            v["updated_at"],
            v["id"],
        ),
        reverse=True,
    )
    followups = [
        v
        for v in records
        if v["data"].get("follow_up_state") in ("open", "scheduled")
        or v["kind"] == "task"
        and v["data"].get("progress", "open") not in ("done", "failed")
        and v["data"].get("follow_up_state") != "done"
    ]
    activity_ids = {v["id"] for v in journal}
    if not (person or place or thread or q):
        activity_ids.update(
            v["id"]
            for v in planning
            if not current
            or any(a["entry_id"] == v["id"] for a in current["data"].get("agenda", []))
        )
    activity = list(
        Activity.objects.filter(
            world=resource.world, data__resource_id__in=list(activity_ids)
        )
        .order_by("-created_at")
        .values("kind", "title", "data", "created_at")[:100]
    )
    return {
        "campaign": full(values[identity]),
        "sessions": sessions,
        "session": full(current) if current else None,
        "planning": [full(v) for v in planning[:500]],
        "planning_total": len(planning),
        "journal": [full(v) for v in journal[:200]],
        "journal_total": len(journal),
        "followups": [full(v) for v in followups[:200]],
        "followup_total": len(followups),
        "activity": activity,
    }


def recap_draft(session, ids):
    if session.kind != "session":
        raise Http404()
    if (
        not isinstance(ids, list)
        or len(ids) > 100
        or any(not isinstance(v, str) for v in ids)
    ):
        raise ValueError("Select at most 100 recap records.")
    text = []
    for identity in dict.fromkeys(ids):
        row = Resource.objects.filter(
            world=session.world, id=identity, deleted_at=None
        ).first()
        if (
            not row
            or (
                row.data.get("campaign_id")
                if row.data.get("campaign_id") is not None
                else str(row.parent_id or "")
            )
            != (
                session.data.get("campaign_id")
                if session.data.get("campaign_id") is not None
                else str(session.parent_id or "")
            )
            or row.data.get("session_id") != str(session.id)
        ):
            raise ValueError("Choose records from this session.")
        body = row.data.get("public_summary") or plain_text(row.document, True)
        if body:
            text.append(row.title + "\n" + body)
    return {"text": "\n\n".join(text), "source_ids": list(dict.fromkeys(ids))}


def handoff(source, payload):
    from .services import Conflict, save_resource

    if source.kind != "session":
        raise Http404()
    with transaction.atomic():
        source = Resource.objects.select_for_update().get(id=source.id)
        if payload.get("expected_revision") != source.revision:
            raise Conflict("The source session changed. Reload before handing off.")
        campaign = (
            source.data.get("campaign_id")
            if source.data.get("campaign_id") is not None
            else str(source.parent_id or "")
        )
        if not campaign:
            raise ValueError("Assign the source session to a campaign first.")
        selected = payload.get("entry_ids", payload.get("scene_ids", []))
        followups = payload.get("followup_ids", [])
        if (
            not isinstance(selected, list)
            or not isinstance(followups, list)
            or len(selected) > 200
            or len(followups) > 200
            or any(not isinstance(v, str) for v in selected + followups)
        ):
            raise ValueError("Choose valid handoff items.")
        source_items = {v["entry_id"]: v for v in source.data.get("agenda", [])}
        if any(
            v not in source_items or source_items[v]["state"] == "completed"
            for v in selected
        ):
            raise ValueError("Choose unfinished source agenda items.")
        target_id = payload.get("target_id")
        if target_id:
            target = (
                Resource.objects.select_for_update()
                .filter(
                    id=target_id, world=source.world, kind="session", deleted_at=None
                )
                .first()
            )
            if (
                not target
                or target.id == source.id
                or (
                    target.data.get("campaign_id")
                    if target.data.get("campaign_id") is not None
                    else str(target.parent_id or "")
                )
                != campaign
            ):
                raise ValueError("Choose a different session in this campaign.")
            if payload.get("target_revision") != target.revision:
                raise Conflict("The target session changed. Reload before handing off.")
        else:
            number = (
                max(
                    [
                        int(r.data.get("number", 1))
                        for r in Resource.objects.filter(
                            world=source.world, kind="session", deleted_at=None
                        )
                        if (
                            r.data.get("campaign_id")
                            if r.data.get("campaign_id") is not None
                            else str(r.parent_id or "")
                        )
                        == campaign
                    ]
                    or [0]
                )
                + 1
            )
            target = save_resource(
                source.world,
                {
                    "kind": "session",
                    "title": payload.get("title") or f"Session {number}",
                    "parent": campaign,
                    "data": {
                        "campaign_id": campaign,
                        "number": number,
                        "session_status": "planned",
                    },
                    "visibility": "private",
                },
            )
        agenda = list(target.data.get("agenda", []))
        existing = {v["entry_id"] for v in agenda}
        for identity in dict.fromkeys(selected):
            row = Resource.objects.filter(
                id=identity, world=source.world, deleted_at=None
            ).first()
            if not row:
                raise ValueError("A selected scene is unavailable.")
            if identity not in existing:
                agenda.append(
                    {
                        "entry_id": identity,
                        "state": "planned",
                        "notes": source_items[identity]["notes"],
                    }
                )
        target = save_resource(
            source.world,
            {
                "data": {**target.data, "campaign_id": campaign, "agenda": agenda},
                "expected_revision": target.revision,
            },
            target,
        )
        for identity in dict.fromkeys(followups):
            row = (
                Resource.objects.select_for_update()
                .filter(id=identity, world=source.world, deleted_at=None)
                .first()
            )
            if (
                not row
                or (
                    row.data.get("campaign_id")
                    if row.data.get("campaign_id") is not None
                    else str(row.parent_id or "")
                )
                != campaign
            ):
                raise ValueError("Choose follow-ups in this campaign.")
            row = save_resource(
                source.world,
                {
                    "data": {
                        **row.data,
                        "campaign_id": campaign,
                        "follow_up_state": "scheduled",
                        "follow_up_session_id": str(target.id),
                    },
                    "expected_revision": row.revision,
                },
                row,
            )
        source = save_resource(
            source.world,
            {
                "data": {
                    **source.data,
                    "campaign_id": campaign,
                    "handoff_target_id": str(target.id),
                },
                "expected_revision": source.revision,
            },
            source,
        )
        return {
            "target_id": str(target.id),
            "source_revision": source.revision,
            "target_revision": target.revision,
        }


def followup_task(source, payload):
    from .services import Conflict, save_resource

    with transaction.atomic():
        source = Resource.objects.select_for_update().get(id=source.id)
        if payload.get("expected_revision") != source.revision:
            raise Conflict("This follow-up changed. Reload first.")
        if source.data.get("follow_up_state") == "done":
            raise ValueError("This follow-up is already handled.")
        campaign = (
            source.data.get("campaign_id")
            if source.data.get("campaign_id") is not None
            else str(source.parent_id or "")
        )
        if not campaign:
            raise ValueError("Choose a campaign record.")
        document = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "resourceLink",
                            "attrs": {"id": str(source.id), "label": source.title},
                        }
                    ],
                }
            ],
        }
        task = save_resource(
            source.world,
            {
                "kind": "task",
                "title": payload.get("title") or "Follow-up task",
                "document": document,
                "parent": campaign,
                "visibility": "private",
                "data": {
                    "campaign_id": campaign,
                    "session_id": source.data.get("follow_up_session_id", ""),
                    "origin_session_id": source.data.get("session_id", ""),
                    "related_entries": [str(source.id)],
                    "progress": "open",
                    "follow_up_state": "open",
                },
            },
        )
        save_resource(
            source.world,
            {
                "data": {**source.data, "follow_up_state": "done"},
                "expected_revision": source.revision,
            },
            source,
        )
        return {"task_id": str(task.id)}


def handout_preview(resource, reader=False, export=False):
    from .auto_links import linker
    from .services import public_references, serialize

    if resource.deleted_at:
        raise Http404()
    own = (
        serialize(resource, reader=reader)
        if reader
        else {"title": resource.title, "data": resource.data}
    )
    if not own or own["data"].get("planning_type") != "handout":
        raise Http404()
    refs = public_references(resource.world)
    data = own["data"]
    sections = []
    omitted = 0
    for identity in data.get("handout_sources", []):
        row = Resource.objects.filter(
            world=resource.world, id=identity, deleted_at=None
        ).first()
        value = serialize(row, reader=True, references=refs) if row else None
        if not value:
            omitted += 1
            continue
        sections.append(
            {
                "title": value["title"],
                "html": value.get("html", "")
                + "".join(
                    "<p>"
                    + linker(refs, exclude=identity)(value["data"][key]).replace(
                        "\n", "<br>"
                    )
                    + "</p>"
                    for key in ("recap", "rewards", "outcome", "public_summary")
                    if isinstance(value["data"].get(key), str) and value["data"][key]
                ),
            }
        )
    images = []
    for image in Asset.objects.filter(
        world=resource.world, id__in=data.get("handout_images", [])
    ):
        images.append({"url": "/media/" + str(image.id), "name": "Handout image"})
    intro = linker(refs, exclude=str(resource.id))(
        data.get("handout_text", "")
    ).replace("\n", "<br>")
    result = {
        "title": own["title"],
        "intro": intro,
        "sections": sections,
        "images": images,
        "omitted": omitted,
    }
    if not export:
        return result
    body = (
        "<h1>"
        + html.escape(own["title"])
        + "</h1><p>"
        + intro
        + "</p>"
        + "".join(
            "<section><h2>"
            + html.escape(s["title"])
            + "</h2>"
            + s["html"]
            + "</section>"
            for s in sections
        )
        + "".join(
            '<figure><img src="'
            + i["url"]
            + '" alt="'
            + html.escape(i["name"], quote=True)
            + '"></figure>'
            for i in images
        )
    )
    total = 0

    def embed(match):
        nonlocal total
        image = Asset.objects.filter(world=resource.world, id=match.group(1)).first()
        if not image:
            return ""
        content = (settings.MEDIA_ROOT / image.storage_name).read_bytes()
        total += len(content)
        if total > 30 * 1024 * 1024:
            raise ValueError("The selected handout images exceed 30 MB.")
        return "data:" + image.mime + ";base64," + base64.b64encode(content).decode()

    body = re.sub(r"/media/([0-9a-f-]{36})", embed, body)
    return (
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
        + html.escape(own["title"])
        + "</title><style>body{font:17px Georgia,serif;max-width:900px;margin:40px auto;padding:20px;line-height:1.7}img{max-width:100%;height:auto}section{margin:30px 0}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}</style></head><body>"
        + body
        + "</body></html>"
    )
