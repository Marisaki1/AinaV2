"""Private campaign desks, searchable records and original quest/thread guides."""

from uuid import UUID
from django.http import Http404
from .models import Resource
from .documents import plain_text
from .graphs import graph_records, reference
from .campaigns import campaign_members

PANELS = ("pins", "session", "capture", "notes", "threads", "maps")


def decorated(value, refs, world):
    import html
    from .auto_links import linker

    text = (
        linker(refs, exclude=value["id"])
        if world.data.get("auto_link_names", True) is not False
        else html.escape
    )
    value["workbench_sections"] = {
        key: text(value["data"][key]).replace("\n", "<br>")
        for key in (
            "prep",
            "recap",
            "consequences",
            "rewards",
            "next_steps",
            "outcome",
            "gm_next_step",
        )
        if isinstance(value["data"].get(key), str) and value["data"][key]
    }
    return value


def membership(value):
    identity = value["data"].get("campaign_id")
    return identity if identity is not None else value.get("parent") or ""


def validate_workspace(data, world, current=None, historical=False):
    from .services import short

    if "gm_workspace" not in data:
        return
    value = data["gm_workspace"]
    if not isinstance(value, dict) or set(value) - {"layouts", "selected_layout"}:
        raise ValueError("Choose a valid GM workspace.")
    layouts = value.get("layouts", [])
    if not isinstance(layouts, list) or len(layouts) > 12:
        raise ValueError("Use at most 12 saved GM layouts.")
    previous = current.data.get("gm_workspace") if current else None
    old = previous.get("layouts", []) if isinstance(previous, dict) else []
    old_refs = {
        v
        for layout in old
        for v in [
            layout.get("session_id"),
            *(pin.get("entry_id") for pin in layout.get("pins", [])),
        ]
        if v
    }

    def target(identity, session=False):
        try:
            if not isinstance(identity, str):
                raise ValueError()
            UUID(identity)
        except (ValueError, TypeError, AttributeError):
            raise ValueError("Choose a valid workspace reference.")
        row = Resource.objects.filter(world=world, id=identity).first()
        if not row or row.deleted_at and not historical and identity not in old_refs:
            raise ValueError(
                "Workspace references must belong to this world and be available."
            )
        if session and row.kind != "session":
            raise ValueError("Choose a session for this layout.")
        if session and not historical and identity not in old_refs:
            if not current or (
                row.data.get("campaign_id")
                if row.data.get("campaign_id") is not None
                else str(row.parent_id or "")
            ) != str(current.id):
                raise ValueError("Choose a session from this campaign.")

    ids = set()
    for layout in layouts:
        if not isinstance(layout, dict) or set(layout) - {
            "id",
            "name",
            "columns",
            "session_id",
            "panels",
            "pins",
        }:
            raise ValueError("Invalid saved layout.")
        short(layout.get("id"), "Layout ID", 80, False)
        if layout["id"] in ids:
            raise ValueError("Layout IDs must be unique.")
        ids.add(layout["id"])
        short(layout.get("name"), "Layout name", 80, False)
        if type(layout.get("columns")) is not int or layout["columns"] not in (1, 2, 3):
            raise ValueError("Choose one, two or three desk columns.")
        if layout.get("session_id"):
            target(layout["session_id"], True)
        elif not isinstance(layout.get("session_id", ""), str):
            raise ValueError("Choose a layout session.")
        panels = layout.get("panels", [])
        if not isinstance(panels, list) or len(panels) > len(PANELS):
            raise ValueError("Choose valid desk panels.")
        panel_ids = set()
        for panel in panels:
            if (
                not isinstance(panel, dict)
                or set(panel) != {"kind", "collapsed"}
                or panel.get("kind") not in PANELS
                or type(panel.get("collapsed")) is not bool
                or panel["kind"] in panel_ids
            ):
                raise ValueError("Desk panels must be unique and valid.")
            panel_ids.add(panel["kind"])
        pins = layout.get("pins", [])
        if not isinstance(pins, list) or len(pins) > 40:
            raise ValueError("Pin at most 40 references per layout.")
        pin_ids = set()
        for pin in pins:
            if (
                not isinstance(pin, dict)
                or set(pin) != {"entry_id", "wide"}
                or type(pin.get("wide")) is not bool
            ):
                raise ValueError("Invalid pinned reference.")
            target(pin["entry_id"])
            if pin["entry_id"] in pin_ids:
                raise ValueError("Do not pin the same reference twice.")
            pin_ids.add(pin["entry_id"])
    if value.get("selected_layout", "") not in ids | {""}:
        raise ValueError("Choose an existing saved layout.")


