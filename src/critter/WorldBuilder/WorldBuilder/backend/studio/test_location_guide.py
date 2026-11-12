import json
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from .models import World, Resource
from .services import save_resource, snapshot, world_archive, import_world_archive
from .graphs import create_connection


def doc(text):
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


class LocationGuideTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="location-owner")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Location QA")
        self.place = self.add(
            "Lantern Hamlet",
            "article",
            {},
            template="settlement",
            aliases=["Old village"],
            document=doc("A settlement beside the shrine."),
            private_notes="GM-only village secret",
        )
        self.hero = self.add("Forest scout", "character", {})
        self.npc = self.add("Visiting keeper", "article", {}, template="character")
        self.building = self.add("Shrine", "article", {}, template="building")
        self.map = self.add(
            "Village map",
            "map",
            {
                "markers": [
                    {
                        "id": "hamlet",
                        "type": "pin",
                        "x": 0.3,
                        "y": 0.4,
                        "label": "Village",
                        "link_id": str(self.place.id),
                    },
                    {
                        "id": "hidden",
                        "type": "pin",
                        "x": 0.4,
                        "y": 0.6,
                        "label": "Hidden camp",
                        "link_id": str(self.place.id),
                        "private": True,
                    },
                    {
                        "id": "shrine",
                        "type": "pin",
                        "x": 0.6,
                        "y": 0.2,
                        "label": "Shrine",
                        "link_id": str(self.building.id),
                    },
                ]
            },
        )
        self.campaign = self.add(
            "Expedition",
            "campaign",
            {
                "party": [str(self.hero.id)],
                "related_entries": [
                    str(v.id) for v in (self.place, self.npc, self.building, self.map)
                ],
            },
        )
        self.edge(self.hero, self.place, "located-in", "Lives here")
        self.edge(self.npc, self.place, "friend", "Visits")
        self.edge(self.building, self.place, "located-in", "Within village")

    def add(self, title, kind, data, **more):
        return save_resource(
            self.world, {"title": title, "kind": kind, "data": data, **more}
        )

    def edge(self, source, target, kind, label="", visibility="public"):
        return create_connection(
            self.world,
            {
                "source": str(source.id),
                "target": str(target.id),
                "kind": kind,
                "label": label,
                "visibility": visibility,
                "notes": "GM-only relationship detail",
            },
        )

    def record(self, title="Discovery", kind="note", **data):
        return self.add(title, kind, {"campaign_id": str(self.campaign.id), **data})

    def publish(self, *rows):
        for row in rows:
            row.visibility = "public"
            row.published = {**snapshot(row), "_revision": row.revision}
            row.save(update_fields=["visibility", "published"])

    def guide(self, reader=False, campaign=True, target=None):
        return self.client.get(
            f"/api/resources/{(target or self.place).id}/location-guide",
            {
                **({"campaign": str(self.campaign.id)} if campaign else {}),
                **({"audience": "reader"} if reader else {}),
            },
        )

    def test_original_lore_graph_and_maps_are_combined_without_writes(self):
        before = Resource.objects.count()
        value = self.guide().json()
        self.assertEqual(value["location"]["id"], str(self.place.id))
        self.assertIn("A settlement", value["location"]["html"])
        self.assertEqual(value["relationship_total"], 3)
        self.assertEqual(value["location_total"], 3)
        self.assertEqual(Resource.objects.count(), before)
        self.place.refresh_from_db()
        self.assertEqual(self.place.revision, 1)

    def test_residents_distinguish_incoming_location_edges_from_other_connections(self):
        value = self.guide().json()
        people = {p["entry"]["id"]: p for p in value["people"]}
        self.assertEqual(set(people), {str(self.hero.id), str(self.npc.id)})
        self.assertTrue(people[str(self.hero.id)]["resident"])
        self.assertFalse(people[str(self.npc.id)]["resident"])
        self.assertEqual(
            people[str(self.npc.id)]["relationships"][0]["label"], "Visits"
        )
        self.assertEqual(value["people_total"], 2)

    def test_outgoing_location_relationship_does_not_claim_residence(self):
        self.edge(self.place, self.hero, "located-in", "Opposite direction")
        # Remove the actual incoming residence to isolate the opposite direction.
        self.world.connections.filter(source=self.hero, target=self.place).update(
            deleted_at=timezone.now()
        )
        person = next(
            p
            for p in self.guide().json()["people"]
            if p["entry"]["id"] == str(self.hero.id)
        )
        self.assertFalse(person["resident"])

    def test_pin_bound_session_and_journal_are_visits_without_name_mentions(self):
        session = self.record(
            "Visit", "session", number=1, map_id=str(self.map.id), marker_id="hamlet"
        )
        journal = self.record(
            "Visit notes",
            record_type="journal",
            map_id=str(self.map.id),
            marker_id="hamlet",
            session_id=str(session.id),
        )
        rows = {v["id"]: v for v in self.guide().json()["records"]}
        self.assertEqual(set(rows), {str(session.id), str(journal.id)})
        self.assertEqual(rows[str(journal.id)]["dossier_association"], "map location")

    def test_mapwide_and_other_place_pin_notes_do_not_become_visits(self):
        self.record("Whole map", map_id=str(self.map.id))
        self.record("Shrine-only", map_id=str(self.map.id), marker_id="shrine")
        self.assertEqual(self.guide().json()["records"], [])

    def test_explicit_place_link_and_unambiguous_alias_mentions_are_included(self):
        explicit = self.record(related_entries=[str(self.place.id)])
        mention = self.add(
            "Recap",
            "session",
            {"campaign_id": str(self.campaign.id), "recap": "Returned to Old village."},
        )
        self.assertEqual(
            {v["id"] for v in self.guide().json()["records"]},
            {str(explicit.id), str(mention.id)},
        )

    def test_ambiguous_alias_is_not_guessed(self):
        self.add(
            "Other village",
            "article",
            {},
            template="settlement",
            aliases=["Old village"],
        )
        self.add(
            "Ambiguous recap",
            "session",
            {"campaign_id": str(self.campaign.id), "recap": "Old village was visited."},
        )
        self.assertEqual(self.guide().json()["records"], [])

    def test_linked_location_journal_brings_its_session(self):
        session = self.record("Session", "session", number=1)
        self.record(
            record_type="journal",
            related_entries=[str(self.place.id)],
            session_id=str(session.id),
        )
        item = next(
            v for v in self.guide().json()["records"] if v["id"] == str(session.id)
        )
        self.assertEqual(item["dossier_association"], "linked session")

    def test_map_membership_opens_location_without_separate_cast_membership(self):
        self.campaign.data["related_entries"] = [str(self.map.id)]
        self.campaign.save(update_fields=["data"])
        value = self.guide().json()
        self.assertEqual(value["location"]["id"], str(self.place.id))
        self.assertEqual(
            self.guide(campaign=False).json()["campaigns"][0]["id"],
            str(self.campaign.id),
        )

    def test_other_campaign_records_and_unrelated_people_are_excluded(self):
        other = self.add("Other campaign", "campaign", {})
        record = self.record(
            related_entries=[str(self.place.id)], campaign_id=str(other.id)
        )
        outsider = self.add("Outsider", "character", {})
        self.edge(outsider, self.place, "located-in")
        self.assertNotIn(str(record.id), json.dumps(self.guide().json()))
        self.assertNotIn(str(outsider.id), json.dumps(self.guide().json()))
        self.assertIn(str(outsider.id), json.dumps(self.guide(campaign=False).json()))

    def test_reader_hides_private_people_edges_notes_and_pins(self):
        hidden = self.add("Hidden resident", "character", {})
        self.edge(hidden, self.place, "located-in", visibility="private")
        record = self.record(related_entries=[str(self.place.id)])
        self.publish(
            self.place, self.hero, self.npc, self.building, self.map, self.campaign
        )
        value = self.guide(True).json()
        encoded = json.dumps(value)
        for secret in ("GM-only", str(hidden.id), str(record.id), "Hidden camp"):
            self.assertNotIn(secret, encoded)
        self.assertEqual(value["location_total"], 2)
        self.assertEqual(value["people_total"], 2)

    def test_reader_uses_published_location_type_name_and_alias(self):
        self.publish(self.place, self.campaign)
        self.place.template = "article"
        self.place.title = "Draft location name"
        self.place.aliases = ["Draft alias"]
        self.place.save(update_fields=["template", "title", "aliases"])
        self.assertEqual(self.guide().status_code, 404)
        value = self.guide(True).json()
        self.assertEqual(value["location"]["title"], "Lantern Hamlet")
        self.assertEqual(value["location"]["aliases"], ["Old village"])

    def test_hidden_pin_records_are_not_reinterpreted_as_general_place_notes(self):
        record = self.record(
            map_id=str(self.map.id),
            marker_id="hidden",
            related_entries=[str(self.place.id)],
        )
        self.publish(self.place, self.map, self.campaign, record)
        self.assertEqual(len(self.guide().json()["records"]), 1)
        self.assertEqual(self.guide(True).json()["records"], [])

    def test_related_journal_does_not_resurrect_hidden_pin_session(self):
        session = self.record(
            "Secret visit",
            "session",
            number=1,
            map_id=str(self.map.id),
            marker_id="hidden",
        )
        journal = self.record(
            related_entries=[str(self.place.id)],
            session_id=str(session.id),
            record_type="journal",
        )
        self.publish(self.place, self.map, self.campaign, session, journal)
        self.assertEqual(
            [v["id"] for v in self.guide(True).json()["records"]], [str(journal.id)]
        )

    def test_only_hidden_map_pin_does_not_grant_campaign_reader_context(self):
        self.map.data["markers"] = [self.map.data["markers"][1]]
        self.map.save(update_fields=["data"])
        self.campaign.data = {"related_entries": [str(self.map.id)]}
        self.campaign.save(update_fields=["data"])
        self.publish(self.place, self.map, self.campaign)
        self.assertEqual(self.guide().status_code, 200)
        self.assertEqual(self.guide(True).status_code, 404)
        self.assertEqual(self.guide(True, campaign=False).json()["campaigns"], [])

    def test_private_planning_and_private_block_mentions_do_not_create_reader_visits(
        self,
    ):
        plan = self.record("Private plan", "session", prep="Lantern Hamlet ambush")
        block = self.add(
            "Secret block",
            "note",
            {"campaign_id": str(self.campaign.id)},
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "privateBlock",
                        "content": doc("Lantern Hamlet secret")["content"],
                    }
                ],
            },
        )
        self.publish(self.place, self.campaign, plan, block)
        self.assertEqual(self.guide(True).json()["records"], [])

    def test_current_map_changes_remove_stale_visits_but_preserve_original_metadata(
        self,
    ):
        record = self.record(map_id=str(self.map.id), marker_id="hamlet")
        self.map.data["markers"] = []
        self.map.save(update_fields=["data"])
        self.assertEqual(self.guide().json()["records"], [])
        record.refresh_from_db()
        self.assertEqual(record.data["marker_id"], "hamlet")

    def test_wrong_kind_deleted_unpublished_and_foreign_locations_are_unavailable(self):
        self.assertEqual(self.guide(target=self.hero).status_code, 404)
        self.assertEqual(self.guide(True).status_code, 404)
        self.place.deleted_at = timezone.now()
        self.place.save(update_fields=["deleted_at"])
        self.assertEqual(self.guide().status_code, 404)
        foreign_world = World.objects.create(
            owner=User.objects.create_user(username="other-location-owner"),
            name="Foreign",
        )
        foreign = save_resource(
            foreign_world,
            {"title": "Foreign place", "kind": "article", "template": "settlement"},
        )
        self.assertEqual(self.guide(target=foreign).status_code, 404)

    def test_building_and_geography_templates_have_guides(self):
        for template in ("building", "geography"):
            place = self.add(template, "article", {}, template=template)
            self.assertEqual(self.guide(campaign=False, target=place).status_code, 200)

    def test_archive_remaps_place_notes_sessions_pins_and_residents(self):
        session = self.record(
            "Visit session",
            "session",
            number=1,
            map_id=str(self.map.id),
            marker_id="hamlet",
        )
        self.record(related_entries=[str(self.place.id)], session_id=str(session.id))
        imported = import_world_archive(self.user, world_archive(self.world))
        place = Resource.objects.get(world=imported, title="Lantern Hamlet")
        value = self.guide(campaign=False, target=place).json()
        self.assertTrue(
            any(
                place.id != self.place.id
                and v["data"].get("related_entries") == [str(place.id)]
                for v in value["records"]
            )
        )
        self.assertNotEqual(value["people"][0]["entry"]["id"], str(self.hero.id))
        self.assertTrue(
            any(v["marker"]["link_id"] == str(place.id) for v in value["locations"])
        )

    def test_authentication_is_required(self):
        self.client.logout()
        self.assertEqual(self.guide().status_code, 401)

    def test_reader_can_open_published_map_after_its_draft_type_changes(self):
        self.publish(self.place, self.map, self.campaign)
        self.map.kind = "article"
        self.map.save(update_fields=["kind"])
        value = self.guide(True).json()
        self.assertTrue(
            any(row["map"]["id"] == str(self.map.id) for row in value["locations"])
        )
        response = self.client.get(
            f"/api/resources/{self.map.id}/map-guide",
            {"audience": "reader", "marker": "hamlet"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["location"]["id"], str(self.place.id))
        self.assertEqual(
            self.client.get(f"/api/resources/{self.map.id}/map-guide").status_code, 404
        )
