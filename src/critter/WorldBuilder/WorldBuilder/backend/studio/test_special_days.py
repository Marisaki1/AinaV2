import copy
import json
import tempfile
from pathlib import Path
from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase, override_settings
from .calendar_engine import (
    config,
    date_info,
    date_from_ordinal,
    month_preview,
    definition,
)
from .historical_dates import date_value
from .recurrence import (
    occurrences,
    selected_occurrence,
    occurrence_id,
    validate_recurrence,
)
from .models import World, Resource
from .services import save_resource, store_asset, world_archive, import_world_archive
from .tests import picture

CAL = {
    "months": [{"name": "Dawn", "days": 3}, {"name": "Dusk", "days": 2}],
    "weekdays": ["A", "B", "C"],
    "moons": [{"id": "moon", "name": "Moon", "period": 8}],
    "special_days": [
        {"id": "new", "name": "New year", "after_month": 0, "days": 1},
        {"id": "mid", "name": "Still days", "after_month": 1, "days": 2},
        {
            "id": "end",
            "name": "Leap vigil",
            "after_month": 2,
            "days": 1,
            "outside_week": False,
            "interval": 2,
        },
    ],
}


class SpecialDayArithmeticTests(SimpleTestCase):
    def test_year_layout_and_regular_month_numbers(self):
        info = date_info(CAL, 0)
        self.assertEqual(
            (info["year_start"], info["ordinal"], info["year_days"]), (0, 1, 9)
        )
        self.assertEqual(info["month_lengths"], [3, 2])
        self.assertEqual(date_info(CAL, 0, 2)["ordinal"], 6)
        self.assertEqual(date_info(CAL, 0, 1, 1, "mid")["ordinal"], 4)

    def test_outside_week_days_pause_week_but_advance_moon(self):
        before = date_info(CAL, 0, 1, 3)
        special = date_info(CAL, 0, 1, 1, "mid")
        after = date_info(CAL, 0, 2, 1)
        self.assertEqual(
            (before["weekday"], special["weekday"], after["weekday"]), ("C", None, "A")
        )
        self.assertIsNone(special["weekday_index"])
        self.assertEqual(special["moons"][0]["cycle_day"], 5)
        self.assertEqual(after["moons"][0]["cycle_day"], 7)

    def test_inside_week_special_days_advance_week(self):
        data = copy.deepcopy(CAL)
        data["special_days"][1]["outside_week"] = False
        self.assertEqual(date_info(data, 0, 2)["weekday"], "C")
        self.assertEqual(date_info(data, 1)["weekday"], "C")

    def test_week_reset_modes(self):
        for mode in ["continuous", "reset_month", "reset_year"]:
            data = {**CAL, "week_mode": mode}
            self.assertIsNone(date_info(data, -1, 1, 1, "new")["weekday"])
        data = copy.deepcopy(CAL)
        data["week_mode"] = "reset_month"
        data["special_days"][1]["outside_week"] = False
        self.assertEqual(date_info(data, 7, 1, 1, "mid")["weekday"], "A")
        self.assertEqual(date_info(data, 7, 2)["weekday"], "A")

    def test_inverse_all_dates_across_signed_years_and_boundaries(self):
        for year in [-1000000000, -5, -1, 0, 1, 4, 1000000000]:
            info = date_info(CAL, year)
            for offset in range(info["year_days"]):
                result = date_from_ordinal(CAL, info["year_start"] + offset)
                self.assertEqual(
                    date_info(
                        CAL,
                        result["year"],
                        result["month"],
                        result["day"],
                        result["special_day_id"],
                    ),
                    result,
                )
        maximum = date_info(CAL, 1000000000)
        with self.assertRaises(ValueError):
            date_from_ordinal(CAL, maximum["year_start"] + maximum["year_days"])

    def test_year_precision_includes_first_and_last_special_days(self):
        data = {"year": 0, "date_precision": "year"}
        self.assertEqual(date_value(data, CAL), 0)
        self.assertEqual(date_value(data, CAL, True), 8)
        self.assertEqual(date_from_ordinal(CAL, 0)["special_day_id"], "new")
        self.assertEqual(date_from_ordinal(CAL, 8)["special_day_id"], "end")

    def test_month_precision_excludes_non_month_periods(self):
        data = {"year": 0, "month": 1, "date_precision": "month"}
        self.assertEqual((date_value(data, CAL), date_value(data, CAL, True)), (1, 3))

    def test_special_preview_and_missing_periods(self):
        value = month_preview(CAL, 0, 1, "mid")
        self.assertEqual(len(value["days"]), 2)
        self.assertTrue(all(d["weekday"] is None for d in value["days"]))
        with self.assertRaises(ValueError):
            date_info(CAL, 1, 1, 1, "end")
        with self.assertRaises(ValueError):
            date_info(CAL, 0, 1, 3, "mid")

    def test_periodic_offsets_exceptions_and_inverse(self):
        data = {
            "months": [{"name": "Only", "days": 1}],
            "special_days": [
                {
                    "id": "leap",
                    "name": "Century day",
                    "after_month": 1,
                    "interval": 4,
                    "offset": 2,
                    "except_every": 100,
                    "except_unless": 400,
                }
            ],
        }
        self.assertEqual(date_info(data, 1902)["year_days"], 1)
        self.assertEqual(date_info(data, 2002)["year_days"], 2)
        for year in range(-15, 16):
            first = date_info(data, year)["year_start"]
            last = date_info(data, year + 1)["year_start"]
            self.assertEqual(last - first, date_info(data, year)["year_days"])

    def test_default_leap_interval_stays_four_with_special_days(self):
        data = {
            "months": [{"name": "Only", "days": 1}],
            "leap_rules": [{"id": "l", "name": "Leap", "month": 1}],
        }
        self.assertEqual(date_info(data, 4)["ordinal"], 5)
        self.assertEqual(date_info(data, -4)["year_days"], 2)

    def test_ordered_periods_at_same_boundary_keep_ids(self):
        data = copy.deepcopy(CAL)
        data["special_days"].append({"id": "other", "name": "Other", "after_month": 1})
        first = date_info(data, 0, 1, 1, "other")["ordinal"]
        data["special_days"][1], data["special_days"][3] = (
            data["special_days"][3],
            data["special_days"][1],
        )
        self.assertLess(date_info(data, 0, 1, 1, "other")["ordinal"], first)

    def test_invalid_period_settings(self):
        for patch in [
            {"id": ""},
            {"days": 0},
            {"days": 21},
            {"after_month": 3},
            {"outside_week": 1},
            {"interval": 0},
            {"offset": True},
            {"except_every": 3, "interval": 2},
            {"except_every": 0, "except_unless": 4},
            {"html": "<script>"},
        ]:
            data = copy.deepcopy(CAL)
            data["special_days"][0].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                config(data)
        with self.assertRaises(ValueError):
            config({**CAL, "special_days": [CAL["special_days"][0]] * 2})
        with self.assertRaises(ValueError):
            config(
                {
                    **CAL,
                    "special_days": [{"id": str(i), "name": "Day"} for i in range(25)],
                }
            )

    def test_daily_recurrence_moves_between_regular_and_special_dates(self):
        data = {"year": 0, "month": 1, "day": 3, "recurrence": {"frequency": "daily"}}
        values = list(occurrences(data, CAL, 0, 0))
        self.assertNotIn("special_day_id", values[0])
        self.assertEqual(values[1]["special_day_id"], "mid")
        self.assertNotIn("special_day_id", values[3])
        for value in values:
            self.assertEqual(
                selected_occurrence(
                    data,
                    CAL,
                    f"{value['year']}:{value['month']}:{value['day']}",
                    value.get("special_day_id"),
                ),
                value,
            )

    def test_yearly_special_recurrence_skips_inactive_period(self):
        data = {
            "year": 0,
            "day": 1,
            "special_day_id": "end",
            "recurrence": {"frequency": "yearly", "invalid_date": "last_day"},
        }
        self.assertEqual([d["year"] for d in occurrences(data, CAL, 0, 4)], [0, 2, 4])
        self.assertEqual(
            selected_occurrence(data, CAL, "2:1:1", "end")["special_day_id"], "end"
        )

    def test_monthly_recurrence_cannot_forge_special_membership(self):
        data = {"year": 0, "month": 1, "day": 1, "recurrence": {"frequency": "monthly"}}
        with self.assertRaises(ValueError):
            selected_occurrence(data, CAL, "0:1:1", "mid")
        with self.assertRaises(ValueError):
            validate_recurrence({**data, "special_day_id": "mid"}, CAL)

    def test_duration_crosses_special_days_and_end_identity_is_cleared(self):
        data = {
            "year": 0,
            "month": 2,
            "day": 2,
            "end_year": 1,
            "end_month": 1,
            "end_day": 1,
            "end_special_day_id": "new",
            "recurrence": {"frequency": "yearly"},
        }
        values = list(occurrences(data, CAL, 0, 2))
        later = next(row for row in values if row["year"] == 1)
        self.assertNotIn("end_special_day_id", later)
        for row in values:
            self.assertEqual(date_value(row, CAL, True) - date_value(row, CAL), 2)

    def test_occurrence_identity_distinguishes_period_and_ordinary_date(self):
        ordinary = {"year": 0, "month": 1, "day": 1}
        special = {**ordinary, "special_day_id": "new:祭"}
        self.assertNotEqual(
            occurrence_id("source", ordinary), occurrence_id("source", special)
        )


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class SpecialDayIntegrationTests(TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        settings = override_settings(MEDIA_ROOT=Path(temp.name))
        settings.enable()
        self.addCleanup(settings.disable)
        self.user = User.objects.create_user("special-owner", password="test-password")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Special days")
        self.cal = self.add("Calendar", "calendar", CAL)

    def add(self, title, kind, data, **fields):
        return save_resource(
            self.world,
            {
                "title": title,
                "kind": kind,
                "data": data,
                "visibility": "public",
                **fields,
            },
        )

    def event(self, **fields):
        return self.add(
            "Moment",
            "event",
            {"calendar_id": str(self.cal.id), "year": 0, "day": 1, **fields},
        )

    def post(self, path, value):
        return self.client.post(
            "/api" + path, json.dumps(value), content_type="application/json"
        )

    def publish(self, r):
        self.assertEqual(
            self.post(
                f"/resources/{r.id}/publish", {"expected_revision": r.revision}
            ).status_code,
            200,
        )

    def history(self, reader=False):
        return self.client.get(
            f"/api/worlds/{self.world.id}/history",
            {
                "calendar": str(self.cal.id),
                **({"audience": "reader"} if reader else {}),
            },
        ).json()

    def update(self, r, **fields):
        return save_resource(self.world, {"expected_revision": r.revision, **fields}, r)

    def test_preview_tool_roundtrip_special_ordinal(self):
        response = self.post(
            "/tools/calendar",
            {
                "calendar": CAL,
                "year": 0,
                "special_day_id": "mid",
                "day": 2,
                "include_month": True,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ordinal"], 5)
        self.assertEqual(len(response.json()["days"]), 2)
        inverse = self.post("/tools/calendar", {"calendar": CAL, "ordinal": 5}).json()
        self.assertEqual(inverse["special_day_id"], "mid")

    def test_history_sorts_special_days_between_months(self):
        a = self.event(month=1, day=3)
        b = self.event(special_day_id="mid")
        c = self.event(month=2)
        self.assertEqual(
            [r["id"] for r in self.history()["events"]],
            [str(a.id), str(b.id), str(c.id)],
        )
        self.assertEqual(self.history()["events"][1]["date_label"], "Still days 1, 0")

    def test_date_validation_requires_available_period_and_known_day(self):
        for fields in [
            {"special_day_id": "missing"},
            {"special_day_id": "mid", "day": 3},
            {"special_day_id": "end", "year": 1},
            {"special_day_id": True},
            {"special_day_id": "mid", "date_precision": "year"},
            {"special_day_id": "mid", "calendar_id": ""},
            {"end_special_day_id": "mid"},
        ]:
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                self.event(**fields)

    def test_era_containment_and_year_precision_include_specials(self):
        era = self.add(
            "Age",
            "era",
            {
                "calendar_id": str(self.cal.id),
                "year": 0,
                "date_precision": "year",
                "end_year": 0,
            },
        )
        self.event(special_day_id="new", era_id=str(era.id))
        self.event(special_day_id="end", era_id=str(era.id))
        self.assertEqual(self.history()["eras"][0]["ordinal"], 0)
        self.assertEqual(self.history()["eras"][0]["end_ordinal"], 8)

    def test_reader_uses_published_period_definition_and_name(self):
        event = self.event(special_day_id="mid")
        self.publish(self.cal)
        self.publish(event)
        changed = copy.deepcopy(CAL)
        changed["special_days"][1]["name"] = "Private draft name"
        self.cal = self.update(self.cal, data=changed)
        value = self.client.get(f"/api/resources/{event.id}?audience=reader").json()
        self.assertEqual(value["date_context"]["date_label"], "Still days 1, 0")
        self.assertNotIn("Private draft name", json.dumps(value))

    def test_private_calendar_redacts_special_identity_and_labels(self):
        event = self.event(special_day_id="mid")
        self.publish(event)
        value = self.client.get(f"/api/resources/{event.id}?audience=reader").json()
        self.assertNotIn("special_day_id", value["data"])
        self.assertTrue(value["data"]["special_day_unavailable"])
        self.assertNotIn("Still days", json.dumps(value))
        self.assertIsNone(value["date_context"]["ordinal"])

    def test_deleted_definition_keeps_record_warning_and_unrelated_edits(self):
        event = self.event(special_day_id="mid")
        self.publish(self.cal)
        self.publish(event)
        self.cal = self.update(self.cal, data={**CAL, "special_days": []})
        self.publish(self.cal)
        event = self.update(event, summary="Keep recorded date")
        value = self.history()["events"][0]
        self.assertIsNone(value["ordinal"])
        self.assertIn("date_warning", value)
        reader = self.history(True)["events"][0]
        self.assertNotIn("special_day_id", reader["data"])
        with self.assertRaises(ValueError):
            self.update(event, data={**event.data, "day": 2})

    def test_named_definition_export_import_preserves_special_settings(self):
        value = self.client.get(f"/api/resources/{self.cal.id}/calendar-export").json()
        response = self.post(
            f"/worlds/{self.world.id}/calendars/import", {"definition": value}
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"], definition(CAL))
        self.assertEqual(response.json()["visibility"], "private")

    def test_historical_maps_use_actual_special_order_and_unique_dates(self):
        asset = store_asset(self.world, picture())
        item = self.add(
            "Map",
            "map",
            {
                "asset_id": str(asset.id),
                "calendar_id": str(self.cal.id),
                "versions": [
                    {
                        "id": "ordinary",
                        "name": "Ordinary",
                        "year": 0,
                        "month": 1,
                        "day": 1,
                        "scene": {},
                    },
                    {
                        "id": "special",
                        "name": "Special",
                        "year": 0,
                        "month": 1,
                        "day": 1,
                        "special_day_id": "mid",
                        "scene": {},
                    },
                ],
            },
        )
        before = self.event(month=1, day=3)
        after = self.event(special_day_id="mid")
        route = f"/api/resources/{item.id}/map-state"
        self.assertEqual(
            self.client.get(route, {"event": str(before.id)}).json()["version"]["id"],
            "ordinary",
        )
        self.assertEqual(
            self.client.get(route, {"event": str(after.id)}).json()["version"]["id"],
            "special",
        )
        with self.assertRaises(ValueError):
            self.update(
                item,
                data={
                    **item.data,
                    "versions": [
                        *item.data["versions"],
                        {**item.data["versions"][1], "id": "duplicate", "month": 2},
                    ],
                },
            )

    def test_recurring_special_occurrence_selects_dated_map(self):
        item = self.add(
            "Map",
            "map",
            {
                "calendar_id": str(self.cal.id),
                "versions": [
                    {
                        "id": "v",
                        "name": "Special scene",
                        "year": 2,
                        "month": 1,
                        "day": 1,
                        "special_day_id": "mid",
                        "scene": {},
                    }
                ],
            },
        )
        event = self.event(special_day_id="mid", recurrence={"frequency": "yearly"})
        response = self.client.get(
            f"/api/resources/{item.id}/map-state",
            {"event": str(event.id), "occurrence": "2:1:1", "special_day_id": "mid"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"]["id"], "v")
        self.assertEqual(
            self.client.get(
                f"/api/resources/{item.id}/map-state",
                {"event": str(event.id), "occurrence": "2:1:1"},
            ).status_code,
            400,
        )

    def test_private_or_removed_special_map_dates_do_not_leak_or_change_dates(self):
        item = self.add(
            "Map",
            "map",
            {
                "calendar_id": str(self.cal.id),
                "versions": [
                    {
                        "id": "v",
                        "name": "Special",
                        "year": 0,
                        "month": 1,
                        "day": 1,
                        "special_day_id": "mid",
                        "scene": {},
                    }
                ],
            },
        )
        event = self.event(month=2)
        self.publish(self.cal)
        self.publish(item)
        self.publish(event)
        self.cal = self.update(self.cal, data={**CAL, "special_days": []})
        self.publish(self.cal)
        reader = self.client.get(f"/api/resources/{item.id}?audience=reader").json()
        self.assertNotIn("special_day_id", reader["data"]["versions"][0])
        self.assertTrue(reader["data"]["versions"][0]["special_day_unavailable"])
        state = self.client.get(
            f"/api/resources/{item.id}/map-state",
            {"event": str(event.id), "audience": "reader"},
        ).json()
        self.assertIsNone(state["version"])
        self.assertTrue(state["warnings"])

    def test_archive_and_revision_restore_keep_stable_period_references(self):
        event = self.event(
            special_day_id="mid",
            end_year=1,
            end_special_day_id="new",
            recurrence={"frequency": "yearly"},
        )
        self.publish(self.cal)
        self.publish(event)
        copied = import_world_archive(self.user, world_archive(self.world))
        clone = Resource.objects.get(world=copied, kind="event")
        self.assertEqual(clone.data["special_day_id"], "mid")
        self.assertEqual(clone.published["data"]["end_special_day_id"], "new")
        self.assertEqual(
            Resource.objects.get(world=copied, kind="calendar").data["special_days"],
            CAL["special_days"],
        )
        event = self.update(event, data={**event.data, "special_day_id": "new"})
        response = self.post(
            f"/resources/{event.id}/restore",
            {"number": 1, "expected_revision": event.revision},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["special_day_id"], "mid")
