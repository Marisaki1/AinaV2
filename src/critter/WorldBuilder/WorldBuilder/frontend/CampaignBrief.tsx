import React, { useEffect, useState } from "react";
import { AppContext, Entry, api, text } from "./domain";
import { EntryPicker, ErrorBox, Modal } from "./ui";
import { ArrowUpRight, BookOpen, Flag, MapPin, Settings2, Users } from "lucide-react";

export type Briefing = { overview?: string; current?: string; leads?: string; reference?: string; cast?: string[] };
const sections = [
  ["current", "Current situation", Flag],
  ["leads", "Open leads", MapPin],
  ["reference", "Day & reference", BookOpen],
] as const;
function excerpt(entry: Entry) {
  const paragraphs = (entry.document?.content || []).filter(node => node.type === "paragraph").map(node => text(node).trim()).filter(Boolean);
  const value = entry.summary || paragraphs[0] || "Open this entry to read its notes.";
  return value.length > 330 ? value.slice(0, 327).replace(/\s+\S*$/, "") + "…" : value;
}

export function CampaignBrief({ ctx, value, save, reload }: { ctx: AppContext; value: Briefing; save: (briefing: Briefing) => Promise<void>; reload: () => Promise<unknown> }) {
  const [draft, setDraft] = useState<Briefing | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, Entry>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const entries = new Map(ctx.entries.map(e => [e.id, e]));
  const find = (id?: string) => id ? loaded[id] || entries.get(id) : undefined;
  const selected = [...new Set([value.current, value.leads, value.reference].filter((id): id is string => !!id && entries.has(id)))];
  const requestKey = selected.map(id => id + ":" + entries.get(id)!.revision).join("|");
  useEffect(() => {
    let alive = true; setLoaded({}); setFailed([]);
    Promise.allSettled(selected.map(id => api<Entry>(`/resources/${id}`))).then(results => {
      if (!alive) return;
      const records: Record<string, Entry> = {}, missing: string[] = [];
      results.forEach((result, index) => { if (result.status === "fulfilled") records[selected[index]] = result.value; else missing.push(selected[index]); });
      setLoaded(records); setFailed(missing);
    });
    return () => { alive = false; };
  }, [ctx.world.id, requestKey, retry]);
  const configured = Object.values(value).some(v => Array.isArray(v) ? v.length : v);
  const overview = find(value.overview);
  const cards = sections.filter(([key]) => value[key]);
  const open = () => { setDraft(structuredClone(value)); setError(""); };
  return <section className={"campaign-brief" + (!configured ? " campaign-brief-empty" : "")} aria-label="Campaign briefing">
    <header className="campaign-brief-header"><div><span className="eyebrow">AT THE TABLE</span><h2>Campaign briefing</h2></div><div className="button-row">{overview && <button className="button secondary small" onClick={() => ctx.go("entry/" + overview.id)}>Campaign overview <ArrowUpRight size={14} /></button>}<button className="button secondary small" onClick={open}><Settings2 size={14} />{configured ? "Edit briefing" : "Set up briefing"}</button></div></header>
    {!configured ? <p className="muted">Keep your current situation, unresolved leads, reference notes and cast together.</p> : <>
      {!!cards.length && <div className="campaign-brief-grid">{cards.map(([key, label, Icon]) => {
        const entry = find(value[key]);
        return <article className={"campaign-brief-card campaign-brief-" + key} key={key}><span className="campaign-brief-label"><Icon size={15} />{label}</span>{entry ? <><h3>{entry.title}</h3><p>{loaded[entry.id] ? excerpt(entry) : failed.includes(entry.id) ? "Preview unavailable. Your saved note is unchanged." : "Loading notes…"}</p>{failed.includes(entry.id) && <button className="text-button" onClick={() => setRetry(n => n + 1)}>Retry preview</button>}<button className="text-button" onClick={() => ctx.go("entry/" + entry.id)}>Open notes <ArrowUpRight size={14} /></button></> : <><h3>Entry unavailable</h3><p>This reference may be in Trash. Choose another entry or restore it.</p></>}</article>;
      })}</div>}
      {!!value.cast?.length && <div className="campaign-brief-cast"><span><Users size={15} /> In focus</span><div>{value.cast.map(id => { const entry = find(id); return entry ? <button key={id} onClick={() => ctx.go("entry/" + id)}>{entry.title}<ArrowUpRight size={12} /></button> : <span className="muted" key={id}>Unavailable entry</span>; })}</div></div>}
    </>}
    {draft && <Modal title="Configure campaign briefing" wide onClose={() => { if (!busy) setDraft(null); }}>
      {error && <ErrorBox message={error} />}
      <fieldset disabled={busy}><legend className="sr-only">Briefing references</legend>
        {[["overview", "Campaign overview"], ...sections.map(([key, label]) => [key, label])].map(([key, label]) => <EntryPicker key={key} label={label} value={(draft as any)[key] || ""} onChange={id => setDraft({ ...draft, [key]: id })} entries={ctx.entries.filter(e => e.kind !== "folder" && !e.data.raw_transcript)} empty="Not selected" />)}
        <EntryPicker label="Add a cast entry" value="" onChange={id => { if (id) setDraft({ ...draft, cast: [...(draft.cast || []), id] }); }} entries={ctx.entries.filter(e => !draft.cast?.includes(e.id) && (e.kind === "character" || e.template === "character" || e.template === "organization"))} empty="Choose a character or group" />
        <div className="briefing-cast-config">{draft.cast?.map((id, index) => <div key={id}><span>{find(id)?.title || "Unavailable entry"}</span><button className="text-button" disabled={index === 0} aria-label={"Move " + (find(id)?.title || "entry") + " earlier"} onClick={() => { const cast = [...draft.cast!]; [cast[index - 1], cast[index]] = [cast[index], cast[index - 1]]; setDraft({ ...draft, cast }); }}>↑</button><button className="text-button" onClick={() => setDraft({ ...draft, cast: draft.cast!.filter(v => v !== id) })}>Remove</button></div>)}</div>
        {(draft.cast?.length || 0) > 12 && <p role="alert">Keep at most 12 entries in focus.</p>}
      </fieldset>
      <div className="modal-actions">{error && <button className="text-button" disabled={busy} onClick={() => void reload()}>Reload overview settings</button>}<button className="button secondary" disabled={busy} onClick={() => setDraft(null)}>Cancel</button><button className="button primary" disabled={busy || (draft.cast?.length || 0) > 12} onClick={async () => { setBusy(true); setError(""); try { await save(draft); setDraft(null); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }}>{busy ? "Saving…" : "Save briefing"}</button></div>
    </Modal>}
  </section>;
}
