"""Date precision and labels shared by events, eras and reader projections."""

from .calendar_engine import MAX_DAY, date_info, config

RECORDED_YEAR_DAYS = 60 * MAX_DAY


def precision(data, end=False):
    return (
        data.get("end_precision", data.get("date_precision", "day"))
        if end and data.get("end_year") not in (None, "")
        else data.get("date_precision", "day")
    )


def date_tuple(data, end=False):
    start = (data.get("year", 1), data.get("month", 1), data.get("day", 1))
    if end and data.get("end_year") not in (None, ""):
        start = (
            data["end_year"],
            data.get("end_month", start[1]),
            data.get("end_day", start[2]),
        )
    mode = precision(data, end)
    return (
        start[0],
        1 if mode == "year" else start[1],
        1 if mode in ("year", "month") else start[2],
    )


def special_id(data, end=False):
    return (
        data.get("end_special_day_id")
        if end and data.get("end_year") not in (None, "")
        else data.get("special_day_id")
    )


def date_parts(data, end=False):
    year, month, day = date_tuple(data, end)
    return {
        "year": year,
        "month": month,
        "day": day,
        "special_day_id": special_id(data, end),
    }


def date_value(data, calendar=None, end=False, upper=None):
    parts = date_parts(data, end)
    year, month, day = parts["year"], parts["month"], parts["day"]
    mode = precision(data, end)
    upper = end if upper is None else upper
    identity = parts["special_day_id"]
    if data.get("special_day_unavailable") or data.get("end_special_day_unavailable"):
        raise ValueError("A recorded special-day period is unavailable.")
    if identity and (calendar is None or mode != "day"):
        raise ValueError(
            "A special-day date needs an available calendar and known day precision."
        )
    if calendar is not None:
        if mode == "year":
            info = date_info(calendar, year)
            return info["year_start"] + (info["year_days"] - 1 if upper else 0)
        if upper and mode == "month":
            day = date_info(calendar, year, month)["month_lengths"][month - 1]
        return date_info(calendar, year, month, day, identity)["ordinal"]
    if upper and mode in ("year", "month"):
        if mode == "year":
            month = 60
        day = MAX_DAY
    return year * RECORDED_YEAR_DAYS + (month - 1) * MAX_DAY + day - 1


def date_sort_order(data, calendar=None):
    try:
        return date_value(data, calendar)
    except (ValueError, TypeError, KeyError, IndexError):
        year, month, day = date_tuple(data)
        try:
            start = (
                date_info(calendar, year)["year_start"]
                if calendar is not None
                else year * RECORDED_YEAR_DAYS
            )
        except (ValueError, TypeError, KeyError, IndexError):
            start = year * RECORDED_YEAR_DAYS
        return start + (month - 1) * MAX_DAY + day - 1


def date_label(data, calendar=None, end=False):
    year, month, day = date_tuple(data, end)
    mode = precision(data, end)
    months = config(calendar)[0] if calendar is not None else []
    name = (
        months[month - 1]["name"]
        if 1 <= month <= len(months)
        else "Month " + str(month)
    )
    identity = special_id(data, end)
    unavailable = (
        data.get("end_special_day_unavailable")
        if end and data.get("end_year") not in (None, "")
        else data.get("special_day_unavailable")
    )
    if identity or unavailable:
        period = next(
            (
                row
                for row in (calendar or {}).get("special_days", [])
                if row["id"] == identity
            ),
            None,
        )
        name = period["name"] if period else "Unavailable special day"
        label = f"{name} {day}, {year}"
    else:
        label = (
            str(year)
            if mode == "year"
            else f"{name}, {year}"
            if mode == "month"
            else f"{name} {day}, {year}"
        )
    approximate = (
        data.get("end_approximate", data.get("date_approximate", False))
        if end
        else data.get("date_approximate", False)
    )
    return ("circa " if approximate else "") + label


def date_projection(data, calendar=None, era=False):
    result = {
        "date_label": date_label(data, calendar),
        "end_label": date_label(data, calendar, True),
        "ordinal": None,
        "end_ordinal": None,
        "uncertain": precision(data) != "day"
        or precision(data, True) != "day"
        or bool(data.get("date_approximate") or data.get("end_approximate")),
        "open_ended": era and data.get("end_year") in (None, ""),
    }
    try:
        if data.get("calendar_unavailable"):
            raise ValueError(
                "The calendar is unavailable. Its recorded date has been kept."
            )
        start = date_value(data, calendar)
        end = date_value(data, calendar, True)
        if end < start:
            raise ValueError("The recorded end date is before the start date.")
        result.update(ordinal=start, end_ordinal=None if result["open_ended"] else end)
    except (ValueError, TypeError, KeyError, IndexError) as error:
        result["date_warning"] = str(error)
    return result
