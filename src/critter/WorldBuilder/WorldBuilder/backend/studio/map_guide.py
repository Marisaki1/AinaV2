"""A campaign map and its place notes, using the existing audience projection."""

from django.http import Http404
from .models import Resource
from .graphs import graph_records, visible_connections
from .campaigns import campaign_members


def map_guide(resource, campaign_id="", marker_id="", reader=False):
    from .services import serialize, public_references

    if resource.deleted_at:
        raise Http404()
    values = graph_records(resource.world, reader)
    current = values.get(str(resource.id))
    if current is None or current["kind"] != "map":
        raise Http404()
    campaign = None
    eligible = set(values)
    if campaign_id:
        campaign = values.get(campaign_id)
        if campaign is None or campaign["kind"] != "campaign":
            raise Http404()
        eligible = campaign_members(campaign, values)
        if str(resource.id) not in eligible:
            raise Http404()
    markers = current["data"].get("markers", [])
    marker = next((row for row in markers if row["id"] == marker_id), None)
    if marker_id and marker is None:
        raise Http404()
    location_id = marker.get("link_id") if marker else None
    references = public_references(resource.world) if reader else values
    records = {
        str(row.id): row
        for row in Resource.objects.filter(world=resource.world, deleted_at=None)
    }

    def full(identity):
        return serialize(records[identity], reader=reader, references=references)

    location = full(location_id) if location_id in values else None
    people = []
    if location:
        for edge in visible_connections(resource.world, reader, values):
            if location_id not in (edge["source"], edge["target"]):
                continue
            identity = (
                edge["target"] if edge["source"] == location_id else edge["source"]
            )
            person = values.get(identity)
            if (
                identity in eligible
                and person
                and (person["kind"] == "character" or person["template"] == "character")
            ):
                people.append(
                    {
                        "entry": {
                            key: person[key]
                            for key in ("id", "title", "kind", "summary")
                        },
                        "relationship": {
                            key: edge[key]
                            for key in (
                                "id",
                                "source",
                                "target",
                                "kind",
                                "label",
                                "strength",
                            )
                        },
                    }
                )
    people.sort(
        key=lambda row: (row["entry"]["title"].casefold(), row["relationship"]["id"])
    )
    matching = []
    for identity in eligible:
        value = values[identity]
        if value["kind"] not in ("note", "session", "task", "quest", "event"):
            continue
        data = value["data"]
        related = data.get("related_entries", [])
        if not isinstance(related, list):
            related = []
        # A reader-safe projection removes hidden marker IDs. Never reinterpret those
        # records as general map notes: preserve their actual scope from the snapshot.
        raw = (
            (records[identity].published or {}).get("data", {})
            if reader
            else records[identity].data
        )
        if reader and raw.get("marker_id") and not data.get("marker_id"):
            continue
        direct = data.get("map_id") == str(resource.id) and (
            not data.get("marker_id")
            or marker is not None
            and data["marker_id"] == marker["id"]
        )
        linked = (
            (
                location_id
                and location_id in values
                and (location_id in related or data.get("link_id") == location_id)
            )
            if marker
            else str(resource.id) in related
        )
        if direct or linked:
            matching.append(value)
    matching.sort(
        key=lambda row: (
            str(row["data"].get("logged_on") or row["updated_at"]),
            row["id"],
        ),
        reverse=True,
    )
    return {
        "map": full(str(resource.id)),
        "campaign": {key: campaign[key] for key in ("id", "title")}
        if campaign
        else None,
        "marker": marker,
        "location": location,
        "people": people[:100],
        "people_total": len(people),
        "records": [full(value["id"]) for value in matching[:200]],
        "record_total": len(matching),
    }
