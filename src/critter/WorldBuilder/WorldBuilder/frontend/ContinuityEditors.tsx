import React, { useEffect, useState } from "react";
import {
  AppContext,
  Entry,
  human,
  isLocationEntry,
  saveBeforeNavigate,
  text as docText,
} from "./domain";
import { EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { RelatedEntries } from "./CampaignRecords";
import { JourneyMap, Waypoint } from "./JourneyMap";
import type { ContinuityData } from "./CampaignContinuity";

export type ContinuitySave = (payload: Record<string, any>) => Promise<any>;
export const character = (e: Entry) =>
  e.kind === "character" ||
  (e.kind === "article" && e.template === "character");
export const holderName = (ctx: AppContext, id: string) =>
  id === "party"
    ? "Party storage"
    : ctx.entries.find((e) => e.id === id)?.title || "Unavailable original";
export const typeOf = (e: Entry) =>
  e.data.continuity_type || e.data.planning_type || e.kind;
export function useContinuityGuard(dirty: boolean, busy: boolean) {
  const close = () =>
    !busy && (!dirty || confirm("Discard unsaved campaign changes?"));
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
  return close;
}
export function ContinuityForm({
  title,
  dirty,
  onClose,
  onSubmit,
  children,
  submit = "Save campaign changes",
  disabled = false,
}: {
  title: string;
  dirty: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  children: React.ReactNode;
  submit?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const close = useContinuityGuard(dirty, busy);
  return (
    <Modal
      title={title}
      wide
      onClose={() => {
        if (close()) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || disabled) return;
          setBusy(true);
          setError("");
          try {
            await onSubmit();
            onClose();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && (
          <>
            <ErrorBox message={error} />
            <p className="muted small-copy">
              Your draft remains here. A rejected action changes no inventory or
              relationship records.
            </p>
          </>
        )}
        <fieldset disabled={busy} className="session-guide-form-fields">
          {children}
        </fieldset>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              if (close()) onClose();
            }}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy || disabled}>
            {busy ? "Saving…" : submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <SearchableSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((v) => (
          <option key={v} value={v}>
            {human(v)}
          </option>
        ))}
      </SearchableSelect>
    </label>
  );
}
export function LongField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        aria-label={label}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function HolderPicker({
  ctx,
  label,
  value,
  onChange,
}: {
  ctx: AppContext;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <SearchableSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="party">Party storage</option>
        {ctx.entries
          .filter((e) => character(e) || isLocationEntry(e))
          .map((e) => (
            <option value={e.id} key={e.id}>
              {e.title}
            </option>
          ))}
        {value !== "party" && !ctx.entries.some((e) => e.id === value) && (
          <option value={value}>Unavailable recorded holder</option>
        )}
      </SearchableSelect>
    </label>
  );
}

