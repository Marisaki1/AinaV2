import json

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from .documents import from_source, render, safe_url, validate_document
from .models import World
from .services import (
    import_world_archive,
    save_resource,
    serialize,
    snapshot,
    world_archive,
)


class LinkedMediaTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("linked-media")
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Linked images")

    def image(self, url):
        return {
            "type": "doc",
            "content": [
                {"type": "image", "attrs": {"src": url, "alt": 'A "portrait"'}}
            ],
        }

    def test_markdown_image_links_and_formatting_survive_parser_and_database(self):
        document = from_source(
            "# Clue\n\n**Evidence**\n\n![Lantern](https://example.com/lantern.png?size=large)"
        )
        note = save_resource(
            self.world, {"kind": "note", "title": "Clue", "document": document}
        )
        note.refresh_from_db()
        html = serialize(note)["html"]
        self.assertIn("<h1>Clue</h1>", html)
        self.assertIn("<strong>Evidence</strong>", html)
        self.assertIn('src="https://example.com/lantern.png?size=large"', html)
        self.assertIn('referrerpolicy="no-referrer"', html)

    def test_image_url_validation_rejects_executable_and_malformed_urls(self):
        for url in (
            "javascript:alert(1)",
            "data:image/png;base64,abc",
            "//example.com/image.png",
            "file:///image.png",
            "https://user:password@example.com/image.png",
            "https://[bad/image.png",
            "https:///image.png",
            "https://example.com/white space.png",
            "https://example.com/\x00.png",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_document(self.image(url))
        self.assertEqual(
            safe_url("http://example.com/a.webp", True), "http://example.com/a.webp"
        )

    def test_direct_image_url_and_alt_are_escaped(self):
        html = render(self.image("https://example.com/x.png?a=1&b=2"))
        self.assertIn("a=1&amp;b=2", html)
        self.assertIn('alt="A &quot;portrait&quot;"', html)

    def test_markdown_images_are_editor_compatible_blocks_in_original_order(self):
        doc = from_source("Before ![Clue](https://example.com/clue.png) **after**")
        self.assertEqual(
            [n["type"] for n in doc["content"]], ["paragraph", "image", "paragraph"]
        )
        self.assertIn("Before ", render(doc))
        self.assertIn("<strong>after</strong>", render(doc))
        listed = from_source("- ![Clue](https://example.com/clue.png)")
        item = listed["content"][0]["content"][0]
        self.assertEqual(item["content"][0]["type"], "paragraph")
        self.assertEqual(item["content"][1]["type"], "image")

    def test_browser_policy_allows_linked_images_without_remote_scripts(self):
        response = self.client.get("/api/bootstrap")
        policy = response["Content-Security-Policy"]
        self.assertIn("img-src 'self' data: blob: https: http:", policy)
        self.assertIn("script-src 'self';", policy)
        self.assertIn("connect-src 'self';", policy)

    def test_remote_images_do_not_bypass_local_media_world_validation(self):
        with self.assertRaises(ValueError):
            save_resource(
                self.world,
                {
                    "kind": "note",
                    "title": "Foreign media",
                    "document": self.image(
                        "/media/00000000-0000-0000-0000-000000000001"
                    ),
                },
            )

    def test_linked_portrait_validation_and_snapshot_privacy(self):
        character = save_resource(
            self.world,
            {
                "kind": "character",
                "title": "Hero",
                "data": {"cover_url": "https://example.com/published.png"},
                "visibility": "public",
            },
        )
        character.published = {**snapshot(character), "_revision": character.revision}
        character.published_at = timezone.now()
        character.save()
        character = save_resource(
            self.world,
            {
                "data": {"cover_url": "https://example.com/private-draft.png"},
                "expected_revision": character.revision,
            },
            character,
        )
        self.assertEqual(
            serialize(character, reader=True)["data"]["cover_url"],
            "https://example.com/published.png",
        )
        self.assertEqual(
            serialize(character)["data"]["cover_url"],
            "https://example.com/private-draft.png",
        )
        with self.assertRaises(ValueError):
            save_resource(
                self.world,
                {
                    "kind": "character",
                    "title": "Bad",
                    "data": {"cover_url": "javascript:alert(1)"},
                },
            )

    def test_markdown_endpoint_previews_sanitized_content_without_writing(self):
        before = self.world.resources.count()
        response = self.client.post(
            "/api/documents/parse",
            json.dumps(
                {"text": "![A](https://example.com/a.png)\n\n<script>alert(1)</script>"}
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("https://example.com/a.png", response.json()["html"])
        self.assertNotIn("<script", response.json()["html"])
        self.assertEqual(self.world.resources.count(), before)

    def test_markdown_endpoint_requires_owner_session_and_valid_body(self):
        self.assertEqual(
            self.client.post(
                "/api/documents/parse",
                json.dumps({"text": 42}),
                content_type="application/json",
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/api/documents/parse",
                json.dumps({"text": "x" * 200001}),
                content_type="application/json",
            ).status_code,
            400,
        )
        self.client.logout()
        self.assertEqual(
            self.client.post(
                "/api/documents/parse",
                json.dumps({"text": "# Heading"}),
                content_type="application/json",
            ).status_code,
            401,
        )

    def test_linked_images_portraits_survive_portable_archive(self):
        save_resource(
            self.world,
            {
                "kind": "character",
                "title": "Linked original",
                "data": {"cover_url": "https://example.com/portrait.png"},
                "document": self.image("https://example.com/prose.png"),
            },
        )
        copied = import_world_archive(self.user, world_archive(self.world))
        original = copied.resources.get(title="Linked original")
        self.assertEqual(original.data["cover_url"], "https://example.com/portrait.png")
        self.assertIn("https://example.com/prose.png", serialize(original)["html"])
