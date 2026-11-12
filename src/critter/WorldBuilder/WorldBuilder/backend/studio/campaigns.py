"""Campaign records use ordinary versioned entries, with validated connections."""

from datetime import date
from .models import Resource
from .tools import integer


def validate_campaign_record(kind, data, world, historical=False, previous=None):
    from .services import short

    previous = previous or {}
    if kind not in ("campaign", "session", "note", "task", "quest") and not (
        kind == "article" and data.get("planning_type")
    ):
        return
    if kind in ("quest", "task"):
        for key in ("story_arc", "outcome", "gm_next_step"):
            if key in data:
                short(
                    data[key],
                    key.replace("_", " "),
                    180 if key == "story_arc" else 50000,
                )
        objectives = data.get("objectives", [])
        if not isinstance(objectives, list) or len(objectives) > 100:
            raise ValueError("Use at most 100 thread objectives.")
        ids = set()
        for objective in objectives:
            if not isinstance(objective, dict) or set(objective) != {
                "id",
                "text",
                "done",
            }:
                raise ValueError("Invalid thread objective.")
            short(objective["id"], "Objective ID", 80, False)
            short(objective["text"], "Objective text", 5000, False)
            if objective["id"] in ids or type(objective["done"]) is not bool:
                raise ValueError(
                    "Objectives need unique IDs and checked/unchecked states."
                )
            ids.add(objective["id"])
    for key in ("prep", "recap", "consequences", "next_steps", "rewards"):
        if key in data:
            short(data[key], key.replace("_", " ").title(), 50000)
    for key in ("world_day",):
        if key in data:
            short(data[key], "In-world day", 120)
    if "logged_on" in data:
        short(data["logged_on"], "Journal date", 10)
    if data.get("logged_on"):
        try:
            value = date.fromisoformat(data["logged_on"])
            if value.isoformat() != data["logged_on"]:
                raise ValueError
        except (TypeError, ValueError):
            raise ValueError("Choose a valid journal date (YYYY-MM-DD).")
    if kind == "note" and data.get("record_type", "note") not in (
        "note",
        "journal",
        "milestone",
    ):
        raise ValueError("Choose a note, journal entry or milestone.")
    if kind == "session":
        if "number" in data:
            integer(data["number"], "Session number", 1, 1000000)
        if data.get("session_status", "planned") not in (
            "planned",
            "in_progress",
            "completed",
            "cancelled",
        ):
            raise ValueError("Choose a supported session status.")
    references = {}
    for key, expected in (
        ("campaign_id", "campaign"),
        ("session_id", "session"),
        ("map_id", "map"),
    ):
        identity = data.get(key)
        if key == "map_id" and key in data and not isinstance(identity, str):
            raise ValueError("Choose a valid map.")
        if not identity:
            continue
        if not isinstance(identity, str):
            raise ValueError("Choose a valid campaign or session.")
        target = Resource.objects.filter(
            id=identity, world=world, kind=expected
        ).first()
        unchanged = identity == previous.get(key)
        if target is None or (target.deleted_at and not historical and not unchanged):
            raise ValueError("Choose an available " + expected + " from this world.")
        references[key] = target
    if "marker_id" in data:
        short(data["marker_id"], "Map location", 100)
    if data.get("marker_id"):
        target = references.get("map_id")
        unchanged = data.get("map_id") == previous.get("map_id") and data[
            "marker_id"
        ] == previous.get("marker_id")
        if target is None or (
            not historical
            and not unchanged
            and not any(
                marker["id"] == data["marker_id"]
                for marker in target.data.get("markers", [])
            )
        ):
            raise ValueError("Choose a location on the selected map.")
    session = references.get("session_id")
    if data.get("thread_id"):
        identity = data["thread_id"]
        if not isinstance(identity, str):
            raise ValueError("Choose a valid related thread.")
        thread = Resource.objects.filter(
            id=identity, world=world, kind__in=("quest", "task")
        ).first()
        unchanged = identity == previous.get("thread_id") and data.get(
            "campaign_id"
        ) == previous.get("campaign_id")
        if (
            not thread
            or not historical
            and not unchanged
            and (
                thread.deleted_at
                or (
                    thread.data.get("campaign_id")
                    if thread.data.get("campaign_id") is not None
                    else str(thread.parent_id or "")
                )
                != data.get("campaign_id", "")
            )
        ):
            raise ValueError("Choose an available thread from this campaign.")
    if session and not historical:
        session_campaign = session.data.get("campaign_id")
        if session_campaign is None:
            session_campaign = str(session.parent_id or "")
        if session_campaign != data.get("campaign_id", "") and (
            data.get("session_id") != previous.get("session_id")
            or data.get("campaign_id") != previous.get("campaign_id")
        ):
            raise ValueError("Choose a session from the selected campaign.")
    linked = data.get("related_entries", [])
    if (
        not isinstance(linked, list)
        or len(linked) > 500
        or any(not isinstance(value, str) for value in linked)
        or len(set(linked)) != len(linked)
    ):
        raise ValueError("Choose up to 500 different related entries.")
    if linked:
        targets = {
            str(row.id): row
            for row in Resource.objects.filter(world=world, id__in=linked)
        }
        for identity in linked:
            target = targets.get(identity)
            if target is None or (
                target.deleted_at
                and not historical
                and identity not in previous.get("related_entries", [])
            ):
                raise ValueError(
                    "Related entries must belong to this world and be available."
                )


def reader_campaign_data(data, references):
    """Preparation and follow-up planning stay GM-only even on published sessions."""
    for key in ("prep", "consequences", "next_steps", "gm_workspace", "gm_next_step"):
        data.pop(key, None)
    for key in ("campaign_id", "session_id", "link_id", "thread_id"):
        if data.get(key) and data[key] not in references:
            data.pop(key, None)
    if data.get("map_id"):
        target = references.get(data["map_id"])
        if target is None or target.get("kind") != "map":
            data.pop("map_id", None)
            data.pop("marker_id", None)
        elif data.get("marker_id"):
            from .cartography import reader_map

            if data["marker_id"] not in {
                row["id"]
                for row in reader_map(target["data"], references).get("markers", [])
            }:
                data.pop("marker_id", None)
    for key in ("related_entries", "party"):
        if key in data:
            data[key] = [value for value in data[key] if value in references]
    return data


def campaign_members(campaign, values):
    """Derive campaign cast/lore from entry identities rather than copying records."""
    selected = set(campaign["data"].get("party", [])) | set(
        campaign["data"].get("related_entries", [])
    )
    selected.update(p["entry_id"] for p in campaign["data"].get("party_profiles", []))
    if campaign["data"].get("party_location_id"):
        selected.add(campaign["data"]["party_location_id"])
    for value in values.values():
        identity = value["data"].get("campaign_id")
        if (identity if identity is not None else value.get("parent")) != campaign[
            "id"
        ]:
            continue
        selected.add(value["id"])
        related = value["data"].get("related_entries", [])
        if isinstance(related, list):
            selected.update(
                identity for identity in related if isinstance(identity, str)
            )
        selected.update(
            value["data"].get(key)
            for key in ("map_id", "link_id")
            if value["data"].get(key)
        )
    return selected & set(values)
