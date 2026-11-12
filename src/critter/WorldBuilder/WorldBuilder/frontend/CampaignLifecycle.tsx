import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  AppContext,
  Entry,
  api,
  patch,
  post,
  saveBeforeNavigate,
  human,
  isLocationEntry,
} from "./domain";
import { Badge, EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { PlanningEditor } from "./PlanningEditor";
import { AffinityDiagram, AffinityGraph } from "./AffinityWeb";
import { AgendaPanel } from "./AgendaPanel";
import { SessionReview } from "./SessionReview";
import { HandoutView } from "./HandoutView";
import { guideRoute } from "./CampaignWorkbench";
import { belongsToCampaign } from "./CampaignRecords";

type Lifecycle = {
  campaign: Entry;
  sessions: Entry[];
  session: Entry | null;
  planning: Entry[];
  planning_total: number;
  journal: Entry[];
  journal_total: number;
  followups: Entry[];
  followup_total: number;
  activity: {
    kind: string;
    title: string;
    data: { resource_id: string };
    created_at: string;
  }[];
};
const tabs = [
  ["planner", "Adventure planner"],
  ["agenda", "Session agenda"],
  ["run", "Run session"],
  ["journal", "Activity journal"],
  ["followups", "Follow-up inbox"],
  ["review", "Review & handoff"],
  ["handouts", "Handouts"],
];
export function CampaignLifecycle({
  ctx,
  id,
  view = "planner",
  initialSession = "",
  initialRecord = "",
}: {
  ctx: AppContext;
  id: string;
  view?: string;
  initialSession?: string;
  initialRecord?: string;
}) {
  const [sessionId, setSessionId] = useState(
      initialSession === "all" ? "" : initialSession,
    ),
    [payload, setPayload] = useState<{
      scope: string;
      session: string;
      value: Lifecycle;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [nonce, setNonce] = useState(0),
    [adventure, setAdventure] = useState(""),
    [editing, setEditing] = useState<{ entry?: Entry; type: string } | null>(
      null,
    ),
    [handout, setHandout] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [person, setPerson] = useState(""),
    [place, setPlace] = useState(""),
    [thread, setThread] = useState(""),
    [log, setLog] = useState(false);
  const usedInitial = useRef(false),
    scope = JSON.stringify([ctx.world.id, id]),
    token = JSON.stringify([
      scope,
      sessionId,
      search,
      person,
      place,
      thread,
      nonce,
      ctx.entries.map((e) => [e.id, e.revision]),
    ]);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 220);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<Lifecycle>(
      `/resources/${id}/lifecycle?` +
        new URLSearchParams({
          session: sessionId,
          q: search,
          person,
          place,
          thread,
        }),
    )
      .then((value) => {
        if (alive) {
          setPayload({ scope, session: sessionId, value });
          if (initialRecord && !usedInitial.current) {
            const entry = value.planning.find((e) => e.id === initialRecord);
            if (entry) setEditing({ entry, type: entry.data.planning_type });
            usedInitial.current = true;
          }
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  const value =
    payload?.scope === scope && payload.session === sessionId
      ? payload.value
      : null;
  const refresh = async () => {
    await ctx.refresh();
    setNonce((v) => v + 1);
  };
  const mutate = async (entry: Entry, data: Record<string, any>) => {
    setBusy(true);
    setError("");
    try {
      await patch("/resources/" + entry.id, {
        data,
        expected_revision: entry.revision,
      });
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!value)
    return (
      <div className="page">
        {error ? (
          <>
            <ErrorBox message={error} />
            <button
              className="button secondary"
              onClick={() => setSessionId("")}
            >
              Show all campaign sessions
            </button>
          </>
        ) : (
          <p role="status">Opening adventure workflow…</p>
        )}
      </div>
    );
  const campaign = value.campaign,
    adventures = value.planning.filter(
      (e) => e.data.planning_type === "adventure",
    ),
    selectedAdventure = adventures.find((e) => e.id === adventure),
    allScenes = value.planning.filter((e) =>
      ["campaign-scene", "encounter"].includes(e.data.planning_type),
    );
  const scenes = allScenes
    .filter((e) => !adventure || e.data.adventure_id === adventure)
    .sort((a, b) => {
      const order: string[] = selectedAdventure?.data.scene_ids || [];
      const ai = order.indexOf(a.id),
        bi = order.indexOf(b.id);
      return (
        (ai < 0 ? 100000 : ai) - (bi < 0 ? 100000 : bi) ||
        a.created_at?.localeCompare(b.created_at || "") ||
        a.title.localeCompare(b.title)
      );
    });
  const graph: AffinityGraph = {
    nodes: scenes.slice(0, 100).map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      template: e.template,
      summary: e.summary,
    })),
    edges: scenes
      .flatMap((e) => [
        ...(e.data.next_scenes || []).map((b: any) => ({
          id: `route:${e.id}:${b.target_id}`,
          source: e.id,
          target: b.target_id,
          kind: "route",
          label: b.label || "Next route",
          notes: b.condition || "",
        })),
        ...(e.data.prerequisites || []).map((target: string) => ({
          id: `requires:${target}:${e.id}`,
          source: target,
          target: e.id,
          kind: "prerequisite",
          label: "Prerequisite",
        })),
      ])
      .filter(
        (e) =>
          scenes.some((n) => n.id === e.source) &&
          scenes.some((n) => n.id === e.target),
      ),
    positions: selectedAdventure?.data.positions || {},
    warnings: [],
  };
  return (
    <div className="page campaign-lifecycle">
      <header className="workbench-heading">
        <div>
          <p className="eyebrow">PREPARE · RUN · RECORD · HAND OFF</p>
          <h1>{campaign.title}</h1>
          <p className="muted">
            Original scenes, encounters, notes and session history
          </p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() =>
              ctx.go(`campaign-continuity/${id}/overview/${sessionId || "all"}`)
            }
          >
            Party & campaign continuity
          </button>
          <button
            className="button secondary"
            onClick={() =>
              ctx.go(`campaign-desk/${id}/desk/${sessionId || "all"}`)
            }
          >
            Open GM desk
          </button>
          <button
            className="text-button"
            onClick={() => ctx.go("campaigns/" + id)}
          >
            Campaign workspace
          </button>
        </div>
      </header>
      <nav className="tabs scroll-tabs" aria-label="Campaign lifecycle views">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={view === key ? "active" : ""}
            onClick={() =>
              ctx.go(`campaign-flow/${id}/${key}/${sessionId || "all"}`)
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
            className="button secondary"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Reload workflow
          </button>
        </>
      )}
      <div className="workbench-toolbar">
        <EntryPicker
          label="Workflow session"
          value={sessionId}
          entries={value.sessions}
          onChange={async (v) => {
            if (
              saveBeforeNavigate.current &&
              !(await saveBeforeNavigate.current())
            )
              return;
            setSessionId(v);
          }}
        />
        {view === "planner" && (
          <EntryPicker
            label="Adventure group filter"
            value={adventure}
            entries={adventures}
            onChange={setAdventure}
          />
        )}
      </div>
      {view === "planner" && (
        <>
          <div className="button-row">
            {[
              ["adventure", "New adventure"],
              ["campaign-scene", "New scene"],
              ["encounter", "New encounter"],
            ].map(([type, label]) => (
              <button
                className="button secondary"
                key={type}
                onClick={() => setEditing({ type })}
              >
                {label}
              </button>
            ))}
            {selectedAdventure && (
              <button
                className="text-button"
                onClick={() =>
                  setEditing({ type: "adventure", entry: selectedAdventure })
                }
              >
                Edit adventure
              </button>
            )}
          </div>
          <p className="muted small-copy">
            Choose an adventure to save scene order and diagram positions.
            Branches can be nonlinear; prerequisites are visible guidance during
            play.
          </p>
          {!!graph.nodes.length && (
            <AffinityDiagram
              sceneMode
              ctx={ctx}
              graph={graph}
              campaignId={id}
              busy={busy}
              onPositions={
                selectedAdventure
                  ? (positions) =>
                      mutate(selectedAdventure, {
                        ...selectedAdventure.data,
                        positions,
                      })
                  : undefined
              }
            />
          )}
          <div className="planning-card-grid">
            {scenes.map((entry, index) => (
              <article
                className="planning-card"
                key={entry.id}
                data-planning-card={entry.id}
              >
                <Badge>{human(entry.data.planning_type)}</Badge>
                <h3>{entry.title}</h3>
                <p>{entry.data.public_summary || entry.summary}</p>
                <p className="small-copy">
                  {entry.data.adventure_id
                    ? adventures.find((a) => a.id === entry.data.adventure_id)
                        ?.title || "Unavailable adventure"
                    : "Ungrouped scene"}{" "}
                  · {(entry.data.next_scenes || []).length} routes
                </p>
                {entry.data.stakes && (
                  <p className="campaign-record-excerpt">
                    <strong>Stakes:</strong> {entry.data.stakes}
                  </p>
                )}
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() =>
                      setEditing({ entry, type: entry.data.planning_type })
                    }
                  >
                    Edit planning card
                  </button>
                  <button
                    className="text-button"
                    onClick={() => ctx.go("entry/" + entry.id)}
                  >
                    Edit original notes
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || !selectedAdventure || !index}
                    onClick={() => {
                      const order = scenes.map((e) => e.id);
                      [order[index - 1], order[index]] = [
                        order[index],
                        order[index - 1],
                      ];
                      mutate(selectedAdventure!, {
                        ...selectedAdventure!.data,
                        scene_ids: order,
                      });
                    }}
                  >
                    Move scene up
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!scenes.length && (
            <p className="muted">
              Create an adventure, then prepare its scenes and encounters.
            </p>
          )}
        </>
      )}
      {["agenda", "run"].includes(view) &&
        (value.session ? (
          <AgendaPanel
            key={value.session.id}
            ctx={ctx}
            campaign={campaign}
            session={value.session}
            planning={value.planning}
            run={view === "run"}
            onSaved={refresh}
          />
        ) : (
          <p className="notice">
            Choose a workflow session to prepare or run its agenda.
          </p>
        ))}
      {view === "journal" && (
        <>
          <div className="workbench-toolbar">
            <Field
              label="Search activity records"
              value={query}
              onChange={setQuery}
            />
            <EntryPicker
              label="Activity character"
              value={person}
              entries={ctx.entries.filter(
                (e) => e.kind === "character" || e.template === "character",
              )}
              onChange={setPerson}
            />
            <EntryPicker
              label="Activity location"
              value={place}
              entries={ctx.entries.filter(isLocationEntry)}
              onChange={setPlace}
            />
            <EntryPicker
              label="Activity quest/task"
              value={thread}
              entries={ctx.entries.filter(
                (e) =>
                  ["quest", "task"].includes(e.kind) &&
                  belongsToCampaign(e, id),
              )}
              onChange={setThread}
            />
          </div>
          <div className="button-row">
            <button className="button secondary" onClick={() => setLog(false)}>
              Recorded events
            </button>
            <button className="button secondary" onClick={() => setLog(true)}>
              Record change log
            </button>
          </div>
          {log ? (
            <div className="progression-journal">
              {value.activity.map((event, index) => (
                <article className="workbench-record" key={index}>
                  <p className="muted">
                    {new Date(event.created_at).toLocaleString()} ·{" "}
                    {human(event.kind)}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => ctx.go("entry/" + event.data.resource_id)}
                  >
                    {event.title}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <>
              <p className="muted small-copy">
                {value.journal.length} of {value.journal_total} matching records
              </p>
              <div className="progression-journal">
                {value.journal.map((entry) => (
                  <article
                    className="workbench-record"
                    key={entry.id}
                    data-activity-record={entry.id}
                  >
                    <p className="muted">
                      {entry.data.world_day ||
                        entry.data.logged_on ||
                        entry.updated_at.slice(0, 10)}
                    </p>
                    <h3>{entry.title}</h3>
                    <div
                      className="reader-prose"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(entry.html || ""),
                      }}
                    />
                    {entry.data.recap && (
                      <p className="campaign-record-excerpt">
                        {entry.data.recap}
                      </p>
                    )}
                    <button
                      className="text-button"
                      onClick={() => ctx.go(guideRoute(entry, id))}
                    >
                      Open original record
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {view === "followups" && (
        <FollowupPanel
          ctx={ctx}
          records={value.followups}
          sessions={value.sessions}
          onSaved={refresh}
        />
      )}
      {view === "review" &&
        (value.session ? (
          <SessionReview
            key={value.session.id}
            ctx={ctx}
            session={value.session}
            sessions={value.sessions}
            records={value.journal}
            followups={value.followups}
            onSaved={refresh}
          />
        ) : (
          <p className="notice">
            Choose a workflow session to review and prepare the next one.
          </p>
        ))}
      {view === "handouts" && (
        <>
          <button
            className="button primary"
            onClick={() => setEditing({ type: "handout" })}
          >
            New player handout
          </button>
          <div className="planning-card-grid">
            {value.planning
              .filter((e) => e.data.planning_type === "handout")
              .map((entry) => (
                <article
                  className="planning-card"
                  key={entry.id}
                  data-handout-card={entry.id}
                >
                  <h3>{entry.title}</h3>
                  <p>
                    {(entry.data.handout_sources || []).length} selected sources
                  </p>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      onClick={() => setEditing({ entry, type: "handout" })}
                    >
                      Edit handout selections
                    </button>
                    <button
                      className="button primary"
                      onClick={() => setHandout(entry.id)}
                    >
                      Preview safe handout
                    </button>
                  </div>
                </article>
              ))}
          </div>
        </>
      )}
      {value.planning_total > 500 && (
        <p className="notice">
          Showing 500 planning records. All originals remain in the world
          library.
        </p>
      )}
      {editing && (
        <PlanningEditor
          ctx={ctx}
          campaign={campaign}
          entry={editing.entry}
          type={editing.type}
          adventureId={adventure}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {handout && (
        <Modal
          title="Player-safe handout preview"
          wide
          onClose={() => setHandout("")}
        >
          <HandoutView ctx={ctx} id={handout} />
        </Modal>
      )}
    </div>
  );
}

function FollowupPanel({
  ctx,
  records,
  sessions,
  onSaved,
}: {
  ctx: AppContext;
  records: Entry[];
  sessions: Entry[];
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [converting, setConverting] = useState<Entry | null>(null),
    [title, setTitle] = useState("");
  const update = async (entry: Entry, data: Record<string, any>) => {
    setBusy(true);
    setError("");
    try {
      await patch("/resources/" + entry.id, {
        data,
        expected_revision: entry.revision,
      });
      await onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2>Follow-up inbox</h2>
      <p className="muted">
        Campaign-wide loose ends, reminders and open tasks. Scheduling retains
        their original session and source links.
      </p>
      {error && <ErrorBox message={error} />}
      <div className="planning-card-grid">
        {records.map((entry) => (
          <article
            className="planning-card"
            key={entry.id}
            data-followup-record={entry.id}
          >
            <h3>{entry.title}</h3>
            <Badge>{entry.data.follow_up_state || "open"}</Badge>
            <p className="muted small-copy">
              Origin:{" "}
              {sessions.find((s) => s.id === entry.data.session_id)?.title ||
                "Campaign"}
            </p>
            <div
              className="reader-prose"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(entry.html || ""),
              }}
            />
            <EntryPicker
              label={"Schedule follow-up: " + entry.title}
              value={entry.data.follow_up_session_id || ""}
              entries={sessions}
              onChange={(v) =>
                update(entry, {
                  ...entry.data,
                  follow_up_session_id: v,
                  follow_up_state: v ? "scheduled" : "open",
                })
              }
            />
            <div className="button-row">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  update(entry, {
                    ...entry.data,
                    follow_up_state: "done",
                    ...(entry.kind === "task" ? { progress: "done" } : {}),
                  })
                }
              >
                Resolve follow-up
              </button>
              {entry.kind !== "task" && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setConverting(entry);
                    setTitle("Follow-up: " + entry.title);
                  }}
                >
                  Turn into linked task
                </button>
              )}
              <button
                className="text-button"
                onClick={() => ctx.go(guideRoute(entry))}
              >
                Open original
              </button>
            </div>
          </article>
        ))}
      </div>
      {!records.length && (
        <p className="muted">
          No open follow-ups. Flag an event during capture to collect it here.
        </p>
      )}
      {converting && (
        <Modal
          title="Turn follow-up into a linked task"
          onClose={() => {
            if (!busy) setConverting(null);
          }}
        >
          <Field
            label="Follow-up task title"
            value={title}
            onChange={setTitle}
          />
          {error && <ErrorBox message={error} />}
          <p>The original note remains intact and the task links back to it.</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConverting(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy || !title.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                let saved = false;
                try {
                  await post(`/resources/${converting.id}/follow-up-task`, {
                    expected_revision: converting.revision,
                    title,
                  });
                  saved = true;
                  await onSaved();
                  setConverting(null);
                } catch (e: any) {
                  if (saved) {
                    setConverting(null);
                    ctx.notify(
                      "Task created, but refresh failed: " + e.message,
                      true,
                    );
                  } else setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create linked task
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
