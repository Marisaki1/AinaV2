import React, { useEffect, useRef, useState } from "react";
import { AppContext, Entry, api, patch, post, when } from "./domain";
import { EntryPicker, ErrorBox, Modal } from "./ui";
import { CaptureForm } from "./NotebookForms";
import { Briefing, CampaignBrief } from "./CampaignBrief";

type Widget = { id: string; visible: boolean; wide: boolean; limit: number };
type Layout = { revision: number; widgets: Widget[]; pins: string[]; briefing?: Briefing };
const titles: Record<string, string> = {
  pinned: "Pinned entries",
  notes: "Recent notes",
  tasks: "Tasks",
  recent: "Recently edited",
  favorites: "Favorite notes",
  activity: "Recent activity",
  stats: "World at a glance",
  actions: "Quick actions",
};

export function Overview({ ctx }: { ctx: AppContext }) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [editing, setEditing] = useState<Layout | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [capture, setCapture] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [query, setQuery] = useState("");
  const locked = useRef(false);
  const load = async () => {
    try {
      const value = await api<Layout>(`/worlds/${ctx.world.id}/overview`);
      setLayout(value);
      setError("");
      return value;
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  };
  useEffect(() => {
    let alive = true;
    api<Layout>(`/worlds/${ctx.world.id}/overview`)
      .then((value) => {
        if (alive) setLayout(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [ctx.world.id]);
  const save = async () => {
    if (!editing || locked.current) return;
    locked.current = true;
    setSaving(true);
    setError("");
    try {
      const value = await post<Layout>(`/worlds/${ctx.world.id}/overview`, {
        ...editing,
        expected_revision: editing.revision,
      });
      setLayout(value);
      setEditing(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };
  const move = (index: number, delta: number) => {
    if (!editing) return;
    const widgets = [...editing.widgets],
      next = index + delta;
    if (next < 0 || next >= widgets.length) return;
    [widgets[index], widgets[next]] = [widgets[next], widgets[index]];
    setEditing({ ...editing, widgets });
  };
  const change = (index: number, value: Partial<Widget>) => {
    if (editing)
      setEditing({
        ...editing,
        widgets: editing.widgets.map((w, i) =>
          i === index ? { ...w, ...value } : w,
        ),
      });
  };
  const toggleTask = async (entry: Entry) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(entry.id);
    setError("");
    try {
      await patch(`/resources/${entry.id}`, {
        expected_revision: entry.revision,
        data: {
          ...entry.data,
          progress: entry.data.progress === "done" ? "open" : "done",
        },
      });
      await ctx.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      locked.current = false;
      setBusy("");
    }
  };
  const recent = ctx.entries.filter(e => e.kind !== "folder" && !e.data.raw_transcript).sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
  const taskMatch = (e: Entry) =>
    (showCompleted || !["done", "failed"].includes(e.data.progress)) &&
    `${e.title} ${e.summary} ${e.tags.join(" ")}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase());
  const rows = (entries: Entry[], limit: number) =>
    entries.length ? (
      <div className="overview-entry-list">
        {entries.slice(0, limit).map((entry) => (
          <button
            key={entry.id}
            className="overview-entry"
            onClick={() => ctx.go("entry/" + entry.id)}
          >
            <strong>{entry.title}</strong>
            {entry.summary && <span>{entry.summary}</span>}
            <small>{when(entry.updated_at)}</small>
          </button>
        ))}
      </div>
    ) : (
      <p className="muted">No entries here yet.</p>
    );
  const widget = (w: Widget) => {
    if (w.id === "pinned")
      return (
        <>
          {layout!.pins.length ? (
            <div className="overview-entry-list">
              {layout!.pins.slice(0, w.limit).map((id) => {
                const entry = ctx.entries.find((e) => e.id === id);
                return entry ? (
                  <button
                    key={id}
                    className="overview-entry"
                    onClick={() => ctx.go("entry/" + id)}
                  >
                    <strong>{entry.title}</strong>
                    <span>{entry.summary}</span>
                  </button>
                ) : (
                  <p key={id} className="muted">
                    Pinned entry unavailable. Restore it from Trash or remove
                    its pin in Customize overview.
                  </p>
                );
              })}
            </div>
          ) : (
            <p className="muted">
              Pin your session, map, characters, or working notes using
              Customize overview.
            </p>
          )}
        </>
      );
    if (w.id === "notes")
      return rows(
        recent.filter((e) => e.kind === "note"),
        w.limit,
      );
    if (w.id === "favorites")
      return rows(
        recent.filter((e) => e.data.note_starred),
        w.limit,
      );
    if (w.id === "recent") return rows(recent, w.limit);
    if (w.id === "tasks") {
      const tasks = recent.filter((e) => e.kind === "task").filter(taskMatch);
      return (
        <>
          <div className="overview-task-tools">
            <input
              aria-label="Filter overview tasks"
              placeholder="Find a task"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
              />{" "}
              Include completed
            </label>
          </div>
          <div className="overview-entry-list">
            {tasks.slice(0, w.limit).map((entry) => (
              <div key={entry.id} className="overview-task">
                <input
                  type="checkbox"
                  aria-label={"Complete task " + entry.title}
                  checked={entry.data.progress === "done"}
                  disabled={!!busy}
                  onChange={() => void toggleTask(entry)}
                />
                <button
                  className="overview-entry"
                  onClick={() => ctx.go("entry/" + entry.id)}
                >
                  <strong>{entry.title}</strong>
                  <small>
                    {entry.data.progress || "open"}
                    {entry.data.priority ? " · " + entry.data.priority : ""}
                  </small>
                </button>
              </div>
            ))}
          </div>
          {!tasks.length && <p className="muted">No matching tasks.</p>}
          <button className="text-button" onClick={() => ctx.create("task")}>
            New task
          </button>
        </>
      );
    }
    if (w.id === "activity")
      return ctx.world.activities?.length ? (
        <div className="overview-entry-list">
          {ctx.world.activities.slice(0, w.limit).map((a) => (
            <div key={a.id} className="overview-entry">
              <strong>{a.title}</strong>
              <small>
                {a.kind} · {when(a.created_at)}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No activity yet.</p>
      );
    if (w.id === "stats")
      return (
        <div className="overview-stats">
          {[
            ["Entries", ctx.entries.length, "library"],
            [
              "Notes",
              ctx.entries.filter((e) => e.kind === "note").length,
              "notebooks",
            ],
            [
              "Maps",
              ctx.entries.filter((e) => e.kind === "map").length,
              "maps",
            ],
            ["Connections", ctx.edges.length, "relationships"],
          ].map(([label, count, route]) => (
            <button
              key={label}
              className="button secondary"
              onClick={() => ctx.go(String(route))}
            >
              <strong>{count}</strong> {label}
            </button>
          ))}
        </div>
      );
    return (
      <div className="button-row">
        <button className="button primary" onClick={() => setCapture(true)}>
          Quick note
        </button>
        <button
          className="button secondary"
          onClick={() => ctx.create("article")}
        >
          New entry
        </button>
        <button className="button secondary" onClick={() => ctx.create("task")}>
          New task
        </button>
        <button
          className="button secondary"
          onClick={() => ctx.go("notebooks")}
        >
          Notebooks
        </button>
        <button
          className="button secondary"
          onClick={() => ctx.go("campaigns")}
        >
          Campaigns
        </button>
        <button className="button secondary" onClick={() => ctx.go("settings")}>
          Settings & backups
        </button>
      </div>
    );
  };
  return (
    <div className="page overview-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h1>{ctx.world.name}</h1>
          {ctx.world.tagline && <p>{ctx.world.tagline}</p>}
        </div>
        <button
          className="button secondary"
          disabled={!layout}
          onClick={() => {
            setError("");
            setEditing(structuredClone(layout));
          }}
        >
          Customize overview
        </button>
      </div>
      {!editing && error && <ErrorBox message={error} />}
      {layout && <CampaignBrief ctx={ctx} value={layout.briefing || {}} reload={load} save={async briefing => {
        const value = await post<Layout>(`/worlds/${ctx.world.id}/overview`, { ...layout, briefing, expected_revision: layout.revision });
        setLayout(value);
      }} />}
      {!layout ? (
        <div role="status">
          {error ? (
            <button className="button secondary" onClick={() => void load()}>
              Retry loading overview
            </button>
          ) : (
            "Loading overview…"
          )}
        </div>
      ) : (
        <div className="overview-grid">
          {layout.widgets
            .filter((w) => w.visible)
            .map((w) => (
              <section
                key={w.id}
                data-overview-widget={w.id}
                className={
                  "overview-widget panel" + (w.wide ? " overview-wide" : "")
                }
              >
                <h2>{titles[w.id]}</h2>
                {widget(w)}
              </section>
            ))}
        </div>
      )}
      {capture && (
        <CaptureForm
          ctx={ctx}
          sectionId=""
          templates={ctx.entries.filter(
            (e) => e.data.notebook_type === "template",
          )}
          onClose={() => setCapture(false)}
          onSave={(value) => post(`/worlds/${ctx.world.id}/notebooks`, value)}
          onCreated={() => {
            setCapture(false);
            void ctx.refresh().catch((e) => setError(e.message));
          }}
        />
      )}
      {editing && (
        <Modal
          title="Customize overview"
          wide
          onClose={() => {
            if (!saving) {
              setEditing(null);
              setError("");
            }
          }}
        >
          {error && <ErrorBox message={error} />}
          <fieldset disabled={saving}>
            <legend className="sr-only">Overview sections and pins</legend>
            <div className="overview-config-head">
              <span>Section</span>
              <span>Full width</span>
              <span>Entry limit</span>
              <span>Order</span>
            </div>
            {editing.widgets.map((w, i) => (
              <div key={w.id} className="overview-config-row">
                <label>
                  <input
                    type="checkbox"
                    aria-label={"Show " + titles[w.id]}
                    checked={w.visible}
                    onChange={(e) => change(i, { visible: e.target.checked })}
                  />
                  {titles[w.id]}
                </label>
                <input
                  type="checkbox"
                  aria-label={"Full width " + titles[w.id]}
                  checked={w.wide}
                  onChange={(e) => change(i, { wide: e.target.checked })}
                />
                <input
                  type="number"
                  min={1}
                  max={24}
                  aria-label={"Entry limit " + titles[w.id]}
                  value={w.limit}
                  onChange={(e) => change(i, { limit: Number(e.target.value) })}
                />
                <div className="button-row">
                  <button
                    className="icon-button"
                    aria-label={"Move " + titles[w.id] + " up"}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Move " + titles[w.id] + " down"}
                    disabled={i === editing.widgets.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
            <h3>Pinned entries ({editing.pins.length}/24)</h3>
            <EntryPicker
              label="Pin an entry"
              value=""
              empty="Choose an entry"
              entries={ctx.entries.filter((e) => !editing.pins.includes(e.id))}
              onChange={(id) => {
                if (id && editing.pins.length < 24)
                  setEditing({ ...editing, pins: [...editing.pins, id] });
              }}
            />
            <ol className="overview-pin-config">
              {editing.pins.map((id, i) => (
                <li key={id}>
                  <span>
                    {ctx.entries.find((e) => e.id === id)?.title ||
                      "Unavailable entry"}
                  </span>
                  <div className="button-row">
                    <button
                      className="icon-button"
                      aria-label={"Move pin " + (i + 1) + " up"}
                      disabled={i === 0}
                      onClick={() => {
                        const pins = [...editing.pins];
                        [pins[i - 1], pins[i]] = [pins[i], pins[i - 1]];
                        setEditing({ ...editing, pins });
                      }}
                    >
                      ↑
                    </button>
                    <button
                      className="text-button"
                      aria-label={"Remove pin " + (i + 1)}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          pins: editing.pins.filter((p) => p !== id),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="button-row overview-savebar">
              <button className="button primary" onClick={() => void save()}>
                {saving ? "Saving…" : "Save overview"}
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button
                className="text-button"
                onClick={async () => {
                  const latest = await load();
                  if (latest) setEditing(structuredClone(latest));
                }}
              >
                Reload saved layout
              </button>
            </div>
          </fieldset>
        </Modal>
      )}
    </div>
  );
}
