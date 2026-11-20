import copy
import hashlib
import io
import json
import math
import os
import re
import sqlite3
import tempfile
import unicodedata
import uuid
import zipfile
from pathlib import Path
from django.conf import settings
from django.db import connection, transaction
from django.http import Http404
from django.utils import timezone
from PIL import Image, UnidentifiedImageError
from .catalog import EMPTY_DOC, KINDS
from .documents import (
    plain_text,
    reference_ids,
    render,
    reader_document,
    validate_document,
)
from .models import World, Resource, Revision, Connection, Asset, Activity
from .tools import calendar_config, integer, calculate


class Conflict(ValueError):
    pass


class Limit(ValueError):
    pass


def check_json(value, limit=1500000):
    try:
        size = len(json.dumps(value, ensure_ascii=False, allow_nan=False))
    except (ValueError, TypeError, RecursionError) as e:
        raise ValueError("Use valid, finite JSON values.") from e
    if size > limit:
        raise Limit("This record is too large. Split it into smaller entries.")


def owned_world(user, world_id):
    try:
        return World.objects.get(id=world_id, owner=user)
    except (World.DoesNotExist, ValueError):
        raise Http404("World not found.")


def owned_resource(user, resource_id):
    try:
        return Resource.objects.select_related("world", "parent").get(
            id=resource_id, world__owner=user
        )
    except (Resource.DoesNotExist, ValueError):
        raise Http404("Entry not found.")


def short(value, name, maxlen, empty=True):
    if (
        not isinstance(value, str)
        or len(value) > maxlen
        or (not empty and not value.strip())
    ):
        raise ValueError(
            f"{name} must be text"
            + (
                f" with 1–{maxlen} characters."
                if not empty
                else f" up to {maxlen} characters."
            )
        )
    return value.strip() if name in ("Title", "Name") else value


def strings(value, name):
    if not isinstance(value, list) or len(value) > 60:
        raise ValueError(f"{name} must be a list of up to 60 names.")
    return list(dict.fromkeys(short(v, name, 100, False).strip() for v in value))


def validate_data(
    kind, data, world, historical_snapshot=False, previous_data=None, resource_id=None
):
    if not isinstance(data, dict):
        raise ValueError("Entry details must be an object.")
    check_json(data)
    from .manuscripts import validate as validate_manuscript
    validate_manuscript(kind, data, world)
    if 'reusable_snippet' in data:
        if kind!='article' or type(data['reusable_snippet']) is not bool:
            raise ValueError('Reusable snippets must be article entries.')
        short(data.get('snippet_collection',''),'Snippet collection',120)
    from .campaigns import validate_campaign_record

    validate_campaign_record(kind, data, world, historical_snapshot, previous_data)
    from .planning import validate_planning

    validate_planning(kind, data, world, historical_snapshot, previous_data)
    from .continuity import validate as validate_continuity

    validate_continuity(
        kind, data, world, historical_snapshot, previous_data, resource_id
    )
    from .notebooks import validate as validate_notebook

    validate_notebook(kind, data, world, historical_snapshot, previous_data, resource_id)
    if kind == "folder":
        from .organization import collection_rules

        collection_rules(data)
    list_keys = {
        "map": ("markers", "layers"),
        "board": ("cards", "connections"),
        "template": ("fields",),
        "tree": ("items",),
        "campaign": ("party", "inventory"),
        "table": ("columns", "rows"),
        "generator": ("columns", "rows"),
        "statblock": ("formulas",),
    }
    for key in list_keys.get(kind, ()):
        if key in data and (not isinstance(data[key], list) or len(data[key]) > 5000):
            raise ValueError(key + " must be a list with at most 5,000 items.")
    if (
        kind in ("article", "character", "statblock")
        and "fields" in data
        and not isinstance(data["fields"], dict)
    ):
        raise ValueError("Fields must be an object.")
    if kind == "template":
        from .structured import definitions
        definitions(data.get('fields',[]))
    if kind == "campaign":
        for member in data.get("party", []):
            if not Resource.objects.filter(id=member, world=world).exists():
                raise ValueError("Party members must belong to this world.")
        for item in data.get("inventory", []):
            if not isinstance(item, dict):
                raise ValueError("Invalid inventory item.")
            short(item.get("name"), "Item name", 180, False)
            integer(item.get("quantity", 1), "Item quantity", 0, 1000000)
    if kind == "tree":
        from .graphs import validate_tree

        validate_tree(data, world)
    if kind == "relationship":
        from .relationship_views import validate_relationship

        validate_relationship(data, world)
    if kind == "calendar":
        calendar_config(data)
        if "moon_cycle" in data:
            integer(data["moon_cycle"], "Moon cycle", 1, 1000000)
    if kind == "board":
        card_ids = set()
        for card in data.get("cards", []):
            if (
                not isinstance(card, dict)
                or not isinstance(card.get("id"), str)
                or card["id"] in card_ids
            ):
                raise ValueError("Every board card needs a unique ID.")
            card_ids.add(card["id"])
            short(card.get("text", ""), "Board note", 20000)
            for axis in ("x", "y"):
                number = card.get(axis, 0)
                if (
                    isinstance(number, bool)
                    or not isinstance(number, (int, float))
                    or not 0 <= number <= 10000
                ):
                    raise ValueError(
                        "Board positions must be numbers between zero and 10,000."
                    )
        for edge in data.get("connections", []):
            if (
                not isinstance(edge, dict)
                or edge.get("source") not in card_ids
                or edge.get("target") not in card_ids
            ):
                raise ValueError("Board connections must join existing cards.")
    if kind == "map":
        from .cartography import validate_map

        validate_map(data, world, historical_snapshot, previous_data)
    if kind in ("event", "era", "timeline"):
        from .history import validate_event, validate_timeline

        if kind in ("event", "era"):
            validate_event(data, world, historical_snapshot, era=kind == "era")
        else:
            validate_timeline(data, world)
    if kind in ("table", "generator"):
        from .rolltables import validate as validate_table
        validate_table(data, world, historical_snapshot)
    if kind == "statblock":
        values = data.get("fields", {})
        for formula in data.get("formulas", []):
            if not isinstance(formula, dict):
                raise ValueError("Invalid calculation.")
            calculate(formula.get("expression", "0"), values)

    from .documents import safe_url
    if "cover_url" in data and (not isinstance(data["cover_url"], str) or data["cover_url"] and not safe_url(data["cover_url"], True)):
        raise ValueError("Use a direct HTTP or HTTPS portrait image URL.")

    def refs(node):
        if isinstance(node, dict):
            for key, val in node.items():
                if (
                    key in ("asset_id", "cover_asset", "icon_asset_id")
                    and val
                    and not Asset.objects.filter(id=val, world=world).exists()
                ):
                    raise ValueError("Choose media from this world.")
                if (
                    key
                    in (
                        "link_id",
                        "calendar_id",
                        "era_id",
                        "campaign_id",
                        "map_id",
                        "resource_id",
                    )
                    and val
                    and not Resource.objects.filter(id=val, world=world).exists()
                ):
                    raise ValueError("Choose an entry from this world.")
                refs(val)
        elif isinstance(node, list):
            for child in node:
                refs(child)

    refs(data)
    return copy.deepcopy(data)


