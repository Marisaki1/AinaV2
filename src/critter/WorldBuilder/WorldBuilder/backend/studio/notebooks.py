"""Original-note notebooks, quick capture, templates and visual references."""

import copy
import hashlib
import html
import json
import math
import re
import uuid
from collections import defaultdict

from django.conf import settings
from django.db import transaction
from django.http import Http404

from .documents import plain_text, reference_ids
from .models import Asset, Resource

CATEGORIES = (
    "note",
    "idea",
    "fact",
    "question",
    "session",
    "npc-conversation",
    "investigation",
    "location-discovery",
    "encounter",
)
PRESETS = {
    "blank": ("Free note", ""),
    "session": (
        "Session notes",
        "Preparation\n\nDuring play\n\nDiscoveries\n\nDecisions\n\nFollow-ups",
    ),
    "npc-conversation": (
        "NPC conversation",
        "Who was present\n\nWhat they said\n\nWhat we learned\n\nPromises and questions",
    ),
    "investigation": (
        "Investigation",
        "Question\n\nClues and sources\n\nWorking theories\n\nNext steps",
    ),
    "location-discovery": (
        "Location discovery",
        "First impressions\n\nPeople and places\n\nDiscoveries\n\nUnfinished business",
    ),
    "encounter": (
        "Encounter notes",
        "Situation\n\nParticipants\n\nWhat happened\n\nConsequences",
    ),
}
PRIVATE_KEYS = (
    "notebook_type",
    "notebook_sections",
    "note_board",
    "note_defaults",
    "note_schema",
    "note_values",
    "note_starred",
    "note_category",
    "note_question_status",
    "note_template_source",
    "note_capture_key",
    "note_capture_fingerprint",
)


def uid(value):
    if not isinstance(value, str):
        raise TypeError("Choose a valid notebook reference.")
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError) as error:
        raise ValueError("Choose a valid notebook reference.") from error
    return value