export function PartyEditor({
  ctx,
  value,
  onSave,
  onClose,
}: {
  ctx: AppContext;
  value: ContinuityData;
  onSave: ContinuitySave;
  onClose: () => void;
}) {
  const [base] = useState(value.campaign),
    [profiles, setProfiles] = useState<any[]>(() =>
      structuredClone(value.campaign.data.party_profiles || []),
    ),
    [choice, setChoice] = useState(""),
    [location, setLocation] = useState(base.data.party_location_id || ""),
    [goals, setGoals] = useState(base.data.party_goals || ""),
    [conditions, setConditions] = useState(base.data.party_conditions || "");
  const dirty =
    JSON.stringify(profiles) !==
      JSON.stringify(base.data.party_profiles || []) ||
    location !== (base.data.party_location_id || "") ||
    goals !== (base.data.party_goals || "") ||
    conditions !== (base.data.party_conditions || "");
  const update = (i: number, k: string, v: string) =>
    setProfiles(profiles.map((p, j) => (i === j ? { ...p, [k]: v } : p)));
  return (
    <ContinuityForm
      title="Party, cast roles & current situation"
      dirty={dirty}
      onClose={onClose}
      onSubmit={() =>
        onSave({
          action: "party",
          expected_revision: base.revision,
          profiles,
          location_id: location,
          goals,
          conditions,
        })
      }
    >
      <EntryPicker
        label="Current party location"
        value={location}
        onChange={setLocation}
        entries={ctx.entries.filter(isLocationEntry)}
      />
      <LongField label="Party goals" value={goals} onChange={setGoals} />
      <LongField
        label="Party conditions & situation"
        value={conditions}
        onChange={setConditions}
      />
      <EntryPicker
        label="Character to configure"
        value={choice}
        onChange={setChoice}
        entries={ctx.entries.filter(
          (e) => character(e) && !profiles.some((p) => p.entry_id === e.id),
        )}
      />
      <button
        type="button"
        className="button secondary"
        disabled={!choice}
        onClick={() => {
          setProfiles([
            ...profiles,
            {
              entry_id: choice,
              role: base.data.party?.includes(choice) ? "pc" : "npc",
              location_id: "",
              goals: "",
              conditions: "",
              notes: "",
            },
          ]);
          setChoice("");
        }}
      >
        Configure cast member
      </button>
      {profiles.map((p, i) => (
        <article className="continuity-edit-card" key={p.entry_id}>
          <h3>{holderName(ctx, p.entry_id)}</h3>
          <SelectField
            label={`Role: ${holderName(ctx, p.entry_id)}`}
            value={p.role}
            onChange={(v) => update(i, "role", v)}
            options={["pc", "npc", "companion", "inactive"]}
          />
          <EntryPicker
            label={`Location: ${holderName(ctx, p.entry_id)}`}
            value={p.location_id}
            onChange={(v) => update(i, "location_id", v)}
            entries={ctx.entries.filter(isLocationEntry)}
            empty="Active party uses party location; otherwise not recorded"
          />
          {["goals", "conditions", "notes"].map((k) => (
            <LongField
              key={k}
              label={`${human(k)}: ${holderName(ctx, p.entry_id)}`}
              value={p[k]}
              onChange={(v) => update(i, k, v)}
            />
          ))}
          <button
            type="button"
            className="text-button"
            onClick={() => setProfiles(profiles.filter((_, j) => i !== j))}
          >
            Remove campaign profile
          </button>
        </article>
      ))}
      <p className="muted">
        PCs and companions join the active party. NPCs and inactive characters
        retain their original lore and history. Existing party members without a
        profile remain PCs.
      </p>
    </ContinuityForm>
  );
}

