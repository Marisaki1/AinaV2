import { LinkedPortrait } from "./LinkedPortrait";
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
import { SearchableSelect } from "./SearchableSelect";
import { AffinityDiagram, AffinityGraph } from "./AffinityWeb";
import { MapGuide } from "./MapGuide";
import { belongsToCampaign } from "./CampaignRecords";

type DossierRecord = Entry & {
  dossier_sections: Record<string, string>;
  dossier_association: string;
};
type Dossier = {
  character?: Entry;
  location?: Entry;
  people?: {
    entry: Entry & { portrait_asset_id: string; portrait_url?: string };
    relationships: { id: string; kind: string; label: string }[];
    resident: boolean;
  }[];
  people_total?: number;
  campaign: { id: string; title: string } | null;
  campaigns: Entry[];
  graph: AffinityGraph;
  relationships: {
    id: string;
    source: string;
    target: string;
    source_title: string;
    target_title: string;
    kind: string;
    label: string;
    strength: number;
    notes?: string;
  }[];
  relationship_total: number;
  records: DossierRecord[];
  record_total: number;
  locations: {
    map: Entry;
    asset_id: string;
    marker: any;
    place: Entry | null;
  }[];
  location_total: number;
};
const prose = (html?: string) => (
  <div
    className="reader-prose dossier-prose"
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html || "") }}
  />
);
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const text = (doc: any): string =>
  String(doc?.text || doc?.attrs?.label || "") +
  " " +
  (doc?.content || []).map(text).join(" ");
const tabs = [
  ["overview", "Overview"],
  ["relationships", "Relationship web"],
  ["progression", "Progression"],
  ["sessions", "Sessions & journal"],
  ["places", "Places & maps"],
  ["notes", "All notes"],
];
const sectionLabels: Record<string, string> = {
  prep: "Preparation (GM only)",
  recap: "Session recap",
  consequences: "Consequences (GM only)",
  rewards: "Rewards & progression",
  next_steps: "Follow-up (GM only)",
};