def fields_for(payload, world, current=None, historical_snapshot=False, schema_update=False):
    allowed = {
        "title",
        "summary",
        "kind",
        "template",
        "document",
        "source",
        "private_notes",
        "tags",
        "aliases",
        "data",
        "parent",
        "position",
        "visibility",
        "status",
        "expected_revision",
    }
    if not isinstance(payload, dict) or set(payload) - allowed:
        raise ValueError("This entry contains unsupported fields.")
    base = (
        snapshot(current)
        if current
        else {
            "title": "Untitled entry",
            "summary": "",
            "kind": "article",
            "template": "generic",
            "document": EMPTY_DOC,
            "source": "",
            "private_notes": "",
            "tags": [],
            "aliases": [],
            "data": {},
            "parent": None,
            "position": 0,
            "visibility": "private",
            "status": "draft",
        }
    )
    base.update({k: v for k, v in payload.items() if k != "expected_revision"})
    kind = base["kind"]
    if kind not in KINDS:
        raise ValueError("Unsupported entry type.")
    if current and kind != current.kind:
        raise ValueError("An existing entry cannot change its module type.")
    if (
        current
        and kind == "folder"
        and isinstance(base["data"], dict)
        and base["data"].get("collection_type") == "smart"
        and current.children.exists()
    ):
        raise ValueError(
            "Move this collection's existing children before changing it into a saved filter."
        )
    if current and kind in ("event", "era") and isinstance(base["data"], dict):
        # Calendar revisions do not invalidate unrelated edits to an already recorded date.
        date_keys = (
            "calendar_id",
            "year",
            "month",
            "day",
            "end_year",
            "end_month",
            "end_day",
            "date_precision",
            "end_precision",
            "date_approximate",
            "end_approximate",
            "era_id",
            "special_day_id",
            "end_special_day_id",
            "recurrence",
        )
        historical_snapshot = historical_snapshot or all(
            base["data"].get(key) == current.data.get(key) for key in date_keys
        )
    from .structured import prepare
    field_data=prepare(kind,base['template'],base['data'],world,current,historical_snapshot,schema_update) if isinstance(base['data'],dict) else base['data']
    result = {
        "kind": kind,
        "title": short(base["title"], "Title", 180, False),
        "template": short(base["template"], "Template", 60, False),
        "summary": short(base["summary"], "Summary", 5000),
        "source": short(base["source"], "Source", 2000000),
        "private_notes": short(base["private_notes"], "GM notes", 200000),
        "tags": strings(base["tags"], "Tags"),
        "aliases": strings(base["aliases"], "Aliases"),
        "data": validate_data(
            kind,
            field_data,
            world,
            historical_snapshot,
            current.data if current else None,
            current.id if current else None,
        ),
        "document": validate_document(base["document"]),
        "position": integer(base["position"], "Position", -100000, 100000),
    }
    if current and kind == "map" and not historical_snapshot:
        from .cartography import retain_group_privacy

        retain_group_privacy(result["data"], current.data)
    if kind == "campaign":
        from .workbench import validate_workspace

        validate_workspace(result["data"], world, current, historical_snapshot)
    if base["visibility"] not in ("public", "private"):
        raise ValueError("Choose private or reader-visible.")
    if base["status"] not in ("draft", "wip", "done"):
        raise ValueError("Choose a valid work state.")
    result.update(visibility=base["visibility"], status=base["status"])
    from .annotations import validate as validate_annotation
    validate_annotation(kind, result['data'], world, result['visibility'], current.id if current else None)
    if current and current.data.get('annotation_source_id'):
        protected = ('annotation_source_id', 'annotation_source_revision', 'annotation_key', 'annotation_fingerprint')
        if any(result['data'].get(key) != current.data.get(key) for key in protected):
            raise ValueError('Keep the research note source and capture identity. Copy its prose into a separate article to publish or reattribute it.')
    parent = base["parent"]
    if parent:
        try:
            parent_obj = Resource.objects.get(id=parent, world=world, deleted_at=None)
        except (Resource.DoesNotExist, ValueError):
            raise ValueError("Choose a parent from this world.")
        if (
            parent_obj.kind == "folder"
            and parent_obj.data.get("collection_type") == "smart"
        ):
            raise ValueError(
                "A saved filter collects matches automatically. Choose a folder parent instead."
            )
        seen = set()
        node = parent_obj
        while node:
            if str(node.id) in seen or (current and node.id == current.id):
                raise ValueError("An entry cannot be its own ancestor.")
            seen.add(str(node.id))
            node = node.parent
        result["parent_id"] = str(parent_obj.id)
    else:
        result["parent_id"] = None
    from .liveblocks import validate_document_blocks
    validate_document_blocks(result['document'], world)
    for ref in reference_ids(result["document"]):
        try:
            valid = Resource.objects.filter(id=ref, world=world).exists()
        except ValueError:
            valid = False
        if not valid:
            raise ValueError(
                "An inserted reference is no longer available in this world."
            )

    def image_refs(node):
        if node.get("type") == "image" and node["attrs"]["src"].startswith("/media/"):
            asset_id = node["attrs"]["src"].split("/")[-1]
            if not Asset.objects.filter(id=asset_id, world=world).exists():
                raise ValueError("Choose media from this world.")
        if node.get("type") == "heading":
            integer(node.get("attrs", {}).get("level", 2), "Heading level", 1, 6)
        for child in node.get("content", []):
            image_refs(child)

    image_refs(result["document"])
    check_json(result, 3500000)
    return result


