import json
import tempfile
from pathlib import Path

from django.contrib.auth.models import User
from django.test import TestCase, SimpleTestCase, override_settings
from .historical_dates import date_tuple, date_value, date_label, date_projection
from .models import World, Resource
from .services import save_resource, world_archive, import_world_archive, store_asset
from .tests import picture


CALENDAR = {
    "months": [{"name": "Dawn", "days": 3}, {"name": "Dusk", "days": 2}],
    "weekdays": ["A", "B"],
    "leap_every": 2,
    "leap_month": 2,
}


class HistoricalPrecisionTests(SimpleTestCase):
    def test_year_interval_includes_leap_days(self):
        data = {"year": 0, "month": 60, "day": 2000, "date_precision": "year"}
        self.assertEqual(date_tuple(data), (0, 1, 1))
        self.assertEqual(date_value(data, CALENDAR), 0)
        self.assertEqual(date_value(data, CALENDAR, True), 5)
        self.assertEqual(date_label(data, CALENDAR), "0")

    def test_month_interval_and_estimated_label(self):
        data = {
            "year": 0,
            "month": 2,
            "day": 999,
            "date_precision": "month",
            "date_approximate": True,
        }
        value = date_projection(data, CALENDAR)
        self.assertEqual((value["ordinal"], value["end_ordinal"]), (3, 5))
        self.assertEqual(value["date_label"], "circa Dusk, 0")
        self.assertTrue(value["uncertain"])

    def test_negative_precision_sorting_ignores_unknown_components(self):
        data = {"year": -1, "month": 2, "day": 2, "date_precision": "year"}
        self.assertEqual(date_value(data, CALENDAR), -5)
        self.assertEqual(date_value(data, CALENDAR, True), -1)
        self.assertLess(date_value(data, CALENDAR), date_value({"year": 0}, CALENDAR))

    def test_mixed_end_precision(self):
        data = {"year": 0, "month": 2, "day": 2, "end_year": 0, "end_precision": "year"}
        self.assertEqual(date_projection(data, CALENDAR)["end_ordinal"], 5)
        self.assertEqual(date_label(data, CALENDAR, True), "0")

    def test_circa_day_does_not_invent_margin(self):
        value = date_projection({"year": 0, "date_approximate": True}, CALENDAR)
        self.assertEqual(value["ordinal"], value["end_ordinal"])
        self.assertTrue(value["uncertain"])
        self.assertEqual(value["date_label"], "circa Dawn 1, 0")

    def test_open_ended_era_has_no_invented_end(self):
        value = date_projection(
            {"year": -10, "date_precision": "year"}, CALENDAR, era=True
        )
        self.assertTrue(value["open_ended"])
        self.assertIsNone(value["end_ordinal"])

    def test_recorded_slots_and_bad_calendar_warning(self):
        value = date_projection({"year": -1, "date_precision": "year"})
        self.assertEqual((value["ordinal"], value["end_ordinal"]), (-120000, -1))
        value = date_projection(
            {"calendar_unavailable": True, "year": 0, "date_precision": "year"}
        )
        self.assertIsNone(value["ordinal"])
        self.assertIn("unavailable", value["date_warning"])


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class EraIntegrationTests(TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        settings = override_settings(MEDIA_ROOT=Path(temp.name))
        settings.enable()
        self.addCleanup(settings.disable)
        self.user = User.objects.create_user("era-owner", password="test-password")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Era world")
        self.cal = self.add("Calendar", "calendar", CALENDAR)
        self.era = self.add(
            "Age of rain",
            "era",
            {
                "calendar_id": str(self.cal.id),
                "year": -10,
                "end_year": 10,
                "date_precision": "year",
            },
        )

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

    def event(self, **patch):
        return self.add(
            "Moment",
            "event",
            {
                "calendar_id": str(self.cal.id),
                "year": 0,
                "era_id": str(self.era.id),
                **patch,
            },
        )

    def publish(self, r):
        response = self.client.post(
            f"/api/resources/{r.id}/publish",
            json.dumps({"expected_revision": r.revision}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)

    def update(self, r, **fields):
        return save_resource(self.world, {"expected_revision": r.revision, **fields}, r)

    def history(self, reader=False, **params):
        return self.client.get(
            f"/api/worlds/{self.world.id}/history",
            {
                "calendar": str(self.cal.id),
                **({"audience": "reader"} if reader else {}),
                **params,
            },
        ).json()

    def test_era_creation_open_end_overlap_and_bounds(self):
        self.add("Ongoing age", "era", {"calendar_id": str(self.cal.id), "year": -3})
        self.assertEqual(len(self.history()["eras"]), 2)
        self.assertTrue(
            next(e for e in self.history()["eras"] if e["title"] == "Ongoing age")[
                "open_ended"
            ]
        )
        with self.assertRaises(ValueError):
            self.add("Bad", "era", {"year": 5, "end_year": 4})
        with self.assertRaises(ValueError):
            self.add("Bad", "era", {"year": 0, "era_id": str(self.era.id)})

    def test_events_link_and_history_exposes_labels_intervals(self):
        event = self.event(date_precision="month", month=2, date_approximate=True)
        value = self.history()["events"][0]
        self.assertEqual(value["id"], str(event.id))
        self.assertEqual(value["era_label"], "Age of rain")
        self.assertEqual(value["date_label"], "circa Dusk, 0")
        self.assertEqual((value["ordinal"], value["end_ordinal"]), (3, 5))

    def test_link_requires_era_kind_same_world_calendar_and_containment(self):
        other = World.objects.create(owner=self.user, name="Other")
        foreign = save_resource(other, {"kind": "era", "title": "Foreign"})
        for patch in [
            {"era_id": str(foreign.id)},
            {"era_id": str(self.cal.id)},
            {"calendar_id": ""},
            {"year": -11},
            {"year": 11},
        ]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                self.event(**patch)

    def test_mixed_end_and_start_precision_can_overlap(self):
        event = self.event(month=2, day=2, end_year=0, end_precision="year")
        self.assertEqual(self.history()["events"][0]["end_ordinal"], 5)
        self.assertEqual(event.data["end_precision"], "year")

    def test_event_extent_cannot_cross_era_end(self):
        self.era = self.update(
            self.era,
            data={
                **self.era.data,
                "end_year": 0,
                "end_month": 2,
                "end_day": 2,
                "end_precision": "day",
            },
        )
        with self.assertRaises(ValueError):
            self.event(date_precision="year")
        event = self.event(month=2, day=2)
        self.assertEqual(event.data["day"], 2)

    def test_precision_validation_and_actual_calendar_lengths(self):
        for patch in [
            {"date_precision": "century"},
            {"end_precision": False},
            {"date_approximate": 1},
            {"end_approximate": "yes"},
            {"date_precision": "month", "month": 3},
            {"month": 2, "day": 4},
        ]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                self.event(**patch)
        self.event(month=2, day=2000, date_precision="month")
        self.event(month=60, day=2000, date_precision="year")

    def test_reader_eras_use_snapshots_and_hide_private_labels_ids(self):
        event = self.event()
        self.publish(self.cal)
        self.publish(event)
        reader = self.history(True)
        self.assertEqual(reader["eras"], [])
        self.assertNotIn(str(self.era.id), json.dumps(reader))
        self.assertNotIn("Age of rain", json.dumps(reader))
        self.publish(self.era)
        self.era = self.update(
            self.era, title="Secret draft era", data={**self.era.data, "year": -99}
        )
        reader = self.history(True)
        self.assertEqual(reader["eras"][0]["title"], "Age of rain")
        self.assertEqual(reader["eras"][0]["data"]["year"], -10)
        self.assertNotIn("Secret draft era", json.dumps(reader))

    def test_reader_event_date_context_uses_published_precision_calendar(self):
        event = self.event(date_precision="month", month=2)
        self.publish(self.cal)
        self.publish(self.era)
        self.publish(event)
        event = self.update(
            event, data={**event.data, "date_precision": "day", "day": 3}
        )
        self.cal = self.update(
            self.cal,
            data={
                **CALENDAR,
                "months": [
                    {"name": "Secret rename", "days": 3},
                    {"name": "Draft dusk", "days": 2},
                ],
            },
        )
        value = self.client.get(f"/api/resources/{event.id}?audience=reader").json()
        self.assertEqual(value["date_context"]["date_label"], "Dusk, 0")
        self.assertNotIn("Draft dusk", json.dumps(value))
        self.assertEqual(value["date_context"]["era_label"], "Age of rain")

    def test_private_calendar_removes_era_dates_from_reader_axis(self):
        self.publish(self.era)
        value = self.history(True, calendar="unavailable")
        self.assertIsNone(value["axis"])
        self.assertNotIn(str(self.cal.id), json.dumps(value))
        self.assertIsNone(value["eras"][0]["ordinal"])

    def test_date_changes_validate_but_unrelated_edits_keep_historical_record(self):
        event = self.event(year=5)
        self.era = self.update(self.era, data={**self.era.data, "end_year": 1})
        value = self.history()["events"][0]
        self.assertIn("beyond", value["era_warning"])
        self.assertIsNotNone(value["ordinal"])
        event = self.update(event, summary="Recorded lore kept")
        with self.assertRaises(ValueError):
            self.update(event, data={**event.data, "year": 6})

    def test_trash_era_retains_event_and_flags_unavailability(self):
        event = self.event()
        self.publish(self.cal)
        self.publish(self.era)
        self.publish(event)
        self.client.delete(
            f"/api/resources/{self.era.id}",
            json.dumps({"expected_revision": self.era.revision}),
            content_type="application/json",
        )
        value = self.history()["events"][0]
        self.assertIn("unavailable", value["era_warning"])
        reader = self.history(True)
        self.assertNotIn(str(self.era.id), json.dumps(reader))
        self.assertEqual(reader["eras"], [])

    def test_changing_calendar_rules_keeps_era_with_date_warning(self):
        self.era = self.update(
            self.era,
            data={
                "calendar_id": str(self.cal.id),
                "year": 0,
                "month": 2,
                "day": 3,
                "end_year": 2,
                "end_month": 2,
                "end_day": 3,
            },
        )
        self.cal = self.update(self.cal, data={**CALENDAR, "leap_every": 0})
        value = self.history()["eras"][0]
        self.assertIsNone(value["ordinal"])
        self.assertIn("does not exist", value["date_warning"])
        self.era = self.update(self.era, summary="Recorded period")

    def test_uncertain_map_selection_uses_first_possible_date_with_warning(self):
        asset = store_asset(self.world, picture())
        item = self.add(
            "Map",
            "map",
            {
                "asset_id": str(asset.id),
                "calendar_id": str(self.cal.id),
                "versions": [
                    {
                        "id": "later",
                        "name": "Later",
                        "year": 0,
                        "month": 2,
                        "day": 1,
                        "scene": {"asset_id": str(asset.id)},
                    }
                ],
            },
        )
        event = self.event(date_precision="year", month=2, day=3, map_id=str(item.id))
        response = self.client.get(
            f"/api/resources/{item.id}/map-state", {"event": str(event.id)}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["version"])
        self.assertIn("uncertain", response.json()["warnings"][0])

    def test_archive_remaps_eras_and_preserves_precision_publication(self):
        event = self.event(date_precision="month", date_approximate=True)
        self.publish(self.cal)
        self.publish(self.era)
        self.publish(event)
        copied = import_world_archive(self.user, world_archive(self.world))
        era = Resource.objects.get(world=copied, kind="era")
        clone = Resource.objects.get(world=copied, kind="event")
        self.assertEqual(clone.data["era_id"], str(era.id))
        self.assertEqual(clone.published["data"]["era_id"], str(era.id))
        self.assertTrue(clone.data["date_approximate"])
        self.assertEqual(clone.data["date_precision"], "month")

    def test_approximate_day_map_warning_does_not_claim_month_start(self):
        item = self.add("Approximate map", "map", {})
        event = self.event(month=2, day=2, date_approximate=True, map_id=str(item.id))
        response = self.client.get(
            f"/api/resources/{item.id}/map-state", {"event": str(event.id)}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("recorded date without assuming", response.json()["warnings"][0])

    def test_era_ownership_and_stale_revision(self):
        self.era = self.update(self.era, summary="Updated")
        response = self.client.patch(
            f"/api/resources/{self.era.id}",
            json.dumps({"expected_revision": 1, "title": "Stale"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        other = User.objects.create_user("outsider")
        self.client.force_login(other)
        self.assertEqual(
            self.client.get(f"/api/resources/{self.era.id}").status_code, 404
        )

    def test_era_revision_restore_recovers_date_definition(self):
        self.era = self.update(self.era, data={**self.era.data, "year": -5})
        response = self.client.post(
            f"/api/resources/{self.era.id}/restore",
            json.dumps({"number": 1, "expected_revision": self.era.revision}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["year"], -10)

    def test_negative_uncertain_events_sort_by_first_possible_date(self):
        self.event(year=-1, month=2, day=2, date_precision="year")
        later = self.event(year=-1, month=1, day=2)
        events = self.history()["events"]
        self.assertEqual(events[0]["date_label"], "-1")
        self.assertEqual(events[1]["id"], str(later.id))

    def test_invalid_precision_month_http_returns_400(self):
        response = self.client.post(
            f"/api/worlds/{self.world.id}/resources",
            json.dumps(
                {
                    "kind": "event",
                    "title": "Invalid month",
                    "data": {
                        "calendar_id": str(self.cal.id),
                        "date_precision": "month",
                        "month": 3,
                    },
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_orphan_end_precision_is_rejected(self):
        with self.assertRaises(ValueError):
            self.event(end_precision="year")

    def test_owner_date_context_warns_when_calendar_is_trashed(self):
        event = self.event()
        self.client.delete(
            f"/api/resources/{self.cal.id}",
            json.dumps({"expected_revision": self.cal.revision}),
            content_type="application/json",
        )
        value = self.client.get(f"/api/resources/{event.id}").json()
        self.assertIsNone(value["date_context"]["ordinal"])
        self.assertIn("unavailable", value["date_context"]["date_warning"])

    def test_era_only_axis_and_reader_context_range_warning(self):
        value = self.history()
        self.assertEqual(value["events"], [])
        self.assertIsNotNone(value["axis"])
        self.assertLess(value["axis"]["minimum"], value["eras"][0]["ordinal"])
        event = self.event(year=5)
        self.era = self.update(self.era, data={**self.era.data, "end_year": 0})
        context = self.client.get(f"/api/resources/{event.id}").json()["date_context"]
        self.assertIn("beyond", context["era_warning"])
