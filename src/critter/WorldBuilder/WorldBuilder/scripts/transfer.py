"""Package source, built app and a verified database/media backup for another PC."""

import hashlib
import json
import os
import sys
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wb.settings")

INSTRUCTIONS = """WorldBuilder transfer

1. Extract this ZIP to a normal writable folder on the other Windows PC.
2. Install Python 3.12+ and Node.js 22+ if missing (add Python to PATH).
3. Run Setup WorldBuilder.cmd. Internet is needed to install dependencies.
4. Run Restore transferred data.cmd. It verifies the complete backup and
   restores into a NEW data folder; it refuses to overwrite an existing one.
5. Run Open WorldBuilder.cmd. Sign in with your existing local password.

The backup contains all worlds, accounts/password hashes, revisions,
relationships and uploaded images. Keep this package private. Linked external
images retain their URLs; the image host must remain available. Browser-only
preferences and reference-tray pins are not database content.

If data already exists at the destination, do not delete it. Restore into a
different folder using Restore WorldBuilder.cmd and follow its instructions,
or choose an empty installation folder for this transfer.
"""


def package(destination=None):
    import django

    django.setup()
    from django.conf import settings
    from studio.services import checked_archive, make_backup

    if not (ROOT / "dist/index.html").is_file():
        raise ValueError("Build the app with Setup WorldBuilder.cmd first.")
    backup = make_backup()
    backup_path = settings.DATA_DIR / "backups" / backup["name"]
    checked_archive(backup_path.read_bytes(), "worldbuilder-backup-v1")
    destination = Path(destination or ROOT / "transfers").resolve()
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / (
        "WorldBuilder-transfer-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f") + ".zip"
    )
    files = []
    for directory in ("backend", "frontend", "scripts", "docs", "dist"):
        for path in sorted((ROOT / directory).rglob("*")):
            if (
                path.is_file()
                and not any(
                    part.startswith(".") for part in path.relative_to(ROOT).parts
                )
                and ".sqlite3" not in path.name
                and not {"__pycache__", ".pytest_cache", ".ruff_cache"}.intersection(
                    path.relative_to(ROOT).parts
                )
                and path.suffix not in (".pyc", ".pyo")
            ):
                if path.is_symlink() or not path.resolve().is_relative_to(
                    ROOT.resolve()
                ):
                    raise ValueError("A package source points outside WorldBuilder.")
                files.append(path)
    for name in (
        "README.md",
        "package.json",
        "package-lock.json",
        "requirements.lock",
        "vite.config.ts",
        "tsconfig.json",
        "Open WorldBuilder.cmd",
        "Setup WorldBuilder.cmd",
        "Restore WorldBuilder.cmd",
        "Prepare WorldBuilder Transfer.cmd",
    ):
        path = ROOT / name
        if path.is_file():
            files.append(path)
    manifest = {}
    try:
        with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_DEFLATED) as archive:

            def put(name, content):
                archive.writestr("WorldBuilder/" + name, content)
                manifest[name] = hashlib.sha256(content).hexdigest()

            for path in files:
                put(path.relative_to(ROOT).as_posix(), path.read_bytes())
            put("transfer-backup.wbbackup.zip", backup_path.read_bytes())
            put("TRANSFER-README.txt", INSTRUCTIONS.encode())
            put(
                "Restore transferred data.cmd",
                b'@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n".venv\\Scripts\\python.exe" scripts\\restore.py transfer-backup.wbbackup.zip --destination data\r\npause\r\n',
            )
            archive.writestr(
                "WorldBuilder/transfer-manifest.json", json.dumps(manifest, indent=2)
            )
        with zipfile.ZipFile(target) as archive:
            for name, digest in manifest.items():
                if (
                    hashlib.sha256(archive.read("WorldBuilder/" + name)).hexdigest()
                    != digest
                ):
                    raise ValueError("Transfer package checksum verification failed.")
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return target


if __name__ == "__main__":
    try:
        print("Creating a verified complete backup and transfer package...", flush=True)
        print("Ready: " + str(package()), flush=True)
        print("Copy this ZIP to the other PC and follow TRANSFER-README.txt inside.")
    except Exception as error:
        print("Transfer preparation stopped: " + str(error), file=sys.stderr)
        sys.exit(1)
