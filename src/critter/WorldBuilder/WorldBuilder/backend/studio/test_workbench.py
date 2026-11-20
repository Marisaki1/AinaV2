import copy
import json
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from .models import Connection, World, Resource
from .services import save_resource, snapshot, world_archive, import_world_archive


def doc(text):
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


class CampaignWorkbenchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="workbench-owner")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Workbench QA")
        self.campaign = self.add("Expedition", "campaign", {})
        self.other = self.add("Other expedition", "campaign", {})
        self.session = self.record(
            "Session one", "session", number=1, prep="Secret ambush"
        )
        self.hero = self.add("Forest scout", "character", {})
        self.quest = self.record(
            "Find the keeper",
            "quest",
            progress="active",
            story_arc="Shrine",
            objectives=[{"id": "find", "text": "Meet keeper", "done": False}],
            outcome="Found a trail",
            gm_next_step="GM-only culprit",
        )
        self.note = self.record(
            "Road journal",
            record_type="journal",
            session_id=str(self.session.id),
            thread_id=str(self.quest.id),
        )

    def add(self, title, kind, data, **more):
        return save_resource(
            self.world, {"title": title, "kind": kind, "data": data, **more}
        )

    def record(self, title, kind="note", **data):
        return self.add(title, kind, {"campaign_id": str(self.campaign.id), **data})

    def workspace(self, **query):
        return self.client.get(f"/api/resources/{self.campaign.id}/workbench", query)

    def test_floor_filters_quests_and_session_notes_by_recorded_membership(self):
        floor = self.record(
            "Forest", record_type="campaign-floor", floor_number=9, floor_status="Current",
            floor_entries=[str(self.session.id)],
        )
        other_floor = self.record("Lake", record_type="campaign-floor", floor_number=20, floor_status="Planned")
        draft = self.add(
            "Guild delivery", "quest",
            {
                "campaign_id": str(self.campaign.id),
                "quest_giver": "Guild",
                "quest_reward": "40 gp",
                "player_notice": "Deliver the supplies.",
                "objectives": [{"id": "deliver", "text": "Deliver the supplies", "done": False}],
            },
            parent=str(floor.id), visibility="private", private_notes="The crate is a decoy.",
        )
        route = f"/api/resources/{draft.id}/thread-guide"
        self.assertEqual(self.client.get(route + "?audience=reader").status_code, 404)
        threads = self.workspace(category="threads", floor=str(floor.id)).json()
        self.assertEqual([row["id"] for row in threads["records"]], [str(draft.id)])
        self.assertEqual(threads["lane_counts"]["open"], 1)
        self.assertEqual(threads["records"][0]["data"]["player_notice"], "Deliver the supplies.")
        self.assertEqual(self.workspace(category="threads", floor=str(other_floor.id)).json()["total"], 0)
        self.assertEqual(self.workspace(category="threads", floor="unassigned").json()["total"], 1)
        self.assertEqual(self.workspace(category="threads", floor="all").json()["total"], 2)
        notebook = self.workspace(category="notes", floor=str(floor.id)).json()
        self.assertEqual({row["id"] for row in notebook["records"]}, {str(self.note.id), str(self.session.id)})
        self.publish(draft)
        reader = self.client.get(route + "?audience=reader").json()["thread"]
        self.assertNotIn("player_notice", reader["data"])
        self.assertFalse(reader["private_notes"])

    def test_family_view_respects_floor_assignments_and_explicit_connections(self):
        first = self.add("Forest relative", "character", {})
        second = self.add("Another relative", "character", {})
        distant = self.add("Distant relative", "character", {})
        Connection.objects.create(world=self.world, source=first, target=second, kind="sibling")
        floor = self.record(
            "Forest", record_type="campaign-floor", floor_number=9, floor_status="Current",
            floor_entries=[str(first.id), str(second.id)],
        )
        endpoint = f"/api/worlds/{self.world.id}/family"
        query = {"campaign": str(self.campaign.id), "floor": str(floor.id), "root": str(first.id)}
        result = self.client.get(endpoint, query).json()
        self.assertEqual({row["id"] for row in result["nodes"]}, {str(first.id), str(second.id)})
        response = self.client.post(
            f"/api/worlds/{self.world.id}/connections",
            json.dumps({"source": str(second.id), "target": str(distant.id), "kind": "sibling", "floor_id": str(floor.id)}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        result = self.client.get(endpoint, query).json()
        self.assertEqual({row["id"] for row in result["nodes"]}, {str(first.id), str(second.id), str(distant.id)})
        self.assertEqual(self.client.get(endpoint, {**query, "floor": "invalid"}).status_code, 400)

    def layout(self):
        return {
            "layouts": [
                {
                    "id": "main",
                    "name": "Table notes",
                    "columns": 2,
                    "session_id": str(self.session.id),
                    "panels": [
                        {"kind": "pins", "collapsed": False},
                        {"kind": "capture", "collapsed": True},
                    ],
                    "pins": [
                        {"entry_id": str(self.hero.id), "wide": True},
                        {"entry_id": str(self.note.id), "wide": False},
                    ],
                }
            ],
            "selected_layout": "main",
        }

    def save_layout(self, workspace=None):
        self.campaign = save_resource(
            self.world,
            {
                "data": {
                    **self.campaign.data,
                    "gm_workspace": workspace or self.layout(),
                },
                "expected_revision": self.campaign.revision,
            },
            self.campaign,
        )

    def publish(self, *records):
        for row in records:
            row.visibility = "public"
            row.published = {**snapshot(row), "_revision": row.revision}
            row.save(update_fields=["visibility", "published"])

    def test_campaign_desk_uses_original_records_without_writes(self):
        before = Resource.objects.count()
        value = self.workspace().json()
        self.assertEqual(value["campaign"]["id"], str(self.campaign.id))
        self.assertEqual(
            {v["id"] for v in value["records"]},
            {str(self.session.id), str(self.quest.id), str(self.note.id)},
        )
        self.assertEqual(Resource.objects.count(), before)

    def test_saved_layout_order_width_panels_and_session_survive_reopen(self):
        self.save_layout()
        value = self.workspace().json()
        self.assertEqual(value["campaign"]["data"]["gm_workspace"], self.layout())
        self.assertEqual(
            [p["entry"]["id"] for p in value["pins"]],
            [str(self.hero.id), str(self.note.id)],
        )
        self.assertTrue(value["pins"][0]["wide"])

    def test_pins_follow_latest_source_edits_without_copying_lore(self):
        self.save_layout()
        self.hero = save_resource(
            self.world,
            {
                "title": "Renamed scout",
                "document": doc("Latest original lore"),
                "expected_revision": self.hero.revision,
            },
            self.hero,
        )
        pin = self.workspace().json()["pins"][0]["entry"]
        self.assertEqual(pin["title"], "Renamed scout")
        self.assertIn("Latest original lore", pin["html"])

    def test_deleted_pin_is_placeholder_and_unrelated_layout_edits_preserve_reference(
        self,
    ):
        self.save_layout()
        self.hero.deleted_at = timezone.now()
        self.hero.save(update_fields=["deleted_at"])
        self.assertIsNone(self.workspace().json()["pins"][0]["entry"])
        changed = self.layout()
        changed["layouts"][0]["name"] = "After removal"
        self.save_layout(changed)
        self.assertEqual(
            self.campaign.data["gm_workspace"]["layouts"][0]["pins"][0]["entry_id"],
            str(self.hero.id),
        )

    def test_other_campaign_pin_does_not_show_record_body(self):
        record = self.add(
            "Other secret",
            "note",
            {"campaign_id": str(self.other.id)},
            document=doc("Other campaign body"),
        )
        layout = self.layout()
        layout["layouts"][0]["pins"] = [{"entry_id": str(record.id), "wide": False}]
        self.save_layout(layout)
        self.assertIsNone(self.workspace().json()["pins"][0]["entry"])

    def test_campaign_and_session_scopes_do_not_mix(self):
        self.add(
            "Elsewhere", "note", {"campaign_id": str(self.other.id), "session_id": ""}
        )
        value = self.workspace(session=str(self.session.id)).json()
        self.assertEqual(
            {v["id"] for v in value["records"]},
            {str(self.session.id), str(self.note.id)},
        )

    def test_wrong_campaign_and_removed_session_filters_rejected(self):
        session = self.add(
            "Other session", "session", {"campaign_id": str(self.other.id)}
        )
        self.assertEqual(self.workspace(session=str(session.id)).status_code, 400)
        self.session.deleted_at = timezone.now()
        self.session.save(update_fields=["deleted_at"])
        self.assertEqual(self.workspace(session=str(self.session.id)).status_code, 400)

    def test_search_matches_body_after_summary_prefix_and_tags(self):
        note = self.record("Long note")
        note.document = doc("x" * 500 + " unique-long-body-fact")
        note.tags = ["night-clue"]
        note.save(update_fields=["document", "tags"])
        for query in ("unique-long-body-fact", "night-clue"):
            self.assertEqual(
                [v["id"] for v in self.workspace(q=query).json()["records"]],
                [str(note.id)],
            )

    def test_category_and_record_type_filters(self):
        self.record("Milestone", record_type="milestone")
        self.assertEqual(
            self.workspace(category="notes", type="journal").json()["total"], 1
        )
        self.assertEqual(self.workspace(category="threads").json()["total"], 1)

    def test_story_arc_filter_applies_before_lane_counts(self):
        self.record("Other story", "quest", story_arc="Road", progress="done")
        value = self.workspace(category="threads", arc="Shrine").json()
        self.assertEqual(value["total"], 1)
        self.assertEqual(
            value["lane_counts"], {"open": 0, "active": 1, "done": 0, "failed": 0}
        )

    def test_search_pagination_does_not_hide_old_matching_notes(self):
        Resource.objects.bulk_create(
            [
                Resource(
                    world=self.world,
                    kind="note",
                    title=f"Page note {n}",
                    data={"campaign_id": str(self.campaign.id)},
                )
                for n in range(105)
            ]
        )
        first = self.workspace(category="notes", q="Page note").json()
        second = self.workspace(category="notes", q="Page note", offset="100").json()
        self.assertEqual(first["total"], 105)
        self.assertEqual(len(first["records"]), 100)
        self.assertTrue(first["has_more"])
        self.assertEqual(len(second["records"]), 5)
        self.assertFalse(second["has_more"])
        self.assertFalse(
            {v["id"] for v in first["records"]} & {v["id"] for v in second["records"]}
        )

    def test_invalid_query_values_rejected(self):
        for query in (
            {"category": "secret"},
            {"type": "fake"},
            {"offset": "-1"},
            {"offset": "bad"},
            {"q": "x" * 301},
            {"layout": "missing"},
        ):
            self.assertEqual(self.workspace(**query).status_code, 400)

    def test_duplicate_layout_pin_and_panel_values_rejected(self):
        for field in ("layouts", "pins", "panels"):
            value = self.layout()
            if field == "layouts":
                value[field].append(copy.deepcopy(value[field][0]))
            else:
                value["layouts"][0][field].append(
                    copy.deepcopy(value["layouts"][0][field][0])
                )
            with self.assertRaises(ValueError):
                self.save_layout(value)

    def test_invalid_workspace_shape_columns_and_boolean_values_rejected(self):
        for modify in (
            lambda v: v.update(extra="bad"),
            lambda v: v["layouts"][0].update(columns=True),
            lambda v: v["layouts"][0]["pins"][0].update(wide="yes"),
            lambda v: v["layouts"][0]["panels"][0].update(collapsed=1),
        ):
            value = self.layout()
            modify(value)
            with self.assertRaises(ValueError):
                self.save_layout(value)

    def test_foreign_world_pin_and_cross_campaign_layout_session_rejected(self):
        foreign_world = World.objects.create(owner=self.user, name="Other world")
        foreign = save_resource(
            foreign_world, {"title": "Foreign", "kind": "character"}
        )
        value = self.layout()
        value["layouts"][0]["pins"][0]["entry_id"] = str(foreign.id)
        with self.assertRaises(ValueError):
            self.save_layout(value)
        session = self.add(
            "Other session", "session", {"campaign_id": str(self.other.id)}
        )
        value = self.layout()
        value["layouts"][0]["session_id"] = str(session.id)
        with self.assertRaises(ValueError):
            self.save_layout(value)

    def test_workspace_bounds_are_enforced(self):
        value = self.layout()
        value["layouts"] = [
            {**copy.deepcopy(value["layouts"][0]), "id": str(n)} for n in range(13)
        ]
        with self.assertRaises(ValueError):
            self.save_layout(value)
        value = self.layout()
        value["layouts"][0]["pins"] *= 21
        with self.assertRaises(ValueError):
            self.save_layout(value)

    def test_workspace_reader_endpoint_and_json_do_not_expose_layouts_or_pin_ids(self):
        self.save_layout()
        self.publish(self.campaign)
        self.assertEqual(self.workspace(audience="reader").status_code, 404)
        reader = self.client.get(
            f"/api/resources/{self.campaign.id}", {"audience": "reader"}
        ).json()
        self.assertNotIn("gm_workspace", reader["data"])
        self.assertNotIn(str(self.hero.id), json.dumps(reader))

    def test_workspace_authentication_and_ownership(self):
        self.client.logout()
        self.assertEqual(self.workspace().status_code, 401)
        self.client.force_login(User.objects.create_user(username="outsider"))
        self.assertEqual(self.workspace().status_code, 404)

    def test_stale_layout_save_does_not_replace_newer_settings(self):
        old = self.campaign.revision
        self.save_layout()
        r = self.client.patch(
            f"/api/resources/{self.campaign.id}",
            json.dumps(
                {
                    "data": {"gm_workspace": {"layouts": [], "selected_layout": ""}},
                    "expected_revision": old,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 409)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.data["gm_workspace"], self.layout())

    def test_archives_remap_layout_sessions_pins_and_thread_updates(self):
        self.save_layout()
        imported = import_world_archive(self.user, world_archive(self.world))
        campaign = Resource.objects.get(world=imported, title="Expedition")
        layout = campaign.data["gm_workspace"]["layouts"][0]
        self.assertNotEqual(layout["session_id"], str(self.session.id))
        self.assertNotEqual(layout["pins"][0]["entry_id"], str(self.hero.id))
        note = Resource.objects.get(world=imported, title="Road journal")
        quest = Resource.objects.get(world=imported, title="Find the keeper")
        self.assertEqual(note.data["thread_id"], str(quest.id))

    def test_thread_guide_shows_original_objectives_and_only_related_updates(self):
        self.record("Unrelated note")
        value = self.client.get(f"/api/resources/{self.quest.id}/thread-guide").json()
        self.assertEqual(value["thread"]["data"]["objectives"][0]["id"], "find")
        self.assertEqual([v["id"] for v in value["records"]], [str(self.note.id)])

    def test_thread_reader_published_objectives_outcome_and_private_next_action(self):
        self.publish(self.quest, self.campaign)
        self.quest.data["outcome"] = "Unpublished outcome"
        self.quest.save(update_fields=["data"])
        value = self.client.get(
            f"/api/resources/{self.quest.id}/thread-guide", {"audience": "reader"}
        ).json()
        self.assertEqual(value["thread"]["data"]["outcome"], "Found a trail")
        self.assertNotIn("gm_next_step", value["thread"]["data"])
        self.assertNotIn(str(self.note.id), json.dumps(value))
        self.assertNotIn("GM-only culprit", json.dumps(value))

    def test_private_thread_identity_is_removed_from_reader_note(self):
        self.publish(self.note)
        value = self.client.get(
            f"/api/resources/{self.note.id}", {"audience": "reader"}
        ).json()
        self.assertNotIn("thread_id", value["data"])
        self.assertNotIn(str(self.quest.id), json.dumps(value))

    def test_thread_updates_cannot_be_assigned_to_another_campaign(self):
        other = self.add("Other quest", "quest", {"campaign_id": str(self.other.id)})
        with self.assertRaises(ValueError):
            self.record("Wrong thread", thread_id=str(other.id))

    def test_invalid_objective_ids_states_and_limits_rejected(self):
        for objectives in (
            [{"id": "a", "text": "Do it", "done": "yes"}],
            [{"id": "a", "text": "Do it", "done": False}] * 2,
            [{"id": "a", "text": "", "done": False}],
            [{"id": str(n), "text": "Do it", "done": False} for n in range(101)],
        ):
            with self.assertRaises(ValueError):
                self.record("Invalid quest", "quest", objectives=objectives)

    def test_thread_guide_wrong_kind_removed_and_foreign_targets_unavailable(self):
        self.assertEqual(
            self.client.get(f"/api/resources/{self.hero.id}/thread-guide").status_code,
            404,
        )
        self.quest.deleted_at = timezone.now()
        self.quest.save(update_fields=["deleted_at"])
        self.assertEqual(
            self.client.get(f"/api/resources/{self.quest.id}/thread-guide").status_code,
            404,
        )

    def test_private_thread_and_owner_next_action_not_searchable_as_reader(self):
        self.publish(self.quest)
        response = self.client.get(
            f"/api/worlds/{self.world.id}/resources",
            {"audience": "reader", "q": "GM-only culprit"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["resources"], [])

    def test_outcome_prose_links_sources_and_escapes_html(self):
        self.quest.data.update(
            related_entries=[str(self.hero.id)],
            outcome="Forest scout found <script>bad()</script>",
        )
        self.quest.save(update_fields=["data"])
        value = self.client.get(f"/api/resources/{self.quest.id}/thread-guide").json()
        html = value["thread"]["workbench_sections"]["outcome"]
        self.assertIn(f'data-resource-id="{self.hero.id}"', html)
        self.assertNotIn("<script>", html)

    def test_removing_layout_leaves_original_records_and_history_intact(self):
        self.save_layout()
        count = Resource.objects.count()
        self.save_layout({"layouts": [], "selected_layout": ""})
        self.assertEqual(Resource.objects.count(), count)
        self.assertEqual(self.workspace().json()["pins"], [])
        self.assertTrue(self.campaign.revisions.filter(number=2).exists())

    def test_objective_completion_does_not_implicitly_complete_thread(self):
        self.quest = save_resource(
            self.world,
            {
                "data": {
                    **self.quest.data,
                    "objectives": [{"id": "find", "text": "Meet keeper", "done": True}],
                },
                "expected_revision": self.quest.revision,
            },
            self.quest,
        )
        self.assertEqual(self.quest.data["progress"], "active")

    def test_stale_thread_save_preserves_latest_objectives_and_document(self):
        old = self.quest.revision
        self.quest = save_resource(
            self.world,
            {
                "document": doc("Keep original rich notes"),
                "data": {**self.quest.data, "outcome": "Latest outcome"},
                "expected_revision": old,
            },
            self.quest,
        )
        response = self.client.patch(
            f"/api/resources/{self.quest.id}",
            json.dumps({"data": {"outcome": "Stale"}, "expected_revision": old}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.quest.refresh_from_db()
        self.assertEqual(self.quest.document, doc("Keep original rich notes"))
        self.assertEqual(self.quest.data["outcome"], "Latest outcome")

    def test_existing_note_retains_removed_thread_link_until_changed(self):
        self.quest.deleted_at = timezone.now()
        self.quest.save(update_fields=["deleted_at"])
        self.note = save_resource(
            self.world,
            {"title": "Updated note", "expected_revision": self.note.revision},
            self.note,
        )
        self.assertEqual(self.note.data["thread_id"], str(self.quest.id))

    def test_reader_search_does_not_match_private_layout_names(self):
        layout = self.layout()
        layout["layouts"][0]["name"] = "GM-only hidden-layout-name"
        self.save_layout(layout)
        self.publish(self.campaign)
        response = self.client.get(
            f"/api/worlds/{self.world.id}/resources",
            {"audience": "reader", "q": "hidden-layout-name"},
        )
        self.assertEqual(response.json()["resources"], [])

    def test_layout_without_selected_id_uses_first_layout_references(self):
        layout = self.layout()
        layout["selected_layout"] = ""
        self.save_layout(layout)
        self.assertEqual(
            self.workspace().json()["pins"][0]["entry"]["id"], str(self.hero.id)
        )

    def test_historical_layout_restores_with_removed_source_reference(self):
        self.save_layout()
        saved = snapshot(self.campaign)
        self.hero.deleted_at = timezone.now()
        self.hero.save(update_fields=["deleted_at"])
        self.save_layout({"layouts": [], "selected_layout": ""})
        self.campaign = save_resource(
            self.world,
            {**saved, "expected_revision": self.campaign.revision},
            self.campaign,
            restore=True,
        )
        self.assertEqual(self.campaign.data["gm_workspace"], self.layout())
        self.assertIsNone(self.workspace().json()["pins"][0]["entry"])