def validate(kind, data, world, historical=False, previous=None, resource_id=None):
    from .services import short, strings

    previous = previous or {}
    if not any(k in data for k in PRIVATE_KEYS):
        return
    subtype = data.get("notebook_type")
    if subtype and (kind != "article" or subtype not in ("notebook", "template")):
        raise ValueError("Choose a notebook or note template.")

    def ref(value, old=False, subtype=None):
        row = Resource.objects.filter(world=world, id=uid(value)).first()
        if not row or row.deleted_at and not (old or historical):
            raise ValueError("Choose an available original in this world.")
        if (
            subtype
            and not historical
            and not old
            and row.data.get("notebook_type") != subtype
        ):
            raise ValueError("Choose the expected notebook source.")
        return row

    if "note_starred" in data and type(data["note_starred"]) is not bool:
        raise ValueError("A favorite must be checked or unchecked.")
    if data.get("note_category", "note") not in CATEGORIES:
        raise ValueError("Choose a supported note category.")
    if data.get("note_question_status", "open") not in ("open", "resolved"):
        raise ValueError("Choose open or resolved for a question.")
    for key in ("note_template_source",):
        if data.get(key):
            ref(data[key], data[key] == previous.get(key), "template")
    if data.get("note_capture_key"):
        uid(data["note_capture_key"])
        if not re.fullmatch("[0-9a-f]{64}", data.get("note_capture_fingerprint", "")):
            raise ValueError("Invalid capture identity.")
    schema = data.get("note_schema", [])
    if not isinstance(schema, list) or len(schema) > 30:
        raise ValueError("Use at most 30 note metadata fields.")
    definitions = {}
    names = set()
    for field in schema:
        if (
            not isinstance(field, dict)
            or set(field) != {"id", "label", "type"}
            or field.get("type") not in ("text", "number", "check")
        ):
            raise ValueError("Invalid note metadata field.")
        uid(field["id"])
        label = short(field["label"], "Metadata label", 120, False)
        if field["id"] in definitions or label.casefold() in names:
            raise ValueError("Metadata fields need unique IDs and labels.")
        definitions[field["id"]] = field
        names.add(label.casefold())
    values = data.get("note_values", {})
    if not isinstance(values, dict) or set(values) - set(definitions):
        raise ValueError("Metadata values must match their saved field definitions.")
    for key, value in values.items():
        typ = definitions[key]["type"]
        if typ == "text":
            short(value, "Metadata value", 5000)
        elif typ == "number" and (
            type(value) not in (int, float)
            or not math.isfinite(value)
            or abs(value) > 1e12
        ):
            raise ValueError("Metadata numbers must be finite and within 1 trillion.")
        elif typ == "check" and type(value) is not bool:
            raise ValueError("Checkbox metadata must be checked or unchecked.")
    defaults = data.get("note_defaults", {})
    if not isinstance(defaults, dict) or set(defaults) - {
        "tags",
        "category",
        "related_entries",
    }:
        raise ValueError("Invalid note template defaults.")
    strings(defaults.get("tags", []), "Default tags")
    if defaults.get("category", "note") not in CATEGORIES:
        raise ValueError("Choose a supported template note category.")
    related = defaults.get("related_entries", [])
    if (
        not isinstance(related, list)
        or len(related) > 100
        or any(not isinstance(v, str) for v in related)
        or len(set(related)) != len(related)
    ):
        raise ValueError("Choose up to 100 template source references.")
    for value in related:
        ref(
            value, value in previous.get("note_defaults", {}).get("related_entries", [])
        )
    sections = data.get("notebook_sections", [])
    if not isinstance(sections, list) or len(sections) > 100:
        raise ValueError("Use at most 100 notebook sections.")
    ids = set()
    prior = {s["id"]: s for s in previous.get("notebook_sections", [])}
    for section in sections:
        if not isinstance(section, dict) or set(section) != {
            "id",
            "title",
            "parent_id",
            "entry_ids",
        }:
            raise ValueError("Invalid notebook section.")
        uid(section["id"])
        if section["id"] in ids:
            raise ValueError("Notebook sections must have unique IDs.")
        ids.add(section["id"])
        short(section["title"], "Section title", 120, False)
        entries = section["entry_ids"]
        if (
            not isinstance(entries, list)
            or len(entries) > 500
            or any(not isinstance(v, str) for v in entries)
            or len(set(entries)) != len(entries)
        ):
            raise ValueError("Use up to 500 different originals per section.")
        for value in entries:
            if value == str(resource_id or "") and not historical:
                raise ValueError("A notebook cannot file itself.")
            ref(value, value in prior.get(section["id"], {}).get("entry_ids", []))
    parents = {s["id"]: s["parent_id"] for s in sections}
    for section in sections:
        parent = section["parent_id"]
        seen = {section["id"]}
        while parent:
            if parent not in parents or parent in seen or len(seen) > 8:
                raise ValueError(
                    "Section parents must be available and acyclic, with at most eight levels."
                )
            seen.add(parent)
            parent = parents[parent]
    board = data.get("note_board", {"cards": [], "edges": []})
    if (
        not isinstance(board, dict)
        or set(board) != {"cards", "edges"}
        or not isinstance(board["cards"], list)
        or not isinstance(board["edges"], list)
        or len(board["cards"]) > 150
        or len(board["edges"]) > 300
    ):
        raise ValueError("A note board supports 150 cards and 300 connections.")
    card_ids = set()
    old_cards = {c["id"]: c for c in previous.get("note_board", {}).get("cards", [])}
    for card in board["cards"]:
        if not isinstance(card, dict) or set(card) != {
            "id",
            "entry_id",
            "x",
            "y",
            "caption",
            "color",
        }:
            raise ValueError("Invalid visual note card.")
        uid(card["id"])
        if card["id"] in card_ids:
            raise ValueError("Board cards need unique IDs.")
        card_ids.add(card["id"])
        ref(
            card["entry_id"],
            card["entry_id"] == old_cards.get(card["id"], {}).get("entry_id"),
        )
        short(card["caption"], "Card annotation", 2000)
        if not re.fullmatch("#[0-9a-fA-F]{6}", card["color"]):
            raise ValueError("Choose a valid card color.")
        if any(
            type(card[k]) not in (int, float)
            or not math.isfinite(card[k])
            or not 0 <= card[k] <= 5000
            for k in ("x", "y")
        ):
            raise ValueError(
                "Card positions must be finite coordinates from zero to 5,000."
            )
    edge_ids = set()
    for edge in board["edges"]:
        if (
            not isinstance(edge, dict)
            or set(edge) != {"id", "source", "target", "label"}
            or edge["source"] not in card_ids
            or edge["target"] not in card_ids
            or edge["source"] == edge["target"]
        ):
            raise ValueError("Connect two different cards on this board.")
        uid(edge["id"])
        if edge["id"] in edge_ids:
            raise ValueError("Board connections need unique IDs.")
        edge_ids.add(edge["id"])
        short(edge["label"], "Connection label", 180)


