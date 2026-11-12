import json
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from .models import World, Resource
from .services import save_resource, snapshot, world_archive, import_world_archive
from .graphs import create_connection, graph_records
from .campaigns import campaign_members


def doc(text):
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


class CharacterDossierTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="dossier-owner")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Dossier QA")
        self.hero = self.add(
            "Forest scout",
            "character",
            {"fields": {"Occupation": "Scout"}},
            aliases=["Aki"],
            document=doc("Keeps a journal."),
            private_notes="Private character secret",
        )
        self.npc = self.add("Village keeper", "article", {}, template="character")
        self.place = self.add("Lantern Hamlet", "article", {}, template="settlement")
        self.map = self.add(
            "Forest map",
            "map",
            {
                "markers": [
                    {
                        "id": "hamlet",
                        "type": "pin",
                        "x": 0.3,
                        "y": 0.4,
                        "link_id": str(self.place.id),
                    },
                    {
                        "id": "hidden",
                        "type": "pin",
                        "x": 0.7,
                        "y": 0.4,
                        "link_id": str(self.place.id),
                        "private": True,
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
                    str(self.npc.id),
                    str(self.place.id),
                    str(self.map.id),
                ],
            },
        )
        self.friend = create_connection(
            self.world,
            {
                "source": str(self.hero.id),
                "target": str(self.npc.id),
                "kind": "friend",
                "label": "Trusted keeper",
                "visibility": "public",
                "notes": "Private relationship secret",
            },
        )
        create_connection(
            self.world,
            {
                "source": str(self.hero.id),
                "target": str(self.place.id),
                "kind": "located-in",
                "label": "Investigating",
                "visibility": "public",
            },
        )

    def add(self, title, kind, data, **fields):
        return save_resource(
            self.world, {"title": title, "kind": kind, "data": data, **fields}
        )

    def publish(self, *records):
        for record in records:
            record.visibility = "public"
            record.published = {**snapshot(record), "_revision": record.revision}
            record.save(update_fields=["visibility", "published"])

    def record(self, title="Milestone", kind="note", **data):
        return self.add(
            title,
            kind,
            {
                "campaign_id": str(self.campaign.id),
                "related_entries": [str(self.hero.id)],
                **data,
            },
        )

    def dossier(self, reader=False, campaign=True, identity=None):
        return self.client.get(
            f"/api/resources/{identity or self.hero.id}/dossier",
            {
                **({"campaign": str(self.campaign.id)} if campaign else {}),
                **({"audience": "reader"} if reader else {}),
            },
        )

    def test_original_lore_relationships_places_and_records_combined_without_writes(
        self,
    ):
        record = self.record(record_type="milestone")
        before = Resource.objects.count()
        value = self.dossier().json()
        self.assertEqual(value["character"]["id"], str(self.hero.id))
        self.assertEqual(value["relationship_total"], 2)
        self.assertEqual(value["location_total"], 2)
        self.assertEqual(value["records"][0]["id"], str(record.id))
        self.assertEqual(value["graph"]["nodes"][0]["id"], str(self.hero.id))
        self.assertEqual(Resource.objects.count(), before)
        self.hero.refresh_from_db()
        self.assertEqual(self.hero.revision, 1)

    def test_reader_omits_private_records_relationship_notes_and_source_gm_notes(self):
        self.record()
        self.publish(self.hero, self.npc, self.place, self.map, self.campaign)
        value = self.dossier(True).json()
        raw = json.dumps(value)
        self.assertEqual(value["records"], [])
        self.assertNotIn("Private character secret", raw)
        self.assertNotIn("Private relationship secret", raw)
        self.assertEqual(value["location_total"], 1)
        self.assertNotIn("hidden", json.dumps(value["locations"]))

    def test_private_neighbor_and_edge_do_not_leak_identity(self):
        self.publish(self.hero, self.place, self.campaign)
        value = self.dossier(True).json()
        self.assertEqual(value["relationship_total"], 1)
        self.assertNotIn(str(self.npc.id), json.dumps(value))

    def test_session_recap_alias_mention_is_an_appearance(self):
        session = self.add(
            "Session one",
            "session",
            {
                "campaign_id": str(self.campaign.id),
                "number": 1,
                "recap": "Aki found the shrine.",
                "rewards": "Aki earned the villagers’ trust.",
            },
        )
        value = self.dossier().json()
        item = next(r for r in value["records"] if r["id"] == str(session.id))
        self.assertEqual(item["dossier_association"], "mentioned")
        self.assertIn(str(self.hero.id), item["dossier_sections"]["recap"])

    def test_document_mentions_and_explicit_references_are_included(self):
        note = self.add(
            "Road note",
            "note",
            {"campaign_id": str(self.campaign.id)},
            document=doc("Forest scout found a clue."),
        )
        self.assertIn(str(note.id), [r["id"] for r in self.dossier().json()["records"]])
        explicit = self.add(
            "Explicit note",
            "note",
            {"campaign_id": str(self.campaign.id)},
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "resourceLink",
                                "attrs": {"id": str(self.hero.id), "label": "Old name"},
                            }
                        ],
                    }
                ],
            },
        )
        self.assertIn(
            str(explicit.id), [r["id"] for r in self.dossier().json()["records"]]
        )

    def test_ambiguous_alias_is_not_guessed(self):
        self.add("Another person", "character", {}, aliases=["Aki"])
        record = self.add(
            "Ambiguous note",
            "note",
            {"campaign_id": str(self.campaign.id)},
            document=doc("Aki was there."),
        )
        self.assertNotIn(
            str(record.id), [r["id"] for r in self.dossier().json()["records"]]
        )

    def test_linked_journal_brings_its_related_session(self):
        session = self.add(
            "Session without name",
            "session",
            {"campaign_id": str(self.campaign.id), "number": 1},
        )
        self.record(record_type="journal", session_id=str(session.id))
        item = next(
            r for r in self.dossier().json()["records"] if r["id"] == str(session.id)
        )
        self.assertEqual(item["dossier_association"], "linked session")

    def test_reader_private_planning_mentions_do_not_reveal_record(self):
        session = self.add(
            "Secret plan",
            "session",
            {
                "campaign_id": str(self.campaign.id),
                "prep": "Aki meets the villain.",
                "consequences": "Forest scout becomes wanted.",
            },
        )
        self.publish(self.hero, self.campaign, session)
        self.assertIn(
            str(session.id), [r["id"] for r in self.dossier().json()["records"]]
        )
        self.assertNotIn(str(session.id), json.dumps(self.dossier(True).json()))

    def test_reader_private_blocks_do_not_create_appearance(self):
        record = self.add(
            "Private block note",
            "note",
            {"campaign_id": str(self.campaign.id)},
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "privateBlock",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "text": "Aki is missing."}
                                ],
                            }
                        ],
                    }
                ],
            },
        )
        self.publish(self.hero, self.campaign, record)
        self.assertNotIn(str(record.id), json.dumps(self.dossier(True).json()))

    def test_reader_source_and_aliases_are_published_snapshots(self):
        record = self.add(
            "Recap",
            "session",
            {"campaign_id": str(self.campaign.id), "recap": "Aki arrived."},
        )
        self.publish(self.hero, self.campaign, record)
        self.hero = save_resource(
            self.world,
            {
                "expected_revision": self.hero.revision,
                "title": "Draft name",
                "aliases": ["Hidden draft alias"],
            },
            self.hero,
        )
        value = self.dossier(True).json()
        self.assertEqual(value["character"]["title"], "Forest scout")
        self.assertEqual(value["records"][0]["id"], str(record.id))
        self.assertNotIn("Hidden draft alias", json.dumps(value))

    def test_reader_npc_type_uses_published_template(self):
        self.publish(self.npc, self.campaign)
        self.npc = save_resource(
            self.world,
            {"expected_revision": self.npc.revision, "template": "generic"},
            self.npc,
        )
        self.assertEqual(self.dossier(True, identity=self.npc.id).status_code, 200)
        self.assertEqual(self.dossier(identity=self.npc.id).status_code, 404)

    def test_other_campaign_records_and_private_campaign_are_excluded(self):
        other = self.add("Other campaign", "campaign", {})
        record = self.record(campaign_id=str(other.id))
        self.assertNotIn(
            str(record.id), [r["id"] for r in self.dossier().json()["records"]]
        )
        self.publish(self.hero)
        self.assertEqual(self.dossier(True).status_code, 404)

    def test_character_outside_campaign_is_unavailable(self):
        outsider = self.add("Outside cast", "character", {})
        self.assertEqual(self.dossier(identity=outsider.id).status_code, 404)

    def test_reader_structured_outcomes_escape_html_and_exclude_gm_sections(self):
        record = self.record(
            kind="session",
            number=1,
            recap="Aki found <script>alert(1)</script>.",
            prep="Hidden prep",
            consequences="Hidden consequences",
            next_steps="Hidden follow-up",
            rewards="Aki earns trust.",
        )
        self.publish(self.hero, self.campaign, record)
        result = self.dossier(True).json()["records"][0]
        self.assertEqual(set(result["dossier_sections"]), {"recap", "rewards"})
        self.assertNotIn("<script>", result["dossier_sections"]["recap"])

    def test_explicitly_detached_session_keeps_empty_campaign(self):
        session = self.add(
            "Detached",
            "session",
            {"campaign_id": "", "number": 1},
            parent=str(self.campaign.id),
        )
        note = self.add(
            "World journal",
            "note",
            {
                "campaign_id": "",
                "session_id": str(session.id),
                "related_entries": [str(self.hero.id)],
            },
        )
        self.assertEqual(note.data["campaign_id"], "")
        self.assertNotIn(
            str(session.id),
            campaign_members(
                graph_records(self.world)[str(self.campaign.id)],
                graph_records(self.world),
            ),
        )

    def test_legacy_null_membership_uses_collection_parent_consistently(self):
        legacy = self.add(
            "Legacy NPC",
            "article",
            {"campaign_id": None},
            template="character",
            parent=str(self.campaign.id),
        )
        self.assertEqual(self.dossier(identity=legacy.id).status_code, 200)

    def test_note_and_portrait_changes_keep_character_identity_and_archives(self):
        note = self.record(record_type="milestone")
        copied = import_world_archive(self.user, world_archive(self.world))
        target = copied.resources.get(title=self.hero.title)
        record = copied.resources.get(title=note.title)
        self.assertEqual(record.data["related_entries"], [str(target.id)])
        self.assertEqual(self.hero.revision, 1)

    def test_missing_wrong_kind_deleted_and_foreign_owner_are_unavailable(self):
        self.assertEqual(self.dossier(identity=self.place.id).status_code, 404)
        Resource.objects.filter(id=self.hero.id).update(deleted_at=timezone.now())
        self.assertEqual(self.dossier().status_code, 404)
        self.client.force_login(User.objects.create_user(username="other-owner"))
        self.assertEqual(self.dossier(identity=self.npc.id).status_code, 404)

    def test_same_day_milestone_keeps_its_recording_order_with_sessions(self):
        from datetime import datetime

        session = self.record(title="Earlier session", kind="session", number=1)
        milestone = self.record(
            title="Later milestone", record_type="milestone", logged_on="2026-11-05"
        )
        Resource.objects.filter(id=session.id).update(
            updated_at=datetime.fromisoformat("2026-11-05T10:00:00+00:00")
        )
        Resource.objects.filter(id=milestone.id).update(
            updated_at=datetime.fromisoformat("2026-11-05T11:00:00+00:00")
        )
        self.assertEqual(
            [item["id"] for item in self.dossier().json()["records"]],
            [str(milestone.id), str(session.id)],
        )
