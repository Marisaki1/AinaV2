import React, { useEffect, useState } from "react";
import { AppContext, Entry, human } from "./domain";
import { EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { HandoutView } from "./HandoutView";
import {
  ContinuityForm,
  ContinuitySave,
  LongField,
  SelectField,
  typeOf,
  useContinuityGuard,
} from "./ContinuityEditors";
import type { ContinuityData } from "./CampaignContinuity";

export function MediaCollectionEditor({
  ctx,
  value,
  entry,
  onSave,
  onClose,
}: {
  ctx: AppContext;
  value: ContinuityData;
  entry?: Entry;
  onSave: ContinuitySave;
  onClose: () => void;
}) {
  const [base] = useState(entry),
    [title, setTitle] = useState(entry?.title || ""),
    [session, setSession] = useState(
      entry?.data.session_id || value.session?.id || "",
    ),
    [items, setItems] = useState<any[]>(() =>
      structuredClone(entry?.data.collection_items || []),
    ),
    [source, setSource] = useState(""),
    [asset, setAsset] = useState(""),
    [category, setCategory] = useState("illustration"),
    [caption, setCaption] = useState("");
  const dirty =
    title !== (base?.title || "") ||
    session !== (base?.data.session_id || value.session?.id || "") ||
    JSON.stringify(items) !==
      JSON.stringify(base?.data.collection_items || []) ||
    !!source ||
    !!asset ||
    !!caption;
  return (
    <ContinuityForm
      title={
        entry
          ? "Edit session media collection"
          : "Prepare session media collection"
      }
      dirty={dirty}
      disabled={!title.trim()}
      onClose={onClose}
      onSubmit={() =>
        onSave({
          action: "record",
          type: "media-collection",
          entry_id: base?.id,
          expected_revision: base?.revision,
          title,
          data: {
            ...(base?.data || {}),
            session_id: session,
            collection_items: items,
          },
        })
      }
    >
      <Field label="Media collection title" value={title} onChange={setTitle} />
      <EntryPicker
        label="Media session"
        value={session}
        onChange={setSession}
        entries={value.sessions}
      />
      <EntryPicker
        label="Media original source"
        value={source}
        onChange={(v) => {
          setSource(v);
          setAsset("");
        }}
        entries={ctx.entries.filter(
          (e) =>
            e.kind !== "folder" &&
            e.id !== entry?.id &&
            !items.some((i) => i.entry_id === e.id),
        )}
      />
      <label className="field">
        <span>Media image source</span>
        <SearchableSelect
          value={asset}
          onChange={(e) => {
            setAsset(e.target.value);
            setSource("");
          }}
        >
          <option value="">Choose image</option>
          {ctx.assets
            .filter((a) => !items.some((i) => i.asset_id === a.id))
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </SearchableSelect>
      </label>
      <SelectField
        label="Media category"
        value={category}
        onChange={setCategory}
        options={["portrait", "map", "illustration", "handout"]}
      />
      <Field label="Media caption" value={caption} onChange={setCaption} />
      <button
        type="button"
        className="button secondary"
        disabled={(!source && !asset) || items.length >= 200}
        onClick={() => {
          setItems([
            ...items,
            { entry_id: source, asset_id: asset, caption, category },
          ]);
          setSource("");
          setAsset("");
          setCaption("");
        }}
      >
        Add media reference
      </button>
      {items.map((item, i) => (
        <article
          className="continuity-edit-card"
          key={item.entry_id || item.asset_id}
        >
          <strong>
            {ctx.entries.find((e) => e.id === item.entry_id)?.title ||
              ctx.assets.find((a) => a.id === item.asset_id)?.name ||
              "Unavailable source"}
          </strong>
          <p>
            {human(item.category)} · {item.caption}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={!i}
            onClick={() => {
              const next = [...items];
              [next[i - 1], next[i]] = [next[i], next[i - 1]];
              setItems(next);
            }}
          >
            Move media up
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setItems(items.filter((_, j) => i !== j))}
          >
            Remove media reference
          </button>
        </article>
      ))}
      <p className="notice">
        This collection is private preparation. Handouts open their
        published-source safe preview. Selecting other original notes or images
        does not publish them.
      </p>
    </ContinuityForm>
  );
}

export function SessionMedia({
  ctx,
  entry,
  onEdit,
}: {
  ctx: AppContext;
  entry: Entry;
  onEdit: () => void;
}) {
  const [handout, setHandout] = useState("");
  return (
    <section
      className="panel continuity-media"
      data-media-collection={entry.id}
    >
      <div className="section-heading">
        <h2>{entry.title}</h2>
        <button className="button secondary" onClick={onEdit}>
          Edit media collection
        </button>
      </div>
      <div className="continuity-card-grid">
        {(entry.data.collection_items || []).map((item: any, i: number) => {
          const source = ctx.entries.find((e) => e.id === item.entry_id),
            asset = ctx.assets.find(
              (a) =>
                a.id ===
                (item.asset_id ||
                  source?.data.asset_id ||
                  source?.data.cover_asset),
            );
          return (
            <article
              className="continuity-card"
              key={i}
              data-media-source={item.entry_id || item.asset_id}
            >
              {(asset || source?.data.cover_url) && (
                <img
                  referrerPolicy="no-referrer"
                  src={asset?.url || source?.data.cover_url}
                  alt={item.caption || "Session preparation image"}
                />
              )}
              <h3>{source?.title || asset?.name || "Unavailable original"}</h3>
              <p>
                {human(item.category)} · {item.caption}
              </p>
              {source && (
                <button
                  className="button secondary"
                  onClick={() =>
                    source.data.planning_type === "handout"
                      ? setHandout(source.id)
                      : ctx.go("entry/" + source.id)
                  }
                >
                  {source.data.planning_type === "handout"
                    ? "Preview player handout"
                    : "Open original source"}
                </button>
              )}
              {!source && asset && (
                <a
                  className="button secondary"
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original image
                </a>
              )}
            </article>
          );
        })}
      </div>
      {handout && (
        <Modal
          title="Player-safe handout preview"
          wide
          onClose={() => setHandout("")}
        >
          <HandoutView ctx={ctx} id={handout} />
        </Modal>
      )}
    </section>
  );
}

export function SessionWrapUp({
  ctx,
  value,
  onSave,
}: {
  ctx: AppContext;
  value: ContinuityData;
  onSave: ContinuitySave;
}) {
  const session = value.session!,
    note =
      value.wrapup ||
      value.records.find((e) => e.id === session.data.wrap_up_note_id),
    blank = {
      loot: false,
      progression: false,
      relationships: false,
      consequences: false,
      followups: false,
    };
  const [base, setBase] = useState(session),
    [baseNote, setBaseNote] = useState(note),
    [reviewed, setReviewed] = useState<Record<string, boolean>>({
      ...blank,
      ...note?.data.reviewed,
    }),
    [body, setBody] = useState(
      (note?.document?.content || [])
        .map((n: any) =>
          (n.content || []).map((c: any) => c.text || "").join(""),
        )
        .join("\n"),
    ),
    [initialBody, setInitialBody] = useState(body),
    [complete, setComplete] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const dirty =
    body !== initialBody ||
    JSON.stringify(reviewed) !==
      JSON.stringify({ ...blank, ...baseNote?.data.reviewed }) ||
    complete;
  useContinuityGuard(dirty, busy);
  useEffect(() => {
    if (
      !dirty &&
      (session.revision > base.revision ||
        (note?.revision || 0) > (baseNote?.revision || 0))
    ) {
      setBase(session);
      setBaseNote(note);
      const nextText = (note?.document?.content || [])
        .map((n: any) =>
          (n.content || []).map((c: any) => c.text || "").join(""),
        )
        .join("\n");
      setBody(nextText);
      setInitialBody(nextText);
      setReviewed({ ...blank, ...note?.data.reviewed });
    }
  }, [session.revision, note?.revision, dirty]);
  const groups: Record<string, Entry[]> = {
    loot: value.records.filter((e) =>
      ["loot", "transfer", "adjustment"].includes(typeOf(e)),
    ),
    progression: value.records.filter(
      (e) => typeOf(e) === "progression" || e.data.record_type === "milestone",
    ),
    relationships: value.records.filter(
      (e) => typeOf(e) === "relationship-event",
    ),
    consequences: value.records.filter((e) =>
      ["consequence", "place-status", "journey"].includes(typeOf(e)),
    ),
    followups: value.followups,
  };
  const changed = (baseNote?.data.review_sources || []).filter((s: any) => {
    const e = [...value.records, ...value.followups].find(
      (e) => e.id === s.entry_id,
    );
    return !e || e.revision !== s.revision;
  });
  const newSources = baseNote
    ? [
        ...new Set(
          [...value.records, ...value.followups]
            .filter(
              (e) =>
                e.id !== baseNote.id &&
                !(baseNote.data.review_sources || []).some(
                  (s: any) => s.entry_id === e.id,
                ),
            )
            .map((e) => e.id),
        ),
      ]
    : [];
  return (
    <section className="session-wrapup">
      <h2>Wrap up {session.title}</h2>
      <p className="notice">
        Review the original records together. Saving this checklist does not
        distribute loot, complete quests or rewrite character lore. Complete the
        session explicitly after reviewing all five sections.
      </p>
      {error && <ErrorBox message={error} />}{" "}
      {!!(changed.length + newSources.length) && (
        <p className="notice">
          {changed.length + newSources.length} originals are new, changed or
          unavailable since the saved review. Review the current records before
          saving again.
        </p>
      )}
      <div className="continuity-card-grid">
        {Object.entries(groups).map(([key, rows]) => (
          <section className="continuity-card" key={key}>
            <h3>{human(key)}</h3>
            {rows.length ? (
              <ul>
                {rows.map((e) => (
                  <li key={e.id}>
                    <button
                      className="text-button"
                      onClick={() => ctx.go("entry/" + e.id)}
                    >
                      {e.title}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No recorded items in this section.</p>
            )}
            <label className="checkbox-row">
              <input
                type="checkbox"
                disabled={busy}
                checked={reviewed[key]}
                onChange={(e) => {
                  setReviewed({ ...reviewed, [key]: e.target.checked });
                  setSaved(false);
                }}
              />
              Reviewed {key}
            </label>
          </section>
        ))}
      </div>
      <fieldset disabled={busy} className="session-guide-form-fields">
        <LongField
          label="Session wrap-up notes"
          value={body}
          onChange={(v) => {
            setBody(v);
            setSaved(false);
          }}
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={complete}
            onChange={(e) => {
              setComplete(e.target.checked);
              setSaved(false);
            }}
          />
          Mark this session completed when saving
        </label>
      </fieldset>
      <button
        className="button primary"
        disabled={busy || (complete && !Object.values(reviewed).every(Boolean))}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await onSave({
              action: "wrap-up",
              session_id: base.id,
              expected_revision: base.revision,
              note_revision: baseNote?.revision,
              reviewed,
              text: body,
              complete,
            });
            if (result.session) {
              setBase(result.session);
              setBaseNote(result.note);
            }
            setInitialBody(body);
            setComplete(false);
            setSaved(true);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save session wrap-up
      </button>
      {saved && <p role="status">Session wrap-up saved privately.</p>}
    </section>
  );
}
