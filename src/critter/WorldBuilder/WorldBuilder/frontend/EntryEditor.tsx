import { SearchableSelect } from "./SearchableSelect";
import { LinkedPortrait } from "./LinkedPortrait";
import { isLocationEntry } from "./domain";
import { CampaignRecordDetails } from "./CampaignRecords";
import { MapGuide } from "./MapGuide";
import { HierarchyEditor } from "./HierarchyEditor";
import { RelationshipEditor } from "./SavedGraphs";
import { TimelineEditor, EventDetails } from "./History";
import { ResourcePicker } from "./References";
import { CollectionRulesEditor, isSmart } from "./Collections";
import React, { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  History,
  Loader2,
  LockKeyhole,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  AppContext,
  Entry,
  Asset,
  api,
  patch,
  post,
  saveBeforeNavigate,
  EMPTY_DOC,
  human,
  when,
  uid,
  kindLabels,
} from "./domain";
import {
  Badge,
  Empty,
  EntryPicker,
  ErrorBox,
  Field,
  KindIcon,
  Modal,
  Section,
  TagField,
} from "./ui";
import { RichEditor } from "./RichEditor";
import { ReaderContent } from "./ReaderContent";
import {
  MapEditor,
  CalendarEditor,
  TableEditor,
  BoardEditor,
} from "./SpecialEditors";

const editable = [
  "title",
  "summary",
  "kind",
  "template",
  "document",
  "source",
  "private_notes",
  "tags",
  "aliases",
  "data",
  "parent",
  "position",
  "visibility",
  "status",
];
const body = (r: Entry) =>
  Object.fromEntries(
    editable
      .filter((key) => (r as any)[key] !== undefined)
      .map((key) => [key, (r as any)[key]]),
  );

