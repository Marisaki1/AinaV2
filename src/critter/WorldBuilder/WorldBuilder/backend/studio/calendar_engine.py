"""Fictional calendar arithmetic, periodic leap rules and celestial cycles."""

from .tools import integer

MAX_DAY = 2000
DEFINITION_KEYS = {
    "months",
    "weekdays",
    "leap_every",
    "leap_month",
    "leap_rules",
    "day_offset",
    "week_mode",
    "moon_cycle",
    "moons",
    "special_days",
}
PHASES = (
    "New",
    "Waxing crescent",
    "First quarter",
    "Waxing gibbous",
    "Full",
    "Waning gibbous",
    "Last quarter",
    "Waning crescent",
)


def _name(value, description, limit=60):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f"Give {description} a name up to {limit} characters.")
    return value


def config(data):
    if not isinstance(data, dict):
        raise ValueError("Calendar settings must be an object.")
    months = data.get(
        "months",
        [
            {"name": name, "days": 30}
            for name in ("First Moon", "Second Moon", "Third Moon", "Fourth Moon")
        ],
    )
    weekdays = data.get(
        "weekdays",
        [
            "Firstday",
            "Seconday",
            "Thirday",
            "Fourthday",
            "Fifthday",
            "Sixthday",
            "Seventhday",
        ],
    )
    if not isinstance(months, list) or not 1 <= len(months) <= 60:
        raise ValueError("A calendar needs 1–60 months.")
    if not isinstance(weekdays, list) or not 1 <= len(weekdays) <= 40:
        raise ValueError("Use between one and 40 weekdays.")
    for name in weekdays:
        _name(name, "each weekday", 40)
    for month in months:
        if not isinstance(month, dict):
            raise ValueError("Invalid calendar month.")
        _name(month.get("name"), "each month")
        integer(month.get("days"), "Month length", 1, 1000)
    every = integer(data.get("leap_every", 0), "Leap-year interval", 0, 10000)
    leap_month = integer(
        data.get("leap_month", len(months)), "Leap month", 1, len(months)
    )
    integer(data.get("day_offset", 0), "Weekday offset", -100000, 100000)
    if data.get("week_mode", "continuous") not in (
        "continuous",
        "reset_month",
        "reset_year",
    ):
        raise ValueError("Choose continuous weeks or a month/year weekday reset.")
    rules = data.get("leap_rules", [])
    if not isinstance(rules, list) or len(rules) > 12:
        raise ValueError("Use up to 12 leap rules.")
    seen = set()
    for rule in rules:
        if not isinstance(rule, dict) or set(rule) - {
            "id",
            "name",
            "interval",
            "offset",
            "month",
            "days",
            "except_every",
            "except_unless",
        }:
            raise ValueError("Invalid leap rule.")
        key = _name(rule.get("id"), "each leap rule ID", 100)
        if key in seen:
            raise ValueError("Leap rules need unique IDs.")
        seen.add(key)
        _name(rule.get("name"), "each leap rule")
        interval = integer(rule.get("interval", 4), "Leap interval", 1, 10000)
        integer(rule.get("offset", 0), "Leap offset")
        integer(rule.get("month", len(months)), "Leap month", 1, len(months))
        integer(rule.get("days", 1), "Added leap days", 1, 10)
        skip = integer(rule.get("except_every", 0), "Leap exception interval", 0, 10000)
        restore = integer(
            rule.get("except_unless", 0), "Leap restoration interval", 0, 10000
        )
        if skip and skip % interval:
            raise ValueError("Leap exceptions must be a multiple of the leap interval.")
        if restore and (not skip or restore % skip):
            raise ValueError(
                "Leap restorations must be a multiple of the exception interval."
            )
    integer(data.get("moon_cycle", 28), "Moon cycle", 1, 1000000)
    moons = data.get("moons", [])
    if not isinstance(moons, list) or len(moons) > 8:
        raise ValueError("Use up to eight celestial cycles.")
    seen = set()
    for moon in moons:
        if not isinstance(moon, dict) or set(moon) - {"id", "name", "period", "offset"}:
            raise ValueError("Invalid celestial cycle.")
        key = _name(moon.get("id"), "each celestial ID", 100)
        if key in seen:
            raise ValueError("Celestial cycles need unique IDs.")
        seen.add(key)
        _name(moon.get("name"), "each celestial cycle")
        integer(moon.get("period", 28), "Celestial period", 1, 1000000)
        integer(moon.get("offset", 0), "Celestial offset")
    from .special_days import validate

    validate(data, len(months))
    return months, weekdays, every, leap_month


def leap_rules(data, base=None):
    months, _, every, leap_month = base or config(data)
    if "leap_rules" in data:
        return data["leap_rules"]
    return (
        [
            {
                "id": "legacy-leap",
                "name": "Leap day",
                "interval": every,
                "month": leap_month,
                "days": 1,
                "offset": 0,
            }
        ]
        if every
        else []
    )


def moon_cycles(data):
    return data.get(
        "moons",
        [
            {
                "id": "legacy-moon",
                "name": "Moon",
                "period": data.get("moon_cycle", 28),
                "offset": 0,
            }
        ],
    )


