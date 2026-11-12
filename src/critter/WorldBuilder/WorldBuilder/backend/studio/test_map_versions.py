import copy
import json
import tempfile
from pathlib import Path
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone
from .models import World
from .services import save_resource, store_asset, world_archive, import_world_archive
from .tests import picture


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class MapVersionTests(TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        settings = override_settings(MEDIA_ROOT=Path(temp.name))
        settings.enable()
        self.addCleanup(settings.disable)
        self.user = User.objects.create_user("historian", password="tests-password")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Versions")
        self.cal = self.add(
            "Calendar",
            "calendar",
            {"months": [{"name": "Moon", "days": 3}], "leap_every": 2, "leap_month": 1},
        )
        self.asset = store_asset(self.world, picture())
        self.map = self.add(
            "Map",
            "map",
            {
                "calendar_id": str(self.cal.id),
                "asset_id": str(self.asset.id),
                "markers": [],
                "versions": [
                    self.version("past", -10),
                    self.version("present", 0),
                    self.version("future", 10),
                ],
            },
        )

    def add(self, title, kind, data, **kwargs):
        return save_resource(
            self.world,
            {
                "title": title,
                "kind": kind,
                "data": data,
                "visibility": "public",
                **kwargs,
            },
        )

    def version(self, identity, year, **kwargs):
        return {
            "id": identity,
            "name": identity + " terrain",
            "year": year,
            "month": 1,
            "day": 1,
            "private": False,
            "scene": {
                "asset_id": str(self.asset.id),
                "markers": [
                    {
                        "id": identity,
                        "type": "pin",
                        "label": identity + " place",
                        "x": 0.2,
                        "y": 0.3,
                    }
                ],
            },
            **kwargs,
        }

    def event(self, year=0, **kwargs):
        return self.add(
            "Event",
            "event",
            {
                "calendar_id": str(self.cal.id),
                "map_id": str(self.map.id),
                "year": year,
                "month": 1,
                "day": 1,
                **kwargs,
            },
        )

    def publish(self, resource):
        response = self.client.post(
            f"/api/resources/{resource.id}/publish",
            json.dumps({"expected_revision": resource.revision}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)

    def state(self, event, reader=False, map_id=None):
        return self.client.get(
            f"/api/resources/{map_id or self.map.id}/map-state?event={event.id}"
            + ("&audience=reader" if reader else "")
        )

    def test_effective_boundaries_and_signed_years(self):
        for year, expected in [
            (-20, None),
            (-10, "past"),
            (-1, "past"),
            (0, "present"),
            (9, "present"),
            (10, "future"),
            (1000000000, "future"),
        ]:
            value = self.state(self.event(year)).json()
            self.assertEqual(
                value["version"]["id"] if value["version"] else None, expected
            )
            self.assertNotIn("versions", value["data"])

    def test_month_day_and_leap_day_choose_exact_version(self):
        data = copy.deepcopy(self.map.data)
        data["versions"] = [self.version("leap", 0, day=4)]
        self.map = save_resource(
            self.world, {"data": data, "expected_revision": self.map.revision}, self.map
        )
        self.assertIsNone(self.state(self.event(0, day=3)).json()["version"])
        self.assertEqual(
            self.state(self.event(0, day=4)).json()["version"]["id"], "leap"
        )

    def test_private_versions_scenes_and_targets_are_filtered(self):
        hidden = self.add("Hidden destination", "article", {}, visibility="private")
        data = copy.deepcopy(self.map.data)
        data["versions"][1]["private"] = True
        data["versions"][0]["scene"].update(
            groups=[{"id": "g", "name": "Secret group", "private": True}],
            layers=[{"id": "l", "name": "Secret layer", "private": True}],
            markers=[
                {"id": "hidden", "label": "Secret city", "x": 0, "y": 0, "group": "g"},
                {
                    "id": "visible",
                    "label": "Village",
                    "x": 0.5,
                    "y": 0.5,
                    "link_id": str(hidden.id),
                },
            ],
        )
        self.map = save_resource(
            self.world, {"data": data, "expected_revision": self.map.revision}, self.map
        )
        event = self.event(1)
        for resource in (self.cal, self.map, event):
            self.publish(resource)
        value = self.state(event, True).json()
        self.assertEqual(value["version"]["id"], "past")
        direct = self.client.get(f"/api/resources/{self.map.id}?audience=reader").json()
        text = json.dumps([value, direct])
        for secret in (
            "present terrain",
            "Secret city",
            "Secret group",
            "Secret layer",
            str(hidden.id),
        ):
            self.assertNotIn(secret, text)

    def test_draft_scene_does_not_change_reader_state(self):
        event = self.event()
        for resource in (self.cal, self.map, event):
            self.publish(resource)
        data = copy.deepcopy(self.map.data)
        data["versions"][1]["name"] = "Draft terrain"
        self.map = save_resource(
            self.world, {"data": data, "expected_revision": self.map.revision}, self.map
        )
        self.assertEqual(self.state(event).json()["version"]["name"], "Draft terrain")
        self.assertEqual(
            self.state(event, True).json()["version"]["name"], "present terrain"
        )

    def test_reader_event_can_focus_a_marker_only_in_a_historical_scene(self):
        event = self.event(marker_id="present")
        for resource in (self.cal, self.map, event):
            self.publish(resource)
        response = self.client.get(f"/api/resources/{event.id}?audience=reader").json()
        self.assertEqual(response["data"]["marker_id"], "present")
        self.assertEqual(
            self.state(event, True).json()["data"]["markers"][0]["id"], "present"
        )

    def test_private_version_is_absent_from_reader_search(self):
        data = copy.deepcopy(self.map.data)
        data["versions"][1]["name"] = "UnfindableSecretTerrain"
        data["versions"][1]["private"] = True
        self.map = save_resource(
            self.world, {"data": data, "expected_revision": self.map.revision}, self.map
        )
        self.publish(self.cal)
        self.publish(self.map)
        values = self.client.get(
            f"/api/worlds/{self.world.id}/resources?audience=reader&q=UnfindableSecretTerrain"
        ).json()
        self.assertEqual(values["resources"], [])

    def test_other_calendar_and_private_calendar_use_base(self):
        other = self.add("Other calendar", "calendar", {})
        event = self.event(calendar_id=str(other.id))
        self.assertIsNone(self.state(event).json()["version"])
        self.assertTrue(self.state(event).json()["warnings"])
        self.cal.visibility = "private"
        self.cal.save()
        event = self.event()
        for resource in (self.map, event):
            self.publish(resource)
        value = self.state(event, True).json()
        self.assertIsNone(value["version"])
        self.assertTrue(value["warnings"])
        direct = self.client.get(f"/api/resources/{self.map.id}?audience=reader").json()
        self.assertEqual(direct["data"]["versions"], [])
        self.assertNotIn(str(self.cal.id), json.dumps(direct))

    def test_invalid_version_geometry_dates_and_duplicate_dates(self):
        invalid = [
            self.version("bad", True),
            self.version("bad", 1, day=4),
            self.version("bad", 1, scene={"versions": []}),
            self.version("bad", 1, scene={"markers": [{"id": "p", "x": 2, "y": 0}]}),
            self.version("bad", 1, private="false"),
        ]
        for version in invalid:
            with self.subTest(version=version):
                with self.assertRaises(ValueError):
                    self.add(
                        "Bad",
                        "map",
                        {"calendar_id": str(self.cal.id), "versions": [version]},
                    )
        with self.assertRaises(ValueError):
            self.add(
                "Bad", "map", {"versions": [self.version("a", 1), self.version("b", 1)]}
            )

    def test_version_media_and_calendar_must_belong_to_world(self):
        foreign = World.objects.create(owner=self.user, name="Other")
        asset = store_asset(foreign, picture())
        version = self.version("foreign", 1, scene={"asset_id": str(asset.id)})
        with self.assertRaises(ValueError):
            self.add("Bad", "map", {"versions": [version]})
        with self.assertRaises(ValueError):
            self.add("Bad", "map", {"calendar_id": str(self.map.id)})

    def test_deleted_foreign_and_unpublished_objects_are_unavailable(self):
        event = self.event()
        self.assertEqual(self.state(event, True).status_code, 404)
        foreign = World.objects.create(owner=self.user, name="Other")
        other = save_resource(foreign, {"kind": "event", "title": "Other event"})
        self.assertEqual(self.state(other).status_code, 404)
        event.deleted_at = timezone.now()
        event.save()
        self.assertEqual(self.state(event).status_code, 404)
        self.client.logout()
        self.assertEqual(self.state(event).status_code, 401)

    def test_calendar_changes_keep_dates_and_warn_without_blocking_unrelated_edits(
        self,
    ):
        data = copy.deepcopy(self.map.data)
        data["versions"] = [self.version("leap", 0, day=4)]
        self.map = save_resource(
            self.world, {"data": data, "expected_revision": self.map.revision}, self.map
        )
        self.cal = save_resource(
            self.world,
            {
                "data": {"months": [{"name": "Moon", "days": 2}]},
                "expected_revision": self.cal.revision,
            },
            self.cal,
        )
        self.map = save_resource(
            self.world,
            {"title": "Renamed", "expected_revision": self.map.revision},
            self.map,
        )
        value = self.state(self.event(1)).json()
        self.assertIsNone(value["version"])
        self.assertTrue(value["warnings"])

    def test_deleting_private_group_in_version_keeps_markers_private(self):
        data = copy.deepcopy(self.map.data)
        scene = data["versions"][0]["scene"]
        scene["groups"] = [{"id": "hidden", "private": True}]
        scene["markers"][0]["group"] = "hidden"
        self.map = save_resource(
            self.world, {"data": data, "expected_revision": self.map.revision}, self.map
        )
        data = copy.deepcopy(self.map.data)
        data["versions"][0]["scene"]["groups"] = []
        data["versions"][0]["scene"]["markers"][0]["group"] = ""
        self.map = save_resource(
            self.world, {"data": data, "expected_revision": self.map.revision}, self.map
        )
        self.assertTrue(self.map.data["versions"][0]["scene"]["markers"][0]["private"])

    def test_portable_archive_remaps_version_assets_calendars_and_marker_links(self):
        self.event(marker_id="present")
        self.publish(self.map)
        restored = import_world_archive(self.user, world_archive(self.world))
        other_map = restored.resources.get(kind="map")
        other_event = restored.resources.get(kind="event")
        self.assertNotEqual(other_map.data["calendar_id"], str(self.cal.id))
        self.assertNotEqual(
            other_map.data["versions"][1]["scene"]["asset_id"], str(self.asset.id)
        )
        self.assertEqual(other_event.data["map_id"], str(other_map.id))
        self.assertEqual(
            self.state(other_event, map_id=other_map.id).json()["version"]["id"],
            "present",
        )

    def test_deleted_version_can_be_recovered_from_revision(self):
        original = copy.deepcopy(self.map.data)
        changed = {**original, "versions": original["versions"][:1]}
        self.map = save_resource(
            self.world,
            {"data": changed, "expected_revision": self.map.revision},
            self.map,
        )
        response = self.client.post(
            f"/api/resources/{self.map.id}/restore",
            json.dumps({"number": 1, "expected_revision": self.map.revision}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"], original)

    def test_deleted_calendar_keeps_existing_map_editable_but_refuses_new_dates(self):
        self.cal.deleted_at = timezone.now()
        self.cal.save()
        self.map = save_resource(
            self.world,
            {"title": "Still editable", "expected_revision": self.map.revision},
            self.map,
        )
        data = copy.deepcopy(self.map.data)
        data["versions"].append(self.version("new", 12))
        with self.assertRaises(ValueError):
            save_resource(
                self.world,
                {"data": data, "expected_revision": self.map.revision},
                self.map,
            )
