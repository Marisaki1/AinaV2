import copy
import json
from django.test import SimpleTestCase, TestCase
from django.contrib.auth.models import User
from .documents import render
from .models import World
from .services import save_resource, serialize, world_archive, import_world_archive


def doc(text, marks=None):
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": text,
                        **({"marks": marks} if marks else {}),
                    }
                ],
            }
        ],
    }


class AutomaticLinkTextTests(SimpleTestCase):
    refs = {
        "village": {
            "id": "village",
            "title": "Human Village",
            "aliases": ["Village"],
            "kind": "article",
        },
        "hero": {
            "id": "hero",
            "title": "Reimu Hakurei",
            "aliases": ["Reimu"],
            "kind": "character",
        },
    }

    def test_names_aliases_case_and_original_words(self):
        value = render(
            doc("REIMU visited the Human Village; Village life continues."),
            self.refs,
            auto_links=True,
        )
        self.assertEqual(value.count("auto-resource-link"), 3)
        self.assertIn(">REIMU</a>", value)
        self.assertIn('href="/#/entry/village"', value)

    def test_longest_name_not_nested_shorter_alias(self):
        value = render(doc("Human Village"), self.refs, auto_links=True)
        self.assertEqual(value.count("<a "), 1)
        self.assertIn(">Human Village</a>", value)

    def test_whole_word_boundaries_and_punctuation(self):
        value = render(
            doc("Reimu’s notes: (Village), Villager, SuperReimu, Reimu2."),
            self.refs,
            auto_links=True,
        )
        self.assertEqual(value.count("auto-resource-link"), 2)

    def test_ambiguous_names_are_plain_text(self):
        refs = {
            **self.refs,
            "other": {
                "id": "other",
                "title": "Village",
                "aliases": ["Human Village"],
                "kind": "article",
            },
        }
        value = render(doc("Village Human Village"), refs, auto_links=True)
        self.assertNotIn("<a ", value)

    def test_existing_hyperlinks_and_code_are_not_relinked(self):
        for marks in (
            [{"type": "code"}],
            [{"type": "link", "attrs": {"href": "https://example.com"}}],
        ):
            value = render(doc("Human Village", marks), self.refs, auto_links=True)
            self.assertNotIn("auto-resource-link", value)
        value = render(
            {
                "type": "codeBlock",
                "content": [{"type": "text", "text": "Human Village"}],
            },
            self.refs,
            auto_links=True,
        )
        self.assertNotIn("<a ", value)

    def test_urls_and_email_addresses_untouched(self):
        value = render(
            doc(
                "https://example.com/Village www.example.com/Reimu Reimu@example.com Village"
            ),
            self.refs,
            auto_links=True,
        )
        self.assertEqual(value.count("auto-resource-link"), 1)

    def test_preserves_formatting_and_source_document(self):
        original = doc("Human Village", [{"type": "bold"}, {"type": "italic"}])
        before = copy.deepcopy(original)
        value = render(original, self.refs, auto_links=True)
        self.assertIn("<em><strong><a ", value)
        self.assertEqual(original, before)

    def test_self_links_and_folders_excluded(self):
        refs = {
            **self.refs,
            "folder": {"id": "folder", "title": "Notebook", "kind": "folder"},
        }
        value = render(
            doc("Reimu Notebook Village"), refs, auto_links=True, exclude="hero"
        )
        self.assertEqual(value.count("auto-resource-link"), 1)

    def test_unicode_and_escaped_labels(self):
        refs = {
            "one": {
                "id": "one",
                "title": "Étoile & [Tower]",
                "aliases": [],
                "kind": "article",
            }
        }
        value = render(doc("étoile & [Tower] <script>"), refs, auto_links=True)
        self.assertIn(">étoile &amp; [Tower]</a>", value)
        self.assertNotIn("<script>", value)


class AutomaticLinkScopeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="links-owner")
        self.world = World.objects.create(owner=self.user, name="Linked notes")
        self.target = save_resource(
            self.world,
            {"title": "Human Village", "kind": "article", "aliases": ["Village"]},
        )
        self.note = save_resource(
            self.world,
            {
                "title": "Travel notes",
                "kind": "note",
                "document": doc("Village is near Human Village. Reimu visits."),
            },
        )

    def publish(self, r):
        from .services import snapshot

        r.visibility = "public"
        r.published = {**snapshot(r), "_revision": r.revision}
        r.save(update_fields=["visibility", "published"])

    def test_reader_links_only_available_published_names_and_aliases(self):
        self.publish(self.note)
        self.assertNotIn(
            "auto-resource-link", serialize(self.note, reader=True)["html"]
        )
        self.publish(self.target)
        self.assertEqual(
            serialize(self.note, reader=True)["html"].count("auto-resource-link"), 2
        )

    def test_draft_aliases_do_not_leak_to_reader(self):
        self.publish(self.target)
        self.publish(self.note)
        self.target = save_resource(
            self.world,
            {"aliases": ["Reimu"], "expected_revision": self.target.revision},
            self.target,
        )
        owner = serialize(self.note)["html"]
        reader = serialize(self.note, reader=True)["html"]
        self.assertIn(">Reimu</a>", owner)
        self.assertNotIn(">Reimu</a>", reader)
        self.assertIn(">Village</a>", reader)

    def test_private_duplicate_does_not_block_reader_unique_source(self):
        self.publish(self.target)
        self.publish(self.note)
        save_resource(self.world, {"title": "Village", "kind": "article"})
        self.assertNotIn(">Village</a>", serialize(self.note)["html"])
        self.assertIn(">Village</a>", serialize(self.note, reader=True)["html"])

    def test_settings_disable_and_no_document_or_revision_mutation(self):
        before = self.note.document
        revision = self.note.revision
        self.assertIn("auto-resource-link", serialize(self.note)["html"])
        self.note.refresh_from_db()
        self.assertEqual(self.note.document, before)
        self.assertEqual(self.note.revision, revision)
        self.world.data = {"auto_link_names": False}
        self.world.save()
        self.assertNotIn("auto-resource-link", serialize(self.note)["html"])

    def test_new_sources_link_existing_notes_without_rewriting_them(self):
        before = json.dumps(self.note.document)
        target = save_resource(self.world, {"title": "Reimu", "kind": "character"})
        self.assertIn(
            'href="/#/entry/' + str(target.id) + '"', serialize(self.note)["html"]
        )
        self.assertEqual(json.dumps(self.note.document), before)

    def test_other_world_source_never_links(self):
        other = World.objects.create(owner=self.user, name="Other")
        target = save_resource(other, {"title": "Reimu", "kind": "character"})
        self.assertNotIn(str(target.id), serialize(self.note)["html"])

    def test_portable_world_regenerates_links_to_copied_sources(self):
        copied = import_world_archive(self.user, world_archive(self.world))
        target = copied.resources.get(title="Human Village")
        note = copied.resources.get(title="Travel notes")
        value = serialize(note)["html"]
        self.assertIn(str(target.id), value)
        self.assertNotIn(str(self.target.id), value)
