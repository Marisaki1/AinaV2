"""Map geometry, saved views and reader-safe map projection."""

import copy
import math
from .calendar_engine import MAX_DAY


def number(value, name, low, high):
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or not low <= value <= high
    ):
        raise ValueError(f"{name} must be a finite number between {low} and {high}.")
    return value


def records(data, key, limit):
    rows = data.get(key, [])
    if not isinstance(rows, list) or len(rows) > limit:
        raise ValueError(f"Use up to {limit} {key}.")
    seen = set()
    for row in rows:
        if (
            not isinstance(row, dict)
            or not isinstance(row.get("id"), str)
            or not row["id"]
            or len(row["id"]) > 100
            or row["id"] in seen
        ):
            raise ValueError(f"Every item in {key} needs a unique ID.")
        seen.add(row["id"])
        for flag in ("visible", "private"):
            if flag in row and not isinstance(row[flag], bool):
                raise ValueError(f"{flag.title()} must be a checkbox value.")
    return rows


SCENE_KEYS = {"asset_id", "groups", "layers", "markers", "default_view"}
MARKER_SYMBOLS = {
    "pin",
    "castle",
    "home",
    "temple",
    "forest",
    "mountain",
    "water",
    "cave",
    "camp",
    "treasure",
    "danger",
    "portal",
}


def validate_map(data, world=None, historical=False, previous=None):
    from .services import short

    groups = records(data, "groups", 300)
    for group in groups:
        short(group.get("name", ""), "Group name", 120)
    for layer in records(data, "layers", 100):
        short(layer.get("name", ""), "Layer name", 160)
        if "opacity" in layer:
            number(layer["opacity"], "Layer opacity", 0, 1)
    for marker in records(data, "markers", 3000):
        kind = marker.get("type", "pin")
        if kind not in ("pin", "label", "line", "polygon", "circle", "hotspot"):
            raise ValueError("Unsupported map marker type.")
        short(marker.get("label", ""), "Marker label", 160)
        if "symbol" in marker and marker["symbol"] not in MARKER_SYMBOLS:
            raise ValueError("Choose a supported marker symbol.")
        if "icon_size" in marker:
            from .tools import integer

            integer(marker["icon_size"], "Marker icon size", 16, 64)
        if "html" in marker or "icon_html" in marker:
            raise ValueError("Use a built-in symbol or local image for a marker icon.")
        if "group" in marker:
            short(marker["group"], "Marker group", 100)
        coords = (
            marker.get("points", [])
            if kind in ("line", "polygon")
            else [[marker.get("x", 0), marker.get("y", 0)]]
        )
        if not isinstance(coords, list) or len(coords) > 1500:
            raise ValueError("Use up to 1,500 map vertices.")
        if kind in ("line", "polygon") and len(coords) < (
            3 if kind == "polygon" else 2
        ):
            raise ValueError("A route needs two vertices; a polygon needs three.")
        for point in coords:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError("Every map point needs two coordinates.")
            for value in point:
                number(value, "Map coordinate", 0, 1)
        if kind in ("circle", "hotspot"):
            number(marker.get("radius", 0.05), "Circle radius", 0.000001, 1)
    view = data.get("default_view")
    if view is not None:
        if not isinstance(view, dict) or set(view) - {"x", "y", "zoom_delta"}:
            raise ValueError("Invalid saved map view.")
        number(view.get("x"), "View horizontal position", 0, 1)
        number(view.get("y"), "View vertical position", 0, 1)
        number(view.get("zoom_delta", 0), "View zoom", -8, 8)
    if world is not None:
        validate_versions(data, world, historical, previous or {})


