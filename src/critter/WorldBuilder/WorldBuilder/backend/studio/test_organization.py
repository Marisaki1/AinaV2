import json
from pathlib import Path
import tempfile
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from .models import World, Revision
from django.db import OperationalError
from unittest.mock import patch
from .services import save_resource, store_asset, world_archive, import_world_archive
from .tests import picture, document


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class OrganizationTests(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.override = override_settings(MEDIA_ROOT=Path(self.temp.name))
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.user = User.objects.create_user("owner", password="testing-password")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Organized world")

    def create(self, title="Entry", **fields):
        return save_resource(self.world, {"title": title, **fields})

    def send(self, path, data, method="post"):
        return getattr(self.client, method)(
            "/api" + path, json.dumps(data), content_type="application/json"
        )

    def move(self, rows):
        return self.send(f"/worlds/{self.world.id}/organize", {"entries": rows})

    def contents(self, folder, query=""):
        return self.client.get(
            f"/api/worlds/{self.world.id}/collections/{folder.id}" + query
        )

    def smart(self, **rules):
        return self.create(
            "Saved filter",
            kind="folder",
            data={"collection_type": "smart", "rules": rules},
        )

    def test_subtree_move_preserves_ids_children_and_mentions(self):
        a = self.create("Places", kind="folder")
        b = self.create("Shrines", kind="folder", parent=str(a.id))
        c = self.create("Shrine", parent=str(b.id))
        destination = self.create("Setting", kind="folder")
        source = self.create(
            "A linked story",
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "resourceLink",
                                "attrs": {"id": str(c.id), "label": c.title},
                            }
                        ],
                    }
                ],
            },
        )
        response = self.move(
            [
                {
                    "id": str(a.id),
                    "parent": str(destination.id),
                    "revision": 1,
                    "position": 2,
                }
            ]
        )
        self.assertEqual(response.status_code, 200, response.content)
        for item in (a, b, c, source):
            item.refresh_from_db()
        self.assertEqual(
            (a.parent_id, b.parent_id, c.parent_id), (destination.id, a.id, b.id)
        )
        self.assertIn(str(c.id), json.dumps(source.document))
        self.assertEqual(c.revision, 1)
        result = self.contents(destination, "?recursive=1").json()
        self.assertEqual(
            {r["id"] for r in result["resources"]}, {str(a.id), str(b.id), str(c.id)}
        )
        self.assertEqual(
            [r["title"] for r in self.contents(b).json()["breadcrumbs"]],
            ["Setting", "Places", "Shrines"],
        )

    def test_batch_conflict_rolls_back_every_move_and_revision(self):
        a = self.create("A")
        b = self.create("B")
        folder = self.create("Folder", kind="folder")
        before = Revision.objects.count()
        response = self.move(
            [
                {"id": str(a.id), "parent": str(folder.id), "revision": 1},
                {"id": str(b.id), "parent": str(folder.id), "revision": 0},
            ]
        )
        self.assertEqual(response.status_code, 409)
        a.refresh_from_db()
        self.assertIsNone(a.parent_id)
        self.assertEqual(a.revision, 1)
        self.assertEqual(Revision.objects.count(), before)

    def test_final_graph_preflight_allows_detaching_an_old_ancestor(self):
        b = self.create("B", kind="folder")
        a = self.create("A", kind="folder", parent=str(b.id))
        response = self.move(
            [
                {"id": str(b.id), "parent": str(a.id), "revision": 1},
                {"id": str(a.id), "parent": None, "revision": 1},
            ]
        )
        self.assertEqual(response.status_code, 200, response.content)
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertIsNone(a.parent_id)
        self.assertEqual(b.parent_id, a.id)

    def test_move_cycle_is_rejected_without_mutation(self):
        a = self.create("A", kind="folder")
        b = self.create("B", kind="folder")
        response = self.move(
            [
                {"id": str(a.id), "parent": str(b.id), "revision": 1},
                {"id": str(b.id), "parent": str(a.id), "revision": 1},
            ]
        )
        self.assertEqual(response.status_code, 400)
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertIsNone(a.parent_id)
        self.assertIsNone(b.parent_id)

    def test_moves_and_collection_reads_enforce_world_scope(self):
        other = World.objects.create(owner=self.user, name="Other world")
        foreign = save_resource(other, {"kind": "folder", "title": "Elsewhere"})
        a = self.create()
        self.assertEqual(
            self.move(
                [{"id": str(a.id), "parent": str(foreign.id), "revision": 1}]
            ).status_code,
            400,
        )
        self.assertEqual(
            self.move(
                [{"id": str(foreign.id), "parent": None, "revision": 1}]
            ).status_code,
            404,
        )
        self.assertEqual(self.contents(foreign).status_code, 404)

    def test_saved_filter_cannot_receive_physical_children(self):
        folder = self.smart(tags=["shrine"])
        a = self.create()
        self.assertEqual(
            self.move(
                [{"id": str(a.id), "parent": str(folder.id), "revision": 1}]
            ).status_code,
            400,
        )
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/resources",
                {"title": "Wrong parent", "parent": str(folder.id)},
            ).status_code,
            400,
        )
        real = self.create("Real folder", kind="folder")
        self.create(parent=str(real.id))
        self.assertEqual(
            self.send(
                f"/resources/{real.id}",
                {"data": folder.data, "expected_revision": 1},
                "patch",
            ).status_code,
            400,
        )

    def test_collection_order_persists_and_stale_reorder_is_rejected(self):
        a = self.create("A", kind="folder")
        b = self.create("B", kind="folder")
        self.assertEqual(
            self.move(
                [
                    {"id": str(a.id), "position": 1, "revision": 1},
                    {"id": str(b.id), "position": 0, "revision": 1},
                ]
            ).status_code,
            200,
        )
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual((a.position, b.position), (1, 0))
        self.assertEqual(
            self.move([{"id": str(a.id), "position": 0, "revision": 1}]).status_code,
            409,
        )

    def test_tag_filters_update_after_entry_and_media_edits(self):
        folder = self.smart(tags=["SHRINE"], kinds=["article", "media"])
        a = self.create("A", tags=["shrine"])
        b = self.create("B", tags=["forest"])
        asset = store_asset(self.world, picture(), tags=["Shrine"])
        result = self.contents(folder).json()
        self.assertEqual([r["id"] for r in result["resources"]], [str(a.id)])
        self.assertEqual([r["id"] for r in result["assets"]], [str(asset.id)])
        save_resource(self.world, {"tags": ["forest"], "expected_revision": 1}, a)
        save_resource(self.world, {"tags": ["shrine"], "expected_revision": 1}, b)
        self.send(f"/media/{asset.id}", {"tags": [], "expected_revision": 1}, "patch")
        result = self.contents(folder).json()
        self.assertEqual([r["id"] for r in result["resources"]], [str(b.id)])
        self.assertEqual(result["assets"], [])

    def test_all_any_type_template_status_and_body_query_filters(self):
        a = self.create(
            "Astral keeper",
            tags=["shrine", "mountain"],
            template="character",
            status="done",
            document=document("An astrolinguist keeps watch."),
        )
        self.create("Other", tags=["shrine"], template="character", status="draft")
        self.create("Map", kind="map", tags=["shrine", "mountain"])
        folder = self.smart(
            tags=["shrine", "mountain"],
            tag_mode="all",
            kinds=["article"],
            templates=["character"],
            statuses=["done"],
            query="astrolinguist",
        )
        self.assertEqual(
            [r["id"] for r in self.contents(folder).json()["resources"]], [str(a.id)]
        )
        folder = save_resource(
            self.world,
            {
                "data": {
                    "collection_type": "smart",
                    "rules": {"tags": ["absent", "mountain"], "tag_mode": "any"},
                },
                "expected_revision": 1,
            },
            folder,
        )
        self.assertEqual(len(self.contents(folder).json()["resources"]), 2)

    def test_reader_membership_uses_published_tags_rules_and_ancestry(self):
        a = self.create("Public", tags=["old"], visibility="public")
        self.send(f"/resources/{a.id}/publish", {"expected_revision": 1})
        save_resource(
            self.world,
            {"tags": ["new"], "private_notes": "secretneedle", "expected_revision": 1},
            a,
        )
        parent = self.create("Original parent", kind="folder", visibility="public")
        self.send(f"/resources/{parent.id}/publish", {"expected_revision": 1})
        folder = self.create(
            "Public filter",
            kind="folder",
            visibility="public",
            parent=str(parent.id),
            data={"collection_type": "smart", "rules": {"tags": ["old"]}},
        )
        self.send(f"/resources/{folder.id}/publish", {"expected_revision": 1})
        other = self.create("Draft parent", kind="folder", visibility="public")
        save_resource(
            self.world,
            {
                "parent": str(other.id),
                "data": {"collection_type": "smart", "rules": {"tags": ["new"]}},
                "expected_revision": 1,
            },
            folder,
        )
        hidden = self.create("Private item", tags=["old"])
        store_asset(self.world, picture(), tags=["old"])
        reader = self.contents(folder, "?audience=reader").json()
        self.assertEqual([r["id"] for r in reader["resources"]], [str(a.id)])
        self.assertEqual(reader["assets"], [])
        self.assertEqual(
            [b["title"] for b in reader["breadcrumbs"]],
            ["Original parent", "Public filter"],
        )
        self.assertNotIn(str(hidden.id), json.dumps(reader))
        self.assertNotIn("secretneedle", json.dumps(reader))

    def test_media_edit_revision_checks_leave_image_bytes_unchanged(self):
        asset = store_asset(self.world, picture())
        original = (Path(self.temp.name) / asset.storage_name).read_bytes()
        response = self.send(
            f"/media/{asset.id}",
            {
                "name": "Shrine map.png",
                "credit": "Artist",
                "tags": ["shrine"],
                "expected_revision": 1,
            },
            "patch",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["revision"], 2)
        self.assertEqual(response.json()["tags"], ["shrine"])
        self.assertEqual(
            self.send(
                f"/media/{asset.id}",
                {"name": "Old edit", "expected_revision": 1},
                "patch",
            ).status_code,
            409,
        )
        asset.refresh_from_db()
        self.assertEqual(asset.filename, "Shrine map.png")
        self.assertEqual(
            (Path(self.temp.name) / asset.storage_name).read_bytes(), original
        )

    def test_media_metadata_enforces_owner_and_valid_names(self):
        user = User.objects.create_user("other")
        world = World.objects.create(owner=user, name="Private")
        asset = store_asset(world, picture())
        self.assertEqual(self.client.get(f"/api/media/{asset.id}").status_code, 404)
        self.assertEqual(
            self.send(
                f"/media/{asset.id}", {"tags": ["x"], "expected_revision": 1}, "patch"
            ).status_code,
            404,
        )
        asset = store_asset(self.world, picture())
        self.assertEqual(
            self.send(
                f"/media/{asset.id}",
                {"name": "../escape", "expected_revision": 1},
                "patch",
            ).status_code,
            400,
        )

    def test_deduplication_does_not_overwrite_media_metadata(self):
        asset = store_asset(
            self.world, picture(), credit="First artist", tags=["original"]
        )
        same = store_asset(
            self.world, picture(), credit="Other artist", tags=["different"]
        )
        self.assertEqual(asset.id, same.id)
        self.assertEqual(same.tags, ["original"])
        self.assertEqual(same.credit, "First artist")

    def test_portable_archive_preserves_tags_and_dynamic_rules(self):
        self.create(tags=["shrine"])
        store_asset(self.world, picture(), tags=["shrine"])
        self.smart(tags=["shrine"])
        copied = import_world_archive(self.user, world_archive(self.world))
        folder = copied.resources.get(kind="folder")
        response = self.client.get(
            f"/api/worlds/{copied.id}/collections/{folder.id}"
        ).json()
        self.assertEqual(len(response["resources"]), 1)
        self.assertEqual(response["assets"][0]["tags"], ["shrine"])

    def test_invalid_filter_and_batch_shapes_are_rejected(self):
        for rules in [
            {"tags": "shrine"},
            {"kinds": ["unknown"]},
            {"tag_mode": "each"},
            {"statuses": ["published"]},
            {"query": []},
            {"unimplemented": True},
        ]:
            self.assertEqual(
                self.send(
                    f"/worlds/{self.world.id}/resources",
                    {
                        "title": "Bad",
                        "kind": "folder",
                        "data": {"collection_type": "smart", "rules": rules},
                    },
                ).status_code,
                400,
            )
        for rows in [[], [None], [{"id": None}]]:
            self.assertEqual(self.move(rows).status_code, 400)
        folder = self.create(kind="folder")
        self.assertEqual(
            self.send(
                f"/resources/{folder.id}", {"data": [], "expected_revision": 1}, "patch"
            ).status_code,
            400,
        )

    def test_busy_database_returns_a_retryable_error(self):
        with patch(
            "studio.views.organize", side_effect=OperationalError("database is locked")
        ):
            response = self.move([{"id": "unused", "revision": 1}])
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "write_busy")

    def test_reusable_terms_show_current_values_and_reader_snapshots(self):
        term = self.create(
            "A term", kind="variable", visibility="public", data={"value": 0}
        )
        source = self.create(
            "Source",
            visibility="public",
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "variable",
                                "attrs": {"id": str(term.id), "label": "stale"},
                            }
                        ],
                    }
                ],
            },
        )
        for entry in (term, source):
            self.send(f"/resources/{entry.id}/publish", {"expected_revision": 1})
        save_resource(self.world, {"data": {"value": 42}, "expected_revision": 1}, term)
        author = self.client.get(f"/api/resources/{source.id}").json()
        reader = self.client.get(f"/api/resources/{source.id}?audience=reader").json()
        self.assertEqual(
            author["document"]["content"][0]["content"][0]["attrs"]["label"], "42"
        )
        self.assertEqual(
            reader["document"]["content"][0]["content"][0]["attrs"]["label"], "0"
        )

    def test_mentions_and_backlinks_follow_renames_and_link_removal(self):
        target = self.create("A placeholder")
        source = self.create(
            "A story",
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "resourceLink",
                                "attrs": {
                                    "id": str(target.id),
                                    "label": "A placeholder",
                                },
                            }
                        ],
                    }
                ],
            },
        )
        save_resource(
            self.world, {"title": "A named keeper", "expected_revision": 1}, target
        )
        value = self.client.get(f"/api/resources/{source.id}").json()
        self.assertIn("A named keeper", value["html"])
        self.assertEqual(
            value["document"]["content"][0]["content"][0]["attrs"]["id"], str(target.id)
        )
        self.assertEqual(
            self.client.get(f"/api/resources/{target.id}").json()["backlinks"][0]["id"],
            str(source.id),
        )
        save_resource(
            self.world,
            {"document": document("An independent paragraph."), "expected_revision": 1},
            source,
        )
        self.assertEqual(
            self.client.get(f"/api/resources/{target.id}").json()["backlinks"], []
        )
