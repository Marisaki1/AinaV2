import json
import hashlib
import base64
from html.parser import HTMLParser
from xml.etree import ElementTree as ET
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone
from .models import World, Connection
from .services import save_resource, world_archive, import_world_archive
from .graph_exports import OFFLINE_SCRIPT
from unittest.mock import patch


class ExportParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.entries = []
        self.links = []
        self.csp = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script":
            self.scripts.append(attrs)
        if "data-node-entry" in attrs:
            self.entries.append(attrs["id"])
        if "href" in attrs:
            self.links.append(attrs["href"])
        if tag == "meta" and attrs.get("http-equiv") == "Content-Security-Policy":
            self.csp = attrs["content"]


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class SavedGraphTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("graphs", password="test-password")
        self.world = World.objects.create(owner=self.user, name="Saved graphs")
        self.client.force_login(self.user)
        self.a = self.add("A", tags=["lore"])
        self.b = self.add("B", tags=["lore"])
        self.c = self.add("C")
        self.edge = Connection.objects.create(
            world=self.world,
            source=self.a,
            target=self.b,
            kind="parent",
            visibility="public",
            notes="Secret edge notes",
        )

    def add(self, title, kind="character", **fields):
        return save_resource(
            self.world, {"kind": kind, "title": title, "visibility": "public", **fields}
        )

    def view(self, **data):
        return self.add(
            "My saved graph",
            "relationship",
            data={"mode": "family", "root_id": str(self.a.id), "depth": 6, **data},
        )

    def publish(self, r):
        response = self.client.post(
            f"/api/resources/{r.id}/publish",
            json.dumps({"expected_revision": r.revision}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)

    def graph(self, r, reader=False):
        return self.client.get(
            f"/api/resources/{r.id}/graph" + ("?audience=reader" if reader else "")
        )

    def export(self, r, format="svg", reader=False):
        return self.client.get(
            f"/api/resources/{r.id}/graph-export",
            {"format": format, **({"audience": "reader"} if reader else {})},
        )

    def update(self, r, **fields):
        return save_resource(self.world, {**fields, "expected_revision": r.revision}, r)

    def ids(self, response):
        return {n["id"] for n in response.json()["nodes"]}

    def test_saved_family_filters_and_live_source_changes(self):
        view = self.view(direction="descendants", tags=["ＬＯＲＥ"])
        self.assertEqual(self.ids(self.graph(view)), {str(self.a.id), str(self.b.id)})
        self.b = self.update(self.b, tags=[])
        self.assertEqual(self.ids(self.graph(view)), {str(self.a.id)})
        self.b = self.update(self.b, tags=["lore"], title="Renamed B")
        self.assertIn("Renamed B", self.graph(view).content.decode())

    def test_saved_couple_and_adoption_filters(self):
        Connection.objects.create(
            world=self.world, source=self.c, target=self.b, kind="parent"
        )
        view = self.view(direction="descendants", partner_id=str(self.c.id))
        self.assertEqual(len(self.graph(view).json()["nodes"]), 3)
        Connection.objects.create(
            world=self.world, source=self.b, target=self.c, kind="adoptive-parent"
        )
        view = self.update(
            view,
            data={
                "mode": "family",
                "root_id": str(self.b.id),
                "direction": "descendants",
                "adoptive": False,
            },
        )
        self.assertEqual(len(self.graph(view).json()["nodes"]), 1)
        view = self.update(view, data={**view.data, "adoptive": True})
        self.assertEqual(len(self.graph(view).json()["nodes"]), 2)

    def test_type_filter_applies_before_family_traversal(self):
        Connection.objects.create(
            world=self.world, source=self.b, target=self.c, kind="spouse"
        )
        view = self.view(kinds=["parent"])
        self.assertEqual(self.ids(self.graph(view)), {str(self.a.id), str(self.b.id)})
        self.assertEqual(
            {e["kind"] for e in self.graph(view).json()["edges"]}, {"parent"}
        )

    def test_filtered_root_has_empty_view_with_warning(self):
        view = self.view(tags=["missing"])
        response = self.graph(view).json()
        self.assertEqual(response["nodes"], [])
        self.assertTrue(response["warnings"])

    def test_network_tags_all_any_and_isolated_entries(self):
        view = self.view(mode="all", tags=["lore", "extra"])
        self.assertEqual(self.graph(view).json()["nodes"], [])
        view = self.update(view, data={**view.data, "tag_mode": "any"})
        self.assertEqual(len(self.graph(view).json()["nodes"]), 2)
        self.c = self.update(self.c, tags=["lore"])
        view = self.update(view, data={**view.data, "include_isolated": True})
        self.assertEqual(len(self.graph(view).json()["nodes"]), 3)

    def test_diplomacy_keeps_asymmetric_strengths(self):
        for a, b, strength in [(self.a, self.b, 40), (self.b, self.a, -70)]:
            Connection.objects.create(
                world=self.world,
                source=a,
                target=b,
                kind="diplomacy",
                strength=strength,
                visibility="public",
            )
        view = self.view(mode="diplomacy")
        self.assertEqual(
            {e["strength"] for e in self.graph(view).json()["edges"]}, {40, -70}
        )
        svg = self.export(view).content.decode()
        self.assertIn("(40)", svg)
        self.assertIn("(-70)", svg)

    def test_private_root_is_redacted_and_does_not_expand_to_all_families(self):
        view = self.view()
        for r in (self.a, self.b, view):
            self.publish(r)
        self.a.visibility = "private"
        self.a.save()
        graph = self.graph(view, True).json()
        direct = self.client.get(f"/api/resources/{view.id}?audience=reader").json()
        self.assertEqual(graph["nodes"], [])
        self.assertTrue(graph["warnings"])
        self.assertNotIn(str(self.a.id), json.dumps([graph, direct]))

    def test_private_partner_also_keeps_empty_reader_graph(self):
        Connection.objects.create(
            world=self.world,
            source=self.c,
            target=self.b,
            kind="parent",
            visibility="public",
        )
        view = self.view(direction="descendants", partner_id=str(self.c.id))
        for r in (self.a, self.b, view):
            self.publish(r)
        self.assertEqual(self.graph(view, True).json()["nodes"], [])
        self.assertNotIn(
            str(self.c.id), self.export(view, "json", True).content.decode()
        )

    def test_reader_uses_saved_definition_names_tags_and_private_edge_policy(self):
        view = self.view(tags=["lore"])
        for r in (self.a, self.b, view):
            self.publish(r)
        view = self.update(
            view, data={"mode": "all", "tags": ["new"]}, title="Draft graph"
        )
        self.a = self.update(self.a, title="Draft root", tags=[])
        reader = self.graph(view, True).json()
        self.assertEqual(len(reader["nodes"]), 2)
        self.assertEqual(reader["view"]["title"], "My saved graph")
        self.assertNotIn("Draft root", json.dumps(reader))
        self.edge.visibility = "private"
        self.edge.save()
        self.assertEqual(len(self.graph(view, True).json()["nodes"]), 1)

    def test_notes_and_article_bodies_are_absent_even_in_owner_exports(self):
        self.a = self.update(
            self.a,
            private_notes="Secret article notes",
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {"type": "text", "text": "Article body private detail"}
                        ],
                    }
                ],
            },
        )
        view = self.view()
        for format in ("svg", "html", "json"):
            text = self.export(view, format).content.decode()
            for secret in (
                "Secret edge notes",
                "Secret article notes",
                "Article body private detail",
            ):
                self.assertNotIn(secret, text)

    def test_export_node_sets_match_projection_and_html_list(self):
        view = self.view()
        expected = self.ids(self.graph(view))
        svg = ET.fromstring(self.export(view).content)
        self.assertEqual(
            {e.attrib["data-node"] for e in svg.iter() if "data-node" in e.attrib},
            expected,
        )
        parser = ExportParser()
        parser.feed(self.export(view, "html").content.decode())
        self.assertEqual(set(parser.entries), {"node-" + key for key in expected})
        data = json.loads(self.export(view, "json").content)
        self.assertEqual({n["id"] for n in data["nodes"]}, expected)
        self.assertEqual(data["format"], "worldbuilder-graph-v1")

    def test_html_is_self_contained_and_script_has_a_matching_csp_hash(self):
        view = self.view()
        text = self.export(view, "html").content.decode()
        parser = ExportParser()
        parser.feed(text)
        self.assertEqual(parser.scripts, [{}])
        self.assertTrue(all(href.startswith("#") for href in parser.links))
        digest = base64.b64encode(
            hashlib.sha256(OFFLINE_SCRIPT.encode()).digest()
        ).decode()
        self.assertIn("sha256-" + digest, parser.csp)
        self.assertIn("<script>" + OFFLINE_SCRIPT + "</script>", text)
        self.assertNotIn("<iframe", text)
        self.assertNotIn("<img", text)

    def test_unusual_titles_and_labels_cannot_inject_xml_or_html(self):
        title = '髴夢 & <script>window.injected=1</script> "quote"'
        self.a = self.update(self.a, title=title)
        self.edge.label = "</script><script>window.injected=2</script>"
        self.edge.save()
        view = self.view()
        view = self.update(
            view, title="Graph </title><script>window.injected=3</script>"
        )
        svg = ET.fromstring(self.export(view).content)
        self.assertTrue(
            any(e.text == title for e in svg.iter() if e.tag.endswith("title"))
        )
        text = self.export(view, "html").content.decode()
        parser = ExportParser()
        parser.feed(text)
        self.assertEqual(len(parser.scripts), 1)
        self.assertNotIn("<script>window.injected", text)

    def test_svg_anchors_are_internal_and_spouse_links_are_undirected(self):
        self.edge.kind = "spouse"
        self.edge.save()
        view = self.view()
        svg = ET.fromstring(self.export(view).content)
        ids = {e.attrib["id"] for e in svg.iter() if "id" in e.attrib}
        for e in svg.iter():
            if "href" in e.attrib:
                self.assertIn(e.attrib["href"][1:], ids)
            if "data-edge" in e.attrib:
                self.assertNotIn("marker-end", e.attrib)

    def test_hierarchy_exports_have_same_nodes_and_parent_links(self):
        tree = self.add(
            "Tree",
            "tree",
            data={
                "items": [str(self.a.id), str(self.b.id)],
                "parents": {str(self.b.id): str(self.a.id)},
            },
        )
        value = self.graph(tree).json()
        self.assertEqual(value["mode"], "hierarchy")
        self.assertEqual(len(value["nodes"]), 2)
        self.assertEqual(value["edges"][0]["source"], str(self.a.id))
        self.assertEqual(
            len(
                [
                    e
                    for e in ET.fromstring(self.export(tree).content).iter()
                    if "data-node" in e.attrib
                ]
            ),
            2,
        )

    def test_reader_exports_remove_private_nodes_edges_and_labels(self):
        secret = self.add("Hidden person", visibility="private")
        Connection.objects.create(
            world=self.world,
            source=self.a,
            target=secret,
            kind="parent",
            label="Secret edge",
            visibility="public",
        )
        view = self.view()
        for r in (self.a, self.b, view):
            self.publish(r)
        for format in ("svg", "html", "json"):
            text = self.export(view, format, True).content.decode()
            for hidden in (
                "Hidden person",
                "Secret edge",
                str(secret.id),
                "Secret edge notes",
            ):
                self.assertNotIn(hidden, text)

    def test_invalid_definitions_and_foreign_roots(self):
        other = World.objects.create(owner=self.user, name="Other")
        foreign = save_resource(other, {"title": "Foreign"})
        for data in (
            {"mode": "bad"},
            {"depth": 31},
            {"adoptive": "false"},
            {"tags": "bad"},
            {"root_id": str(foreign.id)},
            {
                "root_id": str(self.a.id),
                "partner_id": str(self.a.id),
                "direction": "descendants",
            },
            {"unknown": True},
        ):
            with self.assertRaises((ValueError, TypeError)):
                self.add("Bad", "relationship", data=data)

    def test_export_auth_ownership_unpublished_trash_and_unknown_format(self):
        view = self.view()
        self.assertEqual(self.export(view, reader=True).status_code, 404)
        self.assertEqual(self.export(view, "png").status_code, 400)
        self.assertEqual(self.export(self.a).status_code, 404)
        view.deleted_at = timezone.now()
        view.save()
        self.assertEqual(self.export(view).status_code, 404)
        outsider = User.objects.create_user("outsider")
        world = World.objects.create(owner=outsider, name="Other")
        foreign = save_resource(world, {"title": "Foreign", "kind": "relationship"})
        self.assertEqual(self.export(foreign).status_code, 404)
        self.client.logout()
        self.assertEqual(self.graph(view).status_code, 401)

    def test_download_headers_are_attachment_and_no_store(self):
        view = self.view()
        for format, content in [
            ("svg", "image/svg+xml"),
            ("html", "text/html"),
            ("json", "application/json"),
        ]:
            response = self.export(view, format)
            self.assertEqual(response.status_code, 200)
            self.assertIn(content, response["Content-Type"])
            self.assertIn("attachment;", response["Content-Disposition"])
            self.assertIn("." + format, response["Content-Disposition"])
            self.assertEqual(response["Cache-Control"], "no-store")

    def test_oversized_export_requires_filtering(self):
        view = self.view()
        with patch(
            "studio.relationship_views.relationship_view",
            return_value={"nodes": [{}] * 5001},
        ):
            self.assertEqual(self.export(view).status_code, 413)

    def test_archive_remaps_saved_roots_and_preserves_published_filters(self):
        view = self.view(direction="descendants", partner_id=str(self.c.id))
        self.publish(view)
        restored = import_world_archive(self.user, world_archive(self.world))
        other = restored.resources.get(kind="relationship")
        self.assertEqual(
            other.data["root_id"], str(restored.resources.get(title="A").id)
        )
        self.assertEqual(
            other.data["partner_id"], str(restored.resources.get(title="C").id)
        )
        self.assertEqual(other.published["data"], other.data)

    def test_stale_update_and_revision_restore_preserve_saved_filters(self):
        view = self.view()
        original = dict(view.data)
        view = self.update(view, data={"mode": "all"})
        response = self.client.patch(
            f"/api/resources/{view.id}",
            json.dumps({"data": {"mode": "diplomacy"}, "expected_revision": 1}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        response = self.client.post(
            f"/api/resources/{view.id}/restore",
            json.dumps({"number": 1, "expected_revision": view.revision}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"], original)
