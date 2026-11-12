"""Bounded recurring dates; occurrences never create database records."""

from .calendar_engine import config, date_info, date_from_ordinal
from .historical_dates import date_tuple, date_value
from .tools import integer

MAX_OCCURRENCES = 2000
MAX_SCANS = 20000
MAX_WINDOW_YEARS = 200


def validate_recurrence(data, calendar, era=False, historical=False):
    rule = data.get("recurrence")
    if rule is None:
        return
    if era:
        raise ValueError("Repeat rules belong to events, not eras.")
    if not isinstance(rule, dict) or set(rule) - {
        "frequency",
        "interval",
        "until_year",
        "invalid_date",
    }:
        raise ValueError("Invalid repeat rule.")
    if rule.get("frequency") not in ("daily", "weekly", "monthly", "yearly"):
        raise ValueError("Choose a supported repeat frequency.")
    integer(rule.get("interval", 1), "Repeat interval", 1, 10000)
    if rule.get("invalid_date", "skip") not in ("skip", "last_day"):
        raise ValueError("Skip missing dates or use the month's last day.")
    if rule.get("until_year") is not None:
        integer(rule["until_year"], "Final repeat year")
        if rule["until_year"] < data.get("year", 1):
            raise ValueError("The final repeat year cannot precede the first event.")
    if data.get("special_day_id") and rule["frequency"] == "monthly":
        raise ValueError(
            "A special-day period repeats yearly or by elapsed days, not monthly."
        )
    if not historical:
        if calendar is None:
            raise ValueError(
                "Choose an available custom calendar before repeating an event."
            )
        if (
            any(
                data.get(k, "day") != "day" for k in ("date_precision", "end_precision")
            )
            or data.get("date_approximate")
            or data.get("end_approximate")
        ):
            raise ValueError(
                "Repeating events need known start and end days without circa estimates."
            )
        date_value(data, calendar)
        date_value(data, calendar, True)


def occurrence_window(events, settings=None, from_year=None, to_year=None):
    settings = settings or {}
    anchor = min(
        (e["data"].get("year", 1) for e in events if e["data"].get("recurrence")),
        default=1,
    )
    first = (
        settings.get("recurrence_from_year", anchor)
        if from_year is None
        else parse_year(from_year)
    )
    last = (
        settings.get("recurrence_to_year", min(first + 9, 1000000000))
        if to_year is None
        else parse_year(to_year)
    )
    integer(first, "First repeat preview year")
    integer(last, "Last repeat preview year")
    if last < first or last - first + 1 > MAX_WINDOW_YEARS:
        raise ValueError(
            f"Choose an ordered repeat window of at most {MAX_WINDOW_YEARS} years."
        )
    return first, last


def parse_year(value):
    if isinstance(value, str):
        try:
            value = int(value)
        except ValueError as error:
            raise ValueError("Preview years must be integers.") from error
    return integer(value, "Preview year")


def budget():
    return {"remaining": MAX_OCCURRENCES, "scans": MAX_SCANS, "truncated": False}


def year_end(calendar, year):
    info = date_info(calendar, year)
    return info["year_start"] + info["year_days"] - 1


