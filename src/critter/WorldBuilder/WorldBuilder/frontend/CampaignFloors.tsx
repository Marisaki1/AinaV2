import React, { useEffect, useState } from "react";
import { api, AppContext, docFromText, Entry, patch, post } from "./domain";
import { EntryPicker, ErrorBox, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { LiveDocument } from "./LiveBlocks";

import { indexFloors, recordIds as ids, useCampaignFloor } from "./FloorScope";

export function CampaignFloors({
  ctx,
  campaign,
  scope,
}: {
  ctx: AppContext;
  campaign: Entry;
  scope: ReturnType<typeof useCampaignFloor>;
}) {
  const { floors, selection, select } = scope;
  const floor = floors.find((entry) => entry.id === selection);
  const [loaded, setLoaded] = useState<Entry | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!floor) return;
    let active = true;
    setLoaded(null);
    setError("");
    api<Entry>("/resources/" + floor.id)
      .then((value) => {
        if (active) setLoaded(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [floor?.id, floor?.revision, retry]);
  const references = ids(floor?.data.floor_entries).flatMap((id) =>
    ctx.entries.filter((entry) => entry.id === id),
  );
  const supporting = ctx.entries.filter(
    (entry) =>
      entry.data.campaign_id === campaign.id && entry.data.campaign_reference,
  );
  return (
    <section className="campaign-floor-desk">
      <div className="campaign-floor-controls">
        <button className="button secondary" onClick={() => setCreating(true)}>
          Add floor
        </button>
      </div>
      {floor ? (
        <>
          <div className="campaign-floor-heading">
            <div>
              <span className="eyebrow">
                {floor.data.floor_status || "Planned"}
              </span>
              <h2>{floor.title}</h2>
            </div>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => setEditing(true)}
              >
                Edit floor details
              </button>
              <button
                className="button secondary"
                onClick={() => ctx.go("entry/" + floor.id)}
              >
                Edit notes
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  ctx.go("relationships/" + campaign.id + "/" + floor.id)
                }
              >
                Floor relationships
              </button>
            </div>
          </div>
          {error ? (
            <>
              <ErrorBox message={error} />
              <button
                className="button secondary"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry floor notes
              </button>
            </>
          ) : loaded?.id === floor.id ? (
            <LiveDocument ctx={ctx} html={loaded.html || ""} />
          ) : (
            <p role="status">Loading floor notes…</p>
          )}
          {references.length > 0 && (
            <section>
              <h3>Linked records</h3>
              <div className="button-row">
                {references.map((entry) => (
                  <button
                    className="button secondary small"
                    key={entry.id}
                    onClick={() => ctx.go(
                      entry.kind === "character" || entry.template === "character"
                        ? `characters/${entry.id}/${campaign.id}`
                        : "entry/" + entry.id,
                    )}
                  >
                    {entry.title}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        floors.length ? (
          selection === "all" ? (
            <div className="campaign-record-list">
              {floors.map((entry) => (
                <button key={entry.id} className="button secondary" onClick={() => select(entry.id)}>
                  {entry.title}
                </button>
              ))}
            </div>
          ) : <p className="muted">Choose a floor to open its notes.</p>
        ) : <p>No floors have been recorded for this campaign.</p>
      )}
      {supporting.length > 0 && (
        <section>
          <h3>Campaign reference</h3>
          <div className="button-row">
            {supporting.map((entry) => (
              <button
                className="button secondary small"
                key={entry.id}
                onClick={() => ctx.go("entry/" + entry.id)}
              >
                {entry.title}
              </button>
            ))}
          </div>
        </section>
      )}
      {(creating || (editing && floor)) && (
        <FloorEditor
          ctx={ctx}
          campaign={campaign}
          floor={creating ? undefined : floor}
          close={() => {
            setCreating(false);
            setEditing(false);
          }}
          saved={(id) => {
            select(id);
            setCreating(false);
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}

function FloorEditor({
  ctx,
  campaign,
  floor,
  close,
  saved,
}: {
  ctx: AppContext;
  campaign: Entry;
  floor?: Entry;
  close: () => void;
  saved: (id: string) => void;
}) {
  const [name, setName] = useState(floor?.title || "");
  const [number, setNumber] = useState(String(floor?.data.floor_number ?? ""));
  const [status, setStatus] = useState(floor?.data.floor_status || "Planned");
  const [notes, setNotes] = useState("");
  const [links, setLinks] = useState(ids(floor?.data.floor_entries));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    const index = Number(number);
    if (
      !name.trim() ||
      !number.trim() ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 999
    )
      return setError("Enter a name and a floor number from 0 to 999.");
    if (
      indexFloors(ctx.entries, campaign.id).floors.some(
        (row) =>
          row.id !== floor?.id && Number(row.data.floor_number) === index,
      )
    )
      return setError("This campaign already has that floor number.");
    setBusy(true);
    setError("");
    try {
      const data = {
        ...floor?.data,
        campaign_id: campaign.id,
        record_type: "campaign-floor",
        floor_number: index,
        floor_status: status,
        floor_entries: links,
      };
      const value = floor
        ? await patch<Entry>("/resources/" + floor.id, {
            title: name,
            data,
            expected_revision: floor.revision,
          })
        : await post<Entry>("/worlds/" + ctx.world.id + "/resources", {
            kind: "note",
            title: name,
            visibility: "private",
            parent: campaign.id,
            data,
            document: docFromText(notes),
          });
      await ctx.refresh();
      saved(value.id);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={floor ? "Edit floor details" : "Add campaign floor"}
      onClose={() => {
        if (!busy) close();
      }}
    >
      {error && <ErrorBox message={error} />}
      <fieldset disabled={busy}>
        <label className="field">
          Floor name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={180}
          />
        </label>
        <label className="field">
          Floor number
          <input
            type="number"
            min="0"
            max="999"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>
        <SearchableSelect
          aria-label="Floor status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["Planned", "Current", "Completed"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </SearchableSelect>
        {!floor && (
          <label className="field">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        )}
        <EntryPicker
          label="Link a record"
          entries={ctx.entries.filter(
            (e) =>
              e.id !== floor?.id &&
              !links.includes(e.id) &&
              !e.data.raw_transcript,
          )}
          value=""
          onChange={(id) => {
            if (id) setLinks([...links, id]);
          }}
        />
        <ul>
          {links.map((id) => (
            <li key={id}>
              {ctx.entries.find((e) => e.id === id)?.title ||
                "Unavailable record"}{" "}
              <button
                className="text-button"
                onClick={() => setLinks(links.filter((value) => value !== id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
      <button
        className="button primary"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Save floor"}
      </button>
    </Modal>
  );
}

export function FloorConnections({ ctx, floor }: { ctx: AppContext; floor: Entry }) {
  const floorEdges = ids(floor.data.floor_connections);
  const active = ctx.edges.filter(
    (edge) =>
      !edge.deleted_at &&
      ctx.entries.some((e) => e.id === edge.source) &&
      ctx.entries.some((e) => e.id === edge.target),
  );
  const titles = new Map(ctx.entries.map((entry) => [entry.id, entry.title]));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  async function change(next: string[]) {
    if (!floor || busy) return;
    setBusy(true);
    setError("");
    try {
      await patch("/resources/" + floor.id, {
        data: { ...floor.data, floor_connections: next },
        expected_revision: floor.revision,
      });
      await ctx.refresh();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  function edgeLabel(edge: (typeof active)[number]) {
    return [
      titles.get(edge.source),
      edge.label || edge.kind,
      titles.get(edge.target),
    ].join(" · ");
  }
  return (
    <section className={editing ? "floor-connection-tools" : undefined}>
      <button
        className="button secondary small"
        aria-expanded={editing}
        onClick={() => setEditing(!editing)}
      >
        Manage floor connections
      </button>
      {error && (
        <>
          <ErrorBox message={error} />
          <button
            className="button secondary"
            onClick={() => void ctx.refresh()}
          >
            Reload records
          </button>
        </>
      )}
      {floor && editing && (
        <fieldset disabled={busy}>
          <SearchableSelect
            aria-label="Add a recorded connection"
            value=""
            onChange={(e) => {
              if (e.target.value) void change([...floorEdges, e.target.value]);
            }}
          >
            <option value="">Link an existing connection to this floor</option>
            {active
              .filter((edge) => !floorEdges.includes(edge.id))
              .map((edge) => (
                <option key={edge.id} value={edge.id}>
                  {edgeLabel(edge)}
                </option>
              ))}
          </SearchableSelect>
          <ul>
            {floorEdges.map((id) => {
              const edge = active.find((item) => item.id === id);
              return (
                <li key={id}>
                  {edge ? edgeLabel(edge) : "Unavailable connection"}{" "}
                  <button
                    className="text-button"
                    onClick={() =>
                      void change(floorEdges.filter((value) => value !== id))
                    }
                  >
                    Remove link
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
    </section>
  );
}
