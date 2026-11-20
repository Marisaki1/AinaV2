"""Audience-filtered family queries and independent content hierarchies."""

from collections import defaultdict, deque
from django.http import Http404
from .models import Resource, Connection
from .tools import integer

PARENTS = {"parent", "adoptive-parent"}
FAMILY = PARENTS | {"spouse", "sibling", "guardian"}


def graph_records(world, reader=False):
    from .services import public_references, serialize

    refs = public_references(world) if reader else None
    values = {}
    for record in Resource.objects.filter(world=world, deleted_at=None):
        value = serialize(record, False, reader, refs)
        if value is not None:
            values[value["id"]] = value
    return values


def visible_connections(world, reader=False, values=None):
    from .services import connection_json

    if values is None:
        values = graph_records(world, reader)
    result = []
    for edge in Connection.objects.filter(world=world, deleted_at=None).order_by("id"):
        if str(edge.source_id) not in values or str(edge.target_id) not in values:
            continue
        if reader and edge.visibility != "public":
            continue
        value = connection_json(edge)
        if reader:
            value["notes"] = ""
            for key in ("revision", "deleted_at", "created_at", "updated_at"):
                value.pop(key, None)
        result.append(value)
    return result


def walk(start, neighbors, depth):
    distances = {start: 0}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        if distances[node] >= depth:
            continue
        for other in sorted(neighbors.get(node, ())):
            if other not in distances:
                distances[other] = distances[node] + 1
                queue.append(other)
    return distances


def reference(value):
    return {k: value[k] for k in ("id", "title", "kind", "template")}


def family_view(
    world,
    root="",
    partner="",
    direction="family",
    depth=6,
    adoptive=False,
    reader=False,
    values=None,
    kinds=None,
    floor_scope=None,
):
    if direction not in ("family", "ancestors", "descendants"):
        raise ValueError("Choose family, ancestors or descendants.")
    integer(depth, "Generations / connection depth", 1, 30)
    if values is None:
        values = graph_records(world, reader)
    edges = [
        e
        for e in visible_connections(world, reader, values)
        if e["kind"] in FAMILY
        and (not kinds or e["kind"] in kinds)
        and (not floor_scope or floor_scope.includes_connection(e))
    ]
    ids = {i for e in edges for i in (e["source"], e["target"])}
    ids |= {
        key
        for key, v in values.items()
        if (v["kind"] == "character" or v["template"] == "character")
        and (not floor_scope or key in floor_scope.campaign_ids and floor_scope.includes(key))
    }
    choices = sorted(
        (reference(values[i]) for i in ids),
        key=lambda n: (n["title"].casefold(), n["id"]),
    )
    if root and root not in ids:
        raise Http404()
    if partner and (not root or partner not in ids or partner == root):
        raise ValueError("Choose two different available family roots.")
    if partner and direction != "descendants":
        raise ValueError("Couple selection is available for shared descendants.")
    parent_kinds = PARENTS if adoptive else {"parent"}
    parents, children, neighbors = defaultdict(set), defaultdict(set), defaultdict(set)
    for edge in edges:
        a, b = edge["source"], edge["target"]
        if edge["kind"] in parent_kinds:
            parents[b].add(a)
            children[a].add(b)
        if edge["kind"] not in {"adoptive-parent"} or adoptive:
            neighbors[a].add(b)
            neighbors[b].add(a)
    selected = set(ids)
    distance = {}
    if root:
        network = (
            parents
            if direction == "ancestors"
            else children
            if direction == "descendants"
            else neighbors
        )
        distance = walk(root, network, depth)
        selected = set(distance)
        if partner:
            selected &= set(walk(partner, children, depth))
            selected |= {root, partner}
    visible_edges = [
        e
        for e in edges
        if e["source"] in selected
        and e["target"] in selected
        and (e["kind"] != "adoptive-parent" or adoptive)
        and (direction == "family" or e["kind"] in parent_kinds)
    ]
    root_ancestors = walk(root, parents, 30) if root else {}
    root_descendants = walk(root, children, 30) if root else {}
    result = []
    for key in sorted(selected, key=lambda i: (values[i]["title"].casefold(), i)):
        labels = []
        if root:
            if key == root:
                labels.append("Selected root")
            else:
                up, down = root_ancestors.get(key), root_descendants.get(key)
                if up:
                    labels.append(
                        "Parent"
                        if up == 1
                        else "Grandparent"
                        if up == 2
                        else f"Ancestor · {up} generations"
                    )
                if down:
                    labels.append(
                        "Child"
                        if down == 1
                        else "Grandchild"
                        if down == 2
                        else f"Descendant · {down} generations"
                    )
                for e in edges:
                    if {e["source"], e["target"]} == {root, key} and e["kind"] in (
                        "spouse",
                        "sibling",
                        "guardian",
                    ):
                        labels.append(
                            {
                                "spouse": "Spouse / partner",
                                "sibling": "Recorded sibling",
                                "guardian": "Guardian relationship",
                            }[e["kind"]]
                        )
                if not up and not down:
                    other_ancestors = walk(key, parents, 30)
                    common = (set(root_ancestors) & set(other_ancestors)) - {root, key}
                    if common:
                        a, b = min(
                            ((root_ancestors[c], other_ancestors[c]) for c in common),
                            key=lambda p: (max(p), sum(p), p),
                        )
                        if a == b == 1:
                            labels.append("Sibling through a shared parent")
                        elif a == 1:
                            labels.append(
                                "Niece / nephew"
                                if b == 2
                                else f"Sibling's descendant · {b - 1} generations"
                            )
                        elif b == 1:
                            labels.append(
                                "Aunt / uncle"
                                if a == 2
                                else f"Ancestor's sibling · {a - 1} generations"
                            )
                        else:
                            labels.append(
                                f"Cousin · degree {min(a, b) - 1}"
                                + (f" · {abs(a - b)} removed" if a != b else "")
                            )
        result.append(
            {
                **reference(values[key]),
                "distance": distance.get(key),
                "relationships": list(dict.fromkeys(labels)),
            }
        )
    # Assign one slot per identity; longest parent path keeps shared descendants unique.
    ranks = {key: 0 for key in selected}
    incoming = {key: set(parents.get(key, ())) & selected for key in selected}
    queue = deque(sorted(key for key in selected if not incoming[key]))
    done = set()
    while queue:
        key = queue.popleft()
        done.add(key)
        for child in sorted(children.get(key, set()) & selected):
            ranks[child] = max(ranks[child], ranks[key] + 1)
            incoming[child].discard(key)
            if not incoming[child]:
                queue.append(child)
    warnings = (
        []
        if len(done) == len(selected)
        else [
            "Some imported parent links form a cycle. Review those connections; each person is still shown once."
        ]
    )
    for node in result:
        node["level"] = ranks[node["id"]] if node["id"] in done else 0
    return {
        "nodes": result,
        "edges": visible_edges,
        "choices": choices,
        "warnings": warnings,
        "root": root,
        "partner": partner,
    }