def validate_versions(data, world, historical, previous):
    from .models import Resource
    from .services import short
    from .tools import integer

    calendar_id = data.get("calendar_id", "")
    calendar = None
    if calendar_id:
        calendar = Resource.objects.filter(
            id=calendar_id, world=world, kind="calendar"
        ).first()
        if calendar is None:
            raise ValueError("Choose a historical map calendar from this world.")
    old_versions = {v["id"]: v for v in previous.get("versions", [])}
    dates = set()
    for version in records(data, "versions", 100):
        if set(version) - {
            "id",
            "name",
            "year",
            "month",
            "day",
            "special_day_id",
            "private",
            "scene",
        }:
            raise ValueError("A historical map version contains unsupported fields.")
        short(version.get("name", ""), "Version name", 120, False)
        date = (
            integer(version.get("year"), "Version year"),
            integer(version.get("month", 1), "Version month", 1, 60),
            integer(version.get("day", 1), "Version day", 1, MAX_DAY),
        )
        identity = version.get("special_day_id", "")
        if not isinstance(identity, str) or len(identity) > 100:
            raise ValueError("Choose a special-day period for the version.")
        date_key = (date[0], identity, 0 if identity else date[1], date[2])
        if date_key in dates:
            raise ValueError(
                "Each historical map version needs a different effective date."
            )
        dates.add(date_key)
        old = old_versions.get(version["id"], {})
        unchanged = (
            calendar_id == previous.get("calendar_id", "")
            and all(
                version.get(k, "" if k == "special_day_id" else 1)
                == old.get(k, "" if k == "special_day_id" else 1)
                for k in ("year", "month", "day", "special_day_id")
            )
            and bool(old)
        )
        if identity and calendar is None and not historical and not unchanged:
            raise ValueError("Choose a custom calendar for a special-day map version.")
        if calendar and not historical and not unchanged:
            if calendar.deleted_at:
                raise ValueError(
                    "Choose an available historical map calendar before adding or changing version dates."
                )
            from .historical_dates import date_value

            date_value(version, calendar.data)
        scene = version.get("scene")
        if not isinstance(scene, dict) or set(scene) - SCENE_KEYS:
            raise ValueError(
                "A version needs map image, geometry and layer settings only."
            )
        validate_map(scene)


def retain_group_privacy(data, previous):
    old_private = {g["id"] for g in previous.get("groups", []) if g.get("private")}
    removed = old_private - {g["id"] for g in data.get("groups", [])}
    old_markers = {m["id"]: m for m in previous.get("markers", [])}
    for marker in data.get("markers", []):
        old_group = old_markers.get(marker["id"], {}).get("group")
        if old_group in removed and marker.get("group", "") in ("", old_group):
            marker["private"] = True
    old_versions = {v["id"]: v for v in previous.get("versions", [])}
    for version in data.get("versions", []):
        retain_group_privacy(
            version["scene"], old_versions.get(version["id"], {}).get("scene", {})
        )


def filter_special_dates(value, calendar):
    identities = {
        row["id"] for row in (calendar or {}).get("data", {}).get("special_days", [])
    }
    for prefix in ("", "end_"):
        key = prefix + "special_day_id"
        if value.get(key) and value[key] not in identities:
            value.pop(key, None)
            value[prefix + "special_day_unavailable"] = True


def reader_map(data, references):
    value = copy.deepcopy(data)
    private_groups = {g["id"] for g in value.get("groups", []) if g.get("private")}
    value["groups"] = [g for g in value.get("groups", []) if not g.get("private")]
    value["layers"] = [
        layer for layer in value.get("layers", []) if not layer.get("private")
    ]
    value["markers"] = [
        marker
        for marker in value.get("markers", [])
        if not marker.get("private") and marker.get("group") not in private_groups
    ]
    for marker in value["markers"]:
        if marker.get("link_id") and marker["link_id"] not in references:
            marker.pop("link_id", None)
    value["versions"] = [
        {**version, "scene": reader_map(version["scene"], references)}
        for version in value.get("versions", [])
        if not version.get("private")
    ]
    calendar = references.get(value.get("calendar_id"))
    for version in value["versions"]:
        filter_special_dates(version, calendar)
    if value.get("calendar_id") and value["calendar_id"] not in references:
        value.pop("calendar_id", None)
        value["calendar_unavailable"] = True
        value["versions"] = []
    return value


def reader_context_data(kind, data, references):
    if kind == "map":
        return reader_map(data, references)
    value = copy.deepcopy(data)
    if kind in ("event", "era", "timeline"):
        if kind in ("event", "era"):
            filter_special_dates(value, references.get(data.get("calendar_id")))
        if value.get("calendar_id") and value["calendar_id"] not in references:
            value.pop("calendar_id", None)
            value["calendar_unavailable"] = True
        if value.get("era_id") and (
            value["era_id"] not in references
            or references[value["era_id"]].get("kind") != "era"
        ):
            value.pop("era_id", None)
            value["era_unavailable"] = True
        if value.get("map_id"):
            ref = references.get(value["map_id"])
            if not ref or ref.get("kind") != "map":
                value.pop("map_id", None)
                value.pop("marker_id", None)
            elif kind == "event":
                map_data = reader_map(ref["data"], references)
                scenes = [map_data, *(v["scene"] for v in map_data.get("versions", []))]
                if value.get("marker_id") not in {
                    m["id"] for scene in scenes for m in scene.get("markers", [])
                }:
                    value.pop("marker_id", None)
    if kind == "timeline":
        private_lanes = {
            lane["id"] for lane in value.get("lanes", []) if lane.get("private")
        }
        value["lanes"] = [
            lane for lane in value.get("lanes", []) if not lane.get("private")
        ]
        value["event_ids"] = [
            identity
            for identity in value.get("event_ids", [])
            if identity in references
            and references[identity].get("kind") == "event"
            and references[identity]["data"].get("lane", 0) not in private_lanes
        ]
    return value


