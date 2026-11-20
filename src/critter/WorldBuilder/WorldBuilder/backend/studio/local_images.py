"""Import host-managed campaign image folders into the regular media library."""

import hashlib
import json
import os
import re
import stat
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction

from .services import store_asset


EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_IMAGE_BYTES = 25 * 1024 * 1024
SHARED_MAX_BYTES = 8 * 1024 * 1024
SHARED_TYPES = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG", ".webp": "WEBP"}
SHARED_LABELS = {"repository": "Repository artwork", "private": "Private artwork"}


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


def shared_folders(world):
    configured = settings.AINA_ARTWORK_DIRECTORIES
    sources = {}
    for source in SHARED_LABELS:
        value = configured.get(source)
        if not isinstance(value, str) or not Path(value).is_absolute():
            continue
        # Private host artwork is available only in worlds configured for local media.
        if source == "private" and configured_folder(world) is None:
            continue
        sources[source] = Path(value)
    return sources


def shared_path(root, key):
    parts = key.split("/")
    if any(
        not part
        or re.search(r'[\x00-\x1f<>:"|?*\\/]|[ .]$', part)
        or re.match(r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", part, re.I)
        for part in parts
    ) or len("/".join(parts)) > 400:
        raise ValueError("Use a valid artwork filename and subfolder.")
    target = root
    for part in ["", *parts]:
        target /= part
        try:
            metadata = target.lstat()
        except FileNotFoundError:
            continue
        if is_link(metadata):
            raise ValueError("Linked artwork folders and files are unsupported.")
    return target


def save_shared_image(root, folder, filename, contents, image_format):
    if len(contents) > SHARED_MAX_BYTES or SHARED_TYPES.get(Path(filename).suffix.lower()) != image_format:
        raise ValueError("Shared artwork must be a PNG, JPEG, or WebP image up to 8 MB with a matching extension.")
    try:
        target = shared_path(root, "/".join(filter(None, [folder, filename])))
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            with target.open("xb") as stream:
                stream.write(contents)
        except FileExistsError:
            if not target.is_file() or target.stat().st_size != len(contents) or target.read_bytes() != contents:
                raise ValueError("An image with that name already exists. Rename the file or choose another subfolder.")
    except OSError as error:
        raise ValueError("Could not write to the selected artwork folder.") from error


def image_files(root, extensions, onerror=None):
    for directory, child_dirs, names in os.walk(root, onerror=onerror):
        directory = Path(directory)
        # os.walk ignores directory symlinks, but Windows junctions need pruning.
        for name in child_dirs[:]:
            try:
                if is_link((directory / name).lstat()):
                    child_dirs.remove(name)
            except OSError as error:
                child_dirs.remove(name)
                if onerror:
                    onerror(error)
        child_dirs.sort(key=str.casefold)
        for name in sorted(names, key=str.casefold):
            path = directory / name
            if path.suffix.lower() in extensions:
                yield path


def shared_catalog(root):
    keys = []
    for path in image_files(root, SHARED_TYPES):
        try:
            metadata = path.lstat()
            if stat.S_ISREG(metadata.st_mode) and not is_link(metadata) and 0 < metadata.st_size <= SHARED_MAX_BYTES:
                keys.append(path.relative_to(root).as_posix())
        except OSError:
            continue
    return keys


def shared_image(root, key):
    path = shared_path(root, key)
    metadata = path.lstat()
    if path.suffix.lower() not in SHARED_TYPES or not stat.S_ISREG(metadata.st_mode) or not 0 < metadata.st_size <= SHARED_MAX_BYTES:
        raise ValueError("Choose a supported shared image up to 8 MB.")
    return path


def sync(world, root, source=None, selected=None):
    result = {"imported": 0, "existing": 0, "skipped": 0, "errors": []}
    max_bytes = SHARED_MAX_BYTES if source else MAX_IMAGE_BYTES
    extensions = SHARED_TYPES if source else EXTENSIONS

    def skip(name, reason):
        result["skipped"] += 1
        if len(result["errors"]) < 5:
            result["errors"].append(f"{name}: {reason}")

    def unreadable(error):
        skip(Path(error.filename).name if error.filename else "Folder", "Cannot read folder.")

    def import_file(path):
        metadata = path.lstat()
        if is_link(metadata) or not stat.S_ISREG(metadata.st_mode):
            return
        if metadata.st_size > max_bytes:
            raise ValueError(f"Image exceeds {max_bytes // (1024 * 1024)} MB.")
        with path.open("rb") as stream:
            data = stream.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("Image grew beyond the size limit while reading.")
        digest = hashlib.sha256(data).hexdigest()
        # Same digest reuses existing media, comments, tags and references.
        with transaction.atomic():
            if world.assets.filter(digest=digest).exists():
                result["existing"] += 1
                return
            tags = [SHARED_LABELS[source] if source else "Local campaign images"]
            tags.extend(part[:100] for part in path.parent.relative_to(root).parts[:12] if part.strip())
            store_asset(world, ContentFile(data, name=path.name), tags=tags)
            result["imported"] += 1

    if selected is not None:
        for key in selected:
            try:
                import_file(shared_image(root, key))
            except ValueError as error:
                skip(Path(key).name, str(error))
            except OSError:
                skip(Path(key).name, "Cannot read or copy image.")
    else:
        for path in image_files(root, extensions, unreadable):
            try:
                import_file(path)
            except ValueError as error:
                skip(path.name, str(error))
            except OSError:
                skip(path.name, "Cannot read or copy image.")
    return result
