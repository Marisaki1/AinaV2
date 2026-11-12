import io
import json
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, Client, override_settings
from PIL import Image
from .models import World, Resource, Connection
from .services import (
    save_resource,
    serialize,
    world_archive,
    import_world_archive,
    checked_archive,
    pack_archive,
    store_asset,
)
from .documents import from_source, render
from .tools import dice_roll, weighted, date_info, calculate


def document(text):
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


def picture():
    stream = io.BytesIO()
    Image.new("RGB", (24, 16), "#2e5b47").save(stream, format="PNG")
    stream.seek(0)
    stream.name = "map.png"
    return stream


@override_settings(ALLOWED_HOSTS=["testserver", "127.0.0.1", "localhost"])
class WorkspaceTests(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.override = override_settings(MEDIA_ROOT=Path(self.temp.name))
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.user = User.objects.create_user("owner", password="test-password")
        self.world = World.objects.create(owner=self.user, name="Test world")
        self.client.force_login(self.user)

    def send(self, url, data=None, method="post"):
        return getattr(self.client, method)(
            "/api" + url, data=json.dumps(data or {}), content_type="application/json"
        )

    def create(self, **fields):
        return save_resource(self.world, {"title": "Test entry", **fields})

    def test_anonymous_has_no_world_data(self):
        anonymous = Client()
        self.assertEqual(anonymous.get("/api/worlds").status_code, 401)
        self.assertNotIn("worlds", anonymous.get("/api/bootstrap").json())

    def test_foreign_world_and_entry_are_unavailable(self):
        other = User.objects.create_user("other")
        world = World.objects.create(owner=other, name="Other")
        entry = save_resource(world, {"title": "Hidden"})
        self.assertEqual(self.client.get(f"/api/worlds/{world.id}").status_code, 404)
        self.assertEqual(self.client.get(f"/api/resources/{entry.id}").status_code, 404)
        self.assertEqual(
            self.send(f"/worlds/{world.id}/resources", {"title": "Bad"}).status_code,
            404,
        )

    def test_create_edit_revisions_and_conflict(self):
        r = self.create(document=document("Original"))
        response = self.send(
            f"/resources/{r.id}", {"title": "Updated", "expected_revision": 1}, "patch"
        )
        self.assertEqual(response.status_code, 200, response.content)
        stale = self.send(
            f"/resources/{r.id}", {"title": "Stale", "expected_revision": 1}, "patch"
        )
        self.assertEqual(stale.status_code, 409)
        r.refresh_from_db()
        self.assertEqual(r.title, "Updated")
        self.assertEqual(r.revision, 2)
        self.assertEqual(r.revisions.count(), 2)

    def test_missing_revision_cannot_overwrite(self):
        r = self.create()
        self.assertEqual(
            self.send(
                f"/resources/{r.id}", {"title": "Overwrite"}, "patch"
            ).status_code,
            409,
        )

    def test_restore_is_a_new_revision(self):
        r = self.create(title="Before")
        self.send(
            f"/resources/{r.id}", {"title": "After", "expected_revision": 1}, "patch"
        )
        response = self.send(
            f"/resources/{r.id}/restore", {"number": 1, "expected_revision": 2}
        )
        self.assertEqual(response.status_code, 200, response.content)
        r.refresh_from_db()
        self.assertEqual(r.title, "Before")
        self.assertEqual(r.revision, 3)

    def test_soft_delete_and_restore(self):
        r = self.create()
        self.assertEqual(
            self.send(
                f"/resources/{r.id}", {"expected_revision": 1}, "delete"
            ).status_code,
            200,
        )
        self.assertEqual(
            len(
                self.client.get(f"/api/worlds/{self.world.id}/resources").json()[
                    "resources"
                ]
            ),
            0,
        )
        self.assertEqual(
            len(
                self.client.get(
                    f"/api/worlds/{self.world.id}/resources?trash=1"
                ).json()["resources"]
            ),
            1,
        )
        response = self.send(f"/resources/{r.id}/restore", {"expected_revision": 2})
        self.assertEqual(response.status_code, 200, response.content)
        r.refresh_from_db()
        self.assertIsNone(r.deleted_at)

    def test_parent_cycles_and_foreign_parents_rejected(self):
        a = self.create(title="Parent", kind="folder")
        b = self.create(title="Child", parent=str(a.id))
        response = self.send(
            f"/resources/{a.id}", {"parent": str(b.id), "expected_revision": 1}, "patch"
        )
        self.assertEqual(response.status_code, 400)
        b.refresh_from_db()
        self.assertEqual(b.parent_id, a.id)

    def test_alias_unicode_and_body_search(self):
        r = self.create(
            title="霊夢",
            aliases=["Reimu", "Hakurei"],
            document=document("A quiet shrine."),
        )
        for query in ["霊", "Rei", "quiet", "Hakurei"]:
            rows = self.client.get(
                f"/api/worlds/{self.world.id}/resources", {"q": query}
            ).json()["resources"]
            self.assertEqual([row["id"] for row in rows], [str(r.id)], query)

    def test_cross_world_reference_rejected(self):
        other = World.objects.create(owner=self.user, name="Elsewhere")
        r = save_resource(other, {"title": "Other"})
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "resourceLink",
                            "attrs": {"id": str(r.id), "label": "Other"},
                        }
                    ],
                }
            ],
        }
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/resources",
                {"title": "Bad link", "document": doc},
            ).status_code,
            400,
        )

    def test_reference_name_updates_and_backlinks(self):
        target = self.create(title="Old name")
        source = self.create(
            title="Source",
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "resourceLink",
                                "attrs": {"id": str(target.id), "label": "Old name"},
                            }
                        ],
                    }
                ],
            },
        )
        save_resource(self.world, {"title": "New name", "expected_revision": 1}, target)
        self.assertIn("New name", serialize(source)["html"])
        self.assertEqual(
            self.client.get(f"/api/resources/{target.id}").json()["backlinks"][0]["id"],
            str(source.id),
        )

    def test_reader_snapshot_excludes_secrets_and_new_drafts(self):
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Public fact"}],
                },
                {
                    "type": "privateBlock",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "Hidden twist"}],
                        }
                    ],
                },
            ],
        }
        r = self.create(
            title="Original",
            document=doc,
            visibility="public",
            private_notes="Secret motives",
        )
        self.assertEqual(
            self.send(
                f"/resources/{r.id}/publish", {"expected_revision": 1}
            ).status_code,
            200,
        )
        r.refresh_from_db()
        save_resource(
            self.world,
            {
                "title": "Unpublished title",
                "document": document("Unpublished text"),
                "expected_revision": 1,
            },
            r,
        )
        response = self.client.get(f"/api/resources/{r.id}?audience=reader")
        self.assertEqual(response.status_code, 200)
        raw = response.content.decode()
        self.assertIn("Public fact", raw)
        for secret in [
            "Hidden twist",
            "Secret motives",
            "Unpublished title",
            "Unpublished text",
        ]:
            self.assertNotIn(secret, raw)

    def test_reader_search_cannot_find_gm_notes(self):
        r = self.create(
            title="Public", private_notes="uniquesecret", visibility="public"
        )
        self.send(f"/resources/{r.id}/publish", {"expected_revision": 1})
        data = self.client.get(
            f"/api/worlds/{self.world.id}/resources",
            {"audience": "reader", "q": "uniquesecret"},
        ).json()
        self.assertEqual(data["resources"], [])

    def test_reader_map_hides_private_markers(self):
        r = self.create(
            kind="map",
            visibility="public",
            data={
                "markers": [
                    {
                        "id": "a",
                        "x": 0.2,
                        "y": 0.3,
                        "label": "Hidden pin",
                        "private": True,
                    },
                    {"id": "b", "x": 0.4, "y": 0.3, "label": "Village"},
                ]
            },
        )
        self.send(f"/resources/{r.id}/publish", {"expected_revision": 1})
        data = self.client.get(f"/api/resources/{r.id}?audience=reader").json()
        self.assertEqual(len(data["data"]["markers"]), 1)
        self.assertNotIn("Hidden pin", json.dumps(data))

    def test_reader_variables_use_published_values(self):
        term = self.create(
            kind="variable",
            title="Currency",
            visibility="public",
            data={"value": "copper"},
        )
        self.send(f"/resources/{term.id}/publish", {"expected_revision": 1})
        term.refresh_from_db()
        page = self.create(
            visibility="public",
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "variable",
                                "attrs": {"id": str(term.id), "label": "Currency"},
                            }
                        ],
                    }
                ],
            },
        )
        self.send(f"/resources/{page.id}/publish", {"expected_revision": 1})
        save_resource(
            self.world,
            {"data": {"value": "draft secret"}, "expected_revision": 1},
            term,
        )
        value = self.client.get(f"/api/resources/{page.id}?audience=reader").json()
        self.assertIn("copper", value["html"])
        self.assertNotIn("draft secret", json.dumps(value))

    def test_incomplete_formula_is_a_validation_error(self):
        response = self.send(
            f"/worlds/{self.world.id}/resources",
            {
                "title": "Invalid formula",
                "kind": "statblock",
                "data": {
                    "fields": {},
                    "formulas": [{"name": "test", "expression": "("}],
                },
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_malformed_module_details_are_rejected(self):
        for kind, data in [
            ("board", {"cards": {}}),
            ("board", {"cards": [None]}),
            ("board", {"cards": [], "connections": [None]}),
            ("map", {"layers": [None]}),
            ("map", {"markers": [{"id": "bad", "type": "polygon", "points": []}]}),
            ("template", {"fields": "oops"}),
            ("statblock", {"fields": []}),
            ("campaign", {"party": "oops"}),
        ]:
            self.assertEqual(
                self.send(
                    f"/worlds/{self.world.id}/resources",
                    {"title": "Bad data", "kind": kind, "data": data},
                ).status_code,
                400,
            )
        event = self.create(kind="event", data={"year": 1, "month": 1, "day": 1})
        self.assertEqual(
            self.send(
                f"/resources/{event.id}",
                {"data": "invalid", "expected_revision": 1},
                "patch",
            ).status_code,
            400,
        )

    def test_reorder_is_atomic_when_an_entry_is_stale(self):
        a = self.create(title="A", position=0)
        b = self.create(title="B", position=1)
        response = self.send(
            f"/worlds/{self.world.id}/reorder",
            {
                "entries": [
                    {"id": str(a.id), "position": 1, "revision": 1},
                    {"id": str(b.id), "position": 0, "revision": 0},
                ]
            },
        )
        self.assertEqual(response.status_code, 409)
        a.refresh_from_db()
        self.assertEqual(a.position, 0)
        self.assertEqual(a.revision, 1)
        response = self.send(
            f"/worlds/{self.world.id}/reorder",
            {
                "entries": [
                    {"id": str(a.id), "position": 1, "revision": 1},
                    {"id": str(b.id), "position": 0, "revision": 1},
                ]
            },
        )
        self.assertEqual(response.status_code, 200)
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual((a.position, b.position), (1, 0))

    def test_custom_template_required_fields_checked_on_reader_version(self):
        template = self.create(
            kind="template",
            data={"fields": [{"name": "Origin", "type": "text", "required": True}]},
        )
        page = self.create(template="custom:" + str(template.id), visibility="public")
        self.assertEqual(
            self.send(
                f"/resources/{page.id}/publish", {"expected_revision": 1}
            ).status_code,
            400,
        )
        page = save_resource(
            self.world,
            {"data": {"fields": {"Origin": "Mountain"}}, "expected_revision": 1},
            page,
        )
        self.assertEqual(
            self.send(
                f"/resources/{page.id}/publish", {"expected_revision": 2}
            ).status_code,
            200,
        )

    def test_malformed_link_marks_rejected_before_render(self):
        doc = document("bad")
        doc["content"][0]["content"][0]["marks"] = [
            {"type": "link", "attrs": {"href": 12}}
        ]
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/resources",
                {"title": "Bad link", "document": doc},
            ).status_code,
            400,
        )

    def test_reader_does_not_expose_a_private_reference_label(self):
        hidden = self.create(title="Secret identity")
        page = self.create(
            visibility="public",
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "resourceLink",
                                "attrs": {
                                    "id": str(hidden.id),
                                    "label": "Secret identity",
                                },
                            }
                        ],
                    }
                ],
            },
        )
        self.send(f"/resources/{page.id}/publish", {"expected_revision": 1})
        response = self.client.get(f"/api/resources/{page.id}?audience=reader")
        self.assertNotIn("Secret identity", response.content.decode())
        self.assertIn("Unavailable reference", response.content.decode())

    def test_structured_values_are_searchable(self):
        r = self.create(data={"fields": {"Occupation": "astrolinguist"}})
        rows = self.client.get(
            f"/api/worlds/{self.world.id}/resources", {"q": "astrolinguist"}
        ).json()["resources"]
        self.assertEqual([row["id"] for row in rows], [str(r.id)])

    def test_trashing_linked_entry_does_not_block_map_edits(self):
        location = self.create(title="Location")
        map_entry = self.create(
            kind="map",
            data={
                "markers": [
                    {"id": "pin", "x": 0.2, "y": 0.3, "link_id": str(location.id)}
                ]
            },
        )
        self.send(f"/resources/{location.id}", {"expected_revision": 1}, "delete")
        self.assertEqual(
            self.send(
                f"/resources/{map_entry.id}",
                {"title": "Still editable", "expected_revision": 1},
                "patch",
            ).status_code,
            200,
        )

    def test_table_dice_column_is_rolled(self):
        table = self.create(
            kind="table",
            data={
                "columns": [{"id": "dice", "label": "Treasure", "type": "dice"}],
                "rows": [{"id": "a", "weight": 1, "cells": {"dice": "2d6+3"}}],
            },
        )
        response = self.send(f"/resources/{table.id}/roll")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(5 <= response.json()["result"]["rolled"]["dice"]["total"] <= 15)

    def test_portable_readable_export_contains_fields_notes_and_links(self):
        target = self.create(title="Target")
        self.create(
            title="Exported page",
            private_notes="A private clue",
            data={"fields": {"Origin": "Mountain"}},
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "resourceLink",
                                "attrs": {"id": str(target.id), "label": "Target"},
                            }
                        ],
                    }
                ],
            },
        )
        archive, _ = checked_archive(world_archive(self.world))
        html = archive.read("readable.html").decode()
        for value in [
            "A private clue",
            "Mountain",
            "#entry-" + str(target.id),
            "Private owner export",
        ]:
            self.assertIn(value, html)

    def test_document_does_not_execute_markup(self):
        doc = from_source(
            '<script>alert(1)</script><p><a href="javascript:alert(2)">bad</a><img src="https://evil.test/track"></p>',
            "html",
        )
        html = render(doc)
        self.assertNotIn("<script", html)
        self.assertNotIn("javascript:", html)
        self.assertIn('src="https://evil.test/track"', html)
        self.assertIn('referrerpolicy="no-referrer"', html)

    def test_nested_document_limits(self):
        doc = document("x")
        for _ in range(35):
            doc = {"type": "blockquote", "content": [doc]}
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/resources",
                {"title": "Too nested", "document": {"type": "doc", "content": [doc]}},
            ).status_code,
            400,
        )

    def test_invalid_heading_level(self):
        doc = {
            "type": "doc",
            "content": [{"type": "heading", "attrs": {"level": "bad"}}],
        }
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/resources", {"title": "Bad", "document": doc}
            ).status_code,
            400,
        )

    def test_nonfinite_json_rejected(self):
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/resources",
                {"title": "NaN", "data": {"value": float("nan")}},
            ).status_code,
            400,
        )

    def test_map_geometry_validation(self):
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/resources",
                {
                    "title": "Map",
                    "kind": "map",
                    "data": {"markers": [{"id": "a", "x": 8, "y": 0.5}]},
                },
            ).status_code,
            400,
        )

    def test_connections_prevent_ancestry_cycles(self):
        a, b, c = [self.create(title=n) for n in ["A", "B", "C"]]
        for source, target in [(a, b), (b, c)]:
            self.assertEqual(
                self.send(
                    f"/worlds/{self.world.id}/connections",
                    {
                        "source": str(source.id),
                        "target": str(target.id),
                        "kind": "parent",
                    },
                ).status_code,
                201,
            )
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/connections",
                {"source": str(c.id), "target": str(a.id), "kind": "parent"},
            ).status_code,
            400,
        )

    def test_real_image_upload_deduplicates(self):
        a = store_asset(self.world, picture())
        b = store_asset(self.world, picture())
        self.assertEqual(a.id, b.id)
        response = self.client.get("/media/" + str(a.id))
        self.assertEqual(response.status_code, 200)
        b"".join(response.streaming_content)
        response.close()
        anon = Client()
        self.assertEqual(anon.get("/media/" + str(a.id)).status_code, 401)

    def test_fake_image_rejected(self):
        response = self.client.post(
            f"/api/worlds/{self.world.id}/assets",
            {
                "file": SimpleUploadedFile(
                    "fake.png", b"<script>bad</script>", content_type="image/png"
                )
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_csv_quotes_and_bad_rows(self):
        result = self.send("/tools/csv", {"text": 'Name,Note\nShrine,"two, places"'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(result.json()["rows"]), 1)
        self.assertEqual(
            self.send("/tools/csv", {"text": "A,B\nmissing"}).status_code, 400
        )

    def test_dice_api_persists_result(self):
        result = self.send(
            "/tools/dice", {"world_id": str(self.world.id), "formula": "2d6+3"}
        )
        self.assertEqual(result.status_code, 200)
        self.assertTrue(5 <= result.json()["total"] <= 15)
        self.assertEqual(self.world.activities.filter(kind="roll").count(), 1)

    def test_import_is_previewed_and_source_preserved(self):
        root = Path(self.temp.name) / "campaign"
        folder = root / "DM Notes"
        folder.mkdir(parents=True)
        file = folder / "extensionless"
        file.write_text("# Secret\nKeep this quiet.", encoding="utf-8")
        original = file.read_bytes()
        with patch("studio.importing.source_root", return_value=root):
            scan = self.send("/import/scan", {"folders": ["DM Notes"]})
            self.assertEqual(scan.status_code, 200, scan.content)
            row = scan.json()["files"][0]
            response = self.send(f"/worlds/{self.world.id}/import", {"files": [row]})
            self.assertEqual(response.status_code, 200, response.content)
            entry = Resource.objects.get(id=response.json()["created"][0])
            self.assertEqual(entry.visibility, "private")
            self.assertEqual(entry.kind, "note")
            self.assertEqual(
                self.send(f"/worlds/{self.world.id}/import", {"files": [row]}).json()[
                    "created"
                ],
                [],
            )
        self.assertEqual(file.read_bytes(), original)

    def test_changed_import_source_rejected(self):
        root = Path(self.temp.name) / "campaign"
        folder = root / "Tower"
        folder.mkdir(parents=True)
        file = folder / "room"
        file.write_text("Before")
        with patch("studio.importing.source_root", return_value=root):
            row = self.send("/import/scan", {"folders": ["Tower"]}).json()["files"][0]
            file.write_text("After")
            self.assertEqual(
                self.send(
                    f"/worlds/{self.world.id}/import", {"files": [row]}
                ).status_code,
                409,
            )

    def test_import_path_escape_rejected(self):
        self.assertEqual(
            self.send(
                f"/worlds/{self.world.id}/import",
                {"files": [{"path": "../outside", "digest": "x"}]},
            ).status_code,
            400,
        )

    def test_world_archive_round_trip_including_published_snapshot(self):
        asset = store_asset(self.world, picture())
        folder = self.create(title="Folder", kind="folder")
        a = self.create(
            title="Shrine",
            parent=str(folder.id),
            visibility="public",
            data={"asset_id": str(asset.id)},
        )
        self.send(f"/resources/{a.id}/publish", {"expected_revision": 1})
        a.refresh_from_db()
        save_resource(self.world, {"title": "Draft shrine", "expected_revision": 1}, a)
        b = self.create(
            title="Person",
            document={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "resourceLink",
                                "attrs": {"id": str(a.id), "label": "Shrine"},
                            }
                        ],
                    }
                ],
            },
        )
        Connection.objects.create(world=self.world, source=b, target=a, kind="visits")
        restored = import_world_archive(self.user, world_archive(self.world))
        self.assertEqual(restored.resources.count(), 3)
        self.assertEqual(restored.assets.count(), 1)
        self.assertEqual(restored.connections.count(), 1)
        shrine = restored.resources.get(title="Draft shrine")
        self.assertEqual(shrine.published["title"], "Shrine")
        self.assertEqual(shrine.parent.title, "Folder")
        self.assertNotEqual(shrine.data["asset_id"], str(asset.id))
        person = restored.resources.get(title="Person")
        self.assertIn(str(shrine.id), json.dumps(person.document))

    def test_archive_integrity_rejects_corruption(self):
        data = pack_archive({"world.json": b"{}"}, "worldbuilder-world-v1")
        original = zipfile.ZipFile(io.BytesIO(data))
        files = {n: original.read(n) for n in original.namelist()}
        files["world.json"] = b"corrupt"
        result = io.BytesIO()
        with zipfile.ZipFile(result, "w") as archive:
            for n, v in files.items():
                archive.writestr(n, v)
        with self.assertRaises(ValueError):
            checked_archive(result.getvalue())

    def test_calendar_archive_preserves_dates_after_definition_changes(self):
        cal = self.create(
            kind="calendar",
            data={
                "months": [{"name": "Moon " + str(n), "days": 31} for n in range(5)],
                "weekdays": ["Sun", "Moon"],
            },
        )
        event = self.create(
            kind="event",
            visibility="public",
            data={"calendar_id": str(cal.id), "year": 8, "month": 5, "day": 31},
        )
        self.send(f"/resources/{event.id}/publish", {"expected_revision": 1})
        save_resource(
            self.world,
            {
                "data": {
                    "months": [{"name": "Short moon", "days": 20}],
                    "weekdays": ["Sun", "Moon"],
                },
                "expected_revision": 1,
            },
            cal,
        )
        save_resource(
            self.world,
            {"title": "Recorded date retained", "expected_revision": 1},
            event,
        )
        restored = import_world_archive(self.user, world_archive(self.world))
        saved = restored.resources.get(kind="event")
        self.assertEqual((saved.data["month"], saved.data["day"]), (5, 31))
        self.assertEqual(saved.published["data"]["day"], 31)
        self.assertNotEqual(saved.data["calendar_id"], str(cal.id))

    def test_archive_rejects_unsafe_paths(self):
        data = pack_archive({"../outside": b"bad"}, "worldbuilder-world-v1")
        with self.assertRaises(ValueError):
            checked_archive(data)

    def test_csrf_is_enforced(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        self.assertEqual(
            client.post(
                "/api/worlds", data='{"name":"Bad"}', content_type="application/json"
            ).status_code,
            403,
        )

    def test_invalid_host_and_nonlocal_request(self):
        self.assertEqual(
            self.client.get("/api/bootstrap", HTTP_HOST="evil.test").status_code, 400
        )
        self.assertEqual(
            self.client.get("/api/bootstrap", REMOTE_ADDR="192.0.2.10").status_code, 403
        )

    def test_plain_markdown_retains_headings_and_tables(self):
        doc = from_source(
            "# A place\n\n**Strong** text\n\n| A | B |\n|---|---|\n| One | Two |"
        )
        html = render(doc)
        self.assertIn("<h1>", html)
        self.assertIn("<strong>", html)
        self.assertIn("<table>", html)
        self.assertIn("Two", html)


class RulesTests(TestCase):
    def test_dice_limits_and_keep(self):
        for formula in ["d20", "4d6kh3", "4d6kl2", "d%", "4dF", "2d8-1"]:
            result = dice_roll(formula)
            self.assertEqual(
                result["total"],
                sum(result["rolls"][i] for i in result["kept"]) + result["modifier"],
            )
        for formula in ["1000d6", "1d0", "4d6kh7", '__import__("os")', "2**10000"]:
            with self.assertRaises(ValueError):
                dice_roll(formula)

    def test_weighted_zero_and_determinism(self):
        rows = [{"value": "never", "weight": 0}, {"value": "yes", "weight": 1}]
        for seed in range(20):
            self.assertEqual(weighted(rows, seed)["value"], "yes")
        with self.assertRaises(ValueError):
            weighted([{"weight": 0}])

    def test_expression_engine(self):
        self.assertEqual(calculate("floor((strength - 10) / 2)", {"strength": 16}), 3)
        for expression in ['__import__("os")', "(1).__class__", "2**9999", "1/0"]:
            with self.assertRaises(ValueError):
                calculate(expression, {})

    def test_custom_calendar_leap_and_negative_years(self):
        data = {
            "months": [{"name": "Snow", "days": 30}, {"name": "Blossom", "days": 30}],
            "weekdays": ["A", "B", "C"],
            "leap_every": 4,
            "leap_month": 2,
        }
        self.assertEqual(date_info(data, 4, 2, 31)["month_lengths"], [30, 31])
        with self.assertRaises(ValueError):
            date_info(data, 3, 2, 31)
        self.assertEqual(date_info(data, 0)["ordinal"], 0)
        self.assertLess(date_info(data, -1)["ordinal"], 0)
        self.assertEqual(
            date_info(data, 5)["ordinal"] - date_info(data, 4)["ordinal"], 61
        )
        self.assertEqual(
            date_info(data, 0)["ordinal"] - date_info(data, -1)["ordinal"], 60
        )


@override_settings(ALLOWED_HOSTS=["testserver", "127.0.0.1", "localhost"])
class SetupTests(TestCase):
    def test_first_run_and_repeat_setup(self):
        client = Client()
        response = client.post(
            "/api/setup",
            data=json.dumps(
                {
                    "name": "Marisaki",
                    "world_name": "Gensokyo",
                    "password": "a-strong-password",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(client.get("/api/bootstrap").json()["authenticated"])
        self.assertEqual(
            client.post(
                "/api/setup", data="{}", content_type="application/json"
            ).status_code,
            409,
        )

    def test_short_password_does_not_create_workspace(self):
        response = self.client.post(
            "/api/setup",
            data=json.dumps({"name": "Owner", "password": "bad"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.exists())
