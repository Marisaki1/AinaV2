"""Saved relationship filters and a shared projection for display and export."""

import copy
import math
from django.http import Http404
from .models import Resource
from .graphs import (
    graph_records,
    visible_connections,
    family_view,
    reference,
    hierarchy_view,
)
from .tools import integer


def validate_relationship(data, world):
    from .services import strings

    if set(data) - {
        "mode",
        "root_id",
        "partner_id",
        "direction",
        "depth",
        "adoptive",
        "tags",
        "tag_mode",
        "kinds",
        "include_isolated",
        "layout",
        "positions",
        "campaign_id",
    }:
        raise ValueError("Unsupported relationship view setting.")
    if data.get("mode", "family") not in ("family", "all", "diplomacy"):
        raise ValueError("Choose family, all connections or diplomacy.")
    if data.get("layout", "diagram") not in ("diagram", "affinity"):
        raise ValueError("Choose a diagram or affinity web layout.")
    campaign = data.get("campaign_id", "")
    if not isinstance(campaign, str) or (
        campaign
        and not Resource.objects.filter(
            id=campaign, world=world, kind="campaign"
        ).exists()
    ):
        raise ValueError("Choose a campaign from this world.")
    positions = data.get("positions", {})
    if not isinstance(positions, dict) or len(positions) > 1000:
        raise ValueError("Use up to 1,000 saved node positions.")
    if positions:
        valid = {
            str(value)
            for value in Resource.objects.filter(
                world=world, id__in=positions
            ).values_list("id", flat=True)
        }
        if set(positions) - valid:
            raise ValueError("Node positions must belong to entries in this world.")
        for point in positions.values():
            if (
                not isinstance(point, dict)
                or set(point) != {"x", "y"}
                or any(
                    isinstance(v, bool)
                    or not isinstance(v, (int, float))
                    or not math.isfinite(v)
                    or not 0 <= v <= 10000
                    for v in point.values()
                )
            ):
                raise ValueError(
                    "Node positions need finite x/y coordinates between 0 and 10,000."
                )
    if data.get("direction", "family") not in ("family", "ancestors", "descendants"):
        raise ValueError("Choose family, ancestors or descendants.")
    integer(data.get("depth", 6), "Relationship depth", 1, 30)
    for key in ("adoptive", "include_isolated"):
        if key in data and not isinstance(data[key], bool):
            raise ValueError("Relationship options must be checkbox values.")
    for key in ("root_id", "partner_id"):
        value = data.get(key, "")
        if not isinstance(value, str):
            raise ValueError("Choose an available relationship root.")
        if value and not Resource.objects.filter(id=value, world=world).exists():
            raise ValueError("Choose relationship roots from this world.")
    if data.get("partner_id") and (
        not data.get("root_id")
        or data["partner_id"] == data["root_id"]
        or data.get("direction") != "descendants"
        or data.get("mode", "family") != "family"
    ):
        raise ValueError("Choose two different roots for shared descendants.")
    strings(data.get("tags", []), "Relationship tags")
    strings(data.get("kinds", []), "Connection types")
    if data.get("tag_mode", "all") not in ("all", "any"):
        raise ValueError("Choose all or any matching relationship tags.")


def reader_relationship(data, references):
    value = copy.deepcopy(data)
    if value.get("campaign_id") and value["campaign_id"] not in references:
        value.pop("campaign_id")
        value["campaign_unavailable"] = True
    if "positions" in value:
        value["positions"] = {
            key: point for key, point in value["positions"].items() if key in references
        }
    for key in ("root_id", "partner_id"):
        if value.get(key) and value[key] not in references:
            value.pop(key)
            value[key.replace("_id", "_unavailable")] = True
    return value