def snapshot(resource):
    return {
        key: copy.deepcopy(getattr(resource, key))
        for key in (
            "title",
            "summary",
            "kind",
            "template",
            "document",
            "source",
            "private_notes",
            "tags",
            "aliases",
            "data",
            "position",
            "visibility",
            "status",
        )
    } | {"parent": str(resource.parent_id) if resource.parent_id else None}


def ensure_search():
    if connection.vendor != "sqlite":
        return False
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "CREATE VIRTUAL TABLE IF NOT EXISTS wb_search USING fts5(id UNINDEXED, world UNINDEXED, title, content, aliases, tags, tokenize='unicode61')"
            )
        return True
    except Exception:
        return False


def index_resource(resource):
    if not ensure_search():
        return
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM wb_search WHERE id=%s", [str(resource.id)])
        if not resource.deleted_at:
            norm = lambda text: unicodedata.normalize("NFKC", text).casefold()
            cursor.execute(
                "INSERT INTO wb_search(id,world,title,content,aliases,tags) VALUES(%s,%s,%s,%s,%s,%s)",
                [
                    str(resource.id),
                    str(resource.world_id),
                    norm(resource.title),
                    norm(
                        plain_text(resource.document)
                        + " "
                        + resource.summary
                        + " "
                        + resource.private_notes
                        + " "
                        + json.dumps(resource.data, ensure_ascii=False)
                    ),
                    norm(" ".join(resource.aliases)),
                    norm(" ".join(resource.tags)),
                ],
            )


def save_resource(world, payload, current=None, restore=False, schema_update=False):
    with transaction.atomic():
        fields = fields_for(payload, world, current, historical_snapshot=restore, schema_update=schema_update)
        data = fields["data"]
        if fields["kind"] == "note" and data.get("record_type") == "campaign-floor":
            floors = world.resources.filter(kind="note", deleted_at=None,
                data__record_type="campaign-floor", data__campaign_id=data["campaign_id"],
                data__floor_number=data["floor_number"])
            if current:
                floors = floors.exclude(id=current.id)
            if floors.exists():
                raise Conflict("This campaign already has that floor number.")
        if restore and current and current.data.get("continuity_type") == "item":
            # Restoring prose must not silently reverse later stock transactions.
            fields["data"]["holdings"] = copy.deepcopy(current.data.get("holdings", []))
            fields["data"]["campaign_id"] = current.data.get("campaign_id", "")
            fields["data"]["continuity_type"] = "item"
        if restore:
            fields["deleted_at"] = None
        if current:
            expected = payload.get("expected_revision")
            if (
                isinstance(expected, bool)
                or not isinstance(expected, int)
                or expected != current.revision
            ):
                raise Conflict(
                    "This entry changed in another tab. Your edits are kept here. Reload the saved version or copy your changes before continuing."
                )
            changed = Resource.objects.filter(id=current.id, revision=expected).update(
                **fields, revision=expected + 1, updated_at=timezone.now()
            )
            if not changed:
                raise Conflict("Another tab saved first. Reload before saving again.")
            current.refresh_from_db()
            resource = current
        else:
            resource = Resource.objects.create(world=world, **fields)
        Revision.objects.create(
            resource=resource, number=resource.revision, snapshot=snapshot(resource)
        )
        index_resource(resource)
        Activity.objects.create(
            world=world,
            kind="updated" if current else "created",
            title=resource.title,
            data={"resource_id": str(resource.id), "kind": resource.kind},
        )
    return resource


