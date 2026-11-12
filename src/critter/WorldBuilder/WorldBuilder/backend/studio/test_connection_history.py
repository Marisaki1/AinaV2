import json
import tempfile
from pathlib import Path
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from .models import World, Connection, ConnectionRevision
from .connection_history import save, snapshot, export, import_connection
from .services import save_resource, world_archive, import_world_archive


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class ConnectionHistoryTests(TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        settings = override_settings(MEDIA_ROOT=Path(temp.name))
        settings.enable()
        self.addCleanup(settings.disable)
        self.user = User.objects.create_user("connections", password="test-password")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Connection history")
        self.a, self.b, self.c = [
            save_resource(
                self.world,
                {"title": title, "kind": "character", "visibility": "public"},
            )
            for title in ("A", "B", "C")
        ]
        self.edge = self.add(self.a, self.b)

    def add(self, a, b, kind="friend", **fields):
        return save(
            self.world,
            {"source": str(a.id), "target": str(b.id), "kind": kind, **fields},
        )

    def request(self, method, path, value=None):
        return getattr(self.client, method)(
            "/api" + path, json.dumps(value or {}), content_type="application/json"
        )

    def edit(self, edge=None, **fields):
        edge = edge or self.edge
        return self.request(
            "patch",
            f"/connections/{edge['id']}",
            {"expected_revision": edge["revision"], **fields},
        )

    def remove(self, edge=None):
        edge = edge or self.edge
        return self.request(
            "delete",
            f"/connections/{edge['id']}",
            {"expected_revision": edge["revision"]},
        )

    def restore(self, edge, number=None):
        return self.request(
            "post",
            f"/connections/{edge['id']}/restore",
            {
                "expected_revision": edge["revision"],
                **({"number": number} if number is not None else {}),
            },
        )

    def history(self, edge=None):
        return self.client.get(
            f"/api/connections/{(edge or self.edge)['id']}/revisions"
        )

    def publish(self, r):
        self.assertEqual(
            self.request(
                "post", f"/resources/{r.id}/publish", {"expected_revision": r.revision}
            ).status_code,
            200,
        )

    def test_creation_and_edit_keep_identity_with_immutable_history(self):
        self.assertEqual(self.edge["revision"], 1)
        response = self.edit(
            label="Sworn friends",
            notes="Owner secret",
            strength=-20,
            visibility="public",
            target=str(self.c.id),
            kind="diplomacy",
        )
        self.assertEqual(response.status_code, 200, response.content)
        changed = response.json()
        self.assertEqual(changed["id"], self.edge["id"])
        self.assertEqual(changed["revision"], 2)
        rows = self.history().json()["revisions"]
        self.assertEqual([r["number"] for r in rows], [2, 1])
        self.assertEqual(rows[1]["snapshot"]["target"], str(self.b.id))
        self.assertEqual(rows[0]["snapshot"]["notes"], "Owner secret")

    def test_stale_and_missing_revisions_do_not_write(self):
        self.edit(label="Changed")
        for value in [None, 1, True, "2"]:
            response = self.request(
                "patch",
                f"/connections/{self.edge['id']}",
                {"expected_revision": value, "notes": "Stale"},
            )
            self.assertEqual(response.status_code, 409)
        self.assertEqual(ConnectionRevision.objects.count(), 2)
        self.assertEqual(
            self.request(
                "delete", f"/connections/{self.edge['id']}", {"expected_revision": 1}
            ).status_code,
            409,
        )

    def test_removal_filters_graphs_reader_and_retains_history(self):
        for r in [self.a, self.b]:
            self.publish(r)
        public = self.edit(visibility="public").json()
        removed = self.remove(public).json()
        self.assertIsNotNone(removed["deleted_at"])
        for audience in ["", "?audience=reader"]:
            self.assertEqual(
                self.client.get(
                    f"/api/worlds/{self.world.id}/connections" + audience
                ).json()["connections"],
                [],
            )
        trash = self.client.get(
            f"/api/worlds/{self.world.id}/connections?trash=1"
        ).json()["connections"]
        self.assertEqual(trash[0]["id"], self.edge["id"])
        self.assertEqual(self.history().json()["revisions"][0]["action"], "deleted")
        self.assertEqual(self.edit(removed, label="No").status_code, 400)

    def test_restore_removed_and_old_revision_keep_monotonic_numbers(self):
        updated = self.edit(label="Changed").json()
        removed = self.remove(updated).json()
        active = self.restore(removed).json()
        self.assertEqual(active["revision"], 4)
        self.assertIsNone(active["deleted_at"])
        restored = self.restore(active, 1).json()
        self.assertEqual(restored["id"], self.edge["id"])
        self.assertEqual(restored["label"], "")
        self.assertEqual(restored["revision"], 5)
        self.assertEqual(self.restore(restored, 3).status_code, 400)

    def test_restore_checks_live_cycle_and_excludes_current_parent(self):
        parent = self.add(self.b, self.c, "parent")
        self.add(self.c, self.a, "parent")
        self.assertEqual(
            self.edit(parent, source=str(self.a.id), target=str(self.c.id)).status_code,
            400,
        )
        current = self.restore(parent, 1).json()
        changed = self.edit(
            current, source=str(self.b.id), target=str(self.a.id)
        ).json()
        self.add(self.c, self.b, "parent")
        self.assertEqual(self.restore(changed, 1).status_code, 400)

    def test_reverse_endpoint_edit_ignores_replaced_edge(self):
        parent = self.add(self.a, self.c, "parent")
        changed = self.edit(parent, source=str(self.c.id), target=str(self.a.id))
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertEqual(self.restore(changed.json(), 1).status_code, 200)

    def test_soft_deleted_ancestry_does_not_block_new_link_but_restore_does(self):
        parent = self.add(self.a, self.c, "parent")
        removed = self.remove(parent).json()
        self.add(self.c, self.a, "adoptive-parent")
        self.assertEqual(self.restore(removed).status_code, 400)

    def test_duplicate_active_edit_and_restore_are_atomic(self):
        other = self.add(self.a, self.c)
        self.assertEqual(self.edit(other, target=str(self.b.id)).status_code, 409)
        removed = self.remove().json()
        replacement = self.add(self.a, self.b)
        self.assertNotEqual(replacement["id"], removed["id"])
        self.assertEqual(self.restore(removed).status_code, 409)
        self.assertEqual(self.history().json()["revision"], 2)

    def test_cross_world_self_trashed_and_unknown_fields_rejected(self):
        world = World.objects.create(owner=self.user, name="Other")
        other = save_resource(world, {"title": "Other"})
        for fields in [
            {"source": str(other.id)},
            {"target": str(self.a.id)},
            {"strength": True},
            {"visibility": "players"},
            {"source": "bad"},
            {"unknown": "field"},
        ]:
            self.assertEqual(self.edit(**fields).status_code, 400, fields)
        self.request(
            "delete", f"/resources/{self.c.id}", {"expected_revision": self.c.revision}
        )
        self.assertEqual(self.edit(target=str(self.c.id)).status_code, 400)

    def test_history_and_notes_are_owner_only_and_visibility_changes_immediate(self):
        for r in [self.a, self.b]:
            self.publish(r)
        public = self.edit(notes="Secret note", visibility="public").json()
        route = f"/api/connections/{public['id']}"
        reader = self.client.get(route + "?audience=reader")
        self.assertEqual(reader.status_code, 200)
        self.assertNotIn("Secret note", reader.content.decode())
        self.assertNotIn("revision", reader.json())
        self.assertEqual(
            self.client.get(route + "/revisions?audience=reader").status_code, 404
        )
        private = self.edit(public, visibility="private").json()
        self.assertEqual(self.client.get(route + "?audience=reader").status_code, 404)
        other = User.objects.create_user("outsider")
        self.client.force_login(other)
        for suffix in ["", "/revisions"]:
            self.assertEqual(self.client.get(route + suffix).status_code, 404)
        self.assertEqual(self.restore(private).status_code, 404)
        self.client.logout()
        self.assertEqual(self.client.get(route).status_code, 401)

    def test_history_queries_do_not_mutate_baseline(self):
        edge = Connection.objects.create(world=self.world, source=self.b, target=self.c)
        count = ConnectionRevision.objects.count()
        data = self.client.get(f"/api/connections/{edge.id}/revisions").json()
        self.assertEqual(data["revisions"][0]["action"], "baseline")
        self.assertEqual(ConnectionRevision.objects.count(), count)
        response = self.edit({"id": str(edge.id), "revision": 1}, label="Edited")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(edge.revisions.count(), 2)

    def test_legacy_delete_endpoint_requires_revision_and_soft_deletes(self):
        route = f"/worlds/{self.world.id}/connections"
        self.assertEqual(
            self.request("delete", route, {"id": self.edge["id"]}).status_code, 409
        )
        self.assertEqual(
            self.request(
                "delete", route, {"id": self.edge["id"], "expected_revision": 1}
            ).status_code,
            200,
        )
        self.assertEqual(Connection.objects.count(), 1)

    def test_portable_archive_preserves_history_deleted_links_and_remaps_endpoints(
        self,
    ):
        updated = self.edit(label="Earlier label", notes="Owner note").json()
        removed = self.remove(updated).json()
        copied = import_world_archive(self.user, world_archive(self.world))
        clone = copied.connections.get()
        self.assertIsNotNone(clone.deleted_at)
        self.assertEqual(clone.revision, removed["revision"])
        rows = list(clone.revisions.all())
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1].snapshot["notes"], "Owner note")
        self.assertNotEqual(rows[0].snapshot["source"], str(self.a.id))
        self.assertEqual(rows[0].snapshot["source"], str(clone.source_id))
        self.assertEqual(
            clone.updated_at, Connection.objects.get(id=self.edge["id"]).updated_at
        )

    def test_bad_import_history_snapshots_are_rejected(self):
        edge = Connection.objects.get(id=self.edge["id"])
        raw = export(edge)
        mapping = {str(r.id): str(r.id) for r in [self.a, self.b, self.c]}
        self.remove()
        for patch in [
            {"revision": 2},
            {"history": []},
            {"history": [{"number": 1, "snapshot": {}, "action": "created"}]},
            {"visibility": "bad"},
        ]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                from django.db import transaction

                with transaction.atomic():
                    import_connection(self.world, {**raw, **patch}, mapping)

    def test_original_old_archive_without_history_imports_baseline(self):
        edge = Connection.objects.get(id=self.edge["id"])
        raw = {
            k: v
            for k, v in export(edge).items()
            if k
            not in ("history", "revision", "deleted_at", "created_at", "updated_at")
        }
        self.remove()
        clone = import_connection(
            self.world, raw, {str(r.id): str(r.id) for r in [self.a, self.b]}
        )
        self.assertEqual(clone.revisions.get().action, "baseline")
        self.assertEqual(snapshot(clone)["source"], str(self.a.id))

    def test_directional_edit_does_not_change_reverse_strength(self):
        first = self.add(self.a, self.c, "diplomacy", strength=-30)
        reverse = self.add(self.c, self.a, "diplomacy", strength=70)
        self.assertEqual(self.edit(first, strength=-90).status_code, 200)
        self.assertEqual(
            self.client.get(f"/api/connections/{reverse['id']}").json()["strength"], 70
        )
