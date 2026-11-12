"""Stable, non-month calendar periods and ordinal/weekday layouts."""

from .tools import integer

KEYS = {
    "id",
    "name",
    "after_month",
    "days",
    "outside_week",
    "interval",
    "offset",
    "except_every",
    "except_unless",
}


def validate(data, month_count):
    rows = data.get("special_days", [])
    if not isinstance(rows, list) or len(rows) > 24:
        raise ValueError("Use up to 24 special-day periods.")
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) - KEYS:
            raise ValueError("Invalid special-day period.")
        identity = row.get("id")
        name = row.get("name")
        if (
            not isinstance(identity, str)
            or not identity.strip()
            or len(identity) > 100
            or identity in seen
        ):
            raise ValueError(
                "Special-day periods need unique IDs up to 100 characters."
            )
        seen.add(identity)
        if not isinstance(name, str) or not name.strip() or len(name) > 60:
            raise ValueError("Name each special-day period with up to 60 characters.")
        integer(
            row.get("after_month", month_count), "Special-day position", 0, month_count
        )
        integer(row.get("days", 1), "Special-day count", 1, 20)
        if not isinstance(row.get("outside_week", True), bool):
            raise ValueError("Outside-week settings must use a checkbox.")
        interval = integer(row.get("interval", 1), "Special-day interval", 1, 10000)
        integer(row.get("offset", 0), "Special-day year offset")
        skip = integer(row.get("except_every", 0), "Special-day exception", 0, 10000)
        restore = integer(
            row.get("except_unless", 0), "Special-day restoration", 0, 10000
        )
        if skip and skip % interval:
            raise ValueError(
                "Special-day exceptions must be multiples of the interval."
            )
        if restore and (not skip or restore % skip):
            raise ValueError(
                "Special-day restorations must be multiples of the exception."
            )


def normalized(data):
    return [
        {"interval": 1, "days": 1, "outside_week": True, **row}
        for row in data.get("special_days", [])
    ]


def before(year, rule):
    from .calendar_engine import _before

    offset = rule.get("offset", 0)
    count = _before(year, rule.get("interval", 4), offset)
    if rule.get("except_every"):
        count -= _before(year, rule["except_every"], offset)
    if rule.get("except_unless"):
        count += _before(year, rule["except_unless"], offset)
    return count * rule.get("days", 1)


def year_start(data, year, base):
    from .calendar_engine import leap_rules

    return (
        year * sum(month["days"] for month in base[0])
        + sum(before(year, rule) for rule in leap_rules(data, base))
        + sum(before(year, rule) for rule in normalized(data))
    )


def layout(data, year, base):
    from .calendar_engine import leap_rules, _active

    months = base[0]
    lengths = [month["days"] for month in months]
    rules = leap_rules(data, base)
    for rule in rules:
        if _active(rule, year):
            lengths[rule.get("month", len(months)) - 1] += rule.get("days", 1)
    specials = normalized(data)
    start = year * sum(month["days"] for month in months) + sum(
        before(year, rule) for rule in rules
    )
    week_start = start + sum(
        before(year, row) for row in specials if not row["outside_week"]
    )
    start += sum(before(year, row) for row in specials)
    segments = []
    offset = week_offset = 0
    for boundary in range(len(months) + 1):
        if boundary:
            segments.append(
                {
                    "kind": "month",
                    "month": boundary,
                    "name": months[boundary - 1]["name"],
                    "days": lengths[boundary - 1],
                    "offset": offset,
                    "week_offset": week_offset,
                    "outside_week": False,
                }
            )
            offset += lengths[boundary - 1]
            week_offset += lengths[boundary - 1]
        for row in specials:
            if row.get("after_month", len(months)) == boundary and _active(row, year):
                segments.append(
                    {
                        "kind": "special",
                        "month": max(1, boundary),
                        "after_month": boundary,
                        "special_day_id": row["id"],
                        "name": row["name"],
                        "days": row["days"],
                        "outside_week": row["outside_week"],
                        "offset": offset,
                        "week_offset": week_offset,
                    }
                )
                offset += row["days"]
                if not row["outside_week"]:
                    week_offset += row["days"]
    return {
        "year_start": start,
        "week_year_start": week_start,
        "month_lengths": lengths,
        "segments": segments,
        "year_days": offset,
    }
