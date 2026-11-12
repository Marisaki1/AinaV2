import React, { useEffect, useId, useRef, useState } from "react";
import {
  GraphContextMenu,
  GraphMenu,
  useGraphNavigation,
} from "./GraphNavigation";
import { LinkedPortrait } from "./LinkedPortrait";
import DOMPurify from "dompurify";
import {
  AppContext,
  Edge,
  Entry,
  api,
  docFromText,
  human,
  patch,
  post,
} from "./domain";
import { ConnectionFields } from "./Connections";
import { ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";

type Point = { x: number; y: number };
export type AffinityGraph = {
  nodes: {
    id: string;
    title: string;
    kind: string;
    template: string;
    summary?: string;
    portrait_asset_id?: string;
    portrait_url?: string;
    entry_id?: string;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    kind: string;
    label: string;
    strength?: number;
    notes?: string;
  }[];
  positions: Record<string, Point>;
  layout?: string;
  warnings: string[];
};
const colour = (kind: string, strength = 0) =>
  kind === "rival" || strength < 0
    ? "#bb625c"
    : kind === "friend" || strength > 0
      ? "#487f6b"
      : ["spouse", "parent", "sibling", "adoptive-parent"].includes(kind)
        ? "#916db3"
        : kind === "member" || kind === "located-in"
          ? "#5486a5"
          : "#a68442";
const arrange = (nodes: AffinityGraph["nodes"]) => {
  const result: Record<string, Point> = {};
  let offset = 1,
    ring = 1;
  if (nodes[0]) result[nodes[0].id] = { x: 1800, y: 1800 };
  while (offset < nodes.length) {
    const count = Math.min(ring * 8, nodes.length - offset),
      radius = 160 + ring * 150;
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      result[nodes[offset + i].id] = {
        x: 1800 + Math.cos(angle) * radius,
        y: 1800 + Math.sin(angle) * radius,
      };
    }
    offset += count;
    ring++;
  }
  return result;
};
const bounds = (positions: Record<string, Point>) => {
  const values = Object.values(positions);
  const x = Math.min(...values.map((p) => p.x), 1800) - 120,
    y = Math.min(...values.map((p) => p.y), 1800) - 100;
  return {
    x,
    y,
    w: Math.max(500, Math.max(...values.map((p) => p.x), 1800) - x + 120),
    h: Math.max(400, Math.max(...values.map((p) => p.y), 1800) - y + 130),
  };
};

