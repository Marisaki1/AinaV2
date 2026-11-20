import io
import json
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from PIL import Image

from .models import World
from .services import save_resource


@override_settings(ALLOWED_HOSTS=["testserver"])
class LocalImageTests(TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        data = Path(temporary.name)
        self.source = data / "campaign images"
        self.source.mkdir()
        media = data / "media"
        media.mkdir()
        override = override_settings(DATA_DIR=data, MEDIA_ROOT=media)
        override.enable()
        self.addCleanup(override.disable)
        users = get_user_model().objects
        self.owner = users.create_user("local-image-owner")
        self.other = users.create_user("local-image-other")
        self.world = World.objects.create(owner=self.owner, name="Campaign")
        self.unconfigured = World.objects.create(owner=self.owner, name="Another Campaign")
        (data / "local-image-sources.json").write_text(
            json.dumps({str(self.world.id): str(self.source)}), encoding="utf-8"
        )
        self.client.force_login(self.owner)
        self.path = f"/api/worlds/{self.world.id}/assets/sync-local"

    def image(self, name, color="red"):
        file = self.source / name
        file.parent.mkdir(exist_ok=True, parents=True)
        with io.BytesIO() as payload:
            Image.new("RGB", (12, 10), color).save(payload, format="PNG")
            file.write_bytes(payload.getvalue())
        return file

    def test_nested_sources_become_reusable_assets(self):
        original = self.image("Floor 8/Portraits/Reiko.png")
        response = self.client.post(self.path)
        self.assertEqual(response.json()["imported"], 1)
        self.assertTrue(self.client.get(f"/api/worlds/{self.world.id}").json()["local_image_folder"])
        asset = self.world.assets.get()
        self.assertEqual(asset.tags, ["Local campaign images", "Floor 8", "Portraits"])
        self.assertEqual(b"".join(self.client.get(f"/media/{asset.id}").streaming_content), original.read_bytes())
        note = save_resource(self.world, {"title": "Reiko", "data": {"cover_asset": str(asset.id)}})
        original.unlink()
        self.client.post(self.path)
        note.refresh_from_db()
        self.assertEqual(note.data["cover_asset"], str(self.world.assets.get().id))

    def test_repeated_scans_keep_asset_identity_and_continue_past_invalid_files(self):
        self.image("A.png")
        self.image("nested/duplicate.png")
        (self.source / "B-broken.png").write_text("invalid", encoding="utf-8")
        self.image("C.PNG", "blue")
        result = self.client.post(self.path).json()
        self.assertEqual((result["imported"], result["existing"], result["skipped"]), (2, 1, 1))
        ids = set(self.world.assets.values_list("id", flat=True))
        self.assertEqual(self.client.post(self.path).json()["imported"], 0)
        self.assertEqual(set(self.world.assets.values_list("id", flat=True)), ids)

    def test_owner_scope_and_request_body_cannot_choose_source(self):
        self.image("A.png")
        self.assertFalse(self.client.get(f"/api/worlds/{self.unconfigured.id}").json()["local_image_folder"])
        self.assertEqual(self.client.post(f"/api/worlds/{self.unconfigured.id}/assets/sync-local").status_code, 404)
        self.client.force_login(self.other)
        self.assertEqual(self.client.post(self.path).status_code, 404)
        self.client.force_login(self.owner)
        result = self.client.post(self.path, {"root": "ignored", "world": str(self.unconfigured.id)}).json()
        self.assertEqual(result["imported"], 1)
        self.assertEqual(self.unconfigured.assets.count(), 0)

    def test_missing_folder_has_actionable_error(self):
        self.source.rmdir()
        result = self.client.post(self.path)
        self.assertEqual(result.status_code, 400)
        self.assertIn("unavailable", result.json()["error"])