def occurrences(data, calendar, first, last, limits=None):
    """Yield exact date data overlapping the preview window, inclusive of duration."""
    limits = limits if limits is not None else budget()
    validate_recurrence(data, calendar)
    rule = data["recurrence"]
    start = date_value(data, calendar)
    duration = date_value(data, calendar, True) - start
    low = max(
        date_info(calendar, -1000000000)["year_start"],
        date_info(calendar, first)["year_start"] - duration,
    )
    high = min(
        year_end(calendar, last),
        year_end(
            calendar,
            rule.get("until_year")
            if rule.get("until_year") is not None
            else 1000000000,
        ),
    )
    lower_year = date_from_ordinal(calendar, low)["year"]
    y, m, d = date_tuple(data)
    months, weekdays, _, _ = config(calendar)
    interval = rule.get("interval", 1)
    frequency = rule["frequency"]
    if frequency in ("daily", "weekly"):
        step = interval * (len(weekdays) if frequency == "weekly" else 1)
        begin, stop = max(0, -((start - low) // step)), (high - start) // step
    elif frequency == "monthly":
        source_month = y * len(months) + m - 1
        begin = max(0, -((source_month - lower_year * len(months)) // interval))
        stop = (
            (
                min(
                    last,
                    rule.get("until_year")
                    if rule.get("until_year") is not None
                    else last,
                )
                + 1
            )
            * len(months)
            - 1
            - source_month
        ) // interval
    else:
        begin = max(0, -((y - lower_year) // interval))
        stop = (
            min(
                last,
                rule.get("until_year") if rule.get("until_year") is not None else last,
            )
            - y
        ) // interval
    for index in range(begin, stop + 1):
        if limits["scans"] <= 0:
            limits["truncated"] = True
            break
        limits["scans"] -= 1
        if frequency in ("daily", "weekly"):
            info = date_from_ordinal(calendar, start + index * step)
        else:
            year, month = (
                (divmod(source_month + index * interval, len(months)))
                if frequency == "monthly"
                else (y + index * interval, m - 1)
            )
            month += 1
            identity = data.get("special_day_id") if frequency == "yearly" else None
            if identity:
                block = next(
                    (
                        row
                        for row in date_info(calendar, year)["special_blocks"]
                        if row["special_day_id"] == identity
                    ),
                    None,
                )
                if block is None:
                    continue
                month_length = block["days"]
            else:
                month_length = date_info(calendar, year, month)["month_lengths"][
                    month - 1
                ]
            if d > month_length and rule.get("invalid_date", "skip") == "skip":
                continue
            info = date_info(calendar, year, month, min(d, month_length), identity)
        if not start <= info["ordinal"] <= high or info["ordinal"] < low:
            continue
        if limits["remaining"] <= 0:
            limits["truncated"] = True
            break
        end = date_from_ordinal(calendar, info["ordinal"] + duration)
        limits["remaining"] -= 1
        value = instance_data(data, info, end)
        yield value


def instance_data(data, info, end):
    value = {**data, "year": info["year"], "month": info["month"], "day": info["day"]}
    if info.get("special_day_id"):
        value["special_day_id"] = info["special_day_id"]
    else:
        value.pop("special_day_id", None)
    if data.get("end_year") not in (None, ""):
        value.update(end_year=end["year"], end_month=end["month"], end_day=end["day"])
        if end.get("special_day_id"):
            value["end_special_day_id"] = end["special_day_id"]
        else:
            value.pop("end_special_day_id", None)
    return value


def occurrence_id(source_id, data):
    from urllib.parse import quote

    identity = data.get("special_day_id")
    return f"{source_id}@{data['year']}:{data.get('month', 1)}:{data.get('day', 1)}" + (
        "#" + quote(identity, safe="") if identity else ""
    )


def compact(event):
    return {
        key: event[key]
        for key in (
            "id",
            "occurrence_id",
            "title",
            "date_label",
            "end_label",
            "ordinal",
            "end_ordinal",
            "data",
            "uncertain",
            "date_warning",
        )
        if key in event
    }


def selected_occurrence(data, calendar, value, special_day_id=None):
    validate_recurrence(data, calendar)
    try:
        pieces = value.split(":")
        if len(pieces) != 3:
            raise ValueError()
        year, month, day = (int(p) for p in pieces)
        integer(year, "Occurrence year")
        date_info(calendar, year, month, day, special_day_id)
    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError(
            "Choose an actual occurrence date in year:month:day format."
        ) from error
    y, m, d = date_tuple(data)
    rule = data["recurrence"]
    interval = rule.get("interval", 1)
    info = date_info(calendar, year, month, day, special_day_id)
    start = date_value(data, calendar)
    months, weekdays, _, _ = config(calendar)
    frequency = rule["frequency"]
    matches = info["ordinal"] >= start and year <= (
        rule.get("until_year") if rule.get("until_year") is not None else 1000000000
    )
    if frequency in ("daily", "weekly"):
        matches = (
            matches
            and (info["ordinal"] - start)
            % (interval * (len(weekdays) if frequency == "weekly" else 1))
            == 0
        )
    else:
        elapsed = (
            (year - y) * len(months) + month - m if frequency == "monthly" else year - y
        )
        expected_day = (
            min(d, info["period_length"])
            if rule.get("invalid_date") == "last_day"
            else d
        )
        matches = (
            matches
            and elapsed >= 0
            and elapsed % interval == 0
            and day == expected_day
            and (
                frequency == "monthly"
                or (
                    special_day_id == data.get("special_day_id")
                    if data.get("special_day_id")
                    else not special_day_id and month == m
                )
            )
        )
    if frequency == "monthly" and special_day_id:
        matches = False
    if not matches:
        raise ValueError("That date is not an occurrence of this repeating event.")
    end = date_from_ordinal(
        calendar, info["ordinal"] + date_value(data, calendar, True) - start
    )
    return instance_data(data, info, end)