def public_references(world):
    return {
        str(r.id): {
            "id": str(r.id),
            "kind": r.kind,
            "title": r.published.get("title", r.title),
            "aliases": r.published.get("aliases", []),
            "data": r.published.get("data", {}),
            'document': r.published.get('document') if r.published.get('data',{}).get('reusable_snippet') else None,
        }
        for r in Resource.objects.filter(
            world=world, deleted_at=None, visibility="public", published__isnull=False
        ) if not r.data.get('annotation_source_id') and not r.published.get('data', {}).get('annotation_source_id')
    }


def serialize(resource, full=True, reader=False, references=None):
    if reader and (resource.data.get('annotation_source_id') or (resource.published or {}).get('data', {}).get('annotation_source_id')):
        return None
    value = snapshot(resource)
    if reader:
        if (
            not resource.published
            or resource.visibility != "public"
            or resource.deleted_at
        ):
            return None
        value = copy.deepcopy(resource.published)
        value["private_notes"] = ""
        value["source"] = ""
        value["document"] = reader_document(value["document"])
        from .continuity import reader_data

        value["data"] = reader_data(value["data"])
        from .notebooks import reader_data as reader_notebook_data

        value["data"] = reader_notebook_data(value["data"])
        # Named draft sets and research notes are owner work, even when a book
        # snapshot was published before this integration was installed.
        value['data'] = {key: item for key, item in value['data'].items() if key not in ('writing_checkpoints', 'writing_research')}
        if value['kind'] in ('table', 'generator'):
            # Linked generation is owner-only; do not publish private step labels/IDs.
            value['data'].pop('generator_steps', None)
            if references is None:
                references = public_references(resource.world)
            link_columns = [c['id'] for c in value['data'].get('columns', []) if c.get('type') == 'article']
            for row in value['data'].get('rows', []):
                for key in link_columns:
                    if row.get('cells', {}).get(key) not in references:
                        row.setdefault('cells', {})[key] = ''
        if value['kind'] in ('manuscript', 'chapter', 'scene'):
            if references is None:
                references = public_references(resource.world)
            if 'writing_include' in value['data']:
                value['data']['writing_include'] = [identity for identity in value['data']['writing_include'] if identity in references]
            if value.get('parent') not in references:
                value['parent'] = None
        if (
            value["kind"] in ("campaign", "session", "note", "task", "quest")
            or value["data"].get("planning_type")
            or value["data"].get("continuity_type")
        ):
            from .campaigns import reader_campaign_data

            if references is None:
                references = public_references(resource.world)
            value["data"] = reader_campaign_data(value["data"], references)
            from .planning import reader_planning

            value["data"] = reader_planning(value["data"], references)
            if value.get("parent") not in references:
                value["parent"] = None
        if value["kind"] in ("map", "event", "era", "timeline"):
            from .cartography import reader_context_data

            if references is None:
                references = public_references(resource.world)
            value["data"] = reader_context_data(
                value["kind"], value["data"], references
            )
        if value["kind"] in ("tree", "relationship"):
            from .graphs import reader_tree
            from .relationship_views import reader_relationship

            if references is None:
                references = public_references(resource.world)
            value["data"] = (
                reader_tree if value["kind"] == "tree" else reader_relationship
            )(value["data"], references)
            if value.get("parent") not in references:
                value["parent"] = None
        value["data"].pop("provenance", None)
        value["data"].pop("gm_notes", None)
        if value['template'].startswith('custom:') and value['data'].get('structured_schema'):
            from .structured import project
            if references is None:references=public_references(resource.world)
            project(value['data'],references,True)
    value.update(
        id=str(resource.id),
        world_id=str(resource.world_id),
        revision=resource.revision,
        published_revision=resource.published.get("_revision")
        if resource.published
        else None,
        updated_at=resource.updated_at.isoformat(),
        created_at=resource.created_at.isoformat(),
        deleted_at=resource.deleted_at.isoformat() if resource.deleted_at else None,
    )
    if not (reader and value['kind'] in ('manuscript', 'chapter', 'scene')) and resource.parent_id and resource.parent and resource.parent.deleted_at:
        value["parent"] = None
    if full:
        if references is None:
            refs = Resource.objects.filter(world=resource.world, deleted_at=None)
            if reader:
                refs = refs.filter(visibility="public", published__isnull=False)
            references = {
                str(r.id): {
                    "id": str(r.id),
                    "kind": r.kind,
                    "title": (r.published or {}).get("title", r.title)
                    if reader
                    else r.title,
                    "data": (r.published or {}).get("data", {}) if reader else r.data,
                    'document': ((r.published or {}).get('document') if reader else r.document) if ((r.published or {}).get('data',{}) if reader else r.data).get('reusable_snippet') else None,
                    "aliases": (r.published or {}).get("aliases", [])
                    if reader
                    else r.aliases,
                }
                for r in refs
                if not reader or (not r.data.get('annotation_source_id') and not (r.published or {}).get('data', {}).get('annotation_source_id'))
            }

        if resource.kind in ("event", "era"):
            from .historical_dates import date_projection
            from .history import era_warning

            cal = references.get(value["data"].get("calendar_id"), {})
            missing_calendar = (
                bool(value["data"].get("calendar_id")) and cal.get("kind") != "calendar"
            )
            value["date_context"] = date_projection(
                {
                    **value["data"],
                    **({"calendar_unavailable": True} if missing_calendar else {}),
                },
                cal.get("data") if cal.get("kind") == "calendar" else None,
                era=resource.kind == "era",
            )
            period = references.get(value["data"].get("era_id"), {})
            if period.get("kind") == "era":
                value["date_context"]["era_label"] = period["title"]
                warning = era_warning(
                    value["data"],
                    period["data"],
                    cal.get("data") if cal.get("kind") == "calendar" else None,
                )
                if warning:
                    value["date_context"]["era_warning"] = warning

        if value['template'].startswith('custom:'):
            from .structured import project
            project(value['data'],references,reader)
        def labels(node):
            if node.get("type") in ("resourceLink", "variable", "snippet", "sourceBlock"):
                ref = references.get(str(node.get("attrs", {}).get("id")))
                if ref:
                    node.setdefault("attrs", {})["label"] = (
                        str(ref["data"].get("value", ref["title"]))
                        if node["type"] == "variable"
                        else ref["title"]
                    )
                elif reader:
                    node["attrs"] = {"label": "Unavailable reference"}
            for child in node.get("content", []):
                labels(child)

        labels(value["document"])
        value["html"] = render(
            value["document"],
            references,
            reader,
            auto_links=resource.world.data.get("auto_link_names", True) is not False,
            exclude=str(resource.id),
        )
        value["word_count"] = len(plain_text(value["document"], reader).split())
        if value['template'].startswith('custom:'):
            from .structured import render_fields
            value['structured_html']=render_fields(value['data'],references,reader)
        try:
            if resource.kind == "statblock":
                value["computed"] = {
                    row["name"]: calculate(
                        row["expression"], value["data"].get("fields", {})
                    )
                    for row in value["data"].get("formulas", [])
                }
        except (ValueError, KeyError, SyntaxError):
            value["computed"] = {}
    else:
        value["word_count"] = len(plain_text(value["document"], reader).split())
        value.pop("document", None)
        value.pop("source", None)
        value.pop("private_notes", None)
    return value


