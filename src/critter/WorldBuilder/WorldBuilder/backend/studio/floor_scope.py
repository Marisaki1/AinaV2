"""Campaign membership derived from recorded floor references."""

from collections import defaultdict, deque


def record_ids(value):
    return {item for item in value if isinstance(item, str)} if isinstance(value, list) else set()


class FloorScope:
    def __init__(self, values, campaign, selection):
        if campaign not in values or values[campaign]["kind"] != "campaign":
            raise ValueError("Choose an available campaign.")
        floors = {
            key: row["data"]
            for key, row in values.items()
            if row["kind"] == "note"
            and row["data"].get("record_type") == "campaign-floor"
            and row["data"].get("campaign_id") == campaign
        }
        if selection not in {"all", "unassigned"} and selection not in floors:
            raise ValueError("Choose an available floor in this campaign.")
        self.selection = selection
        self.membership = defaultdict(set)
        self.connections = defaultdict(set)
        self.campaign_ids = record_ids(values[campaign]["data"].get("party"))
        self.campaign_ids.update(record_ids(values[campaign]["data"].get("related_entries")))
        children = defaultdict(set)
        for key, row in values.items():
            data = row["data"]
            if data.get("campaign_id", row.get("parent")) == campaign:
                self.campaign_ids.add(key)
                self.campaign_ids.update(record_ids(data.get("related_entries")))
                self.campaign_ids.update(record_ids([data.get("link_id"), data.get("map_id")]))
            for parent in record_ids([row.get("parent"), data.get("session_id")]):
                children[parent].add(key)
        queue = deque(
            (key, floor)
            for floor, data in floors.items()
            for key in {floor} | record_ids(data.get("floor_entries")) | record_ids([data.get("map_id")])
        )
        for floor, data in floors.items():
            for key in record_ids(data.get("floor_connections")):
                self.connections[key].add(floor)
        while queue:
            key, floor = queue.popleft()
            if floor in self.membership[key]:
                continue
            self.membership[key].add(floor)
            queue.extend((child, floor) for child in children[key])
        self.campaign_ids.update(self.membership)

    def includes(self, key):
        floors = self.membership.get(key, set())
        if self.selection == "all":
            return True
        if self.selection == "unassigned":
            return not floors
        return self.selection in floors

    def includes_connection(self, edge):
        source, target = edge["source"], edge["target"]
        explicit = self.connections.get(edge["id"], set())
        if not explicit and not {source, target} <= self.campaign_ids:
            return False
        if self.selection == "all":
            return True
        floors = explicit | (
            self.membership.get(source, set()) & self.membership.get(target, set())
        )
        if self.selection == "unassigned":
            return not floors
        return self.selection in floors
