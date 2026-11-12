import json
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from .models import World, Resource
from .services import save_resource, world_archive, import_world_archive, serialize
from .graphs import create_connection
from .relationship_views import relationship_view


class AffinityWebTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="affinity-owner", password="affinity-tests-only"
        )
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Affinity")
        self.a = self.add("Hero", "character", {}, summary="Original hero summary")
        self.b = self.add("Village NPC", "article", {}, template="character")
        self.c = self.add("Unrelated character", "character", {})
        self.campaign = self.add(
            "Adventure",
            "campaign",
            {"party": [str(self.a.id)], "related_entries": [str(self.b.id)]},
        )
        self.edge = create_connection(
            self.world,
            {
                "source": str(self.a.id),
                "target": str(self.b.id),
                "kind": "friend",
                "label": "Trusted ally",
                "strength": 75,
                "notes": "Private trust note",
                "visibility": "public",
            },
        )
        self.board = self.add(
            "Campaign affinity web",
            "relationship",
            {
                "mode": "all",
                "layout": "affinity",
                "campaign_id": str(self.campaign.id),
                "include_isolated": True,
                "positions": {
                    str(self.a.id): {"x": 140, "y": 200},
                    str(self.b.id): {"x": 600, "y": 200},
                },
            },
        )

    def add(self, title, kind, data, **fields):
        return save_resource(
            self.world, {"title": title, "kind": kind, "data": data, **fields}
        )

    def update(self, r, **fields):
        return save_resource(self.world, {"expected_revision": r.revision, **fields}, r)

    def publish(self, r):
        r.visibility = "public"
        r.published = {**serialize(r), "_revision": r.revision}
        r.save(update_fields=["visibility", "published"])

    def request(self, data, record=None):
        return self.client.patch(
            f"/api/resources/{(record or self.board).id}",
            json.dumps(
                {"data": data, "expected_revision": (record or self.board).revision}
            ),
            content_type="application/json",
        )

    def test_campaign_web_includes_only_its_cast_and_relationships(self):
        graph = relationship_view(self.board)
        self.assertEqual(
            {n["id"] for n in graph["nodes"]}, {str(self.a.id), str(self.b.id)}
        )
        self.assertEqual([e["id"] for e in graph["edges"]], [self.edge["id"]])
        self.assertEqual(graph["layout"], "affinity")
        self.assertEqual(graph["positions"], self.board.data["positions"])
        self.assertNotIn("Private trust note", json.dumps(graph))

    def test_related_session_and_journal_lore_extend_campaign_cast_without_copying(
        self,
    ):
        place = self.add("Shrine", "article", {})
        self.add(
            "Session",
            "session",
            {"campaign_id": str(self.campaign.id), "related_entries": [str(place.id)]},
        )
        graph = relationship_view(self.board)
        self.assertIn(str(place.id), {n["id"] for n in graph["nodes"]})
        self.assertEqual(
            Resource.objects.filter(world=self.world, title="Shrine").count(), 1
        )

    def test_reader_hides_private_cast_edges_positions_and_notes(self):
        self.publish(self.campaign)
        self.publish(self.a)
        self.publish(self.board)
        graph = relationship_view(self.board, True)
        self.assertEqual([n["id"] for n in graph["nodes"]], [str(self.a.id)])
        self.assertEqual(graph["edges"], [])
        self.assertEqual(set(graph["positions"]), {str(self.a.id)})
        raw = json.dumps(serialize(self.campaign, reader=True))
        self.assertNotIn(str(self.b.id), raw)

    def test_private_campaign_reader_does_not_expand_to_world(self):
        for r in (self.a, self.b, self.c, self.board):
            self.publish(r)
        graph = relationship_view(self.board, True)
        self.assertEqual(graph["nodes"], [])
        self.assertEqual(graph["positions"], {})
        self.assertNotIn(
            str(self.campaign.id), json.dumps(serialize(self.board, reader=True))
        )

    def test_reader_portrait_and_summary_use_published_definition(self):
        for r in (self.a, self.b, self.campaign, self.board):
            self.publish(r)
        self.a = self.update(self.a, summary="Hidden draft summary")
        reader = relationship_view(self.board, True)
        node = next(n for n in reader["nodes"] if n["id"] == str(self.a.id))
        self.assertEqual(node["summary"], "Original hero summary")
        self.assertNotIn("Hidden draft summary", json.dumps(reader))

    def test_published_layout_is_independent_of_draft(self):
        for r in (self.a, self.b, self.campaign, self.board):
            self.publish(r)
        self.board = self.update(
            self.board,
            data={
                **self.board.data,
                "positions": {str(self.a.id): {"x": 800, "y": 900}},
            },
        )
        self.assertEqual(
            relationship_view(self.board)["positions"][str(self.a.id)]["x"], 800
        )
        self.assertEqual(
            relationship_view(self.board, True)["positions"][str(self.a.id)]["x"], 140
        )

    def test_campaign_publication_controls_membership(self):
        for r in (self.a, self.b, self.c, self.campaign, self.board):
            self.publish(r)
        self.campaign = self.update(self.campaign, data={"party": [str(self.c.id)]})
        self.assertEqual(
            [n["id"] for n in relationship_view(self.board)["nodes"]], [str(self.c.id)]
        )
        self.assertEqual(
            {n["id"] for n in relationship_view(self.board, True)["nodes"]},
            {str(self.a.id), str(self.b.id)},
        )

    def test_hidden_edges_are_not_shown_to_reader(self):
        for r in (self.a, self.b, self.campaign, self.board):
            self.publish(r)
        from .models import Connection

        Connection.objects.filter(id=self.edge["id"]).update(visibility="private")
        self.assertEqual(relationship_view(self.board, True)["edges"], [])

    def test_filters_do_not_retain_hidden_position_keys(self):
        self.board = self.update(
            self.board, data={**self.board.data, "tags": ["chosen"]}
        )
        self.a = self.update(self.a, tags=["chosen"])
        graph = relationship_view(self.board)
        self.assertEqual(set(graph["positions"]), {str(self.a.id)})

    def test_invalid_coordinates_and_layouts_rejected(self):
        for point in (
            {"x": True, "y": 1},
            {"x": -1, "y": 0},
            {"x": 10001, "y": 0},
            {"x": 0},
            {"x": 0, "y": 1, "extra": 2},
            [1, 2],
            {"x": "4", "y": 0},
        ):
            self.assertEqual(
                self.request(
                    {**self.board.data, "positions": {str(self.a.id): point}}
                ).status_code,
                400,
            )
        self.assertEqual(
            self.request({**self.board.data, "layout": "unknown"}).status_code, 400
        )
        self.assertEqual(
            self.request({**self.board.data, "positions": []}).status_code, 400
        )

    def test_foreign_or_wrong_kind_campaign_and_position_rejected(self):
        world = World.objects.create(owner=self.user, name="Other")
        foreign = save_resource(world, {"title": "Foreign", "kind": "character"})
        for identity in (str(foreign.id), "bad-uuid"):
            self.assertEqual(
                self.request(
                    {**self.board.data, "positions": {identity: {"x": 1, "y": 2}}}
                ).status_code,
                400,
            )
        for identity in (str(foreign.id), str(self.a.id), True):
            self.assertEqual(
                self.request({**self.board.data, "campaign_id": identity}).status_code,
                400,
            )

    def test_stale_layout_cannot_overwrite_newer_positions(self):
        self.assertEqual(
            self.request(
                {**self.board.data, "positions": {str(self.a.id): {"x": 20, "y": 30}}}
            ).status_code,
            200,
        )
        self.assertEqual(
            self.request({**self.board.data, "positions": {}}).status_code, 409
        )
        self.board.refresh_from_db()
        self.assertEqual(self.board.data["positions"][str(self.a.id)]["x"], 20)

    def test_revision_restore_restores_layout(self):
        self.board = self.update(self.board, data={**self.board.data, "positions": {}})
        response = self.client.post(
            f"/api/resources/{self.board.id}/restore",
            json.dumps({"number": 1, "expected_revision": self.board.revision}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["positions"][str(self.a.id)]["x"], 140)

    def test_archive_remaps_position_keys_and_campaign_ids(self):
        self.publish(self.board)
        clone = import_world_archive(self.user, world_archive(self.world))
        board = Resource.objects.get(world=clone, kind="relationship")
        a = Resource.objects.get(world=clone, title="Hero")
        campaign = Resource.objects.get(world=clone, kind="campaign")
        self.assertEqual(board.data["positions"][str(a.id)], {"x": 140, "y": 200})
        self.assertNotIn(str(self.a.id), board.data["positions"])
        self.assertEqual(board.data["campaign_id"], str(campaign.id))
        self.assertEqual(board.published["data"]["positions"], board.data["positions"])

    def test_deleted_nodes_keep_saved_layout_but_leave_active_web(self):
        Resource.objects.filter(id=self.b.id).update(deleted_at=timezone.now())
        graph = relationship_view(self.board)
        self.assertNotIn(str(self.b.id), graph["positions"])
        self.assertEqual(graph["edges"], [])
        self.board = self.update(self.board, summary="Retained layout")
        self.assertIn(str(self.b.id), self.board.data["positions"])