def search_resources(world, query, reader=False, trash=False):
    qs = Resource.objects.filter(world=world, deleted_at__isnull=not trash)
    query = unicodedata.normalize("NFKC", query[:200]).casefold().strip()
    if reader:
        references = public_references(world)
        values = [
            serialize(r, False, True, references)
            for r in qs.filter(visibility="public", published__isnull=False)
        ]
        values = [v for v in values if v is not None]
        if query:
            values = [
                v
                for v in values
                if query
                in unicodedata.normalize(
                    "NFKC", json.dumps(v, ensure_ascii=False)
                ).casefold()
                or query
                in plain_text(
                    Resource.objects.get(id=v["id"]).published["document"], True
                ).casefold()
            ]
        return values
    if query:
        ids = set()
        if len(query) >= 3 and ensure_search():
            tokens = re.findall(r"[^\W_]+", query, re.UNICODE)
            if tokens:
                term = " AND ".join(
                    '"' + t.replace('"', '""') + '"*' for t in tokens[:12]
                )
                try:
                    with connection.cursor() as cursor:
                        cursor.execute(
                            "SELECT id FROM wb_search WHERE wb_search MATCH %s AND world=%s LIMIT 1000",
                            [term, str(world.id)],
                        )
                        ids = {str(row[0]) for row in cursor.fetchall()}
                except Exception:
                    pass
        found = []
        for r in qs:
            haystack = unicodedata.normalize(
                "NFKC",
                r.title
                + " "
                + r.summary
                + " "
                + " ".join(r.aliases + r.tags)
                + " "
                + plain_text(r.document)
                + " "
                + r.private_notes
                + " "
                + json.dumps(r.data, ensure_ascii=False),
            ).casefold()
            if str(r.id) in ids or query in haystack:
                found.append(r)
        return [serialize(r, False) for r in found]
    return [serialize(r, False) for r in qs]


def store_asset(world, upload, credit="", tags=None, *, save_original=None):
    tags = strings(tags if tags is not None else [], "Media tags")
    credit = short(credit, "Credit", 300)
    contents = upload.read(25 * 1024 * 1024 + 1)
    if not contents or len(contents) > 25 * 1024 * 1024:
        raise Limit("Choose an image no larger than 25 MB.")
    try:
        with Image.open(io.BytesIO(contents)) as image:
            if image.format not in ("PNG", "JPEG", "WEBP", "GIF"):
                raise ValueError("Supported images: PNG, JPEG, WebP and GIF.")
            width, height = image.size
            if width * height > 40000000:
                raise Limit("Choose an image with at most 40 million pixels.")
            fmt = image.format
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ValueError("That file is not a supported, valid image.") from e
    if save_original is not None:
        save_original(upload.name, contents, fmt)
    digest = hashlib.sha256(contents).hexdigest()
    existing = Asset.objects.filter(world=world, digest=digest).first()
    if existing:
        return existing
    ext = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp", "GIF": ".gif"}[fmt]
    name = uuid.uuid4().hex + ext
    target = settings.MEDIA_ROOT / name
    with target.open("xb") as stream:
        stream.write(contents)
    try:
        return Asset.objects.create(
            world=world,
            filename=Path(getattr(upload, "name", "image")).name[:200],
            storage_name=name,
            mime=Image.MIME[fmt],
            digest=digest,
            size=len(contents),
            width=width,
            height=height,
            credit=credit,
            tags=tags,
        )
    except Exception:
        target.unlink(missing_ok=True)
        raise


