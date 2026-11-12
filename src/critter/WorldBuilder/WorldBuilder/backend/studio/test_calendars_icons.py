import json
import tempfile
from pathlib import Path

from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.test import TestCase, SimpleTestCase, override_settings
from .calendar_engine import config, date_info, date_from_ordinal, month_preview
from .cartography import MARKER_SYMBOLS
from .history import date_value
from .models import World, Resource
from .services import save_resource, store_asset, world_archive, import_world_archive
from .tests import picture


def calendar(**patch):
    return {
        "months": [{"name": "First", "days": 30}, {"name": "Second", "days": 20}],
        "weekdays": ["A", "B", "C", "D", "E", "F", "G"],
        **patch,
    }


def leap(**patch):
    return {
        "id": "leap",
        "name": "Leap",
        "interval": 4,
        "offset": 0,
        "month": 2,
        "days": 1,
        "except_every": 100,
        "except_unless": 400,
        **patch,
    }


class CalendarArithmeticTests(SimpleTestCase):
    def test_gregorian_exceptions_and_restoration(self):
        data = calendar(leap_rules=[leap()])
        for year, length in [
            (0, 21),
            (4, 21),
            (1900, 20),
            (2000, 21),
            (-100, 20),
            (-400, 21),
        ]:
            with self.subTest(year=year):
                self.assertEqual(date_info(data, year)["month_lengths"][1], length)
        self.assertEqual(date_info(data, 400)["ordinal"], 400 * 50 + 97)

    def test_offsets_and_multiple_rules_match_brute_force(self):
        data = calendar(
            leap_rules=[
                leap(interval=3, offset=2, except_every=12, except_unless=24, days=2),
                leap(
                    id="extra",
                    interval=5,
                    offset=-4,
                    except_every=0,
                    except_unless=0,
                    month=1,
                    days=3,
                ),
            ]
        )
        origin = date_info(data, -120)["ordinal"]
        for year in range(-120, 121):
            info = date_info(data, year)
            self.assertEqual(info["ordinal"], origin)
            n1, n2 = year - 2, year + 4
            expected = (
                50
                + (2 if n1 % 3 == 0 and (n1 % 12 != 0 or n1 % 24 == 0) else 0)
                + (3 if n2 % 5 == 0 else 0)
            )
            self.assertEqual(info["year_days"], expected)
            origin += expected

    def test_inverse_extremes_and_negative_epoch(self):
        data = calendar(
            leap_rules=[leap(offset=-17)],
            moons=[{"id": "red", "name": "Red moon", "period": 31, "offset": -7}],
        )
        for year in [-1000000000, -401, -1, 0, 1, 400, 1000000000]:
            for month in [1, 2]:
                last = date_info(data, year)["month_lengths"][month - 1]
                for day in [1, last]:
                    value = date_info(data, year, month, day)
                    self.assertEqual(date_from_ordinal(data, value["ordinal"]), value)
        with self.assertRaises(ValueError):
            date_from_ordinal(data, 10**15)

    def test_legacy_arithmetic_is_unchanged(self):
        for every in [0, 2, 4, 9999]:
            data = calendar(leap_every=every, leap_month=1)
            for year in range(-17, 18):
                expected = year * 50 + (((year - 1) // every + 1) if every else 0)
                self.assertEqual(date_info(data, year)["ordinal"], expected)

    def test_explicit_empty_rules_and_moons_disable_legacy(self):
        info = date_info(
            calendar(leap_every=2, leap_rules=[], moon_cycle=28, moons=[]), 0
        )
        self.assertEqual(info["year_days"], 50)
        self.assertEqual(info["moons"], [])

    def test_weekday_modes_and_negative_offset(self):
        data = calendar(day_offset=-2)
        continuous = date_info(data, 1, 2, 3)
        self.assertEqual(continuous["weekday_index"], (82 - 2) % 7)
        self.assertEqual(
            date_info({**data, "week_mode": "reset_year"}, 1, 2, 3)["weekday_index"],
            (32 - 2) % 7,
        )
        self.assertEqual(
            date_info({**data, "week_mode": "reset_month"}, 1, 2, 3)["weekday_index"], 0
        )

    def test_month_days_match_individual_date_info(self):
        for mode in ["continuous", "reset_month", "reset_year"]:
            data = calendar(week_mode=mode, leap_rules=[leap()], day_offset=3)
            preview = month_preview(data, -4, 2)
            for d in preview["days"]:
                info = date_info(data, -4, 2, d["day"])
                self.assertEqual(d["weekday"], info["weekday"])
                self.assertEqual(d["moons"], info["moons"])

    def test_multiple_moons_phases_offsets_and_single_day_cycle(self):
        data = calendar(
            moons=[
                {"id": "a", "name": "Silver", "period": 8, "offset": -2},
                {"id": "b", "name": "Red", "period": 16, "offset": 2},
                {"id": "c", "name": "Star", "period": 1, "offset": 0},
            ]
        )
        first = date_from_ordinal(data, -2)["moons"]
        self.assertEqual(first[0]["phase"], "New")
        self.assertEqual(date_from_ordinal(data, 2)["moons"][0]["phase"], "Full")
        self.assertEqual(date_from_ordinal(data, 2)["moons"][1]["phase"], "New")
        self.assertEqual(first[2]["cycle_day"], 1)

    def test_rule_validation(self):
        for patch in [
            {"interval": 0},
            {"days": 11},
            {"except_every": 5},
            {"except_unless": 350},
            {"except_every": 0, "except_unless": 400},
            {"month": 3},
            {"offset": True},
            {"name": ""},
            {"html": "<script>"},
        ]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                config(calendar(leap_rules=[leap(**patch)]))
        with self.assertRaises(ValueError):
            config(calendar(leap_rules=[leap(), leap()]))
        with self.assertRaises(ValueError):
            config(calendar(leap_rules=[leap(id=str(i)) for i in range(13)]))

    def test_cycle_and_weekday_validation(self):
        for patch in [
            {"day_offset": True},
            {"day_offset": 100001},
            {"week_mode": "random"},
            {"moons": [{"id": "a", "name": "A", "period": 0}]},
            {"moons": [{"id": "a", "name": "A"}] * 2},
            {"moons": [{"id": str(i), "name": "A"} for i in range(9)]},
        ]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                config(calendar(**patch))

    def test_maximum_month_and_recorded_date_order(self):
        data = calendar(
            months=[{"name": "Long", "days": 1000}],
            leap_rules=[leap(id=str(i), month=1, days=10) for i in range(12)],
        )
        self.assertEqual(date_info(data, 0, 1, 1120)["day"], 1120)
        with self.assertRaises(ValueError):
            date_info(data, 0, 1, 1121)
        self.assertLess(
            date_value({"year": 0, "month": 60, "day": 2000}),
            date_value({"year": 1, "month": 1, "day": 1}),
        )


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class CalendarIconIntegrationTests(TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        settings = override_settings(MEDIA_ROOT=Path(temp.name))
        settings.enable()
        self.addCleanup(settings.disable)
        self.user = User.objects.create_user("calendar-owner", password="test-password")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Calendar world")
        self.data = calendar(
            leap_rules=[leap()],
            week_mode="reset_month",
            day_offset=2,
            moons=[
                {"id": "a", "name": "Silver", "period": 28, "offset": 3},
                {"id": "b", "name": "Red", "period": 31, "offset": -2},
            ],
        )
        self.cal = self.add("Calendar", "calendar", self.data)
        self.asset = store_asset(self.world, picture())

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

    def send(self, path, value):
        return self.client.post(
            "/api" + path, json.dumps(value), content_type="application/json"
        )

    def publish(self, resource):
        self.assertEqual(
            self.send(
                f"/resources/{resource.id}/publish",
                {"expected_revision": resource.revision},
            ).status_code,
            200,
        )

    def exported(self, reader=False):
        return self.client.get(
            f"/api/resources/{self.cal.id}/calendar-export"
            + ("?audience=reader" if reader else "")
        )

    def test_preview_inverse_month_and_bad_types(self):
        result = self.send(
            "/tools/calendar",
            {
                "calendar": self.data,
                "year": 2000,
                "month": 2,
                "day": 21,
                "include_month": True,
            },
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(result.json()["days"]), 21)
        inverse = self.send(
            "/tools/calendar",
            {"calendar": self.data, "ordinal": result.json()["ordinal"]},
        )
        self.assertEqual(inverse.json()["day"], 21)
        self.assertEqual(
            self.send(
                "/tools/calendar", {"calendar": self.data, "ordinal": True}
            ).status_code,
            400,
        )

    def test_export_whitelists_settings(self):
        self.cal = save_resource(
            self.world,
            {
                "expected_revision": self.cal.revision,
                "private_notes": "Owner secret",
                "data": {
                    **self.data,
                    "gm_notes": "Secret",
                    "provenance": {"path": "secret"},
                },
            },
            self.cal,
        )
        response = self.exported()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["calendar"], self.data)
        self.assertNotIn("Secret", response.content.decode())
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertIn("attachment", response["Content-Disposition"])

    def test_import_creates_private_copy_without_overwriting(self):
        response = self.send(
            f"/worlds/{self.world.id}/calendars/import",
            {"definition": self.exported().json()},
        )
        self.assertEqual(response.status_code, 201)
        value = response.json()
        self.assertEqual(value["visibility"], "private")
        self.assertEqual(value["data"], self.data)
        self.assertNotEqual(value["id"], str(self.cal.id))
        self.cal.refresh_from_db()
        self.assertEqual(self.cal.revision, 1)

    def test_export_excludes_nested_month_metadata(self):
        self.cal = save_resource(
            self.world,
            {
                "expected_revision": 1,
                "data": {
                    **self.data,
                    "months": [
                        {**m, "private_notes": "nested secret"}
                        for m in self.data["months"]
                    ],
                },
            },
            self.cal,
        )
        self.assertEqual(self.exported().json()["calendar"], self.data)
        self.assertNotIn("secret", self.exported().content.decode())

    def test_anonymous_calendar_endpoints_require_login(self):
        self.client.logout()
        self.assertEqual(self.exported().status_code, 401)
        self.assertEqual(
            self.send(f"/worlds/{self.world.id}/calendars/import", {}).status_code, 401
        )

    def test_reader_export_uses_published_snapshot(self):
        self.assertEqual(self.exported(True).status_code, 404)
        self.publish(self.cal)
        self.cal = save_resource(
            self.world,
            {
                "expected_revision": self.cal.revision,
                "title": "Draft only",
                "data": calendar(),
            },
            self.cal,
        )
        value = self.exported(True).json()
        self.assertEqual(value["name"], "Calendar")
        self.assertEqual(value["calendar"], self.data)

    def test_export_foreign_deleted_and_wrong_kind(self):
        other = User.objects.create_user("outsider")
        self.client.force_login(other)
        self.assertEqual(self.exported().status_code, 404)
        self.client.force_login(self.user)
        item = self.add("Article", "article", {})
        self.assertEqual(
            self.client.get(f"/api/resources/{item.id}/calendar-export").status_code,
            404,
        )
        self.client.delete(
            f"/api/resources/{self.cal.id}",
            json.dumps({"expected_revision": self.cal.revision}),
            content_type="application/json",
        )
        self.assertEqual(self.exported().status_code, 404)

    def test_bad_import_is_atomic_and_owner_scoped(self):
        original = self.exported().json()
        count = Resource.objects.count()
        for patch in [
            {"format": "other"},
            {"calendar": []},
            {"calendar": {**self.data, "gm_notes": "private"}},
            {"calendar": {**self.data, "day_offset": False}},
            {"name": ""},
        ]:
            with self.subTest(patch=patch):
                response = self.send(
                    f"/worlds/{self.world.id}/calendars/import",
                    {"definition": {**original, **patch}},
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(Resource.objects.count(), count)
        other = User.objects.create_user("outsider")
        self.client.force_login(other)
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/calendars/import", {"definition": original}
            ).status_code,
            404,
        )

    def test_config_save_validates_offset_and_stale_edits(self):
        response = self.client.patch(
            f"/api/resources/{self.cal.id}",
            json.dumps(
                {"expected_revision": 1, "data": {**self.data, "day_offset": False}}
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.cal = save_resource(
            self.world, {"expected_revision": 1, "summary": "Changed"}, self.cal
        )
        response = self.client.patch(
            f"/api/resources/{self.cal.id}",
            json.dumps({"expected_revision": 1, "data": self.data}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)

    def marker(self, **patch):
        return {
            "id": "pin",
            "type": "pin",
            "label": "Castle",
            "x": 0.2,
            "y": 0.3,
            "symbol": "castle",
            "icon_size": 48,
            **patch,
        }

    def test_each_safe_symbol_and_raster_icon_can_save(self):
        for symbol in MARKER_SYMBOLS:
            item = self.add(
                symbol,
                "map",
                {
                    "markers": [
                        self.marker(symbol=symbol, icon_asset_id=str(self.asset.id))
                    ]
                },
            )
            self.assertEqual(item.data["markers"][0]["symbol"], symbol)

    def test_icons_reject_html_unknown_symbols_sizes_and_foreign_assets(self):
        foreign = World.objects.create(owner=self.user, name="Other")
        asset = store_asset(foreign, picture())
        for patch in [
            {"symbol": "<svg onload=alert(1)>"},
            {"icon_size": 15},
            {"icon_size": 65},
            {"icon_size": True},
            {"icon_html": "<img onerror=alert(1)>"},
            {"html": "<b>raw</b>"},
            {"icon_asset_id": str(asset.id)},
            {"icon_asset_id": "not-a-uuid"},
        ]:
            with (
                self.subTest(patch=patch),
                self.assertRaises((ValueError, ValidationError)),
            ):
                self.add("Bad", "map", {"markers": [self.marker(**patch)]})

    def test_reader_removes_private_icon_references(self):
        item = self.add(
            "Map",
            "map",
            {
                "markers": [
                    self.marker(
                        id="secret", private=True, icon_asset_id=str(self.asset.id)
                    ),
                    self.marker(id="public"),
                ]
            },
        )
        self.publish(item)
        response = self.client.get(f"/api/resources/{item.id}?audience=reader")
        self.assertNotIn(str(self.asset.id), response.content.decode())
        self.assertEqual(len(response.json()["data"]["markers"]), 1)

    def test_icons_survive_historical_scenes_and_archive_remapping(self):
        item = self.add(
            "Map",
            "map",
            {
                "asset_id": str(self.asset.id),
                "calendar_id": str(self.cal.id),
                "markers": [self.marker(icon_asset_id=str(self.asset.id))],
                "versions": [
                    {
                        "id": "v",
                        "name": "Past",
                        "year": 2000,
                        "month": 2,
                        "day": 21,
                        "scene": {
                            "markers": [self.marker(icon_asset_id=str(self.asset.id))]
                        },
                    }
                ],
            },
        )
        restored = import_world_archive(self.user, world_archive(self.world))
        restored = restored[0] if isinstance(restored, tuple) else restored
        copied = Resource.objects.get(world=restored, title="Map")
        self.assertNotEqual(copied.data["asset_id"], str(self.asset.id))
        self.assertEqual(
            copied.data["versions"][0]["scene"]["markers"][0]["icon_asset_id"],
            copied.data["asset_id"],
        )
        self.assertEqual(
            Resource.objects.get(world=restored, kind="calendar").data, self.data
        )
        self.assertEqual(item.data["markers"][0]["symbol"], "castle")

    def test_foreign_icon_inside_dated_scene_is_rejected(self):
        other = World.objects.create(owner=self.user, name="Other")
        asset = store_asset(other, picture())
        with self.assertRaises(ValueError):
            self.add(
                "Map",
                "map",
                {
                    "versions": [
                        {
                            "id": "v",
                            "name": "Past",
                            "year": 0,
                            "scene": {
                                "markers": [self.marker(icon_asset_id=str(asset.id))]
                            },
                        }
                    ]
                },
            )

    def test_event_history_and_dated_map_use_same_leap_date(self):
        item = self.add(
            "Map",
            "map",
            {
                "asset_id": str(self.asset.id),
                "calendar_id": str(self.cal.id),
                "versions": [
                    {
                        "id": "v",
                        "name": "Leap terrain",
                        "year": 2000,
                        "month": 2,
                        "day": 21,
                        "scene": {"markers": [self.marker()]},
                    }
                ],
            },
        )
        event = self.add(
            "Event",
            "event",
            {
                "calendar_id": str(self.cal.id),
                "map_id": str(item.id),
                "year": 2000,
                "month": 2,
                "day": 21,
            },
        )
        response = self.client.get(
            f"/api/worlds/{self.world.id}/history", {"calendar": str(self.cal.id)}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(str(event.id), response.content.decode())
        state = self.client.get(
            f"/api/resources/{item.id}/map-state", {"event": str(event.id)}
        )
        self.assertEqual(state.status_code, 200)
        self.assertIn("Leap terrain", state.content.decode())
        self.cal = save_resource(
            self.world,
            {"expected_revision": 1, "data": {**self.data, "leap_rules": []}},
            self.cal,
        )
        history = self.client.get(
            f"/api/worlds/{self.world.id}/history", {"calendar": str(self.cal.id)}
        ).json()
        self.assertTrue(history["events"][0]["date_warning"])

    def test_long_leap_date_is_accepted_in_event_and_map(self):
        data = calendar(
            months=[{"name": "Long", "days": 1000}],
            leap_rules=[leap(id=str(i), month=1, days=10) for i in range(12)],
        )
        cal = self.add("Long calendar", "calendar", data)
        event = self.add(
            "Long event",
            "event",
            {"calendar_id": str(cal.id), "year": 0, "month": 1, "day": 1120},
        )
        self.assertEqual(event.data["day"], 1120)
        item = self.add(
            "Long map",
            "map",
            {
                "calendar_id": str(cal.id),
                "versions": [
                    {
                        "id": "v",
                        "name": "Long",
                        "year": 0,
                        "month": 1,
                        "day": 1120,
                        "scene": {},
                    }
                ],
            },
        )
        self.assertEqual(item.data["versions"][0]["day"], 1120)
