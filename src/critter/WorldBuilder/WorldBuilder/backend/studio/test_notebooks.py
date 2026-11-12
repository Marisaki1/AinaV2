import copy
import json
import tempfile
import uuid
from pathlib import Path

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import Resource, World
from .notebooks import act, audit, desk, export_book
from .services import (
    import_world_archive,
    save_resource,
    serialize,
    snapshot,
    world_archive,
)


class NotebookTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("notebook-owner")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Notebook QA")
        self.note = self.add(
            "Original note", "note", "A long original with a silver clue."
        )
        self.second = self.add("Another note", "note", "Unfiled source")
        self.section = str(uuid.uuid4())
        self.child = str(uuid.uuid4())
        result = act(
            self.world,
            {
                "action": "book",
                "title": "GM secret notebook",
                "sections": [
                    self.section_row(
                        self.section, "GM hidden section", [str(self.note.id)]
                    ),
                    self.section_row(self.child, "Child", [], self.section),
                ],
            },
        )
        self.book = Resource.objects.get(id=result["entry"]["id"])
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=Path(self.temp.name))
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def add(self, title, kind="article", text="", **data):
        document = (
            {
                "type": "doc",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": text}]}
                ],
            }
            if text
            else {"type": "doc", "content": [{"type": "paragraph"}]}
        )
        return save_resource(
            self.world,
            {"title": title, "kind": kind, "document": document, "data": data},
        )

    def section_row(self, id, title, entries, parent=""):
        return {"id": id, "title": title, "parent_id": parent, "entry_ids": entries}

    def update(self, row, **data):
        row.refresh_from_db()
        return save_resource(
            self.world,
            {"data": {**row.data, **data}, "expected_revision": row.revision},
            row,
        )

    def capture(self, **more):
        return act(
            self.world,
            {
                "action": "capture",
                "capture_key": str(uuid.uuid4()),
                "book_id": str(self.book.id),
                "section_id": self.section,
                "expected_revision": self.book.revision,
                "title": "Captured",
                "text": "New text",
                **more,
            },
        )

    def file(self, **more):
        return act(
            self.world,
            {
                "action": "file",
                "book_id": str(self.book.id),
                "section_id": self.child,
                "expected_revision": self.book.revision,
                "entries": [{"id": str(self.note.id), "revision": self.note.revision}],
                **more,
            },
        )

    def publish(self, row):
        row.refresh_from_db()
        row.visibility = "public"
        row.published = {**snapshot(row), "_revision": row.revision}
        row.save(update_fields=["visibility", "published"])

    def test_notebook_sections_are_versioned_database_references(self):
        self.assertEqual(
            self.book.data["notebook_sections"][0]["entry_ids"], [str(self.note.id)]
        )
        self.assertEqual(self.book.visibility, "private")
        self.assertTrue(self.book.revisions.exists())

    def test_filing_in_another_section_does_not_copy_or_edit_original(self):
        count = Resource.objects.count()
        original = copy.deepcopy(snapshot(self.note))
        self.file()
        self.book.refresh_from_db()
        self.note.refresh_from_db()
        self.assertEqual(Resource.objects.count(), count)
        self.assertEqual(snapshot(self.note), original)
        self.assertEqual(
            self.book.data["notebook_sections"][1]["entry_ids"], [str(self.note.id)]
        )

    def test_move_references_keeps_source_uuid_and_removes_previous_membership(self):
        self.file(move=True)
        self.book.refresh_from_db()
        self.assertEqual(self.book.data["notebook_sections"][0]["entry_ids"], [])
        self.assertEqual(
            self.book.data["notebook_sections"][1]["entry_ids"], [str(self.note.id)]
        )

    def test_unfile_preserves_original_and_returns_it_to_inbox(self):
        self.file(action="unfile")
        self.book.refresh_from_db()
        self.assertTrue(
            Resource.objects.filter(id=self.note.id, deleted_at=None).exists()
        )
        value = desk(self.world, {"view": "inbox"})
        self.assertIn(str(self.note.id), [v["id"] for v in value["results"]])

    def test_section_cycles_missing_parents_and_duplicate_ids_reject(self):
        for sections in (
            [
                self.section_row(self.section, "A", [], self.child),
                self.section_row(self.child, "B", [], self.section),
            ],
            [self.section_row(self.section, "A", [], str(uuid.uuid4()))],
            [
                self.section_row(self.section, "A", []),
                self.section_row(self.section, "B", []),
            ],
        ):
            with self.assertRaises(ValueError):
                self.update(self.book, notebook_sections=sections)

    def test_foreign_references_and_notebook_self_filing_reject(self):
        other = World.objects.create(owner=self.user, name="Other")
        foreign = save_resource(other, {"title": "Foreign note", "kind": "note"})
        for id in (str(foreign.id), str(self.book.id)):
            with self.assertRaises(ValueError):
                self.update(
                    self.book,
                    notebook_sections=[self.section_row(self.section, "No", [id])],
                )

    def test_deleted_original_placeholder_retained_but_cannot_newly_file(self):
        Resource.objects.filter(id=self.note.id).update(deleted_at=timezone.now())
        self.update(self.book, note_starred=True)
        self.assertEqual(
            desk(self.world, {"book": str(self.book.id)})["unavailable"], 1
        )
        with self.assertRaises(ValueError):
            self.file()

    def test_deleted_notebook_releases_inbox_membership_without_deleting_notes(self):
        Resource.objects.filter(id=self.book.id).update(deleted_at=timezone.now())
        self.assertIn(
            str(self.note.id),
            [v["id"] for v in desk(self.world, {"view": "inbox"})["results"]],
        )

    def test_quick_capture_is_private_and_atomically_filed(self):
        result = self.capture()
        note = Resource.objects.get(id=result["entry"]["id"])
        self.book.refresh_from_db()
        self.assertIn(str(note.id), self.book.data["notebook_sections"][0]["entry_ids"])
        self.assertEqual(note.visibility, "private")
        self.assertIsNone(note.published)
        self.assertIn("New text", json.dumps(note.document))

    def test_stale_capture_leaves_no_orphan_note(self):
        count = Resource.objects.count()
        with self.assertRaises(ValueError):
            self.capture(expected_revision=0)
        self.assertEqual(Resource.objects.count(), count)

    def test_capture_replay_returns_same_original_and_writes_once(self):
        key = str(uuid.uuid4())
        first = self.capture(capture_key=key)
        count = Resource.objects.count()
        second = self.capture(capture_key=key)
        self.assertEqual(first["entry"]["id"], second["entry"]["id"])
        self.assertTrue(second["replayed"])
        self.assertEqual(Resource.objects.count(), count)

    def test_capture_key_cannot_be_reused_for_different_text(self):
        key = str(uuid.uuid4())
        self.capture(capture_key=key)
        with self.assertRaises(ValueError):
            self.capture(capture_key=key, text="Different text")

    def test_blank_title_derives_first_line(self):
        result = self.capture(title="", text="First clue\nMore context")
        self.assertEqual(result["entry"]["title"], "First clue")

    def test_template_copies_rich_document_schema_and_defaults(self):
        schema = [{"id": str(uuid.uuid4()), "label": "Confidence", "type": "number"}]
        result = act(
            self.world,
            {
                "action": "template",
                "title": "Investigation preset",
                "source_id": str(self.note.id),
                "schema": schema,
                "defaults": {
                    "tags": ["clue"],
                    "category": "investigation",
                    "related_entries": [str(self.second.id)],
                },
            },
        )
        template = Resource.objects.get(id=result["entry"]["id"])
        captured = self.capture(
            template_id=str(template.id),
            text="",
            tags=["clue"],
            category="investigation",
        )["entry"]
        self.assertEqual(captured["document"], self.note.document)
        self.assertEqual(captured["data"]["note_schema"], schema)
        self.assertEqual(captured["data"]["note_template_source"], str(template.id))
        self.assertEqual(captured["tags"], ["clue"])
        template = self.update(template, note_schema=[])
        original = Resource.objects.get(id=captured["id"])
        self.assertEqual(original.data["note_schema"], schema)

    def test_template_preset_has_editable_sections_without_publication(self):
        note = self.capture(preset="npc-conversation")["entry"]
        self.assertIn("Promises and questions", json.dumps(note["document"]))
        self.assertEqual(note["visibility"], "private")

    def test_metadata_and_favorite_update_preserve_rich_document(self):
        before = copy.deepcopy(self.note.document)
        field = str(uuid.uuid4())
        result = act(
            self.world,
            {
                "action": "metadata",
                "id": str(self.note.id),
                "expected_revision": self.note.revision,
                "tags": ["clue"],
                "data": {
                    "note_starred": True,
                    "note_schema": [
                        {"id": field, "label": "Confidence", "type": "number"}
                    ],
                    "note_values": {field: 0.75},
                    "note_category": "fact",
                },
            },
        )
        self.assertEqual(result["entry"]["document"], before)
        self.assertEqual(result["entry"]["data"]["note_values"][field], 0.75)
        self.assertIn(
            str(self.note.id),
            [v["id"] for v in desk(self.world, {"view": "favorites"})["results"]],
        )

    def test_metadata_types_and_unknown_fields_reject(self):
        field = str(uuid.uuid4())
        for typ, value in (
            ("number", True),
            ("number", float("inf")),
            ("check", "yes"),
            ("text", 123),
        ):
            with self.subTest(typ=typ), self.assertRaises(ValueError):
                self.update(
                    self.note,
                    note_schema=[{"id": field, "label": "Field", "type": typ}],
                    note_values={field: value},
                )
        with self.assertRaises(ValueError):
            self.update(self.note, note_values={field: "unknown schema"})

    def test_duplicate_metadata_names_reject(self):
        with self.assertRaises(ValueError):
            self.update(
                self.note,
                note_schema=[
                    {"id": str(uuid.uuid4()), "label": "Status", "type": "text"},
                    {"id": str(uuid.uuid4()), "label": "status", "type": "text"},
                ],
            )

    def test_question_knowledge_index_and_resolution(self):
        self.note = self.update(
            self.note,
            note_category="question",
            note_question_status="open",
            related_entries=[str(self.second.id)],
        )
        self.assertEqual(desk(self.world, {"view": "knowledge"})["total"], 1)
        self.note = self.update(self.note, note_question_status="resolved")
        self.assertEqual(
            desk(self.world, {"view": "knowledge"})["results"][0]["data"][
                "note_question_status"
            ],
            "resolved",
        )

    def test_search_full_body_and_match_excerpt_past_summary(self):
        text = "Beginning " + ("background " * 100) + "unique silver lantern clue"
        self.note = save_resource(
            self.world,
            {
                "document": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": text}],
                        }
                    ],
                },
                "expected_revision": self.note.revision,
            },
            self.note,
        )
        result = desk(self.world, {"q": "unique silver lantern clue"})
        self.assertEqual(result["total"], 1)
        self.assertIn(
            "unique silver lantern clue", result["results"][0]["note_excerpt"]
        )

    def test_tag_metadata_and_campaign_filters(self):
        campaign = self.add("Campaign", "campaign")
        field = str(uuid.uuid4())
        self.note = self.update(
            self.note,
            campaign_id=str(campaign.id),
            note_schema=[{"id": field, "label": "Confidence", "type": "text"}],
            note_values={field: "certain"},
        )
        save_resource(
            self.world,
            {"tags": ["Evidence"], "expected_revision": self.note.revision},
            self.note,
        )
        self.assertEqual(
            desk(
                self.world,
                {
                    "tag": "evidence",
                    "campaign": str(campaign.id),
                    "metadata": "certain",
                },
            )["total"],
            1,
        )

    def test_section_filter_and_title_order_preserve_originals(self):
        value = desk(
            self.world,
            {"book": str(self.book.id), "section": self.section, "sort": "section"},
        )
        self.assertEqual([v["id"] for v in value["results"]], [str(self.note.id)])
        with self.assertRaises(ValueError):
            desk(self.world, {"book": str(self.book.id), "section": str(uuid.uuid4())})

    def test_bulk_stale_note_rolls_back_every_selected_original(self):
        with self.assertRaises(ValueError):
            act(
                self.world,
                {
                    "action": "bulk",
                    "add_tags": ["new"],
                    "starred": True,
                    "entries": [
                        {"id": str(self.note.id), "revision": 1},
                        {"id": str(self.second.id), "revision": 0},
                    ],
                },
            )
        self.note.refresh_from_db()
        self.assertFalse(self.note.tags)
        self.assertNotIn("note_starred", self.note.data)

    def test_bulk_tags_and_favorites_do_not_duplicate_originals(self):
        count = Resource.objects.count()
        act(
            self.world,
            {
                "action": "bulk",
                "add_tags": ["review"],
                "starred": True,
                "entries": [
                    {"id": str(self.note.id), "revision": 1},
                    {"id": str(self.second.id), "revision": 1},
                ],
            },
        )
        self.assertEqual(Resource.objects.count(), count)
        self.assertEqual(
            desk(self.world, {"view": "favorites", "tag": "review"})["total"], 2
        )

    def test_board_cards_edges_positions_and_references_are_versioned(self):
        a, b = str(uuid.uuid4()), str(uuid.uuid4())
        edge = str(uuid.uuid4())
        board = {
            "cards": [
                {
                    "id": a,
                    "entry_id": str(self.note.id),
                    "x": 15.5,
                    "y": 50,
                    "caption": "My annotation",
                    "color": "#f5e9b9",
                },
                {
                    "id": b,
                    "entry_id": str(self.second.id),
                    "x": 300,
                    "y": 60,
                    "caption": "",
                    "color": "#ffffff",
                },
            ],
            "edges": [{"id": edge, "source": a, "target": b, "label": "Supports"}],
        }
        result = act(
            self.world,
            {
                "action": "board",
                "book_id": str(self.book.id),
                "expected_revision": self.book.revision,
                "board": board,
            },
        )
        self.assertEqual(result["entry"]["data"]["note_board"], board)
        self.assertEqual(Resource.objects.get(id=self.note.id).revision, 1)

    def test_board_invalid_edges_and_nonfinite_coordinates_reject(self):
        card = {
            "id": str(uuid.uuid4()),
            "entry_id": str(self.note.id),
            "x": 0,
            "y": 0,
            "caption": "",
            "color": "#ffffff",
        }
        for board in (
            {"cards": [{**card, "x": float("inf")}], "edges": []},
            {
                "cards": [card],
                "edges": [
                    {
                        "id": str(uuid.uuid4()),
                        "source": card["id"],
                        "target": str(uuid.uuid4()),
                        "label": "bad",
                    }
                ],
            },
        ):
            with self.assertRaises(ValueError):
                self.update(self.book, note_board=board)

    def test_audit_finds_missing_references_and_ambiguous_names(self):
        target = str(self.second.id)
        save_resource(
            self.world,
            {
                "document": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {
                                    "type": "resourceLink",
                                    "attrs": {"id": target, "label": "Unavailable"},
                                }
                            ],
                        }
                    ],
                },
                "expected_revision": self.note.revision,
            },
            self.note,
        )
        self.add("Original note", "note")
        Resource.objects.filter(id=self.second.id).update(deleted_at=timezone.now())
        value = audit(self.world)
        self.assertEqual(value["broken_total"], 1)
        self.assertTrue(any(r["name"] == "original note" for r in value["ambiguous"]))

    def test_reader_metadata_contains_no_notebook_sections_board_or_favorites(self):
        self.note = self.update(self.note, note_starred=True, note_category="question")
        self.publish(self.note)
        self.publish(self.book)
        encoded = json.dumps(
            [serialize(self.note, reader=True), serialize(self.book, reader=True)]
        )
        for secret in (
            "notebook_sections",
            "GM hidden section",
            "note_starred",
            "note_category",
        ):
            self.assertNotIn(secret, encoded)

    def test_published_export_uses_snapshot_and_omits_private_organization(self):
        self.publish(self.note)
        self.note = save_resource(
            self.world,
            {
                "document": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "UNPUBLISHED SECRET"}],
                        }
                    ],
                },
                "expected_revision": self.note.revision,
            },
            self.note,
        )
        exported = export_book(self.book)
        self.assertIn("silver clue", exported)
        for secret in (
            "UNPUBLISHED SECRET",
            "GM secret notebook",
            "GM hidden section",
            "Unfiled source",
        ):
            self.assertNotIn(secret, exported)

    def test_private_export_includes_owner_prose_and_escaped_titles(self):
        self.note = save_resource(
            self.world,
            {
                "title": "<script>alert(1)</script>",
                "private_notes": "GM notes",
                "expected_revision": 1,
            },
            self.note,
        )
        exported = export_book(self.book, private=True)
        self.assertIn("GM notes", exported)
        self.assertIn("&lt;script&gt;", exported)
        self.assertNotIn("<script>", exported)

    def test_owner_only_apis_and_authentication(self):
        url = f"/api/worlds/{self.world.id}/notebooks"
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.get(url, {"audience": "reader"}).status_code, 404)
        self.assertEqual(
            self.client.get(
                f"/api/worlds/{self.world.id}/note-audit", {"audience": "reader"}
            ).status_code,
            404,
        )
        self.client.logout()
        self.assertEqual(self.client.get(url).status_code, 401)

    def test_other_owner_cannot_access_or_export_notebook(self):
        other = User.objects.create_user("other-notebook-owner")
        self.client.force_login(other)
        self.assertEqual(
            self.client.get(f"/api/worlds/{self.world.id}/notebooks").status_code, 404
        )
        self.assertEqual(
            self.client.get(
                f"/api/resources/{self.book.id}/notebook-export"
            ).status_code,
            404,
        )

    def test_stale_api_capture_returns_409_without_writes(self):
        count = Resource.objects.count()
        response = self.client.post(
            f"/api/worlds/{self.world.id}/notebooks",
            json.dumps(
                {
                    "action": "capture",
                    "capture_key": str(uuid.uuid4()),
                    "book_id": str(self.book.id),
                    "section_id": self.section,
                    "expected_revision": 0,
                    "text": "No orphan",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Resource.objects.count(), count)

    def test_private_export_keeps_metadata_but_published_export_does_not(self):
        field = str(uuid.uuid4())
        self.note = self.update(
            self.note,
            note_schema=[{"id": field, "label": "Secret confidence", "type": "number"}],
            note_values={field: 0.85},
        )
        self.publish(self.note)
        self.assertIn("Secret confidence", export_book(self.book, private=True))
        self.assertNotIn("Secret confidence", export_book(self.book))

    def test_export_uses_one_anchor_for_an_original_filed_twice(self):
        self.file()
        self.book.refresh_from_db()
        exported = export_book(self.book, private=True)
        self.assertEqual(exported.count('id="entry-' + str(self.note.id) + '"'), 1)

    def test_published_export_strips_private_blocks(self):
        document = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Public clue"}],
                },
                {
                    "type": "privateBlock",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "GM hidden solution"}],
                        }
                    ],
                },
            ],
        }
        self.note = save_resource(
            self.world,
            {"document": document, "expected_revision": self.note.revision},
            self.note,
        )
        self.publish(self.note)
        self.assertNotIn("GM hidden solution", export_book(self.book))
        self.assertIn("GM hidden solution", export_book(self.book, private=True))

    def test_capture_rejects_foreign_campaign_session_without_orphan(self):
        campaign = self.add("Campaign", "campaign")
        other = self.add("Other campaign", "campaign")
        session = self.add("Other session", "session", campaign_id=str(other.id))
        count = Resource.objects.count()
        with self.assertRaises(ValueError):
            self.capture(campaign_id=str(campaign.id), session_id=str(session.id))
        self.assertEqual(Resource.objects.count(), count)

    def test_filing_into_other_notebook_keeps_one_original(self):
        section = str(uuid.uuid4())
        other = act(
            self.world,
            {
                "action": "book",
                "title": "Other notebook",
                "sections": [self.section_row(section, "Notes", [])],
            },
        )["entry"]
        count = Resource.objects.count()
        self.file(
            book_id=other["id"], section_id=section, expected_revision=other["revision"]
        )
        self.assertEqual(Resource.objects.count(), count)
        for book in (str(self.book.id), other["id"]):
            self.assertIn(
                str(self.note.id),
                [r["id"] for r in desk(self.world, {"book": book})["results"]],
            )

    def test_pagination_counts_and_pages_are_distinct(self):
        for i in range(102):
            self.add("Page note " + str(i), "note")
        first = desk(self.world, {"sort": "title"})
        second = desk(self.world, {"sort": "title", "offset": "100"})
        self.assertEqual(first["total"], 104)
        self.assertEqual(len(first["results"]), 100)
        self.assertEqual(len(second["results"]), 4)
        self.assertFalse(
            {r["id"] for r in first["results"]} & {r["id"] for r in second["results"]}
        )

    def test_notebook_archive_remaps_nested_sections_boards_and_templates(self):
        result = act(
            self.world,
            {
                "action": "template",
                "title": "Template",
                "source_id": str(self.note.id),
                "defaults": {"related_entries": [str(self.second.id)]},
            },
        )
        capture = self.capture(template_id=result["entry"]["id"])
        self.book.refresh_from_db()
        card = {
            "id": str(uuid.uuid4()),
            "entry_id": str(self.note.id),
            "x": 20,
            "y": 30,
            "caption": "Annotation",
            "color": "#ffffff",
        }
        self.book = self.update(self.book, note_board={"cards": [card], "edges": []})
        copied = import_world_archive(self.user, world_archive(self.world))
        note = copied.resources.get(title="Original note")
        book = copied.resources.get(title="GM secret notebook")
        template = copied.resources.get(title="Template")
        self.assertIn(str(note.id), book.data["notebook_sections"][0]["entry_ids"])
        self.assertEqual(book.data["note_board"]["cards"][0]["entry_id"], str(note.id))
        captured = copied.resources.get(title=capture["entry"]["title"])
        self.assertEqual(captured.data["note_template_source"], str(template.id))