def asset_json(asset):
    return {
        "id": str(asset.id),
        "world_id": str(asset.world_id),
        "name": asset.filename,
        "url": "/media/" + str(asset.id),
        "size": asset.size,
        "width": asset.width,
        "height": asset.height,
        "credit": asset.credit,
        "digest": asset.digest,
        "tags": asset.tags,
        "revision": asset.revision,
    }


def connection_json(edge):
    return {
        "id": str(edge.id),
        "revision": edge.revision,
        "deleted_at": edge.deleted_at.isoformat() if edge.deleted_at else None,
        "created_at": edge.created_at.isoformat(),
        "updated_at": edge.updated_at.isoformat(),
        "source": str(edge.source_id),
        "target": str(edge.target_id),
        "kind": edge.kind,
        "label": edge.label,
        "strength": edge.strength,
        "notes": edge.notes,
        "visibility": edge.visibility,
    }


def checked_archive(contents, expected_format=None):
    if len(contents) > 512 * 1024 * 1024:
        raise Limit("The archive exceeds the 512 MB import limit.")
    try:
        archive = zipfile.ZipFile(io.BytesIO(contents))
        entries = archive.infolist()
        if (
            len(entries) > 20000
            or sum(i.file_size for i in entries) > 1024 * 1024 * 1024
        ):
            raise Limit("This archive expands beyond the supported limit.")
        names = [i.filename for i in entries]
        if len(names) != len(set(names)):
            raise ValueError("Archive has duplicate filenames.")
        for item in entries:
            path = Path(item.filename)
            if (
                path.is_absolute()
                or ".." in path.parts
                or "\\" in item.filename
                or ":" in item.filename
                or (item.external_attr >> 16) & 0o170000 == 0o120000
            ):
                raise ValueError("Archive contains an unsafe path.")
        manifest = json.loads(archive.read("manifest.json"))
        if not isinstance(manifest, dict) or not isinstance(
            manifest.get("files"), dict
        ):
            raise ValueError("The archive manifest is invalid.")
        if manifest.get("format") not in (
            "worldbuilder-world-v1",
            "worldbuilder-backup-v1",
        ) or (expected_format and manifest["format"] != expected_format):
            raise ValueError("Choose the correct WorldBuilder archive type.")
        if set(manifest.get("files", {})) != set(names) - {"manifest.json"}:
            raise ValueError("The archive manifest does not match its files.")
        for name, digest in manifest["files"].items():
            if (
                not isinstance(digest, str)
                or hashlib.sha256(archive.read(name)).hexdigest() != digest
            ):
                raise ValueError("Archive integrity check failed for " + name)
        return archive, manifest
    except (
        zipfile.BadZipFile,
        KeyError,
        json.JSONDecodeError,
        UnicodeDecodeError,
        RecursionError,
    ) as e:
        raise ValueError("The file is not a complete WorldBuilder archive.") from e


def pack_archive(files, fmt):
    if (
        len(files) > 19999
        or sum(len(value) for value in files.values()) > 1024 * 1024 * 1024
    ):
        raise Limit(
            "This release supports archives up to 1 GB expanded and 19,999 files. Use a filesystem backup for a larger installation."
        )
    output = io.BytesIO()
    manifest = {
        "format": fmt,
        "created_at": timezone.now().isoformat(),
        "files": {
            name: hashlib.sha256(data).hexdigest() for name, data in files.items()
        },
    }
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
        archive.writestr(
            "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2)
        )
    contents = output.getvalue()
    if len(contents) > 512 * 1024 * 1024:
        raise Limit(
            "This archive exceeds the 512 MB compressed restore limit. Use a filesystem backup for a larger installation."
        )
    return contents


def world_archive(world):
    from .connection_history import export as export_connection

    resources = list(Resource.objects.filter(world=world))
    assets = list(Asset.objects.filter(world=world))
    data = {
        "world": {
            "name": world.name,
            "tagline": world.tagline,
            "description": world.description,
            "data": world.data,
        },
        "resources": [
            {**serialize(r, True), **snapshot(r), "published_snapshot": r.published}
            for r in resources
        ],
        "connections": [
            export_connection(c) for c in Connection.objects.filter(world=world)
        ],
        "assets": [
            {**asset_json(a), "storage_name": a.storage_name, "mime": a.mime}
            for a in assets
        ],
    }
    files = {
        "world.json": json.dumps(data, ensure_ascii=False, allow_nan=False).encode(
            "utf-8"
        )
    }
    for a in assets:
        files["media/" + a.storage_name] = (
            settings.MEDIA_ROOT / a.storage_name
        ).read_bytes()
    from html import escape

    html = (
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>'
        + escape(world.name)
        + "</title><style>body{max-width:850px;margin:50px auto;padding:20px;font:18px/1.7 Georgia;color:#29352d}img{max-width:100%}article{margin:60px 0;break-before:page}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;background:#f3f3ed;padding:20px}aside{border:1px solid #ad9978;padding:20px}a{color:#315c45}dt{font-weight:bold}dd{margin:0 0 16px}</style><h1>"
        + escape(world.name)
        + "</h1><p>"
        + escape(world.description)
        + "</p><p><strong>Private owner export.</strong> Includes unpublished content and GM notes.</p><nav><ul>"
    )
    for r in resources:
        if not r.deleted_at:
            html += (
                '<li><a href="#entry-'
                + str(r.id)
                + '">'
                + escape(r.title)
                + "</a></li>"
            )
    html += "</ul></nav>"
    for r in resources:
        if not r.deleted_at:
            html += (
                '<article id="entry-'
                + str(r.id)
                + '"><h2>'
                + escape(r.title)
                + "</h2><p>"
                + escape(r.summary)
                + "</p>"
            )
            if r.kind == "map" and r.data.get("asset_id"):
                html += (
                    '<img alt="'
                    + escape(r.title, quote=True)
                    + '" src="/media/'
                    + escape(r.data["asset_id"], quote=True)
                    + '">'
                )
            if r.data.get('structured_schema'):
                html += serialize(r).get('structured_html','')
            elif isinstance(r.data.get("fields"), dict):
                html += (
                    "<dl>"
                    + "".join(
                        "<dt>" + escape(str(k)) + "</dt><dd>" + escape(str(v)) + "</dd>"
                        for k, v in r.data["fields"].items()
                    )
                    + "</dl>"
                )
            html += serialize(r)["html"]
            if r.private_notes:
                html += (
                    "<aside><h3>Private GM notes</h3><p>"
                    + escape(r.private_notes).replace("\n", "<br>")
                    + "</p></aside>"
                )
            if r.data:
                html += (
                    "<details><summary>Structured details</summary><pre>"
                    + escape(json.dumps(r.data, ensure_ascii=False, indent=2))
                    + "</pre></details>"
                )
            html += "</article>"
    for r in resources:
        html = html.replace("/#/entry/" + str(r.id), "#entry-" + str(r.id))
    for a in assets:
        html = html.replace("/media/" + str(a.id), "media/" + a.storage_name)
    html += "</html>"
    files["readable.html"] = html.encode("utf-8")
    return pack_archive(files, "worldbuilder-world-v1")