def campaign_workbench(resource, query):
    from .services import serialize

    if resource.kind != "campaign" or resource.deleted_at:
        raise Http404()
    values = graph_records(resource.world)
    campaign = values[str(resource.id)]
    identity = campaign["id"]
    floor = query.get("floor", "")
    floor_scope = None
    if floor:
        from .floor_scope import FloorScope

        floor_scope = FloorScope(values, identity, floor)
    records = [
        v
        for v in values.values()
        if v["kind"] in ("note", "session", "quest", "task")
        and (
            membership(v) == identity
            or floor_scope and v["id"] in floor_scope.membership
        )
    ]
    sessions = sorted(
        (v for v in records if v["kind"] == "session"),
        key=lambda v: (v["data"].get("number", 1), v["id"]),
        reverse=True,
    )
    session_id = query.get("session", "")
    if session_id and not any(v["id"] == session_id for v in sessions):
        raise ValueError("Choose an available session in this campaign.")
    category = query.get("category", "all")
    if category not in ("all", "notes", "threads"):
        raise ValueError("Choose notes, threads or all records.")
    record_type = query.get("type", "")
    if record_type not in (
        "",
        "note",
        "journal",
        "milestone",
        "session",
        "quest",
        "task",
    ):
        raise ValueError("Choose a valid record type.")
    needle = query.get("q", "").strip().casefold()
    if len(needle) > 300:
        raise ValueError("Search text is too long.")
    try:
        offset = int(query.get("offset", "0"))
        if offset < 0 or offset > 1000000:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError("Choose a valid record offset.")
    scoped = [
        v
        for v in records
        if (not session_id or v["id"] == session_id or v["data"].get("session_id") == session_id)
        and (
            not floor_scope
            or (
                floor_scope.includes(v["id"])
                and v["data"].get("record_type") != "campaign-floor"
            )
        )
    ]
    scoped.sort(
        key=lambda v: (
            str(v["data"].get("logged_on") or v["updated_at"])[:10],
            v["updated_at"],
            v["id"],
        ),
        reverse=True,
    )
    selected = [
        v
        for v in scoped
        if (category != "notes" or v["kind"] in ("note", "session"))
        and (category != "threads" or v["kind"] in ("quest", "task"))
    ]
    if record_type:
        selected = [
            v
            for v in selected
            if (
                v["data"].get("record_type", "note")
                if v["kind"] == "note"
                else v["kind"]
            )
            == record_type
        ]
    arc = query.get("arc", "")
    if len(arc) > 180:
        raise ValueError("Story arc filter is too long.")
    if arc:
        selected = [v for v in selected if v["data"].get("story_arc") == arc]
    rows = {
        str(r.id): r
        for r in Resource.objects.filter(world=resource.world, deleted_at=None)
    }
    if needle:
        import json

        selected = [
            v
            for v in selected
            if needle
            in (
                v["title"]
                + " "
                + v["summary"]
                + " "
                + plain_text(rows[v["id"]].document)
                + " "
                + " ".join(v["tags"])
                + " "
                + json.dumps(v["data"], ensure_ascii=False)
            ).casefold()
        ]

    def full(v):
        return decorated(
            serialize(rows[v["id"]], references=values), values, resource.world
        )

    settings = resource.data.get("gm_workspace", {"layouts": [], "selected_layout": ""})
    layout_id = query.get("layout") or settings.get("selected_layout", "")
    layout = next(
        (v for v in settings.get("layouts", []) if v["id"] == layout_id), None
    )
    if query.get("layout") and not layout:
        raise ValueError("Choose an existing layout.")
    if not layout and settings.get("layouts"):
        layout = settings["layouts"][0]
    pins = []
    for pin in (layout or {}).get("pins", []):
        value = values.get(pin["entry_id"])
        available = value and (
            value["kind"] not in ("note", "session", "task", "quest")
            or membership(value) == identity
        )
        pins.append({**pin, "entry": full(value) if available else None})
    return {
        "campaign": full(campaign),
        "sessions": sessions,
        "pins": pins,
        "records": [full(v) for v in selected[offset : offset + 100]],
        "total": len(selected),
        "offset": offset,
        "has_more": offset + 100 < len(selected),
        "lane_counts": {
            p: sum(
                v["kind"] in ("quest", "task")
                and (
                    v["data"].get("progress")
                    if v["data"].get("progress") in ("open", "active", "done", "failed")
                    else "open"
                )
                == p
                for v in selected
            )
            for p in ("open", "active", "done", "failed")
        },
        "recent_notes": [
            full(v) for v in [v for v in scoped if v["kind"] in ("note", "session")][:8]
        ],
        "open_threads": [
            full(v)
            for v in [
                v
                for v in scoped
                if v["kind"] in ("quest", "task")
                and v["data"].get("progress", "open") not in ("done", "failed")
            ][:12]
        ],
        "maps": [
            reference(values[key])
            for key in campaign_members(campaign, values)
            if values[key]["kind"] == "map"
        ],
    }


def thread_guide(resource, reader=False):
    from .services import serialize, public_references

    values = graph_records(resource.world, reader)
    root = values.get(str(resource.id))
    if not root or root["kind"] not in ("quest", "task"):
        raise Http404()
    refs = public_references(resource.world) if reader else values
    rows = {
        str(r.id): r
        for r in Resource.objects.filter(world=resource.world, deleted_at=None)
    }
    records = [
        v
        for v in values.values()
        if v["kind"] in ("note", "session")
        and membership(v) == membership(root)
        and (
            v["data"].get("thread_id") == root["id"]
            or root["id"] in v["data"].get("related_entries", [])
        )
    ]
    records.sort(key=lambda v: (v["updated_at"], v["id"]), reverse=True)
    return {
        "thread": decorated(
            serialize(resource, reader=reader, references=refs), refs, resource.world
        ),
        "campaign": reference(values[membership(root)])
        if membership(root) in values and values[membership(root)]["kind"] == "campaign"
        else None,
        "records": [
            decorated(
                serialize(rows[v["id"]], reader=reader, references=refs),
                refs,
                resource.world,
            )
            for v in records[:100]
        ],
        "record_total": len(records),
        "related": [
            reference(values[key])
            for key in root["data"].get("related_entries", [])
            if key in values
        ],
    }
