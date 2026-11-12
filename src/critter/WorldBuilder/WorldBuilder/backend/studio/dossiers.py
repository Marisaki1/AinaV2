"""Character dossiers combine original lore with audience-filtered campaign records."""

import html
from django.http import Http404
from .models import Resource
from .graphs import graph_records, visible_connections, reference
from .campaigns import campaign_members
from .documents import reference_ids, render
from .auto_links import linker


def character_dossier(resource, campaign_id="", reader=False):
    return entry_dossier(resource, campaign_id, reader)


def is_location(value):
    return value["kind"] == "article" and value["template"] in (
        "settlement",
        "building",
        "geography",
    )


def location_guide(resource, campaign_id="", reader=False):
    return entry_dossier(resource, campaign_id, reader, location=True)


def entry_dossier(resource, campaign_id="", reader=False, location=False):
    from .services import serialize, public_references

    if resource.deleted_at:
        raise Http404()
    values = graph_records(resource.world, reader)
    identity = str(resource.id)
    if identity not in values or not (
        is_location(values[identity])
        if location
        else (
            values[identity]["kind"] == "character"
            or values[identity]["template"] == "character"
        )
    ):
        raise Http404()
    eligible = set(values)
    campaign = None
    if campaign_id:
        campaign = values.get(campaign_id)
        if not campaign or campaign["kind"] != "campaign":
            raise Http404()
        eligible = campaign_members(campaign, values)
        # A campaign map may link a place that was never separately added to its cast.
        if location and any(
            values[key]["kind"] == "map"
            and any(
                marker.get("link_id") == identity
                for marker in values[key]["data"].get("markers", [])
            )
            for key in eligible
        ):
            eligible.add(identity)
        if identity not in eligible:
            raise Http404()
    refs = public_references(resource.world) if reader else values
    rows = {
        str(row.id): row
        for row in Resource.objects.filter(world=resource.world, deleted_at=None)
    }
    full = serialize(resource, reader=reader, references=refs)
    edges = [
        edge
        for edge in visible_connections(resource.world, reader, values)
        if identity in (edge["source"], edge["target"])
        and edge["source"] in eligible
        and edge["target"] in eligible
    ]
    neighbours = {
        edge["target"] if edge["source"] == identity else edge["source"]
        for edge in edges
    }
    ordered = [
        identity,
        *sorted(neighbours, key=lambda key: (values[key]["title"].casefold(), key)),
    ]
    graph_ids = set(ordered[:80])
    graph = {
        "nodes": [
            {
                **reference(values[key]),
                "summary": values[key]["summary"],
                "portrait_asset_id": values[key]["data"].get("cover_asset", ""),
                "portrait_url": values[key]["data"].get("cover_url", ""),
            }
            for key in ordered[:80]
        ],
        "edges": [
            {
                key: edge[key]
                for key in ("id", "source", "target", "kind", "label", "strength")
            }
            for edge in edges
            if edge["source"] in graph_ids and edge["target"] in graph_ids
        ],
        "positions": {},
        "layout": "affinity",
        "warnings": [],
    }
    records = []
    session_ids = set()
    pins = (
        {
            (key, marker["id"])
            for key in eligible
            if values[key]["kind"] == "map"
            for marker in values[key]["data"].get("markers", [])
            if marker.get("link_id") == identity
        }
        if location
        else set()
    )

    def available_scope(key, value):
        raw = (rows[key].published or {}).get("data", {}) if reader else {}
        return not (
            location
            and reader
            and raw.get("marker_id")
            and not value["data"].get("marker_id")
        )

    def sections_for(value):
        if value["kind"] not in ("session", "note", "quest", "task"):
            return {}
        return {
            name: value["data"][name]
            for name in ("prep", "recap", "consequences", "rewards", "next_steps")
            if isinstance(value["data"].get(name), str) and value["data"][name]
        }

    def decorate(value, sections, association):
        link_text = (
            linker(refs, exclude=value["id"])
            if resource.world.data.get("auto_link_names", True) is not False
            else html.escape
        )
        value["dossier_sections"] = {
            name: link_text(text).replace("\n", "<br>")
            for name, text in sections.items()
        }
        value["dossier_association"] = association
        return value

    for key in eligible:
        item = values[key]
        if item["kind"] not in ("note", "session", "quest", "task", "event"):
            continue
        value = serialize(rows[key], reader=reader, references=refs)
        if not available_scope(key, value):
            continue
        related = value["data"].get("related_entries", [])
        explicit = (
            isinstance(related, list)
            and identity in related
            or value["data"].get("link_id") == identity
            or identity in reference_ids(value["document"])
        )
        pinned = (
            location
            and all(
                isinstance(value["data"].get(name), str)
                for name in ("map_id", "marker_id")
            )
            and (value["data"].get("map_id"), value["data"].get("marker_id")) in pins
        )
        sections = sections_for(value)
        match_text = render(
            value["document"], refs, reader, auto_links=True, exclude=key
        )
        matcher = linker(refs, exclude=key)
        named = ('data-resource-id="' + identity + '"') in match_text or any(
            ('data-resource-id="' + identity + '"') in matcher(text)
            for text in sections.values()
        )
        if explicit or named or pinned:
            records.append(
                decorate(
                    value,
                    sections,
                    "linked" if explicit else "map location" if pinned else "mentioned",
                )
            )
            if value["data"].get("session_id"):
                session_ids.add(value["data"]["session_id"])
    included = {value["id"] for value in records}
    for key in session_ids & eligible - included:
        if values[key]["kind"] == "session":
            value = serialize(rows[key], reader=reader, references=refs)
            if not available_scope(key, value):
                continue
            records.append(decorate(value, sections_for(value), "linked session"))
    records.sort(
        key=lambda value: (
            str(
                value["data"].get("logged_on")
                or value["data"].get("date_local")
                or value["updated_at"]
            )[:10],
            value["updated_at"],
            value["id"],
        ),
        reverse=True,
    )
    places = {
        edge["target"]
        for edge in edges
        if edge["source"] == identity and edge["kind"] in ("located-in", "member")
    }
    places.update(
        key
        for key in neighbours
        if values[key]["kind"] == "map"
        or values[key]["template"] in ("settlement", "building", "geography")
    )
    locations = []
    for key in eligible:
        value = values[key]
        if value["kind"] != "map":
            continue
        for marker in value["data"].get("markers", []):
            if marker.get("link_id") in ({identity} | places):
                locations.append(
                    {
                        "map": reference(value),
                        "asset_id": value["data"].get("asset_id", ""),
                        "marker": marker,
                        "place": reference(values[marker["link_id"]])
                        if marker.get("link_id") in values
                        else None,
                    }
                )
    people = (
        [
            {
                "entry": {
                    **reference(values[key]),
                    "summary": values[key]["summary"],
                    "portrait_asset_id": values[key]["data"].get("cover_asset", ""),
                "portrait_url": values[key]["data"].get("cover_url", ""),
                },
                "relationships": [
                    edge for edge in edges if key in (edge["source"], edge["target"])
                ],
                "resident": any(
                    edge["source"] == key
                    and edge["target"] == identity
                    and edge["kind"] == "located-in"
                    for edge in edges
                ),
            }
            for key in ordered[1:]
            if values[key]["kind"] == "character"
            or values[key]["template"] == "character"
        ]
        if location
        else []
    )

    def includes_place(value):
        members = campaign_members(value, values)
        return (
            identity in members
            or location
            and any(
                values[key]["kind"] == "map"
                and any(
                    marker.get("link_id") == identity
                    for marker in values[key]["data"].get("markers", [])
                )
                for key in members
            )
        )

    return {
        "location" if location else "character": full,
        "campaign": reference(campaign) if campaign else None,
        "campaigns": [
            reference(value)
            for value in values.values()
            if value["kind"] == "campaign" and includes_place(value)
        ],
        "graph": graph,
        "relationship_total": len(edges),
        "relationships": [
            {
                **edge,
                "source_title": values[edge["source"]]["title"],
                "target_title": values[edge["target"]]["title"],
            }
            for edge in edges[:200]
        ],
        "records": records[:200],
        "record_total": len(records),
        "locations": sorted(
            locations,
            key=lambda row: (
                row["map"]["title"].casefold(),
                row["marker"].get("label", ""),
            ),
        )[:100],
        "location_total": len(locations),
        **({"people": people[:100], "people_total": len(people)} if location else {}),
    }
