import { SearchableSelect } from "./SearchableSelect";
import { AffinityDiagram } from "./AffinityWeb";
import React, { useEffect, useState } from "react";
import { AppContext, api, human } from "./domain";
import { Empty, EntryPicker, ErrorBox, Field, TagField } from "./ui";
import { GitBranch, Loader2, Plus } from "lucide-react";
import { NodeDiagram, GraphNode } from "./GraphViews";
import { GraphExportActions } from "./GraphExportActions";

type SavedGraph = {
  layout?: string;
  positions: Record<string, { x: number; y: number }>;
  nodes: GraphNode[];
  edges: {
    id: string;
    source: string;
    target: string;
    kind: string;
    label: string;
    strength?: number;
  }[];
  warnings: string[];
  mode: string;
  view: { id: string; title: string };
};
export function RelationshipView({
  ctx,
  id,
  reader = false,
}: {
  ctx: AppContext;
  id: string;
  reader?: boolean;
}) {
  const [payload, setPayload] = useState<{
      token: string;
      value: SavedGraph;
    } | null>(null),
    [error, setError] = useState<{ token: string; message: string } | null>(
      null,
    ),
    [list, setList] = useState(false);
  const token = JSON.stringify([
    ctx.world.id,
    id,
    reader,
    ctx.entries.map((e) => [
      e.id,
      e.revision,
      e.visibility,
      e.published_revision,
    ]),
    ctx.edges,
  ]);
  useEffect(() => {
    let alive = true;
    api<SavedGraph>(
      "/resources/" + id + "/graph" + (reader ? "?audience=reader" : ""),
    )
      .then((value) => {
        if (alive) {
          setPayload({ token, value });
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError({ token, message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [token]);
  if (error?.token === token) return <ErrorBox message={error.message} />;
  if (payload?.token !== token)
    return (
      <div className="page-loading">
        <Loader2 size={18} className="spin" />
        Opening saved graph…
      </div>
    );
  const graph = payload.value;
  return (
    <section className="saved-relationship-graph">
      {graph.warnings.map((w) => (
        <div className="notice" key={w}>
          {w}
        </div>
      ))}
      <div className="section-heading">
        <p className="muted small-copy">
          {graph.nodes.length} entries · {graph.edges.length} connections
        </p>
        <div className="tabs compact">
          <button
            className={!list ? "active" : ""}
            onClick={() => setList(false)}
          >
            Graph diagram
          </button>
          <button
            className={list ? "active" : ""}
            onClick={() => setList(true)}
          >
            Graph list
          </button>
        </div>
      </div>
      {!list && graph.layout === "affinity" ? (
        <AffinityDiagram graph={graph} ctx={ctx} reader={reader} />
      ) : list ? (
        <ul className="family-result-list">
          {graph.nodes.map((n) => (
            <li key={n.id}>
              <button
                className="text-button"
                onClick={() => ctx.go("entry/" + n.id)}
              >
                {n.title}
              </button>
              <span>{n.relationships?.join(" · ") || human(n.template)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <NodeDiagram
          nodes={graph.nodes}
          edges={graph.edges}
          onOpen={(id) => ctx.go("entry/" + id)}
        />
      )}
      <details className="family-connection-details">
        <summary>Graph connections</summary>
        <ul>
          {graph.edges.map((edge) => (
            <li key={edge.id}>
              {graph.nodes.find((n) => n.id === edge.source)?.title} →{" "}
              {edge.label || human(edge.kind)}
              {edge.kind === "diplomacy"
                ? " (" + (edge.strength || 0) + ")"
                : ""}{" "}
              → {graph.nodes.find((n) => n.id === edge.target)?.title}
            </li>
          ))}
        </ul>
      </details>
      <GraphExportActions id={id} name={graph.view.title} reader={reader} />
      {!graph.nodes.length && (
        <Empty icon={GitBranch} title="No entries match this view">
          Change the filters or check that its roots and source entries are
          available.
        </Empty>
      )}
    </section>
  );
}

export function RelationshipEditor({
  ctx,
  id,
  data,
  onData,
}: {
  ctx: AppContext;
  id: string;
  data: Record<string, any>;
  onData: (data: Record<string, any>) => void;
}) {
  const [reader, setReader] = useState(false),
    patch = (key: string, value: any) => onData({ ...data, [key]: value });
  const record = ctx.entries.find((e) => e.id === id),
    canReader =
      record?.visibility === "public" && record.published_revision !== null;
  const kinds = [
    ...new Set([
      "parent",
      "adoptive-parent",
      "guardian",
      "spouse",
      "sibling",
      "friend",
      "rival",
      "mentor",
      "member",
      "located-in",
      "diplomacy",
      ...(data.kinds || []),
      ...ctx.edges.map((e) => e.kind),
    ]),
  ].sort();
  return (
    <section className="saved-relationship-editor">
      <label className="field">
        <span>Visual presentation</span>
        <SearchableSelect
          value={data.layout || "diagram"}
          onChange={(e) => patch("layout", e.target.value)}
        >
          <option value="diagram">Graph diagram</option>
          <option value="affinity">Affinity web</option>
        </SearchableSelect>
      </label>
      {data.layout === "affinity" && (
        <p className="muted small-copy">
          Arrange and edit connections through the Affinity web tab in
          Relationships or your campaign. This preview lets you explore the
          saved guide.
        </p>
      )}
      <label className="field">
        <span>Graph type</span>
        <SearchableSelect
          aria-label="Graph type"
          value={data.mode || "family"}
          onChange={(e) =>
            onData({
              ...data,
              mode: e.target.value,
              root_id: "",
              partner_id: "",
            })
          }
        >
          <option value="family">Family and bloodlines</option>
          <option value="all">All connection types</option>
          <option value="diplomacy">Directional diplomacy</option>
        </SearchableSelect>
      </label>
      {(data.mode || "family") === "family" ? (
        <>
          <div className="field-grid">
            <EntryPicker
              label="Saved graph root"
              value={data.root_id || ""}
              onChange={(root_id) =>
                onData({ ...data, root_id, partner_id: "" })
              }
              entries={ctx.entries.filter((e) => e.id !== id)}
              empty="All families"
            />
            <label className="field">
              <span>Saved family query</span>
              <SearchableSelect
                value={data.direction || "family"}
                onChange={(e) =>
                  onData({ ...data, direction: e.target.value, partner_id: "" })
                }
              >
                <option value="family">Extended family</option>
                <option value="ancestors">Ancestors</option>
                <option value="descendants">Descendants</option>
              </SearchableSelect>
            </label>
          </div>
          {data.root_id && data.direction === "descendants" && (
            <EntryPicker
              label="Saved couple second root"
              value={data.partner_id || ""}
              onChange={(v) => patch("partner_id", v)}
              entries={ctx.entries.filter(
                (e) => e.id !== id && e.id !== data.root_id,
              )}
              empty="All descendants of root"
            />
          )}
          <div className="field-grid">
            <Field
              label="Saved graph depth"
              type="number"
              min={1}
              max={30}
              value={data.depth || 6}
              onChange={(v) => patch("depth", v)}
            />
            <label className="check-label">
              <input
                aria-label="Saved graph adoptive parents"
                type="checkbox"
                checked={!!data.adoptive}
                onChange={(e) => patch("adoptive", e.target.checked)}
              />
              Include adoptive links
            </label>
          </div>
        </>
      ) : (
        <label className="check-label">
          <input
            aria-label="Include isolated graph entries"
            type="checkbox"
            checked={!!data.include_isolated}
            onChange={(e) => patch("include_isolated", e.target.checked)}
          />
          Include matching entries with no connections
        </label>
      )}
      <TagField
        label="Relationship view tags"
        placeholder="Optional tags shared by the graph's entries"
        value={data.tags || []}
        onChange={(v) => patch("tags", v)}
      />
      <label className="field">
        <span>Relationship tag matching</span>
        <SearchableSelect
          value={data.tag_mode || "all"}
          onChange={(e) => patch("tag_mode", e.target.value)}
        >
          <option value="all">Every selected tag</option>
          <option value="any">Any selected tag</option>
        </SearchableSelect>
      </label>
      <p className="muted small-copy">
        Tags filter entries before traversal. Family roots must match the
        selected tags. An empty type selection includes every eligible
        connection type.
      </p>
      <details>
        <summary>Connection type filter</summary>
        <div className="checkbox-list">
          {kinds.map((kind) => (
            <label key={kind}>
              <input
                type="checkbox"
                aria-label={"Include connection type " + kind}
                checked={(data.kinds || []).includes(kind)}
                onChange={(e) =>
                  patch(
                    "kinds",
                    e.target.checked
                      ? [...(data.kinds || []), kind]
                      : (data.kinds || []).filter((k: string) => k !== kind),
                  )
                }
              />
              {human(kind)}
            </label>
          ))}
        </div>
      </details>
      <label className="check-label graph-reader-switch">
        <input
          aria-label="Saved graph reader preview"
          disabled={!reader && !canReader}
          type="checkbox"
          checked={reader}
          onChange={(e) => setReader(e.target.checked)}
        />
        Saved reader view
      </label>
      <p className="muted small-copy">
        {!canReader &&
          "Save a reader version first to enable the reader graph. "}
        Preview and exports use the saved definition. Later edits remain drafts
        until you save a reader version. Connection visibility takes effect
        immediately.
      </p>
      <RelationshipView ctx={ctx} id={id} reader={reader} />
    </section>
  );
}

export function SavedGraphLibrary({ ctx }: { ctx: AppContext }) {
  const entries = ctx.entries.filter((e) => e.kind === "relationship");
  return (
    <section className="saved-graph-library">
      <div className="section-heading">
        <h2>Saved relationship views</h2>
        <button
          className="button primary small"
          onClick={() => ctx.create("relationship")}
        >
          <Plus size={15} />
          New relationship view
        </button>
      </div>
      <div className="card-grid">
        {entries.map((entry) => (
          <button
            key={entry.id}
            className="entry-card"
            onClick={() => ctx.go("entry/" + entry.id)}
          >
            <GitBranch size={23} />
            <h3>{entry.title}</h3>
            <p>
              {entry.summary ||
                human(entry.data.mode || "family") +
                  " · follows current source entries"}
            </p>
          </button>
        ))}
      </div>
      {!entries.length && (
        <Empty icon={GitBranch} title="Keep a useful relationship view">
          Save the current family filters or create a tagged network view.
        </Empty>
      )}
    </section>
  );
}
