import io
import json
import tempfile
from pathlib import Path
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from PIL import Image
from .models import World, Resource
from .services import save_resource, store_asset, world_archive, import_world_archive
from .tools import date_info, date_from_ordinal
from .tests import picture, document


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class MapsHistoryTests(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.override = override_settings(MEDIA_ROOT=Path(self.temp.name))
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.user = User.objects.create_user("owner", password="tests-password")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="History world")

    def create(self, title="Entry", **fields):
        return save_resource(self.world, {"title": title, **fields})

    def send(self, path, data):
        return self.client.post(
            "/api" + path, json.dumps(data), content_type="application/json"
        )

    def publish(self, r):
        self.assertEqual(
            self.send(
                f"/resources/{r.id}/publish", {"expected_revision": r.revision}
            ).status_code,
            200,
        )

    def history(self, query=""):
        return self.client.get(f"/api/worlds/{self.world.id}/history" + query)

    def calendar(self):
        return self.create(
            "Custom moons",
            kind="calendar",
            data={
                "months": [{"name": "First", "days": 3}, {"name": "Second", "days": 2}],
                "weekdays": ["Sun", "Moon"],
                "leap_every": 2,
                "leap_month": 2,
            },
        )

    def test_reader_filters_private_groups_layers_and_target_ids(self):
        private = self.create("Hidden linked place")
        public = self.create("Visible place", visibility="public")
        self.publish(public)
        r = self.create(
            kind="map",
            visibility="public",
            data={
                "groups": [
                    {"id": "secret", "name": "Hidden group", "private": True},
                    {"id": "public", "name": "Visible group", "visible": False},
                ],
                "markers": [
                    {
                        "id": "secret-pin",
                        "group": "secret",
                        "label": "Hidden city",
                        "x": 0.2,
                        "y": 0.3,
                    },
                    {
                        "id": "public-pin",
                        "group": "public",
                        "label": "Village",
                        "x": 0.3,
                        "y": 0.4,
                        "link_id": str(private.id),
                    },
                    {
                        "id": "visible-link",
                        "label": "Public place",
                        "x": 0.7,
                        "y": 0.8,
                        "link_id": str(public.id),
                    },
                ],
                "layers": [
                    {"id": "private-layer", "name": "Hidden roads", "private": True},
                    {"id": "public-layer", "name": "Clouds", "opacity": 0.4},
                ],
            },
        )
        self.publish(r)
        value = self.client.get(f"/api/resources/{r.id}?audience=reader").json()
        text = json.dumps(value)
        for secret in [
            "Hidden group",
            "Hidden city",
            "secret-pin",
            "Hidden roads",
            str(private.id),
        ]:
            self.assertNotIn(secret, text)
        self.assertEqual(len(value["data"]["markers"]), 2)
        self.assertFalse(value["data"]["groups"][0]["visible"])
        self.assertNotIn("link_id", value["data"]["markers"][0])
        self.assertEqual(value["data"]["markers"][1]["link_id"], str(public.id))

    def test_reader_uses_published_group_configuration(self):
        r = self.create(
            kind="map",
            visibility="public",
            data={
                "groups": [{"id": "g", "name": "Original", "private": True}],
                "markers": [
                    {"id": "p", "x": 0.4, "y": 0.3, "label": "Hidden pin", "group": "g"}
                ],
            },
        )
        self.publish(r)
        save_resource(
            self.world,
            {
                "data": {
                    "groups": [{"id": "g", "name": "Draft name", "private": False}],
                    "markers": r.data["markers"],
                },
                "expected_revision": 1,
            },
            r,
        )
        value = self.client.get(f"/api/resources/{r.id}?audience=reader").json()
        self.assertEqual(value["data"]["groups"], [])
        self.assertEqual(value["data"]["markers"], [])
        self.assertNotIn("Draft name", json.dumps(value))

    def test_saved_views_layers_and_geometry_roundtrip(self):
        asset = store_asset(self.world, picture())
        r = self.create(
            kind="map",
            data={
                "asset_id": str(asset.id),
                "default_view": {"x": 0.25, "y": 0.75, "zoom_delta": 2},
                "layers": [
                    {
                        "id": "l",
                        "name": "Overlay",
                        "asset_id": str(asset.id),
                        "opacity": 0.2,
                        "private": True,
                    }
                ],
                "groups": [{"id": "g", "name": "Roads", "visible": False}],
                "markers": [
                    {
                        "id": "r",
                        "type": "line",
                        "group": "g",
                        "points": [[0.1, 0.2], [0.4, 0.8]],
                        "color": "#224466",
                    },
                    {
                        "id": "hot",
                        "type": "hotspot",
                        "x": 0.5,
                        "y": 0.5,
                        "radius": 0.15,
                    },
                ],
            },
        )
        copy = import_world_archive(self.user, world_archive(self.world)).resources.get(
            kind="map"
        )
        self.assertEqual(copy.data["default_view"], r.data["default_view"])
        self.assertEqual(copy.data["groups"], r.data["groups"])
        self.assertEqual(copy.data["markers"], r.data["markers"])
        self.assertEqual(copy.data["layers"][0]["opacity"], 0.2)

    def test_image_replacement_preserves_relative_coordinates_and_view(self):
        original = store_asset(self.world, picture())
        stream = io.BytesIO()
        Image.new("RGB", (200, 90), "gold").save(stream, "PNG")
        stream.seek(0)
        stream.name = "replacement.png"
        replacement = store_asset(self.world, stream)
        r = self.create(
            kind="map",
            data={
                "asset_id": str(original.id),
                "default_view": {"x": 0.3, "y": 0.8, "zoom_delta": 1},
                "markers": [{"id": "p", "x": 0.3, "y": 0.7}],
            },
        )
        r = save_resource(
            self.world,
            {
                "data": {**r.data, "asset_id": str(replacement.id)},
                "expected_revision": 1,
            },
            r,
        )
        self.assertEqual(r.data["markers"][0]["x"], 0.3)
        self.assertEqual(r.data["default_view"]["y"], 0.8)

    def test_invalid_map_controls_are_rejected(self):
        for data in [
            {"groups": [None]},
            {"groups": [{"id": "a"}, {"id": "a"}]},
            {"groups": [{"id": "a", "private": "false"}]},
            {"layers": [{"id": "l", "opacity": 1.1}]},
            {"default_view": {"x": 2, "y": 0}},
            {"default_view": {"x": True, "y": 0}},
            {
                "markers": [
                    {"id": "p", "type": "hotspot", "x": 0.2, "y": 0.3, "radius": 0}
                ]
            },
        ]:
            self.assertEqual(
                self.send(
                    f"/worlds/{self.world.id}/resources",
                    {"title": "Bad map", "kind": "map", "data": data},
                ).status_code,
                400,
            )

    def test_map_asset_reference_stays_in_world(self):
        other = World.objects.create(owner=self.user, name="Other")
        asset = store_asset(other, picture())
        response = self.send(
            f"/worlds/{self.world.id}/resources",
            {
                "title": "Bad",
                "kind": "map",
                "data": {"layers": [{"id": "l", "asset_id": str(asset.id)}]},
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_custom_dates_inverse_including_negative_and_large_years(self):
        data = self.calendar().data
        for year in [-1000000000, -7, -2, -1, 0, 1, 2, 17, 1000000000]:
            first = date_info(data, year)
            for month, length in enumerate(first["month_lengths"], 1):
                result = date_from_ordinal(
                    data, date_info(data, year, month, length)["ordinal"]
                )
                self.assertEqual(
                    (result["year"], result["month"], result["day"]),
                    (year, month, length),
                )

    def test_parallel_lanes_and_duration_use_one_calendar_scale(self):
        cal = self.calendar()
        self.create(
            "A",
            kind="event",
            data={
                "calendar_id": str(cal.id),
                "year": -2,
                "month": 2,
                "day": 3,
                "lane": 0,
                "end_year": 0,
                "end_month": 1,
                "end_day": 1,
            },
        )
        self.create(
            "B",
            kind="event",
            data={
                "calendar_id": str(cal.id),
                "year": -2,
                "month": 2,
                "day": 3,
                "lane": 1,
            },
        )
        timeline = self.create(
            kind="timeline",
            data={
                "calendar_id": str(cal.id),
                "lanes": [{"id": 0, "name": "Politics"}, {"id": 1, "name": "People"}],
            },
        )
        value = self.history("?timeline=" + str(timeline.id)).json()
        self.assertEqual(len(value["events"]), 2)
        self.assertEqual(
            {lane["name"] for lane in value["lanes"]}, {"Politics", "People"}
        )
        self.assertEqual(value["events"][0]["ordinal"], value["events"][1]["ordinal"])
        self.assertGreater(
            value["events"][0]["end_ordinal"], value["events"][0]["ordinal"]
        )
        self.assertTrue(value["axis"]["ticks"])

    def test_one_event_edit_updates_both_timeline_placements(self):
        cal = self.calendar()
        event = self.create(
            "Original event",
            kind="event",
            data={
                "calendar_id": str(cal.id),
                "year": 0,
                "month": 2,
                "day": 3,
                "lane": 0,
            },
        )
        timelines = [
            self.create(
                title,
                kind="timeline",
                data={
                    "calendar_id": str(cal.id),
                    "selection": "selected",
                    "event_ids": [str(event.id)],
                },
            )
            for title in ("Political history", "Personal history")
        ]
        first = self.history("?timeline=" + str(timelines[0].id)).json()["events"][0]
        self.assertEqual(first["date_label"], "Second 3, 0")
        self.assertEqual(first["ordinal"], date_info(cal.data, 0, 2, 3)["ordinal"])
        event = save_resource(
            self.world,
            {
                "title": "Revised event",
                "expected_revision": event.revision,
                "data": {**event.data, "year": 2, "lane": 1},
            },
            event,
        )
        for timeline in timelines:
            result = self.history("?timeline=" + str(timeline.id)).json()
            self.assertEqual(len(result["events"]), 1)
            placement = result["events"][0]
            self.assertEqual(placement["id"], str(event.id))
            self.assertEqual(placement["title"], "Revised event")
            self.assertEqual(placement["lane"], 1)
            self.assertEqual(
                placement["ordinal"], date_info(cal.data, 2, 2, 3)["ordinal"]
            )

    def test_unrelated_calendars_are_not_on_one_axis(self):
        cal = self.calendar()
        self.create(kind="event", data={"calendar_id": str(cal.id), "year": 1})
        self.create(kind="event", data={"year": 1})
        all_events = self.history("?calendar=all").json()
        self.assertIsNone(all_events["axis"])
        self.assertEqual(len(all_events["events"]), 2)
        self.assertEqual(
            len(self.history("?calendar=" + str(cal.id)).json()["events"]), 1
        )

    def test_negative_and_extreme_recorded_years_stay_ordered(self):
        for year in [1000000000, 0, -1000000000, -1]:
            self.create(str(year), kind="event", data={"year": year})
        value = self.history().json()
        self.assertEqual(
            [e["data"]["year"] for e in value["events"]],
            [-1000000000, -1, 0, 1000000000],
        )
        self.assertEqual(len({e["ordinal"] for e in value["events"]}), 4)

    def test_invalid_end_date_and_lane_are_rejected(self):
        for data in [
            {"year": 5, "end_year": 0},
            {"year": 1, "lane": "left"},
            {"year": 1, "lane": True},
            {"year": 1, "end_month": 2},
        ]:
            self.assertEqual(
                self.send(
                    f"/worlds/{self.world.id}/resources",
                    {"title": "Bad event", "kind": "event", "data": data},
                ).status_code,
                400,
            )
        self.create(kind="event", data={"year": -1, "end_year": 0})

    def test_calendar_change_keeps_old_dates_in_list_with_warning(self):
        cal = self.calendar()
        event = self.create(
            kind="event",
            data={"calendar_id": str(cal.id), "year": 2, "month": 2, "day": 3},
        )
        save_resource(
            self.world,
            {
                "data": {"months": [{"name": "Short", "days": 1}], "weekdays": ["One"]},
                "expected_revision": 1,
            },
            cal,
        )
        value = self.history("?calendar=" + str(cal.id)).json()
        self.assertEqual(value["events"][0]["id"], str(event.id))
        self.assertIsNone(value["events"][0]["ordinal"])
        self.assertTrue(value["events"][0]["date_warning"])

    def test_reader_timeline_excludes_private_lane_names_events_and_drafts(self):
        cal = self.calendar()
        cal.visibility = "public"
        cal.save()
        self.publish(cal)
        visible = self.create(
            "Public event",
            kind="event",
            visibility="public",
            tags=["record"],
            data={"calendar_id": str(cal.id), "year": 0, "lane": 0},
        )
        hidden = self.create(
            "Secret event",
            kind="event",
            visibility="public",
            data={"calendar_id": str(cal.id), "year": 1, "lane": 1},
        )
        for event in [visible, hidden]:
            self.publish(event)
        timeline = self.create(
            "Public timeline",
            kind="timeline",
            visibility="public",
            data={
                "calendar_id": str(cal.id),
                "lanes": [
                    {"id": 0, "name": "Public lane"},
                    {"id": 1, "name": "Secret lane", "private": True},
                ],
                "event_ids": [str(visible.id), str(hidden.id)],
            },
        )
        self.publish(timeline)
        save_resource(
            self.world,
            {
                "title": "Draft secret title",
                "data": {**visible.data, "year": 1},
                "expected_revision": 1,
            },
            visible,
        )
        value = self.history(
            "?timeline=" + str(timeline.id) + "&audience=reader"
        ).json()
        text = json.dumps(value)
        self.assertEqual(value["events"][0]["data"]["year"], 0)
        for secret in [
            "Secret event",
            "Secret lane",
            "Draft secret title",
            str(hidden.id),
        ]:
            self.assertNotIn(secret, text)

    def test_reader_cannot_get_private_calendar_or_marker_ids_from_events(self):
        cal = self.calendar()
        map_entry = self.create(
            "Map",
            kind="map",
            visibility="public",
            data={
                "groups": [{"id": "hidden", "name": "Secret group", "private": True}],
                "markers": [
                    {
                        "id": "secret-marker",
                        "label": "Secret pin",
                        "x": 0.2,
                        "y": 0.3,
                        "group": "hidden",
                    }
                ],
            },
        )
        self.publish(map_entry)
        event = self.create(
            kind="event",
            visibility="public",
            data={
                "calendar_id": str(cal.id),
                "map_id": str(map_entry.id),
                "marker_id": "secret-marker",
                "year": 1,
            },
        )
        self.publish(event)
        value = self.client.get(f"/api/resources/{event.id}?audience=reader").json()
        self.assertNotIn("calendar_id", value["data"])
        self.assertNotIn("marker_id", value["data"])
        self.assertTrue(value["data"]["calendar_unavailable"])
        timeline = self.create(
            kind="timeline", visibility="public", data={"calendar_id": str(cal.id)}
        )
        self.publish(timeline)
        response = self.history("?timeline=" + str(timeline.id) + "&audience=reader")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(str(cal.id), response.content.decode())
        self.assertIsNone(response.json()["axis"])

    def test_history_and_timeline_respect_world_ownership(self):
        other = World.objects.create(owner=self.user, name="Other")
        foreign = save_resource(other, {"kind": "timeline", "title": "Foreign"})
        self.assertEqual(self.history("?timeline=" + str(foreign.id)).status_code, 404)
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/resources",
                {
                    "kind": "timeline",
                    "title": "Bad",
                    "data": {"event_ids": [str(foreign.id)]},
                },
            ).status_code,
            400,
        )

    def test_manual_selection_tags_and_query(self):
        a = self.create(
            "A",
            kind="event",
            tags=["war"],
            document=document("A needle in a chronicle"),
        )
        b = self.create("B", kind="event", tags=["war"])
        timeline = self.create(
            kind="timeline",
            data={"selection": "selected", "event_ids": [str(a.id)], "tags": ["WAR"]},
        )
        self.assertEqual(
            [
                e["id"]
                for e in self.history(
                    "?timeline=" + str(timeline.id) + "&q=needle"
                ).json()["events"]
            ],
            [str(a.id)],
        )
        self.assertNotIn(
            str(b.id),
            json.dumps(self.history("?timeline=" + str(timeline.id)).json()["events"]),
        )

    def test_creating_selected_timeline_event_is_atomic(self):
        cal = self.calendar()
        timeline = self.create(
            kind="timeline",
            data={
                "calendar_id": str(cal.id),
                "selection": "selected",
                "event_ids": [],
                "tags": ["war"],
            },
        )
        response = self.send(
            f"/worlds/{self.world.id}/history/events",
            {
                "timeline_id": str(timeline.id),
                "timeline_revision": 1,
                "title": "New event",
                "data": {"year": 0},
            },
        )
        self.assertEqual(response.status_code, 201, response.content)
        timeline.refresh_from_db()
        self.assertEqual(timeline.data["event_ids"], [response.json()["id"]])
        self.assertEqual(response.json()["tags"], ["war"])
        self.assertEqual(response.json()["data"]["calendar_id"], str(cal.id))
        count = Resource.objects.count()
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/history/events",
                {
                    "timeline_id": str(timeline.id),
                    "timeline_revision": 1,
                    "title": "Stale",
                },
            ).status_code,
            409,
        )
        self.assertEqual(Resource.objects.count(), count)

    def test_bad_timeline_definitions_are_rejected(self):
        for data in [
            {"lanes": [{"id": 0, "name": "A"}, {"id": 0, "name": "B"}]},
            {"lanes": [{"id": True, "name": "A"}]},
            {"selection": "unknown"},
            {"event_ids": "all"},
            {"lanes": [{"id": 0, "name": "A", "private": "false"}]},
        ]:
            self.assertEqual(
                self.send(
                    f"/worlds/{self.world.id}/resources",
                    {"kind": "timeline", "title": "Bad", "data": data},
                ).status_code,
                400,
            )

    def test_timeline_and_map_configuration_survive_portable_archive(self):
        cal = self.calendar()
        map_entry = self.create(
            kind="map",
            data={
                "groups": [{"id": "g", "name": "GM", "private": True}],
                "markers": [{"id": "p", "x": 0.2, "y": 0.3, "group": "g"}],
                "default_view": {"x": 0.6, "y": 0.2, "zoom_delta": 1},
            },
        )
        event = self.create(
            kind="event",
            data={
                "calendar_id": str(cal.id),
                "map_id": str(map_entry.id),
                "marker_id": "p",
                "year": -1,
                "lane": 4,
            },
        )
        self.create(
            kind="timeline",
            data={
                "calendar_id": str(cal.id),
                "map_id": str(map_entry.id),
                "selection": "selected",
                "event_ids": [str(event.id)],
                "lanes": [{"id": 4, "name": "A story"}],
            },
        )
        copy = import_world_archive(self.user, world_archive(self.world))
        saved = copy.resources.get(kind="timeline")
        events = copy.resources.filter(kind="event")
        self.assertEqual(saved.data["event_ids"], [str(events[0].id)])
        self.assertNotEqual(saved.data["calendar_id"], str(cal.id))
        self.assertEqual(copy.resources.get(kind="map").data["default_view"]["x"], 0.6)

    def test_removing_a_private_group_retains_marker_privacy(self):
        r = self.create(
            kind="map",
            data={
                "groups": [{"id": "g", "name": "GM", "private": True}],
                "markers": [{"id": "p", "x": 0.3, "y": 0.2, "group": "g"}],
            },
        )
        r = save_resource(
            self.world,
            {
                "data": {"groups": [], "markers": r.data["markers"]},
                "expected_revision": 1,
            },
            r,
        )
        self.assertTrue(r.data["markers"][0]["private"])
