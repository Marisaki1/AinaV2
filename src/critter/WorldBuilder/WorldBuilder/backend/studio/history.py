"""Shared fictional dates, named timeline definitions and history projections."""

import copy
import math
from django.db import transaction
from django.http import Http404
from .models import Resource
from .tools import integer, date_from_ordinal, calendar_config
from .calendar_engine import MAX_DAY
from .historical_dates import (
    date_value,
    date_projection,
    date_sort_order,
    RECORDED_YEAR_DAYS,
)


def validate_event(data, world, historical=False, era=False):
    from .services import short

    integer(data.get("year", 1), "Year")
    integer(data.get("month", 1), "Month", 1, 60)
    integer(data.get("day", 1), "Day", 1, MAX_DAY)
    integer(data.get("lane", 0), "Timeline lane", -1000, 1000)
    if "era" in data:
        short(data["era"], "Era", 120)
    for key in ("date_precision", "end_precision"):
        if data.get(key, "day") not in ("day", "month", "year"):
            raise ValueError("Choose day, month or year date precision.")
    for key in ("date_approximate", "end_approximate"):
        if key in data and not isinstance(data[key], bool):
            raise ValueError("Approximate dates must use a checkbox value.")
    if era and data.get("era_id"):
        raise ValueError("An era cannot belong to another era.")
    for key in ("special_day_id", "end_special_day_id"):
        if key in data and (not isinstance(data[key], str) or len(data[key]) > 100):
            raise ValueError("Choose a special-day period from the calendar.")
    end = data.get("end_year")
    if end not in (None, ""):
        integer(end, "End year")
        integer(data.get("end_month", data.get("month", 1)), "End month", 1, 60)
        integer(data.get("end_day", data.get("day", 1)), "End day", 1, MAX_DAY)
    elif not historical and any(
        key in data and data[key] not in (None, "")
        for key in (
            "end_month",
            "end_day",
            "end_precision",
            "end_approximate",
            "end_special_day_id",
        )
    ):
        raise ValueError("Choose an end year before adding an end month or day.")
    cal = None
    if data.get("calendar_id"):
        cal = Resource.objects.filter(
            id=data["calendar_id"], world=world, kind="calendar"
        ).first()
        if not cal:
            raise ValueError("Choose a calendar from this world.")
    if not historical:
        own = cal.data if cal else None
        if date_value(data, own, True) < date_value(data, own):
            raise ValueError("The end date must be on or after the start date.")
        if cal and cal.deleted_at:
            raise ValueError("Choose an available calendar before changing dates.")
    from .recurrence import validate_recurrence

    validate_recurrence(
        data, cal.data if cal and not cal.deleted_at else None, era, historical
    )
    if data.get("era_id"):
        record = Resource.objects.filter(
            id=data["era_id"], world=world, kind="era"
        ).first()
        if record is None:
            raise ValueError("Choose an era from this world.")
        if not historical:
            warning = era_warning(
                data,
                record.data,
                cal.data if cal else None,
                record.deleted_at is not None,
            )
            if warning:
                raise ValueError(warning)
    if (
        data.get("map_id")
        and not Resource.objects.filter(
            id=data["map_id"], world=world, kind="map"
        ).exists()
    ):
        raise ValueError("Choose a map from this world.")


def era_warning(data, era, calendar, unavailable=False):
    if unavailable:
        return "This event's era is unavailable. Its recorded date has been kept."
    if (data.get("calendar_id") or "") != (era.get("calendar_id") or ""):
        return "The event and era must use the same calendar."
    try:
        if date_value(data, calendar) < date_value(era, calendar):
            return "The event starts before its era."
        if era.get("end_year") not in (None, "") and date_value(
            data, calendar, True
        ) > date_value(era, calendar, True):
            return "The event extends beyond its era."
    except (ValueError, TypeError, KeyError, IndexError):
        return "This era's dates need review after calendar changes."
    return ""


