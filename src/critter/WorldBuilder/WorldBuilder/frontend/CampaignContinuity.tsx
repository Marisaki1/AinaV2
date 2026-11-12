import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import {
  AppContext,
  Entry,
  Edge,
  api,
  patch,
  post,
  human,
  isLocationEntry,
} from "./domain";
import { Badge, EntryPicker, ErrorBox, Field } from "./ui";
import { AffinityDiagram, AffinityGraph } from "./AffinityWeb";
import { guideRoute } from "./CampaignWorkbench";
import {
  PartyEditor,
  StockEditor,
  ContinuityRecordEditor,
  DependencyEditor,
  character,
  holderName,
  typeOf,
} from "./ContinuityEditors";
import {
  MediaCollectionEditor,
  SessionMedia,
  SessionWrapUp,
} from "./ContinuityReview";
import { JourneyMap } from "./JourneyMap";
import { SearchableSelect } from "./SearchableSelect";

export type ContinuityData = {
  campaign: Entry;
  session: Entry | null;
  wrapup: Entry | null;
  sessions: Entry[];
  cast: Entry[];
  locations: Entry[];
  items: Entry[];
  media: Entry[];
  quests: Entry[];
  records: Entry[];
  relationships: Edge[];
  followups: Entry[];
  totals: Record<string, number>;
};
const tabs = [
  ["overview", "Continuity overview"],
  ["party", "Party & cast"],
  ["progression", "Character progression"],
  ["inventory", "Equipment & loot"],
  ["quests", "Quest dependencies"],
  ["consequences", "Consequences"],
  ["relationships", "Relationship events"],
  ["journeys", "Map journeys"],
  ["places", "Location status"],
  ["media", "Session media"],
  ["wrapup", "Session wrap-up"],
];
const prose = (html?: string) => (
  <div
    className="reader-prose"
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html || "") }}
  />
);

