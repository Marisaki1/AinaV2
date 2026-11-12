"""Exercise complete backup/restore against the isolated QA installation only."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
from collections import Counter
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wb.settings")
import django

django.setup()
from django.conf import settings
from django.contrib.auth.models import User
from django.test import Client, override_settings
from django.db import transaction
from studio.models import (
    Resource,
    Asset,
    Revision,
    World,
    Connection,
    ConnectionRevision,
)
from studio.services import (
    make_backup,
    checked_archive,
    world_archive,
    import_world_archive,
)

if ROOT / ".preview" not in settings.DATA_DIR.parents:
    raise SystemExit(
        "Set WORLDBUILDER_DATA to an isolated .preview QA data directory first."
    )

original = {
    "worlds": World.objects.count(),
    "entries": Resource.objects.count(),
    "revisions": Revision.objects.count(),
    "images": Asset.objects.count(),
}
assert all(original.values()), "Seed the QA fixtures first."
original.update(
    connections=Connection.objects.count(),
    connection_revisions=ConnectionRevision.objects.count(),
)
backup = make_backup()
path = settings.DATA_DIR / "backups" / backup["name"]
archive, manifest = checked_archive(path.read_bytes(), "worldbuilder-backup-v1")
assert "worldbuilder.sqlite3" in manifest["files"]
client = Client(HTTP_HOST="127.0.0.1")
client.force_login(User.objects.first())
assert client.post("/api/backups/" + backup["name"] + "/verify").status_code == 200
response = client.get("/api/backups/" + backup["name"])
assert response.status_code == 200
download = b"".join(response.streaming_content)
response.close()
assert hashlib.sha256(download).digest() == hashlib.sha256(path.read_bytes()).digest()
spec = importlib.util.spec_from_file_location(
    "wb_restore", ROOT / "scripts" / "restore.py"
)
restore_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore_module)
with tempfile.TemporaryDirectory(
    prefix="restore-check-", dir=ROOT / ".preview"
) as temp:
    with patch.object(restore_module, "ROOT", Path(temp)):
        destination = restore_module.restore(path, Path(temp) / "restored")
        db = sqlite3.connect(destination / "worldbuilder.sqlite3")
        try:
            for key, table in [
                ("worlds", "studio_world"),
                ("entries", "studio_resource"),
                ("revisions", "studio_revision"),
                ("images", "studio_asset"),
                ("connections", "studio_connection"),
                ("connection_revisions", "studio_connectionrevision"),
            ]:
                assert (
                    db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                    == original[key]
                )
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        finally:
            db.close()
        try:
            restore_module.restore(path, destination)
            raise AssertionError("An existing destination must never be overwritten.")
        except ValueError:
            pass
source_world = World.objects.order_by("created_at").first()
portable = world_archive(source_world)
with tempfile.TemporaryDirectory(
    prefix="portable-check-", dir=ROOT / ".preview"
) as temp:
    with override_settings(MEDIA_ROOT=Path(temp)), transaction.atomic():
        copied = import_world_archive(source_world.owner, portable)
        assert Counter(copied.resources.values_list("kind", flat=True)) == Counter(
            source_world.resources.values_list("kind", flat=True)
        )
        assert copied.connections.count() == source_world.connections.count()
        assert (
            ConnectionRevision.objects.filter(connection__world=copied).count()
            == ConnectionRevision.objects.filter(connection__world=source_world).count()
        )
        assert (
            copied.connections.filter(deleted_at__isnull=False).count()
            == source_world.connections.filter(deleted_at__isnull=False).count()
        )
        assert copied.assets.count() == source_world.assets.count()
        assert (
            copied.resources.filter(published__isnull=False).count()
            == source_world.resources.filter(published__isnull=False).count()
        )
        for asset in copied.assets.all():
            assert (
                hashlib.sha256(
                    (Path(temp) / asset.storage_name).read_bytes()
                ).hexdigest()
                == asset.digest
            )
        transaction.set_rollback(True)
assert World.objects.count() == original["worlds"]
print(
    json.dumps(
        {
            "complete_backup": True,
            "download_matches": True,
            "checksums": True,
            "database_integrity": True,
            "restore_preserves_counts": original,
            "existing_destination_protected": True,
            "portable_world_roundtrip_all_module_kinds": True,
        }
    )
)