export function AffinityDiagram({
  graph,
  ctx,
  reader = false,
  onPositions,
  onConnection,
  onPortrait,
  onNote,
  campaignId = "",
  busy = false,
  sceneMode = false,
  guideTitle = "Scenes and routes",
  guideSearchLabel = "Find scene",
}: {
  graph: AffinityGraph;
  ctx: AppContext;
  reader?: boolean;
  onPositions?: (positions: Record<string, Point>) => void;
  onConnection?: (edge?: Edge, source?: string) => void;
  onPortrait?: (entry: Entry, asset: string) => void;
  onNote?: (id: string) => void;
  campaignId?: string;
  busy?: boolean;
  sceneMode?: boolean;
  guideTitle?: string;
  guideSearchLabel?: string;
}) {
  const [selected, setSelected] = useState(""),
    [edgeId, setEdgeId] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [focus, setFocus] = useState(false),
    [menu, setMenu] = useState<GraphMenu | null>(null);
  const nodes = graph.nodes.slice(0, 250),
    identity = nodes.map((n) => n.id).join("|");
  const defaults = arrange(nodes),
    initial = {
      ...defaults,
      ...Object.fromEntries(
        Object.entries(graph.positions || {}).filter(([id]) =>
          nodes.some((n) => n.id === id),
        ),
      ),
    };
  const [positions, setPositions] = useState(initial),
    [camera, setCamera] = useState(() => bounds(initial));
  const [record, setRecord] = useState<{ token: string; value: Entry } | null>(
      null,
    ),
    [error, setError] = useState("");
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<any>(null),
    positionsRef = useRef(positions),
    arrow = useId().replace(/:/g, "");
  const scale = useGraphNavigation(svg, camera, setCamera);
  positionsRef.current = positions;
  useEffect(() => {
    setPositions(initial);
    setCamera(bounds(initial));
    if (selected && !nodes.some((n) => n.id === selected)) {
      setSelected("");
      setEdgeId("");
      setFocus(false);
    }
  }, [identity]);
  useEffect(() => {
    if (!drag.current) setPositions(initial);
  }, [JSON.stringify(graph.positions)]);
  const selectedResource =
    nodes.find((n) => n.id === selected)?.entry_id || selected;
  const token = selected + ":" + reader;
  useEffect(() => {
    let alive = true;
    setError("");
    if (selected && nodes.some((n) => n.id === selected))
      api<Entry>(
        "/resources/" + selectedResource + (reader ? "?audience=reader" : ""),
      )
        .then((value) => {
          if (alive) setRecord({ token, value });
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [
    token,
    identity,
    ctx.entries.find((e) => e.id === selectedResource)?.revision,
  ]);
  const selectedNode = nodes.find((n) => n.id === selected),
    selectedEdge = graph.edges.find((e) => e.id === edgeId);
  const neighbours = new Set([
    selected,
    ...graph.edges
      .filter((e) => e.source === selected || e.target === selected)
      .flatMap((e) => [e.source, e.target]),
  ]);
  const shown = nodes.filter(
    (n) =>
      (!focus || !selected || neighbours.has(n.id)) &&
      (!query ||
        (n.title + " " + (n.summary || ""))
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const ids = new Set(shown.map((n) => n.id)),
    edges = graph.edges.filter(
      (e) =>
        ids.has(e.source) &&
        ids.has(e.target) &&
        (kind === "all" || e.kind === kind),
    );
  const point = (event: React.PointerEvent) => {
    const matrix = svg.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
          matrix.inverse(),
        )
      : new DOMPoint();
  };
  const move = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const now = point(event);
    if (state.id) {
      const x = Math.max(
          0,
          Math.min(10000, state.original.x + now.x - state.start.x),
        ),
        y = Math.max(
          0,
          Math.min(10000, state.original.y + now.y - state.start.y),
        );
      if (Math.hypot(now.x - state.start.x, now.y - state.start.y) > 3)
        state.moved = true;
      const next = { ...positionsRef.current, [state.id]: { x, y } };
      positionsRef.current = next;
      setPositions(next);
    } else {
      setCamera({
        ...state.camera,
        x: state.camera.x - (event.clientX - state.clientX) / state.scale,
        y: state.camera.y - (event.clientY - state.clientY) / state.scale,
      });
    }
  };
  const finish = () => {
    const state = drag.current;
    drag.current = null;
    if (state?.id) {
      if (state.moved) onPositions?.(positionsRef.current);
      else {
        setSelected(state.id);
        setEdgeId("");
      }
    }
  };
  return (
    <div className="affinity-web">
      {menu && <GraphContextMenu menu={menu} close={() => setMenu(null)} />}
      <div className="affinity-toolbar">
        <Field
          label={sceneMode ? guideSearchLabel : "Find in affinity web"}
          value={query}
          onChange={setQuery}
        />
        <label className="field">
          <span>Connection type</span>
          <SearchableSelect
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">
              {sceneMode ? "All connections" : "All relationships"}
            </option>
            {[...new Set(graph.edges.map((e) => e.kind))].sort().map((v) => (
              <option value={v} key={v}>
                {human(v)}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label className="affinity-focus">
          <input
            type="checkbox"
            checked={focus}
            disabled={!selected}
            onChange={(e) => setFocus(e.target.checked)}
          />
          Focus on selected entry
        </label>
      </div>
      <div className="affinity-controls">
        <button
          className="button secondary small"
          onClick={() => scale(0.8)}
          aria-label="Zoom in affinity web"
        >
          +
        </button>
        <button
          className="button secondary small"
          onClick={() => scale(1.25)}
          aria-label="Zoom out affinity web"
        >
          −
        </button>
        <button
          className="button secondary small"
          onClick={() => {
            setCamera(bounds(positions));
          }}
        >
          Fit web
        </button>
        {onPositions && (
          <button
            className="button secondary small"
            disabled={busy || !nodes.length}
            onClick={() => {
              const value = arrange(nodes);
              setPositions(value);
              setCamera(bounds(value));
              onPositions(value);
            }}
          >
            Arrange web
          </button>
        )}
        <span className="muted small-copy">
          {shown.length} entries · {edges.length} connections ·{" "}
          {Math.round((bounds(initial).w / camera.w) * 100)}%
          {busy ? " · Saving…" : ""}
        </span>
      </div>
      {graph.nodes.length > 250 && (
        <p className="notice">
          Showing the first 250 entries. Use a campaign web or saved graph
          filters for a smaller guide.
        </p>
      )}
      <div className="affinity-layout">
        <div className="affinity-stage relationship-canvas">
          <svg
            ref={svg}
            viewBox={`${camera.x} ${camera.y} ${camera.w} ${camera.h}`}
            role="group"
            aria-label="Interactive affinity web"
            onDragStart={(event) => event.preventDefault()}
            onContextMenu={(event) => {
              if (event.shiftKey) return;
              event.preventDefault();
              const target = event.target as Element;
              const nodeId = target
                .closest("[data-affinity-node]")
                ?.getAttribute("data-affinity-node");
              const connectionId = target
                .closest("[data-affinity-edge]")
                ?.getAttribute("data-affinity-edge");
              const node = nodes.find((n) => n.id === nodeId);
              const edge = graph.edges.find((e) => e.id === connectionId);
              const actions: GraphMenu["actions"] = [];
              if (node) {
                setSelected(node.id);
                setEdgeId("");
                actions.push({
                  label: "Inspect source notes",
                  run: () => {
                    setSelected(node.id);
                    setEdgeId("");
                  },
                });
                if (!reader)
                  actions.push({
                    label: "Open full original",
                    run: () => ctx.go("entry/" + (node.entry_id || node.id)),
                  });
                actions.push({
                  label: "Focus connections",
                  run: () => {
                    setSelected(node.id);
                    setFocus(true);
                  },
                });
                if (!reader && onConnection)
                  actions.push({
                    label: "Connect this entry",
                    disabled: busy,
                    run: () => onConnection(undefined, node.id),
                  });
                if (!reader && onNote)
                  actions.push({
                    label: "Add linked note",
                    disabled: busy,
                    run: () => onNote(node.entry_id || node.id),
                  });
              }
              if (edge) {
                setSelected(edge.source);
                setEdgeId(edge.id);
                actions.push({
                  label: "Inspect connection",
                  run: () => {
                    setSelected(edge.source);
                    setEdgeId(edge.id);
                  },
                });
                const original = ctx.edges.find((e) => e.id === edge.id);
                if (!reader && onConnection && original)
                  actions.push({
                    label: "Edit relationship",
                    disabled: busy,
                    run: () => onConnection(original),
                  });
              }
              actions.push(
                {
                  label: "Zoom in here",
                  run: () => scale(0.8, { x: event.clientX, y: event.clientY }),
                },
                {
                  label: "Zoom out here",
                  run: () =>
                    scale(1.25, { x: event.clientX, y: event.clientY }),
                },
                {
                  label: "Fit web",
                  run: () => setCamera(bounds(positionsRef.current)),
                },
              );
              if (focus)
                actions.push({
                  label: "Show all connections",
                  run: () => setFocus(false),
                });
              setMenu({ x: event.clientX, y: event.clientY, actions });
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              drag.current = {
                camera,
                clientX: event.clientX,
                clientY: event.clientY,
                scale: svg.current?.getScreenCTM()?.a || 1,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={() => {
              const state = drag.current;
              drag.current = null;
              if (state?.id) setPositions(initial);
            }}
          >
            <defs>
              <marker
                id={arrow}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M0 0L10 5L0 10Z" fill="context-stroke" />
              </marker>
            </defs>
            {edges.map((edge, index) => {
              const a = positions[edge.source],
                b = positions[edge.target];
              if (!a || !b) return null;
              const dx = b.x - a.x,
                dy = b.y - a.y,
                length = Math.hypot(dx, dy) || 1,
                offset = graph.edges
                  .filter(
                    (e) =>
                      (e.source === edge.source && e.target === edge.target) ||
                      (e.source === edge.target && e.target === edge.source),
                  )
                  .findIndex((e) => e.id === edge.id);
              const bend = (offset + 1) * 26 * (index % 2 ? 1 : -1),
                cx = (a.x + b.x) / 2 - (dy / length) * bend,
                cy = (a.y + b.y) / 2 + (dx / length) * bend;
              const path = `M${a.x + (dx / length) * 47} ${a.y + (dy / length) * 47} Q${cx} ${cy} ${b.x - (dx / length) * 49} ${b.y - (dy / length) * 49}`;
              return (
                <g
                  key={edge.id}
                  className={
                    "affinity-edge " + (edgeId === edge.id ? "selected" : "")
                  }
                  data-affinity-edge={edge.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${nodes.find((n) => n.id === edge.source)?.title} → ${edge.label || human(edge.kind)} → ${nodes.find((n) => n.id === edge.target)?.title}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setEdgeId(edge.id);
                    setSelected(edge.source);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEdgeId(edge.id);
                      setSelected(edge.source);
                    }
                  }}
                >
                  <path className="affinity-edge-hit" d={path} />
                  <path
                    d={path}
                    stroke={colour(edge.kind, edge.strength)}
                    strokeWidth={edgeId === edge.id ? 5 : 3}
                    markerEnd={`url(#${arrow})`}
                    strokeDasharray={
                      (edge.strength || 0) < 0 ? "8 5" : undefined
                    }
                  />
                  <text x={cx} y={cy - 7} textAnchor="middle">
                    {(edge.label || human(edge.kind)).slice(0, 36)}
                  </text>
                </g>
              );
            })}
            {shown.map((node) => {
              const p = positions[node.id];
              if (!p) return null;
              const portrait = ctx.assets.find(
                (a) => a.id === node.portrait_asset_id,
              );
              const portraitURL = portrait?.url || node.portrait_url || "";
              return (
                <g
                  key={node.id}
                  data-affinity-node={node.id}
                  className={
                    "affinity-node " + (selected === node.id ? "selected" : "")
                  }
                  transform={`translate(${p.x},${p.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={"Inspect " + node.title}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.stopPropagation();
                    if (!onPositions || busy) {
                      setSelected(node.id);
                      setEdgeId("");
                      return;
                    }
                    drag.current = {
                      id: node.id,
                      start: point(event),
                      original: p,
                      moved: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={move}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    finish();
                  }}
                  onClick={() => {
                    setSelected(node.id);
                    setEdgeId("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(node.id);
                      setEdgeId("");
                    } else if (
                      onPositions &&
                      !busy &&
                      [
                        "ArrowUp",
                        "ArrowDown",
                        "ArrowLeft",
                        "ArrowRight",
                      ].includes(event.key)
                    ) {
                      event.preventDefault();
                      const value = {
                        ...positions,
                        [node.id]: {
                          x: Math.max(
                            0,
                            Math.min(
                              10000,
                              p.x +
                                (event.key === "ArrowRight"
                                  ? 20
                                  : event.key === "ArrowLeft"
                                    ? -20
                                    : 0),
                            ),
                          ),
                          y: Math.max(
                            0,
                            Math.min(
                              10000,
                              p.y +
                                (event.key === "ArrowDown"
                                  ? 20
                                  : event.key === "ArrowUp"
                                    ? -20
                                    : 0),
                            ),
                          ),
                        },
                      };
                      setPositions(value);
                      onPositions(value);
                    }
                  }}
                >
                  <title>{node.title}</title>
                  <circle
                    r="47"
                    fill={
                      node.kind === "map"
                        ? "#e0ebee"
                        : node.kind === "character" ||
                            node.template === "character"
                          ? "#f0e6cf"
                          : "#e1e9dc"
                    }
                  />
                  {portraitURL ? (
                    <>
                      <defs>
                        <clipPath id={`portrait-${arrow}-${node.id}`}>
                          <circle r="39" />
                        </clipPath>
                      </defs>
                      <image
                        href={portraitURL}
                        x="-39"
                        y="-39"
                        width="78"
                        height="78"
                        preserveAspectRatio="xMidYMid slice"
                        clipPath={`url(#portrait-${arrow}-${node.id})`}
                        pointerEvents="none"
                      />
                    </>
                  ) : (
                    <text
                      className="affinity-initial"
                      textAnchor="middle"
                      y="11"
                    >
                      {node.title
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((word) => word[0])
                        .join("")}
                    </text>
                  )}
                  <text
                    className="affinity-node-name"
                    textAnchor="middle"
                    y="69"
                  >
                    {node.title.length > 26
                      ? node.title.slice(0, 25) + "…"
                      : node.title}
                  </text>
                  <text
                    className="affinity-node-kind"
                    textAnchor="middle"
                    y="87"
                  >
                    {human(
                      node.template === "generic" ? node.kind : node.template,
                    )}
                  </text>
                </g>
              );
            })}
          </svg>
          {!shown.length && (
            <p className="affinity-empty">
              No matching entries. Link characters or lore to this campaign, or
              change the filters.
            </p>
          )}
        </div>
        <aside className="affinity-inspector" aria-label="Affinity notes">
          {!selectedNode ? (
            <>
              <h3>{sceneMode ? guideTitle : "Your campaign, connected"}</h3>
              {sceneMode ? (
                <p>
                  Select an entry, objective or route to inspect its original
                  notes. Arrows show route direction and prerequisite order.
                  Conditions remain GM guidance.
                </p>
              ) : (
                <>
                  <p>
                    Select a portrait or relationship to inspect it. Drag the
                    background or middle-drag anywhere to pan; scroll to zoom at
                    the pointer. Right-click for graph actions.
                  </p>
                  {onPositions && (
                    <p>
                      Drag portraits to arrange the guide. Keyboard: focus a
                      portrait and use arrow keys to move it; Enter opens its
                      notes.
                    </p>
                  )}
                  <div className="affinity-legend">
                    <span style={{ color: colour("friend") }}>
                      ● Friendship / positive strength
                    </span>
                    <span style={{ color: colour("rival") }}>
                      ● Rivalry / negative strength
                    </span>
                    <span style={{ color: colour("parent") }}>● Family</span>
                    <span style={{ color: colour("member") }}>
                      ● Membership / location
                    </span>
                  </div>
                </>
              )}
              {sceneMode && onPositions && (
                <p>
                  Drag entries to arrange this guide. Focus an entry and use
                  arrow keys to move it; Enter opens its notes.
                </p>
              )}
            </>
          ) : (
            <>
              <h3>{selectedNode.title}</h3>
              <p className="muted">
                {human(
                  selectedNode.template === "generic"
                    ? selectedNode.kind
                    : selectedNode.template,
                )}
              </p>
              {selectedNode.summary && <p>{selectedNode.summary}</p>}
              {error && <ErrorBox message={error} />}
              {record?.token === token && (
                <>
                  <div
                    className="affinity-entry-notes reader-prose"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(record.value.html || ""),
                    }}
                  />
                  {!reader && record.value.private_notes && (
                    <details>
                      <summary>GM notes</summary>
                      <p className="campaign-record-excerpt">
                        {record.value.private_notes}
                      </p>
                    </details>
                  )}
                </>
              )}
              {!reader && (
                <button
                  className="button secondary small"
                  onClick={() => ctx.go("entry/" + selectedResource)}
                >
                  Open full entry & notes
                </button>
              )}
              {!reader && onPortrait && record?.token === token && (
                <label className="field">
                  <span>Portrait image</span>
                  <SearchableSelect
                    disabled={busy}
                    value={record.value.data.cover_asset || ""}
                    onChange={(e) => onPortrait(record.value, e.target.value)}
                  >
                    <option value="">Use initials</option>
                    {ctx.assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </SearchableSelect>
                </label>
              )}
              {!reader && onPortrait && record?.token === token && (
                <LinkedPortrait
                  value={record.value.data.cover_url || ""}
                  disabled={busy}
                  onSave={async (url) => {
                    await patch("/resources/" + record.value.id, {
                      expected_revision: record.value.revision,
                      data: {
                        ...record.value.data,
                        cover_asset: "",
                        cover_url: url,
                      },
                    });
                    await ctx.refresh();
                  }}
                />
              )}
              {onConnection && (
                <button
                  className="button primary small"
                  onClick={() => onConnection(undefined, selected)}
                >
                  Connect this entry
                </button>
              )}
              {selectedEdge && (
                <section className="affinity-connection-note">
                  <h4>{selectedEdge.label || human(selectedEdge.kind)}</h4>
                  <p>
                    {nodes.find((n) => n.id === selectedEdge.source)?.title} →{" "}
                    {nodes.find((n) => n.id === selectedEdge.target)?.title}
                  </p>
                  {!sceneMode && (
                    <p>Directional strength: {selectedEdge.strength || 0}</p>
                  )}
                  {!reader && (
                    <p className="campaign-record-excerpt">
                      {sceneMode
                        ? selectedEdge.notes || "No additional route condition."
                        : ctx.edges.find((e) => e.id === selectedEdge.id)
                            ?.notes || "No relationship notes yet."}
                    </p>
                  )}
                  {onConnection && (
                    <button
                      className="text-button"
                      onClick={() =>
                        onConnection(
                          ctx.edges.find((e) => e.id === selectedEdge.id),
                        )
                      }
                    >
                      Edit relationship & notes
                    </button>
                  )}
                </section>
              )}
              <h4>Connections</h4>
              {!reader && !sceneMode && selectedEdge && (
                <section className="affinity-connection-note">
                  <h4>Session relationship developments</h4>
                  {ctx.entries
                    .filter(
                      (e) =>
                        e.data.continuity_type === "relationship-event" &&
                        e.data.connection_id === selectedEdge.id &&
                        (!campaignId || e.data.campaign_id === campaignId),
                    )
                    .map((e) => (
                      <button
                        className="text-button affinity-related-note"
                        key={e.id}
                        onClick={() => ctx.go("entry/" + e.id)}
                      >
                        {e.title}
                      </button>
                    ))}
                  {campaignId && (
                    <button
                      className="button secondary small"
                      onClick={() =>
                        ctx.go(
                          `campaign-continuity/${campaignId}/relationships/all`,
                        )
                      }
                    >
                      Record relationship developments
                    </button>
                  )}
                </section>
              )}
              <div className="affinity-neighbours">
                {graph.edges
                  .filter((e) => e.source === selected || e.target === selected)
                  .map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setEdgeId(e.id);
                      }}
                    >
                      {e.source === selected ? "→" : "←"}{" "}
                      {e.label || human(e.kind)} ·{" "}
                      {nodes.find(
                        (n) =>
                          n.id ===
                          (e.source === selected ? e.target : e.source),
                      )?.title || "Outside displayed entries"}
                    </button>
                  ))}
              </div>
              {!reader && (
                <>
                  <h4>Linked campaign notes & progress</h4>
                  {onNote && (
                    <button
                      className="button secondary small"
                      onClick={() => onNote(selected)}
                    >
                      Write linked note
                    </button>
                  )}
                  {ctx.entries
                    .filter(
                      (e) =>
                        ["note", "session", "quest", "task"].includes(e.kind) &&
                        (!campaignId ||
                          (e.data.campaign_id ?? e.parent) === campaignId) &&
                        (e.data.related_entries || []).includes(selected),
                    )
                    .map((e) => (
                      <button
                        key={e.id}
                        className="text-button affinity-related-note"
                        onClick={() => ctx.go("entry/" + e.id)}
                      >
                        {e.title}
                      </button>
                    ))}
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export function AffinityWorkspace({
  ctx,
  campaignId = "",
}: {
  ctx: AppContext;
  campaignId?: string;
}) {
  const boards = ctx.entries.filter(
    (e) =>
      e.kind === "relationship" &&
      e.data.layout === "affinity" &&
      (!campaignId || e.data.campaign_id === campaignId),
  );
  const [chosen, setChosen] = useState(""),
    [creating, setCreating] = useState(false),
    [title, setTitle] = useState(""),
    [graph, setGraph] = useState<{ id: string; value: AffinityGraph } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<any>(null);
  const [noteFor, setNoteFor] = useState(""),
    [noteTitle, setNoteTitle] = useState(""),
    [noteText, setNoteText] = useState("");
  const board = boards.find((e) => e.id === chosen) || boards[0],
    token = JSON.stringify([
      board?.id,
      board?.revision,
      ctx.entries.map((e) => [
        e.id,
        e.revision,
        e.published_revision,
        e.visibility,
      ]),
      ctx.edges,
    ]);
  useEffect(() => {
    let alive = true;
    setError("");
    if (board)
      api<AffinityGraph>("/resources/" + board.id + "/graph")
        .then((value) => {
          if (alive) setGraph({ id: board.id, value });
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [token]);
  const savePositions = async (positions: Record<string, Point>) => {
    if (!board || busy) return;
    setBusy(true);
    setError("");
    try {
      await patch("/resources/" + board.id, {
        data: {
          ...board.data,
          positions: { ...board.data.positions, ...positions },
        },
        expected_revision: board.revision,
      });
      await ctx.refresh();
    } catch (e: any) {
      setError(e.message + " Your arranged positions remain on screen.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="affinity-workspace">
      <div className="section-heading">
        <h2>Affinity web</h2>
        <div className="button-row">
          {board && (
            <button
              className="button secondary small"
              onClick={() => ctx.go("entry/" + board.id)}
            >
              Web notes & reader preview
            </button>
          )}
          <button
            className="button primary small"
            onClick={() => {
              setTitle(
                campaignId ? "Campaign affinity web" : "World affinity web",
              );
              setCreating(true);
              setError("");
            }}
          >
            New affinity web
          </button>
        </div>
      </div>
      {!!boards.length && (
        <label className="field">
          <span>Saved affinity web</span>
          <SearchableSelect
            value={board?.id || ""}
            onChange={(e) => setChosen(e.target.value)}
          >
            {boards.map((e) => (
              <option value={e.id} key={e.id}>
                {e.title}
              </option>
            ))}
          </SearchableSelect>
        </label>
      )}
      {error && <ErrorBox message={error} />}
      {error && board && (
        <button
          className="button secondary small"
          onClick={() => ctx.refresh().catch((e) => setError(e.message))}
        >
          Reload saved web
        </button>
      )}
      {board && graph?.id === board.id ? (
        <AffinityDiagram
          key={board.id}
          ctx={ctx}
          graph={graph.value}
          campaignId={board.data.campaign_id || ""}
          busy={busy}
          onPositions={savePositions}
          onPortrait={async (entry, asset) => {
            setBusy(true);
            setError("");
            try {
              await patch("/resources/" + entry.id, {
                data: { ...entry.data, cover_asset: asset, cover_url: "" },
                expected_revision: entry.revision,
              });
              await ctx.refresh();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
          onNote={(id) => {
            setNoteFor(id);
            setNoteTitle("");
            setNoteText("");
            setError("");
          }}
          onConnection={(edge, source) => {
            setError("");
            setForm(
              edge
                ? { ...edge }
                : {
                    source: source || "",
                    target: "",
                    kind: "friend",
                    label: "",
                    strength: 0,
                    notes: "",
                    visibility: "private",
                  },
            );
          }}
        />
      ) : (
        <p className="muted">
          {board
            ? "Opening affinity web…"
            : "Create a web to arrange characters, places, maps and their relationships. It follows your existing lore and connection records."}
        </p>
      )}
      {creating && (
        <Modal
          title="New affinity web"
          onClose={() => {
            if (!busy) setCreating(false);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || !title.trim()) return;
              setBusy(true);
              try {
                const value = await post<Entry>(
                  "/worlds/" + ctx.world.id + "/resources",
                  {
                    kind: "relationship",
                    title,
                    data: {
                      mode: "all",
                      layout: "affinity",
                      campaign_id: campaignId,
                      include_isolated: true,
                      positions: {},
                    },
                    visibility: "private",
                  },
                );
                setChosen(value.id);
                await ctx.refresh();
                setCreating(false);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Affinity web name"
              value={title}
              onChange={setTitle}
            />
            <p className="muted">
              {campaignId
                ? "Includes the party and lore linked to this campaign. Add more through Characters & places or the related-entry fields in your notes."
                : "Includes world characters, lore, quests and maps. Saved graph filters can narrow the guide."}
            </p>
            {error && <ErrorBox message={error} />}
            <button className="button primary" disabled={busy || !title.trim()}>
              Create affinity web
            </button>
          </form>
        </Modal>
      )}
      {noteFor && (
        <Modal
          title="Write linked campaign note"
          onClose={() => {
            if (!busy) setNoteFor("");
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || !noteTitle.trim()) return;
              setBusy(true);
              setError("");
              try {
                await post("/worlds/" + ctx.world.id + "/resources", {
                  kind: "note",
                  title: noteTitle,
                  summary: noteText.slice(0, 240),
                  document: docFromText(noteText),
                  visibility: "private",
                  parent: campaignId || null,
                  data: {
                    record_type: "note",
                    campaign_id: campaignId,
                    related_entries: [noteFor],
                  },
                });
                await ctx.refresh();
                setNoteFor("");
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Linked note title"
              value={noteTitle}
              onChange={setNoteTitle}
            />
            <label className="field">
              <span>Linked note text</span>
              <textarea
                rows={7}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </label>
            {error && <ErrorBox message={error} />}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setNoteFor("")}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || !noteTitle.trim()}
              >
                Save linked note
              </button>
            </div>
          </form>
        </Modal>
      )}
      {form && (
        <Modal
          title={
            form.id ? "Edit affinity relationship" : "Add affinity relationship"
          }
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <ConnectionFields
            ctx={{
              ...ctx,
              entries: ctx.entries.filter((e) =>
                graph?.value.nodes.some((n) => n.id === e.id),
              ),
            }}
            data={form}
            onChange={setForm}
          />
          {error && <ErrorBox message={error} />}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setForm(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy || !form.source || !form.target}
              onClick={async () => {
                setBusy(true);
                try {
                  const fields = Object.fromEntries(
                    [
                      "source",
                      "target",
                      "kind",
                      "label",
                      "strength",
                      "notes",
                      "visibility",
                    ].map((key) => [key, form[key]]),
                  );
                  await (form.id
                    ? patch("/connections/" + form.id, {
                        ...fields,
                        expected_revision: form.revision,
                      })
                    : post("/worlds/" + ctx.world.id + "/connections", fields));
                  await ctx.refresh();
                  setForm(null);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save affinity relationship
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
