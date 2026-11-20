import {
  GraphContextMenu,
  GraphMenu,
  useGraphNavigation,
} from "./GraphNavigation";
import { SearchableSelect } from "./SearchableSelect";
import React, { useEffect, useId, useRef, useState } from "react";
import { AppContext, api, human } from "./domain";
import { Empty, ErrorBox, KindIcon } from "./ui";
import { GitBranch, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { SaveRelationshipButton } from "./SaveRelationshipButton";
import { GraphExportActions } from "./GraphExportActions";

export type GraphNode = {
  id: string;
  title: string;
  kind: string;
  template: string;
  level?: number;
  depth?: number;
  parent?: string | null;
  revision?: number;
  relationships?: string[];
};
type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
  notes?: string;
  strength?: number;
};

export function NodeDiagram({
  nodes,
  edges,
  onOpen,
  hierarchy = false,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onOpen: (id: string) => void;
  hierarchy?: boolean;
}) {
  const [menu, setMenu] = useState<GraphMenu | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, w: 600, h: 220 });
  const zoomBy = useGraphNavigation(svg, camera, setCamera);
  const arrow = useId().replace(/:/g, "");
  const columns = new Map<number, number>(),
    positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const row = node.level || 0,
      col = columns.get(row) || 0;
    columns.set(row, col + 1);
    positions.set(node.id, { x: 30 + col * 235, y: 35 + row * 145 });
  }
  const width = Math.max(600, ...[...positions.values()].map((p) => p.x + 260)),
    height = Math.max(220, ...[...positions.values()].map((p) => p.y + 110));
  useEffect(() => {
    setCamera({ x: 0, y: 0, w: width, h: height });
  }, [width, height, nodes.map((n) => n.id).join("|")]);
  const zoom = width / camera.w;
  return (
    <div className="node-diagram">
      {menu && <GraphContextMenu menu={menu} close={() => setMenu(null)} />}
      <div className="button-row graph-zoom">
        <button
          className="icon-button"
          aria-label="Zoom graph out"
          disabled={camera.w >= 20000}
          onClick={() => zoomBy(1.25)}
        >
          <ZoomOut size={17} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          className="icon-button"
          aria-label="Zoom graph in"
          disabled={camera.w <= 180}
          onClick={() => zoomBy(0.8)}
        >
          <ZoomIn size={17} />
        </button>
      </div>
      <div
        className="relationship-canvas"
        tabIndex={0}
        aria-label={
          hierarchy
            ? "Hierarchy diagram scroll area"
            : "Family diagram scroll area"
        }
      >
        <svg
          ref={svg}
          width="100%"
          height={Math.min(650, Math.max(320, height))}
          viewBox={`${camera.x} ${camera.y} ${camera.w} ${camera.h}`}
          onContextMenu={(event) => {
            if (event.shiftKey) return;
            event.preventDefault();
            const nodeId = (event.target as Element)
              .closest("[data-node-id]")
              ?.getAttribute("data-node-id");
            const actions: GraphMenu["actions"] = [];
            if (nodeId)
              actions.push({
                label: "Open original notes",
                run: () => onOpen(nodeId),
              });
            actions.push(
              {
                label: "Zoom in here",
                run: () => zoomBy(0.8, { x: event.clientX, y: event.clientY }),
              },
              {
                label: "Zoom out here",
                run: () => zoomBy(1.25, { x: event.clientX, y: event.clientY }),
              },
              {
                label: "Fit graph",
                run: () => setCamera({ x: 0, y: 0, w: width, h: height }),
              },
            );
            setMenu({ x: event.clientX, y: event.clientY, actions });
          }}
          role="group"
          aria-label={hierarchy ? "Content hierarchy" : "Family relationships"}
        >
          <defs>
            <marker
              id={arrow}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0 0 10 5 0 10Z" fill="#92a18e" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const a = positions.get(edge.source),
              b = positions.get(edge.target);
            if (!a || !b) return null;
            const symmetric = ["spouse", "sibling"].includes(edge.kind);
            return (
              <g key={edge.id} data-edge-kind={edge.kind}>
                <path
                  d={
                    a.y === b.y
                      ? `M${a.x + 95},${a.y} Q${(a.x + b.x) / 2 + 95},${a.y - 38} ${b.x + 95},${b.y}`
                      : symmetric
                        ? `M${a.x + 190},${a.y + 38} C${a.x + 230},${a.y + 38} ${b.x + 230},${b.y + 38} ${b.x + 190},${b.y + 38}`
                        : `M${a.x + 95},${a.y + 76} C${a.x + 95},${a.y + 110} ${b.x + 95},${b.y - 35} ${b.x + 95},${b.y}`
                  }
                  fill="none"
                  stroke={
                    edge.kind === "diplomacy"
                      ? (edge.strength || 0) < 0
                        ? "#be7a65"
                        : "#6e977f"
                      : "#a5b59c"
                  }
                  strokeWidth="2"
                  strokeDasharray={
                    edge.kind === "adoptive-parent" ? "6 4" : undefined
                  }
                  markerEnd={symmetric ? undefined : `url(#${arrow})`}
                />
                <title>
                  {(edge.label || human(edge.kind)) +
                    (edge.kind === "diplomacy"
                      ? " (" + (edge.strength || 0) + ")"
                      : "")}
                </title>
              </g>
            );
          })}
          {nodes.map((node) => {
            const p = positions.get(node.id)!;
            return (
              <g
                key={node.id}
                data-node-id={node.id}
                transform={`translate(${p.x},${p.y})`}
                className="graph-node"
                role="button"
                tabIndex={0}
                aria-label={"Open " + node.title}
                onClick={() => onOpen(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(node.id);
                  }
                }}
              >
                <title>{node.title}</title>
                <rect width="190" height="76" rx="9" />
                <text x="15" y="31" className="graph-node-title">
                  {node.title.length > 21
                    ? node.title.slice(0, 20) + "…"
                    : node.title}
                </text>
                <text x="15" y="56" className="graph-node-type">
                  {(node.relationships?.[0] || human(node.template)).slice(
                    0,
                    29,
                  )}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

type FamilyData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  choices: GraphNode[];
  warnings: string[];
};
export function FamilyExplorer({ ctx, campaignId = "", floor = "all" }: {
  ctx: AppContext;
  campaignId?: string;
  floor?: string;
}) {
  const [root, setRoot] = useState(""),
    [partner, setPartner] = useState(""),
    [direction, setDirection] = useState("family"),
    [depth, setDepth] = useState(6),
    [adoptive, setAdoptive] = useState(false),
    [reader, setReader] = useState(false),
    [tab, setTab] = useState("diagram"),
    [payload, setPayload] = useState<{
      token: string;
      data: FamilyData;
    } | null>(null),
    [error, setError] = useState<{ token: string; message: string } | null>(
      null,
    );
  const token = JSON.stringify([
    ctx.world.id,
    campaignId,
    floor,
    root,
    partner,
    direction,
    depth,
    adoptive,
    reader,
  ]);
  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams({
      root,
      partner,
      direction,
      depth: String(depth),
      adoptive: adoptive ? "1" : "0",
    });
    if (reader) query.set("audience", "reader");
    if (campaignId) {
      query.set("campaign", campaignId);
      query.set("floor", floor);
    }
    api<FamilyData>("/worlds/" + ctx.world.id + "/family?" + query)
      .then((data) => {
        if (alive) {
          setPayload({ token, data });
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError({ token, message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [token, ctx.edges, ctx.entries]);
  const data = payload?.token === token ? payload.data : null;
  return (
    <section className="family-explorer">
      {!reader && (
        <div className="saved-graph-shortcut">
          <SaveRelationshipButton
            ctx={ctx}
            disabled={!data}
            config={{
              mode: "family",
              root_id: root,
              partner_id: partner,
              direction,
              depth,
              adoptive,
              tags: [],
              kinds: [],
            }}
          />
        </div>
      )}
      <div className="graph-query-controls">
        <label className="field">
          <span>Family root</span>
          <SearchableSelect
            aria-label="Family root"
            value={root}
            onChange={(e) => {
              setRoot(e.target.value);
              setPartner("");
            }}
          >
            <option value="">All families</option>
            {data?.choices.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label className="field">
          <span>Family query</span>
          <SearchableSelect
            aria-label="Family query"
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setPartner("");
            }}
          >
            <option value="family">Extended family</option>
            <option value="ancestors">Ancestors</option>
            <option value="descendants">Descendants</option>
          </SearchableSelect>
        </label>
        <label className="field">
          <span>Couple / second root</span>
          <SearchableSelect
            aria-label="Couple second root"
            disabled={!root || direction !== "descendants"}
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
          >
            <option value="">All descendants of root</option>
            {data?.choices
              .filter((n) => n.id !== root)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
          </SearchableSelect>
        </label>
        <label className="field">
          <span>
            {direction === "family" ? "Connection depth" : "Generations"}
          </span>
          <input
            aria-label="Family depth"
            type="number"
            min={1}
            max={30}
            value={depth}
            onChange={(e) =>
              setDepth(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
            }
          />
        </label>
      </div>
      <div className="button-row graph-query-options">
        <label className="check-label">
          <input
            aria-label="Include adoptive parents"
            type="checkbox"
            checked={adoptive}
            onChange={(e) => setAdoptive(e.target.checked)}
          />
          Include adoptive parent links
        </label>
        <label className="check-label">
          <input
            aria-label="Family reader preview"
            type="checkbox"
            checked={reader}
            onChange={(e) => {
              setReader(e.target.checked);
              setRoot("");
              setPartner("");
            }}
          />
          Saved reader view
        </label>
      </div>
      <p className="muted small-copy">
        Parent arrows point from parent to child. Couple selection shows shared
        descendants. Kinship labels follow recorded parent links; adoption can
        be included explicitly. Every entry is shown once.
      </p>
      {reader && (
        <div className="notice">
          Local preview: only shared connections between saved reader entries
          appear. Relationship notes remain private. Connection visibility takes
          effect immediately.
        </div>
      )}
      {error?.token === token ? (
        <ErrorBox message={error.message} />
      ) : !data ? (
        <div className="page-loading">
          <Loader2 size={18} className="spin" />
          Querying family…
        </div>
      ) : (
        <>
          {data.warnings.map((w) => (
            <div className="notice" key={w}>
              {w}
            </div>
          ))}
          <div className="section-heading">
            <p className="muted small-copy">
              {data.nodes.length} entries · {data.edges.length} connections
            </p>
            <div className="tabs compact">
              <button
                className={tab === "diagram" ? "active" : ""}
                onClick={() => setTab("diagram")}
              >
                Diagram
              </button>
              <button
                className={tab === "list" ? "active" : ""}
                onClick={() => setTab("list")}
              >
                Family list
              </button>
            </div>
          </div>
          {!data.nodes.length ? (
            <Empty icon={GitBranch} title="No family entries in this view">
              Add parent, spouse, sibling or guardian links, or choose a
              different root.
            </Empty>
          ) : tab === "diagram" ? (
            <NodeDiagram
              nodes={data.nodes}
              edges={data.edges}
              onOpen={(id) => ctx.go("entry/" + id)}
            />
          ) : (
            <ul className="family-result-list">
              {data.nodes.map((n) => (
                <li key={n.id}>
                  <button
                    className="text-button"
                    onClick={() => ctx.go("entry/" + n.id)}
                  >
                    <KindIcon kind={n.kind} />
                    {n.title}
                  </button>
                  <span>
                    {n.relationships?.join(" · ") ||
                      "Recorded family connection"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <details className="family-connection-details">
            <summary>Connections in this view</summary>
            <ul>
              {data.edges.map((e) => (
                <li key={e.id}>
                  {data.nodes.find((n) => n.id === e.source)?.title} →{" "}
                  {e.label || human(e.kind)} →{" "}
                  {data.nodes.find((n) => n.id === e.target)?.title}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

export type HierarchyData = {
  nodes: GraphNode[];
  warnings: string[];
  tree: GraphNode;
};
export function HierarchyView({
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
      data: HierarchyData;
    } | null>(null),
    [error, setError] = useState<{ token: string; message: string } | null>(
      null,
    ),
    [diagram, setDiagram] = useState(false);
  const token = JSON.stringify([ctx.world.id, id, reader]);
  useEffect(() => {
    let alive = true;
    api<HierarchyData>(
      "/resources/" + id + "/hierarchy" + (reader ? "?audience=reader" : ""),
    )
      .then((data) => {
        if (alive) {
          setPayload({ token, data });
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError({ token, message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [token, ctx.entries]);
  const data = payload?.token === token ? payload.data : null;
  if (error?.token === token) return <ErrorBox message={error.message} />;
  if (!data)
    return (
      <div className="page-loading">
        <Loader2 size={18} className="spin" />
        Opening hierarchy…
      </div>
    );
  return (
    <section className="hierarchy-view">
      <div className="tabs compact">
        <button
          className={!diagram ? "active" : ""}
          onClick={() => setDiagram(false)}
        >
          Hierarchy list
        </button>
        <button
          className={diagram ? "active" : ""}
          onClick={() => setDiagram(true)}
        >
          Hierarchy diagram
        </button>
      </div>
      {data.warnings.map((w) => (
        <div className="notice" key={w}>
          {w}
        </div>
      ))}
      {diagram ? (
        <NodeDiagram
          hierarchy
          nodes={data.nodes.map((n) => ({ ...n, level: n.depth }))}
          edges={data.nodes
            .filter((n) => n.parent)
            .map((n) => ({
              id: n.id,
              source: n.parent!,
              target: n.id,
              kind: "contains",
              label: "Contains",
            }))}
          onOpen={(id) => ctx.go("entry/" + id)}
        />
      ) : (
        <ol className="hierarchy-result-list">
          {data.nodes.map((n) => (
            <li
              key={n.id}
              style={{ paddingLeft: Math.min(n.depth || 0, 12) * 18 }}
            >
              <span className="hierarchy-depth">{(n.depth || 0) + 1}</span>
              <button
                className="text-button"
                onClick={() => ctx.go("entry/" + n.id)}
              >
                <KindIcon kind={n.kind} />
                {n.title}
              </button>
            </li>
          ))}
        </ol>
      )}
      {!data.nodes.length && (
        <Empty icon={GitBranch} title="This hierarchy is empty">
          Choose entries or tags in its editor.
        </Empty>
      )}
      <GraphExportActions id={id} name={data.tree.title} reader={reader} />
    </section>
  );
}
