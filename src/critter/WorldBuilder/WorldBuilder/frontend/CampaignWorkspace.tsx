import React, { useState } from "react";
import { AppContext, Entry, docFromText, human, patch, post } from "./domain";
import { Badge, EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { belongsToCampaign, RelatedEntries } from "./CampaignRecords";
import { AffinityWorkspace } from "./AffinityWeb";
import { MapGuide } from "./MapGuide";
import { isLocationEntry } from "./domain";

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const tabs = [
  ["sessions", "Sessions"],
  ["journal", "Day-to-day journal"],
  ["notes", "Notes & tasks"],
  ["progression", "Progression"],
  ["cast", "Characters & places"],
  ["affinity", "Affinity web"],
  ["maps", "Maps"],
];

export function CampaignWorkspace({
  ctx,
  campaign,
  run,
  onRun,
}: {
  ctx: AppContext;
  campaign: Entry;
  run: boolean;
  onRun: (value: boolean) => void;
}) {
  const [tab, setTab] = useState("sessions"),
    [query, setQuery] = useState(""),
    [creating, setCreating] = useState(""),
    [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [date, setDate] = useState(today),
    [worldDay, setWorldDay] = useState(""),
    [session, setSession] = useState(""),
    [number, setNumber] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [linking, setLinking] = useState(false),
    [links, setLinks] = useState<Record<string, any>>({});
  const records = ctx.entries.filter((e) => belongsToCampaign(e, campaign.id));
  const sessions = records
    .filter((e) => e.kind === "session")
    .sort(
      (a, b) =>
        (b.data.number || 0) - (a.data.number || 0) ||
        b.updated_at.localeCompare(a.updated_at),
    );
  const linkedIds = new Set<string>([
    ...(campaign.data.related_entries || []),
    ...(campaign.data.party || []),
    ...records.flatMap((e) =>
      [...(e.data.related_entries || []), e.data.link_id, e.data.map_id].filter(
        Boolean,
      ),
    ),
  ]);
  const library = ctx.entries.filter(
    (e) =>
      (linkedIds.has(e.id) || belongsToCampaign(e, campaign.id)) &&
      e.id !== campaign.id,
  );
  const matched = (e: Entry) =>
    (
      e.title +
      " " +
      e.summary +
      " " +
      e.tags.join(" ") +
      " " +
      (e.data.world_day || "")
    )
      .toLowerCase()
      .includes(query.toLowerCase());
  let rows: Entry[] =
    tab === "sessions"
      ? sessions
      : tab === "journal"
        ? records.filter(
            (e) => e.kind === "note" && e.data.record_type === "journal",
          )
        : tab === "progression"
          ? records.filter(
              (e) =>
                e.kind === "quest" ||
                (e.kind === "session" &&
                  !!(e.data.rewards || e.data.consequences)) ||
                (e.kind === "note" && e.data.record_type === "milestone"),
            )
          : tab === "notes"
            ? records.filter(
                (e) =>
                  e.kind === "task" ||
                  (e.kind === "note" &&
                    !["journal", "milestone"].includes(e.data.record_type)),
              )
            : library.filter((e) =>
                tab === "maps"
                  ? e.kind === "map"
                  : ["article", "character", "statblock"].includes(e.kind),
              );
  if (tab !== "sessions")
    rows.sort((a, b) =>
      (b.data.logged_on || b.updated_at).localeCompare(
        a.data.logged_on || a.updated_at,
      ),
    );
  const openCreate = (kind: string) => {
    setCreating(kind);
    setTitle("");
    setText("");
    setDate(today());
    setWorldDay("");
    setSession("");
    setNumber(
      Math.max(0, ...sessions.map((e) => Number(e.data.number) || 0)) + 1,
    );
    setError("");
  };
  const update = async (entry: Entry, data: any) => {
    setBusy(true);
    try {
      await patch("/resources/" + entry.id, {
        data,
        expected_revision: entry.revision,
      });
      await ctx.refresh();
    } catch (e: any) {
      ctx.notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="campaign-workspace">
      <div className="button-row campaign-workbench-links">
        <button
          className="button primary"
          onClick={() =>
            ctx.go(`campaign-continuity/${campaign.id}/overview/all`)
          }
        >
          Party & campaign continuity
        </button>
        <button
          className="button primary"
          onClick={() => ctx.go(`campaign-flow/${campaign.id}/planner/all`)}
        >
          Adventure & session workflow
        </button>
        <button
          className="button secondary"
          onClick={() => ctx.go(`campaign-desk/${campaign.id}/desk`)}
        >
          Open GM desk
        </button>
        <button
          className="button secondary"
          onClick={() => ctx.go(`campaign-desk/${campaign.id}/threads`)}
        >
          Quest & story board
        </button>
        <button
          className="button secondary"
          onClick={() => ctx.go(`campaign-desk/${campaign.id}/notes`)}
        >
          Campaign notebook
        </button>
      </div>
      <div
        className="tabs scroll-tabs"
        aria-label="Campaign workspace sections"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={!run && tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setQuery("");
              onRun(false);
            }}
          >
            {label}
          </button>
        ))}
        <button className={run ? "active" : ""} onClick={() => onRun(true)}>
          Run session
        </button>
      </div>
      {!run && tab === "affinity" && (
        <AffinityWorkspace ctx={ctx} campaignId={campaign.id} />
      )}
      {!run && tab !== "affinity" && (
        <>
          <div className="campaign-workspace-toolbar">
            <label className="field">
              <span>Search campaign records</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search titles, summaries, tags and in-world days…"
              />
            </label>
            <div className="button-row">
              {tab === "sessions" && (
                <button
                  className="button primary"
                  onClick={() => openCreate("session")}
                >
                  New session plan
                </button>
              )}
              {tab === "journal" && (
                <button
                  className="button primary"
                  onClick={() => openCreate("journal")}
                >
                  Add journal entry
                </button>
              )}
              {tab === "notes" && (
                <>
                  <button
                    className="button primary"
                    onClick={() => openCreate("note")}
                  >
                    Add campaign note
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => openCreate("task")}
                  >
                    Add campaign task
                  </button>
                </>
              )}
              {tab === "progression" && (
                <>
                  <button
                    className="button primary"
                    onClick={() => openCreate("milestone")}
                  >
                    Record milestone
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => openCreate("quest")}
                  >
                    Add campaign quest
                  </button>
                </>
              )}
              {["cast", "maps"].includes(tab) && (
                <>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setLinks({ ...campaign.data });
                      setLinking(true);
                      setError("");
                    }}
                  >
                    Link existing entries
                  </button>
                  <button
                    className="button primary"
                    onClick={() =>
                      ctx.create(
                        tab === "maps" ? "map" : "character",
                        campaign.id,
                      )
                    }
                  >
                    Create {tab === "maps" ? "map" : "character"}
                  </button>
                </>
              )}
            </div>
          </div>
          {tab === "progression" && (
            <p className="muted">
              Quest outcomes and milestones stay with this campaign. Record
              level gains, discoveries, rewards and changes here; detailed
              rewards also live in session recaps.
            </p>
          )}
          {tab === "maps" && (
            <MapGuide
              ctx={ctx}
              campaignId={campaign.id}
              mapIds={rows.filter(matched).map((e) => e.id)}
            />
          )}
          <div
            className={
              "campaign-record-list" +
              (tab === "progression" ? " progression-journal" : "")
            }
            style={tab === "maps" ? { display: "none" } : undefined}
          >
            {rows.filter(matched).map((e) => (
              <article
                className="campaign-record-card"
                key={e.id}
                data-campaign-record={e.id}
              >
                <div className="section-heading">
                  <button
                    className="text-button campaign-record-title"
                    onClick={() =>
                      ctx.go(
                        (e.kind === "character" || e.template === "character"
                          ? "characters/"
                          : "entry/") +
                          e.id +
                          (e.kind === "character" || e.template === "character"
                            ? "/" + campaign.id
                            : ""),
                      )
                    }
                  >
                    {e.title}
                  </button>
                  <Badge>
                    {e.kind === "session"
                      ? human(e.data.session_status || "planned")
                      : human(e.data.record_type || e.kind)}
                  </Badge>
                </div>
                <p className="small-copy muted">
                  {e.kind === "session"
                    ? `Session ${e.data.number || "—"}`
                    : e.data.logged_on || ""}
                  {e.data.world_day ? " · " + e.data.world_day : ""}
                  {e.data.session_id
                    ? " · " +
                      (sessions.find((s) => s.id === e.data.session_id)
                        ?.title || "Unavailable session")
                    : ""}
                </p>
                {e.summary && <p>{e.summary}</p>}
                {tab === "cast" && isLocationEntry(e) && (
                  <button
                    className="button secondary small"
                    onClick={() =>
                      ctx.go("locations/" + e.id + "/" + campaign.id)
                    }
                  >
                    View location guide
                  </button>
                )}
                {tab === "cast" &&
                  (e.kind === "character" || e.template === "character") && (
                    <button
                      className="button secondary small"
                      onClick={() =>
                        ctx.go("characters/" + e.id + "/" + campaign.id)
                      }
                    >
                      View character dossier
                    </button>
                  )}
                {tab === "progression" &&
                  e.kind === "session" &&
                  e.data.consequences && (
                    <p className="campaign-record-excerpt">
                      <strong>Consequences:</strong> {e.data.consequences}
                    </p>
                  )}
                {e.kind === "session" && (
                  <>
                    <button
                      className="button secondary"
                      onClick={() => ctx.go("sessions/" + e.id)}
                    >
                      Open session guide
                    </button>
                    <p className="campaign-record-excerpt">
                      {e.data.recap ||
                        e.data.prep ||
                        "Open this session to write preparation, recap, consequences, rewards and follow-up."}
                    </p>
                    {e.data.rewards && (
                      <p>
                        <strong>Progression:</strong> {e.data.rewards}
                      </p>
                    )}
                    <label className="field">
                      <span>Status of {e.title}</span>
                      <SearchableSelect
                        disabled={busy}
                        value={e.data.session_status || "planned"}
                        onChange={(ev) =>
                          update(e, {
                            ...e.data,
                            session_status: ev.target.value,
                          })
                        }
                      >
                        {[
                          "planned",
                          "in_progress",
                          "completed",
                          "cancelled",
                        ].map((v) => (
                          <option key={v} value={v}>
                            {human(v)}
                          </option>
                        ))}
                      </SearchableSelect>
                    </label>
                  </>
                )}
                {["task", "quest"].includes(e.kind) && (
                  <label className="field">
                    <span>Progress of {e.title}</span>
                    <SearchableSelect
                      disabled={busy}
                      value={e.data.progress || "open"}
                      onChange={(ev) =>
                        update(e, { ...e.data, progress: ev.target.value })
                      }
                    >
                      {["open", "active", "done", "failed"].map((v) => (
                        <option key={v} value={v}>
                          {human(v)}
                        </option>
                      ))}
                    </SearchableSelect>
                  </label>
                )}
                <button
                  className="text-button"
                  onClick={() => ctx.go("entry/" + e.id)}
                >
                  Open {human(e.kind).toLowerCase()}
                </button>
              </article>
            ))}
            {!rows.filter(matched).length && (
              <p className="muted">
                {query
                  ? "No matching campaign records."
                  : "Nothing here yet. Add a record or link existing world entries to this campaign."}
              </p>
            )}
          </div>
        </>
      )}
      {creating && (
        <Modal
          title={
            creating === "session"
              ? "New session plan"
              : creating === "journal"
                ? "Add journal entry"
                : creating === "milestone"
                  ? "Record milestone"
                  : "Add campaign " + creating
          }
          onClose={() => {
            if (!busy) setCreating("");
          }}
        >
          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (busy || !title.trim()) return;
              setBusy(true);
              setError("");
              try {
                const kind = ["journal", "milestone"].includes(creating)
                  ? "note"
                  : creating;
                const data: any = { campaign_id: campaign.id };
                if (kind === "session")
                  Object.assign(data, {
                    number,
                    session_status: "planned",
                    prep: text,
                  });
                if (kind === "note")
                  Object.assign(data, {
                    record_type: creating,
                    logged_on: date,
                    world_day: worldDay,
                    session_id: session,
                  });
                if (["quest", "task"].includes(kind))
                  Object.assign(data, {
                    progress: "open",
                    priority: "normal",
                    session_id: session,
                  });
                await post("/worlds/" + ctx.world.id + "/resources", {
                  kind,
                  title,
                  summary: kind === "session" ? "" : text.slice(0, 240),
                  document: docFromText(kind === "session" ? "" : text),
                  data,
                  parent: campaign.id,
                  visibility: "private",
                });
                await ctx.refresh();
                setCreating("");
                ctx.notify("Campaign record saved.");
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorBox message={error} />}
            <Field label="Record title" value={title} onChange={setTitle} />
            {creating === "session" ? (
              <Field
                label="Session number"
                type="number"
                min={1}
                max={1000000}
                value={number}
                onChange={setNumber}
              />
            ) : (
              <>
                {["journal", "milestone", "note"].includes(creating) && (
                  <>
                    <Field
                      label="Journal date"
                      type="date"
                      value={date}
                      onChange={setDate}
                    />
                    <Field
                      label="In-world day / chapter"
                      value={worldDay}
                      onChange={setWorldDay}
                    />
                  </>
                )}
                <EntryPicker
                  label="Related session"
                  value={session}
                  onChange={setSession}
                  entries={sessions}
                />
              </>
            )}
            <label className="field">
              <span>
                {creating === "session"
                  ? "Preparation (GM only)"
                  : "Record notes"}
              </span>
              <textarea
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setCreating("")}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || !title.trim()}
              >
                {busy ? "Saving…" : "Save campaign record"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {linking && (
        <Modal
          title="Link campaign characters, maps & lore"
          wide
          onClose={() => {
            if (!busy) setLinking(false);
          }}
        >
          {error && <ErrorBox message={error} />}
          <RelatedEntries
            ctx={ctx}
            data={links}
            onData={setLinks}
            exclude={campaign.id}
          />
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setLinking(false)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await patch("/resources/" + campaign.id, {
                    data: {
                      ...campaign.data,
                      related_entries: links.related_entries || [],
                    },
                    expected_revision: campaign.revision,
                  });
                  await ctx.refresh();
                  setLinking(false);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save campaign links
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