export function CampaignContinuity({
  ctx,
  id,
  view = "overview",
  sessionId = "",
  initialSource = "",
}: {
  ctx: AppContext;
  id: string;
  view?: string;
  sessionId?: string;
  initialSource?: string;
}) {
  const session = sessionId === "all" ? "" : sessionId,
    scope = JSON.stringify([ctx.world.id, id, session]);
  const [payload, setPayload] = useState<{
      scope: string;
      value: ContinuityData;
    } | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<{
      type: string;
      entry?: Entry;
      connectionId?: string;
    } | null>(null),
    [query, setQuery] = useState(""),
    [person, setPerson] = useState(view === "progression" ? initialSource : ""),
    [role, setRole] = useState("all"),
    [itemFilter, setItemFilter] = useState(""),
    [place, setPlace] = useState(initialSource),
    [busy, setBusy] = useState(false);
  const token = JSON.stringify([
    scope,
    ctx.entries.map((e) => [e.id, e.revision]),
    ctx.edges.map((e) => [e.id, e.revision]),
  ]);
  const endpoint = `/resources/${id}/continuity${session ? "?session=" + session : ""}`;
  useEffect(() => {
    let alive = true;
    setError("");
    api<ContinuityData>(endpoint)
      .then((value) => {
        if (alive) setPayload({ scope, value });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  const refresh = async () => {
    await ctx.refresh();
    const value = await api<ContinuityData>(endpoint);
    setPayload({ scope, value });
  };
  const save = async (body: Record<string, any>) => {
    const result = await post(`/resources/${id}/continuity`, body);
    try {
      await refresh();
    } catch (e: any) {
      ctx.notify(
        "Saved to the database, but the view could not refresh: " + e.message,
        true,
      );
    }
    return result;
  };
  const metadata = async (data: Record<string, any>, entry: Entry) => {
    await patch("/resources/" + entry.id, {
      data,
      expected_revision: entry.revision,
    });
    try {
      await refresh();
    } catch (e: any) {
      ctx.notify(
        "Saved to the database, but refresh failed: " + e.message,
        true,
      );
    }
  };
  const run = async (task: () => Promise<any>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const value = payload?.scope === scope ? payload.value : null;
  if (!value)
    return (
      <div className="page">
        {error ? (
          <ErrorBox message={error} />
        ) : (
          <p role="status">Opening campaign continuity…</p>
        )}
      </div>
    );
  const campaign = value.campaign,
    profiles = campaign.data.party_profiles || [],
    profile = (e: Entry) =>
      profiles.find((p: any) => p.entry_id === e.id) || {
        role: campaign.data.party?.includes(e.id) ? "pc" : "npc",
        goals: "",
        conditions: "",
        notes: "",
        location_id: "",
      };
  const go = (next: string) =>
      ctx.go(`campaign-continuity/${id}/${next}/${session || "all"}`),
    matched = (e: Entry) =>
      (
        e.title +
        " " +
        e.summary +
        " " +
        (e.html || "") +
        " " +
        e.tags.join(" ")
      )
        .toLowerCase()
        .includes(query.toLowerCase());
  const records = value.records.filter(matched),
    roleCast = value.cast.filter(
      (e) => matched(e) && (role === "all" || profile(e).role === role),
    );
  const progression = records
    .filter(
      (e) => typeOf(e) === "progression" || e.data.record_type === "milestone",
    )
    .filter((e) => !person || (e.data.related_entries || []).includes(person));
  const questNodes = value.quests.filter(matched),
    graph: AffinityGraph = {
      nodes: questNodes.map((e) => ({
        id: e.id,
        title: e.title,
        kind: e.kind,
        template: e.template,
        summary:
          (e.data.objectives || [])
            .map((o: any) => (o.done ? "✓ " : "○ ") + o.text)
            .join(" · ") || e.summary,
      })),
      edges: questNodes.flatMap((e) =>
        (e.data.continuity_dependencies || []).map((d: any) => {
          const target = value.quests.find((n) => n.id === d.target_id),
            sourceObjective = e.data.objectives?.find(
              (o: any) => o.id === d.source_objective,
            ),
            targetObjective = target?.data.objectives?.find(
              (o: any) => o.id === d.target_objective,
            );
          return {
            id: `dependency:${e.id}:${d.target_id}:${d.source_objective}:${d.target_objective}`,
            source: d.source_objective
              ? `${e.id}/objective/${d.source_objective}`
              : e.id,
            target: d.target_objective
              ? `${d.target_id}/objective/${d.target_objective}`
              : d.target_id,
            kind: "dependency",
            label:
              [sourceObjective?.text, targetObjective?.text]
                .filter(Boolean)
                .join(" → ") || "Leads to",
            notes: d.notes,
          };
        }),
      ),
      positions: campaign.data.continuity_graph?.positions || {},
      warnings: [],
    };
  const objectiveNodes = questNodes
    .slice(0, 100)
    .flatMap((e) =>
      (e.data.objectives || []).map((o: any) => ({
        id: `${e.id}/objective/${o.id}`,
        entry_id: e.id,
        title: o.text,
        kind: "objective",
        template: "objective",
        summary: `${e.title} · ${o.done ? "Completed" : "Open objective"}`,
      })),
    )
    .slice(0, 100);
  graph.nodes = [...graph.nodes.slice(0, 100), ...objectiveNodes];
  graph.edges.push(
    ...objectiveNodes.map((n) => ({
      id: "objective:" + n.id,
      source: n.entry_id,
      target: n.id,
      kind: "objective",
      label: "Objective",
      notes: n.summary,
    })),
  );
  const recordCard = (e: Entry) => (
    <article
      className="continuity-card"
      key={e.id}
      data-continuity-record={e.id}
    >
      <Badge>{human(typeOf(e))}</Badge>
      {e.data.progression_type && (
        <Badge>{human(e.data.progression_type)}</Badge>
      )}
      {e.data.status_type && <Badge>{human(e.data.status_type)}</Badge>}
      {e.data.impact_status && <Badge>{e.data.impact_status}</Badge>}
      <h3>{e.title}</h3>
      <p className="muted small-copy">
        {value.sessions.find((s) => s.id === e.data.session_id)?.title ||
          "Campaign record"}{" "}
        · {e.data.logged_on || e.updated_at.slice(0, 10)}
      </p>
      {prose(e.html)}
      {e.data.item_id && (
        <p>
          <strong>{holderName(ctx, e.data.item_id)}</strong>: {e.data.quantity}{" "}
          · {e.data.from_holder ? holderName(ctx, e.data.from_holder) : "Added"}{" "}
          → {e.data.to_holder ? holderName(ctx, e.data.to_holder) : "Removed"}
        </p>
      )}
      {e.data.location_id && (
        <p>
          Location: {holderName(ctx, e.data.location_id)}
          {e.data.controlled_by_id
            ? " · Controlled by " + holderName(ctx, e.data.controlled_by_id)
            : ""}
        </p>
      )}
      <div
        className="button-row continuity-related"
        aria-label="Related originals"
      >
        {(e.data.related_entries || []).slice(0, 10).map((sourceId: string) => {
          const source = ctx.entries.find((r) => r.id === sourceId);
          return (
            source && (
              <button
                className="text-button"
                key={source.id}
                onClick={() => ctx.go(guideRoute(source, id))}
              >
                {source.title}
              </button>
            )
          );
        })}
        {(e.data.related_entries || []).length > 10 && (
          <span className="muted">More sources in the original note</span>
        )}
      </div>
      <div className="button-row">
        <button className="text-button" onClick={() => ctx.go("entry/" + e.id)}>
          Open original note
        </button>
        {[
          "progression",
          "consequence",
          "relationship-event",
          "journey",
          "place-status",
        ].includes(typeOf(e)) && (
          <button
            className="button secondary small"
            onClick={() => setEditing({ type: typeOf(e), entry: e })}
          >
            Edit continuity record
          </button>
        )}
      </div>
    </article>
  );
  return (
    <div className="page campaign-continuity" data-continuity-view={view}>
      <header className="workbench-heading">
        <div>
          <p className="eyebrow">PARTY · PLACES · CHANGES · CONTINUITY</p>
          <h1>{campaign.title}</h1>
          <p className="muted">
            Original campaign records, equipment and session consequences
          </p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() =>
              ctx.go(`campaign-flow/${id}/run/${session || "all"}`)
            }
          >
            Prepare / run session
          </button>
          <button
            className="text-button"
            onClick={() => ctx.go("campaigns/" + id)}
          >
            Campaign workspace
          </button>
        </div>
      </header>
      <nav className="tabs scroll-tabs" aria-label="Campaign continuity views">
        {tabs.map(([key, label]) => (
          <button
            className={view === key ? "active" : ""}
            key={key}
            onClick={() => go(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && <ErrorBox message={error} />}
      <div className="workbench-toolbar">
        <EntryPicker
          label="Continuity session"
          value={session}
          onChange={(v) =>
            ctx.go(`campaign-continuity/${id}/${view}/${v || "all"}`)
          }
          entries={value.sessions}
          empty="All sessions / campaign-level"
        />
        <Field
          label="Search continuity records"
          value={query}
          onChange={setQuery}
        />
      </div>
      {view === "overview" && (
        <>
          <section className="panel continuity-situation">
            <h2>Where the party stands</h2>
            <p>
              <strong>Current location:</strong>{" "}
              {campaign.data.party_location_id
                ? holderName(ctx, campaign.data.party_location_id)
                : "Not recorded"}
            </p>
            <p className="campaign-record-excerpt">
              <strong>Goals:</strong>{" "}
              {campaign.data.party_goals || "Not recorded"}
            </p>
            <p className="campaign-record-excerpt">
              <strong>Conditions:</strong>{" "}
              {campaign.data.party_conditions || "Not recorded"}
            </p>
            <button
              className="button secondary"
              onClick={() => setEditing({ type: "party" })}
            >
              Edit party & roles
            </button>
          </section>
          <div className="continuity-card-grid">
            {[
              [
                "party",
                "Active party",
                value.cast.filter((e) =>
                  ["pc", "companion"].includes(profile(e).role),
                ).length,
              ],
              ["inventory", "Equipment originals", value.totals.items],
              [
                "consequences",
                "Unresolved consequences",
                records.filter(
                  (e) =>
                    typeOf(e) === "consequence" &&
                    e.data.impact_status !== "resolved",
                ).length,
              ],
              [
                "journeys",
                "Recorded journeys",
                records.filter((e) => typeOf(e) === "journey").length,
              ],
              [
                "places",
                "Open location situations",
                records.filter(
                  (e) =>
                    typeOf(e) === "place-status" &&
                    e.data.impact_status !== "resolved",
                ).length,
              ],
              ["wrapup", "Campaign follow-ups", value.followups.length],
            ].map(([key, label, count]) => (
              <button
                className="continuity-stat"
                key={key}
                onClick={() => go(String(key))}
              >
                <strong>{count}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <h2>Recent changes & developments</h2>
          <div className="continuity-card-grid">
            {records
              .filter((e) => e.data.continuity_type && typeOf(e) !== "wrap-up")
              .slice(0, 12)
              .map(recordCard)}
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() =>
                ctx.go(`campaign-flow/${id}/followups/${session || "all"}`)
              }
            >
              Open follow-up inbox
            </button>
            <button
              className="button secondary"
              onClick={() =>
                ctx.go(`campaign-desk/${id}/threads/${session || "all"}`)
              }
            >
              Open quest board
            </button>
          </div>
        </>
      )}
      {view === "party" && (
        <>
          <div className="button-row">
            <button
              className="button primary"
              onClick={() => setEditing({ type: "party" })}
            >
              Edit party & roles
            </button>
            <button
              className="button secondary"
              onClick={() => setEditing({ type: "progression" })}
            >
              Record character progression
            </button>
          </div>
          <label className="field">
            <span>Cast role filter</span>
            <SearchableSelect
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {["all", "pc", "npc", "companion", "inactive"].map((v) => (
                <option key={v} value={v}>
                  {human(v)}
                </option>
              ))}
            </SearchableSelect>
          </label>
          <div className="continuity-card-grid">
            {roleCast.map((e) => {
              const p = profile(e),
                image = ctx.assets.find((a) => a.id === e.data.cover_asset),
                loc =
                  p.location_id ||
                  (["pc", "companion"].includes(p.role)
                    ? campaign.data.party_location_id
                    : "");
              return (
                <article
                  className="continuity-card"
                  key={e.id}
                  data-party-member={e.id}
                >
                  {(image || e.data.cover_url) && (
                    <img
                      referrerPolicy="no-referrer"
                      src={image?.url || e.data.cover_url}
                      alt=""
                    />
                  )}
                  <Badge>{human(p.role)}</Badge>
                  <h3>{e.title}</h3>
                  <p>Location: {loc ? holderName(ctx, loc) : "Not recorded"}</p>
                  {["goals", "conditions", "notes"].map(
                    (k) =>
                      p[k] && (
                        <p className="campaign-record-excerpt" key={k}>
                          <strong>{human(k)}:</strong> {p[k]}
                        </p>
                      ),
                  )}
                  <div className="button-row">
                    <button
                      className="button secondary"
                      onClick={() => ctx.go(guideRoute(e, id))}
                    >
                      Open character guide
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        ctx.go(
                          `campaign-continuity/${id}/progression/${session || "all"}/${e.id}`,
                        );
                      }}
                    >
                      Character progression
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {!roleCast.length && (
            <p className="muted">
              No matching cast members. Configure existing world characters to
              add them here.
            </p>
          )}
        </>
      )}
      {view === "progression" && (
        <>
          <button
            className="button primary"
            onClick={() => setEditing({ type: "progression" })}
          >
            Record character progression
          </button>
          <EntryPicker
            label="Progression character"
            value={person}
            onChange={setPerson}
            entries={ctx.entries.filter(character)}
          />
          <div className="progression-journal continuity-journal">
            {progression.map(recordCard)}
          </div>
          {!progression.length && (
            <p className="muted">
              Record milestones, gained abilities and personal developments with
              their original character/session links.
            </p>
          )}
        </>
      )}
      {view === "inventory" && (
        <>
          <div className="button-row">
            <button
              className="button primary"
              onClick={() => setEditing({ type: "award" })}
            >
              Record & distribute loot
            </button>
            <button
              className="button secondary"
              onClick={() => setEditing({ type: "transfer" })}
            >
              Transfer equipment
            </button>
            <button
              className="button secondary"
              onClick={() => setEditing({ type: "adjust" })}
            >
              Adjust stock
            </button>
          </div>
          <EntryPicker
            label="Equipment history filter"
            value={itemFilter}
            onChange={setItemFilter}
            entries={value.items}
          />
          {!!campaign.data.inventory?.length && (
            <section className="panel">
              <h2>Existing shared equipment</h2>
              <ul>
                {campaign.data.inventory.map((i: any, n: number) => (
                  <li key={n}>
                    {i.name}: {i.quantity ?? 1}
                  </li>
                ))}
              </ul>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    save({
                      action: "migrate-inventory",
                      expected_revision: campaign.revision,
                    }),
                  )
                }
              >
                Convert existing equipment (up to 100)
              </button>
              <p className="muted">
                Preserves original values and campaign revision history;
                converted items become individually tracked originals.
              </p>
            </section>
          )}
          <div className="continuity-card-grid">
            {value.items
              .filter((e) => matched(e) && (!itemFilter || e.id === itemFilter))
              .map((e) => (
                <article
                  className="continuity-card"
                  key={e.id}
                  data-equipment-item={e.id}
                >
                  <h3>{e.title}</h3>
                  {prose(e.html)}
                  <strong>
                    Total:{" "}
                    {(e.data.holdings || []).reduce(
                      (n: number, h: any) => n + h.quantity,
                      0,
                    )}
                  </strong>
                  <ul>
                    {e.data.holdings?.map((h: any) => (
                      <li key={h.holder_id}>
                        {holderName(ctx, h.holder_id)}: {h.quantity}
                      </li>
                    ))}
                  </ul>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      onClick={() => setEditing({ type: "transfer", entry: e })}
                    >
                      Transfer this item
                    </button>
                    <button
                      className="text-button"
                      onClick={() => ctx.go("entry/" + e.id)}
                    >
                      Edit original item notes
                    </button>
                  </div>
                </article>
              ))}
          </div>
          <h2>Equipment movement history</h2>
          <div className="progression-journal">
            {records
              .filter(
                (e) =>
                  ["loot", "transfer", "adjustment"].includes(typeOf(e)) &&
                  (!itemFilter || e.data.item_id === itemFilter),
              )
              .map(recordCard)}
          </div>
        </>
      )}
      {view === "quests" && (
        <>
          <p className="notice">
            Connect original quests, objectives, tasks and scenes. Dependencies
            guide preparation; they do not automatically change completion
            states.
          </p>
          {!!questNodes.length && (
            <AffinityDiagram
              ctx={ctx}
              graph={graph}
              campaignId={id}
              sceneMode
              guideTitle="Quest & objective dependencies"
              guideSearchLabel="Find quest or scene"
              busy={busy}
              onPositions={(positions) =>
                run(() =>
                  metadata(
                    {
                      ...campaign.data,
                      continuity_graph: {
                        positions: {
                          ...campaign.data.continuity_graph?.positions,
                          ...positions,
                        },
                      },
                    },
                    campaign,
                  ),
                )
              }
            />
          )}
          <div className="continuity-card-grid">
            {questNodes.map((e) => (
              <article
                className="continuity-card"
                key={e.id}
                data-dependency-source={e.id}
              >
                <h3>{e.title}</h3>
                <Badge>{human(e.data.progress || typeOf(e))}</Badge>
                <ul>
                  {(e.data.objectives || []).map((o: any) => (
                    <li key={o.id}>
                      {o.done ? "✓" : "○"} {o.text}
                    </li>
                  ))}
                </ul>
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() =>
                      setEditing({ type: "dependencies", entry: e })
                    }
                  >
                    Edit quest dependencies
                  </button>
                  <button
                    className="text-button"
                    onClick={() => ctx.go(guideRoute(e, id))}
                  >
                    Open original quest / scene
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {view === "consequences" && (
        <>
          <button
            className="button primary"
            onClick={() => setEditing({ type: "consequence" })}
          >
            Record campaign consequence
          </button>
          <div className="continuity-card-grid">
            {records.filter((e) => typeOf(e) === "consequence").map(recordCard)}
          </div>
        </>
      )}
      {view === "relationships" && (
        <>
          <button
            className="button primary"
            onClick={() => setEditing({ type: "relationship-event" })}
          >
            Record relationship development
          </button>
          <div className="continuity-card-grid">
            {value.relationships.map((edge) => (
              <article
                className="continuity-card"
                key={edge.id}
                data-continuity-relationship={edge.id}
              >
                <h3>
                  {holderName(ctx, edge.source)} →{" "}
                  {holderName(ctx, edge.target)}
                </h3>
                <p>
                  {edge.label || human(edge.kind)} · {edge.strength}
                </p>
                <button
                  className="button secondary"
                  onClick={() =>
                    setEditing({
                      type: "relationship-event",
                      connectionId: edge.id,
                    })
                  }
                >
                  Add development to this relationship
                </button>
                {records
                  .filter((e) => e.data.connection_id === edge.id)
                  .map(recordCard)}
              </article>
            ))}
          </div>
          {records
            .filter(
              (e) =>
                typeOf(e) === "relationship-event" &&
                !value.relationships.some((r) => r.id === e.data.connection_id),
            )
            .map(recordCard)}
        </>
      )}
      {view === "journeys" && (
        <>
          <button
            className="button primary"
            onClick={() => setEditing({ type: "journey" })}
          >
            Draw campaign journey
          </button>
          {records
            .filter((e) => typeOf(e) === "journey")
            .map((e) => (
              <section
                className="panel continuity-route"
                key={e.id}
                data-journey-record={e.id}
              >
                <h2>{e.title}</h2>
                <JourneyMap
                  ctx={ctx}
                  map={ctx.entries.find((m) => m.id === e.data.map_id)}
                  points={e.data.route_points || []}
                />
                <ol>
                  {(e.data.route_points || []).map((p: any, i: number) => (
                    <li key={i}>
                      {p.location_id ? (
                        <button
                          className="text-button"
                          onClick={() => {
                            const place = ctx.entries.find(
                              (n) => n.id === p.location_id,
                            );
                            if (place) ctx.go(guideRoute(place, id));
                          }}
                        >
                          {p.label} · {holderName(ctx, p.location_id)}
                        </button>
                      ) : (
                        p.label
                      )}
                    </li>
                  ))}
                </ol>
                {recordCard(e)}
              </section>
            ))}
        </>
      )}
      {view === "places" && (
        <>
          <button
            className="button primary"
            onClick={() => setEditing({ type: "place-status" })}
          >
            Record location change
          </button>
          <EntryPicker
            label="Location situation filter"
            value={place}
            onChange={setPlace}
            entries={ctx.entries.filter(isLocationEntry)}
          />
          <div className="continuity-card-grid">
            {records
              .filter(
                (e) =>
                  typeOf(e) === "place-status" &&
                  (!place || e.data.location_id === place),
              )
              .map(recordCard)}
          </div>
        </>
      )}
      {view === "media" && (
        <>
          <button
            className="button primary"
            onClick={() => setEditing({ type: "media-collection" })}
          >
            Prepare media collection
          </button>
          {value.media.filter(matched).map((entry) => (
            <SessionMedia
              ctx={ctx}
              entry={entry}
              key={entry.id}
              onEdit={() => setEditing({ type: "media-collection", entry })}
            />
          ))}
        </>
      )}
      {view === "wrapup" &&
        (value.session ? (
          <SessionWrapUp
            key={value.session.id}
            ctx={ctx}
            value={value}
            onSave={save}
          />
        ) : (
          <p className="notice">
            Choose a continuity session to review loot, character progression,
            relationships, consequences and follow-ups together.
          </p>
        ))}
      {Object.entries(value.totals).some(
        ([k, n]) =>
          n >
          ({
            records: 500,
            items: 500,
            quests: 200,
            media: 200,
            cast: 200,
            locations: 200,
          }[k] || 500),
      ) && (
        <p className="notice">
          This view is bounded: {JSON.stringify(value.totals)} total matching
          records. All originals remain available in the world library.
        </p>
      )}
      {editing?.type === "party" && (
        <PartyEditor
          ctx={ctx}
          value={value}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {editing && ["award", "transfer", "adjust"].includes(editing.type) && (
        <StockEditor
          ctx={ctx}
          value={value}
          action={editing.type}
          item={editing.entry}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.type === "dependencies" && editing.entry && (
        <DependencyEditor
          value={value}
          entry={editing.entry}
          onSave={metadata}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.type === "media-collection" && (
        <MediaCollectionEditor
          ctx={ctx}
          value={value}
          entry={editing.entry}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {editing &&
        [
          "progression",
          "consequence",
          "relationship-event",
          "journey",
          "place-status",
        ].includes(editing.type) && (
          <ContinuityRecordEditor
            ctx={ctx}
            value={value}
            type={editing.type}
            entry={editing.entry}
            connectionId={editing.connectionId}
            onSave={save}
            onClose={() => setEditing(null)}
          />
        )}
    </div>
  );
}
