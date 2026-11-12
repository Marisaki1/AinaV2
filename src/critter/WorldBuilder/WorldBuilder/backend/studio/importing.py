import hashlib
import io
from pathlib import Path
from django.conf import settings
from django.db import transaction
from .models import Resource
from .documents import from_source
from .services import Conflict, save_resource, store_asset

ALLOWED_FOLDERS = {
    "Bestiary",
    "DM Notes",
    "Main Story",
    "NPC Catalogue",
    "Shops",
    "Tower",
    "images",
}
TEXT_EXT = {"", ".md", ".txt", ".html", ".htm"}
SKIP = {".git", ".venv", "node_modules", "__pycache__", ".claude", ".codex", ".agents"}


def source_root():
    return settings.BASE_DIR.parent


def resolve_source(relative):
    if not isinstance(relative, str) or len(relative) > 800:
        raise ValueError("Choose a campaign source file.")
    parts = Path(relative).parts
    if (
        not parts
        or parts[0] not in ALLOWED_FOLDERS
        or any(p.startswith(".") or p in SKIP for p in parts)
    ):
        raise ValueError("Source must be in a campaign folder.")
    root = source_root().resolve()
    path = root.joinpath(relative)
    if path.is_symlink() or any(
        parent.is_symlink()
        for parent in path.parents
        if parent != root and root in parent.parents
    ):
        raise ValueError("Symbolic links are not imported.")
    resolved = path.resolve()
    if root not in resolved.parents or not resolved.is_file():
        raise ValueError("The source file is unavailable.")
    return resolved


def read_text(path):
    if path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("Text file exceeds the 2 MB import limit.")
    contents = path.read_bytes()
    if contents.startswith((b"\xff\xfe", b"\xfe\xff")):
        return contents.decode("utf-16"), contents, "utf-16"
    if b"\x00" in contents:
        raise ValueError("This is a binary file.")
    try:
        return contents.decode("utf-8-sig"), contents, "utf-8"
    except UnicodeDecodeError:
        return contents.decode("cp1252"), contents, "cp1252"


def scan(folders):
    if not isinstance(folders, list) or not folders or set(folders) - ALLOWED_FOLDERS:
        raise ValueError("Select one or more campaign folders.")
    rows = []
    warnings = []
    for folder in sorted(set(folders)):
        directory = source_root() / folder
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*")):
            if len(rows) >= 1500:
                raise ValueError("Scan fewer folders at a time (up to 1,500 entries).")
            relative = path.relative_to(source_root())
            if (
                not path.is_file()
                or path.is_symlink()
                or any(part.startswith(".") or part in SKIP for part in relative.parts)
            ):
                continue
            ext = path.suffix.lower()
            if ext not in TEXT_EXT and ext not in (
                ".png",
                ".jpg",
                ".jpeg",
                ".webp",
                ".gif",
            ):
                continue
            try:
                resolve_source(str(relative))
                if ext in TEXT_EXT:
                    text, contents, encoding = read_text(path)
                    template = {
                        "NPC Catalogue": "character",
                        "Bestiary": "species",
                        "Main Story": "plot",
                        "Shops": "building",
                        "Tower": "geography",
                    }.get(folder, "generic")
                    rows.append(
                        {
                            "path": relative.as_posix(),
                            "title": path.stem if ext else path.name,
                            "size": len(contents),
                            "digest": hashlib.sha256(contents).hexdigest(),
                            "format": "html"
                            if ext in (".html", ".htm")
                            else "markdown",
                            "encoding": encoding,
                            "template": template,
                            "kind": "note" if folder == "DM Notes" else "article",
                            "preview": text[:350],
                        }
                    )
                else:
                    contents = path.read_bytes()
                    if len(contents) > 25 * 1024 * 1024:
                        raise ValueError("Image exceeds 25 MB.")
                    rows.append(
                        {
                            "path": relative.as_posix(),
                            "title": path.name,
                            "size": len(contents),
                            "digest": hashlib.sha256(contents).hexdigest(),
                            "kind": "asset",
                            "preview": "Image for the shared media library.",
                        }
                    )
            except (ValueError, OSError, UnicodeError) as error:
                warnings.append({"path": relative.as_posix(), "message": str(error)})
    return {"files": rows, "warnings": warnings, "folders": sorted(ALLOWED_FOLDERS)}


def import_selected(world, items):
    if not isinstance(items, list) or not 1 <= len(items) <= 200:
        raise ValueError("Select between 1 and 200 files.")
    prepared = []
    for item in items:
        path = resolve_source(item.get("path"))
        contents = path.read_bytes()
        digest = hashlib.sha256(contents).hexdigest()
        if digest != item.get("digest"):
            raise Conflict(
                "A source file changed after scanning. Scan again before importing: "
                + item["path"]
            )
        prepared.append((item, path, contents, digest))
    created = []
    skipped = []
    media = []
    warnings = []
    with transaction.atomic():
        for item, path, contents, digest in prepared:
            if path.suffix.lower() not in TEXT_EXT:
                stream = io.BytesIO(contents)
                stream.name = path.name
                asset = store_asset(world, stream)
                media.append(str(asset.id))
                continue
            prior = Resource.objects.filter(
                world=world, data__provenance__path=item["path"]
            ).first()
            if prior:
                if prior.data.get("provenance", {}).get("digest") != digest:
                    warnings.append(
                        {
                            "path": item["path"],
                            "message": "Previously imported source changed. Existing entry kept; compare it before re-importing.",
                        }
                    )
                skipped.append(item["path"])
                continue
            text, _, encoding = read_text(path)
            fmt = "html" if path.suffix.lower() in (".htm", ".html") else "markdown"
            doc = from_source(text, fmt)
            folder = Path(item["path"]).parts[0]
            template = item.get("template") or {
                "NPC Catalogue": "character",
                "Bestiary": "species",
                "Main Story": "plot",
                "Shops": "building",
                "Tower": "geography",
            }.get(folder, "generic")
            resource = save_resource(
                world,
                {
                    "title": (path.stem if path.suffix else path.name)[:180],
                    "kind": "note" if folder == "DM Notes" else "article",
                    "template": template,
                    "document": doc,
                    "source": text,
                    "tags": [folder],
                    "visibility": "private",
                    "data": {
                        "provenance": {
                            "path": item["path"],
                            "digest": digest,
                            "encoding": encoding,
                            "format": fmt,
                        }
                    },
                },
            )
            created.append(str(resource.id))
            if "<img" in text or "![" in text:
                warnings.append(
                    {
                        "path": item["path"],
                        "message": "Image references need review. Import the images into Media and attach them using Insert image.",
                    }
                )
    return {
        "created": created,
        "skipped": skipped,
        "assets": media,
        "warnings": warnings,
    }