def make_backup():
    folder = settings.DATA_DIR / "backups"
    folder.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="wb-backup-") as temp:
        snapshot_path = Path(temp) / "worldbuilder.sqlite3"
        db = sqlite3.connect(settings.DATABASES["default"]["NAME"])
        target = sqlite3.connect(snapshot_path)
        try:
            db.backup(target)
        finally:
            target.close()
            db.close()
        snapshot_db = sqlite3.connect(snapshot_path)
        try:
            media_names = [
                row[0]
                for row in snapshot_db.execute("SELECT storage_name FROM studio_asset")
            ]
        finally:
            snapshot_db.close()
        files = {"worldbuilder.sqlite3": snapshot_path.read_bytes()}
        for name in media_names:
            files["media/" + name] = (settings.MEDIA_ROOT / name).read_bytes()
        contents = pack_archive(files, "worldbuilder-backup-v1")
    name = (
        timezone.localtime().strftime("%Y-%m-%d_%H-%M-%S")
        + "_"
        + uuid.uuid4().hex[:6]
        + ".wbbackup.zip"
    )
    temp_target = folder / (name + ".tmp")
    temp_target.write_bytes(contents)
    os.replace(temp_target, folder / name)
    return {
        "name": name,
        "size": len(contents),
        "created_at": timezone.now().isoformat(),
    }


