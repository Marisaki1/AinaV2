import json
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone
from .models import World, Connection, Resource
from .services import save_resource, world_archive, import_world_archive


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class GraphTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("graph-owner", password="tests-password")
        self.world = World.objects.create(owner=self.user, name="Families")
        self.client.force_login(self.user)

    def add(self, title, kind="character", **fields):
        return save_resource(
            self.world, {"title": title, "kind": kind, "visibility": "public", **fields}
        )

    def edge(self, a, b, kind="parent", **fields):
        return Connection.objects.create(
            world=self.world, source=a, target=b, kind=kind, **fields
        )

    def publish(self, r):
        response = self.send(
            f"/resources/{r.id}/publish", {"expected_revision": r.revision}
        )
        self.assertEqual(response.status_code, 200)

    def send(self, path, data, method="post"):
        return getattr(self.client, method)(
            "/api" + path, json.dumps(data), content_type="application/json"
        )

    def family(self, root=None, **params):
        if root:
            params["root"] = str(root.id)
        return self.client.get(f"/api/worlds/{self.world.id}/family", params)

    def tree(self, items, **data):
        return self.add(
            "Hierarchy", "tree", data={"items": [str(i.id) for i in items], **data}
        )

    def hierarchy(self, r, reader=False):
        return self.client.get(
            f"/api/resources/{r.id}/hierarchy" + ("?audience=reader" if reader else "")
        )

    def test_extended_kinship_and_cousins(self):
        grand, parent, aunt, root, sibling, cousin, spouse = [
            self.add(n)
            for n in ("Grand", "Parent", "Aunt", "Root", "Sibling", "Cousin", "Spouse")
        ]
        for a, b in [
            (grand, parent),
            (grand, aunt),
            (parent, root),
            (parent, sibling),
            (aunt, cousin),
        ]:
            self.edge(a, b)
        self.edge(root, spouse, "spouse")
        rows = {r["title"]: r for r in self.family(root).json()["nodes"]}
        self.assertIn("Grandparent", rows["Grand"]["relationships"])
        self.assertIn("Aunt / uncle", rows["Aunt"]["relationships"])
        self.assertTrue(
            any("Cousin" in label for label in rows["Cousin"]["relationships"])
        )
        self.assertIn(
            "Sibling through a shared parent", rows["Sibling"]["relationships"]
        )
        self.assertIn("Spouse / partner", rows["Spouse"]["relationships"])

    def test_descendants_exclude_spouse_and_unrelated_branch(self):
        root, child, grand, spouse, other = [
            self.add(n) for n in ("Root", "Child", "Grandchild", "Spouse", "Unrelated")
        ]
        self.edge(root, child)
        self.edge(child, grand)
        self.edge(root, spouse, "spouse")
        self.edge(spouse, other)
        result = self.family(root, direction="descendants").json()
        self.assertEqual(
            {n["id"] for n in result["nodes"]},
            {str(n.id) for n in (root, child, grand)},
        )
        limited = self.family(root, direction="descendants", depth=1).json()
        self.assertEqual(len(limited["nodes"]), 2)

    def test_couple_keeps_only_shared_descendants(self):
        a, b, shared, grand, half = [
            self.add(n) for n in ("A", "B", "Shared", "Grandchild", "Other child")
        ]
        for x, y in [(a, shared), (b, shared), (shared, grand), (a, half)]:
            self.edge(x, y)
        result = self.family(a, direction="descendants", partner=str(b.id)).json()
        ids = [n["id"] for n in result["nodes"]]
        self.assertEqual(set(ids), {str(n.id) for n in (a, b, shared, grand)})
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(self.family(a, partner=str(b.id)).status_code, 400)

    def test_shared_ancestors_render_once_and_adoption_is_explicit(self):
        top, a, b, child, adopted = [
            self.add(n) for n in ("Top", "A", "B", "Child", "Adopted")
        ]
        for x, y in [(top, a), (top, b), (a, child), (b, child)]:
            self.edge(x, y)
        self.edge(child, adopted, "adoptive-parent")
        ancestors = self.family(child, direction="ancestors").json()["nodes"]
        self.assertEqual(len(ancestors), 4)
        self.assertEqual(sum(n["id"] == str(top.id) for n in ancestors), 1)
        self.assertEqual(
            len(self.family(child, direction="descendants").json()["nodes"]), 1
        )
        self.assertEqual(
            len(
                self.family(child, direction="descendants", adoptive="1").json()[
                    "nodes"
                ]
            ),
            2,
        )

    def test_reader_filters_edges_endpoints_notes_and_draft_titles(self):
        a, b, secret = [
            self.add(n) for n in ("Published A", "Published B", "Private child")
        ]
        secret.visibility = "private"
        secret.save()
        self.edge(a, b, visibility="public", notes="GM secret notes")
        self.edge(a, secret, visibility="public", label="Hidden edge")
        self.edge(a, b, "spouse", visibility="private", label="Secret marriage")
        for r in (a, b):
            self.publish(r)
        save_resource(
            self.world, {"title": "Draft rename", "expected_revision": a.revision}, a
        )
        result = self.family(a, audience="reader").json()
        text = json.dumps(result)
        for hidden in (
            str(secret.id),
            "Private child",
            "Hidden edge",
            "Secret marriage",
            "GM secret notes",
            "Draft rename",
        ):
            self.assertNotIn(hidden, text)
        self.assertEqual(len(result["edges"]), 1)
        rows = self.client.get(
            f"/api/worlds/{self.world.id}/connections?audience=reader"
        ).json()["connections"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["notes"], "")

    def test_reader_cannot_traverse_private_parent_edge(self):
        a, b, c = [self.add(n) for n in "ABC"]
        self.edge(a, b, visibility="private")
        self.edge(b, c, visibility="public")
        for r in (a, b, c):
            self.publish(r)
        self.assertEqual(
            len(
                self.family(a, direction="descendants", audience="reader").json()[
                    "nodes"
                ]
            ),
            1,
        )

    def test_foreign_roots_and_worlds_are_unavailable(self):
        other = World.objects.create(owner=self.user, name="Other")
        foreign = save_resource(other, {"title": "Foreign", "kind": "character"})
        self.assertEqual(self.family(foreign).status_code, 404)
        outsider = User.objects.create_user("outsider")
        world = World.objects.create(owner=outsider, name="Private world")
        self.assertEqual(
            self.client.get(f"/api/worlds/{world.id}/family").status_code, 404
        )
        self.client.logout()
        self.assertEqual(self.family().status_code, 401)

    def test_invalid_query_and_deleted_root(self):
        root = self.add("Root")
        for params in (
            {"depth": 0},
            {"depth": 31},
            {"depth": "abc"},
            {"direction": "sideways"},
        ):
            self.assertEqual(self.family(root, **params).status_code, 400)
        root.deleted_at = timezone.now()
        root.save()
        self.assertEqual(self.family(root).status_code, 404)

    def test_parent_and_adoptive_cycles_are_rejected_atomically(self):
        a, b, c = [self.add(n) for n in "ABC"]
        self.edge(a, b)
        self.edge(b, c, "adoptive-parent")
        response = self.send(
            f"/worlds/{self.world.id}/connections",
            {"source": str(c.id), "target": str(a.id), "kind": "parent"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Connection.objects.count(), 2)

    def test_cycle_detection_does_not_stop_at_200_generations(self):
        nodes = [
            Resource.objects.create(world=self.world, title=str(i), kind="character")
            for i in range(205)
        ]
        Connection.objects.bulk_create(
            [
                Connection(world=self.world, source=a, target=b, kind="parent")
                for a, b in zip(nodes, nodes[1:])
            ]
        )
        response = self.send(
            f"/worlds/{self.world.id}/connections",
            {"source": str(nodes[-1].id), "target": str(nodes[0].id), "kind": "parent"},
        )
        self.assertEqual(response.status_code, 400)

    def test_imported_cycles_are_bounded_and_each_node_is_unique(self):
        a, b = self.add("A"), self.add("B")
        self.edge(a, b)
        self.edge(b, a)
        value = self.family(a).json()
        self.assertEqual(len(value["nodes"]), 2)
        self.assertTrue(value["warnings"])

    def test_connection_creation_honors_visibility_and_validates_it(self):
        a, b = self.add("A"), self.add("B")
        fields = {
            "source": str(a.id),
            "target": str(b.id),
            "kind": "spouse",
            "visibility": "public",
        }
        response = self.send(f"/worlds/{self.world.id}/connections", fields)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["visibility"], "public")
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/connections",
                {**fields, "kind": "sibling", "visibility": "readers"},
            ).status_code,
            400,
        )

    def test_hierarchy_reparent_preserves_descendants_and_library_parents(self):
        a, b, c, d = [self.add(n, "article") for n in "ABCD"]
        tree = self.tree(
            [a, b, c, d], parents={str(b.id): str(a.id), str(c.id): str(b.id)}
        )
        data = {**tree.data, "parents": {**tree.data["parents"], str(b.id): str(d.id)}}
        response = self.send(
            f"/resources/{tree.id}",
            {"data": data, "expected_revision": tree.revision},
            "patch",
        )
        self.assertEqual(response.status_code, 200)
        value = self.hierarchy(tree).json()
        rows = {n["id"]: n for n in value["nodes"]}
        self.assertEqual(rows[str(c.id)]["parent"], str(b.id))
        self.assertEqual(rows[str(c.id)]["depth"], 2)
        self.assertEqual(rows[str(b.id)]["parent"], str(d.id))
        b.refresh_from_db()
        self.assertIsNone(b.parent_id)

    def test_hierarchy_tags_and_combined_selection_update_dynamically(self):
        a = self.add("A", tags=["Lore"])
        b = self.add("B", tags=["Other"])
        c = self.add("C")
        tree = self.tree([c], selection="both", tags=["ＬＯＲＥ"], parents={})
        self.assertEqual(
            {n["id"] for n in self.hierarchy(tree).json()["nodes"]},
            {str(a.id), str(c.id)},
        )
        save_resource(
            self.world, {"tags": ["lore"], "expected_revision": b.revision}, b
        )
        self.assertEqual(len(self.hierarchy(tree).json()["nodes"]), 3)

    def test_hierarchy_all_any_tags_and_empty_tag_rule(self):
        self.add("A", tags=["red", "blue"])
        self.add("B", tags=["red"])
        tree = self.tree([], selection="tags", tags=["red", "blue"], parents={})
        self.assertEqual(len(self.hierarchy(tree).json()["nodes"]), 1)
        tree = save_resource(
            self.world,
            {
                "data": {**tree.data, "tag_mode": "any"},
                "expected_revision": tree.revision,
            },
            tree,
        )
        self.assertEqual(len(self.hierarchy(tree).json()["nodes"]), 2)
        tree = save_resource(
            self.world,
            {"data": {**tree.data, "tags": []}, "expected_revision": tree.revision},
            tree,
        )
        self.assertEqual(self.hierarchy(tree).json()["nodes"], [])

    def test_hierarchy_cycle_foreign_and_duplicate_definitions_are_rejected(self):
        a, b = self.add("A"), self.add("B")
        for data in (
            {"items": [str(a.id), str(a.id)]},
            {"parents": {str(a.id): str(a.id)}},
            {"parents": {str(a.id): str(b.id), str(b.id): str(a.id)}},
            {"selection": "bad"},
        ):
            with self.assertRaises(ValueError):
                self.add("Bad", "tree", data=data)
        other = World.objects.create(owner=self.user, name="Other")
        foreign = Resource.objects.create(world=other, title="Foreign")
        with self.assertRaises(ValueError):
            self.tree([a], parents={str(a.id): str(foreign.id)})

    def test_hierarchy_order_and_legacy_collection_parents(self):
        parent = self.add("Parent", "folder")
        a = self.add("A", parent=str(parent.id))
        b = self.add("B", parent=str(parent.id))
        tree = self.tree([parent, a, b], order=[str(parent.id), str(b.id), str(a.id)])
        nodes = self.hierarchy(tree).json()["nodes"]
        self.assertEqual([n["title"] for n in nodes], ["Parent", "B", "A"])
        self.assertEqual([n["depth"] for n in nodes], [0, 1, 1])

    def test_reader_hierarchy_detaches_private_parent_and_uses_saved_definition(self):
        parent = self.add("Secret ancestor", visibility="private")
        child = self.add("Child")
        other = self.add("Other")
        tree = self.tree([parent, child], parents={str(child.id): str(parent.id)})
        for r in (child, other, tree):
            self.publish(r)
        save_resource(
            self.world,
            {
                "data": {"items": [str(other.id)], "parents": {}},
                "expected_revision": tree.revision,
            },
            tree,
        )
        value = self.hierarchy(tree, True).json()
        self.assertEqual([n["title"] for n in value["nodes"]], ["Child"])
        self.assertIsNone(value["nodes"][0]["parent"])
        direct = self.client.get(f"/api/resources/{tree.id}?audience=reader").json()
        self.assertNotIn(str(parent.id), json.dumps([direct, value]))
        self.assertNotIn("Secret ancestor", json.dumps([direct, value]))

    def test_reader_tag_membership_uses_published_tags(self):
        child = self.add("Child", tags=["lore"])
        tree = self.tree([], selection="tags", tags=["lore"], parents={})
        for r in (child, tree):
            self.publish(r)
        save_resource(
            self.world, {"tags": [], "expected_revision": child.revision}, child
        )
        self.assertEqual(len(self.hierarchy(tree, True).json()["nodes"]), 1)
        self.assertEqual(len(self.hierarchy(tree).json()["nodes"]), 0)

    def test_hierarchy_stale_write_does_not_lose_structure(self):
        a, b = self.add("A"), self.add("B")
        tree = self.tree([a, b], parents={})
        tree = save_resource(
            self.world, {"title": "Renamed", "expected_revision": 1}, tree
        )
        response = self.send(
            f"/resources/{tree.id}",
            {"data": {"items": [], "parents": {}}, "expected_revision": 1},
            "patch",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(len(self.hierarchy(tree).json()["nodes"]), 2)

    def test_hierarchy_foreign_deleted_and_reader_unpublished_are_unavailable(self):
        tree = self.tree([])
        self.assertEqual(self.hierarchy(tree, True).status_code, 404)
        tree.deleted_at = timezone.now()
        tree.save()
        self.assertEqual(self.hierarchy(tree).status_code, 404)
        self.assertEqual(self.hierarchy(self.add("Not a hierarchy")).status_code, 404)

    def test_hierarchy_and_family_survive_portable_archive(self):
        a, b = self.add("A"), self.add("B")
        self.edge(a, b, visibility="public", notes="Private note")
        tree = self.tree(
            [a, b], parents={str(b.id): str(a.id)}, order=[str(b.id), str(a.id)]
        )
        self.publish(tree)
        restored = import_world_archive(self.user, world_archive(self.world))
        newtree = restored.resources.get(kind="tree")
        newa = restored.resources.get(title="A")
        newb = restored.resources.get(title="B")
        self.assertEqual(newtree.data["parents"], {str(newb.id): str(newa.id)})
        self.assertEqual(newtree.published["data"]["parents"], newtree.data["parents"])
        self.assertEqual(len(self.hierarchy(newtree).json()["nodes"]), 2)
        edge = restored.connections.get()
        self.assertEqual(edge.visibility, "public")
        self.assertEqual(edge.notes, "Private note")