export function CharacterDossier({
  ctx,
  id,
  campaignId = "",
  reader = false,
  locationMode = false,
}: {
  ctx: AppContext;
  id: string;
  campaignId?: string;
  reader?: boolean;
  locationMode?: boolean;
}) {
  const [chosenCampaign, setChosenCampaign] = useState(""),
    [tab, setTab] = useState("overview"),
    [query, setQuery] = useState(""),
    [payload, setPayload] = useState<{
      scope: string;
      token: string;
      value: Dossier;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [writing, setWriting] = useState(false),
    [noteType, setNoteType] = useState("note"),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [worldDay, setWorldDay] = useState(""),
    [loggedOn, setLoggedOn] = useState(today),
    [session, setSession] = useState(""),
    [noteCampaign, setNoteCampaign] = useState(""),
    [linking, setLinking] = useState(false),
    [linkId, setLinkId] = useState(""),
    [map, setMap] = useState<{ id: string; marker: string } | null>(null);
  const noun = locationMode ? "location" : "character";
  const caption = locationMode ? "Location" : "Character";
  const context = campaignId || chosenCampaign,
    scope = JSON.stringify([ctx.world.id, id, context, reader, locationMode]),
    token = JSON.stringify([
      scope,
      ctx.entries.map((e) => [
        e.id,
        e.revision,
        e.published_revision,
        e.visibility,
      ]),
      ctx.edges,
    ]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<Dossier>(
      "/resources/" +
        id +
        (locationMode ? "/location-guide?" : "/dossier?") +
        new URLSearchParams({
          ...(context ? { campaign: context } : {}),
          ...(reader ? { audience: "reader" } : {}),
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
  const value =
      payload?.scope === scope && (!reader || payload.token === token)
        ? payload.value
        : null,
    subject = locationMode ? value?.location : value?.character,
    loading = payload?.token !== token;
  const beginNote = (kind: string) => {
    setNoteType(kind);
    setTitle("");
    setBody("");
    setWorldDay("");
    setLoggedOn(today());
    setSession("");
    setNoteCampaign(context);
    setError("");
    setWriting(true);
  };
  const dirty = !!(
    (writing && (title || body || worldDay || session)) ||
    (linking && linkId)
  );
  const mayClose = () =>
    !busy && (!dirty || confirm("Discard unsaved guide changes?"));
  useEffect(() => {
    if (!writing && !linking) return;
    const previous = saveBeforeNavigate.current;
    const guard = async () => mayClose();
    saveBeforeNavigate.current = guard;
    const before = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      if (saveBeforeNavigate.current === guard)
        saveBeforeNavigate.current = previous;
      window.removeEventListener("beforeunload", before);
    };
  }, [writing, linking, dirty, busy]);
  const matches = (record: DossierRecord) =>
    (
      record.title +
      " " +
      record.summary +
      " " +
      text(record.document) +
      " " +
      (record.data.world_day || "") +
      " " +
      Object.values(record.data)
        .filter((v) => typeof v === "string")
        .join(" ")
    )
      .toLowerCase()
      .includes(query.toLowerCase());
  const progression = (value?.records || []).filter(
    (record) =>
      record.data.record_type === "milestone" ||
      record.kind === "quest" ||
      (record.kind === "session" &&
        (record.data.rewards || record.data.consequences)),
  );
  const sessions = (value?.records || []).filter(
    (record) =>
      record.kind === "session" || record.data.record_type === "journal",
  );
  const open = (record: DossierRecord) =>
    ctx.go((record.kind === "session" ? "sessions/" : "entry/") + record.id);
  const recordCard = (record: DossierRecord) => (
    <article
      className="dossier-record"
      key={record.id}
      data-dossier-record={record.id}
    >
      <div className="section-heading">
        <strong>{record.title}</strong>
        <Badge>{human(record.data.record_type || record.kind)}</Badge>
      </div>
      <p className="muted small-copy">
        {record.data.world_day ||
          record.data.logged_on ||
          (record.kind === "session"
            ? "Session " + (record.data.number || "—")
            : human(record.kind))}
        {record.data.progress ? " · " + human(record.data.progress) : ""} ·{" "}
        {human(record.dossier_association)}
      </p>
      {record.summary &&
        !text(record.document)
          .replace(/\s+/g, " ")
          .trim()
          .startsWith(record.summary.replace(/\s+/g, " ").trim()) && (
          <p>{record.summary}</p>
        )}
      {prose(record.html)}
      {Object.entries(record.dossier_sections || {}).map(([name, html]) =>
        ["prep", "next_steps"].includes(name) ? (
          <details key={name}>
            <summary>{sectionLabels[name]}</summary>
            {prose(html)}
          </details>
        ) : (
          <section key={name}>
            <h4>{sectionLabels[name]}</h4>
            {prose(html)}
          </section>
        ),
      )}
      {!reader && (
        <button className="text-button" onClick={() => open(record)}>
          Open original record
        </button>
      )}
    </article>
  );
  return (
    <section
      className={"character-dossier" + (locationMode ? " location-guide" : "")}
    >
      {error && (
        <>
          <ErrorBox message={error} />
          <button
            className="button secondary small"
            onClick={() => ctx.refresh().catch((e) => setError(e.message))}
          >
            Reload dossier
          </button>
          {!campaignId && context && (
            <button
              className="text-button"
              onClick={() => setChosenCampaign("")}
            >
              Show world context
            </button>
          )}
        </>
      )}
      {!value ? (
        <p className="muted">
          Opening {noun} {locationMode ? "guide" : "dossier"}...
        </p>
      ) : (
        <>
          <header className="dossier-header">
            {ctx.assets.find((a) => a.id === subject!.data.cover_asset)?.url ||
            subject!.data.cover_url ? (
              <img
                className="dossier-portrait"
                src={
                  ctx.assets.find((a) => a.id === subject!.data.cover_asset)
                    ?.url || subject!.data.cover_url
                }
                alt={subject!.title}
              />
            ) : (
              <div
                className="dossier-initials"
                aria-label={caption + " initials"}
              >
                {subject!.title
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join("")}
              </div>
            )}
            <div>
              <p className="eyebrow">
                {locationMode
                  ? "LOCATION & CAMPAIGN NOTES"
                  : "CHARACTER & CAMPAIGN NOTES"}
              </p>
              <h1>{subject!.title}</h1>
              {subject!.summary && <p>{subject!.summary}</p>}
              <p className="muted">
                {value.campaign?.title || "World dossier"} ·{" "}
                {value.relationship_total} relationships · {value.record_total}{" "}
                records
              </p>
              <div className="button-row">
                {!reader && (
                  <>
                    <button
                      className="button secondary small"
                      onClick={() => ctx.go("entry/" + id)}
                    >
                      Edit {noun} & lore
                    </button>
                    <button
                      className="button primary small"
                      onClick={() => beginNote("milestone")}
                    >
                      Record {noun} milestone
                    </button>
                  </>
                )}
                {context && !reader && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      ctx.go(
                        `campaign-continuity/${context}/progression/all/${id}`,
                      )
                    }
                  >
                    Open progression journal
                  </button>
                )}
                {context && !reader && (
                  <button
                    className="text-button"
                    onClick={() => ctx.go("campaigns/" + context)}
                  >
                    Open campaign workspace
                  </button>
                )}
              </div>
            </div>
          </header>
          {!campaignId && (
            <label className="field">
              <span>Dossier campaign context</span>
              <SearchableSelect
                value={chosenCampaign}
                onChange={(e) => setChosenCampaign(e.target.value)}
              >
                <option value="">All world records</option>
                {value.campaigns.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.title}
                  </option>
                ))}
              </SearchableSelect>
            </label>
          )}
          {!reader && (
            <label className="field dossier-portrait-picker">
              <span>
                {locationMode ? "Location image" : "Character portrait"}
              </span>
              <SearchableSelect
                disabled={busy}
                value={subject!.data.cover_asset || ""}
                onChange={async (e) => {
                  setBusy(true);
                  setError("");
                  try {
                    await patch("/resources/" + id, {
                      data: {
                        ...subject!.data,
                        cover_asset: e.target.value,
                        cover_url: "",
                      },
                      expected_revision: subject!.revision,
                    });
                    await ctx.refresh();
                  } catch (error: any) {
                    setError(error.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <option value="">Use initials</option>
                {ctx.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SearchableSelect>
            </label>
          )}
          {!reader && (
            <LinkedPortrait
              value={subject!.data.cover_url || ""}
              disabled={busy}
              onSave={async (url) => {
                await patch("/resources/" + id, {
                  expected_revision: subject!.revision,
                  data: { ...subject!.data, cover_asset: "", cover_url: url },
                });
                await ctx.refresh();
              }}
            />
          )}
          <div
            className="tabs scroll-tabs"
            aria-label={
              locationMode
                ? "Location guide sections"
                : "Character dossier sections"
            }
          >
            {(locationMode
              ? [
                  ["overview", "Overview"],
                  ["relationships", "People & connections"],
                  ["sessions", "Visits & journal"],
                  ["progression", "Changes & progression"],
                  ["places", "Maps & places"],
                  ["notes", "All notes"],
                ]
              : tabs
            ).map(([key, label]) => (
              <button
                className={tab === key ? "active" : ""}
                key={key}
                onClick={() => {
                  setTab(key);
                  setQuery("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {loading && (
            <p className="muted" role="status">
              Updating dossier…
            </p>
          )}
          {tab === "overview" && (
            <div className="dossier-overview">
              <section>
                <h2>Lore & {noun} notes</h2>
                {prose(subject!.html)}
                {Object.keys(subject!.data.fields || {}).length > 0 && (
                  <dl className="dossier-fields">
                    {Object.entries(subject!.data.fields).map(
                      ([name, content]) => (
                        <div key={name}>
                          <dt>{name}</dt>
                          <dd>
                            {typeof content === "object"
                              ? JSON.stringify(content)
                              : String(content ?? "")}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                )}
                {!reader && subject!.private_notes && (
                  <details>
                    <summary>GM {noun} notes</summary>
                    <p className="campaign-record-excerpt">
                      {subject!.private_notes}
                    </p>
                  </details>
                )}
              </section>
              <section>
                <h2>Unresolved threads</h2>
                {value.records
                  .filter(
                    (record) =>
                      ["quest", "task"].includes(record.kind) &&
                      !["done", "failed"].includes(record.data.progress),
                  )
                  .map(recordCard)}
                {!value.records.some(
                  (record) =>
                    ["quest", "task"].includes(record.kind) &&
                    !["done", "failed"].includes(record.data.progress),
                ) && <p className="muted">No linked open quests or tasks.</p>}
                <h2>Latest progression</h2>
                {progression.slice(0, 3).map(recordCard)}
                {!progression.length && (
                  <p className="muted">
                    Record milestones, discoveries or consequences for this
                    {noun}.
                  </p>
                )}
              </section>
            </div>
          )}
          {tab === "relationships" && (
            <>
              {locationMode && (
                <>
                  <h2>Residents & connected people</h2>
                  <p className="muted small-copy">
                    Residence follows an incoming Located in connection. Other
                    connections keep their own labels and direction.
                  </p>
                  <div className="location-people-grid">
                    {(value.people || []).map((row) => {
                      const asset = ctx.assets.find(
                        (a) => a.id === row.entry.portrait_asset_id,
                      );
                      return (
                        <article
                          className="campaign-record-card"
                          key={row.entry.id}
                          data-location-person={row.entry.id}
                        >
                          {(asset || row.entry.portrait_url) && (
                            <img
                              className="session-guide-portrait"
                              src={asset?.url || row.entry.portrait_url}
                              referrerPolicy="no-referrer"
                              alt=""
                            />
                          )}
                          <Badge>
                            {row.resident ? "Resident" : "Connected person"}
                          </Badge>
                          <h3>{row.entry.title}</h3>
                          <p>{row.entry.summary}</p>
                          <p className="small-copy">
                            {row.relationships
                              .map((edge) => edge.label || human(edge.kind))
                              .join(" · ")}
                          </p>
                          {!reader && (
                            <button
                              className="button secondary small"
                              onClick={() =>
                                ctx.go(
                                  "characters/" +
                                    row.entry.id +
                                    (context ? "/" + context : ""),
                                )
                              }
                            >
                              View character dossier
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  {!value.people?.length && (
                    <p className="muted">
                      No people connected yet. Add a Located in relationship
                      from a character to this location to record residence.
                    </p>
                  )}
                  {(value.people_total || 0) > 100 && (
                    <p className="muted">
                      Showing 100 of {value.people_total} connected people.
                    </p>
                  )}
                </>
              )}
              <AffinityDiagram
                ctx={ctx}
                graph={value.graph}
                reader={reader}
                campaignId={context}
              />
              {value.graph.nodes.length === 80 && (
                <p className="muted">
                  The neighbourhood diagram is limited to 80 entries. The
                  connection list retains up to 200 relationships.
                </p>
              )}
              <div className="dossier-relationship-list">
                {value.relationships.map((edge) => (
                  <article key={edge.id}>
                    <strong>
                      {edge.source_title} → {edge.label || human(edge.kind)} →{" "}
                      {edge.target_title}
                    </strong>
                    <small>Directional strength: {edge.strength}</small>
                    {!reader && edge.notes && (
                      <p className="campaign-record-excerpt">{edge.notes}</p>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {["progression", "sessions", "notes"].includes(tab) && (
            <>
              <div className="dossier-record-toolbar">
                <Field
                  label="Find dossier records"
                  value={query}
                  onChange={setQuery}
                />
                {!reader && (
                  <div className="button-row">
                    <button
                      className="button primary small"
                      onClick={() =>
                        beginNote(
                          tab === "progression"
                            ? "milestone"
                            : tab === "sessions"
                              ? "journal"
                              : "note",
                        )
                      }
                    >
                      {tab === "progression"
                        ? "Write progression note"
                        : tab === "sessions"
                          ? "Write " + noun + " journal"
                          : "Write " + noun + " note"}
                    </button>
                    <button
                      className="button secondary small"
                      onClick={() => {
                        setLinkId("");
                        setError("");
                        setLinking(true);
                      }}
                    >
                      Link existing campaign record
                    </button>
                  </div>
                )}
              </div>
              <div className="dossier-timeline">
                {(tab === "progression"
                  ? progression
                  : tab === "sessions"
                    ? sessions
                    : value.records
                )
                  .filter(matches)
                  .map(recordCard)}
              </div>
              {!(
                tab === "progression"
                  ? progression
                  : tab === "sessions"
                    ? sessions
                    : value.records
              ).filter(matches).length && (
                <p className="muted">
                  No matching records. Link an existing record, write a note, or
                  mention the {noun}'s unambiguous name or alias in a session
                  recap.
                </p>
              )}
              {value.record_total > 200 && (
                <p className="muted">
                  Showing the latest 200 of {value.record_total} matching
                  records. All originals remain in the notebook.
                </p>
              )}
            </>
          )}
          {tab === "places" && (
            <>
              <div className="dossier-place-grid">
                {value.locations.map((row) => (
                  <article key={row.map.id + ":" + row.marker.id}>
                    {ctx.assets.find((a) => a.id === row.asset_id) && (
                      <img
                        src={ctx.assets.find((a) => a.id === row.asset_id)!.url}
                        alt={row.map.title}
                      />
                    )}
                    <h3>{row.marker.label || "Map location"}</h3>
                    <p>{row.map.title}</p>
                    {row.place && <p className="muted">{row.place.title}</p>}
                    <button
                      className="button secondary small"
                      onClick={() =>
                        setMap({ id: row.map.id, marker: row.marker.id })
                      }
                    >
                      Inspect place on map
                    </button>
                  </article>
                ))}
              </div>
              {!value.locations.length && (
                <p className="muted">
                  {locationMode
                    ? "Link this location or a connected place to a map pin to see it here."
                    : "Connect this character to a place and link that place to a map pin to see it here."}
                </p>
              )}
              {value.location_total > 100 && (
                <p className="muted">
                  Showing 100 of {value.location_total} map locations.
                </p>
              )}
            </>
          )}
        </>
      )}
      {writing && (
        <Modal
          title={"Write " + noun + " record"}
          onClose={() => {
            if (mayClose()) setWriting(false);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy || !title.trim()) return;
              setBusy(true);
              setError("");
              let saved = false;
              try {
                await post("/worlds/" + ctx.world.id + "/resources", {
                  kind: "note",
                  title,
                  summary: body.slice(0, 240),
                  document: docFromText(body),
                  visibility: "private",
                  parent: noteCampaign || null,
                  data: {
                    campaign_id: noteCampaign,
                    session_id: session,
                    related_entries: [id],
                    record_type: noteType,
                    logged_on: loggedOn,
                    world_day: worldDay,
                  },
                });
                saved = true;
                await ctx.refresh();
                setWriting(false);
              } catch (e: any) {
                if (saved) {
                  setWriting(false);
                  ctx.notify(
                    "Record saved, but the guide could not refresh: " +
                      e.message,
                    true,
                  );
                } else setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy} className="session-guide-form-fields">
              {locationMode && (
                <p className="muted small-copy">
                  Linked to the original location. For a pin-specific note, open
                  its map guide.
                </p>
              )}
              <Field
                label={caption + " record title"}
                value={title}
                onChange={setTitle}
              />
              <label className="field">
                <span>{caption} record type</span>
                <SearchableSelect
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                >
                  <option value="note">Note</option>
                  <option value="journal">Journal</option>
                  <option value="milestone">Progression milestone</option>
                </SearchableSelect>
              </label>
              {!context && (
                <EntryPicker
                  label={"Campaign for " + noun + " record"}
                  value={noteCampaign}
                  entries={ctx.entries.filter((e) => e.kind === "campaign")}
                  onChange={(value) => {
                    setNoteCampaign(value);
                    setSession("");
                  }}
                />
              )}
              <div className="field-grid">
                <Field
                  label="Journal date"
                  type="date"
                  value={loggedOn}
                  onChange={setLoggedOn}
                />
                <Field
                  label="In-world day / chapter"
                  value={worldDay}
                  onChange={setWorldDay}
                />
              </div>
              <EntryPicker
                label="Related session"
                value={session}
                onChange={setSession}
                entries={ctx.entries.filter(
                  (e) =>
                    e.kind === "session" &&
                    (e.data.campaign_id ?? e.parent ?? "") === noteCampaign,
                )}
              />
              <label className="field">
                <span>{caption} record notes</span>
                <textarea
                  rows={7}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>
            </fieldset>
            {error && <ErrorBox message={error} />}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  if (mayClose()) setWriting(false);
                }}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || !title.trim()}
              >
                Save {noun} record
              </button>
            </div>
          </form>
        </Modal>
      )}
      {linking && (
        <Modal
          title={"Link an existing " + noun + " record"}
          onClose={() => {
            if (mayClose()) setLinking(false);
          }}
        >
          <EntryPicker
            label={"Existing " + noun + " record"}
            value={linkId}
            onChange={setLinkId}
            entries={ctx.entries.filter(
              (e) =>
                ["note", "session", "quest", "task"].includes(e.kind) &&
                (!context || belongsToCampaign(e, context)),
            )}
          />
          {error && <ErrorBox message={error} />}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                if (mayClose()) setLinking(false);
              }}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy || !linkId}
              onClick={async () => {
                const record = ctx.entries.find((e) => e.id === linkId);
                if (!record) return;
                setBusy(true);
                try {
                  if (!(record.data.related_entries || []).includes(id))
                    await patch("/resources/" + linkId, {
                      data: {
                        ...record.data,
                        related_entries: [
                          ...(record.data.related_entries || []),
                          id,
                        ],
                      },
                      expected_revision: record.revision,
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
              Save {noun} link
            </button>
          </div>
        </Modal>
      )}
      {map && (
        <Modal
          title={
            locationMode ? "Location map guide" : "Character location guide"
          }
          wide
          onClose={() => setMap(null)}
        >
          <MapGuide
            key={map.id + ":" + map.marker}
            ctx={ctx}
            mapId={map.id}
            campaignId={context}
            reader={reader}
            initialMarkerId={map.marker}
            onNavigate={() => setMap(null)}
          />
        </Modal>
      )}
    </section>
  );
}