export function StockEditor({
  ctx,
  value,
  action,
  item,
  onSave,
  onClose,
}: {
  ctx: AppContext;
  value: ContinuityData;
  action: string;
  item?: Entry;
  onSave: ContinuitySave;
  onClose: () => void;
}) {
  const [baseCampaign] = useState(value.campaign),
    [items] = useState(value.items),
    [selected, setSelected] = useState(item?.id || ""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [quantity, setQuantity] = useState(1),
    [from, setFrom] = useState(
      item?.data.holdings?.find((h: any) => h.quantity > 0)?.holder_id ||
        "party",
    ),
    [to, setTo] = useState("party"),
    [direction, setDirection] = useState("add"),
    [reason, setReason] = useState(""),
    [notes, setNotes] = useState("");
  const current = items.find((e) => e.id === selected);
  return (
    <ContinuityForm
      title={
        action === "award"
          ? "Record & distribute loot"
          : action === "transfer"
            ? "Transfer equipment"
            : "Adjust stock with history"
      }
      dirty={
        !!(
          selected !== (item?.id || "") ||
          title ||
          description ||
          reason ||
          notes ||
          quantity !== 1 ||
          from !==
            (item?.data.holdings?.find((h: any) => h.quantity > 0)?.holder_id ||
              "party") ||
          direction !== "add" ||
          to !== "party"
        )
      }
      onClose={onClose}
      submit={
        action === "award"
          ? "Record loot"
          : action === "transfer"
            ? "Commit transfer"
            : "Record adjustment"
      }
      disabled={
        (action !== "award" && !current) ||
        (!selected && !title.trim()) ||
        quantity < 1
      }
      onSubmit={() =>
        onSave({
          action,
          campaign_revision: baseCampaign.revision,
          item_id: selected,
          expected_revision: current?.revision,
          title,
          description,
          quantity,
          from_holder: from,
          to_holder: to,
          direction,
          reason,
          notes,
          session_id: value.session?.id || "",
        })
      }
    >
      <EntryPicker
        label="Equipment item"
        value={selected}
        onChange={setSelected}
        entries={items}
        empty={action === "award" ? "Create a new item" : "Choose an item"}
      />
      {!selected && action === "award" && (
        <>
          <Field label="New item name" value={title} onChange={setTitle} />
          <LongField
            label="New item description"
            value={description}
            onChange={setDescription}
          />
        </>
      )}
      {current && (
        <ul>
          {current.data.holdings?.map((h: any) => (
            <li key={h.holder_id}>
              {holderName(ctx, h.holder_id)}: {h.quantity}
            </li>
          ))}
        </ul>
      )}
      <Field
        label="Movement quantity"
        value={quantity}
        onChange={setQuantity}
        type="number"
        min={1}
        max={1000000}
      />
      {action === "adjust" && (
        <SelectField
          label="Adjustment direction"
          value={direction}
          onChange={setDirection}
          options={["add", "remove"]}
        />
      )}
      {(action === "transfer" ||
        (action === "adjust" && direction === "remove")) && (
        <HolderPicker
          ctx={ctx}
          label="Source holder"
          value={from}
          onChange={setFrom}
        />
      )}
      {(action !== "adjust" || direction === "add") && (
        <HolderPicker
          ctx={ctx}
          label="Recipient / storage"
          value={to}
          onChange={setTo}
        />
      )}
      <Field label="Movement reason" value={reason} onChange={setReason} />
      <LongField label="Movement notes" value={notes} onChange={setNotes} />
      <p className="notice">
        Stock and its private movement history save together in the database.
        Transfers preserve the same original item. Session:{" "}
        {value.session?.title || "Campaign-level record"}.
      </p>
    </ContinuityForm>
  );
}

export function ContinuityRecordEditor({
  ctx,
  value,
  type,
  entry,
  onSave,
  onClose,
  connectionId = "",
}: {
  ctx: AppContext;
  value: ContinuityData;
  type: string;
  entry?: Entry;
  onSave: ContinuitySave;
  onClose: () => void;
  connectionId?: string;
}) {
  const [base] = useState(entry),
    [title, setTitle] = useState(entry?.title || ""),
    [initialText] = useState(docText(entry?.document).trim()),
    [body, setBody] = useState(initialText),
    [data, setData] = useState<Record<string, any>>(() =>
      structuredClone(
        entry?.data || {
          campaign_id: value.campaign.id,
          session_id: value.session?.id || "",
          related_entries: [],
          ...(type === "relationship-event"
            ? { connection_id: connectionId }
            : {}),
          ...(type === "progression" ? { progression_type: "milestone" } : {}),
          ...(["consequence", "place-status"].includes(type)
            ? { impact_status: "open" }
            : {}),
          ...(type === "place-status" ? { status_type: "discovery" } : {}),
        },
      ),
    ),
    [initialData] = useState(() => JSON.stringify(data)),
    [change, setChange] = useState(false),
    [edgeBase] = useState(value.relationships),
    [strength, setStrength] = useState(0),
    [edgeLabel, setEdgeLabel] = useState("");
  const update = (k: string, v: any) => setData({ ...data, [k]: v }),
    edge = edgeBase.find((e) => e.id === data.connection_id),
    map = ctx.entries.find((e) => e.id === data.map_id);
  const dirty =
    title !== (base?.title || "") ||
    body !== initialText ||
    JSON.stringify(data) !== initialData ||
    change;
  return (
    <ContinuityForm
      title={(entry ? "Edit " : "Record ") + human(type)}
      dirty={dirty}
      onClose={onClose}
      disabled={
        !title.trim() ||
        (type === "relationship-event" && !edge) ||
        (type === "journey" && !data.map_id) ||
        (type === "place-status" && !data.location_id)
      }
      onSubmit={() =>
        onSave({
          action: "record",
          type,
          entry_id: base?.id,
          expected_revision: base?.revision,
          title,
          ...(!base || body !== initialText ? { text: body } : {}),
          data: {
            ...data,
            ...(type === "consequence"
              ? { affected_entries: data.related_entries || [] }
              : {}),
          },
          ...(change && edge
            ? {
                relationship_change: {
                  expected_revision: edge.revision,
                  strength,
                  label: edgeLabel,
                },
              }
            : {}),
        })
      }
    >
      <Field
        label="Continuity record title"
        value={title}
        onChange={setTitle}
      />
      <EntryPicker
        label="Origin session"
        value={data.session_id || ""}
        onChange={(v) => update("session_id", v)}
        entries={value.sessions}
      />
      {type === "progression" && (
        <SelectField
          label="Progression category"
          value={data.progression_type || "milestone"}
          onChange={(v) => update("progression_type", v)}
          options={["milestone", "ability", "development"]}
        />
      )}
      {["consequence", "place-status"].includes(type) && (
        <SelectField
          label="Situation status"
          value={data.impact_status || "open"}
          onChange={(v) => update("impact_status", v)}
          options={["open", "resolved"]}
        />
      )}
      {type === "place-status" && (
        <>
          <EntryPicker
            label="Affected location"
            value={data.location_id || ""}
            onChange={(v) => update("location_id", v)}
            entries={ctx.entries.filter(isLocationEntry)}
          />
          <SelectField
            label="Location status category"
            value={data.status_type || "discovery"}
            onChange={(v) => update("status_type", v)}
            options={["discovery", "threat", "control", "business"]}
          />
          {data.status_type === "control" && (
            <EntryPicker
              label="Controlled by"
              value={data.controlled_by_id || ""}
              onChange={(v) => update("controlled_by_id", v)}
              entries={ctx.entries.filter((e) => e.kind !== "folder")}
            />
          )}
        </>
      )}
      {type === "relationship-event" && (
        <>
          <label className="field">
            <span>Relationship source</span>
            <SearchableSelect
              value={data.connection_id || ""}
              onChange={(e) => {
                update("connection_id", e.target.value);
                setChange(false);
              }}
            >
              <option value="">Choose relationship</option>
              {edgeBase.map((e) => (
                <option key={e.id} value={e.id}>
                  {holderName(ctx, e.source)} → {e.label || human(e.kind)} →{" "}
                  {holderName(ctx, e.target)}
                </option>
              ))}
            </SearchableSelect>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={change}
              onChange={(e) => {
                setChange(e.target.checked);
                setStrength(edge?.strength || 0);
                setEdgeLabel(edge?.label || "");
              }}
            />
            Update the relationship together with this event
          </label>
          {change && (
            <>
              <Field
                label="Updated relationship label"
                value={edgeLabel}
                onChange={setEdgeLabel}
              />
              <Field
                label="Updated relationship strength"
                type="number"
                min={-100}
                max={100}
                value={strength}
                onChange={setStrength}
              />
            </>
          )}
        </>
      )}
      {type === "journey" && (
        <>
          <EntryPicker
            label="Journey map"
            value={data.map_id || ""}
            onChange={(v) => setData({ ...data, map_id: v, route_points: [] })}
            entries={ctx.entries.filter((e) => e.kind === "map")}
          />
          <JourneyMap
            ctx={ctx}
            map={map}
            points={data.route_points || []}
            onAdd={(p) =>
              update("route_points", [...(data.route_points || []), p])
            }
          />
          <button
            type="button"
            className="button secondary"
            disabled={!map || (data.route_points || []).length >= 200}
            onClick={() =>
              update("route_points", [
                ...(data.route_points || []),
                {
                  x: 0.5,
                  y: 0.5,
                  label: `Stop ${(data.route_points || []).length + 1}`,
                  location_id: "",
                },
              ])
            }
          >
            Add waypoint
          </button>
          {(data.route_points || []).map((p: Waypoint, i: number) => (
            <article className="continuity-edit-card" key={i}>
              <h3>Stop {i + 1}</h3>
              <Field
                label={`Waypoint label ${i + 1}`}
                value={p.label}
                onChange={(v) =>
                  update(
                    "route_points",
                    data.route_points.map((q: Waypoint, j: number) =>
                      i === j ? { ...q, label: v } : q,
                    ),
                  )
                }
              />
              <EntryPicker
                label={`Waypoint location ${i + 1}`}
                value={p.location_id}
                onChange={(v) =>
                  update(
                    "route_points",
                    data.route_points.map((q: Waypoint, j: number) =>
                      i === j ? { ...q, location_id: v } : q,
                    ),
                  )
                }
                entries={ctx.entries.filter(isLocationEntry)}
              />
              <div className="field-grid">
                <Field
                  label={`Waypoint X ${i + 1}`}
                  type="number"
                  step="any"
                  min={0}
                  max={100}
                  value={Math.round(p.x * 10000) / 100}
                  onChange={(v) =>
                    update(
                      "route_points",
                      data.route_points.map((q: Waypoint, j: number) =>
                        i === j ? { ...q, x: v / 100 } : q,
                      ),
                    )
                  }
                />
                <Field
                  label={`Waypoint Y ${i + 1}`}
                  type="number"
                  step="any"
                  min={0}
                  max={100}
                  value={Math.round(p.y * 10000) / 100}
                  onChange={(v) =>
                    update(
                      "route_points",
                      data.route_points.map((q: Waypoint, j: number) =>
                        i === j ? { ...q, y: v / 100 } : q,
                      ),
                    )
                  }
                />
              </div>
              <button
                type="button"
                className="text-button"
                disabled={!i}
                onClick={() => {
                  const next = [...data.route_points];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  update("route_points", next);
                }}
              >
                Move waypoint up
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  update(
                    "route_points",
                    data.route_points.filter((_: any, j: number) => i !== j),
                  )
                }
              >
                Remove waypoint
              </button>
            </article>
          ))}
        </>
      )}
      <LongField label="Continuity notes" value={body} onChange={setBody} />
      <RelatedEntries
        ctx={ctx}
        data={data}
        onData={setData}
        exclude={entry?.id || value.campaign.id}
      />
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={["open", "scheduled"].includes(data.follow_up_state)}
          onChange={(e) =>
            update("follow_up_state", e.target.checked ? "open" : "")
          }
        />
        Needs campaign follow-up
      </label>
      {entry && (
        <p className="muted small-copy">
          Metadata-only saves preserve original rich notes. Edit the note text
          here to replace it with plain paragraphs, or use the original editor
          for rich formatting.
        </p>
      )}
    </ContinuityForm>
  );
}

