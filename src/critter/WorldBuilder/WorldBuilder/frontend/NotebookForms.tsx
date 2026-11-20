import React, { useEffect, useState } from "react";
import { AppContext, Entry, saveBeforeNavigate, text } from "./domain";
import { EntryPicker, ErrorBox, Field, Modal, TagField } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { LongField, SelectField } from "./ContinuityEditors";
import { RelatedEntries } from "./CampaignRecords";
import { useCaptureRecovery } from "./CaptureRecovery";

export type Section = {
  id: string;
  title: string;
  parent_id: string;
  entry_ids: string[];
};
export type NoteSave = (body: Record<string, any>) => Promise<any>;
export const categories = [
  "note",
  "idea",
  "fact",
  "question",
  "session",
  "npc-conversation",
  "investigation",
  "location-discovery",
  "encounter",
];
export function NoteForm({
  title,
  dirty,
  onClose,
  onSubmit,
  children,
  disabled = false,
  submit = "Save",
}: {
  title: string;
  dirty: boolean;
  onClose: () => void;
  onSubmit: () => Promise<any>;
  children: React.ReactNode;
  disabled?: boolean;
  submit?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const close = () =>
    !busy && (!dirty || confirm("Discard these unsaved note changes?"));
  useEffect(() => {
    const previous = saveBeforeNavigate.current,
      guard = async () => close() && (previous ? await previous() : true);
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
  return (
    <Modal
      title={title}
      wide
      onClose={() => {
        if (close()) onClose();
      }}
    >
      <form
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || disabled) return;
          setBusy(true);
          setError("");
          try {
            await onSubmit();
            setBusy(false);
            onClose();
          } catch (e: any) {
            setError(e.message);
            setBusy(false);
          }
        }}
      >
        {error && <ErrorBox message={error} />}
        <fieldset className="session-guide-form-fields" disabled={busy}>
          {children}
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
          <button className="button primary" disabled={busy || disabled}>
            {busy ? "Saving…" : submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function BookForm({
  entry,
  onSave,
  onClose,
}: {
  entry?: Entry;
  onSave: NoteSave;
  onClose: () => void;
}) {
  const [base] = useState(entry),
    [title, setTitle] = useState(entry?.title || ""),
    [sections, setSections] = useState<Section[]>(() =>
      structuredClone(
        entry?.data.notebook_sections || [
          {
            id: crypto.randomUUID(),
            title: "Notes",
            parent_id: "",
            entry_ids: [],
          },
        ],
      ),
    ),
    [initial] = useState(JSON.stringify(sections));
  return (
    <NoteForm
      title={entry ? "Notebook sections & order" : "Create notebook"}
      dirty={
        title !== (base?.title || "") || JSON.stringify(sections) !== initial
      }
      disabled={!title.trim() || sections.some((s) => !s.title.trim())}
      onClose={onClose}
      onSubmit={() =>
        onSave({
          action: "book",
          id: base?.id,
          expected_revision: base?.revision,
          title,
          sections,
        })
      }
      submit="Save notebook"
    >
      <Field label="Notebook title" value={title} onChange={setTitle} />
      {sections.map((s, i) => (
        <article className="notebook-form-row" key={s.id}>
          <Field
            label={`Section title ${i + 1}`}
            value={s.title}
            onChange={(v) =>
              setSections(
                sections.map((r) => (r.id === s.id ? { ...r, title: v } : r)),
              )
            }
          />
          <label className="field">
            <span>{`Section parent ${i + 1}`}</span>
            <SearchableSelect
              value={s.parent_id}
              onChange={(e) =>
                setSections(
                  sections.map((r) =>
                    r.id === s.id ? { ...r, parent_id: e.target.value } : r,
                  ),
                )
              }
            >
              <option value="">Top level</option>
              {sections
                .filter((r) => r.id !== s.id)
                .map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.title}
                  </option>
                ))}
            </SearchableSelect>
          </label>
          <p>{s.entry_ids.length} original references</p>
          <button
            type="button"
            className="text-button"
            disabled={!i}
            onClick={() => {
              const next = [...sections];
              [next[i - 1], next[i]] = [next[i], next[i - 1]];
              setSections(next);
            }}
          >
            Move section up
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setSections(
                sections
                  .filter((r) => r.id !== s.id)
                  .map((r) =>
                    r.parent_id === s.id ? { ...r, parent_id: "" } : r,
                  ),
              )
            }
          >
            Remove section
          </button>
        </article>
      ))}
      <button
        className="button secondary"
        type="button"
        disabled={sections.length >= 100}
        onClick={() =>
          setSections([
            ...sections,
            {
              id: crypto.randomUUID(),
              title: "New section",
              parent_id: "",
              entry_ids: [],
            },
          ])
        }
      >
        Add notebook section
      </button>
      <p className="muted">
        Sections keep references to original notes. Removing a section keeps its
        notes in the world and other notebooks.
      </p>
    </NoteForm>
  );
}
export function CaptureForm({
  ctx,
  book,
  sectionId,
  templates,
  onSave,
  onClose,
  onCreated,
}: {
  ctx: AppContext;
  book?: Entry;
  sectionId: string;
  templates: Entry[];
  onSave: NoteSave;
  onClose: () => void;
  onCreated: (entry: Entry, section: string) => void;
}) {
  const [base] = useState(book),
    [captureKey, setCaptureKey] = useState(crypto.randomUUID()),
    [section, setSection] = useState(
      sectionId || book?.data.notebook_sections?.[0]?.id || "",
    ),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [preset, setPreset] = useState("blank"),
    [template, setTemplate] = useState(""),
    [campaign, setCampaign] = useState(""),
    [session, setSession] = useState(""),
    [category, setCategory] = useState("note"),
    [tags, setTags] = useState<string[]>([]);
  const recovery = useCaptureRecovery(
    `worldbuilder.capture:${ctx.world.id}:${base?.id || "inbox"}`,
    {
      captureKey,
      section,
      title,
      body,
      preset,
      template,
      campaign,
      session,
      category,
      tags,
    },
    !!(title || body),
    (v) => {
      setCaptureKey(v.captureKey || crypto.randomUUID());
      setSection(v.section || "");
      setTitle(v.title || "");
      setBody(v.body || "");
      setPreset(v.preset || "blank");
      setTemplate(v.template || "");
      setCampaign(v.campaign || "");
      setSession(v.session || "");
      setCategory(v.category || "note");
      setTags(v.tags || []);
    },
  );
  return (
    <NoteForm
      title="Capture a note"
      submit="Create & write note"
      dirty={
        !!(
          title ||
          body ||
          template ||
          campaign ||
          tags.length ||
          preset !== "blank" ||
          category !== "note"
        )
      }
      onClose={() => {
        recovery.clear();
        onClose();
      }}
      onSubmit={async () => {
        const result = await onSave({
          action: "capture",
          capture_key: captureKey,
          book_id: base?.id || "",
          section_id: section,
          expected_revision: base?.revision,
          title,
          text: body,
          preset,
          template_id: template,
          campaign_id: campaign,
          session_id: session,
          category,
          tags,
        });
        onCreated(result.entry, section);
      }}
      disabled={!!base && !section}
    >
      {recovery.controls}
      <Field
        label="Quick note title (optional)"
        value={title}
        onChange={setTitle}
      />
      <LongField label="Quick note text" value={body} onChange={setBody} />
      {base && (
        <label className="field">
          <span>Capture section</span>
          <SearchableSelect
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            {(base.data.notebook_sections || []).map((s: Section) => (
              <option value={s.id} key={s.id}>
                {s.title}
              </option>
            ))}
          </SearchableSelect>
        </label>
      )}
      <SelectField
        label="Note preset"
        value={preset}
        onChange={setPreset}
        options={[
          "blank",
          "session",
          "npc-conversation",
          "investigation",
          "location-discovery",
          "encounter",
        ]}
      />
      <EntryPicker
        label="Reusable note template"
        value={template}
        onChange={(id) => {
          setTemplate(id);
          const t = templates.find((e) => e.id === id);
          if (t) {
            setTags(t.data.note_defaults?.tags || []);
            setCategory(t.data.note_defaults?.category || "note");
          }
        }}
        entries={templates}
      />
      <SelectField
        label="Note category"
        value={category}
        onChange={setCategory}
        options={categories}
      />
      <TagField
        label="Capture tags"
        value={tags}
        onChange={setTags}
        placeholder="clue, session, NPC"
      />
      <EntryPicker
        label="Note campaign"
        value={campaign}
        onChange={(v) => {
          setCampaign(v);
          setSession("");
        }}
        entries={ctx.entries.filter((e) => e.kind === "campaign")}
      />
      <EntryPicker
        label="Note session"
        value={session}
        onChange={setSession}
        entries={ctx.entries.filter(
          (e) =>
            e.kind === "session" &&
            (e.data.campaign_id ?? e.parent ?? "") === campaign,
        )}
      />
      <p className="muted">
        Creates a private original, then opens the rich editor. A template
        copies its starting content; later template edits leave your notes
        intact.
      </p>
    </NoteForm>
  );
}
export function SchemaFields({
  schema,
  onChange,
}: {
  schema: any[];
  onChange: (v: any[]) => void;
}) {
  return (
    <section>
      <h3>Note metadata fields</h3>
      {schema.map((f, i) => (
        <div className="notebook-form-row" key={f.id}>
          <Field
            label={`Metadata label ${i + 1}`}
            value={f.label}
            onChange={(v) =>
              onChange(schema.map((r, j) => (j === i ? { ...r, label: v } : r)))
            }
          />
          <SelectField
            label={`Metadata type ${i + 1}`}
            value={f.type}
            onChange={(v) =>
              onChange(schema.map((r, j) => (j === i ? { ...r, type: v } : r)))
            }
            options={["text", "number", "check"]}
          />
          <button
            type="button"
            className="text-button"
            onClick={() => onChange(schema.filter((_, j) => j !== i))}
          >
            Remove metadata field
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={schema.length >= 30}
        onClick={() =>
          onChange([
            ...schema,
            { id: crypto.randomUUID(), label: "New field", type: "text" },
          ])
        }
      >
        Add metadata field
      </button>
    </section>
  );
}
export function TemplateForm({
  entry,
  source,
  onSave,
  onClose,
}: {
  entry?: Entry;
  source?: Entry;
  onSave: NoteSave;
  onClose: () => void;
}) {
  const [base] = useState(entry),
    [title, setTitle] = useState(entry?.title || ""),
    [body, setBody] = useState(text(entry?.document).trim()),
    [initialBody] = useState(body),
    [tags, setTags] = useState<string[]>(
      entry?.data.note_defaults?.tags || source?.tags || [],
    ),
    [category, setCategory] = useState(
      entry?.data.note_defaults?.category ||
        source?.data.note_category ||
        "note",
    ),
    [schema, setSchema] = useState<any[]>(() =>
      structuredClone(
        entry?.data.note_schema || source?.data.note_schema || [],
      ),
    );
  return (
    <NoteForm
      title={
        source
          ? "Save original as note template"
          : entry
            ? "Edit note template"
            : "Create note template"
      }
      dirty={!!(title || body || schema.length || tags.length)}
      disabled={!title.trim() || schema.some((f) => !f.label.trim())}
      onClose={onClose}
      submit="Save note template"
      onSubmit={() =>
        onSave({
          action: "template",
          id: base?.id,
          expected_revision: base?.revision,
          source_id: source?.id,
          title,
          ...(!base || body !== initialBody ? { text: body } : {}),
          defaults: {
            tags,
            category,
            related_entries:
              source?.data.related_entries ||
              base?.data.note_defaults?.related_entries ||
              [],
          },
          schema,
        })
      }
    >
      <Field label="Note template title" value={title} onChange={setTitle} />
      {source ? (
        <p>
          Copies the current rich content of {source.title}. The original
          remains unchanged.
        </p>
      ) : (
        <LongField
          label="Template starter text"
          value={body}
          onChange={setBody}
        />
      )}
      <TagField
        label="Default note tags"
        value={tags}
        onChange={setTags}
        placeholder="clue, NPC"
      />
      <SelectField
        label="Default note category"
        value={category}
        onChange={setCategory}
        options={categories}
      />
      <SchemaFields schema={schema} onChange={setSchema} />
      {entry && (
        <p className="muted">
          Use the original template editor for rich formatting. Changing
          metadata without changing starter text preserves its rich document.
        </p>
      )}
    </NoteForm>
  );
}
export function NoteMetadataForm({
  ctx,
  entry,
  onSave,
  onClose,
}: {
  ctx: AppContext;
  entry: Entry;
  onSave: NoteSave;
  onClose: () => void;
}) {
  const [base] = useState(entry),
    [data, setData] = useState<Record<string, any>>(() => ({
      note_category: entry.data.note_category || "note",
      note_question_status: entry.data.note_question_status || "open",
      note_starred: !!entry.data.note_starred,
      note_schema: structuredClone(entry.data.note_schema || []),
      note_values: structuredClone(entry.data.note_values || {}),
      related_entries: [...(entry.data.related_entries || [])],
      campaign_id:
        entry.data.campaign_id ??
        (ctx.entries.some((e) => e.id === entry.parent && e.kind === "campaign")
          ? entry.parent
          : "") ??
        "",
      session_id: entry.data.session_id || "",
    })),
    [initial] = useState(JSON.stringify(data)),
    [tags, setTags] = useState(entry.tags);
  const update = (k: string, v: any) => setData({ ...data, [k]: v });
  return (
    <NoteForm
      title="Note tags, sources & metadata"
      dirty={
        JSON.stringify(data) !== initial ||
        JSON.stringify(tags) !== JSON.stringify(base.tags)
      }
      onClose={onClose}
      submit="Save note metadata"
      onSubmit={() =>
        onSave({
          action: "metadata",
          id: base.id,
          expected_revision: base.revision,
          data,
          tags,
        })
      }
    >
      <h3>{base.title}</h3>
      <SelectField
        label="Note category"
        value={data.note_category}
        onChange={(v) => update("note_category", v)}
        options={categories}
      />
      {data.note_category === "question" && (
        <SelectField
          label="Question status"
          value={data.note_question_status}
          onChange={(v) => update("note_question_status", v)}
          options={["open", "resolved"]}
        />
      )}
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={data.note_starred}
          onChange={(e) => update("note_starred", e.target.checked)}
        />
        Favorite this original
      </label>
      <TagField
        label="Note tags"
        value={tags}
        onChange={setTags}
        placeholder="Tags"
      />
      <EntryPicker
        label="Metadata campaign"
        value={data.campaign_id}
        onChange={(v) => setData({ ...data, campaign_id: v, session_id: "" })}
        entries={ctx.entries.filter((e) => e.kind === "campaign")}
      />
      <EntryPicker
        label="Metadata session"
        value={data.session_id}
        onChange={(v) => update("session_id", v)}
        entries={ctx.entries.filter(
          (e) =>
            e.kind === "session" &&
            (e.data.campaign_id ?? e.parent ?? "") === data.campaign_id,
        )}
      />
      <SchemaFields
        schema={data.note_schema}
        onChange={(schema) =>
          setData({
            ...data,
            note_schema: schema,
            note_values: Object.fromEntries(
              schema
                .filter((f) =>
                  Object.prototype.hasOwnProperty.call(data.note_values, f.id),
                )
                .map((f) => [
                  f.id,
                  data.note_schema.find((old: any) => old.id === f.id)?.type ===
                  f.type
                    ? data.note_values[f.id]
                    : f.type === "check"
                      ? false
                      : f.type === "number"
                        ? 0
                        : "",
                ]),
            ),
          })
        }
      />
      {data.note_schema.map((f: any) =>
        f.type === "check" ? (
          <label className="checkbox-row" key={f.id}>
            <input
              type="checkbox"
              checked={!!data.note_values[f.id]}
              onChange={(e) =>
                update("note_values", {
                  ...data.note_values,
                  [f.id]: e.target.checked,
                })
              }
            />
            {f.label}
          </label>
        ) : (
          <Field
            key={f.id}
            label={"Value: " + f.label}
            value={data.note_values[f.id] ?? ""}
            type={f.type === "number" ? "number" : "text"}
            step={f.type === "number" ? "any" : undefined}
            onChange={(v) =>
              update("note_values", { ...data.note_values, [f.id]: v })
            }
          />
        ),
      )}
      <RelatedEntries
        ctx={ctx}
        data={data}
        onData={setData}
        exclude={entry.id}
      />
      <p className="muted">
        Changes tags and metadata while preserving the original rich note.
      </p>
    </NoteForm>
  );
}
export function FileNotesForm({
  books,
  entries,
  onSave,
  onClose,
}: {
  books: Entry[];
  entries: Entry[];
  onSave: NoteSave;
  onClose: () => void;
}) {
  const [bookId, setBook] = useState(""),
    [section, setSection] = useState(""),
    [move, setMove] = useState(false);
  const book = books.find((e) => e.id === bookId);
  return (
    <NoteForm
      title="File original notes"
      dirty={!!bookId}
      onClose={onClose}
      submit="File originals"
      disabled={!book || !section}
      onSubmit={() =>
        onSave({
          action: "file",
          book_id: bookId,
          section_id: section,
          expected_revision: book?.revision,
          move,
          entries: entries.map((e) => ({ id: e.id, revision: e.revision })),
        })
      }
    >
      <p>
        {entries.length} originals selected. Filing creates references,
        preserving their UUIDs, rich content and existing collection locations.
      </p>
      <EntryPicker
        label="Destination notebook"
        value={bookId}
        onChange={(v) => {
          setBook(v);
          setSection("");
        }}
        entries={books}
      />
      <label className="field">
        <span>Destination section</span>
        <SearchableSelect
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          <option value="">Choose section</option>
          {(book?.data.notebook_sections || []).map((s: Section) => (
            <option value={s.id} key={s.id}>
              {s.title}
            </option>
          ))}
        </SearchableSelect>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={move}
          onChange={(e) => setMove(e.target.checked)}
        />
        Remove these references from other sections of the destination notebook
      </label>
    </NoteForm>
  );
}

export function BulkNoteTags({
  entries,
  onSave,
  onClose,
}: {
  entries: Entry[];
  onSave: NoteSave;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<string[]>([]),
    [removeTags, setRemoveTags] = useState<string[]>([]);
  return (
    <NoteForm
      title="Tag selected originals"
      dirty={!!tags.length || !!removeTags.length}
      disabled={!tags.length && !removeTags.length}
      submit="Apply tag changes"
      onClose={onClose}
      onSubmit={() =>
        onSave({
          action: "bulk",
          add_tags: tags,
          remove_tags: removeTags,
          entries: entries.map((e) => ({ id: e.id, revision: e.revision })),
        })
      }
    >
      <p>
        {entries.length} original notes. Existing tags and rich content are
        retained.
      </p>
      <TagField
        label="Tags to add"
        value={tags}
        onChange={setTags}
        placeholder="clue, reviewed, session"
      />
      <TagField
        label="Tags to remove"
        value={removeTags}
        onChange={setRemoveTags}
        placeholder="Remove these tags from selected originals"
      />
    </NoteForm>
  );
}
