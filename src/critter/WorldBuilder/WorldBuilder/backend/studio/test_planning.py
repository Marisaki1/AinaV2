import base64
import copy
import json
import tempfile
from pathlib import Path

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import Asset, Resource, World
from .services import import_world_archive, save_resource, snapshot, world_archive


def doc(text):
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


class CampaignPlanningTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="planner-owner")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Planning QA")
        self.campaign = self.add("Journey", "campaign", {})
        self.other = self.add("Other campaign", "campaign", {})
        self.adventure = self.plan("Shrine adventure", "adventure")
        self.scene = self.plan(
            "Arrival",
            "campaign-scene",
            adventure_id=str(self.adventure.id),
            public_summary="The party arrives.",
            stakes="GM-only ambush",
            branch_notes="GM-only secret route",
        )
        self.encounter = self.plan(
            "Keeper encounter",
            "encounter",
            adventure_id=str(self.adventure.id),
            prerequisites=[str(self.scene.id)],
            environment="GM-only hidden door",
        )
        self.session = self.record(
            "Session one",
            "session",
            number=1,
            agenda=[self.item(self.scene), self.item(self.encounter)],
        )
        self.next = self.record("Session two", "session", number=2)
        self.note = self.record(
            "Discovered clue",
            document=doc("The party found a clue."),
            session_id=str(self.session.id),
            scene_id=str(self.scene.id),
            record_type="journal",
            follow_up_state="open",
        )
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings = override_settings(MEDIA_ROOT=Path(self.temp.name))
        self.settings.enable()
        self.addCleanup(self.settings.disable)

    def add(self, title, kind, data, **more):
        return save_resource(
            self.world, {"title": title, "kind": kind, "data": data, **more}
        )

    def plan(self, title, type, **data):
        return self.add(
            title,
            "article",
            {"planning_type": type, "campaign_id": str(self.campaign.id), **data},
            template=type,
            document=doc("Original planning lore."),
        )

    def record(self, title, kind="note", document=None, **data):
        return self.add(
            title,
            kind,
            {"campaign_id": str(self.campaign.id), **data},
            **({"document": document} if document else {}),
        )

    def item(self, row, state="planned"):
        return {
            "entry_id": str(row.id),
            "state": state,
            "notes": "GM-only agenda reminder",
        }

    def publish(self, *rows):
        for row in rows:
            row.visibility = "public"
            row.published = {**snapshot(row), "_revision": row.revision}
            row.save(update_fields=["visibility", "published"])

    def update(self, row, **data):
        return save_resource(
            self.world,
            {"data": {**row.data, **data}, "expected_revision": row.revision},
            row,
        )

    def request(self, row, action, payload):
        return self.client.post(
            f"/api/resources/{row.id}/{action}",
            json.dumps(payload),
            content_type="application/json",
        )

    def life(self, **query):
        return self.client.get(f"/api/resources/{self.campaign.id}/lifecycle", query)

    def handoff(self, **more):
        return self.request(
            self.session,
            "handoff",
            {
                "expected_revision": self.session.revision,
                "target_id": str(self.next.id),
                "target_revision": self.next.revision,
                "entry_ids": [str(self.encounter.id)],
                "followup_ids": [str(self.note.id)],
                **more,
            },
        )

    def test_planning_types_are_original_versioned_records(self):
        value = self.life().json()
        self.assertEqual(
            {v["id"] for v in value["planning"]},
            {str(self.adventure.id), str(self.scene.id), str(self.encounter.id)},
        )
        self.assertEqual(self.scene.revisions.count(), 1)
        self.assertEqual(self.scene.visibility, "private")

    def test_writing_manuscript_scenes_are_unchanged(self):
        writing = self.add(
            "Writing scene", "scene", {}, document=doc("A manuscript passage.")
        )
        self.assertEqual(writing.kind, "scene")
        self.assertNotIn(str(writing.id), json.dumps(self.life().json()["planning"]))

    def test_branch_and_prerequisite_references_must_match_campaign(self):
        foreign = self.plan(
            "Elsewhere", "campaign-scene", campaign_id=str(self.other.id)
        )
        for change in (
            {"prerequisites": [str(foreign.id)]},
            {
                "next_scenes": [
                    {
                        "target_id": str(foreign.id),
                        "label": "Elsewhere",
                        "condition": "GM secret",
                    }
                ]
            },
        ):
            with self.assertRaises(ValueError):
                self.update(self.scene, **change)

    def test_non_linear_scene_routes_allow_loops_with_unique_targets(self):
        self.scene = self.update(
            self.scene,
            next_scenes=[
                {
                    "target_id": str(self.encounter.id),
                    "label": "Investigate",
                    "condition": "If curious",
                }
            ],
        )
        self.encounter = self.update(
            self.encounter,
            next_scenes=[
                {
                    "target_id": str(self.scene.id),
                    "label": "Return",
                    "condition": "Retreat",
                }
            ],
        )
        with self.assertRaises(ValueError):
            self.update(self.scene, next_scenes=self.scene.data["next_scenes"] * 2)

    def test_adventure_order_and_positions_survive_reopen(self):
        self.adventure = self.update(
            self.adventure,
            scene_ids=[str(self.encounter.id), str(self.scene.id)],
            positions={str(self.scene.id): {"x": 200, "y": 300}},
        )
        found = next(
            v
            for v in self.life().json()["planning"]
            if v["id"] == str(self.adventure.id)
        )
        self.assertEqual(found["data"]["scene_ids"][0], str(self.encounter.id))
        self.assertEqual(found["data"]["positions"][str(self.scene.id)]["x"], 200)

    def test_invalid_scene_positions_and_shapes_rejected(self):
        for positions in (
            {str(self.scene.id): {"x": True, "y": 1}},
            {str(self.scene.id): {"x": float("inf"), "y": 1}},
            [],
        ):
            with self.assertRaises(ValueError):
                self.update(self.adventure, positions=positions)

    def test_agenda_supports_reminders_and_tasks_as_original_references(self):
        task = self.record("Reminder", "task", progress="open")
        self.session = self.update(
            self.session,
            agenda=[self.item(self.scene), self.item(task), self.item(self.note)],
        )
        self.assertEqual(len(self.session.data["agenda"]), 3)

    def test_agenda_duplicate_and_invalid_active_states_rejected(self):
        for data in (
            {"agenda": [self.item(self.scene)] * 2},
            {"agenda": [self.item(self.scene, "active")]},
            {
                "agenda": [
                    self.item(self.scene, "active"),
                    self.item(self.encounter, "active"),
                ],
                "active_scene_id": str(self.scene.id),
            },
        ):
            with self.assertRaises(ValueError):
                self.update(self.session, **data)

    def test_session_scene_states_do_not_mutate_definitions_or_another_session(self):
        self.next = self.update(self.next, agenda=[self.item(self.scene)])
        self.session = self.update(
            self.session,
            agenda=[
                self.item(self.scene, "completed"),
                self.item(self.encounter, "active"),
            ],
            active_scene_id=str(self.encounter.id),
        )
        self.scene.refresh_from_db()
        self.next.refresh_from_db()
        self.assertNotIn("scene_state", self.scene.data)
        self.assertEqual(self.next.data["agenda"][0]["state"], "planned")

    def test_scene_bound_capture_and_followup_keep_origin(self):
        self.note = self.update(
            self.note,
            follow_up_state="scheduled",
            follow_up_session_id=str(self.next.id),
        )
        self.assertEqual(self.note.data["session_id"], str(self.session.id))
        self.assertEqual(self.note.data["scene_id"], str(self.scene.id))

    def test_scene_reference_from_another_campaign_rejected(self):
        scene = self.plan(
            "Other scene", "campaign-scene", campaign_id=str(self.other.id)
        )
        with self.assertRaises(ValueError):
            self.record("Wrong event", scene_id=str(scene.id))

    def test_lifecycle_session_and_campaign_filters(self):
        outsider = self.record("Other record", campaign_id=str(self.other.id))
        future = self.record("Future event", session_id=str(self.next.id))
        value = self.life(session=str(self.session.id)).json()
        self.assertIn(str(self.note.id), json.dumps(value["journal"]))
        self.assertNotIn(str(outsider.id), json.dumps(value))
        self.assertNotIn(str(future.id), json.dumps(value["journal"]))

    def test_journal_filters_lore_threads_and_full_body(self):
        hero = self.add("Scout", "character", {})
        quest = self.record("Mystery", "quest")
        self.note = self.update(
            self.note, related_entries=[str(hero.id)], thread_id=str(quest.id)
        )
        self.assertEqual(
            self.life(
                person=str(hero.id), thread=str(quest.id), q="found a clue"
            ).json()["journal_total"],
            1,
        )

    def test_activity_log_tracks_updates_separately(self):
        self.note = self.update(self.note, world_day="Day two")
        events = self.life(session=str(self.session.id)).json()["activity"]
        self.assertTrue(
            any(
                v["data"]["resource_id"] == str(self.note.id) and v["kind"] == "updated"
                for v in events
            )
        )

    def test_handoff_normalizes_legacy_parent_membership(self):
        for row in (self.session, self.next, self.note):
            data = {
                key: value for key, value in row.data.items() if key != "campaign_id"
            }
            Resource.objects.filter(id=row.id).update(parent=self.campaign, data=data)
            row.refresh_from_db()
        before = copy.deepcopy(self.session.data["agenda"])
        response = self.handoff(
            entry_ids=[str(self.scene.id)], followup_ids=[str(self.note.id)]
        )
        self.assertEqual(response.status_code, 200, response.content)
        for row in (self.session, self.next, self.note):
            row.refresh_from_db()
            self.assertEqual(row.data["campaign_id"], str(self.campaign.id))
        self.assertEqual(self.session.data["agenda"], before)
        self.assertEqual(self.next.data["agenda"][0]["entry_id"], str(self.scene.id))
        self.assertEqual(self.note.data["session_id"], str(self.session.id))
        self.assertEqual(self.note.data["follow_up_session_id"], str(self.next.id))

    def test_followup_conversion_is_atomic_and_links_original(self):
        self.note = self.update(
            self.note,
            follow_up_session_id=str(self.next.id),
            follow_up_state="scheduled",
        )
        response = self.request(
            self.note,
            "follow-up-task",
            {"expected_revision": self.note.revision, "title": "Investigate clue"},
        )
        self.assertEqual(response.status_code, 200)
        task = Resource.objects.get(id=response.json()["task_id"])
        self.note.refresh_from_db()
        self.assertEqual(task.data["related_entries"], [str(self.note.id)])
        self.assertEqual(task.data["session_id"], str(self.next.id))
        self.assertEqual(task.data["origin_session_id"], str(self.session.id))
        self.assertEqual(self.note.data["follow_up_state"], "done")
        self.assertEqual(self.note.document, doc("The party found a clue."))

    def test_followup_stale_and_repeated_conversion_do_not_duplicate_tasks(self):
        original = self.note.revision
        first = self.request(
            self.note, "follow-up-task", {"expected_revision": original}
        )
        self.assertEqual(first.status_code, 200)
        count = Resource.objects.filter(kind="task").count()
        self.assertEqual(
            self.request(
                self.note, "follow-up-task", {"expected_revision": original}
            ).status_code,
            409,
        )
        self.note.refresh_from_db()
        self.assertEqual(
            self.request(
                self.note, "follow-up-task", {"expected_revision": self.note.revision}
            ).status_code,
            400,
        )
        self.assertEqual(Resource.objects.filter(kind="task").count(), count)

    def test_handoff_preserves_source_history_and_existing_target_items(self):
        self.next = self.update(self.next, agenda=[self.item(self.scene, "completed")])
        before = copy.deepcopy(self.session.data["agenda"])
        response = self.handoff()
        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.next.refresh_from_db()
        self.note.refresh_from_db()
        self.assertEqual(self.session.data["agenda"], before)
        self.assertEqual(
            self.next.data["agenda"],
            [self.item(self.scene, "completed"), self.item(self.encounter)],
        )
        self.assertEqual(self.note.data["session_id"], str(self.session.id))
        self.assertEqual(self.note.data["follow_up_session_id"], str(self.next.id))

    def test_handoff_creates_private_next_session_and_replay_is_rejected(self):
        before = Resource.objects.filter(kind="session").count()
        payload = {
            "expected_revision": self.session.revision,
            "entry_ids": [str(self.encounter.id)],
            "title": "Prepared next chapter",
        }
        response = self.request(self.session, "handoff", payload)
        self.assertEqual(response.status_code, 200)
        target = Resource.objects.get(id=response.json()["target_id"])
        self.assertEqual(target.visibility, "private")
        self.assertEqual(target.data["number"], 3)
        self.assertEqual(
            self.request(self.session, "handoff", payload).status_code, 409
        )
        self.assertEqual(Resource.objects.filter(kind="session").count(), before + 1)

    def test_handoff_rejects_stale_target_without_partial_writes(self):
        old = self.next.revision
        self.next = self.update(self.next, recap="Newer target recap")
        self.assertEqual(self.handoff(target_revision=old).status_code, 409)
        self.session.refresh_from_db()
        self.assertNotIn("handoff_target_id", self.session.data)

    def test_handoff_rejects_completed_foreign_or_missing_items(self):
        self.session = self.update(
            self.session,
            agenda=[self.item(self.scene, "completed"), self.item(self.encounter)],
        )
        self.assertEqual(self.handoff(entry_ids=[str(self.scene.id)]).status_code, 400)
        other = self.record("Wrong target", "session", campaign_id=str(self.other.id))
        self.assertEqual(self.handoff(target_id=str(other.id)).status_code, 400)

    def test_bad_followup_rolls_back_new_target_and_all_mutations(self):
        other = self.record("Other followup", campaign_id=str(self.other.id))
        count = Resource.objects.filter(kind="session").count()
        response = self.handoff(target_id="", followup_ids=[str(other.id)])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Resource.objects.filter(kind="session").count(), count)
        self.note.refresh_from_db()
        self.assertEqual(self.note.data["follow_up_state"], "open")

    def test_recap_assembly_is_editable_draft_data_and_never_writes(self):
        original = self.session.revision
        response = self.request(
            self.session, "recap-draft", {"ids": [str(self.note.id)] * 2}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("found a clue", response.json()["text"])
        self.assertEqual(response.json()["text"].count("Discovered clue"), 1)
        self.session.refresh_from_db()
        self.assertEqual(self.session.revision, original)

    def test_recap_excludes_private_blocks_and_rejects_other_sessions(self):
        self.note.document = {
            "type": "doc",
            "content": [
                *doc("Public event")["content"],
                {
                    "type": "privateBlock",
                    "content": doc("GM-only recap block")["content"],
                },
            ],
        }
        self.note.save(update_fields=["document"])
        text = self.request(
            self.session, "recap-draft", {"ids": [str(self.note.id)]}
        ).json()["text"]
        self.assertNotIn("GM-only", text)
        other = self.record("Future event", session_id=str(self.next.id))
        self.assertEqual(
            self.request(
                self.session, "recap-draft", {"ids": [str(other.id)]}
            ).status_code,
            400,
        )

    def test_reader_projection_removes_preparation_agenda_and_private_routes(self):
        self.scene = self.update(
            self.scene,
            next_scenes=[
                {
                    "target_id": str(self.encounter.id),
                    "label": "Secret path",
                    "condition": "GM-only betrayal",
                }
            ],
        )
        self.publish(self.campaign, self.scene, self.encounter, self.session, self.note)
        for row in (self.scene, self.session, self.note):
            value = self.client.get(
                f"/api/resources/{row.id}", {"audience": "reader"}
            ).json()
            encoded = json.dumps(value)
            for secret in (
                "GM-only",
                "active_scene_id",
                "follow_up_state",
                "agenda",
                "next_scenes",
            ):
                self.assertNotIn(secret, encoded)

    def test_lifecycle_owner_only_and_unavailable_foreign_session(self):
        self.assertEqual(self.life(audience="reader").status_code, 404)
        other = self.record("Other session", "session", campaign_id=str(self.other.id))
        self.assertEqual(self.life(session=str(other.id)).status_code, 400)
        self.client.logout()
        self.assertEqual(self.life().status_code, 401)

    def test_handout_uses_published_sources_and_excludes_private_identity(self):
        public = self.record("Published lore", document=doc("Approved content"))
        private = self.record("Secret identity", document=doc("GM-only private body"))
        self.publish(public)
        public.document = doc("Unpublished body")
        public.save(update_fields=["document"])
        handout = self.plan(
            "Player briefing",
            "handout",
            handout_sources=[str(public.id), str(private.id)],
            handout_text="A player introduction",
        )
        response = self.client.get(f"/api/resources/{handout.id}/handout")
        self.assertEqual(response.status_code, 200)
        value = response.json()
        encoded = json.dumps(value)
        self.assertIn("Approved content", encoded)
        self.assertNotIn("Unpublished body", encoded)
        self.assertNotIn(str(private.id), encoded)
        self.assertNotIn("Secret identity", encoded)
        self.assertEqual(value["omitted"], 1)

    def test_handout_source_filters_private_blocks_and_gm_fields(self):
        self.publish(self.scene, self.session)
        handout = self.plan(
            "Briefing",
            "handout",
            handout_sources=[str(self.scene.id), str(self.session.id)],
        )
        encoded = json.dumps(
            self.client.get(f"/api/resources/{handout.id}/handout").json()
        )
        self.assertNotIn("GM-only", encoded)
        self.assertIn("The party arrives", encoded)

    def test_handout_export_embeds_selected_images_without_original_filenames(self):
        content = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6xXQAAAAASUVORK5CYII="
        )
        Path(self.temp.name, "test.png").write_bytes(content)
        image = Asset.objects.create(
            world=self.world,
            filename="SECRET_GM_filename.png",
            storage_name="test.png",
            mime="image/png",
            digest="image-test",
            size=len(content),
            width=1,
            height=1,
        )
        handout = self.plan(
            "Safe images",
            "handout",
            handout_images=[str(image.id)],
            handout_text="<script>bad()</script>",
        )
        response = self.client.get(
            f"/api/resources/{handout.id}/handout", {"export": "html"}
        )
        text = response.content.decode()
        self.assertEqual(response.status_code, 200)
        self.assertIn("data:image/png;base64,", text)
        self.assertNotIn("SECRET_GM_filename", text)
        self.assertNotIn("<script>", text)

    def test_handout_reader_uses_published_selection_and_intro(self):
        handout = self.plan(
            "Public handout", "handout", handout_text="Published introduction"
        )
        self.publish(handout)
        handout.data["handout_text"] = "Draft-only introduction"
        handout.save(update_fields=["data"])
        value = self.client.get(
            f"/api/resources/{handout.id}/handout", {"audience": "reader"}
        ).json()
        self.assertIn("Published introduction", value["intro"])
        self.assertNotIn("Draft-only", json.dumps(value))

    def test_handout_foreign_images_and_sources_rejected(self):
        world = World.objects.create(owner=self.user, name="Foreign")
        foreign = save_resource(world, {"title": "Foreign", "kind": "article"})
        with self.assertRaises(ValueError):
            self.plan("Bad handout", "handout", handout_sources=[str(foreign.id)])

    def test_planning_archive_remaps_routes_positions_agenda_and_origin_links(self):
        self.adventure = self.update(
            self.adventure,
            scene_ids=[str(self.scene.id)],
            positions={str(self.scene.id): {"x": 100, "y": 200}},
        )
        self.scene = self.update(
            self.scene,
            next_scenes=[
                {
                    "target_id": str(self.encounter.id),
                    "label": "Continue",
                    "condition": "Proceed",
                }
            ],
        )
        imported = import_world_archive(self.user, world_archive(self.world))
        scene = Resource.objects.get(world=imported, title="Arrival")
        session = Resource.objects.get(world=imported, title="Session one")
        note = Resource.objects.get(world=imported, title="Discovered clue")
        adventure = Resource.objects.get(world=imported, title="Shrine adventure")
        self.assertNotEqual(scene.id, self.scene.id)
        self.assertEqual(session.data["agenda"][0]["entry_id"], str(scene.id))
        self.assertEqual(note.data["scene_id"], str(scene.id))
        self.assertIn(str(scene.id), adventure.data["positions"])

    def test_changed_campaign_cannot_reuse_old_scene_references(self):
        with self.assertRaises(ValueError):
            self.update(self.encounter, campaign_id=str(self.other.id))

    def test_removed_scene_reference_can_be_retained_but_not_newly_added(self):
        self.encounter.deleted_at = timezone.now()
        self.encounter.save(update_fields=["deleted_at"])
        self.session = self.update(
            self.session, recap="Unrelated edit preserves recorded agenda"
        )
        with self.assertRaises(ValueError):
            self.next = self.update(self.next, agenda=[self.item(self.encounter)])

    def test_planning_and_handout_limits_rejected(self):
        with self.assertRaises(ValueError):
            self.update(
                self.scene,
                next_scenes=[
                    {"target_id": str(self.encounter.id), "label": "x", "condition": ""}
                ]
                * 41,
            )
        with self.assertRaises(ValueError):
            self.update(self.session, agenda=[self.item(self.scene)] * 201)
        with self.assertRaises(ValueError):
            self.plan(
                "Bad handout", "handout", handout_sources=[str(self.scene.id)] * 31
            )