def create_connection(world, value):
    from .connection_history import save

    return save(world, value)


def validate_tree(data, world):
    from .services import strings

    for key in ("items", "order"):
        ids = data.get(key, [])
        if (
            not isinstance(ids, list)
            or len(ids) > 5000
            or any(not isinstance(i, str) for i in ids)
            or len(set(ids)) != len(ids)
        ):
            raise ValueError("Choose up to 5,000 different hierarchy entries.")
        if len(ids) != Resource.objects.filter(world=world, id__in=ids).count():
            raise ValueError("Choose hierarchy entries from this world.")
    if data.get("selection", "manual") not in ("manual", "tags", "both"):
        raise ValueError("Choose manual, tagged or combined hierarchy selection.")
    strings(data.get("tags", []), "Hierarchy tags")
    if data.get("tag_mode", "all") not in ("all", "any"):
        raise ValueError("Choose all or any hierarchy tags.")
    parents = data.get("parents", {})
    if (
        not isinstance(parents, dict)
        or len(parents) > 5000
        or any(
            not isinstance(k, str) or (v is not None and not isinstance(v, str))
            for k, v in parents.items()
        )
    ):
        raise ValueError("Invalid hierarchy parent links.")
    ids = set(parents) | {p for p in parents.values() if p is not None}
    if len(ids) != Resource.objects.filter(world=world, id__in=ids).count():
        raise ValueError("Choose hierarchy parents from this world.")
    completed = set()
    for key in parents:
        seen = set()
        node = key
        while node in parents and node not in completed:
            if node in seen:
                raise ValueError("A hierarchy entry cannot be its own ancestor.")
            seen.add(node)
            node = parents[node]
        completed |= seen


def reader_tree(data, references):
    import copy

    value = copy.deepcopy(data)
    for key in ("items", "order"):
        value[key] = [i for i in value.get(key, []) if i in references]
    if "parents" in value:
        value["parents"] = {
            k: (v if v in references else None)
            for k, v in value["parents"].items()
            if k in references
        }
    return value


def hierarchy_view(resource, reader=False):
    from .services import serialize
    from .organization import normalize

    if resource.kind != "tree" or resource.deleted_at:
        raise Http404()
    definition = serialize(resource, False, reader)
    if definition is None:
        raise Http404()
    data = definition["data"]
    values = graph_records(resource.world, reader)
    values.pop(str(resource.id), None)
    mode = data.get("selection", "manual")
    requested = {normalize(t) for t in data.get("tags", [])}
    selected = (
        set(data.get("items", [])) & set(values)
        if mode in ("manual", "both")
        else set()
    )
    if mode in ("tags", "both") and requested:
        for key, value in values.items():
            actual = {normalize(t) for t in value["tags"]}
            if (
                bool(requested & actual)
                if data.get("tag_mode") == "any"
                else requested <= actual
            ):
                selected.add(key)
    order = {key: i for i, key in enumerate(data.get("order", data.get("items", [])))}

    def sort_key(key):
        return (
            order.get(key, 100000),
            values[key]["position"],
            values[key]["title"].casefold(),
            key,
        )

    parents = {
        key: (data["parents"].get(key) if "parents" in data else values[key]["parent"])
        for key in selected
    }
    parents = {
        key: parent if parent in selected else None for key, parent in parents.items()
    }
    warnings = []
    # Imported legacy data is read safely even if later external changes introduced a cycle.
    for key in sorted(selected):
        seen = set()
        current = key
        while current is not None:
            if current in seen:
                parents[current] = None
                warnings = [
                    "A hierarchy cycle was detached for display. Review the parent links."
                ]
                break
            seen.add(current)
            current = parents.get(current)
    children = defaultdict(list)
    for key, parent in parents.items():
        children[parent].append(key)
    result = []
    pending = [(key, 0) for key in reversed(sorted(children[None], key=sort_key))]
    while pending:
        key, depth = pending.pop()
        result.append(
            {
                **reference(values[key]),
                "parent": parents[key],
                "depth": depth,
                "revision": values[key]["revision"],
            }
        )
        pending.extend(
            (child, depth + 1)
            for child in reversed(sorted(children[key], key=sort_key))
        )
    return {"nodes": result, "warnings": warnings, "tree": reference(definition)}
