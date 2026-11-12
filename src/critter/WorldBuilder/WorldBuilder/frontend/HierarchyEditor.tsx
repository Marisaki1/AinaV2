import { SearchableSelect } from "./SearchableSelect";
import React, { useEffect, useState } from "react";
import { AppContext, api } from "./domain";
import { ErrorBox, TagField } from "./ui";
import { HierarchyData, HierarchyView } from "./GraphViews";
import { ArrowDown, ArrowUp } from "lucide-react";

export function HierarchyEditor({
  ctx,
  id,
  data,
  onData,
}: {
  ctx: AppContext;
  id: string;
  data: Record<string, any>;
  onData: (v: Record<string, any>) => void;
}) {
  const [payload, setPayload] = useState<{
      token: string;
      value: HierarchyData;
    } | null>(null),
    [error, setError] = useState("");
  const token = JSON.stringify([
    ctx.world.id,
    id,
    ctx.entries.find((e) => e.id === id)?.revision,
  ]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<HierarchyData>("/resources/" + id + "/hierarchy")
      .then((value) => {
        if (alive) setPayload({ token, value });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [token, ctx.entries]);
  const nodes = payload?.token === token ? payload.value.nodes : [],
    patch = (key: string, value: any) => onData({ ...data, [key]: value });
  const isDescendant = (candidate: string, root: string) => {
    const visited = new Set<string>();
    let current: string | null | undefined = candidate;
    while (current && !visited.has(current)) {
      if (current === root) return true;
      visited.add(current);
      current = nodes.find((n) => n.id === current)?.parent;
    }
    return false;
  };
  const reorder = (nodeId: string, delta: number) => {
    const node = nodes.find((n) => n.id === nodeId)!,
      siblings = nodes.filter((n) => n.parent === node.parent),
      index = siblings.findIndex((n) => n.id === nodeId),
      other = siblings[index + delta];
    if (!other) return;
    const order = nodes.map((n) => n.id),
      a = order.indexOf(nodeId),
      b = order.indexOf(other.id);
    [order[a], order[b]] = [order[b], order[a]];
    patch("order", order);
  };
  return (
    <section className="hierarchy-editor">
      <label className="field">
        <span>Hierarchy membership</span>
        <SearchableSelect
          aria-label="Hierarchy membership"
          value={data.selection || "manual"}
          onChange={(e) => patch("selection", e.target.value)}
        >
          <option value="manual">Manually selected entries</option>
          <option value="tags">Entries matching tags</option>
          <option value="both">Selected entries and matching tags</option>
        </SearchableSelect>
      </label>
      {(data.selection === "tags" || data.selection === "both") && (
        <>
          <TagField
            label="Hierarchy tags"
            placeholder="Tags to gather into this hierarchy"
            value={data.tags || []}
            onChange={(v) => patch("tags", v)}
          />
          <label className="field">
            <span>Hierarchy tag matching</span>
            <SearchableSelect
              value={data.tag_mode || "all"}
              onChange={(e) => patch("tag_mode", e.target.value)}
            >
              <option value="all">All selected tags</option>
              <option value="any">Any selected tag</option>
            </SearchableSelect>
          </label>
          <p className="muted small-copy">
            At least one tag is needed to gather entries. Membership updates
            when tags change.
          </p>
        </>
      )}
      {data.selection !== "tags" && (
        <details>
          <summary>Select entries</summary>
          <div className="checkbox-list hierarchy-member-choices">
            {ctx.entries
              .filter((e) => e.id !== id)
              .map((e) => (
                <label key={e.id}>
                  <input
                    type="checkbox"
                    aria-label={"Include " + e.title + " in hierarchy"}
                    checked={(data.items || []).includes(e.id)}
                    onChange={(event) =>
                      patch(
                        "items",
                        event.target.checked
                          ? [...(data.items || []), e.id]
                          : (data.items || []).filter(
                              (key: string) => key !== e.id,
                            ),
                      )
                    }
                  />
                  {e.title}
                </label>
              ))}
          </div>
        </details>
      )}
      <p className="muted small-copy">
        This hierarchy has its own parent links. Changing a node's parent moves
        its entire branch without moving library collections. Structure controls
        refresh after autosave.
      </p>
      {error && <ErrorBox message={error} />}
      <div
        className="hierarchy-structure-controls"
        aria-label="Edit hierarchy structure"
      >
        {nodes.map((n) => {
          const siblings = nodes.filter((other) => other.parent === n.parent),
            index = siblings.findIndex((other) => other.id === n.id);
          return (
            <div className="hierarchy-structure-row" key={n.id}>
              <strong>{n.title}</strong>
              <label className="field">
                <span>Parent</span>
                <SearchableSelect
                  aria-label={"Parent of " + n.title}
                  value={n.parent || ""}
                  onChange={(e) =>
                    patch("parents", {
                      ...Object.fromEntries(nodes.map((n) => [n.id, n.parent])),
                      ...data.parents,
                      [n.id]: e.target.value || null,
                    })
                  }
                >
                  <option value="">Root level</option>
                  {nodes
                    .filter((other) => !isDescendant(other.id, n.id))
                    .map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.title}
                      </option>
                    ))}
                </SearchableSelect>
              </label>
              <div className="button-row">
                <button
                  className="icon-button"
                  aria-label={"Move " + n.title + " earlier"}
                  disabled={index === 0}
                  onClick={() => reorder(n.id, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={"Move " + n.title + " later"}
                  disabled={index === siblings.length - 1}
                  onClick={() => reorder(n.id, 1)}
                >
                  <ArrowDown size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <HierarchyView ctx={ctx} id={id} />
    </section>
  );
}