function Details({
  entry,
  onData,
  ctx,
}: {
  entry: Entry;
  onData: (value: Record<string, any>) => void;
  ctx: AppContext;
}) {
  const data = entry.data,
    update = (key: string, value: any) => onData({ ...data, [key]: value });
  const field = (
    label: string,
    key: string,
    type = "text",
    fallback: any = "",
  ) => (
    <Field
      key={key}
      label={label}
      value={data[key] ?? fallback}
      type={type}
      onChange={(v) => update(key, v)}
    />
  );
  const campaignPicker = (
    <EntryPicker
      label="Campaign"
      value={data.campaign_id ?? entry.parent ?? ""}
      onChange={(v) => {
        if (v !== (data.campaign_id ?? entry.parent ?? ""))
          onData({ ...data, campaign_id: v, session_id: "" });
      }}
      entries={ctx.entries.filter((r) => r.kind === "campaign")}
    />
  );
  if (entry.kind === "folder")
    return <CollectionRulesEditor data={data} onChange={onData} ctx={ctx} />;
  if (entry.kind === "relationship")
    return (
      <RelationshipEditor ctx={ctx} id={entry.id} data={data} onData={onData} />
    );
  if (entry.kind === "map")
    return (
      <MapEditor data={data} setData={onData} ctx={ctx} mapKey={entry.id} />
    );
  if (entry.kind === "calendar")
    return (
      <CalendarEditor data={data} setData={onData} ctx={ctx} id={entry.id} />
    );
  if (entry.kind === "board")
    return <BoardEditor data={data} setData={onData} ctx={ctx} />;
  if (entry.kind === "table" || entry.kind === "generator")
    return <TableEditor entry={entry} data={data} setData={onData} ctx={ctx} />;
  if (entry.kind === "timeline")
    return (
      <TimelineEditor data={data} onData={onData} ctx={ctx} id={entry.id} />
    );
  if (entry.kind === "event" || entry.kind === "era")
    return (
      <EventDetails
        data={data}
        onData={onData}
        ctx={ctx}
        era={entry.kind === "era"}
        id={entry.id}
      />
    );
  if (entry.kind === "campaign")
    return (
      <div className="field-grid">
        {field("Game system / edition", "system", "text", "Homebrew")}
        {field("Campaign status", "campaign_status", "text", "Preparing")}
        <label className="field full">
          <span>Party members</span>
          <div className="checkbox-list">
            {ctx.entries
              .filter(
                (e) => e.kind === "character" || e.template === "character",
              )
              .map((e) => (
                <label key={e.id}>
                  <input
                    type="checkbox"
                    checked={(data.party || []).includes(e.id)}
                    onChange={(ev) =>
                      update(
                        "party",
                        ev.target.checked
                          ? [...(data.party || []), e.id]
                          : (data.party || []).filter(
                              (id: string) => id !== e.id,
                            ),
                      )
                    }
                  />
                  {e.title}
                </label>
              ))}
            {!ctx.entries.some(
              (e) => e.kind === "character" || e.template === "character",
            ) && (
              <span className="muted">
                Create a character article or player character to add it to the
                party.
              </span>
            )}
          </div>
        </label>
      </div>
    );
  if (entry.kind === "session")
    return (
      <div className="field-grid">
        {campaignPicker}
        <Field
          label="Session date & time"
          type="datetime-local"
          value={data.date_local || ""}
          onChange={(v) =>
            onData({
              ...data,
              date_local: v,
              starts_at: v ? new Date(v).toISOString() : "",
            })
          }
        />
        {field("Session number", "number", "number", 1)}
        <EntryPicker
          label="Session plot"
          value={data.link_id || ""}
          onChange={(v) => update("link_id", v)}
          entries={ctx.entries.filter((e) => e.template === "plot")}
        />
      </div>
    );
  if (entry.kind === "quest" || entry.kind === "task")
    return (
      <div className="field-grid">
        {entry.kind === "quest" && campaignPicker}
        <label className="field">
          <span>Progress</span>
          <SearchableSelect
            value={data.progress || "open"}
            onChange={(e) => update("progress", e.target.value)}
          >
            <option value="open">Open</option>
            <option value="active">In progress</option>
            <option value="done">Completed</option>
            <option value="failed">Abandoned / failed</option>
          </SearchableSelect>
        </label>
        <label className="field">
          <span>Priority</span>
          <SearchableSelect
            value={data.priority || "normal"}
            onChange={(e) => update("priority", e.target.value)}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </SearchableSelect>
        </label>
        <EntryPicker
          label="Related entry"
          value={data.link_id || ""}
          onChange={(v) => update("link_id", v)}
          entries={ctx.entries.filter((e) => e.id !== entry.id)}
        />
      </div>
    );
  if (entry.kind === "variable")
    return (
      <div className="field-grid">
        {field("Displayed value", "value")}
        {field("Collection", "collection")}
        {field("Tooltip", "tooltip")}
      </div>
    );
  if (entry.kind === "template")
    return (
      <div>
        <p className="muted">
          These fields appear when this template is chosen for a new article.
        </p>
        {(data.fields || []).map((f: any, i: number) => (
          <div className="schema-row" key={f.id || i}>
            <input
              aria-label={"Field " + (i + 1) + " name"}
              value={f.name}
              onChange={(e) =>
                update(
                  "fields",
                  data.fields.map((r: any, n: number) =>
                    n === i ? { ...r, name: e.target.value } : r,
                  ),
                )
              }
            />
            <SearchableSelect
              aria-label={"Field " + (i + 1) + " type"}
              value={f.type || "text"}
              onChange={(e) =>
                update(
                  "fields",
                  data.fields.map((r: any, n: number) =>
                    n === i ? { ...r, type: e.target.value } : r,
                  ),
                )
              }
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="long">Long text</option>
            </SearchableSelect>
            <label className="check-label">
              <input
                type="checkbox"
                checked={!!f.required}
                onChange={(e) =>
                  update(
                    "fields",
                    data.fields.map((r: any, n: number) =>
                      n === i ? { ...r, required: e.target.checked } : r,
                    ),
                  )
                }
              />
              Required
            </label>
            <button
              className="icon-button"
              aria-label="Remove field"
              onClick={() =>
                update(
                  "fields",
                  data.fields.filter((_: any, n: number) => n !== i),
                )
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          className="text-button"
          onClick={() =>
            update("fields", [
              ...(data.fields || []),
              { id: uid(), name: "New field", type: "text", required: false },
            ])
          }
        >
          <Plus size={16} />
          Add field
        </button>
      </div>
    );
  if (entry.kind === "statblock")
    return (
      <>
        <div className="field-grid">
          {field("System / edition", "system", "text", "Homebrew")}
          {field("Block type", "block_type", "text", "Character")}
        </div>
        <div className="section-heading">
          <h3>Values</h3>
          <button
            className="text-button"
            onClick={() =>
              update("fields", {
                ...data.fields,
                ["field_" + (Object.keys(data.fields || {}).length + 1)]: 0,
              })
            }
          >
            <Plus size={15} />
            Add value
          </button>
        </div>
        <div className="field-grid three">
          {Object.entries(data.fields || {}).map(([key, value], i) => (
            <div className="stat-field" key={i}>
              <input
                aria-label={"Value " + (i + 1) + " name"}
                value={key}
                onChange={(e) => {
                  const fields = { ...data.fields };
                  delete fields[key];
                  fields[e.target.value] = value;
                  update("fields", fields);
                }}
              />
              <input
                aria-label={key + " value"}
                type="number"
                value={String(value)}
                onChange={(e) =>
                  update("fields", {
                    ...data.fields,
                    [key]: Number(e.target.value),
                  })
                }
              />
              <button
                className="icon-button"
                aria-label={"Remove " + key}
                onClick={() => {
                  const fields = { ...data.fields };
                  delete fields[key];
                  update("fields", fields);
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="section-heading">
          <h3>Calculated values</h3>
          <button
            className="text-button"
            onClick={() =>
              update("formulas", [
                ...(data.formulas || []),
                { name: "Modifier", expression: "0" },
              ])
            }
          >
            <Plus size={15} />
            Formula
          </button>
        </div>
        {(data.formulas || []).map((f: any, i: number) => (
          <div className="formula-row" key={i}>
            <input
              aria-label={"Formula " + (i + 1) + " name"}
              value={f.name}
              onChange={(e) =>
                update(
                  "formulas",
                  data.formulas.map((r: any, n: number) =>
                    n === i ? { ...r, name: e.target.value } : r,
                  ),
                )
              }
            />
            <input
              aria-label={"Formula " + (i + 1) + " expression"}
              value={f.expression}
              onChange={(e) =>
                update(
                  "formulas",
                  data.formulas.map((r: any, n: number) =>
                    n === i ? { ...r, expression: e.target.value } : r,
                  ),
                )
              }
            />
            <button
              className="icon-button"
              aria-label="Remove formula"
              onClick={() =>
                update(
                  "formulas",
                  data.formulas.filter((_: any, n: number) => n !== i),
                )
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <p className="muted small-copy">
          Example: floor((strength - 10) / 2). Supports arithmetic, min, max,
          floor, ceil and abs.
        </p>
        {entry.computed && (
          <div className="computed-values">
            {Object.entries(entry.computed).map(([key, value]) => (
              <div key={key}>
                <small>{key}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
      </>
    );
  if (
    entry.kind === "manuscript" ||
    entry.kind === "chapter" ||
    entry.kind === "scene"
  )
    return (
      <div className="field-grid">
        {field("Word goal", "goal", "number", 0)}
        {field("Stage / label", "label", "text", "First draft")}
        {entry.kind === "scene" && (
          <EntryPicker
            label="Viewpoint character"
            value={data.link_id || ""}
            onChange={(v) => update("link_id", v)}
            entries={ctx.entries.filter(
              (e) => e.template === "character" || e.kind === "character",
            )}
          />
        )}
      </div>
    );
  if (entry.kind === "tree")
    return (
      <HierarchyEditor ctx={ctx} id={entry.id} data={data} onData={onData} />
    );
  const custom = ctx.entries.find((r) => "custom:" + r.id === entry.template);
  const fields = custom
    ? (custom.data.fields || []).map((f: any) => ({
        name: f.name,
        type: f.type,
      }))
    : ctx.templates
        .find((t) => t.id === entry.template)
        ?.fields.map((name) => ({ name, type: "text" })) || [];
  return fields.length ? (
    <div className="field-grid">
      {fields.map((f: any) => (
        <label
          className={"field " + (f.type === "long" ? "full" : "")}
          key={f.name}
        >
          <span>{f.name}</span>
          {f.type === "long" ? (
            <textarea
              value={data.fields?.[f.name] || ""}
              onChange={(e) =>
                update("fields", { ...data.fields, [f.name]: e.target.value })
              }
            />
          ) : (
            <input
              type={f.type === "number" ? "number" : "text"}
              value={data.fields?.[f.name] ?? ""}
              onChange={(e) =>
                update("fields", {
                  ...data.fields,
                  [f.name]:
                    f.type === "number"
                      ? Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          )}
        </label>
      ))}
    </div>
  ) : null;
}

export function EntryEditor({ id, ctx }: { id: string; ctx: AppContext }) {
  const [draft, setDraft] = useState<Entry | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Saved"),
    [conflict, setConflict] = useState(false),
    [picker, setPicker] = useState<{
      kind: string;
      insert: (id: string, label: string) => void;
    } | null>(null),
    [history, setHistory] = useState<any[] | null>(null),
    [revisionPreview, setRevisionPreview] = useState<any>(null),
    [preview, setPreview] = useState<Entry | null>(null),
    [showPrivate, setShowPrivate] = useState(false),
    [focus, setFocus] = useState(false),
    [mapGuide, setMapGuide] = useState(false),
    [reading, setReading] = useState(false),
    [linkedHtml, setLinkedHtml] = useState("");
  const current = useRef<Entry | null>(null),
    dirty = useRef(false),
    generation = useRef(0),
    inflight = useRef<Promise<boolean> | null>(null),
    mounted = useRef(true),
    ctxRef = useRef(ctx),
    paused = useRef(false);
  const readingEntryId = useRef(id);
  readingEntryId.current = id;
  ctxRef.current = ctx;
  useEffect(() => {
    setReading(false);
    setLinkedHtml("");
    setMapGuide(false);
  }, [id]);
  const cache = "worldbuilder.draft:" + id;
  const remember = (value: Entry) => {
    try {
      localStorage.setItem(cache, JSON.stringify(value));
    } catch {
      setStatus("Local recovery storage is full. Save before leaving.");
    }
  };
  const load = useCallback(
    async (recover = true) => {
      setLoading(true);
      setError("");
      try {
        const value = await api<Entry>("/resources/" + id);
        if (!mounted.current) return;
        let restored = value;
        const saved = localStorage.getItem(cache);
        if (recover && saved) {
          try {
            const local = JSON.parse(saved);
            if (
              local.id === id &&
              local.world_id === value.world_id &&
              JSON.stringify(body(local)) !== JSON.stringify(body(value))
            ) {
              restored = local;
              dirty.current = true;
              setStatus("Recovered unsaved edits");
              if (local.revision !== value.revision) {
                setConflict(true);
                paused.current = true;
                setError(
                  "Recovered edits are based on an older saved version. Copy them to a new entry, or reload the current saved version.",
                );
              }
            }
          } catch {
            localStorage.removeItem(cache);
          }
        }
        current.current = restored;
        setDraft(restored);
        if (restored === value) {
          dirty.current = false;
          setStatus("Saved");
          setConflict(false);
          paused.current = false;
        }
      } catch (e: any) {
        if (mounted.current) setError(e.message);
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [id],
  );
  const flush = useCallback(async (): Promise<boolean> => {
    if (inflight.current)
      return inflight.current.then((ok) =>
        ok && dirty.current ? flush() : ok,
      );
    if (!dirty.current) return true;
    if (paused.current) return false;
    const value = current.current;
    if (!value || !value.title.trim()) {
      setError("Give this entry a title before saving.");
      return false;
    }
    const version = generation.current;
    setStatus("Saving…");
    const promise = (async () => {
      try {
        const saved = await patch<Entry>("/resources/" + id, {
          ...body(value),
          expected_revision: value.revision,
        });
        if (!mounted.current) return true;
        const clean = generation.current === version;
        const next = clean
          ? saved
          : {
              ...current.current!,
              revision: saved.revision,
              published_revision: saved.published_revision,
            };
        current.current = next;
        setDraft(next);
        dirty.current = !clean;
        if (clean) {
          localStorage.removeItem(cache);
          setStatus("Saved to this computer");
        } else {
          remember(next);
          setStatus("Unsaved changes");
        }
        setError("");
        // The entry is already saved at this point. A failed sidebar refresh
        // must not be reported as a failed save or trigger a duplicate retry.
        try {
          await ctxRef.current.refresh();
        } catch {
          if (mounted.current)
            setStatus("Saved; refresh the workspace to update its lists");
        }
        return true;
      } catch (e: any) {
        if (mounted.current) {
          setError(e.message);
          setStatus("Changes need attention");
          if (e.status === 409) {
            paused.current = true;
            setConflict(true);
          }
        }
        return false;
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = promise;
    return promise;
  }, [id]);
  useEffect(() => {
    mounted.current = true;
    load();
    saveBeforeNavigate.current = flush;
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    const saveKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flush().then((ok) => {
          if (ok) ctxRef.current.notify("Entry saved.");
        });
      }
    };
    window.addEventListener("keydown", saveKey);
    return () => {
      mounted.current = false;
      if (saveBeforeNavigate.current === flush)
        saveBeforeNavigate.current = null;
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("keydown", saveKey);
    };
  }, [id]);
  useEffect(() => {
    if (!draft || !dirty.current || paused.current) return;
    const timer = setTimeout(() => flush(), 1000);
    return () => clearTimeout(timer);
  }, [draft, flush]);
  function change(patch: Partial<Entry>) {
    if (!current.current) return;
    const next = { ...current.current, ...patch };
    current.current = next;
    generation.current++;
    dirty.current = true;
    setDraft(next);
    remember(next);
    setStatus("Unsaved changes");
  }
  if (loading)
    return (
      <div className="page-loading">
        <Loader2 className="spin" />
        Opening entry…
      </div>
    );
  if (!draft)
    return (
      <div className="page">
        <ErrorBox message={error || "This entry could not be opened."} />
        <button className="button secondary" onClick={() => ctx.go("library")}>
          Back to library
        </button>
      </div>
    );
  const wide = ["map", "board", "table", "generator", "calendar"].includes(
    draft.kind,
  );
  const deleteEntry = async () => {
    if (!(await flush())) return;
    if (
      !confirm(
        "Move “" +
          current.current!.title +
          "” to Trash? You can restore it in Settings.",
      )
    )
      return;
    try {
      await api("/resources/" + id, {
        method: "DELETE",
        body: JSON.stringify({ expected_revision: current.current!.revision }),
      });
      localStorage.removeItem(cache);
      dirty.current = false;
      await ctx.refresh();
      ctx.go("library");
      ctx.notify("Entry moved to Trash.");
    } catch (e: any) {
      ctx.notify(e.message, true);
    }
  };
  const publishEntry = async () => {
    if (!(await flush())) return;
    try {
      const saved = await post<Entry>("/resources/" + id + "/publish", {
        expected_revision: current.current!.revision,
      });
      current.current = saved;
      setDraft(saved);
      ctx.notify("Reader version saved. This workspace remains on your PC.");
      await ctx.refresh();
    } catch (e: any) {
      ctx.notify(e.message, true);
    }
  };
  return (
    <div
      className={
        "entry-page " +
        (wide ? "wide-entry " : "") +
        (focus ? "focus-mode" : "")
      }
    >
      <div className="entry-topline">
        <button className="text-button" onClick={() => ctx.go("library")}>
          <ArrowLeft size={16} />
          Library
        </button>
        <span className="breadcrumb">
          <ChevronRight size={13} />
          {kindLabels[draft.kind] || human(draft.kind)}
        </span>
        <div className="entry-actions">
          {draft.data.planning_type && (
            <button
              className="button secondary small"
              onClick={async () => {
                if (await flush())
                  ctx.go(
                    `campaign-flow/${draft.data.campaign_id}/planner/all/${id}`,
                  );
              }}
            >
              Open campaign planning
            </button>
          )}
          {(draft.kind === "character" || draft.template === "character") && (
            <button
              className="button secondary small"
              onClick={async () => {
                if (await flush()) ctx.go("characters/" + id);
              }}
            >
              Open character dossier
            </button>
          )}
          {isLocationEntry(draft) && (
            <button
              className="button secondary small"
              onClick={async () => {
                if (await flush()) ctx.go("locations/" + id);
              }}
            >
              Open location guide
            </button>
          )}
          {["quest", "task"].includes(draft.kind) && (
            <button
              className="button secondary small"
              onClick={async () => {
                if (await flush()) ctx.go("threads/" + id);
              }}
            >
              Open thread guide
            </button>
          )}
          {draft.kind === "session" && (
            <button
              className="button secondary small"
              onClick={async () => {
                if (await flush()) ctx.go("sessions/" + id);
              }}
            >
              Open session guide
            </button>
          )}
          {draft.kind === "map" && (
            <button
              className="button secondary small"
              onClick={async () => {
                if (await flush()) setMapGuide(true);
              }}
            >
              Explore map guide
            </button>
          )}
          <span
            className={"save-state " + (error ? "error" : "")}
            role="status"
          >
            {status.startsWith("Saving") ? (
              <Loader2 size={13} className="spin" />
            ) : (
              <Check size={13} />
            )}
            <span>{status}</span>
          </span>
          <button
            className="icon-button"
            aria-label="Revision history"
            title="Revision history"
            onClick={async () => {
              try {
                setHistory(
                  (await api("/resources/" + id + "/revisions")).revisions,
                );
              } catch (e: any) {
                ctx.notify(e.message, true);
              }
            }}
          >
            <History size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Focus mode"
            title="Focus mode"
            onClick={() => setFocus(!focus)}
          >
            <Eye size={18} />
          </button>
          <button
            className="button secondary small"
            onClick={async () => {
              try {
                setPreview(
                  await api<Entry>("/resources/" + id + "?audience=reader"),
                );
              } catch {
                ctx.notify(
                  "Save a reader version first. Private entries stay excluded from reader preview.",
                  true,
                );
              }
            }}
          >
            Reader preview
          </button>
          <button
            className="button primary small"
            onClick={() =>
              flush().then((ok) => ok && ctx.notify("Entry saved."))
            }
          >
            <Save size={15} />
            Save
          </button>
        </div>
      </div>
      {error && (
        <div className="entry-error">
          <ErrorBox message={error} />
          {conflict && (
            <div className="button-row">
              <button
                className="button secondary small"
                onClick={() => {
                  if (
                    confirm(
                      "Discard the recovered local edits and load the saved version?",
                    )
                  ) {
                    localStorage.removeItem(cache);
                    dirty.current = false;
                    load(false);
                  }
                }}
              >
                Reload saved version
              </button>
              <button
                className="button primary small"
                onClick={async () => {
                  try {
                    const copy = await post<Entry>(
                      "/worlds/" + ctx.world.id + "/resources",
                      {
                        ...body(draft),
                        title: (draft.title + " (recovered copy)").slice(
                          0,
                          180,
                        ),
                      },
                    );
                    dirty.current = false;
                    localStorage.removeItem(cache);
                    await ctx.refresh();
                    ctx.go("entry/" + copy.id);
                  } catch (e: any) {
                    ctx.notify(e.message, true);
                  }
                }}
              >
                <Copy size={15} />
                Keep edits as a new entry
              </button>
            </div>
          )}
        </div>
      )}
      <div className="entry-layout">
        <main className="entry-main">
          <div className="entry-title-row">
            <div className={"entry-type-icon type-" + draft.template}>
              <KindIcon
                kind={
                  draft.kind === "article" && draft.template === "character"
                    ? "character"
                    : draft.kind
                }
                size={25}
              />
            </div>
            <div>
              <span className="eyebrow">
                {draft.kind === "article"
                  ? human(draft.template)
                  : kindLabels[draft.kind]}
              </span>
              <input
                className="entry-title"
                aria-label="Entry title"
                value={draft.title}
                maxLength={180}
                onChange={(e) => change({ title: e.target.value })}
              />
            </div>
          </div>
          <textarea
            className="entry-summary"
            aria-label="Short description"
            placeholder="A short description, a first impression, a reason to remember…"
            value={draft.summary}
            onChange={(e) => change({ summary: e.target.value })}
          />
          <div className="special-details">
            <Details
              entry={draft}
              ctx={ctx}
              onData={(data) => change({ data })}
            />
            {["campaign", "session", "note", "task", "quest"].includes(
              draft.kind,
            ) && (
              <CampaignRecordDetails
                entry={draft}
                data={draft.data}
                ctx={ctx}
                onData={(data) => change({ data })}
              />
            )}
          </div>
          <div className="tabs compact note-reading-tabs">
            <button
              className={!reading ? "active" : ""}
              onClick={() => setReading(false)}
            >
              Write notes
            </button>
            <button
              className={reading ? "active" : ""}
              onClick={async () => {
                if (await flush()) {
                  try {
                    const saved = await api<Entry>("/resources/" + id);
                    if (mounted.current && readingEntryId.current === id) {
                      setLinkedHtml(saved.html || "");
                      setReading(true);
                    }
                  } catch (e: any) {
                    ctx.notify(e.message, true);
                  }
                }
              }}
            >
              Read linked notes
            </button>
          </div>
          {reading ? (
            <div
              className="reader-prose linked-reading-view"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(linkedHtml),
              }}
            />
          ) : (
            <RichEditor
              value={draft.document || EMPTY_DOC}
              onChange={(document) => change({ document })}
              onReference={(insert) => setPicker({ kind: "entry", insert })}
              onImage={(insert) => setPicker({ kind: "image", insert })}
              onVariable={(insert) => setPicker({ kind: "variable", insert })}
            />
          )}
          <div className="entry-bottom">
            <span>
              {draft.word_count || 0} words · Revision {draft.revision}
            </span>
            <button
              className="text-button"
              onClick={() => setShowPrivate(!showPrivate)}
            >
              <LockKeyhole size={14} />
              {showPrivate ? "Hide GM notes" : "GM notes"}
            </button>
          </div>
          {showPrivate && (
            <label className="field gm-notes">
              <span>
                <LockKeyhole size={14} />
                Private GM notes
              </span>
              <textarea
                placeholder="Motives, secrets, future reveals. These notes never enter reader preview."
                value={draft.private_notes || ""}
                onChange={(e) => change({ private_notes: e.target.value })}
              />
            </label>
          )}
        </main>
        <aside className="entry-properties">
          <LinkedPortrait
            value={draft.data.cover_url || ""}
            onSave={async (url) => {
              change({
                data: { ...draft.data, cover_asset: "", cover_url: url },
              });
            }}
          />
          <div className="properties-heading">
            <h3>Entry details</h3>
            <Badge tone="green">Local</Badge>
          </div>
          <label className="field">
            <span>Visibility</span>
            <SearchableSelect
              value={draft.visibility}
              onChange={(e) =>
                change({ visibility: e.target.value as Entry["visibility"] })
              }
            >
              <option value="private">Private · just you</option>
              <option value="public">Include in reader view</option>
            </SearchableSelect>
          </label>
          <label className="field">
            <span>Writing status</span>
            <SearchableSelect
              value={draft.status}
              onChange={(e) => change({ status: e.target.value })}
            >
              <option value="draft">Draft</option>
              <option value="wip">In progress</option>
              <option value="done">Complete</option>
            </SearchableSelect>
          </label>
          <EntryPicker
            label="Collection / parent"
            value={draft.parent || ""}
            onChange={(parent) => change({ parent: parent || null })}
            entries={ctx.entries.filter(
              (r) =>
                r.id !== id &&
                !isSmart(r) &&
                ["folder", "manuscript", "chapter", "campaign"].includes(
                  r.kind,
                ),
            )}
            empty="Unfiled"
          />
          <TagField
            label="Tags"
            value={draft.tags}
            onChange={(tags) => change({ tags })}
            placeholder="forest, important, chapter-one"
          />
          <TagField
            label="Aliases"
            value={draft.aliases}
            onChange={(aliases) => change({ aliases })}
            placeholder="Names, titles, alternate spellings"
          />
          <div className="properties-divider" />
          <h3>Reader version</h3>
          <p className="muted small-copy">
            {draft.published_revision
              ? "Revision " +
                draft.published_revision +
                " is saved for reader preview. Later edits remain drafts."
              : "Choose reader visibility and save a version to preview what readers would see."}
          </p>
          <button
            className="button secondary full-button"
            disabled={draft.visibility !== "public"}
            onClick={publishEntry}
          >
            Save reader version
          </button>
          <div className="properties-divider" />
          <h3>Linked from</h3>
          {draft.backlinks?.length ? (
            draft.backlinks.map((r) => (
              <button
                className="backlink"
                key={r.id}
                onClick={() => ctx.go("entry/" + r.id)}
              >
                <KindIcon kind={r.kind} size={14} />
                {r.title}
                <ChevronRight size={13} />
              </button>
            ))
          ) : (
            <p className="muted small-copy">
              References to this entry will appear here.
            </p>
          )}
          <div className="properties-divider" />
          <p className="muted small-copy">
            Last edited {when(draft.updated_at)}
          </p>
          {draft.data.provenance && (
            <p className="provenance">
              Imported from {draft.data.provenance.path}
            </p>
          )}
          <button className="text-button danger" onClick={deleteEntry}>
            <Trash2 size={14} />
            Move to Trash
          </button>
        </aside>
      </div>
      {mapGuide && (
        <Modal
          title="Map & location guide"
          wide
          onClose={() => setMapGuide(false)}
        >
          <MapGuide ctx={ctx} mapId={id} />
        </Modal>
      )}
      {picker && (
        <ResourcePicker
          ctx={ctx}
          mode={picker.kind}
          currentId={id}
          insert={picker.insert}
          close={() => setPicker(null)}
        />
      )}
      {history && (
        <Modal title="Revision history" onClose={() => setHistory(null)}>
          {draft.data.continuity_type === "item" && (
            <p className="notice">
              Restoring an item revision restores its notes and details while
              keeping current quantities. Use a transfer or stock adjustment to
              change quantities with movement history.
            </p>
          )}
          <p className="muted">
            Restoring creates a new revision and keeps the current saved version
            in history.
          </p>
          <div className="revision-list">
            {history.map((r) => (
              <div key={r.number}>
                <Clock3 size={17} />
                <div>
                  <strong>
                    Revision {r.number} · {r.title}
                  </strong>
                  <small>
                    {when(r.created_at)} · {r.word_count} words
                  </small>
                </div>
                <button
                  className="button secondary small"
                  disabled={r.number === draft.revision}
                  onClick={async () => {
                    if (!(await flush())) return;
                    if (!confirm("Restore revision " + r.number + "?")) return;
                    try {
                      await post("/resources/" + id + "/restore", {
                        number: r.number,
                        expected_revision: current.current!.revision,
                      });
                      dirty.current = false;
                      localStorage.removeItem(cache);
                      await load(false);
                      await ctx.refresh();
                      setHistory(null);
                      ctx.notify("Revision restored.");
                    } catch (e: any) {
                      ctx.notify(e.message, true);
                    }
                  }}
                >
                  Restore
                </button>
                <button
                  className="button secondary small"
                  onClick={async () => {
                    try {
                      setRevisionPreview(
                        await api(`/resources/${id}/revisions/${r.number}`),
                      );
                    } catch (e: any) {
                      ctx.notify(e.message, true);
                    }
                  }}
                >
                  Preview & compare
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {revisionPreview && (
        <Modal
          title={`Revision ${revisionPreview.number} — preview & compare`}
          wide
          onClose={() => setRevisionPreview(null)}
        >
          <p className="muted">
            Compared with the current saved entry. Previewing does not change
            your draft.
          </p>
          <h3>{revisionPreview.snapshot.title}</h3>
          <p>{when(revisionPreview.created_at)}</p>
          <p>
            Changed fields:{" "}
            {revisionPreview.changed_fields.map(human).join(", ") || "None"}
          </p>
          <div className="field-grid">
            <section>
              <h3>This revision</h3>
              <pre className="revision-prose">
                {revisionPreview.text || "(Empty note)"}
              </pre>
            </section>
            <section>
              <h3>Current saved text</h3>
              <pre className="revision-prose">
                {revisionPreview.current_text || "(Empty note)"}
              </pre>
            </section>
          </div>
          <details>
            <summary>Saved details, tags and private notes</summary>
            <pre className="revision-prose">
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(revisionPreview.snapshot).filter(
                    ([key]) => key !== "document",
                  ),
                ),
                null,
                2,
              )}
            </pre>
          </details>
          <button
            className="button secondary"
            onClick={() => setRevisionPreview(null)}
          >
            Back to history
          </button>
        </Modal>
      )}
      {preview && (
        <Modal
          title="Reader preview · saved version"
          wide
          onClose={() => setPreview(null)}
        >
          <div className="notice">
            This preview stays on your PC. It shows the saved reader version,
            with GM-only sections removed.
          </div>
          <article className="reader-article">
            <Badge>{human(preview.template)}</Badge>
            <h1>{preview.title}</h1>
            <p className="reader-summary">{preview.summary}</p>
            <ReaderContent entry={preview} ctx={ctx} reader />
          </article>
        </Modal>
      )}
    </div>
  );
}
