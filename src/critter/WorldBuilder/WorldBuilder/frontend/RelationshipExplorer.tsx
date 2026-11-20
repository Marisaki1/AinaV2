import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, useGraphNavigation } from "./GraphNavigation";
import { AppContext, Edge, api, human } from "./domain";
import { ConnectionFields } from "./Connections";
import { ErrorBox, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { ArrowRight, ChevronLeft, ChevronRight, Search, ZoomIn, ZoomOut, Maximize, RotateCcw, Edit3 } from "lucide-react";

const groups: Record<string, string[]> = {
  family: ["family", "parent", "adoptive-parent", "guardian", "spouse", "sibling"],
  teams: ["member", "team-member", "recorded-team-member", "journal-roster", "tournament-roster", "leader", "subordinate", "works-at"],
  personal: ["friend", "classmate", "mentor", "companion", "patron", "ally", "attachment"],
};

export function RelationshipExplorer({ ctx, diplomacy = false, scope = "" }: { ctx: AppContext; diplomacy?: boolean; scope?: string }) {
  const storageKey = `worldbuilder.relationship-board:${ctx.world.id}:${diplomacy ? "diplomacy" : "all"}${scope ? ":" + scope : ""}`;
  const [saved] = useState(() => { try { const value = JSON.parse(localStorage.getItem(storageKey) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } });
  const [query, setQuery] = useState(typeof saved.query === "string" ? saved.query : "");
  const [category, setCategory] = useState(["all", "family", "teams", "personal"].includes(saved.category) ? saved.category : "all");
  const [selected, setSelected] = useState(typeof saved.selected === "string" ? saved.selected : "");
  const [page, setPage] = useState(Number.isInteger(saved.page) && saved.page >= 0 ? saved.page : 0);
  const [detail, setDetail] = useState(typeof saved.detail === "string" ? saved.detail : "");
  const [editing, setEditing] = useState<Edge | null>(null), [editError, setEditError] = useState(""), [saving, setSaving] = useState(false);
  const editLock = useRef(false);
  const initialCamera = saved.camera && ["x", "y", "w", "h"].every(k => Number.isFinite(saved.camera[k])) && saved.camera.w > 0 && saved.camera.h > 0 ? saved.camera : { x: 0, y: 0, w: 860, h: 440 };
  const [camera, setCamera] = useState<Camera>(initialCamera);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => Object.fromEntries(Object.entries(saved.positions || {}).filter(([, p]: [string, any]) => p && Number.isFinite(p.x) && Number.isFinite(p.y))) as Record<string, { x: number; y: number }>);
  const svg = useRef<SVGSVGElement>(null);
  const zoomBy = useGraphNavigation(svg, camera, setCamera);
  const drag = useRef<{ pointer: number; id: string | null; x: number; y: number; origin: { x: number; y: number }; camera: Camera; inverse: DOMMatrix; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify({ query, category, selected, page, detail, camera, positions })); } catch {} }, [storageKey, query, category, selected, page, detail, camera, positions]);
  const entries = useMemo(() => new Map(ctx.entries.map(e => [e.id, e])), [ctx.entries]);
  const edges = useMemo(() => ctx.edges.filter(e => !e.deleted_at && entries.has(e.source) && entries.has(e.target)
    && (!diplomacy || e.kind === "diplomacy")
    && (category === "all" || (groups[category] || []).includes(e.kind))), [ctx.edges, entries, category, diplomacy]);
  const degree = new Map<string, number>();
  edges.forEach(e => [e.source, e.target].forEach(id => degree.set(id, (degree.get(id) || 0) + 1)));
  const people = ctx.entries.filter(e => degree.has(e.id)).sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.title.localeCompare(b.title));
  const focus = entries.get(selected) && degree.has(selected) ? entries.get(selected)! : people[0];
  const matches = people.filter(e => [e.title, ...e.aliases].join(" ").toLowerCase().includes(query.toLowerCase()));
  const connections = focus ? edges.filter(e => e.source === focus.id || e.target === focus.id) : [];
  const neighbors = [...new Set(connections.map(e => e.source === focus?.id ? e.target : e.source))].map(id => entries.get(id)!);
  const lastPage = Math.max(0, Math.ceil(neighbors.length / 8) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = neighbors.slice(currentPage * 8, currentPage * 8 + 8);
  const activeEdge = connections.find(e => e.id === detail);
  const choose = (id: string) => { setSelected(id); setPage(0); setDetail(""); setCamera({ x: 0, y: 0, w: 860, h: 440 }); };
  const position = (id: string, x: number, y: number) => positions[`${focus?.id}:${id}`] || { x, y };
  const node = (id: string, x: number, y: number, center = false) => {
    ({ x, y } = position(id, x, y));
    const entry = entries.get(id)!;
    const words = entry.title.split(/\s+/);
    const lines: string[] = [""];
    words.forEach(word => {
      if ((lines[lines.length - 1] + " " + word).trim().length > 23 && lines[lines.length - 1]) lines.push(word);
      else lines[lines.length - 1] = (lines[lines.length - 1] + " " + word).trim();
    });
    return <g key={id} data-card-id={id} data-card-x={x} data-card-y={y} className={"relationship-node" + (center ? " is-focus" : "")} role="button" tabIndex={0}
      aria-label={center ? "Open " + entry.title : "Explore " + entry.title}
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } center ? ctx.go("entry/" + id) : choose(id); }}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); center ? ctx.go("entry/" + id) : choose(id); } }}>
      <title>{entry.title}</title>
      <rect x={x - 104} y={y - 36} width={208} height={72} rx={12} />
      {lines.slice(0, 3).map((line, index) => <text key={index} x={x} y={y - (Math.min(lines.length, 3) - 1) * 7 - 4 + index * 14} textAnchor="middle">{line}</text>)}
      <text className="relationship-node-kind" x={x} y={y + 26} textAnchor="middle">{human(entry.template === "generic" ? entry.kind : entry.template)}</text>
    </g>;
  };
  return <section className="relationship-explorer" aria-label="Relationship explorer">
    <aside className="relationship-browser">
      <label className="relationship-search"><Search size={16} /><input aria-label="Find a connected entry" placeholder="Find a person or group" value={query} onChange={e => setQuery(e.target.value)} /></label>
      {!diplomacy && <SearchableSelect aria-label="Filter relationships" value={category} onChange={e => { setCategory(e.target.value); setPage(0); setDetail(""); }}>
        <option value="all">All relationship types</option><option value="personal">People & allies</option><option value="teams">Teams & affiliations</option><option value="family">Family</option>
      </SearchableSelect>}
      <div className="relationship-entry-list" aria-label="Connected entries">
        {matches.map(e => <button key={e.id} className={focus?.id === e.id ? "selected" : ""} onClick={() => choose(e.id)}><span>{e.title}</span><small>{degree.get(e.id)}</small></button>)}
        {!matches.length && <p className="muted">No matching connections.</p>}
      </div>
    </aside>
    <div className="relationship-stage">
      {focus ? <>
        <header className="relationship-focus-heading"><div><span className="eyebrow">CONNECTIONS AROUND</span><h2>{focus.title}</h2><span className="muted">{neighbors.length} connected entries · {connections.length} relationships</span></div><button className="button secondary small" onClick={() => ctx.go("entry/" + focus.id)}>Open notes <ArrowRight size={14} /></button></header>
        <div className="relationship-board-tools"><button className="icon-button" aria-label="Zoom relationships out" onClick={() => zoomBy(1.2)}><ZoomOut size={17} /></button><span>{Math.round(860 / camera.w * 100)}%</span><button className="icon-button" aria-label="Zoom relationships in" onClick={() => zoomBy(1 / 1.2)}><ZoomIn size={17} /></button><button className="button secondary small" onClick={() => {
          const points = [position(focus.id, 430, 218), ...visible.map((e, i) => position(e.id, i < 4 ? 120 : 740, 62 + (i % 4) * 104))];
          const x = Math.min(...points.map(p => p.x)) - 120, y = Math.min(...points.map(p => p.y)) - 55;
          const w = Math.max(...points.map(p => p.x)) - x + 120, h = Math.max(...points.map(p => p.y)) - y + 55;
          setCamera({ x, y, w: Math.max(w, h * 860 / 440), h: Math.max(h, w * 440 / 860) });
        }}><Maximize size={14} /> Fit</button><button className="button secondary small" onClick={() => { setPositions(old => Object.fromEntries(Object.entries(old).filter(([key]) => !key.startsWith(focus.id + ":")))); setCamera({ x: 0, y: 0, w: 860, h: 440 }); }}><RotateCcw size={14} /> Reset layout</button></div>
        <div className="relationship-neighborhood">
          <svg ref={svg} viewBox={`${camera.x} ${camera.y} ${camera.w} ${camera.h}`} width="860" height="440" role="group" aria-label={"Connections around " + focus.title}
            onPointerDown={event => {
              if (event.button !== 0) return;
              const matrix = svg.current?.getScreenCTM(); if (!matrix) return;
              const card = (event.target as Element).closest("[data-card-id]");
              drag.current = { pointer: event.pointerId, id: card?.getAttribute("data-card-id") || null, x: event.clientX, y: event.clientY, origin: { x: Number(card?.getAttribute("data-card-x") || 0), y: Number(card?.getAttribute("data-card-y") || 0) }, camera, inverse: matrix.inverse(), moved: false };
            }}
            onPointerMove={event => {
              const gesture = drag.current; if (!gesture || gesture.pointer !== event.pointerId) return;
              if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 4 && !gesture.moved) return;
              if (!gesture.moved) event.currentTarget.setPointerCapture(event.pointerId);
              gesture.moved = true;
              const start = new DOMPoint(gesture.x, gesture.y).matrixTransform(gesture.inverse), end = new DOMPoint(event.clientX, event.clientY).matrixTransform(gesture.inverse);
              if (gesture.id) setPositions(old => ({ ...old, [`${focus.id}:${gesture.id}`]: { x: gesture.origin.x + end.x - start.x, y: gesture.origin.y + end.y - start.y } }));
              else setCamera({ ...gesture.camera, x: gesture.camera.x + start.x - end.x, y: gesture.camera.y + start.y - end.y });
            }}
            onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { suppressClick.current = drag.current.moved; drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setTimeout(() => { suppressClick.current = false; }, 0); } }}
            onPointerCancel={() => { drag.current = null; suppressClick.current = false; }}>
            {visible.map((entry, index) => {
              const p = position(entry.id, index < 4 ? 120 : 740, 62 + (index % 4) * 104), c = position(focus.id, 430, 218);
              const direction = p.x < c.x ? -1 : 1;
              return <path key={entry.id} d={`M ${c.x + direction * 104} ${c.y} C ${c.x + direction * 190} ${c.y}, ${p.x - direction * 190} ${p.y}, ${p.x - direction * 104} ${p.y}`} />;
            })}
            {node(focus.id, 430, 218, true)}
            {visible.map((entry, index) => node(entry.id, index < 4 ? 120 : 740, 62 + (index % 4) * 104))}
          </svg>
        </div>
        {lastPage > 0 && <div className="relationship-pagination"><button className="button secondary small" disabled={currentPage === 0} aria-label="Previous connections" onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>{currentPage * 8 + 1}–{Math.min((currentPage + 1) * 8, neighbors.length)} of {neighbors.length}</span><button className="button secondary small" disabled={currentPage === lastPage} aria-label="Next connections" onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div>}
        <div className="relationship-cards" aria-label="Relationship details">
          {connections.map(edge => {
            const other = entries.get(edge.source === focus.id ? edge.target : edge.source)!;
            return <article key={edge.id} className={detail === edge.id ? "selected" : ""}><button className="relationship-card-summary" aria-expanded={detail === edge.id} onClick={() => setDetail(detail === edge.id ? "" : edge.id)}>
              <strong>{other.title}</strong><span>{edge.label || human(edge.kind)}</span><small>{entries.get(edge.source)!.title} → {entries.get(edge.target)!.title}</small>
              {detail === edge.id && <p>{edge.notes || "No additional notes."}</p>}
            </button><button className="relationship-card-edit icon-button" aria-label={"Edit relationship with " + other.title} onClick={() => { setEditing({ ...edge }); setEditError(""); }}><Edit3 size={15} /></button></article>;
          })}
        </div>
        {activeEdge && <button className="text-button" onClick={() => ctx.go("entry/" + (activeEdge.source === focus.id ? activeEdge.target : activeEdge.source))}>Open connected entry <ArrowRight size={14} /></button>}
      </> : <p className="relationship-empty">No connections in this view. Choose another relationship type or add a connection.</p>}
    </div>
    {editing && <Modal title="Edit relationship" onClose={() => { if (!saving) setEditing(null); }}>
      <ConnectionFields ctx={ctx} data={editing} onChange={setEditing} />
      {editError && <ErrorBox message={editError} />}
      <div className="modal-actions"><button className="button secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button className="button primary" disabled={saving || !editing.source || !editing.target} onClick={async () => {
        if (editLock.current) return; editLock.current = true; setSaving(true); setEditError("");
        try { await api(`/connections/${editing.id}`, { method: "PATCH", body: JSON.stringify({ expected_revision: editing.revision, ...Object.fromEntries(["source", "target", "kind", "label", "strength", "notes", "visibility"].map(key => [key, (editing as any)[key]])) }) }); setEditing(null); await ctx.refresh(); }
        catch (e: any) { setEditError(e.message); } finally { editLock.current = false; setSaving(false); }
      }}>{saving ? "Saving…" : "Save relationship"}</button></div>
    </Modal>}
    {!editing && editError && <ErrorBox message={editError} />}
  </section>;
}