def validate_timeline(data, world):
    from .services import strings, short

    if (
        data.get("calendar_id")
        and not Resource.objects.filter(
            id=data["calendar_id"], world=world, kind="calendar"
        ).exists()
    ):
        raise ValueError("Choose a calendar from this world.")
    if (
        data.get("map_id")
        and not Resource.objects.filter(
            id=data["map_id"], world=world, kind="map"
        ).exists()
    ):
        raise ValueError("Choose a map from this world.")
    if data.get("selection", "all") not in ("all", "selected"):
        raise ValueError("Choose all matching events or selected events.")
    if data.get("tag_mode", "all") not in ("all", "any"):
        raise ValueError("Choose all or any matching tags.")
    strings(data.get("tags", []), "Timeline tags")
    ids = data.get("event_ids", [])
    if (
        not isinstance(ids, list)
        or len(ids) > 5000
        or any(not isinstance(i, str) for i in ids)
        or len(ids) != len(set(ids))
    ):
        raise ValueError("Choose up to 5,000 different historical events.")
    for identity in ids:
        if not Resource.objects.filter(id=identity, world=world, kind="event").exists():
            raise ValueError("Choose events from this world.")
    if "recurrence_from_year" in data or "recurrence_to_year" in data:
        from .recurrence import occurrence_window

        if "recurrence_from_year" not in data or "recurrence_to_year" not in data:
            raise ValueError("Set both ends of the repeating-date preview window.")
        occurrence_window([], data)
    lanes = data.get("lanes", [{"id": 0, "name": "Events"}])
    if not isinstance(lanes, list) or len(lanes) > 40:
        raise ValueError("Use up to 40 timeline lanes.")
    seen = set()
    for lane in lanes:
        if not isinstance(lane, dict):
            raise ValueError("Invalid timeline lane.")
        identity = integer(lane.get("id"), "Lane number", -1000, 1000)
        if identity in seen:
            raise ValueError("Each lane needs a unique number.")
        seen.add(identity)
        short(lane.get("name", ""), "Lane name", 100, False)
        if "private" in lane and not isinstance(lane["private"], bool):
            raise ValueError("Lane privacy must be a checkbox value.")


