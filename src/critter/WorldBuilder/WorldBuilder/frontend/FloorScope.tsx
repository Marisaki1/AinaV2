import React, { useMemo, useSyncExternalStore } from "react";
import { Entry } from "./domain";
import { SearchableSelect } from "./SearchableSelect";

const eventName = "worldbuilder:campaign-floor";
const subscribe = (change: () => void) => {
  window.addEventListener(eventName, change);
  window.addEventListener("storage", change);
  return () => {
    window.removeEventListener(eventName, change);
    window.removeEventListener("storage", change);
  };
};

export function recordIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id) => typeof id === "string")
    : [];
}

export function indexFloors(entries: Entry[], campaignId: string) {
  const campaign = entries.find((entry) => entry.id === campaignId);
  const floors = entries
    .filter(
      (entry) =>
        entry.kind === "note" &&
        entry.data.record_type === "campaign-floor" &&
        entry.data.campaign_id === campaignId,
    )
    .sort(
      (a, b) =>
        Number(a.data.floor_number) - Number(b.data.floor_number) ||
        a.title.localeCompare(b.title),
    );
  const membership = new Map<string, Set<string>>();
  const connections = new Map<string, Set<string>>();
  const campaignIds = new Set([
    ...recordIds(campaign?.data.party),
    ...recordIds(campaign?.data.related_entries),
    ...entries
      .filter(
        (entry) => (entry.data.campaign_id ?? entry.parent) === campaignId,
      )
      .flatMap((entry) =>
        [
          entry.id,
          ...recordIds(entry.data.related_entries),
          entry.data.link_id,
          entry.data.map_id,
        ].filter(Boolean),
      ),
  ]);

  for (const floor of floors) {
    for (const id of [
      floor.id,
      ...recordIds(floor.data.floor_entries),
      ...recordIds([floor.data.map_id]),
    ]) {
      membership.set(id, new Set([...(membership.get(id) || []), floor.id]));
    }
    for (const id of recordIds(floor.data.floor_connections)) {
      connections.set(id, new Set([...(connections.get(id) || []), floor.id]));
    }
  }
  const children = new Map<string, string[]>();
  for (const entry of entries) {
    for (const parent of recordIds([entry.parent, entry.data.session_id])) {
      const related = children.get(parent) || [];
      related.push(entry.id);
      children.set(parent, related);
    }
  }
  const queue = [...membership].flatMap(([id, linked]) =>
    [...linked].map((floor) => ({ id, floor })),
  );
  for (const { id, floor } of queue) {
    for (const child of children.get(id) || []) {
      const linked = membership.get(child) || new Set<string>();
      if (linked.has(floor)) continue;
      linked.add(floor);
      membership.set(child, linked);
      queue.push({ id: child, floor });
    }
  }
  for (const id of membership.keys()) campaignIds.add(id);
  return {
    floors,
    membership,
    campaignIds,
    includes: (id: string, selection: string) =>
      selection === "all" ||
      (selection === "unassigned"
        ? !membership.has(id)
        : !!membership.get(id)?.has(selection)),
    includesConnection: (
      edge: { id: string; source: string; target: string },
      selection: string,
    ) => {
      const explicit = connections.get(edge.id);
      if (
        !explicit &&
        !(campaignIds.has(edge.source) && campaignIds.has(edge.target))
      )
        return false;
      if (selection === "all") return true;
      const target = membership.get(edge.target);
      const shared = [...(membership.get(edge.source) || [])].filter((id) =>
        target?.has(id),
      );
      return selection === "unassigned"
        ? !explicit?.size && !shared.length
        : !!explicit?.has(selection) || shared.includes(selection);
    },
  };
}

export function useCampaignFloor(entries: Entry[], campaignId: string) {
  const index = useMemo(
    () => indexFloors(entries, campaignId),
    [entries, campaignId],
  );
  const key = "worldbuilder.campaign-floor:" + campaignId;
  const stored = useSyncExternalStore(subscribe, () =>
    localStorage.getItem(key),
  );
  const selection =
    stored === "all" ||
    stored === "unassigned" ||
    index.floors.some((floor) => floor.id === stored)
      ? stored!
      : index.floors.find((floor) => floor.data.floor_status === "Current")
          ?.id || "all";
  function select(value: string) {
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event(eventName));
  }
  return { ...index, selection, select };
}

export function FloorSelect({
  floors,
  selection,
  select,
  allowAll = true,
}: {
  floors: Entry[];
  selection: string;
  select: (value: string) => void;
  allowAll?: boolean;
}) {
  return (
    <label className="field campaign-floor-select">
      <span>Campaign floor</span>
      <SearchableSelect
        value={selection}
        onChange={(event) => select(event.target.value)}
      >
        {allowAll && <option value="all">All floors</option>}
        {floors.map((floor) => (
          <option key={floor.id} value={floor.id}>
            {floor.title}
          </option>
        ))}
        <option value="unassigned">Unassigned</option>
      </SearchableSelect>
    </label>
  );
}
