import json
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from .models import World, Resource
from .services import (
    save_resource,
    snapshot,
    serialize,
    world_archive,
    import_world_archive,
)
from .graphs import create_connection


class CampaignMapGuideTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="atlas-owner")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Atlas")
        self.place = self.add("Village", "article", {})
        self.hero = self.add("Hero", "character", {})
        self.other = self.add("Other character", "character", {})
        self.map = self.add(
            "Region",
            "map",
            {
                "markers": [
                    {
                        "id": "village",
                        "label": "Village",
                        "type": "pin",
                        "x": 0.3,
                        "y": 0.4,
                        "link_id": str(self.place.id),
                    },
                    {
                        "id": "secret",
                        "label": "Secret camp",
                        "type": "pin",
                        "x": 0.7,
                        "y": 0.5,
                        "private": True,
                    },
                    {
                        "id": "unlinked",
                        "label": "Old bridge",
                        "type": "pin",
                        "x": 0.4,
                        "y": 0.7,
                    },
                ]
            },
        )
        self.campaign = self.add(
            "Adventure",
            "campaign",
            {"related_entries": [str(self.map.id)], "party": [str(self.hero.id)]},
        )
        self.edge = create_connection(
            self.world,
            {
                "source": str(self.hero.id),
                "target": str(self.place.id),
                "kind": "located-in",
                "label": "Investigating",
                "visibility": "public",
                "notes": "GM-only relationship clue",
            },
        )
        create_connection(
            self.world,
            {
                "source": str(self.other.id),
                "target": str(self.place.id),
                "kind": "located-in",
                "label": "Other campaign",
                "visibility": "public",
            },
        )

    def add(self, title, kind, data, **fields):
        return save_resource(
            self.world, {"title": title, "kind": kind, "data": data, **fields}
        )

    def note(self, **data):
        return self.add(
            "Location record",
            "note",
            {
                "campaign_id": str(self.campaign.id),
                "map_id": str(self.map.id),
                "marker_id": "village",
                "record_type": "journal",
                **data,
            },
        )

    def publish(self, *records):
        for r in records:
            r.visibility = "public"
            r.published = {**snapshot(r), "_revision": r.revision}
            r.save(update_fields=["visibility", "published"])

    def guide(self, reader=False, marker="village", campaign=True):
        return self.client.get(
            f"/api/resources/{self.map.id}/map-guide",
            {
                "marker": marker,
                **({"campaign": str(self.campaign.id)} if campaign else {}),
                **({"audience": "reader"} if reader else {}),
            },
        )

    def test_location_cast_and_records_are_campaign_scoped(self):
        note = self.note()
        result = self.guide().json()
        self.assertEqual(result["location"]["id"], str(self.place.id))
        self.assertEqual(
            [p["entry"]["id"] for p in result["people"]], [str(self.hero.id)]
        )
        self.assertEqual([r["id"] for r in result["records"]], [str(note.id)])
        self.assertNotIn("GM-only relationship clue", json.dumps(result["people"]))

    def test_notes_from_other_campaign_are_excluded(self):
        campaign = self.add("Other campaign", "campaign", {})
        self.note(campaign_id=str(campaign.id))
        self.assertEqual(self.guide().json()["records"], [])

    def test_reader_filters_private_markers_notes_and_cast(self):
        note = self.note()
        self.publish(self.map, self.place, self.hero, self.campaign)
        data = self.guide(True).json()
        self.assertEqual(data["records"], [])
        self.assertEqual(len(data["map"]["data"]["markers"]), 2)
        self.assertNotIn("Secret camp", json.dumps(data))
        self.assertEqual(self.guide(True, "secret").status_code, 404)
        self.publish(note)
        self.assertEqual(self.guide(True).json()["records"][0]["id"], str(note.id))

    def test_private_marker_note_is_not_promoted_to_map_overview(self):
        note = self.note(marker_id="secret", related_entries=[str(self.map.id)])
        self.publish(self.map, self.campaign, note)
        self.assertNotIn("marker_id", serialize(note, reader=True)["data"])
        self.assertEqual(self.guide(True, marker="").json()["records"], [])

    def test_private_marker_groups_are_filtered(self):
        self.map = save_resource(
            self.world,
            {
                "expected_revision": self.map.revision,
                "data": {
                    **self.map.data,
                    "groups": [{"id": "hidden", "name": "GM", "private": True}],
                    "markers": [{**self.map.data["markers"][0], "group": "hidden"}],
                },
            },
            self.map,
        )
        note = self.note()
        self.publish(self.map, self.campaign, note)
        self.assertEqual(self.guide(True).status_code, 404)
        self.assertNotIn("marker_id", serialize(note, reader=True)["data"])

    def test_draft_location_and_records_use_published_snapshots(self):
        note = self.note()
        self.publish(self.map, self.place, self.campaign, note)
        self.place = save_resource(
            self.world,
            {"expected_revision": self.place.revision, "title": "Hidden draft name"},
            self.place,
        )
        self.assertEqual(self.guide(True).json()["location"]["title"], "Village")

    def test_unavailable_or_unshared_campaign_never_expands_scope(self):
        self.publish(self.map, self.place)
        self.assertEqual(self.guide(True).status_code, 404)
        other = self.add("Different campaign", "campaign", {})
        self.assertEqual(
            self.client.get(
                f"/api/resources/{self.map.id}/map-guide", {"campaign": str(other.id)}
            ).status_code,
            404,
        )

    def test_unlinked_pin_can_have_notes(self):
        note = self.note(marker_id="unlinked")
        response = self.guide(marker="unlinked").json()
        self.assertIsNone(response["location"])
        self.assertEqual(response["records"][0]["id"], str(note.id))

    def test_location_links_find_notes_without_map_metadata(self):
        note = self.add(
            "Village clue",
            "note",
            {
                "campaign_id": str(self.campaign.id),
                "related_entries": [str(self.place.id)],
            },
        )
        self.assertEqual(self.guide().json()["records"][0]["id"], str(note.id))

    def test_map_wide_notes_and_marker_specific_notes(self):
        general = self.note(marker_id="")
        specific = self.note(marker_id="unlinked")
        self.assertEqual(
            [r["id"] for r in self.guide().json()["records"]], [str(general.id)]
        )
        self.assertEqual(
            {r["id"] for r in self.guide(marker="unlinked").json()["records"]},
            {str(general.id), str(specific.id)},
        )

    def test_invalid_map_and_marker_associations_rejected(self):
        for data in (
            {"map_id": str(self.place.id), "marker_id": "village"},
            {"map_id": str(self.map.id), "marker_id": "missing"},
            {"marker_id": "village"},
            {"map_id": False},
            {"marker_id": []},
        ):
            response = self.client.post(
                f"/api/worlds/{self.world.id}/resources",
                json.dumps({"title": "Bad note", "kind": "note", "data": data}),
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 400)

    def test_removed_marker_preserves_record_and_revision_restore(self):
        note = self.note()
        self.map = save_resource(
            self.world,
            {"expected_revision": self.map.revision, "data": {"markers": []}},
            self.map,
        )
        note = save_resource(
            self.world,
            {"expected_revision": note.revision, "summary": "Keep this history"},
            note,
        )
        self.assertEqual(note.data["marker_id"], "village")
        self.assertEqual(self.guide().status_code, 404)

    def test_deleted_location_does_not_break_map(self):
        Resource.objects.filter(id=self.place.id).update(deleted_at=timezone.now())
        result = self.guide().json()
        self.assertIsNone(result["location"])
        self.assertEqual(result["people"], [])

    def test_private_map_ids_removed_from_reader_note(self):
        note = self.note()
        self.publish(note)
        data = serialize(note, reader=True)["data"]
        self.assertNotIn("map_id", data)
        self.assertNotIn("marker_id", data)

    def test_archive_remaps_map_location_and_note_ids(self):
        note = self.note(related_entries=[str(self.place.id)])
        copied = import_world_archive(self.user, world_archive(self.world))
        record = copied.resources.get(title=note.title)
        target = copied.resources.get(kind="map")
        self.assertEqual(record.data["map_id"], str(target.id))
        self.assertEqual(record.data["marker_id"], "village")
        self.assertEqual(
            record.data["related_entries"],
            [str(copied.resources.get(title="Village").id)],
        )

    def test_wrong_owner_and_missing_marker_are_unavailable(self):
        self.assertEqual(self.guide(marker="missing").status_code, 404)
        self.client.force_login(User.objects.create_user(username="outsider"))
        self.assertEqual(self.guide().status_code, 404)
