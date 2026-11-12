"""A session desk over original, audience-projected campaign records."""

import html
from django.http import Http404
from .auto_links import linker
from .graphs import graph_records, reference
from .models import Resource


def membership(value):
    identity = value["data"].get("campaign_id")
    return identity if identity is not None else value.get("parent") or ""


def linked_ids(value):
    ids = value["data"].get("related_entries", [])
    return (
        {key for key in ids if isinstance(key, str)} if isinstance(ids, list) else set()
    )


def session_guide(resource, reader=False):
    from .services import public_references, serialize

    values = graph_records(resource.world, reader)
    identity = str(resource.id)
    current = values.get(identity)
    if not current or current["kind"] != "session":
        raise Http404()
    refs = public_references(resource.world) if reader else values
    rows = {
        str(row.id): row
        for row in Resource.objects.filter(world=resource.world, deleted_at=None)
    }
    campaign_id = membership(current)
    campaign = values.get(campaign_id)
    if campaign and campaign["kind"] != "campaign":
        campaign = None
    linked = linked_ids(current)
    records = []
    for key, value in values.items():
        if value["kind"] not in ("note", "task", "quest", "event"):
            continue
        if membership(value) != campaign_id:
            continue
        assigned = value["data"].get("session_id")
        if assigned == identity or key in linked and not assigned:
            records.append(serialize(rows[key], reader=reader, references=refs))
    records.sort(
        key=lambda value: (
            str(value["data"].get("logged_on") or value["updated_at"])[:10],
            value["updated_at"],
            value["id"],
        ),
        reverse=True,
    )
    for value in records:
        linked.update(linked_ids(value))
        if isinstance(value["data"].get("link_id"), str):
            linked.add(value["data"]["link_id"])
    party = set(campaign["data"].get("party", [])) if campaign else set()
    linked.update(party)
    cards = [
        {
            **reference(values[key]),
            "summary": values[key]["summary"],
            "portrait_asset_id": values[key]["data"].get("cover_asset", ""),
                "portrait_url": values[key]["data"].get("cover_url", ""),
            "association": "party" if key in party else "linked",
        }
        for key in linked & set(values)
        if values[key]["kind"]
        not in (
            "session",
            "note",
            "task",
            "quest",
            "event",
            "campaign",
            "folder",
            "map",
        )
    ]
    cards.sort(key=lambda value: (value["title"].casefold(), value["id"]))
    locations = []
    seen = set()
    for value in [current, *records]:
        map_id = value["data"].get("map_id")
        marker_id = value["data"].get("marker_id", "")
        target = values.get(map_id) if isinstance(map_id, str) else None
        marker_id = marker_id if isinstance(marker_id, str) else ""
        if target and target["kind"] == "map" and (map_id, marker_id) not in seen:
            seen.add((map_id, marker_id))
            marker = next(
                (m for m in target["data"].get("markers", []) if m["id"] == marker_id),
                None,
            )
            locations.append(
                {
                    "map": reference(target),
                    "asset_id": target["data"].get("asset_id", ""),
                    "marker_id": marker_id if marker else "",
                    "label": marker.get("label", "Unnamed location")
                    if marker
                    else "Whole map",
                }
            )
    for key in sorted(linked & set(values)):
        target = values[key]
        if target["kind"] == "map" and not any(
            row["map"]["id"] == key for row in locations
        ):
            locations.append(
                {
                    "map": reference(target),
                    "asset_id": target["data"].get("asset_id", ""),
                    "marker_id": "",
                    "label": "Whole map",
                }
            )
    sessions = sorted(
        (
            v
            for v in values.values()
            if campaign and v["kind"] == "session" and membership(v) == campaign_id
        ),
        key=lambda v: (v["data"].get("number", 1), v["id"]),
    )
    index = next((n for n, v in enumerate(sessions) if v["id"] == identity), -1)
    previous = sessions[index - 1] if index > 0 else None
    following = (
        sessions[index + 1] if index >= 0 and index + 1 < len(sessions) else None
    )
    text_linker = (
        linker(refs, exclude=identity)
        if resource.world.data.get("auto_link_names", True) is not False
        else html.escape
    )
    sections = {
        key: text_linker(current["data"][key]).replace("\n", "<br>")
        for key in ("prep", "recap", "consequences", "rewards", "next_steps")
        if isinstance(current["data"].get(key), str) and current["data"][key]
    }
    return {
        "session": serialize(resource, reader=reader, references=refs),
        "campaign": reference(campaign) if campaign else None,
        "sections": sections,
        "records": records[:200],
        "record_total": len(records),
        "cast": cards[:100],
        "cast_total": len(cards),
        "locations": locations[:100],
        "location_total": len(locations),
        "previous": reference(previous) if previous else None,
        "following": reference(following) if following else None,
        "previous_follow_up": previous["data"].get("next_steps", "")
        if previous and not reader
        else "",
    }