def import_world_archive(user, contents, *, destination=None, finalize=None, created_files_out=None):
    archive, manifest = checked_archive(contents, "worldbuilder-world-v1")
    try:
        payload = json.loads(archive.read("world.json"))
    except (KeyError, json.JSONDecodeError) as e:
        raise ValueError("World data is missing or invalid.") from e
    if not isinstance(payload, dict) or not isinstance(payload.get("world"), dict):
        raise ValueError("World data is missing or invalid.")
    raw = payload.get("resources", [])
    if (
        not isinstance(raw, list)
        or len(raw) > 10000
        or any(not isinstance(row, dict) for row in raw)
    ):
        raise ValueError("Unsupported resource data.")
    old_ids = [row.get("id") for row in raw]
    if any(not isinstance(i, str) for i in old_ids) or len(old_ids) != len(
        set(old_ids)
    ):
        raise ValueError("Imported entry IDs must be unique.")
    assets = payload.get("assets", [])
    edges = payload.get("connections", [])
    if (
        not isinstance(assets, list)
        or not isinstance(edges, list)
        or any(not isinstance(row, dict) for row in assets + edges)
    ):
        raise ValueError("Invalid media or relationship data.")
    edge_ids = [row["id"] for row in edges if row.get("id") is not None]
    all_ids = old_ids + [row.get("id") for row in assets] + edge_ids
    if any(not isinstance(i, str) for i in all_ids) or len(all_ids) != len(
        set(all_ids)
    ):
        raise ValueError("Imported media and entry IDs must be unique.")
    mapping = {old: str(uuid.uuid4()) for old in old_ids + edge_ids}
    created_files = []
    try:
        with transaction.atomic():
            meta = payload["world"]
            name = short(meta.get("name", "Imported world"), "Name", 120, False)
            if not isinstance(meta.get("data", {}), dict):
                raise ValueError("World settings must be an object.")
            check_json(meta.get("data", {}))
            if destination is not None and destination.owner_id != user.id:
                raise ValueError('Choose an owned destination world.')
            world = destination or World.objects.create(
                owner=user,
                name=name + " (restored)" if len(name) < 109 else name,
                tagline=short(meta.get("tagline", ""), "Tagline", 240),
                description=short(meta.get("description", ""), "Description", 100000),
                data=meta.get("data", {}),
            )
            existing_assets = set(world.assets.values_list('id', flat=True))
            for item in payload.get("assets", []):
                source_name = item["storage_name"]
                if not re.fullmatch(r"[a-f0-9]{32}\.(png|jpg|webp|gif)", source_name):
                    raise ValueError("Invalid asset filename.")
                stream = io.BytesIO(archive.read("media/" + source_name))
                stream.name = item.get("name", "image")
                asset = store_asset(
                    world, stream, item.get("credit", ""), item.get("tags", [])
                )
                mapping[item["id"]] = str(asset.id)
                if asset.id not in existing_assets and asset.storage_name not in created_files:
                    created_files.append(asset.storage_name)
                    if created_files_out is not None:
                        created_files_out.append(asset.storage_name)

            def remap(node):
                if isinstance(node, str):
                    if node in mapping:
                        return mapping[node]
                    for old, new in mapping.items():
                        if node.startswith(old + "/objective/"):
                            return new + node[len(old) :]
                        node = (
                            node.replace("/media/" + old, "/media/" + new)
                            .replace("/#/entry/" + old, "/#/entry/" + new)
                            .replace("custom:" + old, "custom:" + new)
                        )
                    return node
                if isinstance(node, list):
                    return [remap(v) for v in node]
                if isinstance(node, dict):
                    return {
                        k: (
                            {remap(child): remap(parent) for child, parent in v.items()}
                            if k in ("parents", "positions") and isinstance(v, dict)
                            else remap(v)
                        )
                        for k, v in node.items()
                    }
                return node

            # Allocate IDs first, so cross references are valid regardless of archive order.
            for row in raw:
                Resource.objects.create(
                    id=mapping[row["id"]],
                    world=world,
                    title="Importing",
                    kind=row["kind"],
                )
            # Resolve relationship-event references before validating resource data.
            from .connection_history import import_connection

            for edge in edges:
                import_connection(world, edge, mapping)
            for row in raw:
                r = Resource.objects.get(id=mapping[row["id"]])
                fields = {k: remap(row[k]) for k in snapshot(r) if k in row}
                fields["parent"] = None
                clean = fields_for(fields, world, r, historical_snapshot=True)
                Resource.objects.filter(id=r.id).update(
                    **clean, revision=1, deleted_at=None, published=None
                )
            # Published data is exported separately below; older archives have just its current visible revision.
            for row in raw:
                r = Resource.objects.get(id=mapping[row["id"]])
                if row.get("parent"):
                    clean = fields_for(
                        {"parent": mapping.get(row["parent"])},
                        world,
                        r,
                        historical_snapshot=True,
                    )
                    r.parent_id = clean["parent_id"]
                    r.save(update_fields=["parent"])
                if row.get("published_snapshot"):
                    public_data = remap(row["published_snapshot"])
                    allowed = set(snapshot(r))
                    fields_for(
                        {k: v for k, v in public_data.items() if k in allowed},
                        world,
                        r,
                        historical_snapshot=True,
                    )
                    r.published = public_data
                    r.save(update_fields=["published"])
                Revision.objects.create(resource=r, number=1, snapshot=snapshot(r))
                index_resource(r)
            for row in raw:
                if row.get("deleted_at"):
                    r = Resource.objects.get(id=mapping[row["id"]])
                    r.deleted_at = timezone.now()
                    r.save(update_fields=["deleted_at"])
                    index_resource(r)
            # Explorer shelves retain original order and point to imported UUIDs.
            if destination is None and 'explorer' in world.data:
                from .explorer import current as explorer_settings
                world.data = {**world.data, 'explorer': remap(world.data['explorer'])}
                shelves = explorer_settings(world)
                available = {str(v) for v in world.resources.values_list('id', flat=True)}
                if any(v not in available for row in shelves['shelves'] for v in row['entries']):
                    raise ValueError('An explorer shelf reference is missing from the archive.')
                world.save(update_fields=['data'])
            # Overview pins are UUID references, not copied links to the source world.
            if destination is None and 'overview' in world.data:
                from .dashboard import validate as validate_overview
                if not isinstance(world.data['overview'], dict):
                    raise ValueError('Overview settings must be an object.')
                overview = remap(world.data['overview'])
                if type(overview.get('revision')) is not int or overview['revision'] < 0:
                    raise ValueError('Invalid overview revision in archive.')
                retained = {'pins': [str(v) for v in world.resources.values_list('id', flat=True)]}
                if isinstance(overview.get('briefing'), dict):
                    # Archived references may intentionally point at recoverable Trash.
                    # The general remapper above already replaced every original UUID.
                    available = set(retained['pins'])
                    briefing = overview['briefing']
                    if any(not isinstance(v, str) for k, v in briefing.items() if k != 'cast') or not isinstance(briefing.get('cast', []), list) or any(not isinstance(v, str) for v in briefing.get('cast', [])):
                        raise ValueError('Invalid campaign briefing references in archive.')
                    if any(v and v not in available for k, v in briefing.items() if k != 'cast') or any(v not in available for v in briefing.get('cast', [])):
                        raise ValueError('A campaign briefing reference is missing from the archive.')
                    retained['briefing'] = briefing
                overview = {**overview, **validate_overview(world, overview, retained)}
                world.data = {**world.data, 'overview': overview}
                world.save(update_fields=['data'])
            if finalize is not None:
                finalize(world, mapping)
            return world
    except Exception:
        for name in created_files:
            (settings.MEDIA_ROOT / name).unlink(missing_ok=True)
        raise
