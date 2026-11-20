import React, { useState } from "react";
import {
  AppContext,
  Entry,
  api,
  post,
  saveBeforeNavigate,
  uid,
} from "./domain";
import { EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";

const types = [
  ["text", "Text"],
  ["long", "Long text"],
  ["number", "Number"],
  ["check", "Checkbox"],
  ["select", "Choice"],
  ["reference", "World entry"],
  ["list", "Repeatable text"],
];
function Choices({
  field,
  onChange,
}: {
  field: any;
  onChange: (options: string[]) => void;
}) {
  const [raw, setRaw] = useState((field.options || []).join("\n"));
  return (
    <label className="field">
      Choices for {field.name}
      <textarea
        aria-label={"Choices for " + field.name}
        rows={3}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(
            e.target.value
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
          );
        }}
      />
    </label>
  );
}
export function TemplateFields({
  data,
  onData,
}: {
  data: Record<string, any>;
  onData: (data: any) => void;
}) {
  const fields = (data.fields || []).map((f: any) => ({
    ...f,
    id: f.id || "legacy:" + f.name,
  }));
  const change = (id: string, patch: any) =>
    onData({
      ...data,
      fields: fields.map((f: any) => (f.id === id ? { ...f, ...patch } : f)),
    });
  return (
    <section>
      <p>
        Field IDs preserve values through renames. Articles keep their saved
        schema until you explicitly apply a reviewed update.
      </p>
      {fields.map((f: any, i: number) => (
        <article className="template-field-definition" key={f.id}>
          <div className="field-grid">
            <Field
              label={`Field ${i + 1} name`}
              value={f.name}
              onChange={(v) => change(f.id, { name: v })}
            />
            <label>
              Field {i + 1} type
              <SearchableSelect
                aria-label={`Field ${i + 1} type`}
                value={f.type || "text"}
                onChange={(e) => change(f.id, { type: e.target.value })}
              >
                {types.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            <Field
              label={`Field ${i + 1} section`}
              value={f.section || ""}
              onChange={(v) => change(f.id, { section: v })}
            />
          </div>
          <label>
            <input
              type="checkbox"
              checked={!!f.required}
              onChange={(e) => change(f.id, { required: e.target.checked })}
            />
            Required before publishing
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!f.private}
              onChange={(e) => change(f.id, { private: e.target.checked })}
            />
            GM only
          </label>
          {f.type === "select" && (
            <Choices
              key={f.id}
              field={f}
              onChange={(options) => change(f.id, { options })}
            />
          )}
          <div className="button-row">
            <button
              className="text-button"
              disabled={!i}
              onClick={() => {
                const next = [...fields];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                onData({ ...data, fields: next });
              }}
            >
              Move field up
            </button>
            <button
              className="text-button"
              disabled={i === fields.length - 1}
              onClick={() => {
                const next = [...fields];
                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                onData({ ...data, fields: next });
              }}
            >
              Move field down
            </button>
            <button
              className="text-button danger"
              onClick={() =>
                onData({
                  ...data,
                  fields: fields.filter((v: any) => v.id !== f.id),
                })
              }
            >
              Remove field
            </button>
          </div>
        </article>
      ))}
      <button
        className="button secondary"
        disabled={fields.length >= 100}
        onClick={() =>
          onData({
            ...data,
            fields: [
              ...fields,
              {
                id: uid(),
                name: "New field " + (fields.length + 1),
                type: "text",
                required: false,
                private: false,
                section: "",
              },
            ],
          })
        }
      >
        Add field
      </button>
    </section>
  );
}
export function ArticleFields({
  entry,
  ctx,
  onData,
  onUpgrade,
}: {
  entry: Entry;
  ctx: AppContext;
  onData: (data: any) => void;
  onUpgrade: (entry: Entry) => void;
}) {
  const [review, setReview] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const schema = entry.data.structured_schema,
    values = entry.data.structured_values || {},
    source = ctx.entries.find((e) => e.id === schema.template_id);
  const set = (id: string, value: any) =>
    onData({ ...entry.data, structured_values: { ...values, [id]: value } });
  const sections = [
    ...new Set<string>(schema.fields.map((f: any) => f.section || "Details")),
  ];
  const legacy = Object.fromEntries(
    Object.entries(entry.data.fields || {}).filter(
      ([name]) => !schema.fields.some((f: any) => f.name === name),
    ),
  );
  return (
    <section aria-label="Structured article fields">
      <p className="muted">
        Template version {schema.template_revision}
        {source && source.revision !== schema.template_revision
          ? " · update available"
          : ""}
      </p>
      <button
        className="button secondary small"
        disabled={busy || !source}
        onClick={async () => {
          if (
            saveBeforeNavigate.current &&
            !(await saveBeforeNavigate.current())
          )
            return;
          setBusy(true);
          setError("");
          try {
            setReview(await api(`/resources/${entry.id}/field-schema`));
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Review template update
      </button>
      {error && <ErrorBox message={error} />}
      {sections.map((section) => (
        <fieldset className="structured-section" key={section}>
          <legend>{section}</legend>
          {schema.fields
            .filter((f: any) => (f.section || "Details") === section)
            .map((f: any) => (
              <div className="structured-value" key={f.id}>
                <label className="structured-field-label">
                  {f.name}
                  {f.required ? " *" : ""}
                  {f.private ? " · GM only" : ""}
                </label>
                {f.type === "check" ? (
                  <label>
                    <input
                      type="checkbox"
                      aria-label={f.name}
                      checked={!!values[f.id]}
                      onChange={(e) => set(f.id, e.target.checked)}
                    />
                    Enabled
                  </label>
                ) : f.type === "long" ? (
                  <textarea
                    aria-label={f.name}
                    rows={4}
                    value={values[f.id] ?? ""}
                    onChange={(e) => set(f.id, e.target.value)}
                  />
                ) : f.type === "select" ? (
                  <SearchableSelect
                    aria-label={f.name}
                    value={values[f.id] || ""}
                    onChange={(e) => set(f.id, e.target.value)}
                  >
                    <option value="">Choose</option>
                    {(f.options || []).map((v: string) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </SearchableSelect>
                ) : f.type === "reference" ? (
                  <EntryPicker
                    label={"Source for " + f.name}
                    value={values[f.id] || ""}
                    onChange={(id) => set(f.id, id)}
                    entries={ctx.entries.filter((e) => e.id !== entry.id)}
                  />
                ) : f.type === "list" ? (
                  <div>
                    {(values[f.id] || []).map((v: string, i: number) => (
                      <div className="button-row" key={i}>
                        <input
                          aria-label={`${f.name} item ${i + 1}`}
                          value={v}
                          onChange={(e) =>
                            set(
                              f.id,
                              values[f.id].map((old: string, n: number) =>
                                n === i ? e.target.value : old,
                              ),
                            )
                          }
                        />
                        <button
                          className="text-button"
                          onClick={() =>
                            set(
                              f.id,
                              values[f.id].filter(
                                (_: string, n: number) => n !== i,
                              ),
                            )
                          }
                        >
                          Remove item
                        </button>
                      </div>
                    ))}
                    <button
                      className="text-button"
                      disabled={(values[f.id] || []).length >= 100}
                      onClick={() => set(f.id, [...(values[f.id] || []), ""])}
                    >
                      Add {f.name} item
                    </button>
                  </div>
                ) : (
                  <input
                    aria-label={f.name}
                    type={f.type === "number" ? "number" : "text"}
                    value={values[f.id] ?? ""}
                    onChange={(e) =>
                      set(
                        f.id,
                        f.type === "number" && e.target.value !== ""
                          ? Number(e.target.value)
                          : e.target.value,
                      )
                    }
                  />
                )}
              </div>
            ))}
        </fieldset>
      ))}
      {!!entry.data.structured_retired?.length && (
        <details>
          <summary>
            Retained values from earlier schemas (
            {entry.data.structured_retired.length})
          </summary>
          <pre className="revision-prose">
            {JSON.stringify(entry.data.structured_retired, null, 2)}
          </pre>
        </details>
      )}
      {!!Object.keys(legacy).length && (
        <details>
          <summary>Unmapped legacy fields</summary>
          <pre className="revision-prose">
            {JSON.stringify(legacy, null, 2)}
          </pre>
        </details>
      )}
      {review && (
        <Modal
          title="Review template update"
          wide
          onClose={() => !busy && setReview(null)}
        >
          <p>
            Review the source schema before applying it. Removed or incompatible
            values are retained in this article.
          </p>
          <ul>
            {review.changes.map((line: string, i: number) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {!review.changes.length && <p>No field changes.</p>}
          {!!review.schema?.fields?.length && (
            <div className="schema-review-table">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Type</th>
                    <th>Section</th>
                    <th>Required</th>
                    <th>Visibility</th>
                    <th>Choices</th>
                  </tr>
                </thead>
                <tbody>
                  {review.schema.fields.map((field: any) => (
                    <tr key={field.id}>
                      <td>{field.name}</td>
                      <td>{field.type}</td>
                      <td>{field.section || "Details"}</td>
                      <td>{field.required ? "Yes" : "No"}</td>
                      <td>{field.private ? "GM only" : "Reader"}</td>
                      <td>{(field.options || []).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!review.retained?.length && (
            <details>
              <summary>Retained values after this update</summary>
              <pre className="revision-prose">
                {JSON.stringify(review.retained, null, 2)}
              </pre>
            </details>
          )}
          {error && <ErrorBox message={error} />}
          <button
            className="button primary"
            disabled={busy || !review.available}
            onClick={async () => {
              if (
                saveBeforeNavigate.current &&
                !(await saveBeforeNavigate.current())
              )
                return;
              setBusy(true);
              try {
                const saved = await post<Entry>(
                  `/resources/${entry.id}/field-schema`,
                  {
                    expected_revision: review.expected_revision,
                    template_revision: review.template_revision,
                  },
                );
                onUpgrade(saved);
                setReview(null);
                try {
                  await ctx.refresh();
                } catch {
                  ctx.notify(
                    "Schema saved; refresh the workspace to update its lists.",
                    true,
                  );
                }
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Apply reviewed schema
          </button>
        </Modal>
      )}
    </section>
  );
}
export function StructuredReader({ entry }: { entry: Entry }) {
  const schema = entry.data.structured_schema,
    values = entry.data.structured_values || {},
    labels = entry.data.structured_labels || {};
  const sections = [
    ...new Set<string>(schema.fields.map((f: any) => f.section || "Details")),
  ];
  return (
    <>
      {sections.map((section) => (
        <section key={section}>
          <h3>{section}</h3>
          <dl className="reader-fields">
            {schema.fields
              .filter((f: any) => (f.section || "Details") === section)
              .map((f: any) => (
                <div key={f.id}>
                  <dt>{f.name}</dt>
                  <dd>
                    {f.type === "reference" ? (
                      values[f.id] &&
                      labels[f.id] &&
                      labels[f.id] !== "Unavailable reference" ? (
                        <a
                          data-resource-id={values[f.id]}
                          href={"/#/entry/" + values[f.id]}
                        >
                          {labels[f.id]}
                        </a>
                      ) : (
                        labels[f.id] || "Unavailable reference"
                      )
                    ) : f.type === "check" ? (
                      values[f.id] ? (
                        "Yes"
                      ) : (
                        "No"
                      )
                    ) : f.type === "list" ? (
                      <ul>
                        {(values[f.id] || []).map((v: string, i: number) => (
                          <li key={i}>{v}</li>
                        ))}
                      </ul>
                    ) : (
                      String(values[f.id] ?? "")
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </>
  );
}