def history_view(
    world,
    calendar_key="none",
    timeline_id=None,
    reader=False,
    query="",
    from_year=None,
    to_year=None,
    event_id=None,
):
    from .services import public_references, serialize, search_resources
    from .organization import normalize

    references = public_references(world) if reader else None
    records = list(
        Resource.objects.filter(
            world=world,
            deleted_at=None,
            kind__in=["event", "calendar", "timeline", "era"],
        )
    )
    values = {str(r.id): serialize(r, False, reader, references) for r in records}
    values = {key: value for key, value in values.items() if value is not None}
    calendars = {key: v for key, v in values.items() if v["kind"] == "calendar"}
    timelines = [v for v in values.values() if v["kind"] == "timeline"]
    config = {}
    timeline = None
    blocked = set()
    if timeline_id:
        timeline = values.get(str(timeline_id))
        if not timeline or timeline["kind"] != "timeline":
            raise Http404()
        config = timeline["data"]
        calendar_key = config.get("calendar_id") or (
            "unavailable" if config.get("calendar_unavailable") else "none"
        )
        if calendar_key not in calendars and calendar_key != "none":
            calendar_key = "unavailable"
        if reader:
            original = next(r for r in records if str(r.id) == str(timeline_id))
            blocked = {
                lane["id"]
                for lane in (original.published or {}).get("data", {}).get("lanes", [])
                if lane.get("private")
            }
    if (
        calendar_key not in ("all", "none", "unavailable")
        and calendar_key not in calendars
    ):
        raise ValueError(
            "Choose an available calendar, or use the list of all calendars."
        )
    calendar = calendars.get(calendar_key)
    cal_data = calendar["data"] if calendar else None
    events = [v for v in values.values() if v["kind"] == "event"]
    if query:
        matching = {v["id"] for v in search_resources(world, query, reader)}
        events = [v for v in events if v["id"] in matching]
    tags = {normalize(t) for t in config.get("tags", [])}
    result = []
    for event in events:
        data = event["data"]
        key = data.get("calendar_id") or (
            "unavailable" if data.get("calendar_unavailable") else "none"
        )
        if key not in calendars and key != "none":
            key = "unavailable"
        if calendar_key != "all" and key != calendar_key:
            continue
        lane = data.get("lane", 0)
        if (
            isinstance(lane, bool)
            or not isinstance(lane, int)
            or not -1000 <= lane <= 1000
        ):
            if reader:
                continue
            lane = 0
        if lane in blocked:
            continue
        if config.get("selection") == "selected" and event["id"] not in config.get(
            "event_ids", []
        ):
            continue
        actual = {normalize(t) for t in event["tags"]}
        if tags and not (
            bool(tags & actual) if config.get("tag_mode") == "any" else tags <= actual
        ):
            continue
        event = copy.deepcopy(event)
        own = calendars.get(key, {}).get("data")
        event.update(calendar_key=key, lane=lane, **date_projection(data, own))
        if key == "unavailable":
            event.update(
                ordinal=None,
                end_ordinal=None,
                date_warning="This event's calendar is unavailable. Its recorded date has been kept.",
            )
        era_id = data.get("era_id")
        if era_id:
            period = values.get(era_id)
            warning = era_warning(
                data,
                period["data"] if period else {},
                own,
                not period or period.get("kind") != "era",
            )
            if warning:
                event["era_warning"] = warning
            if period and period.get("kind") == "era":
                event["era_label"] = period["title"]
        result.append(event)
    from .recurrence import occurrence_window, occurrences, occurrence_id, budget

    if event_id:
        result = [event for event in result if event["id"] == str(event_id)]
    first, last = occurrence_window(result, config, from_year, to_year)
    limits = budget()
    expanded, recurrence_warnings = [], []
    for source in result:
        # History fetches bodies on selection; avoid duplicating rich documents per occurrence.
        source = {
            k: v
            for k, v in source.items()
            if k not in ("document", "private_notes", "source", "html")
        }
        source["data"] = {
            k: v
            for k, v in source["data"].items()
            if k
            in (
                "calendar_id",
                "year",
                "month",
                "day",
                "special_day_id",
                "special_day_unavailable",
                "end_special_day_id",
                "end_special_day_unavailable",
                "end_year",
                "end_month",
                "end_day",
                "date_precision",
                "end_precision",
                "date_approximate",
                "end_approximate",
                "era_id",
                "era",
                "era_unavailable",
                "calendar_unavailable",
                "map_id",
                "marker_id",
                "lane",
                "recurrence",
            )
        }
        if not source["data"].get("recurrence") or source.get("date_warning"):
            expanded.append({**source, "occurrence_id": source["id"]})
            continue
        own = calendars.get(source["calendar_key"], {}).get("data")
        series = []
        try:
            for occurrence in occurrences(source["data"], own, first, last, limits):
                event = {
                    **source,
                    "data": occurrence,
                    "occurrence_id": occurrence_id(source["id"], occurrence),
                    **date_projection(occurrence, own),
                }
                period = values.get(occurrence.get("era_id"))
                if period and period.get("kind") == "era":
                    warning = era_warning(occurrence, period["data"], own)
                    event.pop("era_warning", None)
                    if warning:
                        event["era_warning"] = warning
                series.append(event)
            expanded.extend(series)
        except (ValueError, TypeError, KeyError, IndexError) as error:
            limits["remaining"] += len(series)
            recurrence_warnings.append(
                {
                    "id": source["id"],
                    "message": "Repeat dates need review: " + str(error),
                }
            )
            expanded.append(
                {
                    **source,
                    "occurrence_id": source["id"],
                    "date_warning": "Repeat dates need review. Its recorded first date has been kept.",
                }
            )
    result = expanded
    result.sort(
        key=lambda e: (
            e["calendar_key"] if calendar_key == "all" else "",
            date_sort_order(
                e["data"], calendars.get(e["calendar_key"], {}).get("data")
            ),
            e["lane"],
            e["title"],
            e["id"],
        )
    )
    eras = []
    for period in values.values():
        if period["kind"] != "era":
            continue
        key = period["data"].get("calendar_id") or (
            "unavailable" if period["data"].get("calendar_unavailable") else "none"
        )
        if key not in calendars and key != "none":
            key = "unavailable"
        if calendar_key != "all" and key != calendar_key:
            continue
        projection = date_projection(
            period["data"], calendars.get(key, {}).get("data"), era=True
        )
        if key == "unavailable":
            projection.update(
                ordinal=None,
                end_ordinal=None,
                date_warning="This era's calendar is unavailable.",
            )
        eras.append({**copy.deepcopy(period), **projection, "calendar_key": key})
    eras.sort(
        key=lambda e: (
            e["calendar_key"],
            date_sort_order(
                e["data"], calendars.get(e["calendar_key"], {}).get("data")
            ),
            e["title"],
            e["id"],
        )
    )
    lanes = [
        copy.deepcopy(l)
        for l in config.get("lanes", [])
        if not (reader and l.get("private"))
    ]
    known = {lane["id"] for lane in lanes}
    for event in result:
        if event["lane"] not in known:
            lanes.append(
                {
                    "id": event["lane"],
                    "name": "Events"
                    if event["lane"] == 0
                    else "Lane " + str(event["lane"]),
                }
            )
            known.add(event["lane"])
    axis = None
    valid = [e for e in result if e["ordinal"] is not None]
    if calendar_key not in ("all", "unavailable"):
        year_days = (
            sum(m["days"] for m in calendar_config(cal_data)[0])
            if cal_data is not None
            else RECORDED_YEAR_DAYS
        )
        dated = [*valid, *(e for e in eras if e["ordinal"] is not None)]
        low = min((e["ordinal"] for e in dated), default=0)
        high = max(
            (
                (e["end_ordinal"] if e["end_ordinal"] is not None else e["ordinal"])
                for e in dated
            ),
            default=year_days,
        )
        span = max(high - low, 7 if cal_data is not None else year_days)
        padding = max(1, span * 0.05)
        low = math.floor(low - padding)
        high = math.ceil(max(high, low + span) + padding)
        ticks = []
        seen = set()
        for index in range(65):
            ordinal = round(low + (high - low) * index / 64)
            if ordinal in seen:
                continue
            seen.add(ordinal)
            try:
                date = (
                    date_from_ordinal(cal_data, ordinal)
                    if cal_data is not None
                    else {
                        "year": ordinal // RECORDED_YEAR_DAYS,
                        "month_name": "",
                        "day": 1,
                    }
                )
                ticks.append(
                    {
                        "at": ordinal,
                        "year": date["year"],
                        "label": (
                            str(date["year"])
                            + " · "
                            + date.get("month_name", "")
                            + " "
                            + str(date["day"])
                        ).strip(" ·")
                        if cal_data is not None
                        else str(date["year"]),
                    }
                )
            except ValueError:
                pass
        axis = {
            "minimum": low,
            "maximum": high,
            "ticks": ticks,
            "custom_calendar": bool(calendar),
        }
    return {
        "events": result,
        "occurrence_window": {"from_year": first, "to_year": last},
        "occurrences_truncated": limits["truncated"],
        "recurrence_warnings": recurrence_warnings,
        "eras": eras,
        "lanes": lanes,
        "axis": axis,
        "timeline": timeline,
        "calendar": calendar,
        "calendar_key": calendar_key,
        "calendars": list(calendars.values()),
        "timelines": timelines,
    }


