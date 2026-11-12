import json
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from .models import World, Resource
from .services import save_resource, snapshot, world_archive, import_world_archive


class SessionGuideTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="session-guide-owner")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Session guide QA")
        self.hero = self.add("Forest scout", "character", {}, aliases=["Aki"])
        self.campaign = self.add(
            "Expedition", "campaign", {"party": [str(self.hero.id)]}
        )
        self.other = self.add("Other campaign", "campaign", {})
        self.previous = self.session("Previous", 1, next_steps="GM-only shrine lead")
        self.current = self.session(
            "Current",
            2,
            prep="Ambush Aki",
            recap="Aki rescued a traveller",
            consequences="Secret pursuers",
            rewards="Village favour",
            next_steps="Secret shrine",
            related_entries=[str(self.hero.id)],
        )
        self.following = self.session("Following", 3)

    def add(self, title, kind, data, **fields):
        return save_resource(
            self.world, {"title": title, "kind": kind, "data": data, **fields}
        )

    def session(self, title, number, **data):
        return self.add(
            title,
            "session",
            {"campaign_id": str(self.campaign.id), "number": number, **data},
        )

    def note(self, title="Discovery", kind="note", **data):
        return self.add(
            title,
            kind,
            {
                "campaign_id": str(self.campaign.id),
                "session_id": str(self.current.id),
                **data,
            },
        )

    def publish(self, *rows):
        for row in rows:
            row.visibility = "public"
            row.published = {**snapshot(row), "_revision": row.revision}
            row.save(update_fields=["visibility", "published"])

    def guide(self, reader=False, row=None):
        return self.client.get(
            f"/api/resources/{(row or self.current).id}/session-guide",
            {"audience": "reader"} if reader else {},
        )

    def test_original_session_sections_links_and_neighbors_without_writes(self):
        count = Resource.objects.count()
        value = self.guide().json()
        self.assertEqual(value["session"]["id"], str(self.current.id))
        self.assertEqual(value["previous"]["id"], str(self.previous.id))
        self.assertEqual(value["following"]["id"], str(self.following.id))
        self.assertEqual(value["previous_follow_up"], "GM-only shrine lead")
        self.assertIn(f'data-resource-id="{self.hero.id}"', value["sections"]["recap"])
        self.assertEqual(Resource.objects.count(), count)
        self.assertEqual(self.current.revisions.count(), 1)

    def test_only_matching_session_and_campaign_records_are_included(self):
        note = self.note()
        self.note("Other session", session_id=str(self.previous.id))
        foreign = self.note("Legacy wrong campaign")
        foreign.data = {**foreign.data, "campaign_id": str(self.other.id)}
        foreign.save(update_fields=["data"])
        self.note("Unassigned", session_id="")
        value = self.guide().json()
        self.assertEqual([v["id"] for v in value["records"]], [str(note.id)])

    def test_explicit_unassigned_records_are_included_but_other_sessions_are_not(self):
        quest = self.note("Quest", "quest", session_id="")
        elsewhere = self.note("Elsewhere", session_id=str(self.previous.id))
        self.current.data["related_entries"] = [str(quest.id), str(elsewhere.id)]
        self.current.save(update_fields=["data"])
        self.assertEqual(
            [v["id"] for v in self.guide().json()["records"]], [str(quest.id)]
        )

    def test_cast_comes_from_party_and_session_records_without_unrelated_campaign_cast(
        self,
    ):
        npc = self.add("Keeper", "article", {}, template="character")
        unrelated = self.add("Other NPC", "character", {})
        self.note(related_entries=[str(npc.id)])
        self.campaign.data["related_entries"] = [str(unrelated.id)]
        self.campaign.save(update_fields=["data"])
        value = self.guide().json()
        self.assertEqual(
            {v["id"] for v in value["cast"]}, {str(self.hero.id), str(npc.id)}
        )
        self.assertEqual(
            next(v for v in value["cast"] if v["id"] == str(self.hero.id))[
                "association"
            ],
            "party",
        )

    def map(self):
        return self.add(
            "Road map",
            "map",
            {
                "markers": [
                    {
                        "id": "village",
                        "type": "pin",
                        "label": "Village",
                        "x": 0.2,
                        "y": 0.4,
                    },
                    {
                        "id": "secret",
                        "type": "pin",
                        "label": "Hidden camp",
                        "x": 0.7,
                        "y": 0.4,
                        "private": True,
                    },
                ]
            },
        )

    def test_locations_deduplicate_map_pins_and_include_record_locations(self):
        chart = self.map()
        self.current.data.update(
            map_id=str(chart.id), marker_id="village", related_entries=[str(chart.id)]
        )
        self.current.save(update_fields=["data"])
        self.note(map_id=str(chart.id), marker_id="village")
        self.note("Hidden location", map_id=str(chart.id), marker_id="secret")
        value = self.guide().json()
        self.assertEqual(
            {v["marker_id"] for v in value["locations"]}, {"village", "secret"}
        )
        self.assertEqual(value["location_total"], 2)

    def test_reader_hides_private_records_party_and_gm_sections(self):
        hidden = self.add("Hidden patron", "character", {})
        self.campaign.data["party"].append(str(hidden.id))
        self.campaign.save(update_fields=["data"])
        public = self.note("Public discovery")
        secret = self.note("Secret discovery", related_entries=[str(hidden.id)])
        self.publish(
            self.current,
            self.previous,
            self.following,
            self.campaign,
            self.hero,
            public,
        )
        value = self.guide(True).json()
        self.assertEqual(set(value["sections"]), {"recap", "rewards"})
        self.assertEqual(value["previous_follow_up"], "")
        self.assertEqual([v["id"] for v in value["records"]], [str(public.id)])
        encoded = json.dumps(value)
        for text in (
            str(hidden.id),
            str(secret.id),
            "Secret pursuers",
            "Secret shrine",
            "GM-only shrine lead",
            "Ambush Aki",
        ):
            self.assertNotIn(text, encoded)

    def test_reader_uses_published_cast_titles_portraits_and_session_membership(self):
        self.publish(self.current, self.campaign, self.hero)
        self.hero.title = "Draft name"
        self.hero.data["cover_asset"] = "draft-only-portrait"
        self.hero.save(update_fields=["title", "data"])
        self.current.data["campaign_id"] = str(self.other.id)
        self.current.data["recap"] = "Draft-only recap"
        self.current.save(update_fields=["data"])
        value = self.guide(True).json()
        self.assertEqual(value["campaign"]["id"], str(self.campaign.id))
        self.assertEqual(value["cast"][0]["title"], "Forest scout")
        self.assertNotIn("draft-only", json.dumps(value).lower())

    def test_reader_omits_hidden_pin_ids_and_private_maps(self):
        chart = self.map()
        secret = self.map()
        self.current.data.update(map_id=str(chart.id), marker_id="secret")
        self.current.save(update_fields=["data"])
        public = self.note(map_id=str(secret.id), marker_id="village")
        self.publish(self.current, chart, public)
        encoded = json.dumps(self.guide(True).json())
        self.assertNotIn('"marker_id": "secret"', encoded)
        self.assertNotIn("Hidden camp", encoded)
        self.assertNotIn(str(secret.id), encoded)

    def test_hidden_campaign_and_neighbors_do_not_leak(self):
        self.publish(self.current, self.previous, self.following)
        value = self.guide(True).json()
        self.assertIsNone(value["campaign"])
        self.assertIsNone(value["previous"])
        self.assertIsNone(value["following"])
        self.assertNotIn(str(self.campaign.id), json.dumps(value))

    def test_legacy_parent_fallback_and_explicitly_detached_membership(self):
        self.current.parent = self.campaign
        self.current.data.pop("campaign_id")
        self.current.save(update_fields=["parent", "data"])
        self.assertEqual(self.guide().json()["campaign"]["id"], str(self.campaign.id))
        self.current.data["campaign_id"] = ""
        self.current.save(update_fields=["data"])
        value = self.guide().json()
        self.assertIsNone(value["campaign"])
        self.assertIsNone(value["previous"])

    def test_structured_text_is_escaped_and_world_optout_respected(self):
        self.current.data["recap"] = "<script>alert(1)</script> Aki\nReturned"
        self.current.save(update_fields=["data"])
        text = self.guide().json()["sections"]["recap"]
        self.assertNotIn("<script>", text)
        self.assertIn("<br>", text)
        self.world.data["auto_link_names"] = False
        self.world.save(update_fields=["data"])
        self.assertNotIn("data-resource-id", self.guide().json()["sections"]["recap"])

    def test_deleted_and_foreign_records_or_wrong_kind_are_unavailable(self):
        self.assertEqual(self.guide(row=self.hero).status_code, 404)
        other_world = World.objects.create(
            owner=User.objects.create_user(username="outsider"), name="Foreign"
        )
        foreign = save_resource(
            other_world, {"title": "Foreign session", "kind": "session"}
        )
        self.assertEqual(self.guide(row=foreign).status_code, 404)
        self.current.deleted_at = timezone.now()
        self.current.save(update_fields=["deleted_at"])
        self.assertEqual(self.guide().status_code, 404)

    def test_private_and_unpublished_sessions_have_no_reader_guide(self):
        self.assertEqual(self.guide(True).status_code, 404)
        self.current.visibility = "public"
        self.current.save(update_fields=["visibility"])
        self.assertEqual(self.guide(True).status_code, 404)

    def test_stale_plan_revision_conflicts_without_overwriting_or_publishing(self):
        self.publish(self.current)
        old = self.current.revision
        updated = save_resource(
            self.world,
            {
                "data": {**self.current.data, "prep": "Newer plan"},
                "expected_revision": old,
            },
            self.current,
        )
        response = self.client.patch(
            f"/api/resources/{self.current.id}",
            json.dumps({"data": {"prep": "Stale plan"}, "expected_revision": old}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        updated.refresh_from_db()
        self.assertEqual(updated.data["prep"], "Newer plan")
        self.assertEqual(updated.published["data"]["prep"], "Ambush Aki")

    def test_archive_remaps_session_character_and_location_associations(self):
        chart = self.map()
        self.note(
            map_id=str(chart.id),
            marker_id="village",
            related_entries=[str(self.hero.id)],
        )
        imported = import_world_archive(self.user, world_archive(self.world))
        current = Resource.objects.get(world=imported, title="Current")
        value = self.guide(row=current).json()
        self.assertEqual(value["records"][0]["data"]["session_id"], str(current.id))
        self.assertNotEqual(value["cast"][0]["id"], str(self.hero.id))
        self.assertEqual(value["locations"][0]["marker_id"], "village")

    def test_requires_authentication(self):
        self.client.logout()
        self.assertEqual(self.guide().status_code, 401)

    def test_reader_session_sanitation_follows_published_kind_after_draft_changes(self):
        self.publish(self.current)
        self.current.kind = "article"
        self.current.save(update_fields=["kind"])
        value = self.guide(True).json()
        self.assertEqual(value["session"]["kind"], "session")
        self.assertEqual(set(value["sections"]), {"recap", "rewards"})
        self.assertNotIn("Secret shrine", json.dumps(value))

    def test_record_limit_reports_total_and_keeps_newest_same_day_first(self):
        rows = [
            Resource(
                world=self.world,
                kind="note",
                title=f"Record {n}",
                data={
                    "campaign_id": str(self.campaign.id),
                    "session_id": str(self.current.id),
                    "logged_on": "2026-11-05",
                },
            )
            for n in range(201)
        ]
        Resource.objects.bulk_create(rows)
        value = self.guide().json()
        self.assertEqual(value["record_total"], 201)
        self.assertEqual(len(value["records"]), 200)
        self.assertEqual(value["records"][0]["id"], str(rows[-1].id))

    def test_removed_location_keeps_original_metadata_without_dead_pin(self):
        chart = self.map()
        self.current.data.update(map_id=str(chart.id), marker_id="village")
        self.current.save(update_fields=["data"])
        chart.data["markers"] = []
        chart.save(update_fields=["data"])
        value = self.guide().json()
        self.assertEqual(value["locations"][0]["marker_id"], "")
        self.assertEqual(value["session"]["data"]["marker_id"], "village")
        self.current.refresh_from_db()
        self.assertEqual(self.current.data["marker_id"], "village")

    def test_standalone_session_does_not_collect_other_standalone_notes(self):
        standalone = self.session("Standalone", 1, campaign_id="")
        self.note("Unassigned world note", campaign_id="", session_id="")
        note = self.note(
            "Standalone note", campaign_id="", session_id=str(standalone.id)
        )
        self.assertEqual(
            [v["id"] for v in self.guide(row=standalone).json()["records"]],
            [str(note.id)],
        )

    def test_published_map_filtering_follows_snapshot_kind_after_draft_changes(self):
        chart = self.map()
        self.publish(chart)
        chart.kind = "article"
        chart.save(update_fields=["kind"])
        response = self.client.get(f"/api/resources/{chart.id}", {"audience": "reader"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["kind"], "map")
        self.assertEqual(
            [m["id"] for m in response.json()["data"]["markers"]], ["village"]
        )