def moon_phases(data, ordinal):
    result = []
    for moon in moon_cycles(data):
        period = moon.get("period", 28)
        position = (ordinal - moon.get("offset", 0)) % period
        phase = position * 8 // period
        result.append(
            {
                "id": moon["id"],
                "name": moon["name"],
                "phase": PHASES[phase],
                "phase_index": phase,
                "cycle_day": position + 1,
                "period": period,
            }
        )
    return result


def _active(rule, year):
    number = year - rule.get("offset", 0)
    return number % rule.get("interval", 4) == 0 and (
        not rule.get("except_every")
        or number % rule["except_every"] != 0
        or bool(rule.get("except_unless") and number % rule["except_unless"] == 0)
    )


def _before(year, interval, offset):
    return (year - 1 - offset) // interval - (-1 - offset) // interval


def date_info(data, year, month=1, day=1, special_day_id=None):
    from .special_days import layout

    base = config(data)
    months, weekdays, _, _ = base
    integer(year, "Year")
    integer(day, "Day", 1, MAX_DAY)
    integer(month, "Month", 1, 60 if special_day_id else len(months))
    info = layout(data, year, base)
    if special_day_id:
        if not isinstance(special_day_id, str):
            raise ValueError("Choose a special-day period.")
        segment = next(
            (
                row
                for row in info["segments"]
                if row.get("special_day_id") == special_day_id
            ),
            None,
        )
        if segment is None:
            raise ValueError(
                "That special-day period is unavailable in the selected year."
            )
    else:
        segment = next(
            row
            for row in info["segments"]
            if row["kind"] == "month" and row["month"] == month
        )
    if day > segment["days"]:
        raise ValueError("That day does not exist in the selected period.")
    ordinal = info["year_start"] + segment["offset"] + day - 1
    mode = data.get("week_mode", "continuous")
    outside = segment["outside_week"]
    week_position = (
        info["week_year_start"] + segment["week_offset"] + day - 1
        if mode == "continuous"
        else segment["week_offset"] + day - 1
    )
    if mode == "reset_month":
        week_position = day - 1
        if segment["kind"] == "special":
            boundary = segment["after_month"]
            week_position += (
                info["month_lengths"][boundary - 1] if boundary else 0
            ) + sum(
                row["days"]
                for row in info["segments"]
                if row["kind"] == "special"
                and row["after_month"] == boundary
                and row["offset"] < segment["offset"]
                and not row["outside_week"]
            )
    index = (
        None if outside else (week_position + data.get("day_offset", 0)) % len(weekdays)
    )
    return {
        "ordinal": ordinal,
        "year_start": info["year_start"],
        "weekday": None if outside else weekdays[index],
        "weekday_index": index,
        "month_name": segment["name"],
        "month_lengths": info["month_lengths"],
        "weekdays": weekdays,
        "first_weekday": None if outside else (index - day + 1) % len(weekdays),
        "year": year,
        "month": segment["month"],
        "day": day,
        "year_days": info["year_days"],
        "week_mode": mode,
        "moons": moon_phases(data, ordinal),
        "is_special": segment["kind"] == "special",
        "special_day_id": segment.get("special_day_id"),
        "outside_week": outside,
        "period_length": segment["days"],
        "special_blocks": [
            {
                key: row[key]
                for key in (
                    "special_day_id",
                    "name",
                    "after_month",
                    "days",
                    "outside_week",
                )
            }
            for row in info["segments"]
            if row["kind"] == "special"
        ],
        "segments": info["segments"],
    }


def date_from_ordinal(data, ordinal):
    from .special_days import year_start, layout

    integer(ordinal, "Day ordinal", -(10**15), 10**15)
    base = config(data)
    low, high = -1000000000, 1000000000
    if ordinal < year_start(data, low, base):
        raise ValueError("Date precedes the supported year range.")
    while low < high:
        middle = (low + high + 1) // 2
        if year_start(data, middle, base) <= ordinal:
            low = middle
        else:
            high = middle - 1
    info = layout(data, low, base)
    remaining = ordinal - info["year_start"]
    for row in info["segments"]:
        if row["offset"] <= remaining < row["offset"] + row["days"]:
            return date_info(
                data,
                low,
                row["month"],
                remaining - row["offset"] + 1,
                row.get("special_day_id"),
            )
    raise ValueError("Date exceeds the supported year range.")


def month_preview(data, year, month, special_day_id=None):
    info = date_info(data, year, month, 1, special_day_id)
    info["days"] = [
        {
            "day": index + 1,
            "weekday": None
            if info["outside_week"]
            else info["weekdays"][
                (info["first_weekday"] + index) % len(info["weekdays"])
            ],
            "moons": moon_phases(data, info["ordinal"] + index),
        }
        for index in range(info["period_length"])
    ]
    return info


def definition(data):
    config(data)
    result = {key: value for key, value in data.items() if key in DEFINITION_KEYS}
    if "months" in result:
        result["months"] = [
            {"name": m["name"], "days": m["days"]} for m in result["months"]
        ]
    return result
