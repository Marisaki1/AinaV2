import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { AppContext, Entry, patch, saveBeforeNavigate, human } from "./domain";
import { Badge, EntryPicker, ErrorBox, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { belongsToCampaign } from "./CampaignRecords";
import { CampaignCapture } from "./CampaignCapture";
import { pinCampaignReference, guideRoute } from "./CampaignWorkbench";
import { MapGuide } from "./MapGuide";

export type AgendaItem = { entry_id: string; state: string; notes: string };
export const agendaStates = [
  "planned",
  "active",
  "paused",
  "completed",
  "skipped",
];
export function AgendaPanel({
  ctx,
  campaign,
  session,
  planning,
  run,
  onSaved,
}: {
  ctx: AppContext;
  campaign: Entry;
  session: Entry;
  planning: Entry[];
  run: boolean;
  onSaved: () => Promise<void>;
}) {
  const [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [capture, setCapture] = useState(false),
    [map, setMap] = useState(false);
  const agenda: AgendaItem[] = session.data.agenda || [],
    current = ctx.entries.find((e) => e.id === session.data.active_scene_id),
    definition = planning.find((e) => e.id === current?.id) || current;
  const save = async (next: AgendaItem[], status?: string) => {
    setBusy(true);
    setError("");
    try {
      await patch("/resources/" + session.id, {
        data: {
          ...session.data,
          campaign_id: campaign.id,
          agenda: next,
          active_scene_id:
            next.find((v) => v.state === "active")?.entry_id || "",
          ...(status ? { session_status: status } : {}),
        },
        expected_revision: session.revision,
      });
      await onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const change = (id: string, state: string) =>
    save(
      agenda.map((v) =>
        v.entry_id === id
          ? { ...v, state }
          : state === "active" && v.state === "active"
            ? { ...v, state: "paused" }
            : v,
      ),
      state === "active" ? "in_progress" : undefined,
    );
  const start = (id: string) => {
    let next = agenda.map((v) =>
      v.state === "active" ? { ...v, state: "paused" } : v,
    );
    if (!next.some((v) => v.entry_id === id))
      next.push({ entry_id: id, state: "planned", notes: "" });
    save(
      next.map((v) => (v.entry_id === id ? { ...v, state: "active" } : v)),
      "in_progress",
    );
  };
  const completed = new Set(
    agenda.filter((v) => v.state === "completed").map((v) => v.entry_id),
  );
  return (
    <section className="agenda-panel">
      <div className="section-heading">
        <div>
          <h2>
            {run ? "Run session" : "Session agenda"}: {session.title}
          </h2>
          <p className="muted">
            {human(session.data.session_status || "planned")} · States are
            recorded on this session.
          </p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setEdit(true)}
          >
            Edit session agenda
          </button>
          <button className="button primary" onClick={() => setCapture(true)}>
            Capture session event
          </button>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {run && (
        <article className="current-scene panel">
          <p className="eyebrow">CURRENT SCENE / AGENDA ITEM</p>
          <h2>{definition?.title || "Choose an agenda item to begin"}</h2>
          {definition && (
            <>
              <Badge>
                {human(definition.data.planning_type || definition.kind)}
              </Badge>
              {(definition.data.prerequisites || []).filter(
                (id: string) => !completed.has(id),
              ).length > 0 && (
                <p className="notice">
                  Prerequisites outstanding:{" "}
                  {(definition.data.prerequisites || [])
                    .filter((id: string) => !completed.has(id))
                    .map(
                      (id: string) =>
                        ctx.entries.find((e) => e.id === id)?.title ||
                        "Unavailable scene",
                    )
                    .join(", ")}
                  . You can still choose the route during play.
                </p>
              )}
              <div
                className="reader-prose"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(definition.html || ""),
                }}
              />
              {[
                "stakes",
                "environment",
                "possible_outcomes",
                "branch_notes",
              ].map(
                (key) =>
                  definition.data[key] && (
                    <section key={key}>
                      <h3>{human(key)} · GM only</h3>
                      <p className="campaign-record-excerpt">
                        {definition.data[key]}
                      </p>
                    </section>
                  ),
              )}
              <div className="button-row">
                {(definition.data.related_entries || []).map((id: string) => {
                  const e = ctx.entries.find((e) => e.id === id);
                  return (
                    e && (
                      <button
                        className="button secondary small"
                        key={id}
                        onClick={() => ctx.go(guideRoute(e, campaign.id))}
                      >
                        {e.title}
                      </button>
                    )
                  );
                })}
                {definition.data.map_id && (
                  <button
                    className="button secondary"
                    onClick={() => setMap(true)}
                  >
                    Open scene map
                  </button>
                )}
              </div>
              {(definition.data.next_scenes || []).map((branch: any) => {
                const target = ctx.entries.find(
                  (e) => e.id === branch.target_id,
                );
                return (
                  <article className="scene-branch-card" key={branch.target_id}>
                    <strong>
                      {branch.label || "Next route"} →{" "}
                      {target?.title || "Unavailable scene"}
                    </strong>
                    <p>{branch.condition}</p>
                    <button
                      className="button secondary small"
                      disabled={busy || !target}
                      onClick={() => start(branch.target_id)}
                    >
                      Take this route
                    </button>
                  </article>
                );
              })}
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => {
                    const index = agenda.findIndex(
                        (v) => v.entry_id === current?.id,
                      ),
                      nextId = agenda
                        .slice(index + 1)
                        .find((v) =>
                          ["planned", "paused"].includes(v.state),
                        )?.entry_id;
                    save(
                      agenda.map((v) =>
                        v.entry_id === current?.id
                          ? { ...v, state: "completed" }
                          : v.entry_id === nextId
                            ? { ...v, state: "active" }
                            : v,
                      ),
                    );
                  }}
                >
                  Complete & next
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => change(current!.id, "skipped")}
                >
                  Skip current item
                </button>
              </div>
            </>
          )}
        </article>
      )}
      <div className="agenda-list">
        {agenda.map((item, index) => {
          const entry = ctx.entries.find((e) => e.id === item.entry_id);
          return (
            <article
              className={
                "agenda-row " + (item.state === "active" ? "active" : "")
              }
              key={item.entry_id}
              data-agenda-item={item.entry_id}
            >
              <span className="agenda-number">{index + 1}</span>
              <div>
                <h3>{entry?.title || "Unavailable original entry"}</h3>
                <p className="campaign-record-excerpt">{item.notes}</p>
                <Badge>{human(item.state)}</Badge>
              </div>
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={busy || !entry}
                  onClick={() => start(item.entry_id)}
                >
                  Start item
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => change(item.entry_id, "completed")}
                >
                  Mark completed
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!agenda.length && (
        <p className="muted">
          Add scenes, encounters, notes, reminders or unresolved threads to the
          agenda.
        </p>
      )}
      <button
        className="button secondary"
        disabled={busy}
        onClick={() =>
          save(
            agenda.map((v) =>
              v.state === "active" ? { ...v, state: "completed" } : v,
            ),
            "completed",
          )
        }
      >
        Complete session
      </button>
      {edit && (
        <AgendaEditor
          ctx={ctx}
          campaign={campaign}
          session={session}
          planning={planning}
          onClose={() => setEdit(false)}
          onSaved={onSaved}
        />
      )}
      {capture && (
        <CampaignCapture
          ctx={ctx}
          campaign={campaign}
          sessionId={session.id}
          sceneId={
            current &&
            ["campaign-scene", "encounter"].includes(current.data.planning_type)
              ? current.id
              : ""
          }
          threadId={
            current && ["task", "quest"].includes(current.kind)
              ? current.id
              : ""
          }
          onClose={() => setCapture(false)}
          onSaved={async (entry, pin) => {
            if (pin) await pinCampaignReference(ctx, campaign.id, entry.id);
            await onSaved();
          }}
        />
      )}
      {map && definition?.data.map_id && (
        <Modal title="Current scene map" wide onClose={() => setMap(false)}>
          <MapGuide
            ctx={ctx}
            mapId={definition.data.map_id}
            campaignId={campaign.id}
            initialMarkerId={definition.data.marker_id || ""}
            onNavigate={() => setMap(false)}
          />
        </Modal>
      )}
    </section>
  );
}

function AgendaEditor({
  ctx,
  campaign,
  session,
  planning,
  onClose,
  onSaved,
}: {
  ctx: AppContext;
  campaign: Entry;
  session: Entry;
  planning: Entry[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [items, setItems] = useState<AgendaItem[]>(() =>
      structuredClone(session.data.agenda || []),
    ),
    [choice, setChoice] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty =
      JSON.stringify(items) !== JSON.stringify(session.data.agenda || []),
    close = () =>
      !busy && (!dirty || confirm("Discard unsaved agenda changes?"));
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
  const add = (ids: string[]) =>
    setItems([
      ...items,
      ...ids
        .filter((id) => !items.some((v) => v.entry_id === id))
        .map((entry_id) => ({ entry_id, state: "planned", notes: "" })),
    ]);
  return (
    <Modal
      title="Edit session agenda"
      wide
      onClose={() => {
        if (close()) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          let saved = false;
          try {
            await patch("/resources/" + session.id, {
              data: {
                ...session.data,
                campaign_id: campaign.id,
                agenda: items,
                active_scene_id:
                  items.find((v) => v.state === "active")?.entry_id || "",
              },
              expected_revision: session.revision,
            });
            saved = true;
            await onSaved();
            onClose();
          } catch (e: any) {
            if (saved) {
              onClose();
              ctx.notify(
                "Agenda saved, but refresh failed: " + e.message,
                true,
              );
            } else setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <ErrorBox message={error} />}
        <fieldset disabled={busy} className="session-guide-form-fields">
          <EntryPicker
            label="Add agenda reference"
            value={choice}
            onChange={setChoice}
            entries={ctx.entries.filter(
              (e) =>
                belongsToCampaign(e, campaign.id) &&
                (["campaign-scene", "encounter"].includes(
                  e.data.planning_type,
                ) ||
                  ["note", "task", "quest"].includes(e.kind)) &&
                !items.some((v) => v.entry_id === e.id),
            )}
          />
          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              disabled={!choice}
              onClick={() => {
                add([choice]);
                setChoice("");
              }}
            >
              Add agenda item
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                add(
                  planning
                    .filter((e) =>
                      ["campaign-scene", "encounter"].includes(
                        e.data.planning_type,
                      ),
                    )
                    .map((e) => e.id),
                )
              }
            >
              Add prepared scenes
            </button>
          </div>
          {items.map((item, index) => (
            <article className="agenda-edit-row" key={item.entry_id}>
              <h3>
                {ctx.entries.find((e) => e.id === item.entry_id)?.title ||
                  "Unavailable reference"}
              </h3>
              <label className="field">
                <span>{"Agenda state " + (index + 1)}</span>
                <SearchableSelect
                  value={item.state}
                  onChange={(e) =>
                    setItems(
                      items.map((v, i) =>
                        i === index
                          ? { ...v, state: e.target.value }
                          : e.target.value === "active" && v.state === "active"
                            ? { ...v, state: "paused" }
                            : v,
                      ),
                    )
                  }
                >
                  {agendaStates.map((v) => (
                    <option value={v} key={v}>
                      {human(v)}
                    </option>
                  ))}
                </SearchableSelect>
              </label>
              <label className="field">
                <span>{"Agenda preparation " + (index + 1)}</span>
                <textarea
                  rows={2}
                  value={item.notes}
                  onChange={(e) =>
                    setItems(
                      items.map((v, i) =>
                        i === index ? { ...v, notes: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="text-button"
                  disabled={!index}
                  onClick={() => {
                    const next = [...items];
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    setItems(next);
                  }}
                >
                  Move item up
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                >
                  Remove agenda item
                </button>
              </div>
            </article>
          ))}
        </fieldset>
        <div className="modal-actions">
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
            disabled={busy || items.length > 200}
          >
            Save agenda
          </button>
        </div>
      </form>
    </Modal>
  );
}
