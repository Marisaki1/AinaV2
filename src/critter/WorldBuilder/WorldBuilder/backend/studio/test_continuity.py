import copy
import json
import tempfile
from pathlib import Path

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone

from .connection_history import save as save_connection
from .continuity import REVIEW_SECTIONS, act, projection
from .models import Asset, Connection, Resource, World
from .services import (
    import_world_archive,
    save_resource,
    serialize,
    snapshot,
    world_archive,
)


class ContinuityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("continuity-owner")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Continuity QA")
        self.campaign = self.add("Campaign", "campaign")
        self.other = self.add("Other campaign", "campaign")
        self.hero = self.add("Hero", "character")
        self.npc = self.add("Keeper", "character")
        self.place = self.add("Shrine", template="settlement")
        self.map = self.add("Map", "map")
        self.session = self.add(
            "Session one", "session", campaign_id=str(self.campaign.id), number=1
        )
        self.next = self.add(
            "Session two", "session", campaign_id=str(self.campaign.id), number=2
        )
        self.item = self.add(
            "Rations",
            continuity_type="item",
            campaign_id=str(self.campaign.id),
            holdings=[{"holder_id": "party", "quantity": 10}],
        )
        self.quest = self.add(
            "Find shrine",
            "quest",
            campaign_id=str(self.campaign.id),
            objectives=[{"id": "find", "text": "Find the shrine", "done": False}],
        )
        self.scene = self.add(
            "Enter shrine",
            planning_type="campaign-scene",
            campaign_id=str(self.campaign.id),
        )
        edge = save_connection(
            self.world,
            {
                "source": str(self.hero.id),
                "target": str(self.npc.id),
                "kind": "friend",
                "label": "Trust",
                "strength": 5,
            },
        )
        self.edge = Connection.objects.get(id=edge["id"])
        self.campaign = self.update(self.campaign, party=[str(self.hero.id)])
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=Path(self.temp.name))
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def add(self, title, kind="article", template="generic", **data):
        return save_resource(
            self.world,
            {"title": title, "kind": kind, "template": template, "data": data},
        )

    def update(self, row, **data):
        row.refresh_from_db()
        return save_resource(
            self.world,
            {"data": {**row.data, **data}, "expected_revision": row.revision},
            row,
        )

    def action(self, action, **data):
        return act(self.campaign, {"action": action, **data})

    def transfer(self, **more):
        return self.action(
            "transfer",
            item_id=str(self.item.id),
            expected_revision=more.pop("expected_revision", self.item.revision),
            quantity=more.pop("quantity", 3),
            from_holder=more.pop("from_holder", "party"),
            to_holder=more.pop("to_holder", str(self.hero.id)),
            session_id=more.pop("session_id", str(self.session.id)),
            **more,
        )

    def record(self, kind, **more):
        return self.action(
            "record",
            type=kind,
            title=more.pop("title", kind),
            text=more.pop("text", "Original notes"),
            data={"session_id": str(self.session.id), **more.pop("data", {})},
            **more,
        )

    def wrap(self, **more):
        return self.action(
            "wrap-up",
            session_id=str(self.session.id),
            expected_revision=more.pop("expected_revision", self.session.revision),
            reviewed=more.pop("reviewed", dict.fromkeys(REVIEW_SECTIONS, True)),
            text="Wrap-up notes",
            **more,
        )

    def profile(self, row, role="pc", **more):
        return {
            "entry_id": str(row.id),
            "role": role,
            "location_id": "",
            "goals": "",
            "conditions": "",
            "notes": "",
            **more,
        }

    def publish(self, row):
        row.refresh_from_db()
        row.visibility = "public"
        row.published = {**snapshot(row), "_revision": row.revision}
        row.save(update_fields=["visibility", "published"])

    def test_projection_reads_database_without_writing(self):
        before = list(Resource.objects.values_list("id", "revision"))
        value = projection(self.campaign, str(self.session.id))
        self.assertEqual(value["items"][0]["id"], str(self.item.id))
        self.assertEqual(value["cast"][0]["id"], str(self.hero.id))
        self.assertEqual(before, list(Resource.objects.values_list("id", "revision")))

    def test_party_roles_location_goals_and_conditions_are_versioned(self):
        revision = self.campaign.revision
        self.action(
            "party",
            expected_revision=revision,
            profiles=[
                self.profile(self.hero),
                self.profile(
                    self.npc,
                    "companion",
                    location_id=str(self.place.id),
                    goals="Learn",
                    conditions="Tired",
                ),
            ],
            location_id=str(self.place.id),
            goals="Explore",
            conditions="Resting",
        )
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.revision, revision + 1)
        self.assertEqual(
            set(self.campaign.data["party"]), {str(self.hero.id), str(self.npc.id)}
        )
        self.assertEqual(self.campaign.data["party_goals"], "Explore")
        self.assertEqual(self.campaign.data["party_profiles"][1]["conditions"], "Tired")
        self.assertTrue(self.campaign.revisions.filter(number=revision + 1).exists())

    def test_promoting_npc_to_pc_keeps_same_lore_and_character_identity(self):
        count = Resource.objects.count()
        original = copy.deepcopy(self.npc.document)
        self.action(
            "party",
            expected_revision=self.campaign.revision,
            profiles=[self.profile(self.npc, "npc")],
        )
        self.campaign.refresh_from_db()
        self.action(
            "party",
            expected_revision=self.campaign.revision,
            profiles=[self.profile(self.npc, "pc")],
        )
        self.campaign.refresh_from_db()
        self.npc.refresh_from_db()
        self.assertEqual(Resource.objects.count(), count)
        self.assertEqual(self.npc.document, original)
        self.assertIn(str(self.npc.id), self.campaign.data["party"])
        self.assertEqual(
            self.campaign.data["party_profiles"][0]["entry_id"], str(self.npc.id)
        )

    def test_inactive_and_npc_roles_remove_only_explicit_active_party_members(self):
        self.action(
            "party",
            expected_revision=self.campaign.revision,
            profiles=[
                self.profile(self.hero, "inactive"),
                self.profile(self.npc, "npc"),
            ],
        )
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.data["party"], [])
        self.assertEqual(len(projection(self.campaign)["cast"]), 2)

    def test_implicit_legacy_pc_survives_new_npc_profile(self):
        self.action(
            "party",
            expected_revision=self.campaign.revision,
            profiles=[self.profile(self.npc, "npc")],
        )
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.data["party"], [str(self.hero.id)])

    def test_invalid_party_profiles_reject_without_partial_updates(self):
        for profiles in (
            [self.profile(self.hero, "unknown")],
            [self.profile(self.hero), self.profile(self.hero)],
            ["bad"],
            None,
        ):
            with (
                self.subTest(profiles=profiles),
                self.assertRaises((ValueError, TypeError)),
            ):
                self.action(
                    "party", expected_revision=self.campaign.revision, profiles=profiles
                )
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.data["party"], [str(self.hero.id)])

    def test_foreign_world_profile_and_invalid_place_reject(self):
        other_world = World.objects.create(owner=self.user, name="Other")
        foreign = save_resource(other_world, {"kind": "character", "title": "Foreign"})
        for profile in (
            self.profile(foreign),
            self.profile(self.hero, location_id=str(self.quest.id)),
        ):
            with self.assertRaises(ValueError):
                self.action(
                    "party",
                    expected_revision=self.campaign.revision,
                    profiles=[profile],
                )

    def test_transfer_commits_quantity_and_movement_together(self):
        result = self.transfer()
        self.item.refresh_from_db()
        self.assertEqual(
            {h["holder_id"]: h["quantity"] for h in self.item.data["holdings"]},
            {"party": 7, str(self.hero.id): 3},
        )
        movement = Resource.objects.get(id=result["movement_id"])
        self.assertEqual(movement.data["continuity_type"], "transfer")
        self.assertEqual(movement.data["item_id"], str(self.item.id))
        self.assertEqual(movement.data["session_id"], str(self.session.id))
        self.assertEqual(movement.visibility, "private")
        self.assertEqual(sum(h["quantity"] for h in self.item.data["holdings"]), 10)

    def test_transfer_supports_location_storage_and_exact_balance(self):
        self.transfer(quantity=10, to_holder=str(self.place.id))
        self.item.refresh_from_db()
        self.assertEqual(self.item.data["holdings"][0]["quantity"], 0)
        self.assertEqual(self.item.data["holdings"][1]["holder_id"], str(self.place.id))

    def test_transfer_underflow_and_invalid_quantities_write_nothing(self):
        count = Resource.objects.count()
        for quantity in (11, 0, -1, True, 1.5, "2"):
            with self.subTest(quantity=quantity), self.assertRaises(ValueError):
                self.transfer(quantity=quantity)
        self.item.refresh_from_db()
        self.assertEqual(
            self.item.data["holdings"], [{"holder_id": "party", "quantity": 10}]
        )
        self.assertEqual(Resource.objects.count(), count)

    def test_transfer_same_or_missing_holder_rejects(self):
        for target in ("party", ""):
            with self.assertRaises(ValueError):
                self.transfer(to_holder=target)

    def test_stale_transfer_and_replay_cannot_double_move(self):
        result = self.transfer()
        with self.assertRaisesMessage(ValueError, "original changed"):
            self.transfer()
        self.assertEqual(
            Resource.objects.filter(data__continuity_type="transfer").count(), 1
        )
        self.assertTrue(Resource.objects.filter(id=result["movement_id"]).exists())

    def test_invalid_recipient_rolls_back_stock_and_history(self):
        before = self.item.revision
        with self.assertRaises(ValueError):
            self.transfer(to_holder=str(self.quest.id))
        self.item.refresh_from_db()
        self.assertEqual(self.item.revision, before)
        self.assertFalse(
            Resource.objects.filter(data__continuity_type="transfer").exists()
        )

    def test_invalid_movement_notes_roll_back_updated_stock(self):
        with self.assertRaises(ValueError):
            self.transfer(notes="x" * 50001)
        self.item.refresh_from_db()
        self.assertEqual(self.item.data["holdings"][0]["quantity"], 10)
        self.assertEqual(self.item.revision, 1)

    def test_removed_recipient_cannot_receive_more_stock(self):
        self.transfer()
        self.item.refresh_from_db()
        Resource.objects.filter(id=self.hero.id).update(deleted_at=timezone.now())
        with self.assertRaises(ValueError):
            self.transfer(quantity=1)

    def test_stock_can_move_out_of_removed_recorded_holder(self):
        self.transfer()
        self.item.refresh_from_db()
        Resource.objects.filter(id=self.hero.id).update(deleted_at=timezone.now())
        self.transfer(from_holder=str(self.hero.id), to_holder="party")
        self.item.refresh_from_db()
        self.assertEqual(self.item.data["holdings"][0]["quantity"], 10)

    def test_generic_patch_cannot_silently_rewrite_stock(self):
        with self.assertRaisesMessage(ValueError, "history"):
            self.update(self.item, holdings=[{"holder_id": "party", "quantity": 900}])

    def test_restoring_item_notes_does_not_reverse_later_stock_movements(self):
        old = snapshot(self.item)
        self.transfer()
        self.item.refresh_from_db()
        holdings = copy.deepcopy(self.item.data["holdings"])
        restored = save_resource(
            self.world,
            {
                "title": old["title"],
                "document": old["document"],
                "data": old["data"],
                "expected_revision": self.item.revision,
            },
            self.item,
            restore=True,
        )
        self.assertEqual(restored.data["holdings"], holdings)
        self.assertEqual(
            Resource.objects.filter(data__continuity_type="transfer").count(), 1
        )

    def test_metadata_edit_preserves_quantity_and_original_identity(self):
        result = save_resource(
            self.world,
            {"title": "Renamed rations", "expected_revision": self.item.revision},
            self.item,
        )
        self.assertEqual(result.id, self.item.id)
        self.assertEqual(result.data["holdings"][0]["quantity"], 10)

    def test_new_loot_has_private_item_history_and_recipient(self):
        result = self.action(
            "award",
            campaign_revision=self.campaign.revision,
            title="Silver arrows",
            quantity=4,
            to_holder=str(self.hero.id),
            session_id=str(self.session.id),
        )
        item = Resource.objects.get(id=result["entry_id"])
        self.assertEqual(
            item.data["holdings"], [{"holder_id": str(self.hero.id), "quantity": 4}]
        )
        self.assertEqual(item.visibility, "private")
        self.assertEqual(
            Resource.objects.get(id=result["movement_id"]).data["continuity_type"],
            "loot",
        )

    def test_replayed_new_loot_rejects_without_duplicate_items(self):
        payload = {
            "campaign_revision": self.campaign.revision,
            "title": "Silver arrows",
            "quantity": 4,
        }
        self.action("award", **payload)
        with self.assertRaises(ValueError):
            self.action("award", **payload)
        self.assertEqual(Resource.objects.filter(title="Silver arrows").count(), 1)

    def test_existing_loot_requires_current_item_revision(self):
        payload = {
            "item_id": str(self.item.id),
            "expected_revision": self.item.revision,
            "quantity": 2,
        }
        self.action("award", **payload)
        with self.assertRaises(ValueError):
            self.action("award", **payload)
        self.item.refresh_from_db()
        self.assertEqual(self.item.data["holdings"][0]["quantity"], 12)

    def test_invalid_new_loot_rolls_back_new_item_and_campaign_revision(self):
        count = Resource.objects.count()
        before = self.campaign.revision
        with self.assertRaises(ValueError):
            self.action(
                "award",
                campaign_revision=before,
                title="Invalid new item",
                quantity=1,
                to_holder=str(self.quest.id),
            )
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.revision, before)
        self.assertEqual(Resource.objects.count(), count)

    def test_adjustment_add_remove_and_underflow(self):
        self.action(
            "adjust",
            item_id=str(self.item.id),
            expected_revision=self.item.revision,
            quantity=2,
            direction="remove",
        )
        self.item.refresh_from_db()
        self.assertEqual(self.item.data["holdings"][0]["quantity"], 8)
        self.action(
            "adjust",
            item_id=str(self.item.id),
            expected_revision=self.item.revision,
            quantity=3,
            direction="add",
        )
        self.item.refresh_from_db()
        self.assertEqual(self.item.data["holdings"][0]["quantity"], 11)
        self.assertEqual(
            Resource.objects.filter(data__continuity_type="adjustment").count(), 2
        )

    def test_inventory_legacy_conversion_preserves_values_and_old_revision(self):
        self.campaign = self.update(
            self.campaign,
            inventory=[{"name": "Rope", "quantity": 2, "notes": "Old rope"}],
        )
        old = self.campaign.revision
        result = self.action("migrate-inventory", expected_revision=old)
        item = Resource.objects.get(id=result["converted_ids"][0])
        self.assertEqual(item.data["legacy_item"]["notes"], "Old rope")
        self.assertEqual(item.data["holdings"][0]["quantity"], 2)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.data["inventory"], [])
        self.assertEqual(
            self.campaign.revisions.get(number=old).snapshot["data"]["inventory"][0][
                "name"
            ],
            "Rope",
        )
        with self.assertRaises(ValueError):
            self.action("migrate-inventory", expected_revision=old)

    def test_foreign_campaign_item_and_session_reject(self):
        other = self.add(
            "Other item",
            continuity_type="item",
            campaign_id=str(self.other.id),
            holdings=[],
        )
        with self.assertRaises(ValueError):
            self.action(
                "transfer",
                item_id=str(other.id),
                expected_revision=1,
                quantity=1,
                to_holder=str(self.hero.id),
            )
        foreign_session = self.add(
            "Other session", "session", campaign_id=str(self.other.id)
        )
        with self.assertRaises(ValueError):
            self.transfer(session_id=str(foreign_session.id))

    def test_relationship_event_and_edge_change_are_atomic(self):
        result = self.record(
            "relationship-event",
            data={"connection_id": str(self.edge.id)},
            relationship_change={
                "expected_revision": self.edge.revision,
                "label": "Allies",
                "strength": 30,
            },
        )
        self.edge.refresh_from_db()
        note = Resource.objects.get(id=result["entry_id"])
        self.assertEqual(self.edge.strength, 30)
        self.assertEqual(
            set(note.data["related_entries"]), {str(self.hero.id), str(self.npc.id)}
        )
        self.assertEqual(self.edge.revisions.count(), 2)

    def test_stale_relationship_change_creates_no_note(self):
        with self.assertRaises(ValueError):
            self.record(
                "relationship-event",
                data={"connection_id": str(self.edge.id)},
                relationship_change={"expected_revision": 0, "strength": 30},
            )
        self.assertFalse(
            Resource.objects.filter(data__continuity_type="relationship-event").exists()
        )

    def test_invalid_relationship_note_rolls_back_edge_revision(self):
        with self.assertRaises(ValueError):
            self.record(
                "relationship-event",
                title="",
                data={"connection_id": str(self.edge.id)},
                relationship_change={"expected_revision": 1, "strength": 30},
            )
        self.edge.refresh_from_db()
        self.assertEqual(self.edge.revision, 1)
        self.assertEqual(self.edge.revisions.count(), 1)

    def test_progression_is_milestone_with_original_character_and_session(self):
        result = self.record(
            "progression",
            data={
                "progression_type": "ability",
                "related_entries": [str(self.hero.id)],
            },
        )
        note = Resource.objects.get(id=result["entry_id"])
        self.assertEqual(note.data["record_type"], "milestone")
        self.assertEqual(note.data["session_id"], str(self.session.id))
        self.assertEqual(note.data["related_entries"], [str(self.hero.id)])

    def test_consequence_collects_affected_originals_and_followup(self):
        result = self.record(
            "consequence",
            data={
                "affected_entries": [str(self.hero.id), str(self.place.id)],
                "impact_status": "open",
                "follow_up_state": "open",
            },
        )
        note = Resource.objects.get(id=result["entry_id"])
        self.assertEqual(
            set(note.data["related_entries"]), {str(self.hero.id), str(self.place.id)}
        )
        self.assertIn(
            str(note.id), [n["id"] for n in projection(self.campaign)["followups"]]
        )

    def test_journey_coordinates_and_location_provenance(self):
        points = [
            {"x": 0.1, "y": 0.2, "label": "Shrine", "location_id": str(self.place.id)},
            {"x": 0.9, "y": 0.8, "label": "Camp", "location_id": ""},
        ]
        result = self.record(
            "journey", data={"map_id": str(self.map.id), "route_points": points}
        )
        note = Resource.objects.get(id=result["entry_id"])
        self.assertEqual(note.data["route_points"], points)
        self.assertIn(str(self.place.id), note.data["related_entries"])

    def test_journey_rejects_out_of_bounds_nonfinite_and_wrong_map(self):
        for x in (-0.1, 1.1, float("inf"), True):
            with self.subTest(x=x), self.assertRaises(ValueError):
                self.record(
                    "journey",
                    data={
                        "map_id": str(self.map.id),
                        "route_points": [
                            {"x": x, "y": 0.2, "label": "Invalid", "location_id": ""}
                        ],
                    },
                )
        with self.assertRaises(ValueError):
            self.record(
                "journey", data={"map_id": str(self.hero.id), "route_points": []}
            )

    def test_place_status_control_retains_original_location_and_controller(self):
        result = self.record(
            "place-status",
            data={
                "location_id": str(self.place.id),
                "status_type": "control",
                "controlled_by_id": str(self.npc.id),
                "impact_status": "open",
            },
        )
        note = Resource.objects.get(id=result["entry_id"])
        self.assertIn(str(self.place.id), note.data["related_entries"])
        self.assertEqual(note.data["controlled_by_id"], str(self.npc.id))

    def test_record_metadata_update_preserves_rich_document(self):
        result = self.record("consequence", data={"impact_status": "open"})
        note = Resource.objects.get(id=result["entry_id"])
        before = copy.deepcopy(note.document)
        self.action(
            "record",
            type="consequence",
            entry_id=str(note.id),
            expected_revision=note.revision,
            title="Updated",
            data={"impact_status": "resolved"},
        )
        note.refresh_from_db()
        self.assertEqual(note.document, before)
        self.assertEqual(note.data["impact_status"], "resolved")

    def test_objective_and_scene_dependencies_validate_sources(self):
        self.quest = self.update(
            self.quest,
            continuity_dependencies=[
                {
                    "target_id": str(self.scene.id),
                    "source_objective": "find",
                    "target_objective": "",
                    "notes": "After discovery",
                }
            ],
        )
        self.assertEqual(
            self.quest.data["continuity_dependencies"][0]["source_objective"], "find"
        )
        for target, objective in (
            (str(self.item.id), "find"),
            (str(self.scene.id), "missing"),
        ):
            with self.assertRaises(ValueError):
                self.update(
                    self.quest,
                    continuity_dependencies=[
                        {
                            "target_id": target,
                            "source_objective": objective,
                            "target_objective": "",
                            "notes": "",
                        }
                    ],
                )

    def test_duplicate_dependency_and_foreign_campaign_reject(self):
        dep = {
            "target_id": str(self.scene.id),
            "source_objective": "",
            "target_objective": "",
            "notes": "",
        }
        with self.assertRaises(ValueError):
            self.update(self.quest, continuity_dependencies=[dep, dep])
        other = self.add("Other quest", "quest", campaign_id=str(self.other.id))
        with self.assertRaises(ValueError):
            self.update(
                self.quest,
                continuity_dependencies=[{**dep, "target_id": str(other.id)}],
            )

    def test_moving_quest_cannot_keep_old_campaign_dependencies(self):
        self.quest = self.update(
            self.quest,
            continuity_dependencies=[
                {
                    "target_id": str(self.scene.id),
                    "source_objective": "",
                    "target_objective": "",
                    "notes": "",
                }
            ],
        )
        with self.assertRaises(ValueError):
            self.update(self.quest, campaign_id=str(self.other.id))

    def test_quest_diagram_positions_are_campaign_scoped_and_finite(self):
        self.campaign = self.update(
            self.campaign,
            continuity_graph={"positions": {str(self.quest.id): {"x": 10, "y": 20}}},
        )
        self.assertIn(
            str(self.quest.id), self.campaign.data["continuity_graph"]["positions"]
        )
        other = self.add("Other quest", "quest", campaign_id=str(self.other.id))
        for positions in (
            {str(other.id): {"x": 1, "y": 2}},
            {str(self.quest.id): {"x": float("inf"), "y": 2}},
        ):
            with self.assertRaises(ValueError):
                self.update(self.campaign, continuity_graph={"positions": positions})

    def test_session_media_order_and_duplicate_rejection(self):
        items = [
            {
                "entry_id": str(self.hero.id),
                "asset_id": "",
                "caption": "Portrait",
                "category": "portrait",
            },
            {
                "entry_id": str(self.map.id),
                "asset_id": "",
                "caption": "Map",
                "category": "map",
            },
        ]
        result = self.record("media-collection", data={"collection_items": items})
        collection = Resource.objects.get(id=result["entry_id"])
        self.assertEqual(collection.data["collection_items"], items)
        with self.assertRaises(ValueError):
            self.update(collection, collection_items=[items[0], items[0]])

    def test_media_rejects_both_asset_and_original_or_foreign_asset(self):
        foreign = World.objects.create(owner=self.user, name="Assets")
        asset = Asset.objects.create(
            world=foreign,
            filename="x.png",
            storage_name="x.png",
            mime="image/png",
            digest="0" * 64,
            size=1,
        )
        for entry_id in (str(self.hero.id), ""):
            with self.assertRaises(ValueError):
                self.record(
                    "media-collection",
                    data={
                        "collection_items": [
                            {
                                "entry_id": entry_id,
                                "asset_id": str(asset.id),
                                "caption": "",
                                "category": "illustration",
                            }
                        ]
                    },
                )

    def test_wrapup_saves_source_revision_snapshot_and_private_note(self):
        self.transfer()
        result = self.wrap()
        note = Resource.objects.get(id=result["entry_id"])
        self.session.refresh_from_db()
        self.assertEqual(self.session.data["wrap_up_note_id"], str(note.id))
        self.assertTrue(note.data["review_sources"])
        self.assertEqual(note.visibility, "private")
        self.assertIsNone(note.published)

    def test_wrapup_completion_requires_all_five_sections(self):
        with self.assertRaises(ValueError):
            self.wrap(complete=True, reviewed=dict.fromkeys(REVIEW_SECTIONS, False))
        self.assertFalse(
            Resource.objects.filter(data__continuity_type="wrap-up").exists()
        )

    def test_wrapup_completion_finishes_active_agenda_without_other_state_changes(self):
        self.session = self.update(
            self.session,
            agenda=[
                {"entry_id": str(self.scene.id), "state": "active", "notes": ""},
                {"entry_id": str(self.quest.id), "state": "planned", "notes": ""},
            ],
            active_scene_id=str(self.scene.id),
        )
        self.wrap(complete=True)
        self.session.refresh_from_db()
        self.assertEqual(self.session.data["session_status"], "completed")
        self.assertEqual(self.session.data["active_scene_id"], "")
        self.assertEqual(
            [a["state"] for a in self.session.data["agenda"]], ["completed", "planned"]
        )

    def test_stale_wrapup_replay_does_not_duplicate_note(self):
        self.wrap()
        with self.assertRaises(ValueError):
            self.wrap()
        self.assertEqual(
            Resource.objects.filter(data__continuity_type="wrap-up").count(), 1
        )

    def test_stale_wrapup_note_leaves_session_unchanged(self):
        result = self.wrap()
        self.session.refresh_from_db()
        note = Resource.objects.get(id=result["entry_id"])
        note = self.update(note, follow_up_state="open")
        before = self.session.revision
        with self.assertRaises(ValueError):
            self.wrap(note_revision=note.revision - 1)
        self.session.refresh_from_db()
        self.assertEqual(self.session.revision, before)

    def test_projection_session_filter_excludes_future_but_inventory_is_current(self):
        one = self.record("progression")
        two = self.record("progression", data={"session_id": str(self.next.id)})
        value = projection(self.campaign, str(self.session.id))
        self.assertIn(one["entry_id"], [r["id"] for r in value["records"]])
        self.assertNotIn(two["entry_id"], [r["id"] for r in value["records"]])
        self.assertEqual(len(value["items"]), 1)

    def test_reader_projection_strips_running_and_ownership_metadata(self):
        self.campaign = self.update(
            self.campaign,
            party_profiles=[self.profile(self.hero, notes="GM secret")],
            party_goals="Private goals",
        )
        for row in (self.campaign, self.item):
            self.publish(row)
        encoded = json.dumps(
            [serialize(self.campaign, reader=True), serialize(self.item, reader=True)]
        )
        for secret in (
            "GM secret",
            "Private goals",
            "party_profiles",
            "holdings",
            "holder_id",
        ):
            self.assertNotIn(secret, encoded)

    def test_reader_media_data_has_no_selected_private_identity(self):
        secret = self.add("Private image source")
        result = self.record(
            "media-collection",
            data={
                "collection_items": [
                    {
                        "entry_id": str(secret.id),
                        "asset_id": "",
                        "category": "portrait",
                        "caption": "Secret caption",
                    }
                ]
            },
        )
        row = Resource.objects.get(id=result["entry_id"])
        self.publish(row)
        encoded = json.dumps(serialize(row, reader=True))
        self.assertNotIn(str(secret.id), encoded)
        self.assertNotIn("Secret caption", encoded)

    def test_owner_only_api_and_foreign_session(self):
        url = f"/api/resources/{self.campaign.id}/continuity"
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.get(url, {"audience": "reader"}).status_code, 404)
        self.assertEqual(
            self.client.get(f"/api/resources/{self.item.id}/continuity").status_code,
            404,
        )
        self.assertEqual(
            self.client.get(url, {"session": str(self.quest.id)}).status_code, 400
        )
        self.client.logout()
        self.assertEqual(self.client.get(url).status_code, 401)

    def test_other_owner_gets_no_campaign_data(self):
        other = User.objects.create_user("other-continuity-owner")
        self.client.force_login(other)
        self.assertEqual(
            self.client.get(
                f"/api/resources/{self.campaign.id}/continuity"
            ).status_code,
            404,
        )

    def test_api_stale_transfer_returns_409_without_browser_storage(self):
        url = f"/api/resources/{self.campaign.id}/continuity"
        payload = {
            "action": "transfer",
            "item_id": str(self.item.id),
            "expected_revision": 1,
            "quantity": 1,
            "from_holder": "party",
            "to_holder": str(self.hero.id),
        }
        self.assertEqual(
            self.client.post(
                url, json.dumps(payload), content_type="application/json"
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                url, json.dumps(payload), content_type="application/json"
            ).status_code,
            409,
        )
        self.item.refresh_from_db()
        self.assertEqual(self.item.data["holdings"][0]["quantity"], 9)

    def test_inventory_identity_cannot_be_erased_or_moved_to_another_campaign(self):
        for changes in ({"continuity_type": ""}, {"campaign_id": str(self.other.id)}):
            with self.assertRaises(ValueError):
                self.update(self.item, **changes)

    def test_inventory_movement_facts_cannot_be_forged(self):
        result = self.transfer()
        movement = Resource.objects.get(id=result["movement_id"])
        with self.assertRaises(ValueError):
            self.update(movement, quantity=999)
        with self.assertRaises(ValueError):
            self.update(movement, continuity_type="")

    def test_journey_and_location_change_require_their_sources(self):
        for kind in ("journey", "place-status"):
            with self.assertRaises(ValueError):
                self.record(kind)

    def test_objective_positions_use_real_original_and_objective_ids(self):
        key = f"{self.quest.id}/objective/find"
        self.campaign = self.update(
            self.campaign,
            continuity_graph={"positions": {key: {"x": 30.25, "y": 40.5}}},
        )
        self.assertIn(key, self.campaign.data["continuity_graph"]["positions"])
        with self.assertRaises(ValueError):
            self.update(
                self.campaign,
                continuity_graph={
                    "positions": {
                        f"{self.quest.id}/objective/missing": {"x": 1, "y": 2}
                    }
                },
            )

    def test_self_dependency_rejected(self):
        with self.assertRaises(ValueError):
            self.update(
                self.quest,
                continuity_dependencies=[
                    {
                        "target_id": str(self.quest.id),
                        "source_objective": "find",
                        "target_objective": "",
                        "notes": "",
                    }
                ],
            )

    def test_normal_article_quantity_field_is_not_removed_by_reader_filter(self):
        row = self.add("Ordinary article", quantity=23)
        self.publish(row)
        self.assertEqual(serialize(row, reader=True)["data"]["quantity"], 23)

    def test_loot_stock_limit_rolls_back_item_and_movement(self):
        with self.assertRaises(ValueError):
            self.action(
                "award",
                item_id=str(self.item.id),
                expected_revision=self.item.revision,
                quantity=1000000,
            )
        self.item.refresh_from_db()
        self.assertEqual(self.item.data["holdings"][0]["quantity"], 10)
        self.assertFalse(Resource.objects.filter(data__continuity_type="loot").exists())

    def test_bad_action_rejected(self):
        with self.assertRaises(ValueError):
            self.action("unknown")

    def test_archive_remaps_holders_dependencies_routes_and_relationship_events(self):
        self.transfer()
        self.record("relationship-event", data={"connection_id": str(self.edge.id)})
        self.record(
            "journey",
            data={
                "map_id": str(self.map.id),
                "route_points": [
                    {
                        "x": 0.2,
                        "y": 0.3,
                        "label": "Shrine",
                        "location_id": str(self.place.id),
                    }
                ],
            },
        )
        self.quest = self.update(
            self.quest,
            continuity_dependencies=[
                {
                    "target_id": str(self.scene.id),
                    "source_objective": "find",
                    "target_objective": "",
                    "notes": "Route",
                }
            ],
        )
        self.campaign = self.update(
            self.campaign,
            party_profiles=[self.profile(self.hero)],
            continuity_graph={
                "positions": {
                    str(self.quest.id): {"x": 10, "y": 20},
                    f"{self.quest.id}/objective/find": {"x": 30, "y": 40},
                }
            },
        )
        self.wrap()
        archive = world_archive(self.world)
        copied = import_world_archive(self.user, archive)
        item = copied.resources.get(title="Rations")
        hero = copied.resources.get(title="Hero")
        self.assertEqual(item.data["holdings"][1]["holder_id"], str(hero.id))
        note = copied.resources.get(data__continuity_type="relationship-event")
        edge = copied.connections.get()
        self.assertNotEqual(edge.id, self.edge.id)
        self.assertEqual(note.data["connection_id"], str(edge.id))
        quest = copied.resources.get(title="Find shrine")
        scene = copied.resources.get(title="Enter shrine")
        self.assertEqual(
            quest.data["continuity_dependencies"][0]["target_id"], str(scene.id)
        )
        campaign = copied.resources.get(title="Campaign")
        self.assertIn(str(quest.id), campaign.data["continuity_graph"]["positions"])
        self.assertIn(
            f"{quest.id}/objective/find", campaign.data["continuity_graph"]["positions"]
        )
        journey = copied.resources.get(data__continuity_type="journey")
        self.assertEqual(
            journey.data["route_points"][0]["location_id"],
            str(copied.resources.get(title="Shrine").id),
        )
        session = copied.resources.get(title="Session one")
        self.assertTrue(
            copied.resources.filter(id=session.data["wrap_up_note_id"]).exists()
        )
