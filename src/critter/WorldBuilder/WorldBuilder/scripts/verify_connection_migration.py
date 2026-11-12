"""Exercise the connection-history migration in a disposable .preview database."""

import json
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wb.settings")
import django

django.setup()
from django.db import connections
from django.db.migrations.executor import MigrationExecutor
from django.conf import settings

with tempfile.TemporaryDirectory(
    prefix="migration-0.10-", dir=ROOT / ".preview"
) as temp:
    target = Path(temp) / "migration.sqlite3"
    config = {**settings.DATABASES["default"], "NAME": target}
    connections.databases["migration_check"] = config
    db = connections["migration_check"]
    try:
        old = [("studio", "0002_asset_revision_asset_tags")]
        executor = MigrationExecutor(db)
        executor.migrate(old)
        apps = executor.loader.project_state(old).apps
        user = (
            apps.get_model("auth", "User")
            .objects.using(db.alias)
            .create(username="migration-owner", password="!unused")
        )
        world = (
            apps.get_model("studio", "World")
            .objects.using(db.alias)
            .create(owner_id=user.id, name="Migration fixture")
        )
        Resource = apps.get_model("studio", "Resource")
        a, b = [
            Resource.objects.using(db.alias).create(world_id=world.id, title=name)
            for name in ("A", "B")
        ]
        Edge = apps.get_model("studio", "Connection")
        edge = Edge.objects.using(db.alias).create(
            world_id=world.id,
            source_id=a.id,
            target_id=b.id,
            kind="parent",
            label="Original label",
            notes="Owner note",
            visibility="public",
            strength=15,
        )
        before = {
            key: getattr(edge, key)
            for key in (
                "id",
                "world_id",
                "source_id",
                "target_id",
                "kind",
                "label",
                "notes",
                "visibility",
                "strength",
            )
        }
        new = [("studio", "0003_connectionrevision_and_more")]
        executor = MigrationExecutor(db)
        executor.migrate(new)
        apps = executor.loader.project_state(new).apps
        migrated = (
            apps.get_model("studio", "Connection")
            .objects.using(db.alias)
            .get(id=edge.id)
        )
        assert {key: getattr(migrated, key) for key in before} == before
        assert migrated.revision == 1 and migrated.deleted_at is None
        history = (
            apps.get_model("studio", "ConnectionRevision")
            .objects.using(db.alias)
            .get(connection_id=edge.id)
        )
        assert history.number == 1 and history.action == "baseline"
        assert history.snapshot["notes"] == "Owner note" and history.snapshot[
            "source"
        ] == str(a.id)
        assert history.snapshot["deleted"] is False
        assert db.cursor().execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        print(
            json.dumps(
                {
                    "original_fields_and_ids_preserved": True,
                    "baseline_revision_seeded": True,
                    "database_integrity": True,
                    "isolated_database": True,
                }
            )
        )
    finally:
        db.close()
