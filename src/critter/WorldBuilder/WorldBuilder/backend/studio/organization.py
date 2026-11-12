"""Collection rules and revision-checked organization of existing resources."""

import unicodedata
from django.db import transaction
from django.http import Http404
from .catalog import KINDS
from .models import Resource, Asset
from .services import (
    Conflict,
    short,
    strings,
    serialize,
    search_resources,
    asset_json,
    save_resource,
)
from .tools import integer


def normalize(value):
    return unicodedata.normalize("NFKC", value).casefold().strip()


def collection_rules(data):
    mode = data.get("collection_type", "folder")
    if mode not in ("folder", "smart"):
        raise ValueError("Choose a folder or saved filter collection.")
    rules = data.get("rules", {})
    if not isinstance(rules, dict) or set(rules) - {
        "tags",
        "tag_mode",
        "kinds",
        "templates",
        "statuses",
        "query",
    }:
        raise ValueError("Unsupported collection filter.")
    result = {
        key: strings(rules.get(key, []), key.title())
        for key in ("tags", "kinds", "templates", "statuses")
    }
    result["tag_mode"] = rules.get("tag_mode", "all")
    result["query"] = short(rules.get("query", ""), "Search query", 200)
    if result["tag_mode"] not in ("all", "any"):
        raise ValueError("Choose all or any matching tags.")
    if set(result["kinds"]) - (KINDS | {"media"}) or "folder" in result["kinds"]:
        raise ValueError("Choose supported content types for this collection.")
    if set(result["statuses"]) - {"draft", "wip", "done"}:
        raise ValueError("Choose valid writing states.")
    return result


def matches(value, rules, media=False):
    kinds = rules["kinds"]
    if kinds and ("media" if media else value["kind"]) not in kinds:
        return False
    if rules["templates"] and (media or value["template"] not in rules["templates"]):
        return False
    if rules["statuses"] and (media or value["status"] not in rules["statuses"]):
        return False
    requested = {normalize(t) for t in rules["tags"]}
    actual = {normalize(t) for t in value["tags"]}
    return not requested or (
        bool(requested & actual) if rules["tag_mode"] == "any" else requested <= actual
    )


def collection_contents(world, collection_id, recursive=False, reader=False):
    try:
        folder = Resource.objects.get(
            id=collection_id, world=world, kind="folder", deleted_at=None
        )
    except Resource.DoesNotExist:
        raise Http404()
    visible = serialize(folder, full=False, reader=reader)
    if visible is None:
        raise Http404()
    rules = collection_rules(visible["data"])
    smart = visible["data"].get("collection_type") == "smart"
    resources = search_resources(world, rules["query"] if smart else "", reader=reader)
    assets = []
    if smart:
        resources = [
            r for r in resources if r["kind"] != "folder" and matches(r, rules)
        ]
        # Media has no independent reader grant yet. Never infer it from an owner's saved filter.
        if not reader:
            assets = [asset_json(a) for a in Asset.objects.filter(world=world)]
            assets = [
                a
                for a in assets
                if matches(a, rules, True)
                and (
                    not rules["query"]
                    or normalize(rules["query"])
                    in normalize(
                        a["name"] + " " + a["credit"] + " " + " ".join(a["tags"])
                    )
                )
            ]
    else:
        parents = {str(folder.id)}
        if recursive:
            children = {}
            for r in resources:
                children.setdefault(r["parent"], []).append(r["id"])
            pending = list(parents)
            while pending:
                for child in children.get(pending.pop(), []):
                    if child not in parents:
                        parents.add(child)
                        pending.append(child)
        resources = [
            r for r in resources if r["id"] != str(folder.id) and r["parent"] in parents
        ]
    breadcrumbs = []
    node = folder
    seen = set()
    while node and str(node.id) not in seen:
        seen.add(str(node.id))
        view = serialize(node, full=False, reader=reader)
        if view is None or node.deleted_at:
            break
        breadcrumbs.append({"id": str(node.id), "title": view["title"]})
        node = (
            Resource.objects.filter(id=view["parent"], world=world).first()
            if view["parent"]
            else None
        )
    return {
        "collection": visible,
        "resources": resources,
        "assets": assets,
        "breadcrumbs": list(reversed(breadcrumbs)),
    }


def organize(world, rows):
    if not isinstance(rows, list) or not 1 <= len(rows) <= 500:
        raise ValueError("Choose between 1 and 500 entries to move.")
    if any(
        not isinstance(row, dict) or set(row) - {"id", "parent", "position", "revision"}
        for row in rows
    ):
        raise ValueError("Invalid organization request.")
    ids = [row.get("id") for row in rows]
    if any(not isinstance(value, str) for value in ids) or len(ids) != len(set(ids)):
        raise ValueError("Choose each entry once.")
    # Preflight the final graph, then save parents before descendants in one transaction.
    with transaction.atomic():
        all_entries = {
            str(r.id): r for r in Resource.objects.filter(world=world, deleted_at=None)
        }
        parents = {
            key: str(r.parent_id) if r.parent_id else None
            for key, r in all_entries.items()
        }
        changes = {}
        for row in rows:
            entry = all_entries.get(row["id"])
            if entry is None:
                raise Http404()
            expected = row.get("revision")
            if (
                isinstance(expected, bool)
                or not isinstance(expected, int)
                or expected != entry.revision
            ):
                raise Conflict(
                    "An entry changed in another tab. Refresh before moving it."
                )
            parent = row.get("parent", parents[row["id"]])
            if parent is not None:
                destination = (
                    all_entries.get(parent) if isinstance(parent, str) else None
                )
                if (
                    not destination
                    or destination.kind != "folder"
                    or destination.data.get("collection_type") == "smart"
                ):
                    raise ValueError(
                        "Move entries into a folder collection or choose Unfiled."
                    )
            parents[row["id"]] = parent
            changes[row["id"]] = {
                "parent": parent,
                "position": integer(
                    row.get("position", entry.position), "Position", -100000, 100000
                ),
                "expected_revision": expected,
            }
        depths = {}
        for identity in parents:
            path = []
            seen = set()
            current = identity
            while current in parents and current not in depths:
                if current in seen:
                    raise ValueError(
                        "A collection cannot be moved into itself or its descendants."
                    )
                seen.add(current)
                path.append(current)
                current = parents[current]
            depth = depths.get(current, -1)
            for identity_in_path in reversed(path):
                depth += 1
                depths[identity_in_path] = depth
        for identity in sorted(changes, key=lambda key: depths[key]):
            save_resource(world, changes[identity], all_entries[identity])
    return {"ok": True, "moved": len(rows)}