export function DependencyEditor({
  value,
  entry,
  onSave,
  onClose,
}: {
  value: ContinuityData;
  entry: Entry;
  onSave: (data: Record<string, any>, entry: Entry) => Promise<void>;
  onClose: () => void;
}) {
  const [base] = useState(entry),
    [dependencies, setDependencies] = useState<any[]>(() =>
      structuredClone(entry.data.continuity_dependencies || []),
    );
  const choices = value.quests.filter((e) => e.id !== base.id);
  const update = (i: number, k: string, v: string) =>
    setDependencies(
      dependencies.map((d, j) =>
        i === j
          ? {
              ...d,
              [k]: v,
              ...(k === "target_id" ? { target_objective: "" } : {}),
            }
          : d,
      ),
    );
  return (
    <ContinuityForm
      title="Quest, objective & scene dependencies"
      dirty={
        JSON.stringify(dependencies) !==
        JSON.stringify(base.data.continuity_dependencies || [])
      }
      onClose={onClose}
      onSubmit={() =>
        onSave({ ...base.data, continuity_dependencies: dependencies }, base)
      }
    >
      <h3>{base.title}</h3>
      <p>
        Arrows express preparation guidance. Objective completion and quest
        status remain deliberate choices.
      </p>
      {dependencies.map((d, i) => (
        <article className="continuity-edit-card" key={i}>
          <EntryPicker
            label={`Dependency target ${i + 1}`}
            value={d.target_id}
            onChange={(v) => update(i, "target_id", v)}
            entries={choices}
          />
          {[
            ["source_objective", base],
            ["target_objective", choices.find((e) => e.id === d.target_id)],
          ].map(([key, row]: any) => (
            <label className="field" key={key}>
              <span>{`${human(key)} ${i + 1}`}</span>
              <SearchableSelect
                value={d[key]}
                onChange={(e) => update(i, key, e.target.value)}
              >
                <option value="">Whole original</option>
                {(row?.data.objectives || []).map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.text}
                    {o.done ? " · complete" : ""}
                  </option>
                ))}
              </SearchableSelect>
            </label>
          ))}
          <LongField
            label={`Dependency guidance ${i + 1}`}
            value={d.notes}
            onChange={(v) => update(i, "notes", v)}
          />
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setDependencies(dependencies.filter((_, j) => i !== j))
            }
          >
            Remove dependency
          </button>
        </article>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={!choices.length || dependencies.length >= 100}
        onClick={() =>
          setDependencies([
            ...dependencies,
            {
              target_id: choices[0]?.id || "",
              source_objective: "",
              target_objective: "",
              notes: "",
            },
          ])
        }
      >
        Add dependency
      </button>
    </ContinuityForm>
  );
}
