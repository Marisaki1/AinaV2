import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { AppContext, Entry, api, post, docFromText, human } from "./domain";
import { Badge, EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { MapCanvas } from "./Maps";
import { isLocationEntry } from "./domain";

type Guide = {
  map: Entry;
  campaign: { id: string; title: string } | null;
  marker: any;
  location: Entry | null;
  people: {
    entry: Entry;
    relationship: { id: string; kind: string; label: string };
  }[];
  people_total: number;
  records: Entry[];
  record_total: number;
};
const localDay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const prose = (html?: string) => (
  <div
    className="reader-prose map-guide-prose"
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html || "") }}
  />
);

export function MapGuide({
  ctx,
  mapIds,
  mapId: fixedMapId,
  campaignId = "",
  reader = false,
  initialMarkerId = "",
  onNavigate,
}: {
  ctx: AppContext;
  mapIds?: string[];
  mapId?: string;
  campaignId?: string;
  reader?: boolean;
  initialMarkerId?: string;
  onNavigate?: () => void;
}) {
  const maps = ctx.entries.filter(
    (e) => e.kind === "map" && (!mapIds || mapIds.includes(e.id)),
  );
  const [chosen, setChosen] = useState(""),
    [selection, setSelection] = useState({
      map: fixedMapId || "",
      id: initialMarkerId,
    }),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [payload, setPayload] = useState<{
      scope: string;
      projection: string;
      token: string;
      value: Guide;
    } | null>(null),
    [error, setError] = useState<{ token: string; message: string } | null>(
      null,
    ),
    [writing, setWriting] = useState(false),
    [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [type, setType] = useState("note"),
    [day, setDay] = useState(localDay),
    [worldDay, setWorldDay] = useState(""),
    [session, setSession] = useState(""),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState(""),
    [noteCampaign, setNoteCampaign] = useState(campaignId);
  const mapId =
      fixedMapId || maps.find((e) => e.id === chosen)?.id || maps[0]?.id || "",
    markerId = selection.map === mapId ? selection.id : "",
    scope = JSON.stringify([ctx.world.id, mapId, campaignId, reader]),
    projection = JSON.stringify([
      scope,
      ctx.entries.map((e) => [
        e.id,
        e.revision,
        e.published_revision,
        e.visibility,
      ]),
      ctx.edges,
    ]),
    token = JSON.stringify([projection, markerId]);
  useEffect(() => {
    let alive = true;
    if (mapId)
      api<Guide>(
        "/resources/" +
          mapId +
          "/map-guide?" +
          new URLSearchParams({
            ...(campaignId ? { campaign: campaignId } : {}),
            ...(markerId ? { marker: markerId } : {}),
            ...(reader ? { audience: "reader" } : {}),
          }),
      )
        .then((value) => {
          if (alive) {
            setPayload({ scope, projection, token, value });
            setError(null);
          }
        })
        .catch((e) => {
          if (alive) setError({ token, message: e.message });
        });
    return () => {
      alive = false;
    };
  }, [token]);
  if (!mapId)
    return (
      <p className="muted">
        Link or create a map for this campaign to start its visual guide.
      </p>
    );
  const value =
      payload?.scope === scope && (!reader || payload.projection === projection)
        ? payload.value
        : null,
    ready = payload?.token === token;
  const select = (id: string | null) =>
    setSelection({ map: mapId, id: id || "" });
  const markers = (value?.map.data.markers || []).filter((m: any) =>
    (m.label || "").toLowerCase().includes(query.toLowerCase()),
  );
  const focused = value?.map.data.markers?.find((m: any) => m.id === markerId);
  const recordType = (record: Entry) =>
    record.kind === "note" ? record.data.record_type || "note" : record.kind;
  const records = (value?.records || []).filter((e) =>
    category === "all" || category === "progression"
      ? category === "all" ||
        e.data.record_type === "milestone" ||
        e.kind === "quest"
      : category === "journal"
        ? e.data.record_type === "journal"
        : e.kind === category,
  );
  const subject = ready ? value?.location : null;
  return (
    <section className="campaign-map-guide">
      <div className="section-heading">
        <h2>{value?.map.title || "Map guide"}</h2>
        {!reader && campaignId && (
          <button
            className="button secondary small"
            onClick={() =>
              ctx.go(`campaign-continuity/${campaignId}/journeys/all`)
            }
          >
            Campaign journeys
          </button>
        )}
        {!reader && value && (
          <button
            className="button secondary small"
            onClick={() => ctx.go("entry/" + mapId)}
          >
            Edit map & pins
          </button>
        )}
      </div>
      {!fixedMapId && (
        <label className="field">
          <span>Campaign map</span>
          <SearchableSelect
            value={mapId}
            onChange={(e) => {
              setChosen(e.target.value);
              setQuery("");
            }}
          >
            {maps.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </SearchableSelect>
        </label>
      )}
      {error?.token === token && (
        <>
          <ErrorBox message={error.message} />
          {markerId && (
            <button
              className="button secondary small"
              onClick={() => select(null)}
            >
              Clear location selection
            </button>
          )}
        </>
      )}
      {!value ? (
        <p className="muted">Opening map guide…</p>
      ) : (
        <>
          <div className="map-guide-layout">
            <div className="map-guide-canvas">
              <MapCanvas
                asset={ctx.assets.find((a) => a.id === value.map.data.asset_id)}
                assets={ctx.assets}
                data={value.map.data}
                readOnly
                mapKey={scope}
                selectedId={markerId || null}
                onSelect={select}
                focus={focused}
                inspectLinks
              />
              <Field
                label="Find map location"
                value={query}
                onChange={setQuery}
                placeholder="Search map pins and places…"
              />
              <div
                className="map-guide-location-list"
                aria-label="Map guide locations"
              >
                <button
                  className={!markerId ? "active" : ""}
                  onClick={() => select(null)}
                >
                  Map overview
                </button>
                {markers.map((m: any) => (
                  <button
                    key={m.id}
                    data-guide-marker={m.id}
                    className={markerId === m.id ? "active" : ""}
                    onClick={() => select(m.id)}
                  >
                    {m.label || "Unnamed location"}
                    {!reader && m.private ? " · GM only" : ""}
                  </button>
                ))}
                {!markers.length && (
                  <p className="muted">No matching locations.</p>
                )}
              </div>
            </div>
            <aside
              className="map-guide-inspector"
              aria-label="Location guide notes"
            >
              {!ready ? (
                <p className="muted">Opening location notes…</p>
              ) : (
                <>
                  <h3>{value.marker?.label || value.map.title}</h3>
                  {subject && <p className="muted">{subject.title}</p>}
                  {(subject?.summary || (!markerId && value.map.summary)) && (
                    <p>{subject?.summary || value.map.summary}</p>
                  )}
                  {prose(subject?.html || (!markerId ? value.map.html : ""))}
                  {markerId && !subject && (
                    <p className="muted">
                      {value.marker?.link_id
                        ? "The linked entry is unavailable."
                        : "This pin has no linked entry yet. You can still keep notes at this location."}
                    </p>
                  )}
                  {!reader && subject && (
                    <>
                      {isLocationEntry(subject) && (
                        <button
                          className="button secondary small"
                          onClick={() => {
                            onNavigate?.();
                            ctx.go(
                              "locations/" +
                                subject.id +
                                (campaignId ? "/" + campaignId : ""),
                            );
                          }}
                        >
                          View location guide
                        </button>
                      )}
                      <button
                        className="button secondary small"
                        onClick={() => ctx.go("entry/" + subject.id)}
                      >
                        Open location entry & notes
                      </button>
                      {subject.private_notes && (
                        <details>
                          <summary>GM location notes</summary>
                          <p className="campaign-record-excerpt">
                            {subject.private_notes}
                          </p>
                        </details>
                      )}
                    </>
                  )}
                  {value.people.length > 0 && (
                    <>
                      <h4>Characters connected to this place</h4>
                      <div className="map-guide-people">
                        {value.people.map((row) => (
                          <div key={row.relationship.id}>
                            <strong>{row.entry.title}</strong>
                            <small>
                              {row.relationship.label ||
                                human(row.relationship.kind)}
                            </small>
                            {!reader && (
                              <button
                                className="text-button"
                                onClick={() =>
                                  ctx.go(
                                    "characters/" +
                                      row.entry.id +
                                      (campaignId ? "/" + campaignId : ""),
                                  )
                                }
                              >
                                Open character notes
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {value.people_total > 100 && (
                        <p className="muted">
                          Showing 100 of {value.people_total} character
                          connections.
                        </p>
                      )}
                    </>
                  )}
                  {!reader && (
                    <button
                      className="button primary small"
                      onClick={() => {
                        setWriting(true);
                        setTitle("");
                        setText("");
                        setType("note");
                        setDay(localDay());
                        setWorldDay("");
                        setSession("");
                        setNoteCampaign(campaignId);
                        setSaveError("");
                      }}
                    >
                      Write {markerId ? "location" : "map"} note
                    </button>
                  )}
                  <h4>Notes, sessions & progress</h4>
                  <label className="field">
                    <span>Map record filter</span>
                    <SearchableSelect
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {[
                        ["all", "All records"],
                        ["journal", "Daily journal"],
                        ["progression", "Milestones & quests"],
                        ["session", "Sessions"],
                        ["note", "Notes"],
                        ["task", "Tasks"],
                        ["event", "Historical events"],
                      ].map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </SearchableSelect>
                  </label>
                  <div className="map-guide-records">
                    {records.map((record) => (
                      <article key={record.id} data-map-record={record.id}>
                        <div className="section-heading">
                          <strong>{record.title}</strong>
                          <Badge>{human(recordType(record))}</Badge>
                        </div>
                        <p className="small-copy muted">
                          {record.data.world_day || record.data.logged_on || ""}
                          {record.data.progress
                            ? " · " + human(record.data.progress)
                            : ""}
                        </p>
                        {record.summary && <p>{record.summary}</p>}
                        {record.kind === "session" && record.data.recap && (
                          <p className="campaign-record-excerpt">
                            {record.data.recap}
                          </p>
                        )}
                        {prose(record.html)}
                        {!reader && (
                          <button
                            className="text-button"
                            onClick={() => ctx.go("entry/" + record.id)}
                          >
                            Open record
                          </button>
                        )}
                      </article>
                    ))}
                    {!records.length && (
                      <p className="muted">
                        No matching records at this location yet.
                      </p>
                    )}
                    {value.record_total > 200 && (
                      <p className="muted">
                        Showing the latest 200 of {value.record_total} records.
                        Older records remain in your notebook.
                      </p>
                    )}
                  </div>
                </>
              )}
            </aside>
          </div>
        </>
      )}
      {writing && value && (
        <Modal
          title="Write map location note"
          onClose={() => {
            if (!busy) setWriting(false);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy || !title.trim()) return;
              setBusy(true);
              setSaveError("");
              try {
                await post("/worlds/" + ctx.world.id + "/resources", {
                  title,
                  kind: "note",
                  summary: text.slice(0, 240),
                  document: docFromText(text),
                  visibility: "private",
                  parent: noteCampaign || null,
                  data: {
                    campaign_id: noteCampaign,
                    session_id: session,
                    map_id: mapId,
                    marker_id: markerId,
                    related_entries: [
                      ...new Set([mapId, ...(subject ? [subject.id] : [])]),
                    ],
                    record_type: type,
                    logged_on: day,
                    world_day: worldDay,
                  },
                });
                await ctx.refresh();
                setWriting(false);
              } catch (e: any) {
                setSaveError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Location note title"
              value={title}
              onChange={setTitle}
            />
            {!campaignId && (
              <EntryPicker
                label="Campaign for location note"
                value={noteCampaign}
                entries={ctx.entries.filter((e) => e.kind === "campaign")}
                onChange={(value) => {
                  if (value !== noteCampaign) {
                    setNoteCampaign(value);
                    setSession("");
                  }
                }}
                empty="World notebook (no campaign)"
              />
            )}
            <label className="field">
              <span>Location record type</span>
              <SearchableSelect
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="note">Note</option>
                <option value="journal">Daily journal</option>
                <option value="milestone">Progression milestone</option>
              </SearchableSelect>
            </label>
            <div className="field-grid">
              <Field
                label="Journal date"
                type="date"
                value={day}
                onChange={setDay}
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
              <span>Location note text</span>
              <textarea
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            {saveError && <ErrorBox message={saveError} />}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setWriting(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || !title.trim()}
              >
                Save location note
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
