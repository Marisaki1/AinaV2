import json
import tempfile
from pathlib import Path
from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase, override_settings
from .calendar_engine import date_info
from .recurrence import (
    occurrences,
    validate_recurrence,
    selected_occurrence,
    budget,
    occurrence_window,
)
from .models import World, Resource, Revision
from .services import save_resource, world_archive, import_world_archive, store_asset
from .tests import picture

CAL = {
    "months": [{"name": "Dawn", "days": 3}, {"name": "Dusk", "days": 2}],
    "weekdays": ["Sun", "Moon"],
    "leap_every": 2,
    "leap_month": 2,
}


def event(frequency="yearly", **patch):
    return {
        "year": 0,
        "month": 2,
        "day": 3,
        "recurrence": {"frequency": frequency, "interval": 1, "invalid_date": "skip"},
        **patch,
    }


class RecurrenceArithmeticTests(SimpleTestCase):
    def test_yearly_leap_skip_and_last_day(self):
        data = event()
        self.assertEqual([e["year"] for e in occurrences(data, CAL, 0, 4)], [0, 2, 4])
        data["recurrence"]["invalid_date"] = "last_day"
        self.assertEqual(
            [(e["year"], e["day"]) for e in occurrences(data, CAL, 0, 4)],
            [(0, 3), (1, 2), (2, 3), (3, 2), (4, 3)],
        )

    def test_monthly_anchor_day_is_not_permanently_clamped(self):
        data = event("monthly", month=1)
        dates = list(occurrences(data, CAL, 0, 2))
        self.assertEqual(
            [(e["year"], e["month"]) for e in dates],
            [(0, 1), (0, 2), (1, 1), (2, 1), (2, 2)],
        )
        data["recurrence"]["invalid_date"] = "last_day"
        dates = list(occurrences(data, CAL, 0, 2))
        self.assertEqual([e["day"] for e in dates], [3, 3, 3, 2, 3, 3])

    def test_daily_and_weekly_steps_across_epoch(self):
        data = event("daily", year=-1, day=2)
        data["recurrence"].update(interval=2, until_year=1)
        dates = list(occurrences(data, CAL, -1, 1))
        self.assertEqual(
            [date_info(CAL, e["year"], e["month"], e["day"])["ordinal"] for e in dates],
            [-1, 1, 3, 5, 7, 9],
        )
        data = event("weekly", month=1, day=1)
        dates = list(occurrences(data, CAL, 0, 1))
        self.assertEqual(
            [date_info(CAL, e["year"], e["month"], e["day"])["ordinal"] for e in dates],
            [0, 2, 4, 6, 8, 10],
        )

    def test_interval_until_and_far_future_without_year_iteration(self):
        data = event(year=-1000000000, month=1, day=1)
        data["recurrence"].update(interval=10000, until_year=1000000000)
        self.assertEqual(
            [e["year"] for e in occurrences(data, CAL, 1000000000, 1000000000)],
            [1000000000],
        )
        data = event()
        data["recurrence"].update(interval=2, until_year=3)
        self.assertEqual([e["year"] for e in occurrences(data, CAL, 0, 5)], [0, 2])

    def test_duration_and_overlap_at_window_boundary(self):
        data = event(day=2, end_year=1, end_month=1, end_day=1)
        dates = list(occurrences(data, CAL, 2, 2))
        self.assertEqual([e["year"] for e in dates], [1, 2])
        self.assertEqual(
            (dates[0]["end_year"], dates[0]["end_month"], dates[0]["end_day"]),
            (2, 1, 2),
        )
        for e in dates:
            self.assertEqual(
                date_info(CAL, e["end_year"], e["end_month"], e["end_day"])["ordinal"]
                - date_info(CAL, e["year"], e["month"], e["day"])["ordinal"],
                2,
            )

    def test_until_limits_start_not_end_of_duration(self):
        data = event(day=2, end_year=1, end_month=1, end_day=1)
        data["recurrence"]["until_year"] = 0
        dates = list(occurrences(data, CAL, 1, 1))
        self.assertEqual(len(dates), 1)
        self.assertEqual(dates[0]["year"], 0)

    def test_windows_and_validation(self):
        for first, last in [(2, 1), (-1, 200), (True, 2), (0, 1000000001)]:
            with self.subTest(first=first, last=last), self.assertRaises(ValueError):
                occurrence_window([], from_year=first, to_year=last)
        self.assertEqual(occurrence_window([], from_year="-1", to_year="0"), (-1, 0))
        with self.assertRaises(ValueError):
            occurrence_window([], from_year="1.5")
        self.assertEqual(
            occurrence_window(
                [{"data": {"year": 999999999, "recurrence": {"frequency": "yearly"}}}]
            ),
            (999999999, 1000000000),
        )

    def test_bad_rules_unknown_estimated_and_era_dates(self):
        for patch in [
            {"frequency": "hourly"},
            {"interval": 0},
            {"interval": True},
            {"until_year": -1},
            {"invalid_date": "roll"},
            {"html": "bad"},
        ]:
            data = event()
            data["recurrence"].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                validate_recurrence(data, CAL)
        for patch in [
            {"date_precision": "month"},
            {"date_approximate": True},
            {"end_precision": "year"},
            {"end_approximate": True},
        ]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                validate_recurrence(event(**patch), CAL)
        with self.assertRaises(ValueError):
            validate_recurrence(event(), None)
        with self.assertRaises(ValueError):
            validate_recurrence(event(), CAL, era=True)

    def test_selected_occurrence_matches_skip_clamp_interval_until(self):
        data = event()
        validate_recurrence(data, CAL)
        with self.assertRaises(ValueError):
            selected_occurrence(data, CAL, "1:2:2")
        data["recurrence"]["invalid_date"] = "last_day"
        self.assertEqual(selected_occurrence(data, CAL, "1:2:2")["day"], 2)
        data["recurrence"].update(interval=2, until_year=4)
        for date in ["1:2:2", "6:2:3", "bad", "0:1:3", "-2:2:3"]:
            with self.subTest(date=date), self.assertRaises(ValueError):
                selected_occurrence(data, CAL, date)

    def test_direct_selection_is_independent_of_list_limit(self):
        large = {"months": [{"name": "Long", "days": 1000} for _ in range(10)]}
        data = event("daily", month=1, day=1)
        limits = budget()
        self.assertEqual(len(list(occurrences(data, large, 0, 0, limits))), 2000)
        self.assertTrue(limits["truncated"])
        self.assertEqual(selected_occurrence(data, large, "0:10:1000")["month"], 10)

    def test_candidate_budget_handles_sparse_leap_rules(self):
        data = event()
        limits = {"remaining": 2000, "scans": 1, "truncated": False}
        self.assertEqual(len(list(occurrences(data, CAL, 1, 5, limits))), 0)
        self.assertTrue(limits["truncated"])

    def test_source_data_is_not_changed_by_expansion(self):
        data = event()
        before = json.dumps(data, sort_keys=True)
        list(occurrences(data, CAL, 0, 10))
        self.assertEqual(json.dumps(data, sort_keys=True), before)


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class RecurrenceIntegrationTests(TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        settings = override_settings(MEDIA_ROOT=Path(temp.name))
        settings.enable()
        self.addCleanup(settings.disable)
        self.user = User.objects.create_user("repeat-owner", password="test-password")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Festival world")
        self.cal = self.add("Calendar", "calendar", CAL)
        self.series = self.add(
            "Leap festival",
            "event",
            {
                **event(),
                "calendar_id": str(self.cal.id),
                "gm_notes": "Hidden nested note",
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

    def publish(self, r):
        response = self.client.post(
            f"/api/resources/{r.id}/publish",
            json.dumps({"expected_revision": r.revision}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)

    def update(self, r, **fields):
        return save_resource(self.world, {"expected_revision": r.revision, **fields}, r)

    def history(self, **params):
        return self.client.get(
            f"/api/worlds/{self.world.id}/history",
            {"calendar": str(self.cal.id), "from_year": 0, "to_year": 4, **params},
        )

    def dates(self, r=None, **params):
        return self.client.get(
            f"/api/resources/{(r or self.series).id}/occurrences",
            {"from_year": 0, "to_year": 4, **params},
        )

    def test_series_instances_share_source_but_have_distinct_identity(self):
        values = self.history().json()["events"]
        self.assertEqual(len(values), 3)
        self.assertEqual({e["id"] for e in values}, {str(self.series.id)})
        self.assertEqual(len({e["occurrence_id"] for e in values}), 3)
        self.assertNotIn("document", values[0])
        self.assertNotIn("gm_notes", values[0]["data"])

    def test_preview_and_map_reads_never_create_instances_or_revisions(self):
        before = (Resource.objects.count(), Revision.objects.count())
        self.history()
        self.dates()
        self.dates(self.cal)
        self.assertEqual((Resource.objects.count(), Revision.objects.count()), before)
        self.series.refresh_from_db()
        self.assertEqual(self.series.data["year"], 0)

    def test_reader_uses_published_rules_and_hides_private_series(self):
        self.publish(self.cal)
        self.publish(self.series)
        self.add(
            "Secret festival",
            "event",
            {**event(year=-100, day=1), "calendar_id": str(self.cal.id)},
            visibility="private",
        )
        self.series = self.update(
            self.series,
            data={
                **self.series.data,
                "recurrence": {"frequency": "yearly", "interval": 4},
            },
        )
        reader = self.history(audience="reader").json()
        self.assertEqual([e["data"]["year"] for e in reader["events"]], [0, 2, 4])
        self.assertEqual(
            [
                e["data"]["year"]
                for e in self.history().json()["events"]
                if e["id"] == str(self.series.id)
            ],
            [0, 4],
        )
        self.assertNotIn("Secret festival", json.dumps(reader))
        self.assertEqual(
            self.client.get(
                f"/api/worlds/{self.world.id}/history",
                {"calendar": str(self.cal.id), "audience": "reader"},
            ).json()["occurrence_window"]["from_year"],
            0,
        )

    def test_timeline_selection_lanes_tags_apply_before_expansion(self):
        other = self.add(
            "Other",
            "event",
            {**event(), "calendar_id": str(self.cal.id), "lane": 1},
            tags=["festival"],
        )
        timeline = self.add(
            "Timeline",
            "timeline",
            {
                "calendar_id": str(self.cal.id),
                "selection": "selected",
                "event_ids": [str(other.id)],
                "tags": ["festival"],
                "lanes": [{"id": 1, "name": "Hidden", "private": True}],
                "recurrence_from_year": 2,
                "recurrence_to_year": 4,
            },
        )
        self.publish(self.cal)
        self.publish(self.series)
        self.publish(other)
        self.publish(timeline)
        owner = self.history(timeline=str(timeline.id)).json()
        self.assertEqual([e["id"] for e in owner["events"]], [str(other.id)] * 3)
        self.assertEqual(
            self.history(timeline=str(timeline.id), audience="reader").json()["events"],
            [],
        )

    def test_saved_windows_and_reader_snapshot_override(self):
        timeline = self.add(
            "Timeline",
            "timeline",
            {
                "calendar_id": str(self.cal.id),
                "recurrence_from_year": 0,
                "recurrence_to_year": 2,
            },
        )
        self.publish(self.cal)
        self.publish(self.series)
        self.publish(timeline)
        timeline = self.update(
            timeline,
            data={**timeline.data, "recurrence_from_year": 4, "recurrence_to_year": 6},
        )
        route = f"/api/worlds/{self.world.id}/history"
        self.assertEqual(
            self.client.get(
                route, {"timeline": str(timeline.id), "audience": "reader"}
            ).json()["occurrence_window"],
            {"from_year": 0, "to_year": 2},
        )
        self.assertEqual(
            self.client.get(route, {"timeline": str(timeline.id)}).json()[
                "occurrence_window"
            ],
            {"from_year": 4, "to_year": 6},
        )
        self.assertEqual(
            self.history(timeline=str(timeline.id), from_year=10, to_year=12).json()[
                "occurrence_window"
            ]["from_year"],
            10,
        )

    def test_bad_saved_or_requested_windows_are_clean_errors(self):
        for data in [
            {"recurrence_from_year": 0},
            {"recurrence_from_year": 2, "recurrence_to_year": 1},
            {"recurrence_from_year": 0, "recurrence_to_year": 200},
        ]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                self.add("Bad", "timeline", data)
        for params in [
            {"from_year": "1.5"},
            {"from_year": 3, "to_year": 2},
            {"from_year": 0, "to_year": 200},
        ]:
            self.assertEqual(self.history(**params).status_code, 400)

    def test_occurrence_endpoints_ownership_visibility_and_compact_fields(self):
        self.assertEqual(self.dates(audience="reader").status_code, 404)
        self.publish(self.cal)
        self.publish(self.series)
        value = self.dates(audience="reader").json()
        self.assertEqual(len(value["events"]), 3)
        self.assertNotIn("gm_notes", json.dumps(value))
        self.assertNotIn("calendar_id", value["events"][0]["data"])
        other = User.objects.create_user("outsider")
        self.client.force_login(other)
        self.assertEqual(self.dates().status_code, 404)
        self.client.logout()
        self.assertEqual(self.dates().status_code, 401)

    def test_series_rule_edits_validate_and_stale_updates_fail(self):
        self.cal = self.update(self.cal, data={**CAL, "leap_every": 0})
        self.series = self.update(self.series, summary="Keep original record")
        with self.assertRaises(ValueError):
            self.update(
                self.series,
                data={**self.series.data, "recurrence": {"frequency": "monthly"}},
            )
        response = self.client.patch(
            f"/api/resources/{self.series.id}",
            json.dumps({"expected_revision": 1, "summary": "Stale"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        value = self.history().json()["events"][0]
        self.assertIsNone(value["ordinal"])
        self.assertIn("date_warning", value)

    def test_map_selection_uses_validated_occurrence_not_anchor(self):
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
                        "year": 2,
                        "month": 1,
                        "day": 1,
                        "scene": {"asset_id": str(asset.id)},
                    }
                ],
            },
        )
        route = f"/api/resources/{item.id}/map-state"
        self.assertIsNone(
            self.client.get(route, {"event": str(self.series.id)}).json()["version"]
        )
        response = self.client.get(
            route, {"event": str(self.series.id), "occurrence": "2:2:3"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"]["id"], "later")
        for value in ["1:2:2", "2:1:1", "invalid"]:
            self.assertEqual(
                self.client.get(
                    route, {"event": str(self.series.id), "occurrence": value}
                ).status_code,
                400,
            )

    def test_reader_map_validates_published_recurrence(self):
        item = self.add("Map", "map", {"calendar_id": str(self.cal.id)})
        self.publish(item)
        self.publish(self.cal)
        self.publish(self.series)
        self.series = self.update(
            self.series,
            data={
                **self.series.data,
                "recurrence": {"frequency": "yearly", "interval": 4},
            },
        )
        response = self.client.get(
            f"/api/resources/{item.id}/map-state",
            {"event": str(self.series.id), "occurrence": "2:2:3", "audience": "reader"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.get(
                f"/api/resources/{item.id}/map-state",
                {"event": str(self.series.id), "occurrence": "2:2:3"},
            ).status_code,
            400,
        )

    def test_private_calendar_references_and_repeat_dates_are_not_leaked(self):
        self.publish(self.series)
        value = self.dates(audience="reader").json()
        self.assertNotIn(str(self.cal.id), json.dumps(value))
        self.assertEqual(len(value["events"]), 1)
        self.assertIsNone(value["events"][0]["ordinal"])

    def test_global_preview_limit_is_reported(self):
        self.series = self.update(
            self.series,
            data={**self.series.data, "day": 1, "recurrence": {"frequency": "daily"}},
        )
        value = self.history(from_year=0, to_year=199).json()
        self.assertFalse(value["occurrences_truncated"])
        large = self.add(
            "Large calendar",
            "calendar",
            {"months": [{"name": "Long", "days": 1000} for _ in range(3)]},
        )
        self.add(
            "Daily",
            "event",
            {**event("daily", month=1, day=1), "calendar_id": str(large.id)},
        )
        value = self.history(calendar=str(large.id), from_year=0, to_year=0).json()
        self.assertEqual(len(value["events"]), 2000)
        self.assertTrue(value["occurrences_truncated"])

    def test_archive_and_revision_restore_preserve_rules(self):
        self.publish(self.cal)
        self.publish(self.series)
        copied = import_world_archive(self.user, world_archive(self.world))
        clone = Resource.objects.get(world=copied, kind="event")
        self.assertEqual(clone.data["recurrence"], self.series.data["recurrence"])
        self.assertEqual(
            clone.published["data"]["recurrence"], self.series.data["recurrence"]
        )
        self.assertNotEqual(clone.data["calendar_id"], str(self.cal.id))
        self.series = self.update(
            self.series,
            data={**self.series.data, "recurrence": {"frequency": "monthly"}},
        )
        response = self.client.post(
            f"/api/resources/{self.series.id}/restore",
            json.dumps({"number": 1, "expected_revision": self.series.revision}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["recurrence"]["frequency"], "yearly")

    def test_recurrence_does_not_erase_era_boundary_warnings(self):
        era = self.add(
            "Age",
            "era",
            {
                "calendar_id": str(self.cal.id),
                "year": 0,
                "end_year": 0,
                "date_precision": "year",
            },
        )
        self.series = self.update(
            self.series, data={**self.series.data, "era_id": str(era.id)}
        )
        values = self.history().json()["events"]
        self.assertNotIn("era_warning", values[0])
        self.assertIn("beyond", values[1]["era_warning"])

    def test_limit_is_shared_across_series(self):
        self.series = self.update(
            self.series,
            data={**self.series.data, "day": 1, "recurrence": {"frequency": "daily"}},
        )
        self.add(
            "Second daily",
            "event",
            {**event("daily", day=1), "calendar_id": str(self.cal.id)},
        )
        value = self.history(from_year=0, to_year=199).json()
        self.assertEqual(len(value["events"]), 2000)
        self.assertTrue(value["occurrences_truncated"])

    def test_occurrence_endpoint_warns_on_invalidated_and_trashed_calendars(self):
        self.cal = self.update(self.cal, data={**CAL, "leap_every": 0})
        value = self.dates().json()
        self.assertEqual(len(value["recurrence_warnings"]), 1)
        self.assertIsNone(value["events"][0]["ordinal"])
        self.client.delete(
            f"/api/resources/{self.cal.id}",
            json.dumps({"expected_revision": self.cal.revision}),
            content_type="application/json",
        )
        response = self.dates()
        self.assertEqual(response.status_code, 200)
        self.assertIn(
            "unavailable", response.json()["recurrence_warnings"][0]["message"]
        )

    def test_extreme_duration_failure_keeps_first_record_once(self):
        self.series = self.update(
            self.series,
            data={
                **self.series.data,
                "year": 999999998,
                "day": 2,
                "end_year": 999999999,
                "end_month": 1,
                "end_day": 1,
            },
        )
        value = self.history(from_year=999999998, to_year=1000000000).json()
        self.assertEqual(len(value["events"]), 1)
        self.assertEqual(value["events"][0]["occurrence_id"], str(self.series.id))
        self.assertTrue(value["recurrence_warnings"])
