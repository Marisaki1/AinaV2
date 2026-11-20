import React, { useRef, useState } from "react";
import { AppContext, Entry, patch, post } from "./domain";
import { ErrorBox, Modal } from "./ui";
import { ArrowUpRight, CheckSquare, Network, Plus } from "lucide-react";

export function EntryContext({ ctx, entry, beforeChange }: { ctx: AppContext; entry: Entry; beforeChange: () => Promise<boolean> }) {
  const [adding, setAdding] = useState(false), [title, setTitle] = useState(""), [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [showCompleted, setShowCompleted] = useState(false);
  const locked = useRef(false);
  const tasks = ctx.entries.filter(e => e.kind === "task" && e.data.source_note_id === entry.id);
  const visibleTasks = tasks.filter(e => showCompleted || e.data.progress !== "done");
  const relationships = ctx.edges.filter(e => !e.deleted_at && (e.source === entry.id || e.target === entry.id));
  const activeIds = new Set(ctx.entries.map(e => e.id));
  const neighbors = [...new Set(relationships.map(e => e.source === entry.id ? e.target : e.source))].filter(id => activeIds.has(id));
  const openBoard = () => {
    try {
      const key = `worldbuilder.relationship-board:${ctx.world.id}:all`;
      const raw = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...(raw && typeof raw === "object" ? raw : {}), selected: entry.id, query: "", category: "all", page: 0, camera: { x: 0, y: 0, w: 860, h: 440 } }));
      localStorage.setItem("worldbuilder.relationship-mode:" + ctx.world.id, "all");
    } catch {}
    ctx.go("relationships");
  };
  return <section className="entry-context" aria-label="Entry follow-ups and connections">
    <div className="entry-context-heading"><h3><CheckSquare size={14} /> Follow-ups</h3><button className="icon-button" aria-label="Add a follow-up" onClick={() => { setTitle(""); setNotes(""); setError(""); setAdding(true); }}><Plus size={15} /></button></div>
    {!!tasks.length && <label className="entry-context-filter"><input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} /> Show completed</label>}
    {visibleTasks.map(task => <div className="entry-followup" key={task.id}><input aria-label={"Complete follow-up " + task.title} type="checkbox" checked={task.data.progress === "done"} disabled={!!busy} onChange={async () => {
      if (locked.current) return; locked.current = true; setBusy(task.id); setError("");
      try { await patch(`/resources/${task.id}`, { expected_revision: task.revision, data: { ...task.data, progress: task.data.progress === "done" ? "open" : "done" } }); await ctx.refresh(); } catch (e: any) { setError(e.message); } finally { locked.current = false; setBusy(""); }
    }} /><button onClick={() => ctx.go("entry/" + task.id)}>{task.title}</button></div>)}
    {!visibleTasks.length && <p className="muted small-copy">{tasks.length ? "No open follow-ups." : "No follow-ups yet."}</p>}
    {error && !adding && <ErrorBox message={error} />}
    <div className="entry-context-heading"><h3><Network size={14} /> Connected entries</h3>{!!neighbors.length && <button className="text-button" onClick={openBoard}>Board <ArrowUpRight size={12} /></button>}</div>
    {neighbors.slice(0, 6).map(id => { const other = ctx.entries.find(e => e.id === id)!; return <button className="backlink" key={id} onClick={() => ctx.go("entry/" + id)}>{other.title}<ArrowUpRight size={12} /></button>; })}
    {neighbors.length > 6 && <button className="text-button" onClick={openBoard}>View all {neighbors.length} connected entries</button>}
    {!neighbors.length && <p className="muted small-copy">No relationships recorded.</p>}
    {adding && <Modal title="Add follow-up" onClose={() => { if (!busy) setAdding(false); }}>
      {error && <ErrorBox message={error} />}
      <p className="muted">Linked to {entry.title}</p>
      <label className="field"><span>Follow-up title</span><input autoFocus maxLength={180} value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs attention next?" /></label>
      <label className="field"><span>Follow-up notes</span><textarea value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <div className="modal-actions"><button className="button secondary" disabled={!!busy} onClick={() => setAdding(false)}>Cancel</button><button className="button primary" disabled={!!busy || !title.trim()} onClick={async () => {
        if (locked.current || !title.trim()) return; locked.current = true; setBusy("new"); setError("");
        try {
          if (!(await beforeChange())) throw Error("Save or recover the original entry before adding a follow-up. Your follow-up draft is kept here.");
          await post(`/worlds/${ctx.world.id}/resources`, { kind: "task", title: title.trim(), visibility: "private", data: { progress: "open", source_note_id: entry.id }, document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Follow-up for " }, { type: "resourceLink", attrs: { id: entry.id } }] }, ...(notes.trim() ? [{ type: "paragraph", content: [{ type: "text", text: notes.trim() }] }] : [])] } });
          setAdding(false);
          try { await ctx.refresh(); } catch { setError("Follow-up saved. Reload the page to refresh the list."); }
        } catch (e: any) { setError(e.message); } finally { locked.current = false; setBusy(""); }
      }}>{busy ? "Saving…" : "Create follow-up"}</button></div>
    </Modal>}
  </section>;
}
