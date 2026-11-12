"""Verify a complete backup and restore into a NEW data directory, never over live data."""

import argparse
from datetime import datetime
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wb.settings")


def restore(archive_path, destination):
    import django

    django.setup()
    from studio.services import checked_archive

    destination = Path(destination).resolve()
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", destination.name):
        raise ValueError(
            "Use letters, digits, hyphens and underscores for the new folder name."
        )
    if destination.exists():
        raise ValueError(
            "The destination already exists. Choose a new folder; existing data is never overwritten."
        )
    if destination.parent != ROOT.resolve():
        raise ValueError("Choose a new data folder directly inside WorldBuilder.")
    archive, manifest = checked_archive(
        Path(archive_path).read_bytes(), "worldbuilder-backup-v1"
    )
    names = set(manifest["files"])
    if "worldbuilder.sqlite3" not in names or any(
        n != "worldbuilder.sqlite3"
        and not re.fullmatch(r"media/[a-f0-9]{32}\.(png|jpg|gif|webp)", n)
        for n in names
    ):
        raise ValueError("The backup contains unexpected files.")
    with tempfile.TemporaryDirectory(prefix=".restore-", dir=ROOT) as temp:
        staging = Path(temp) / "data"
        (staging / "media").mkdir(parents=True)
        for name in names:
            (staging / name).write_bytes(archive.read(name))
        db = sqlite3.connect(staging / "worldbuilder.sqlite3")
        try:
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("The database did not pass its integrity check.")
            if db.execute("PRAGMA foreign_key_check").fetchone():
                raise ValueError("The database has invalid relationships.")
            for name, digest in db.execute(
                "SELECT storage_name,digest FROM studio_asset"
            ):
                import hashlib

                image = staging / "media" / name
                if (
                    not re.fullmatch(r"[a-f0-9]{32}\.(png|jpg|gif|webp)", name)
                    or not image.is_file()
                    or hashlib.sha256(image.read_bytes()).hexdigest() != digest
                ):
                    raise ValueError(
                        "A database image is missing or does not match its checksum."
                    )
        finally:
            db.close()
        shutil.move(str(staging), str(destination))
        if os.name == "nt":
            # TemporaryDirectory uses an owner-only Windows ACL. After the move,
            # inherit the installation folder ACL so the normal app user can save.
            subprocess.run(["icacls", str(destination), "/reset", "/T", "/C", "/Q"], check=True, capture_output=True)
    (destination / ".gitignore").write_text("*\n", encoding="utf-8")
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", nargs="?")
    parser.add_argument("--destination")
    args = parser.parse_args()
    if not args.archive:
        import tkinter
        from tkinter.filedialog import askopenfilename

        root = tkinter.Tk()
        root.withdraw()
        args.archive = askopenfilename(
            title="Choose a complete WorldBuilder backup",
            filetypes=[("WorldBuilder backup", "*.wbbackup.zip")],
        )
        root.destroy()
        if not args.archive:
            return
    name = args.destination or (
        "data-restored-" + datetime.now().strftime("%Y%m%d-%H%M%S")
    )
    try:
        restored = restore(args.archive, ROOT / name)
    except (OSError, ValueError, sqlite3.Error) as error:
        raise SystemExit("Restore stopped: " + str(error))
    # Absolute path and fixed executable; no shell interpolation of restored data.
    launcher = ROOT / (restored.name + ".cmd")
    launcher.write_text(
        '@echo off\nsetlocal\ncd /d "%~dp0"\nset "WORLDBUILDER_DATA=%~dp0'
        + restored.name
        + '"\n".venv\\Scripts\\python.exe" scripts\\launch.py --port 8769\nif errorlevel 1 pause\n',
        encoding="utf-8",
    )
    print("Verified and restored to: " + str(restored))
    print("Start the restored copy with: " + str(launcher))
    print("It uses port 8769 so it can be checked alongside the original.")


if __name__ == "__main__":
    main()
