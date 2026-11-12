import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import {
  AppContext,
  Entry,
  api,
  human,
  isLocationEntry,
  patch,
  uid,
  saveBeforeNavigate,
} from "./domain";
import { Badge, EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { belongsToCampaign } from "./CampaignRecords";
import { CampaignCapture } from "./CampaignCapture";
import { MapGuide } from "./MapGuide";

export const guideRoute = (entry: Entry, campaign = "") =>
  entry.kind === "character" || entry.template === "character"
    ? `characters/${entry.id}${campaign ? "/" + campaign : ""}`
    : isLocationEntry(entry)
      ? `locations/${entry.id}${campaign ? "/" + campaign : ""}`
      : entry.kind === "session"
        ? "sessions/" + entry.id
        : ["quest", "task"].includes(entry.kind)
          ? "threads/" + entry.id
          : "entry/" + entry.id;
type Panel = { kind: string; collapsed: boolean };
export type Layout = {
  id: string;
  name: string;
  columns: number;
  session_id: string;
  panels: Panel[];
  pins: { entry_id: string; wide: boolean }[];
};
type Settings = { layouts: Layout[]; selected_layout: string };
type Workbench = {
  campaign: Entry;
  sessions: Entry[];
  records: Entry[];
  total: number;
  has_more: boolean;
  lane_counts: Record<string, number>;
  recent_notes: Entry[];
  open_threads: Entry[];
  maps: Entry[];
  pins: { entry_id: string; wide: boolean; entry: Entry | null }[];
};
const panelNames: Record<string, string> = {
  pins: "Pinned references",
  session: "Active session",
  capture: "Quick capture",
  notes: "Recent notes",
  threads: "Open threads",
  maps: "Campaign maps",
};
const defaultLayout = (): Layout => ({
  id: "default",
  name: "Campaign desk",
  columns: 2,
  session_id: "",
  panels: Object.keys(panelNames).map((kind) => ({ kind, collapsed: false })),
  pins: [],
});
export async function pinCampaignReference(
  ctx: AppContext,
  campaignId: string,
  entryId: string,
) {
  const campaign = await api<Entry>("/resources/" + campaignId);
  const settings: Settings = campaign.data.gm_workspace || {
    layouts: [],
    selected_layout: "",
  };
  const layout =
    settings.layouts.find((v) => v.id === settings.selected_layout) ||
    settings.layouts[0] ||
    defaultLayout();
  if (layout.pins.some((v) => v.entry_id === entryId)) return;
  const next = {
    ...layout,
    pins: [...layout.pins, { entry_id: entryId, wide: false }],
  };
  const layouts = settings.layouts.some((v) => v.id === next.id)
    ? settings.layouts.map((v) => (v.id === next.id ? next : v))
    : [...settings.layouts, next];
  await patch("/resources/" + campaignId, {
    data: {
      ...campaign.data,
      gm_workspace: { layouts, selected_layout: next.id },
    },
    expected_revision: campaign.revision,
  });
}
const prose = (html = "") => (
  <div
    className="reader-prose workbench-prose"
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
  />
);

export function CampaignWorkbench({
  ctx,
  id,
  view = "desk",
  initialSession,
}: {
  ctx: AppContext;
  id: string;
  view?: string;
  initialSession?: string;
}) {
  const [payload, setPayload] = useState<{
      scope: string;
      token: string;
      value: Workbench;
    } | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [session, setSession] = useState(() => {
      if (initialSession !== undefined)
        return initialSession === "all" ? "" : initialSession;
      const c = ctx.entries.find((e) => e.id === id),
        w = c?.data.gm_workspace;
      const selected =
        w?.layouts?.find((v: Layout) => v.id === w.selected_layout)
          ?.session_id || "";
      return ctx.entries.some(
        (e) =>
          e.id === selected && e.kind === "session" && belongsToCampaign(e, id),
      )
        ? selected
        : "";
    }),
    [type, setType] = useState(""),
    [offset, setOffset] = useState(0),
    [nonce, setNonce] = useState(0),
    [busy, setBusy] = useState(false),
    [capture, setCapture] = useState(false),
    [configure, setConfigure] = useState<{
      layout: Layout;
      settings: Settings;
      campaign: Entry;
    } | null>(null),
    [pinning, setPinning] = useState(false),
    [pinId, setPinId] = useState(""),
    [mapId, setMapId] = useState(""),
    [arc, setArc] = useState("");
  const scope = JSON.stringify([ctx.world.id, id]),
    category =
      view === "notes" ? "notes" : view === "threads" ? "threads" : "all";
  const token = JSON.stringify([
    scope,
    category,
    search,
    session,
    type,
    arc,
    offset,
    nonce,
    ctx.entries.map((e) => [e.id, e.revision]),
  ]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setOffset(0);
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<Workbench>(
      `/resources/${id}/workbench?` +
        new URLSearchParams({
          category,
          q: search,
          session,
          type,
          arc,
          offset: String(offset),
        }),
    )
      .then((value) => {
        if (alive) setPayload({ scope, token, value });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  const value = payload?.scope === scope ? payload.value : null,
    loading = payload?.token !== token;
  const campaign = value?.campaign,
    settings: Settings = campaign?.data.gm_workspace || {
      layouts: [],
      selected_layout: "",
    },
    layout =
      settings.layouts.find((v) => v.id === settings.selected_layout) ||
      settings.layouts[0] ||
      defaultLayout();
  const campaignLore = new Set<string>([
    ...(campaign?.data.party || []),
    ...(campaign?.data.related_entries || []),
    ...ctx.entries
      .filter((e) => belongsToCampaign(e, id))
      .flatMap((e) =>
        [
          e.id,
          ...(Array.isArray(e.data.related_entries)
            ? e.data.related_entries
            : []),
          e.data.map_id,
          e.data.link_id,
        ].filter(Boolean),
      ),
  ]);
  const refresh = async () => {
    await ctx.refresh();
    setNonce((n) => n + 1);
  };
  const saveSettings = async (next: Settings, base = campaign) => {
    if (!base) return;
    setBusy(true);
    setError("");
    let saved = false;
    try {
      await patch("/resources/" + id, {
        data: { ...base.data, gm_workspace: next },
        expected_revision: base.revision,
      });
      saved = true;
      await refresh();
    } catch (e: any) {
      if (saved) {
        ctx.notify("Desk saved, but refresh failed: " + e.message, true);
        setNonce((n) => n + 1);
      } else {
        setError(e.message);
        throw e;
      }
    } finally {
      setBusy(false);
    }
  };
  const changeLayout = async (next: Layout) => {
    const layouts = settings.layouts.some((v) => v.id === next.id)
      ? settings.layouts.map((v) => (v.id === next.id ? next : v))
      : [...settings.layouts, next];
    await saveSettings({ layouts, selected_layout: next.id });
  };
  const pin = async (entryId: string) => {
    if (layout.pins.some((p) => p.entry_id === entryId)) return;
    await changeLayout({
      ...layout,
      pins: [...layout.pins, { entry_id: entryId, wide: false }],
    });
  };
  const updateProgress = async (entry: Entry, progress: string) => {
    setBusy(true);
    setError("");
    try {
      await patch("/resources/" + entry.id, {
        data: { ...entry.data, progress },
        expected_revision: entry.revision,
      });
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const sessionEntry = value?.sessions.find((e) => e.id === session);
  const card = (entry: Entry, compact = false) => (
    <article
      className="workbench-record"
      key={entry.id}
      data-workbench-record={entry.id}
    >
      <div className="section-heading">
        <button
          className="text-button"
          onClick={() => ctx.go(guideRoute(entry, id))}
        >
          <strong>{entry.title}</strong>
        </button>
        <Badge>{human(entry.data.record_type || entry.kind)}</Badge>
      </div>
      <p className="muted small-copy">
        {entry.data.world_day || entry.data.logged_on || ""}
        {entry.data.story_arc ? " · " + entry.data.story_arc : ""} ·{" "}
        {entry.visibility === "private"
          ? "Private"
          : "Reader version available"}
      </p>
      {!compact && prose(entry.html)}
      {!compact &&
        Object.entries(entry.workbench_sections || {}).map(([key, html]) => (
          <details
            key={key}
            open={["recap", "rewards", "outcome"].includes(key)}
          >
            <summary>
              {key === "gm_next_step" ? "Next action (GM only)" : human(key)}
            </summary>
            {prose(html)}
          </details>
        ))}
      {compact && entry.summary && <p>{entry.summary}</p>}
      <div className="button-row">
        <button
          className="text-button"
          disabled={
            busy ||
            loading ||
            layout.pins.some((p) => p.entry_id === entry.id) ||
            layout.pins.length >= 40
          }
          onClick={() => pin(entry.id).catch(() => {})}
        >
          {layout.pins.some((p) => p.entry_id === entry.id)
            ? "Pinned"
            : "Pin reference"}
        </button>
        <button
          className="text-button"
          onClick={() => ctx.go("entry/" + entry.id)}
        >
          Edit original
        </button>
      </div>
    </article>
  );
  const movePin = (index: number, delta: number) => {
    const pins = [...layout.pins];
    [pins[index], pins[index + delta]] = [pins[index + delta], pins[index]];
    changeLayout({ ...layout, pins }).catch(() => {});
  };
  const panelContent = (kind: string) => {
    if (kind === "capture")
      return (
        <>
          <p>
            Record discoveries, daily events, milestones, quests and tasks
            without leaving the desk.
          </p>
          <button className="button primary" onClick={() => setCapture(true)}>
            Quick capture
          </button>
          <p className="muted small-copy">
            New records start private. Choose a session, thread, map and related
            lore when capturing.
          </p>
        </>
      );
    if (kind === "session")
      return sessionEntry ? (
        <>
          <h3>{sessionEntry.title}</h3>
          <p className="muted">
            {human(sessionEntry.data.session_status || "planned")}
          </p>
          <p className="campaign-record-excerpt">
            {sessionEntry.data.prep ||
              sessionEntry.data.next_steps ||
              "No preparation recorded yet."}
          </p>
          <button
            className="button secondary"
            onClick={() => ctx.go("sessions/" + sessionEntry.id)}
          >
            Open session guide
          </button>
        </>
      ) : (
        <p className="muted">
          Choose a session above or assign one to the saved layout.
        </p>
      );
    if (kind === "notes")
      return (
        <>
          {value?.recent_notes.map((e) => card(e, true))}
          {!value?.recent_notes.length && (
            <p className="muted">No notes in this context yet.</p>
          )}
          <button
            className="text-button"
            onClick={() =>
              ctx.go(`campaign-desk/${id}/notes/${session || "all"}`)
            }
          >
            Open campaign notebook
          </button>
        </>
      );
    if (kind === "threads")
      return (
        <>
          {value?.open_threads.map((e) => card(e, true))}
          {!value?.open_threads.length && (
            <p className="muted">No open threads in this context.</p>
          )}
          <button
            className="text-button"
            onClick={() =>
              ctx.go(`campaign-desk/${id}/threads/${session || "all"}`)
            }
          >
            Open story board
          </button>
        </>
      );
    if (kind === "maps")
      return (
        <div className="workbench-map-buttons">
          {value?.maps.map((e) => (
            <button
              className="button secondary"
              key={e.id}
              onClick={() => setMapId(e.id)}
            >
              {e.title}
            </button>
          ))}
          {!value?.maps.length && (
            <p className="muted">
              Link a campaign map through its records or Characters & places.
            </p>
          )}
        </div>
      );
    return (
      <>
        <button
          className="button secondary small"
          disabled={busy || layout.pins.length >= 40}
          onClick={() => {
            setPinId("");
            setPinning(true);
          }}
        >
          Pin a reference
        </button>
        <div className="desk-pins">
          {layout.pins.map((p, index) => {
            const entry = value?.pins.find(
              (v) => v.entry_id === p.entry_id,
            )?.entry;
            return (
              <article
                className={"desk-pin " + (p.wide ? "wide" : "")}
                key={p.entry_id}
                data-desk-pin={p.entry_id}
              >
                {entry ? (
                  <>
                    {(ctx.assets.find(
                      (a) =>
                        a.id ===
                        (entry.kind === "map"
                          ? entry.data.asset_id
                          : entry.data.cover_asset),
                    )?.url ||
                      entry.data.cover_url) && (
                      <img
                        className="desk-pin-image"
                        src={
                          ctx.assets.find(
                            (a) =>
                              a.id ===
                              (entry.kind === "map"
                                ? entry.data.asset_id
                                : entry.data.cover_asset),
                          )?.url || entry.data.cover_url
                        }
                        referrerPolicy="no-referrer"
                        alt=""
                      />
                    )}
                    {!campaignLore.has(entry.id) && (
                      <Badge>World reference</Badge>
                    )}
                    <h3>{entry.title}</h3>
                    {prose(entry.html)}
                    {entry.data.prep && (
                      <details>
                        <summary>Preparation (GM only)</summary>
                        <p className="campaign-record-excerpt">
                          {entry.data.prep}
                        </p>
                      </details>
                    )}
                    <button
                      className="button secondary small"
                      onClick={() =>
                        ctx.go(
                          guideRoute(
                            entry,
                            campaignLore.has(entry.id) ? id : "",
                          ),
                        )
                      }
                    >
                      Open reference
                    </button>
                    {entry.kind === "map" && (
                      <button
                        className="text-button"
                        onClick={() => setMapId(entry.id)}
                      >
                        Explore map
                      </button>
                    )}
                  </>
                ) : (
                  <p className="notice">
                    Unavailable reference. The original may be in Trash or
                    outside this campaign.
                  </p>
                )}
                <div className="button-row">
                  <button
                    className="text-button"
                    aria-label={"Move pin " + (index + 1) + " up"}
                    disabled={busy || loading || !index}
                    onClick={() => movePin(index, -1)}
                  >
                    Up
                  </button>
                  <button
                    className="text-button"
                    aria-label={"Move pin " + (index + 1) + " down"}
                    disabled={
                      busy || loading || index === layout.pins.length - 1
                    }
                    onClick={() => movePin(index, 1)}
                  >
                    Down
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || loading}
                    onClick={() =>
                      changeLayout({
                        ...layout,
                        pins: layout.pins.map((v) =>
                          v.entry_id === p.entry_id
                            ? { ...v, wide: !v.wide }
                            : v,
                        ),
                      }).catch(() => {})
                    }
                  >
                    {p.wide ? "Standard card" : "Wide card"}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || loading}
                    onClick={() =>
                      changeLayout({
                        ...layout,
                        pins: layout.pins.filter(
                          (v) => v.entry_id !== p.entry_id,
                        ),
                      }).catch(() => {})
                    }
                  >
                    Unpin
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {!layout.pins.length && (
          <p className="muted">
            Pin original notes, characters, locations, quests or maps. Cards
            follow their source edits.
          </p>
        )}
      </>
    );
  };
  if (!value)
    return (
      <div className="page">
        {error ? (
          <>
            <ErrorBox message={error} />
            <button
              className="button secondary"
              onClick={() => {
                setSession("");
                setType("");
                setOffset(0);
                setNonce((n) => n + 1);
              }}
            >
              Show all campaign sessions
            </button>
          </>
        ) : (
          <p role="status">Opening campaign workbench…</p>
        )}
      </div>
    );
  const visible = value.records.filter((e) => !arc || e.data.story_arc === arc);
  const arcs = [
    ...new Set(
      ctx.entries
        .filter(
          (e) => belongsToCampaign(e, id) && ["quest", "task"].includes(e.kind),
        )
        .map((e) => e.data.story_arc)
        .filter(Boolean),
    ),
  ].sort();
  return (
    <div className="page campaign-workbench">
      <header className="workbench-heading">
        <div>
          <p className="eyebrow">PREPARE · PLAY · REVIEW</p>
          <h1>{campaign!.title}</h1>
          <p className="muted">
            Private GM workspace · original records, shared context
          </p>
        </div>
        <div className="button-row">
          <button className="button primary" onClick={() => setCapture(true)}>
            Quick capture
          </button>
          <button
            className="button secondary"
            onClick={() => ctx.go("campaigns/" + id)}
          >
            Campaign workspace
          </button>
        </div>
      </header>
      <button
        className="button secondary"
        onClick={() =>
          ctx.go(`campaign-flow/${id}/planner/${session || "all"}`)
        }
      >
        Open adventure workflow
      </button>
      <button
        className="button secondary"
        onClick={() =>
          ctx.go(`campaign-continuity/${id}/overview/${session || "all"}`)
        }
      >
        Party & campaign continuity
      </button>
      <nav className="tabs scroll-tabs" aria-label="Campaign workbench views">
        {[
          ["desk", "GM desk"],
          ["threads", "Quest & story board"],
          ["notes", "Campaign notebook"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={view === key ? "active" : ""}
            onClick={() =>
              ctx.go(`campaign-desk/${id}/${key}/${session || "all"}`)
            }
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <>
          <ErrorBox message={error} />
          <button
            className="button secondary small"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Reload latest campaign
          </button>
        </>
      )}
      <div className="workbench-toolbar">
        <EntryPicker
          label="Session view"
          value={session}
          entries={value.sessions}
          onChange={(v) => {
            setSession(v);
            setOffset(0);
          }}
        />
        {view === "desk" ? (
          <>
            <label className="field">
              <span>Saved desk layout</span>
              <SearchableSelect
                disabled={busy || loading}
                value={layout.id}
                onChange={(e) => {
                  const next = settings.layouts.find(
                    (v) => v.id === e.target.value,
                  );
                  if (next) {
                    setSession(next.session_id);
                    saveSettings({
                      ...settings,
                      selected_layout: next.id,
                    }).catch(() => {});
                  }
                }}
              >
                {!settings.layouts.length && (
                  <option value="default">Campaign desk</option>
                )}
                {settings.layouts.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            <button
              className="button secondary"
              disabled={busy || loading}
              onClick={() =>
                setConfigure({
                  layout: structuredClone(layout),
                  settings: structuredClone(settings),
                  campaign: campaign!,
                })
              }
            >
              Configure desk
            </button>
            <button
              className="text-button"
              disabled={busy || loading}
              onClick={() =>
                changeLayout({ ...layout, session_id: session }).catch(() => {})
              }
            >
              Save session to layout
            </button>
          </>
        ) : (
          <>
            <Field
              label="Search campaign records"
              value={query}
              onChange={setQuery}
            />
            {view === "notes" ? (
              <label className="field">
                <span>Notebook record type</span>
                <SearchableSelect
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value);
                    setOffset(0);
                  }}
                >
                  {[
                    ["", "All notes & reports"],
                    ["note", "Notes"],
                    ["journal", "Daily journals"],
                    ["milestone", "Milestones"],
                    ["session", "Session reports"],
                  ].map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </SearchableSelect>
              </label>
            ) : (
              <label className="field">
                <span>Story arc filter</span>
                <SearchableSelect
                  value={arc}
                  onChange={(e) => setArc(e.target.value)}
                >
                  <option value="">All story arcs</option>
                  {arcs.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </SearchableSelect>
              </label>
            )}
          </>
        )}
      </div>
      {loading && (
        <p role="status" className="muted">
          Updating campaign view…
        </p>
      )}
      {view === "desk" && (
        <div
          className="gm-desk-grid"
          style={{
            gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
          }}
        >
          {layout.panels.map((panel, index) => (
            <section
              className="desk-panel"
              key={panel.kind}
              data-desk-panel={panel.kind}
            >
              <div className="section-heading">
                <h2>{panelNames[panel.kind]}</h2>
                <div className="button-row">
                  <button
                    className="text-button"
                    disabled={busy || loading || !index}
                    aria-label={"Move " + panelNames[panel.kind] + " up"}
                    onClick={() => {
                      const panels = [...layout.panels];
                      [panels[index - 1], panels[index]] = [
                        panels[index],
                        panels[index - 1],
                      ];
                      changeLayout({ ...layout, panels }).catch(() => {});
                    }}
                  >
                    ↑
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || loading}
                    aria-expanded={!panel.collapsed}
                    onClick={() =>
                      changeLayout({
                        ...layout,
                        panels: layout.panels.map((v) =>
                          v.kind === panel.kind
                            ? { ...v, collapsed: !v.collapsed }
                            : v,
                        ),
                      }).catch(() => {})
                    }
                  >
                    {panel.collapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
              </div>
              {!panel.collapsed && panelContent(panel.kind)}
            </section>
          ))}
        </div>
      )}
      {view === "notes" && (
        <>
          <p className="muted small-copy">
            {value.total} matching original notes and reports · body text, tags
            and campaign fields are searchable.
          </p>
          <div className="workbench-notebook">
            {value.records.map((e) => card(e))}
          </div>
          {!value.records.length && (
            <p>No matching records. Capture a note or change the filters.</p>
          )}
        </>
      )}
      {view === "threads" && (
        <>
          <p className="muted small-copy">
            Move cards between lanes, or use each card's progress dropdown.
            Objectives and outcomes stay on the original quest/task.
          </p>
          <div className="story-board">
            {["open", "active", "done", "failed"].map((progress) => (
              <section
                className="story-lane"
                key={progress}
                data-story-lane={progress}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const entry = value.records.find(
                    (v) =>
                      v.id ===
                      e.dataTransfer.getData("application/worldbuilder-thread"),
                  );
                  if (entry && !busy && !loading)
                    updateProgress(entry, progress);
                }}
              >
                <h2>
                  {human(progress)}{" "}
                  <span>{value.lane_counts[progress] || 0}</span>
                </h2>
                {visible
                  .filter(
                    (e) =>
                      (["open", "active", "done", "failed"].includes(
                        e.data.progress,
                      )
                        ? e.data.progress
                        : "open") === progress,
                  )
                  .map((e) => (
                    <article
                      className="story-card"
                      draggable={!busy && !loading}
                      onDragStart={(ev) =>
                        ev.dataTransfer.setData(
                          "application/worldbuilder-thread",
                          e.id,
                        )
                      }
                      key={e.id}
                      data-thread-card={e.id}
                    >
                      <Badge>{human(e.kind)}</Badge>
                      <h3>
                        <button
                          className="text-button"
                          onClick={() => ctx.go("threads/" + e.id)}
                        >
                          {e.title}
                        </button>
                      </h3>
                      <p>{e.summary}</p>
                      {e.data.story_arc && (
                        <p className="small-copy">{e.data.story_arc}</p>
                      )}
                      <p>
                        {
                          (e.data.objectives || []).filter((v: any) => v.done)
                            .length
                        }
                        /{(e.data.objectives || []).length} objectives
                      </p>
                      {e.data.outcome && (
                        <p className="campaign-record-excerpt">
                          {e.data.outcome}
                        </p>
                      )}
                      <label className="field">
                        <span>Progress of {e.title}</span>
                        <SearchableSelect
                          disabled={busy || loading}
                          value={e.data.progress || "open"}
                          onChange={(ev) => updateProgress(e, ev.target.value)}
                        >
                          {["open", "active", "done", "failed"].map((v) => (
                            <option key={v} value={v}>
                              {human(v)}
                            </option>
                          ))}
                        </SearchableSelect>
                      </label>
                      <button
                        className="text-button"
                        onClick={() => ctx.go("threads/" + e.id)}
                      >
                        Open thread guide
                      </button>
                      <button
                        className="text-button"
                        disabled={
                          busy ||
                          loading ||
                          layout.pins.some((p) => p.entry_id === e.id)
                        }
                        onClick={() => pin(e.id).catch(() => {})}
                      >
                        Pin thread
                      </button>
                    </article>
                  ))}
              </section>
            ))}
          </div>
        </>
      )}
      {view !== "desk" && (
        <div className="button-row">
          <button
            className="button secondary"
            disabled={loading || !offset}
            onClick={() => setOffset(Math.max(0, offset - 100))}
          >
            Previous 100
          </button>
          <span>
            {Math.min(offset + 1, value.total)}–
            {Math.min(offset + 100, value.total)} of {value.total}
          </span>
          <button
            className="button secondary"
            disabled={loading || !value.has_more}
            onClick={() => setOffset(offset + 100)}
          >
            Next 100
          </button>
        </div>
      )}
      {capture && (
        <CampaignCapture
          ctx={ctx}
          campaign={campaign!}
          sessionId={session}
          onClose={() => setCapture(false)}
          onSaved={async (entry, shouldPin) => {
            if (shouldPin) await pin(entry.id);
            else await refresh();
          }}
        />
      )}
      {configure && (
        <DeskConfiguration
          layout={configure.layout}
          settings={configure.settings}
          sessions={value.sessions}
          onClose={() => setConfigure(null)}
          onSave={async (next) => {
            await saveSettings(next, configure.campaign);
            const active = next.layouts.find(
              (v) => v.id === next.selected_layout,
            );
            setSession(
              active && value.sessions.some((v) => v.id === active.session_id)
                ? active.session_id
                : "",
            );
            setConfigure(null);
          }}
        />
      )}
      {pinning && (
        <Modal
          title="Pin an original reference"
          onClose={() => {
            if (!busy) setPinning(false);
          }}
        >
          <EntryPicker
            label="Reference to pin"
            value={pinId}
            onChange={setPinId}
            entries={ctx.entries.filter(
              (e) =>
                e.id !== id &&
                e.kind !== "folder" &&
                (!["note", "session", "quest", "task"].includes(e.kind) ||
                  belongsToCampaign(e, id)),
            )}
          />
          {error && <ErrorBox message={error} />}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPinning(false)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy || loading || !pinId}
              onClick={async () => {
                try {
                  await pin(pinId);
                  setPinning(false);
                } catch {}
              }}
            >
              Save pin
            </button>
          </div>
        </Modal>
      )}
      {mapId && (
        <Modal title="Campaign map reference" wide onClose={() => setMapId("")}>
          <MapGuide
            ctx={ctx}
            mapId={mapId}
            campaignId={campaignLore.has(mapId) ? id : ""}
            onNavigate={() => setMapId("")}
          />
        </Modal>
      )}
    </div>
  );
}

function DeskConfiguration({
  layout,
  settings,
  sessions,
  onClose,
  onSave,
}: {
  layout: Layout;
  settings: Settings;
  sessions: Entry[];
  onClose: () => void;
  onSave: (value: Settings) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Layout>(structuredClone(layout)),
    [duplicate, setDuplicate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = duplicate || JSON.stringify(draft) !== JSON.stringify(layout),
    close = () =>
      !busy && (!dirty || confirm("Discard unsaved desk configuration?"));
  useEffect(() => {
    const previous = saveBeforeNavigate.current,
      guard = async () => close();
    saveBeforeNavigate.current = guard;
    const before = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      if (saveBeforeNavigate.current === guard)
        saveBeforeNavigate.current = previous;
      window.removeEventListener("beforeunload", before);
    };
  }, [dirty, busy]);
  return (
    <Modal
      title="Configure GM desk"
      onClose={() => {
        if (close()) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const next = { ...draft, id: duplicate ? uid() : draft.id };
            const layouts =
              !duplicate && settings.layouts.some((v) => v.id === next.id)
                ? settings.layouts.map((v) => (v.id === next.id ? next : v))
                : [...settings.layouts, next];
            await onSave({ layouts, selected_layout: next.id });
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <ErrorBox message={error} />}
        <fieldset disabled={busy} className="session-guide-form-fields">
          <Field
            label="Desk layout name"
            value={draft.name}
            onChange={(v) => setDraft({ ...draft, name: v })}
          />
          <label className="field">
            <span>Desk columns</span>
            <SearchableSelect
              value={String(draft.columns)}
              onChange={(e) =>
                setDraft({ ...draft, columns: Number(e.target.value) })
              }
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} column{n > 1 ? "s" : ""}
                </option>
              ))}
            </SearchableSelect>
          </label>
          <EntryPicker
            label="Layout session"
            value={draft.session_id}
            entries={sessions}
            onChange={(v) => setDraft({ ...draft, session_id: v })}
          />
          <h3>Visible panels</h3>
          {Object.entries(panelNames).map(([kind, name]) => (
            <label className="checkbox-row" key={kind}>
              <input
                type="checkbox"
                checked={draft.panels.some((v) => v.kind === kind)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    panels: e.target.checked
                      ? [...draft.panels, { kind, collapsed: false }]
                      : draft.panels.filter((v) => v.kind !== kind),
                  })
                }
              />
              {name}
            </label>
          ))}
          <label className="checkbox-row">
            <input
              type="checkbox"
              disabled={settings.layouts.length >= 12}
              checked={duplicate}
              onChange={(e) => setDuplicate(e.target.checked)}
            />{" "}
            Save as a new layout
          </label>
        </fieldset>
        <div className="modal-actions">
          {settings.layouts.some((v) => v.id === layout.id) && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                if (
                  !confirm(
                    "Remove this saved layout? Original records will stay intact.",
                  )
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  const layouts = settings.layouts.filter(
                    (v) => v.id !== layout.id,
                  );
                  await onSave({
                    layouts,
                    selected_layout: layouts[0]?.id || "",
                  });
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove saved layout
            </button>
          )}
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              if (close()) onClose();
            }}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !draft.name.trim()}
          >
            Save desk layout
          </button>
        </div>
      </form>
    </Modal>
  );
}