def map_state(resource, event, reader=False, occurrence=None, special_day_id=None):
    """Select a dated scene using one audience and one explicit calendar."""
    from django.http import Http404
    from .models import Resource
    from .services import serialize, public_references
    from .historical_dates import date_value, date_label

    if (
        resource.kind != "map"
        or event.kind != "event"
        or resource.world_id != event.world_id
        or resource.deleted_at
        or event.deleted_at
    ):
        raise Http404()
    refs = public_references(resource.world) if reader else None
    map_value = serialize(resource, False, reader, refs)
    event_value = serialize(event, False, reader, refs)
    if map_value is None or event_value is None:
        raise Http404()
    data, date = map_value["data"], event_value["data"]
    if occurrence is not None:
        from .recurrence import selected_occurrence

        if not date.get("recurrence"):
            raise ValueError("Only repeating events have occurrence dates.")
        calendar_id = date.get("calendar_id")
        if reader:
            definition = refs.get(calendar_id)
        else:
            record = (
                Resource.objects.filter(
                    id=calendar_id,
                    world=resource.world,
                    kind="calendar",
                    deleted_at=None,
                ).first()
                if calendar_id
                else None
            )
            definition = {"data": record.data} if record else None
        if not definition or date.get("calendar_unavailable"):
            raise ValueError("This repeating event's calendar is unavailable.")
        date = selected_occurrence(date, definition["data"], occurrence, special_day_id)
    selected = None
    warnings = []
    calendar = None
    if date.get("date_precision", "day") != "day" or date.get("date_approximate"):
        warnings.append(
            "This event has an uncertain date. Map history uses the earliest date of its stated month or year; the actual state may differ."
            if date.get("date_precision", "day") != "day"
            else "This event has an approximate date. Map history uses the recorded date without assuming a numeric margin; the actual state may differ."
        )
    if data.get("versions") or data.get("calendar_unavailable"):
        if (
            data.get("calendar_unavailable")
            or date.get("calendar_unavailable")
            or (data.get("calendar_id") or "") != (date.get("calendar_id") or "")
        ):
            warnings.append(
                "This event and map do not share an available calendar. Showing the base map."
            )
        else:
            calendar_id = data.get("calendar_id")
            if calendar_id:
                if reader:
                    calendar = refs.get(calendar_id)
                else:
                    record = Resource.objects.filter(
                        id=calendar_id,
                        world=resource.world,
                        kind="calendar",
                        deleted_at=None,
                    ).first()
                    calendar = {"data": record.data} if record else None
            if calendar_id and calendar is None:
                warnings.append(
                    "The historical map calendar is unavailable. Showing the base map."
                )
            else:
                try:
                    if calendar:
                        date_value(date, calendar["data"])
                    eligible = []
                    for version in data.get("versions", []):
                        try:
                            if calendar:
                                date_value(version, calendar["data"])
                            if date_value(
                                version, calendar["data"] if calendar else None
                            ) <= date_value(
                                date, calendar["data"] if calendar else None
                            ):
                                eligible.append(version)
                        except ValueError:
                            warnings.append(
                                "A historical map date needs review after calendar changes; that version was skipped."
                            )
                    selected = max(
                        eligible,
                        key=lambda row: date_value(
                            row, calendar["data"] if calendar else None
                        ),
                        default=None,
                    )
                except ValueError:
                    warnings.append(
                        "This event's recorded date needs review. Showing the base map."
                    )
    scene = selected["scene"] if selected else data
    return {
        "data": {key: copy.deepcopy(scene[key]) for key in SCENE_KEYS if key in scene},
        "version": {
            key: selected[key]
            for key in ("id", "name", "year", "month", "day", "special_day_id")
            if key in selected
        }
        if selected
        else None,
        "effective_label": date_label(selected, calendar["data"] if calendar else None)
        if selected
        else None,
        "warnings": list(dict.fromkeys(warnings)),
    }