def reader_data(data):
    for key in PRIVATE_KEYS:
        data.pop(key, None)
    return data


def row(world, value, subtype=None):
    result = (
        Resource.objects.select_for_update()
        .filter(world=world, id=uid(value), deleted_at=None)
        .first()
    )
    if not result or subtype and result.data.get("notebook_type") != subtype:
        raise ValueError("Choose an available notebook original.")
    return result


def expected(resource, revision):
    from .services import Conflict

    if type(revision) is not int or revision != resource.revision:
        raise Conflict(
            "This notebook or note changed. Your draft was not applied; reload its current version."
        )


def note_text(resource):
    fields = {f["id"]: f["label"] for f in resource.data.get("note_schema", [])}
    metadata = "\n".join(
        fields[k] + ": " + str(v)
        for k, v in resource.data.get("note_values", {}).items()
        if k in fields
    )
    return (
        plain_text(resource.document)
        + "\n"
        + resource.summary
        + "\n"
        + metadata
        + "\n"
        + resource.private_notes
    )


def desk(world, params):
    from .services import search_resources, serialize
    from .workbench import membership

    originals = {
        str(r.id): r for r in Resource.objects.filter(world=world, deleted_at=None)
    }
    books = [r for r in originals.values() if r.data.get("notebook_type") == "notebook"]
    templates = [
        r for r in originals.values() if r.data.get("notebook_type") == "template"
    ]
    book_id, section_id = params.get("book", ""), params.get("section", "")
    book = originals.get(book_id) if book_id else None
    if book_id and (not book or book not in books):
        raise ValueError("Choose an available notebook.")
    section = (
        next(
            (
                s
                for s in book.data.get("notebook_sections", [])
                if s["id"] == section_id
            ),
            None,
        )
        if book
        else None
    )
    if section_id and not section:
        raise ValueError("Choose an available notebook section.")
    filed = {
        v
        for b in books
        for s in b.data.get("notebook_sections", [])
        for v in s["entry_ids"]
    }
    if book:
        ids = (
            section["entry_ids"]
            if section
            else list(
                dict.fromkeys(
                    v
                    for s in book.data.get("notebook_sections", [])
                    for v in s["entry_ids"]
                )
            )
        )
        candidates = [originals[v] for v in ids if v in originals]
        unavailable = len([v for v in ids if v not in originals])
    else:
        candidates = [r for r in originals.values() if r.kind in ("note", "task")]
        unavailable = 0
    view = params.get("view", "all")
    if view == "inbox":
        candidates = [r for r in candidates if str(r.id) not in filed]
    if view == "favorites":
        candidates = [r for r in candidates if r.data.get("note_starred")]
    if view == "knowledge":
        candidates = [
            r for r in candidates if r.data.get("note_category") in ("fact", "question")
        ]
    if params.get("category"):
        candidates = [
            r
            for r in candidates
            if r.data.get("note_category", "note") == params["category"]
        ]
    if params.get("campaign"):
        candidates = [
            r
            for r in candidates
            if membership({"data": r.data, "parent": str(r.parent_id or "")})
            == params["campaign"]
        ]
    if params.get("tag"):
        candidates = [
            r
            for r in candidates
            if params["tag"].casefold() in {t.casefold() for t in r.tags}
        ]
    query = params.get("q", "").strip()
    if len(query) > 200:
        raise ValueError("Search text must be at most 200 characters.")
    if query:
        hits = {v["id"] for v in search_resources(world, query)}
        candidates = [r for r in candidates if str(r.id) in hits]
    if params.get("metadata"):
        term = params["metadata"].casefold()
        candidates = [
            r
            for r in candidates
            if any(
                term
                in (
                    f["label"]
                    + ": "
                    + str(r.data.get("note_values", {}).get(f["id"], ""))
                ).casefold()
                for f in r.data.get("note_schema", [])
            )
        ]
    sort = params.get("sort", "recent")
    if sort == "title":
        candidates.sort(key=lambda r: (r.title.casefold(), str(r.id)))
    elif sort == "oldest":
        candidates.sort(key=lambda r: (r.created_at, str(r.id)))
    elif sort != "section":
        candidates.sort(key=lambda r: (r.updated_at, str(r.id)), reverse=True)
    try:
        offset = int(params.get("offset", 0))
    except (ValueError, TypeError) as error:
        raise ValueError("Choose a valid results page.") from error
    if offset < 0 or offset > 100000:
        raise ValueError("Choose a valid results page.")
    results = []
    for resource in candidates[offset : offset + 100]:
        value = serialize(resource, False)
        text = note_text(resource)
        match = re.search(re.escape(query), text, re.IGNORECASE) if query else None
        start = max(0, match.start() - 80) if match else 0
        value["note_excerpt"] = ("…" if start else "") + text[start : start + 300]
        results.append(value)
    return {
        "books": [serialize(r, False) for r in books],
        "templates": [serialize(r, False) for r in templates],
        "book": serialize(book) if book else None,
        "presets": [{"id": k, "title": v[0]} for k, v in PRESETS.items()],
        "results": results,
        "total": len(candidates),
        "offset": offset,
        "has_more": offset + 100 < len(candidates),
        "unavailable": unavailable,
        "inbox_count": sum(
            r.kind == "note" and str(r.id) not in filed for r in originals.values()
        ),
    }


