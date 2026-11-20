import React, { useRef, useState } from "react";
import {
  AppContext,
  Entry,
  docFromText,
  post,
  saveBeforeNavigate,
  uid,
} from "./domain";
import { EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Dices,
  Download,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

const types = [
  ["text", "Text"],
  ["number", "Number"],
  ["checkbox", "Checkbox"],
  ["article", "Entry link"],
  ["dice", "Dice formula"],
];
function resultText(result: any, depth = 0): string {
  return [
    "  ".repeat(depth) +
      (result.step_label ? result.step_label + ": " : "") +
      result.text,
    ...(result.children || []).map((child: any) =>
      resultText(child, depth + 1),
    ),
  ].join("\n");
}

export function TableEditor({
  entry,
  data,
  setData,
  ctx,
}: {
  entry: Entry;
  data: Record<string, any>;
  setData: (value: Record<string, any>) => void;
  ctx: AppContext;
}) {
  const columns: any[] = data.columns || [
    { id: "value", label: "Result", type: "text" },
  ];
  const rows: any[] = data.rows || [],
    steps: any[] = data.generator_steps || [];
  const [query, setQuery] = useState(""),
    [seed, setSeed] = useState(""),
    [error, setError] = useState("");
  const [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState("");
  const [page, setPage] = useState(0);
  const [incoming, setIncoming] = useState<any>(null),
    [importError, setImportError] = useState("");
  const file = useRef<HTMLInputElement>(null),
    locked = useRef(false);
  const change = (patch: any) => setData({ ...data, columns, rows, ...patch });
  const rowChange = (index: number, patch: any) =>
    change({
      rows: rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });
  const stepChange = (index: number, patch: any) =>
    change({
      generator_steps: steps.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      ),
    });
  const flush = async () =>
    !saveBeforeNavigate.current || (await saveBeforeNavigate.current());
  const perform = async (name: string, action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(name);
    setError("");
    try {
      await action();
    } catch (e: any) {
      setError(e.message);
    } finally {
      locked.current = false;
      setBusy("");
    }
  };
  const download = (format: string) =>
    void perform("export", async () => {
      if (!(await flush()))
        throw Error("Save or recover the table before exporting.");
      const response = await fetch(
        `/api/resources/${entry.id}/table-exchange?format=${format}`,
        { credentials: "same-origin" },
      );
      if (!response.ok)
        throw Error((await response.json()).error || "Export failed.");
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download =
        entry.title.replace(/[^\p{L}\p{N}._-]+/gu, "-") + "." + format;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      JSON.stringify(row.cells || row.value || "")
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const lastPage = Math.max(0, Math.ceil(visible.length / 50) - 1);
  const currentPage = Math.min(page, lastPage);
  const pageRows = visible.slice(currentPage * 50, (currentPage + 1) * 50);
  return (
    <section
      className="rolltable-workspace"
      aria-label="Table and generator editor"
    >
      <div className="rolltable-toolbar">
        <input
          aria-label="Filter table rows"
          placeholder="Find a row…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <span className="muted">
          {visible.length}/{rows.length} rows
        </span>
        <div className="button-row">
          <button
            className="button secondary small"
            disabled={!!busy}
            onClick={() => file.current?.click()}
          >
            <Upload size={14} />
            Import
          </button>
          <button
            className="button secondary small"
            disabled={!!busy}
            onClick={() => download("csv")}
          >
            <Download size={14} />
            CSV
          </button>
          <button
            className="button secondary small"
            disabled={!!busy}
            onClick={() => download("json")}
          >
            <Download size={14} />
            Table JSON
          </button>
        </div>
      </div>
      <input
        hidden
        ref={file}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        onChange={async (e) => {
          const selected = e.target.files?.[0];
          e.target.value = "";
          if (!selected) return;
          void perform("import", async () => {
            if (selected.size > 2000000)
              throw Error("Use a file up to two million bytes.");
            const text = await selected.text(),
              format = selected.name.toLowerCase().endsWith(".json")
                ? "json"
                : "csv";
            const preview: any = await post(
              `/resources/${entry.id}/table-exchange`,
              { text, format },
            );
            setImportError("");
            setIncoming({
              text,
              format,
              preview,
              mapping: preview.data.columns,
              valid: true,
            });
          });
        }}
      />
      {error && <ErrorBox message={error} />}
      <div className="rolltable-controls">
        <fieldset className="rolltable-mode">
          <legend>Row selection</legend>
          {["weighted", "range"].map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name={"table-mode-" + entry.id}
                value={mode}
                checked={(data.roll_mode || "weighted") === mode}
                onChange={() =>
                  change({
                    roll_mode: mode,
                    ...(mode === "range"
                      ? {
                          rows: rows.map((r, i) => ({
                            ...r,
                            min: r.min ?? i + 1,
                            max: r.max ?? i + 1,
                          })),
                        }
                      : {}),
                  })
                }
              />
              {mode === "weighted" ? "Weighted chance" : "Dice ranges"}
            </label>
          ))}
        </fieldset>
        {data.roll_mode === "range" && (
          <Field
            label="Range roll"
            value={data.range_formula || "1d20"}
            onChange={(range_formula) => change({ range_formula })}
            placeholder="1d20"
          />
        )}
        <Field
          label="Repeatable seed (optional)"
          value={seed}
          onChange={setSeed}
        />
        <button
          className="button primary"
          disabled={!!busy}
          onClick={() =>
            void perform("roll", async () => {
              if (!(await flush()))
                throw Error("Save or recover the table before rolling.");
              const response: any = await post(
                `/resources/${entry.id}/roll`,
                seed ? { seed } : {},
              );
              setResult(response.result);
            })
          }
        >
          <Dices size={16} />
          {busy === "roll" ? "Rolling…" : "Roll"}
        </button>
      </div>
      <p className="muted small-copy">
        {data.roll_mode === "range"
          ? "Inclusive ranges must not overlap. A roll in a gap returns an error."
          : "Weight 0 excludes a row. Higher weights make a row more likely."}
      </p>
      <div className="table-scroll rolltable-grid">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              {columns.map((col, i) => (
                <th key={col.id}>
                  <input
                    aria-label={"Column name " + (i + 1)}
                    value={col.label}
                    maxLength={100}
                    onChange={(e) =>
                      change({
                        columns: columns.map((c, n) =>
                          n === i ? { ...c, label: e.target.value } : c,
                        ),
                      })
                    }
                  />
                  <SearchableSelect
                    aria-label={"Type of " + col.label}
                    value={col.type || "text"}
                    onChange={(e) =>
                      change({
                        columns: columns.map((c, n) =>
                          n === i ? { ...c, type: e.target.value } : c,
                        ),
                      })
                    }
                  >
                    {types.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </SearchableSelect>
                  <div className="button-row">
                    <button
                      className="icon-button"
                      disabled={i === 0}
                      aria-label={"Move column " + (i + 1) + " left"}
                      onClick={() => {
                        const next = [...columns];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        change({ columns: next });
                      }}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={"Remove column " + (i + 1)}
                      onClick={() =>
                        change({ columns: columns.filter((c, n) => n !== i) })
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </th>
              ))}
              <th>
                {data.roll_mode === "range" ? "Inclusive range" : "Weight"}
              </th>
              <th>Order</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ row, index }) => (
              <tr key={row.id || index}>
                <td>{index + 1}</td>
                {columns.map((col) => (
                  <td key={col.id}>
                    {col.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        aria-label={col.label + " row " + (index + 1)}
                        checked={row.cells?.[col.id] === true}
                        onChange={(e) =>
                          rowChange(index, {
                            cells: { ...row.cells, [col.id]: e.target.checked },
                          })
                        }
                      />
                    ) : col.type === "article" ? (
                      <EntryPicker
                        label={col.label + " row " + (index + 1)}
                        entries={ctx.entries}
                        value={row.cells?.[col.id] || ""}
                        onChange={(id) =>
                          rowChange(index, {
                            cells: { ...row.cells, [col.id]: id },
                          })
                        }
                      />
                    ) : (
                      <input
                        aria-label={col.label + " row " + (index + 1)}
                        type={col.type === "number" ? "number" : "text"}
                        step="any"
                        value={row.cells?.[col.id] ?? row.value ?? ""}
                        onChange={(e) =>
                          rowChange(index, {
                            cells: {
                              ...row.cells,
                              [col.id]:
                                col.type === "number" && e.target.value !== ""
                                  ? Number(e.target.value)
                                  : e.target.value,
                            },
                          })
                        }
                      />
                    )}
                  </td>
                ))}
                <td>
                  {data.roll_mode === "range" ? (
                    <div className="rolltable-range">
                      {["min", "max"].map((key) => (
                        <input
                          key={key}
                          type="number"
                          aria-label={
                            (key === "min"
                              ? "Range start row "
                              : "Range end row ") +
                            (index + 1)
                          }
                          value={row[key] ?? ""}
                          onChange={(e) =>
                            rowChange(index, { [key]: Number(e.target.value) })
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={"Weight row " + (index + 1)}
                      value={row.weight ?? 1}
                      onChange={(e) =>
                        rowChange(index, { weight: Number(e.target.value) })
                      }
                    />
                  )}
                </td>
                <td>
                  <div className="button-row">
                    {[-1, 1].map((delta) => (
                      <button
                        key={delta}
                        className="icon-button"
                        disabled={
                          index + delta < 0 || index + delta >= rows.length
                        }
                        aria-label={
                          "Move row " +
                          (index + 1) +
                          (delta < 0 ? " up" : " down")
                        }
                        onClick={() => {
                          const next = [...rows];
                          [next[index], next[index + delta]] = [
                            next[index + delta],
                            next[index],
                          ];
                          change({ rows: next });
                        }}
                      >
                        {delta < 0 ? (
                          <ArrowUp size={13} />
                        ) : (
                          <ArrowDown size={13} />
                        )}
                      </button>
                    ))}
                    <button
                      className="icon-button"
                      aria-label={"Remove row " + (index + 1)}
                      onClick={() =>
                        change({ rows: rows.filter((r, i) => i !== index) })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lastPage > 0 && (
        <nav className="button-row" aria-label="Table row pages">
          <button
            className="button secondary small"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous rows
          </button>
          <span className="muted">
            {currentPage * 50 + 1}–
            {Math.min((currentPage + 1) * 50, visible.length)} of{" "}
            {visible.length}
          </span>
          <button
            className="button secondary small"
            disabled={currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}
          >
            Next rows
          </button>
        </nav>
      )}
      <div className="button-row">
        <button
          className="text-button"
          onClick={() =>
            change({
              rows: [
                ...rows,
                {
                  id: uid(),
                  cells: {},
                  weight: 1,
                  ...(data.roll_mode === "range"
                    ? {
                        min: rows.length
                          ? Math.max(...rows.map((r) => Number(r.max) || 0)) + 1
                          : 1,
                        max: rows.length
                          ? Math.max(...rows.map((r) => Number(r.max) || 0)) + 1
                          : 1,
                      }
                    : {}),
                },
              ],
            })
          }
        >
          <Plus size={14} />
          Add row
        </button>
        <button
          className="text-button"
          onClick={() =>
            change({
              columns: [
                ...columns,
                { id: uid(), label: "New column", type: "text" },
              ],
            })
          }
        >
          <Plus size={14} />
          Add column
        </button>
      </div>
      <details className="rolltable-composition" open={steps.length > 0}>
        <summary>
          Linked generation steps {steps.length ? `(${steps.length})` : ""}
        </summary>
        <p className="muted small-copy">
          Roll other tables in order. An optional exact cell match limits when a
          step runs. No script or formula is evaluated as a condition.
        </p>
        {steps.map((step, index) => (
          <div className="rolltable-step" key={step.id}>
            <Field
              label={"Step " + (index + 1) + " label"}
              value={step.label || ""}
              onChange={(label) => stepChange(index, { label })}
            />
            <EntryPicker
              label={"Step " + (index + 1) + " source"}
              entries={ctx.entries.filter(
                (e) =>
                  e.id !== entry.id && ["table", "generator"].includes(e.kind),
              )}
              value={step.resource_id || ""}
              onChange={(resource_id) => stepChange(index, { resource_id })}
            />
            <label className="field">
              <span>Run when</span>
              <SearchableSelect
                aria-label={"Step " + (index + 1) + " condition"}
                value={step.when_column || ""}
                onChange={(e) =>
                  stepChange(index, { when_column: e.target.value })
                }
              >
                <option value="">Always</option>
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} equals
                  </option>
                ))}
              </SearchableSelect>
            </label>
            {step.when_column && (
              <Field
                label={"Step " + (index + 1) + " exact match"}
                value={step.when_value || ""}
                onChange={(when_value) => stepChange(index, { when_value })}
              />
            )}
            <button
              className="icon-button"
              aria-label={"Remove step " + (index + 1)}
              onClick={() =>
                change({ generator_steps: steps.filter((s, i) => i !== index) })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          className="text-button"
          disabled={steps.length >= 12}
          onClick={() =>
            change({
              generator_steps: [
                ...steps,
                {
                  id: uid(),
                  label: "",
                  resource_id: "",
                  when_column: "",
                  when_value: "",
                },
              ],
            })
          }
        >
          <Plus size={14} />
          Add linked step
        </button>
      </details>
      {result && (
        <section className="rolltable-result" aria-label="Generated result">
          <header>
            <h3>Generated result</h3>
            <span className="muted">
              Source revision {result.source_revision}
            </span>
          </header>
          {result.selection_roll && (
            <p>
              {result.selection_roll.formula}:{" "}
              {result.selection_roll.rolls.join(", ")} →{" "}
              {result.selection_roll.total}
            </p>
          )}
          <pre>{resultText(result)}</pre>
          <div className="button-row">
            <button
              className="button secondary small"
              onClick={() =>
                void navigator.clipboard
                  .writeText(resultText(result))
                  .catch(() => setError("Could not access the clipboard."))
              }
            >
              <Copy size={14} />
              Copy result
            </button>
            <button
              className="button primary small"
              disabled={!!busy}
              onClick={() =>
                void perform("keep", async () => {
                  const text = resultText(result),
                    saved = await post<Entry>(
                      `/worlds/${ctx.world.id}/resources`,
                      {
                        title: (result.text || "Generated entry").slice(0, 180),
                        kind: "article",
                        template: "generic",
                        visibility: "private",
                        document: docFromText(text),
                      },
                    );
                  setResult(null);
                  await ctx.refresh();
                  ctx.go("entry/" + saved.id);
                })
              }
            >
              Keep as article
            </button>
          </div>
        </section>
      )}
      {incoming && (
        <Modal
          title="Review table import"
          wide
          onClose={() => {
            if (!busy) setIncoming(null);
          }}
        >
          <p>
            {incoming.preview.data.columns.length} columns ·{" "}
            {incoming.preview.data.rows.length} rows. Applying this preview
            replaces the table configuration; saved revisions remain in History.
          </p>
          {incoming.preview.warnings.map((warning: string) => (
            <p className="notice" key={warning}>
              {warning}
            </p>
          ))}
          {incoming.format === "csv" && (
            <div className="rolltable-import-mapping">
              {incoming.mapping.map((col: any, index: number) => (
                <label className="field" key={col.id}>
                  <span>{col.label}</span>
                  <SearchableSelect
                    aria-label={"Import type " + col.label}
                    value={col.type}
                    onChange={(e) =>
                      setIncoming({
                        ...incoming,
                        valid: false,
                        mapping: incoming.mapping.map((c: any, i: number) =>
                          i === index ? { ...c, type: e.target.value } : c,
                        ),
                      })
                    }
                  >
                    {types.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </SearchableSelect>
                </label>
              ))}
            </div>
          )}
          {importError && <ErrorBox message={importError} />}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {incoming.preview.data.columns.map((c: any) => (
                    <th key={c.id}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incoming.preview.data.rows
                  .slice(0, 5)
                  .map((r: any, i: number) => (
                    <tr key={i}>
                      {incoming.preview.data.columns.map((c: any) => (
                        <td key={c.id}>{String(r.cells?.[c.id] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => setIncoming(null)}
            >
              Cancel
            </button>
            {incoming.format === "csv" && (
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("preview");
                  setImportError("");
                  try {
                    const preview: any = await post(
                      `/resources/${entry.id}/table-exchange`,
                      {
                        text: incoming.text,
                        format: "csv",
                        columns: incoming.mapping,
                      },
                    );
                    setIncoming({ ...incoming, preview, valid: true });
                  } catch (e: any) {
                    setImportError(e.message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                Validate column types
              </button>
            )}
            <button
              className="button primary"
              disabled={!!busy || !incoming.valid}
              onClick={() => {
                change(incoming.preview.data);
                setIncoming(null);
              }}
            >
              Use this table
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
