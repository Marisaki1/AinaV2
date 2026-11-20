"""Import host-managed campaign image folders into the regular media library."""

import hashlib
import json
import os
import stat
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction

from .services import store_asset


EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_IMAGE_BYTES = 25 * 1024 * 1024


def configured_folder(world):
    config = settings.DATA_DIR / "local-image-sources.json"
    try:
        sources = json.loads(config.read_text(encoding="utf-8-sig"))
    except (FileNotFoundError, ValueError, OSError):
        return None
    value = sources.get(str(world.id)) if isinstance(sources, dict) else None
    if not isinstance(value, str) or not value or "\x00" in value:
        return None
    path = Path(value)
    return path if path.is_absolute() else None


def is_link(metadata):
    return stat.S_ISLNK(metadata.st_mode) or bool(
        getattr(metadata, "st_file_attributes", 0)
        & stat.FILE_ATTRIBUTE_REPARSE_POINT
    )


def sync(world, root):
    result = {"imported": 0, "existing": 0, "skipped": 0, "errors": []}

    def skip(name, reason):
        result["skipped"] += 1
        if len(result["errors"]) < 5:
            result["errors"].append(f"{name}: {reason}")

    def unreadable(error):
        skip(Path(error.filename).name if error.filename else "Folder", "Cannot read folder.")

    for directory, child_dirs, names in os.walk(root, onerror=unreadable):
        directory = Path(directory)
        # os.walk ignores directory symlinks, but Windows junctions also need pruning.
        for name in child_dirs[:]:
            try:
                if is_link((directory / name).lstat()):
                    child_dirs.remove(name)
            except OSError:
                child_dirs.remove(name)
                skip(name, "Cannot read folder.")
        child_dirs.sort(key=str.casefold)
        for name in sorted(names, key=str.casefold):
            path = directory / name
            if path.suffix.lower() not in EXTENSIONS:
                continue
            try:
                metadata = path.lstat()
                if is_link(metadata) or not stat.S_ISREG(metadata.st_mode):
                    continue
                if metadata.st_size > MAX_IMAGE_BYTES:
                    skip(name, "Image exceeds 25 MB.")
                    continue
                with path.open("rb") as stream:
                    data = stream.read(MAX_IMAGE_BYTES + 1)
                digest = hashlib.sha256(data).hexdigest()
                # Same digest reuses existing media, comments, tags and references.
                with transaction.atomic():
                    if world.assets.filter(digest=digest).exists():
                        result["existing"] += 1
                        continue
                    tags = ["Local campaign images"]
                    tags.extend(part[:100] for part in directory.relative_to(root).parts[:12] if part.strip())
                    store_asset(world, ContentFile(data, name=name), tags=tags)
                    result["imported"] += 1
            except ValueError as error:
                skip(name, str(error))
            except OSError:
                skip(name, "Cannot read or copy image.")
    return result