def create_history_event(world, payload):
    from .services import Conflict, save_resource, serialize

    with transaction.atomic():
        timeline = None
        if payload.get("timeline_id"):
            timeline = Resource.objects.filter(
                id=payload["timeline_id"], world=world, kind="timeline", deleted_at=None
            ).first()
            if not timeline:
                raise Http404()
            if (
                isinstance(payload.get("timeline_revision"), bool)
                or not isinstance(payload.get("timeline_revision"), int)
                or payload.get("timeline_revision") != timeline.revision
            ):
                raise Conflict(
                    "The timeline changed. Refresh it before adding an event."
                )
        config = timeline.data if timeline else {}
        calendar_id = config.get("calendar_id", payload.get("calendar_id", ""))
        if (
            calendar_id
            and not Resource.objects.filter(
                id=calendar_id, world=world, kind="calendar", deleted_at=None
            ).exists()
        ):
            raise ValueError(
                "Choose an available calendar for this timeline before adding an event."
            )
        data = payload.get("data", {})
        if not isinstance(data, dict):
            raise ValueError("Event details must be an object.")
        data = {**data, "calendar_id": calendar_id}
        event = save_resource(
            world,
            {
                "kind": "event",
                "title": payload.get("title", "New event"),
                "data": data,
                "tags": config.get("tags", []),
            },
        )
        if timeline and config.get("selection") == "selected":
            save_resource(
                world,
                {
                    "data": {
                        **config,
                        "event_ids": [*config.get("event_ids", []), str(event.id)],
                    },
                    "expected_revision": timeline.revision,
                },
                timeline,
            )
        return serialize(event)
