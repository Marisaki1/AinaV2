import React, { useState } from "react";
import DOMPurify from "dompurify";
import { AppContext, Entry } from "./domain";
import { NoteForm, NoteSave } from "./NotebookForms";
import { Field } from "./ui";
import { SearchableSelect } from "./SearchableSelect";

export function NoteConversion({
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
  const [title, setTitle] = useState(entry.title),
    [template, setTemplate] = useState("generic");
  return (
    <NoteForm
      title="Create linked article from note"
      dirty={title !== entry.title || template !== "generic"}
      onClose={onClose}
      disabled={!title.trim()}
      submit="Create private article"
      onSubmit={async () => {
        const result = await onSave({
          action: "note_article",
          id: entry.id,
          expected_revision: entry.revision,
          title,
          template,
        });
        ctx.notify(
          result.reused
            ? "The existing linked article was retained."
            : "Private article created. Your original note is retained and linked.",
        );
      }}
    >
      <Field label="Article title" value={title} onChange={setTitle} />
      <label className="field">
        <span>Article template</span>
        <SearchableSelect
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        >
          {ctx.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
          {ctx.entries
            .filter((e) => e.kind === "template")
            .map((t) => (
              <option key={t.id} value={"custom:" + t.id}>
                {t.title} (custom)
              </option>
            ))}
        </SearchableSelect>
      </label>
      <p>
        The article receives this saved note’s rich text, summary, tags,
        aliases, private GM notes and unknown data. The original note stays in
        place. Further edits are independent; neither record is published by
        this operation.
      </p>
      <div className="snippet-preview">
        <h3>{title || entry.title}</h3>
        <div
          className="reader-prose"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(entry.html || ""),
          }}
        />
      </div>
    </NoteForm>
  );
}
