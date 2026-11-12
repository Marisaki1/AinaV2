import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import {
  AppContext,
  Entry,
  api,
  docFromText,
  human,
  patch,
  post,
  saveBeforeNavigate,
} from "./domain";
import { Badge, EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { RelatedEntries } from "./CampaignRecords";
import { SearchableSelect } from "./SearchableSelect";
import { MapGuide } from "./MapGuide";
import { isLocationEntry } from "./domain";

type Desk = {
  session: Entry;
  campaign: Entry | null;
  sections: Record<string, string>;
  records: Entry[];
  record_total: number;
  cast: (Entry & {
    portrait_asset_id: string;
    portrait_url?: string;
    association: string;
  })[];
  cast_total: number;
  locations: {
    map: Entry;
    asset_id: string;
    marker_id: string;
    label: string;
  }[];
  location_total: number;
  previous: Entry | null;
  following: Entry | null;
  previous_follow_up: string;
};
const sections = [
  ["prep", "Preparation (GM only)"],
  ["recap", "Session recap"],
  ["consequences", "Consequences & world changes (GM only)"],
  ["rewards", "Rewards & progression"],
  ["next_steps", "Next session follow-up (GM only)"],
];
const prose = (html = "") => (
  <div
    className="reader-prose"
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
  />
);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function SessionGuide({
  ctx,
  id,
  reader = false,
}: {
  ctx: AppContext;
  id: string;
  reader?: boolean;
}) {
  const [payload, setPayload] = useState<{
      scope: string;
      token: string;
      value: Desk;
    } | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("plan"),
    [query, setQuery] = useState(""),
    [form, setForm] = useState<"plan" | "record" | "">(""),
    [location, setLocation] = useState<Desk["locations"][number] | null>(null),
    [busy, setBusy] = useState(false);
  const scope = JSON.stringify([ctx.world.id, id, reader]);
  const token = JSON.stringify([
    scope,
    ctx.entries.map((e) => [
      e.id,
      e.revision,
      e.published_revision,
      e.visibility,
    ]),
  ]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<Desk>(
      `/resources/${id}/session-guide${reader ? "?audience=reader" : ""}`,
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
  const value =
    payload?.scope === scope && (!reader || payload.token === token)
      ? payload.value
      : null;
  if (error && !value) return <ErrorBox message={error} />;
  if (!value) return <p role="status">Loading session guide…</p>;
  const session = value.session;
  const updateProgress = async (record: Entry, progress: string) => {
    setBusy(true);
    try {
      await patch("/resources/" + record.id, {
        data: { ...record.data, progress },
        expected_revision: record.revision,
      });
      await ctx.refresh();
    } catch (e: any) {
      ctx.notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="session-guide" aria-label="Session guide">
      {error && <ErrorBox message={error} />}
      {!reader &&
        session.data.marker_id &&
        !value.locations.some(
          (row) =>
            row.map.id === session.data.map_id &&
            row.marker_id === session.data.marker_id,
        ) && (
          <p className="notice">
            The recorded map location is unavailable. Its original link is
            retained; any available map can still be explored as a whole.
          </p>
        )}
      <div className="session-guide-heading">
        <div>
          <p className="eyebrow">
            {value.campaign?.title || "World session"} · Session{" "}
            {session.data.number || "—"}
          </p>
          <h1>{session.title}</h1>
          <p className="muted">
            {session.data.date_local?.replace("T", " · ") || "Unscheduled"} ·{" "}
            {human(session.data.session_status || "planned")}
          </p>
          {session.summary && <p>{session.summary}</p>}
        </div>
        {!reader && (
          <div className="button-row">
            <button className="button primary" onClick={() => setForm("plan")}>
              Edit session plan & outcomes
            </button>
            <button
              className="button secondary"
              onClick={() => setForm("record")}
            >
              Write session record
            </button>
            <button
              className="text-button"
              onClick={() => ctx.go("entry/" + id)}
            >
              Open original session
            </button>
            {value.campaign && (
              <button
                className="text-button"
                onClick={() => ctx.go("campaigns/" + value.campaign!.id)}
              >
                Open campaign workspace
              </button>
            )}
            {value.campaign && (
              <button
                className="button secondary"
                onClick={() =>
                  ctx.go(`campaign-desk/${value.campaign!.id}/desk/${id}`)
                }
              >
                Open session GM desk
              </button>
            )}
            {value.campaign && (
              <button
                className="button secondary"
                onClick={() =>
                  ctx.go(`campaign-flow/${value.campaign!.id}/agenda/${id}`)
                }
              >
                Plan / run / review session
              </button>
            )}
          </div>
        )}
      </div>
      <nav className="tabs scroll-tabs" aria-label="Session guide sections">
        {[
          ["plan", reader ? "Recap & rewards" : "Plan & outcomes"],
          ["records", "Session notes"],
          ["cast", "Cast & lore"],
          ["maps", "Maps & places"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "plan" && (
        <div className="session-guide-plan">
          {!reader && value.previous_follow_up && (
            <aside className="session-guide-carryover">
              <h2>From the previous session</h2>
              <p className="small-copy">{value.previous?.title}</p>
              <p className="campaign-record-excerpt">
                {value.previous_follow_up}
              </p>
              <p className="muted small-copy">
                Reference this while planning. Use the edit form to append it to
                preparation.
              </p>
            </aside>
          )}
          {sections
            .filter(([key]) => !reader || ["recap", "rewards"].includes(key))
            .map(([key, label]) => (
              <article className="campaign-record-card" key={key}>
                <h2>{label}</h2>
                {value.sections[key] ? (
                  prose(value.sections[key])
                ) : (
                  <p className="muted">
                    {reader
                      ? "No published text yet."
                      : "Nothing recorded yet. Use Edit session plan & outcomes to add it."}
                  </p>
                )}
              </article>
            ))}
          {session.html &&
            (!!session.word_count || /<(img|table)\b/.test(session.html)) && (
              <article className="campaign-record-card">
                <h2>Original session notes</h2>
                {prose(session.html)}
              </article>
            )}
          {!reader && session.private_notes && (
            <article className="campaign-record-card">
              <h2>GM notes</h2>
              <p className="campaign-record-excerpt">{session.private_notes}</p>
            </article>
          )}
        </div>
      )}
      {tab === "records" && (
        <>
          <Field
            label="Find session records"
            value={query}
            onChange={setQuery}
          />
          <p className="muted small-copy">
            {value.records.length} of {value.record_total} records · Linked to
            this session; original entries retain their history.
          </p>
          <div className="progression-journal campaign-record-list">
            {value.records
              .filter((e) =>
                (e.title + " " + e.summary + " " + (e.data.world_day || ""))
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((e) => (
                <article
                  className="campaign-record-card"
                  key={e.id}
                  data-session-record={e.id}
                >
                  <div className="section-heading">
                    <h2>{e.title}</h2>
                    <Badge>{human(e.data.record_type || e.kind)}</Badge>
                  </div>
                  <p className="small-copy muted">
                    {e.data.world_day || e.data.logged_on || ""}
                    {e.data.progress ? " · " + human(e.data.progress) : ""}
                  </p>
                  {e.html ? prose(e.html) : <p>{e.summary}</p>}
                  {!reader && ["quest", "task"].includes(e.kind) && (
                    <label className="field">
                      <span>Progress of {e.title}</span>
                      <SearchableSelect
                        value={e.data.progress || "open"}
                        disabled={busy}
                        onChange={(ev) => updateProgress(e, ev.target.value)}
                      >
                        {["open", "active", "done", "failed"].map((p) => (
                          <option key={p} value={p}>
                            {human(p)}
                          </option>
                        ))}
                      </SearchableSelect>
                    </label>
                  )}
                  {!reader && (
                    <button
                      className="text-button"
                      onClick={() => ctx.go("entry/" + e.id)}
                    >
                      Open original record
                    </button>
                  )}
                </article>
              ))}
            {!value.records.length && (
              <p className="muted">
                No linked session records yet.
                {!reader &&
                  " Write a session record to capture discoveries, daily notes or milestones."}
              </p>
            )}
          </div>
        </>
      )}
      {tab === "cast" && (
        <>
          <p className="muted small-copy">
            {value.cast.length} of {value.cast_total} linked entries · Campaign
            party and lore explicitly linked to this session or its records.
          </p>
          <div className="session-guide-cards">
            {value.cast.map((e) => {
              const asset = ctx.assets.find(
                (a) => a.id === e.portrait_asset_id,
              );
              return (
                <article className="campaign-record-card" key={e.id}>
                  {(asset || e.portrait_url) && (
                    <img
                      className="session-guide-portrait"
                      referrerPolicy="no-referrer"
                      src={asset?.url || e.portrait_url}
                      alt=""
                    />
                  )}
                  <Badge>{human(e.association)}</Badge>
                  <h2>{e.title}</h2>
                  <p>{e.summary}</p>
                  {!reader && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        ctx.go(
                          e.kind === "character" || e.template === "character"
                            ? "characters/" +
                                e.id +
                                (value.campaign ? "/" + value.campaign.id : "")
                            : isLocationEntry(e)
                              ? "locations/" +
                                e.id +
                                (value.campaign ? "/" + value.campaign.id : "")
                              : "entry/" + e.id,
                        )
                      }
                    >
                      {e.kind === "character" || e.template === "character"
                        ? "View character dossier"
                        : isLocationEntry(e)
                          ? "View location guide"
                          : "Open original lore"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {!value.cast.length && (
            <p className="muted">
              No linked cast or lore. Add entries in the session plan.
            </p>
          )}
        </>
      )}
      {tab === "maps" && (
        <>
          <p className="muted small-copy">
            {value.locations.length} of {value.location_total} locations ·
            Linked session map, record locations and explicitly linked maps.
          </p>
          <div className="session-guide-cards">
            {value.locations.map((row, n) => (
              <article
                className="campaign-record-card"
                key={row.map.id + row.marker_id + n}
              >
                {ctx.assets.find((a) => a.id === row.asset_id) && (
                  <img
                    className="session-guide-map"
                    src={ctx.assets.find((a) => a.id === row.asset_id)!.url}
                    alt=""
                  />
                )}
                <h2>{row.map.title}</h2>
                <p>{row.label}</p>
                <button
                  className="button secondary"
                  onClick={() => setLocation(row)}
                >
                  Explore this location
                </button>
              </article>
            ))}
          </div>
          {!value.locations.length && (
            <p className="muted">
              No maps linked yet. Choose a map and location in the session plan.
            </p>
          )}
        </>
      )}
      {!reader && (value.previous || value.following) && (
        <nav
          className="session-guide-neighbors"
          aria-label="Adjacent campaign sessions"
        >
          {value.previous && (
            <button
              className="text-button"
              onClick={() => ctx.go("sessions/" + value.previous!.id)}
            >
              Previous: {value.previous.title}
            </button>
          )}
          {value.following && (
            <button
              className="text-button"
              onClick={() => ctx.go("sessions/" + value.following!.id)}
            >
              Next: {value.following.title}
            </button>
          )}
        </nav>
      )}
      {location && (
        <Modal
          title={location.map.title + " · " + location.label}
          wide
          onClose={() => setLocation(null)}
        >
          <MapGuide
            key={location.map.id + location.marker_id}
            ctx={ctx}
            mapId={location.map.id}
            initialMarkerId={location.marker_id}
            reader={reader}
          />
        </Modal>
      )}
      {!reader && form && (
        <SessionForm
          ctx={ctx}
          value={value}
          mode={form}
          onClose={() => setForm("")}
        />
      )}
    </section>
  );
}

function SessionForm({
  ctx,
  value,
  mode,
  onClose,
}: {
  ctx: AppContext;
  value: Desk;
  mode: "plan" | "record";
  onClose: () => void;
}) {
  const [session, setSession] = useState(value.session);
  const [data, setData] = useState<Record<string, any>>(
      mode === "plan"
        ? structuredClone(session.data)
        : {
            related_entries: (session.data.related_entries || []).filter(
              (id: string) =>
                ctx.entries.some(
                  (e) =>
                    e.id === id &&
                    (e.kind === "character" || e.template === "character"),
                ),
            ),
          },
    ),
    [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [type, setType] = useState("journal"),
    [date, setDate] = useState(today),
    [worldDay, setWorldDay] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const dirty =
    mode === "plan"
      ? JSON.stringify(data) !== JSON.stringify(session.data)
      : !!(title || text || worldDay);
  const mayClose = () =>
    !busy && (!dirty || confirm("Discard unsaved session changes?"));
  useEffect(() => {
    const previous = saveBeforeNavigate.current;
    const guard = async () => mayClose();
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
  const map = ctx.entries.find((e) => e.id === data.map_id && e.kind === "map");
  return (
    <Modal
      title={
        mode === "plan"
          ? "Edit session plan & outcomes"
          : "Write session record"
      }
      wide
      onClose={() => {
        if (mayClose()) onClose();
      }}
    >
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          let saved = false;
          try {
            if (mode === "plan")
              await patch("/resources/" + session.id, {
                data,
                expected_revision: session.revision,
              });
            else {
              const campaign = session.data.campaign_id ?? session.parent ?? "";
              const inherited = value.locations.find(
                (row) => row.map.id === session.data.map_id,
              );
              await post("/worlds/" + ctx.world.id + "/resources", {
                kind: ["task", "quest"].includes(type) ? type : "note",
                title: title.trim(),
                summary: text.slice(0, 240),
                document: docFromText(text),
                visibility: "private",
                parent: campaign || null,
                data: {
                  ...data,
                  campaign_id: campaign,
                  session_id: session.id,
                  ...(inherited
                    ? {
                        map_id: inherited.map.id,
                        marker_id: inherited.marker_id,
                      }
                    : {}),
                  ...(["task", "quest"].includes(type)
                    ? { progress: "open", priority: "normal" }
                    : {
                        record_type: type,
                        logged_on: date,
                        world_day: worldDay,
                      }),
                },
              });
            }
            saved = true;
            await ctx.refresh();
            onClose();
            ctx.notify(
              mode === "plan"
                ? "Session plan saved. Published reader version stays unchanged until you publish."
                : "Private session record saved.",
            );
          } catch (e: any) {
            if (saved) {
              onClose();
              ctx.notify(
                "Saved successfully, but the guide could not refresh: " +
                  e.message,
                true,
              );
            } else {
              setError(e.message);
              setConflict(e.status === 409);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <ErrorBox message={error} />}
        {conflict && mode === "plan" && (
          <div className="notice">
            <p>
              Your unsaved text is still here. Copy anything you need before
              reloading the newer plan.
            </p>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                if (
                  !confirm(
                    "Discard this unsaved plan and load the latest saved session?",
                  )
                )
                  return;
                setBusy(true);
                try {
                  const latest = await api<Entry>("/resources/" + session.id);
                  setSession(latest);
                  setData(structuredClone(latest.data));
                  setError("");
                  setConflict(false);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reload latest session
            </button>
          </div>
        )}
        <fieldset disabled={busy} className="session-guide-form-fields">
          {mode === "plan" ? (
            <>
              <div className="field-grid">
                <label className="field">
                  <span>Session status</span>
                  <SearchableSelect
                    value={data.session_status || "planned"}
                    onChange={(ev) =>
                      setData({ ...data, session_status: ev.target.value })
                    }
                  >
                    {["planned", "in_progress", "completed", "cancelled"].map(
                      (s) => (
                        <option key={s} value={s}>
                          {human(s)}
                        </option>
                      ),
                    )}
                  </SearchableSelect>
                </label>
                <Field
                  label="Session date & time"
                  type="datetime-local"
                  value={data.date_local || ""}
                  onChange={(v) =>
                    setData({
                      ...data,
                      date_local: v,
                      scheduled_at: v ? new Date(v).toISOString() : "",
                    })
                  }
                />
              </div>
              {value.previous_follow_up && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setData({
                      ...data,
                      prep: [data.prep, value.previous_follow_up]
                        .filter(Boolean)
                        .join("\n\n"),
                    })
                  }
                >
                  Append previous session follow-up
                </button>
              )}
              {sections.map(([key, label]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <textarea
                    rows={4}
                    value={data[key] || ""}
                    onChange={(ev) =>
                      setData({ ...data, [key]: ev.target.value })
                    }
                  />
                </label>
              ))}
              <div className="field-grid">
                <EntryPicker
                  label="Linked campaign map"
                  value={data.map_id || ""}
                  entries={ctx.entries.filter((e) => e.kind === "map")}
                  onChange={(v) =>
                    setData({ ...data, map_id: v, marker_id: "" })
                  }
                />
                <label className="field">
                  <span>Linked map location</span>
                  <SearchableSelect
                    value={data.marker_id || ""}
                    disabled={!map}
                    onChange={(ev) =>
                      setData({ ...data, marker_id: ev.target.value })
                    }
                  >
                    <option value="">Whole map</option>
                    {data.marker_id &&
                      !map?.data.markers?.some(
                        (m: any) => m.id === data.marker_id,
                      ) && (
                        <option value={data.marker_id}>
                          Unavailable recorded location
                        </option>
                      )}
                    {(map?.data.markers || []).map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.label || "Unnamed location"}
                      </option>
                    ))}
                  </SearchableSelect>
                </label>
              </div>
            </>
          ) : (
            <>
              <Field label="Record title" value={title} onChange={setTitle} />
              <label className="field">
                <span>Record type</span>
                <SearchableSelect
                  value={type}
                  onChange={(ev) => setType(ev.target.value)}
                >
                  {[
                    ["journal", "Day-to-day journal"],
                    ["note", "Note"],
                    ["milestone", "Progression / milestone"],
                    ["task", "Task"],
                    ["quest", "Quest"],
                  ].map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </SearchableSelect>
              </label>
              <label className="field">
                <span>Record notes</span>
                <textarea
                  rows={6}
                  value={text}
                  onChange={(ev) => setText(ev.target.value)}
                />
              </label>
              {!["task", "quest"].includes(type) && (
                <div className="field-grid">
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
                </div>
              )}
              <p className="muted small-copy">
                Saved privately under {session.title}
                {value.campaign ? " in " + value.campaign.title : ""}. The
                session's available map/location is retained. Use the original
                editor to change associations later.
              </p>
            </>
          )}
          <RelatedEntries
            data={data}
            onData={setData}
            ctx={ctx}
            exclude={session.id}
          />
        </fieldset>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              if (mayClose()) onClose();
            }}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || (mode === "record" && !title.trim())}
          >
            {busy
              ? "Saving…"
              : mode === "plan"
                ? "Save session plan"
                : "Save session record"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