def act(world, value):
    from .continuity import text_document
    from .services import save_resource, serialize, short, strings

    with transaction.atomic():
        action = value.get("action")
        if action == "book":
            current = row(world, value["id"], "notebook") if value.get("id") else None
            if current:
                expected(current, value.get("expected_revision"))
            data = {
                **(current.data if current else {}),
                "notebook_type": "notebook",
                "notebook_sections": value.get(
                    "sections",
                    current.data.get("notebook_sections", []) if current else [],
                ),
            }
            result = save_resource(
                world,
                {
                    "title": value.get("title", current.title if current else ""),
                    "data": data,
                    **(
                        {"expected_revision": current.revision}
                        if current
                        else {"kind": "article", "visibility": "private"}
                    ),
                },
                current,
            )
            return {"entry": serialize(result)}
        if action == "template":
            current = row(world, value["id"], "template") if value.get("id") else None
            if current:
                expected(current, value.get("expected_revision"))
            source = row(world, value["source_id"]) if value.get("source_id") else None
            document = (
                copy.deepcopy(source.document)
                if source
                else copy.deepcopy(current.document)
                if current and "text" not in value
                else text_document(value.get("text", ""))
            )
            result = save_resource(
                world,
                {
                    "title": value.get("title", ""),
                    "document": document,
                    "data": {
                        "notebook_type": "template",
                        "note_defaults": value.get("defaults", {}),
                        "note_schema": value.get("schema", []),
                    },
                    **(
                        {"expected_revision": current.revision}
                        if current
                        else {"kind": "article", "visibility": "private"}
                    ),
                },
                current,
            )
            return {"entry": serialize(result)}
        if action == "capture":
            key = uid(value.get("capture_key"))
            fingerprint = hashlib.sha256(
                json.dumps(
                    {k: v for k, v in value.items() if k not in ("expected_revision",)},
                    sort_keys=True,
                    ensure_ascii=False,
                ).encode()
            ).hexdigest()
            old = Resource.objects.filter(
                world=world, data__note_capture_key=key
            ).first()
            if old:
                if (
                    old.data.get("note_capture_fingerprint") != fingerprint
                    or old.deleted_at
                ):
                    raise ValueError(
                        "This capture already exists with different details. Open the original or start a new capture."
                    )
                return {"entry": serialize(old), "replayed": True}
            book = (
                row(world, value["book_id"], "notebook")
                if value.get("book_id")
                else None
            )
            if book:
                expected(book, value.get("expected_revision"))
            section = (
                next(
                    (
                        s
                        for s in book.data.get("notebook_sections", [])
                        if s["id"] == value.get("section_id")
                    ),
                    None,
                )
                if book
                else None
            )
            if book and not section:
                raise ValueError("Choose a section before filing the captured note.")
            template = (
                row(world, value["template_id"], "template")
                if value.get("template_id")
                else None
            )
            preset = value.get("preset", "blank")
            if preset not in PRESETS:
                raise ValueError("Choose a supported note preset.")
            defaults = template.data.get("note_defaults", {}) if template else {}
            document = (
                copy.deepcopy(template.document)
                if template
                else text_document(PRESETS[preset][1])
            )
            if value.get("text"):
                supplied = text_document(value["text"])
                if template or PRESETS[preset][1]:
                    document["content"] += supplied["content"]
                else:
                    document = supplied
            data = {
                "record_type": "note",
                "campaign_id": value.get("campaign_id", ""),
                "session_id": value.get("session_id", ""),
                "related_entries": defaults.get("related_entries", []),
                "note_category": value.get("category")
                or defaults.get("category")
                or (preset if preset in CATEGORIES else "note"),
                "note_starred": False,
                "note_schema": copy.deepcopy(template.data.get("note_schema", []))
                if template
                else [],
                "note_values": {},
                "note_capture_key": key,
                "note_capture_fingerprint": fingerprint,
            }
            if template:
                data["note_template_source"] = str(template.id)
            title = short(
                value.get("title")
                or (
                    value.get("text", "").strip().split("\n")[0][:180]
                    if value.get("text", "").strip()
                    else "Untitled note"
                ),
                "Note title",
                180,
                False,
            )
            note = save_resource(
                world,
                {
                    "title": title,
                    "kind": "note",
                    "visibility": "private",
                    "document": document,
                    "tags": strings(
                        value.get("tags", defaults.get("tags", [])), "Tags"
                    ),
                    "data": data,
                },
            )
            if book:
                sections = copy.deepcopy(book.data["notebook_sections"])
                next(s for s in sections if s["id"] == section["id"])[
                    "entry_ids"
                ].append(str(note.id))
                save_resource(
                    world,
                    {
                        "data": {**book.data, "notebook_sections": sections},
                        "expected_revision": book.revision,
                    },
                    book,
                )
            return {"entry": serialize(note), "replayed": False}
        if action == "metadata":
            current = row(world, value.get("id"))
            expected(current, value.get("expected_revision"))
            allowed = {
                "note_starred",
                "note_category",
                "note_question_status",
                "note_schema",
                "note_values",
                "related_entries",
                "campaign_id",
                "session_id",
            }
            changes = value.get("data", {})
            if not isinstance(changes, dict) or set(changes) - allowed:
                raise ValueError("Choose supported note metadata.")
            result = save_resource(
                world,
                {
                    "data": {**current.data, **changes},
                    "tags": value.get("tags", current.tags),
                    "expected_revision": current.revision,
                },
                current,
            )
            return {"entry": serialize(result)}
        if action in ("file", "unfile", "bulk"):
            selected = value.get("entries", [])
            if not isinstance(selected, list) or not selected or len(selected) > 100:
                raise ValueError("Select one to 100 originals.")
            if any(
                not isinstance(v, dict) or set(v) != {"id", "revision"}
                for v in selected
            ) or len({v["id"] for v in selected}) != len(selected):
                raise ValueError("Select each original once with its current revision.")
            originals = []
            for source in selected:
                current = row(world, source["id"])
                expected(current, source["revision"])
                originals.append(current)
            if action in ("file", "unfile"):
                book = row(world, value.get("book_id"), "notebook")
                expected(book, value.get("expected_revision"))
                sections = copy.deepcopy(book.data.get("notebook_sections", []))
                target = next(
                    (s for s in sections if s["id"] == value.get("section_id")), None
                )
                if not target:
                    raise ValueError("Choose an available section.")
                ids = {str(r.id) for r in originals}
                if str(book.id) in ids:
                    raise ValueError("A notebook cannot file itself.")
                if value.get("move") or action == "unfile":
                    for section in sections:
                        section["entry_ids"] = [
                            v for v in section["entry_ids"] if v not in ids
                        ]
                if action == "file":
                    target["entry_ids"] = list(
                        dict.fromkeys(
                            target["entry_ids"] + [str(r.id) for r in originals]
                        )
                    )
                save_resource(
                    world,
                    {
                        "data": {**book.data, "notebook_sections": sections},
                        "expected_revision": book.revision,
                    },
                    book,
                )
            else:
                tags = strings(value.get("add_tags", []), "Tags")
                if "starred" in value and type(value["starred"]) is not bool:
                    raise ValueError("Choose a valid favorite state.")
                for current in originals:
                    save_resource(
                        world,
                        {
                            "tags": list(dict.fromkeys(current.tags + tags)),
                            "data": {
                                **current.data,
                                **(
                                    {"note_starred": value["starred"]}
                                    if "starred" in value
                                    else {}
                                ),
                            },
                            "expected_revision": current.revision,
                        },
                        current,
                    )
            return {"ids": [str(r.id) for r in originals]}
        if action == "board":
            book = row(world, value.get("book_id"), "notebook")
            expected(book, value.get("expected_revision"))
            result = save_resource(
                world,
                {
                    "data": {**book.data, "note_board": value.get("board")},
                    "expected_revision": book.revision,
                },
                book,
            )
            return {"entry": serialize(result)}
        raise ValueError("Choose a supported notebook action.")