def relationship_view(resource, reader=False):
    from .services import serialize
    from .organization import normalize

    if resource.deleted_at:
        raise Http404()
    if resource.kind == "tree":
        result = hierarchy_view(resource, reader)
        return {
            **result,
            "view": result["tree"],
            "mode": "hierarchy",
            "edges": [
                {
                    "id": node["id"],
                    "source": node["parent"],
                    "target": node["id"],
                    "kind": "contains",
                    "label": "Contains",
                }
                for node in result["nodes"]
                if node["parent"]
            ],
        }
    if resource.kind != "relationship":
        raise Http404()
    view = serialize(resource, False, reader)
    if view is None:
        raise Http404()
    config = view["data"]
    values = graph_records(resource.world, reader)
    values.pop(str(resource.id), None)
    if config.get("campaign_unavailable"):
        values = {}
    elif config.get("campaign_id"):
        campaign = values.get(config["campaign_id"])
        if campaign is None or campaign["kind"] != "campaign":
            values = {}
        else:
            from .campaigns import campaign_members

            selected = campaign_members(campaign, values)
            values = {key: value for key, value in values.items() if key in selected}
    if config.get("layout") == "affinity":
        values = {
            key: value
            for key, value in values.items()
            if value["kind"] in ("article", "character", "map", "statblock", "quest")
        }
    tags = {normalize(t) for t in config.get("tags", [])}
    if tags:
        values = {
            key: value
            for key, value in values.items()
            if (
                bool(tags & {normalize(t) for t in value["tags"]})
                if config.get("tag_mode") == "any"
                else tags <= {normalize(t) for t in value["tags"]}
            )
        }
    warnings = []
    kinds = set(config.get("kinds", []))
    mode = config.get("mode", "family")
    if mode == "family":
        unavailable = any(
            config.get(key.replace("_id", "_unavailable"))
            or (config.get(key) and config[key] not in values)
            for key in ("root_id", "partner_id")
        )
        if unavailable:
            result = {
                "nodes": [],
                "edges": [],
                "warnings": [
                    "A selected root is unavailable or outside the current tag filter."
                ],
            }
        else:
            try:
                result = family_view(
                    resource.world,
                    config.get("root_id", ""),
                    config.get("partner_id", ""),
                    config.get("direction", "family"),
                    config.get("depth", 6),
                    config.get("adoptive", False),
                    reader,
                    values,
                    kinds,
                )
            except Http404:
                result = {
                    "nodes": [],
                    "edges": [],
                    "warnings": ["A selected root has no available family record."],
                }
        nodes, edges, warnings = result["nodes"], result["edges"], result["warnings"]
    else:
        edges = [
            e
            for e in visible_connections(resource.world, reader, values)
            if (mode != "diplomacy" or e["kind"] == "diplomacy")
            and (not kinds or e["kind"] in kinds)
        ]
        selected = (
            set(values)
            if config.get("include_isolated")
            else {key for edge in edges for key in (edge["source"], edge["target"])}
        )
        nodes = [
            {**reference(values[key]), "level": index // 4}
            for index, key in enumerate(
                sorted(selected, key=lambda i: (values[i]["title"].casefold(), i))
            )
        ]
    # Notes are deliberately absent from the displayed/exportable graph, for both audiences.
    edges = [
        {
            key: edge[key]
            for key in ("id", "source", "target", "kind", "label", "strength")
            if key in edge
        }
        for edge in edges
    ]
    if config.get("layout") == "affinity":
        nodes = [
            {
                **node,
                "summary": values[node["id"]].get("summary", ""),
                "portrait_asset_id": values[node["id"]]["data"].get("cover_asset", ""),
                "portrait_url": values[node["id"]]["data"].get("cover_url", ""),
            }
            for node in nodes
        ]
    return {
        "nodes": nodes,
        "edges": edges,
        "warnings": warnings,
        "mode": mode,
        "view": reference(view),
        "layout": config.get("layout", "diagram"),
        "positions": {
            key: point
            for key, point in config.get("positions", {}).items()
            if key in {node["id"] for node in nodes}
        },
    }
