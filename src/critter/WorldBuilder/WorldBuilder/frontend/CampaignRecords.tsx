import React, { useState } from "react";
import { AppContext, Entry, human } from "./domain";
import { EntryPicker, Field } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { ThreadFields } from "./ThreadFields";

export const belongsToCampaign = (entry: Entry, campaign: string) =>
  (entry.data.campaign_id ?? entry.parent) === campaign;

export function RelatedEntries({
  data,
  onData,
  ctx,
  exclude,
}: {
  data: Record<string, any>;
  onData: (value: Record<string, any>) => void;
  ctx: AppContext;
  exclude: string;
}) {
  const [query, setQuery] = useState("");
  const ids: string[] = data.related_entries || [];
  const entries = ctx.entries.filter(
    (e) =>
      e.id !== exclude &&
      e.kind !== "folder" &&
      (e.title + " " + e.summary + " " + e.tags.join(" "))
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="campaign-related">
      <h3>Linked characters, maps & lore</h3>
      <input
        aria-label="Search related campaign entries"
        placeholder="Search characters, maps, places, quests…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="checkbox-list campaign-related-list">
        {entries.map((e) => (
          <label key={e.id}>
            <input
              type="checkbox"
              checked={ids.includes(e.id)}
              onChange={(ev) =>
                onData({
                  ...data,
                  related_entries: ev.target.checked
                    ? [...ids, e.id]
                    : ids.filter((id) => id !== e.id),
                })
              }
            />
            <span>
              {e.title} <small>{human(e.kind)}</small>
            </span>
          </label>
        ))}
        {!entries.length && <p className="muted">No matching entries.</p>}
      </div>
      {ids
        .filter((id) => !ctx.entries.some((e) => e.id === id))
        .map((id) => (
          <p key={id} className="muted">
            Unavailable linked entry{" "}
            <button
              type="button"
              className="text-button"
              onClick={() =>
                onData({
                  ...data,
                  related_entries: ids.filter((v) => v !== id),
                })
              }
            >
              Remove unavailable link
            </button>
          </p>
        ))}
    </section>
  );
}

export function CampaignRecordDetails({
  entry,
  data,
  onData,
  ctx,
  hideThreadFields = false,
}: {
  entry: Entry;
  data: Record<string, any>;
  onData: (value: Record<string, any>) => void;
  ctx: AppContext;
  hideThreadFields?: boolean;
}) {
  const update = (key: string, value: any) => onData({ ...data, [key]: value });
  const campaign =
    data.campaign_id ??
    (ctx.entries.find((e) => e.id === entry.parent)?.kind === "campaign"
      ? entry.parent
      : "");
  const linkedMap = ctx.entries.find(
    (e) => e.id === data.map_id && e.kind === "map",
  );
  const text = (label: string, key: string) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <textarea
        rows={4}
        value={data[key] || ""}
        onChange={(e) => update(key, e.target.value)}
      />
    </label>
  );
  return (
    <div className="campaign-record-details">
      {["quest", "task"].includes(entry.kind) && !hideThreadFields && (
        <ThreadFields data={data} onData={onData} />
      )}
      {campaign && entry.kind !== "campaign" && (
        <button
          className="text-button"
          onClick={() => ctx.go("campaigns/" + campaign)}
        >
          Open campaign workspace
        </button>
      )}
      {entry.kind !== "campaign" && (
        <div className="field-grid">
          <EntryPicker
            label="Related quest or task"
            value={data.thread_id || ""}
            entries={ctx.entries.filter(
              (e) =>
                e.id !== entry.id &&
                ["quest", "task"].includes(e.kind) &&
                belongsToCampaign(e, campaign || ""),
            )}
            onChange={(v) => update("thread_id", v)}
          />
          {!["session", "quest"].includes(entry.kind) && (
            <EntryPicker
              label="Campaign"
              value={campaign || ""}
              entries={ctx.entries.filter((e) => e.kind === "campaign")}
              onChange={(value) => {
                if (value !== (campaign || ""))
                  onData({ ...data, campaign_id: value, session_id: "" });
              }}
            />
          )}
          <EntryPicker
            label="Related session"
            value={data.session_id || ""}
            entries={ctx.entries.filter(
              (e) =>
                e.kind === "session" &&
                e.id !== entry.id &&
                belongsToCampaign(e, campaign || ""),
            )}
            onChange={(v) =>
              onData({ ...data, campaign_id: campaign || "", session_id: v })
            }
          />
        </div>
      )}
      {entry.kind === "session" && (
        <>
          <label className="field">
            <span>Session status</span>
            <SearchableSelect
              value={data.session_status || "planned"}
              onChange={(e) => update("session_status", e.target.value)}
            >
              {["planned", "in_progress", "completed", "cancelled"].map((v) => (
                <option key={v} value={v}>
                  {human(v)}
                </option>
              ))}
            </SearchableSelect>
          </label>
          {text("Preparation (GM only)", "prep")}
          {text("Session recap", "recap")}
          {text("Consequences & world changes (GM only)", "consequences")}
          {text("Rewards & progression", "rewards")}
          {text("Next session follow-up (GM only)", "next_steps")}
        </>
      )}
      {data.session_id &&
        !ctx.entries.some(
          (e) =>
            e.id === data.session_id &&
            e.kind === "session" &&
            belongsToCampaign(e, campaign || ""),
        ) && (
          <p className="notice">
            The recorded session is unavailable or belongs to another campaign.
            Its saved link is retained until you change it.
          </p>
        )}
      {entry.kind !== "campaign" && (
        <div className="field-grid">
          <EntryPicker
            label="Linked campaign map"
            value={data.map_id || ""}
            entries={ctx.entries.filter((e) => e.kind === "map")}
            onChange={(value) => {
              if (value !== (data.map_id || ""))
                onData({ ...data, map_id: value, marker_id: "" });
            }}
          />
          <label className="field">
            <span>Linked map location</span>
            <SearchableSelect
              disabled={!linkedMap}
              value={data.marker_id || ""}
              onChange={(e) => update("marker_id", e.target.value)}
            >
              <option value="">Whole map</option>
              {data.marker_id &&
                !linkedMap?.data.markers?.some(
                  (m: any) => m.id === data.marker_id,
                ) && (
                  <option value={data.marker_id}>
                    Unavailable recorded location
                  </option>
                )}
              {(linkedMap?.data.markers || []).map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.label || "Unnamed location"}
                </option>
              ))}
            </SearchableSelect>
          </label>
        </div>
      )}
      {entry.kind === "note" && (
        <div className="field-grid">
          <label className="field">
            <span>Campaign record type</span>
            <SearchableSelect
              value={data.record_type || "note"}
              onChange={(e) => update("record_type", e.target.value)}
            >
              <option value="note">Note</option>
              <option value="journal">Day-to-day journal</option>
              <option value="milestone">Progression / milestone</option>
            </SearchableSelect>
          </label>
          <Field
            label="Journal date"
            type="date"
            value={data.logged_on || ""}
            onChange={(v) => update("logged_on", v)}
          />
          <Field
            label="In-world day / chapter"
            value={data.world_day || ""}
            onChange={(v) => update("world_day", v)}
          />
        </div>
      )}
      <RelatedEntries
        data={data}
        onData={onData}
        ctx={ctx}
        exclude={entry.id}
      />
    </div>
  );
}