def audit(world):
    rows = {str(r.id): r for r in Resource.objects.filter(world=world, deleted_at=None)}
    names = defaultdict(set)
    broken = []
    for key, r in rows.items():
        for name in [r.title, *r.aliases]:
            if name.strip():
                names[name.casefold().strip()].add(key)
        refs = reference_ids(r.document) | set(r.data.get("related_entries", []))
        refs.update(
            v
            for section in r.data.get("notebook_sections", [])
            for v in section["entry_ids"]
        )
        refs.update(
            c["entry_id"] for c in r.data.get("note_board", {}).get("cards", [])
        )
        missing = refs - set(rows)
        if missing:
            broken.append({"id": key, "title": r.title, "missing_count": len(missing)})
    ambiguous = [
        {
            "name": name,
            "sources": [{"id": key, "title": rows[key].title} for key in sorted(ids)],
        }
        for name, ids in names.items()
        if len(ids) > 1
    ]
    return {
        "broken": broken[:200],
        "broken_total": len(broken),
        "ambiguous": ambiguous[:200],
        "ambiguous_total": len(ambiguous),
    }


def export_book(book, section_id="", private=False):
    import base64

    from .services import public_references, serialize

    if book.deleted_at or book.data.get("notebook_type") != "notebook":
        raise Http404()
    sections = book.data.get("notebook_sections", [])
    if section_id:
        sections = [s for s in sections if s["id"] == section_id]
        if not sections:
            raise ValueError("Choose an available section.")
    ids = list(dict.fromkeys(v for s in sections for v in s["entry_ids"]))
    if len(ids) > 500:
        raise ValueError(
            "Export at most 500 originals; choose a section to narrow the notebook."
        )
    refs = None if private else public_references(book.world)
    values = {}
    for source in Resource.objects.filter(
        world=book.world, id__in=ids, deleted_at=None
    ):
        value = serialize(source, reader=not private, references=refs)
        if value:
            values[str(source.id)] = value
    title = book.title if private else "Published notes"
    body = (
        "<h1>"
        + html.escape(title)
        + "</h1><p>"
        + (
            "Private owner notebook snapshot"
            if private
            else "Published-source notebook snapshot"
        )
        + "</p><nav><ul>"
    )
    for s in sections:
        eligible = [v for v in s["entry_ids"] if v in values]
        if eligible:
            body += (
                '<li><a href="#section-'
                + s["id"]
                + '">'
                + html.escape(s["title"] if private else "Published section")
                + "</a></li>"
            )
    body += "</ul></nav>"
    rendered = set()
    for s in sections:
        eligible = [v for v in s["entry_ids"] if v in values]
        if not eligible:
            continue
        body += (
            '<section id="section-'
            + s["id"]
            + '"><h2>'
            + html.escape(s["title"] if private else "Published section")
            + "</h2>"
        )
        for key in eligible:
            value = values[key]
            if key in rendered:
                body += (
                    '<p><a href="#entry-'
                    + key
                    + '">'
                    + html.escape(value["title"])
                    + "</a></p>"
                )
                continue
            rendered.add(key)
            body += (
                '<article id="entry-'
                + key
                + '"><h3>'
                + html.escape(value["title"])
                + "</h3>"
                + value.get("html", "")
            )
            if private and value.get("private_notes"):
                body += (
                    "<aside><h4>GM notes</h4><p>"
                    + html.escape(value["private_notes"]).replace("\n", "<br>")
                    + "</p></aside>"
                )
            if private:
                fields = value["data"].get("note_schema", [])
                metadata = value["data"].get("note_values", {})
                body += (
                    "<dl>"
                    + "".join(
                        "<dt>"
                        + html.escape(f["label"])
                        + "</dt><dd>"
                        + html.escape(str(metadata.get(f["id"], "")))
                        + "</dd>"
                        for f in fields
                    )
                    + "</dl>"
                )
            body += "</article>"
        body += "</section>"
    total = 0

    def embed(match):
        nonlocal total
        asset = Asset.objects.filter(world=book.world, id=match.group(1)).first()
        if not asset:
            return ""
        content = (settings.MEDIA_ROOT / asset.storage_name).read_bytes()
        total += len(content)
        if total > 30 * 1024 * 1024:
            raise ValueError("Notebook images exceed 30 MB; export a smaller section.")
        return "data:" + asset.mime + ";base64," + base64.b64encode(content).decode()

    body = re.sub(
        r"/media/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
        embed,
        body,
    )
    for key in values:
        body = body.replace("/#/entry/" + key, "#entry-" + key).replace(
            "#/entry/" + key, "#entry-" + key
        )
    return (
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https: http:; style-src \'unsafe-inline\'"><title>'
        + html.escape(title)
        + "</title><style>body{font:17px Georgia,serif;line-height:1.7;max-width:950px;margin:40px auto;padding:20px}img{max-width:100%}article{margin:30px 0}aside{border-left:3px solid #987;padding:12px}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px}</style></head><body>"
        + body
        + "</body></html>"
    )
