import { SearchableSelect } from "./SearchableSelect";
import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  MapPin,
  MousePointer2,
  Route,
  Shapes,
  Type,
  Check,
  Upload,
  Dices,
  ArrowUp,
  ArrowDown,
  Link2,
  Image as ImageIcon,
  EyeOff,
  Layers,
} from "lucide-react";
import {
  AppContext,
  Entry,
  Asset,
  post,
  uid,
  docFromText,
  human,
  saveBeforeNavigate,
} from "./domain";
import {
  Badge,
  Empty,
  EntryPicker,
  ErrorBox,
  Field,
  Modal,
  Section,
} from "./ui";

export { MapCanvas, MapEditor } from "./Maps";

export { CalendarEditor } from "./Calendars";

export function TableEditor({
  entry,
  data,
  setData,
  ctx,
}: {
  entry: Entry;
  data: Record<string, any>;
  setData: (v: Record<string, any>) => void;
  ctx: AppContext;
}) {
  const columns: any[] = data.columns || [
      {
        id: "value",
        label: entry.kind === "generator" ? "Result" : "Result",
        type: "text",
      },
    ],
    rows: any[] = data.rows || [];
  const [result, setResult] = useState<any>(null),
    [csv, setCsv] = useState<any>(null),
    file = useRef<HTMLInputElement>(null);
  const rowChange = (id: string, patch: any) =>
    setData({
      ...data,
      columns,
      rows: rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  return (
    <>
      <div className="section-heading">
        <p className="muted">
          Edit your entries and their relative chances. A weight of zero
          excludes a row.
        </p>
        <div className="button-row">
          <input
            type="file"
            accept=".csv,text/csv"
            ref={file}
            hidden
            onChange={async (e) => {
              try {
                const selected = e.target.files?.[0];
                if (selected)
                  setCsv(
                    await post("/tools/csv", { text: await selected.text() }),
                  );
              } catch (error: any) {
                ctx.notify(error.message, true);
              }
              e.target.value = "";
            }}
          />
          <button
            className="button secondary small"
            onClick={() => file.current?.click()}
          >
            <Upload size={15} />
            Import CSV
          </button>
          <button
            className="button secondary small"
            onClick={() =>
              setData({
                ...data,
                columns: [
                  ...columns,
                  { id: uid(), label: "New column", type: "text" },
                ],
                rows,
              })
            }
          >
            <Plus size={15} />
            Column
          </button>
          <button
            className="button primary small"
            onClick={async () => {
              if (
                !saveBeforeNavigate.current ||
                (await saveBeforeNavigate.current())
              ) {
                try {
                  setResult(
                    (await post("/resources/" + entry.id + "/roll")).result,
                  );
                } catch (e: any) {
                  ctx.notify(e.message, true);
                }
              }
            }}
          >
            <Dices size={16} />
            Roll
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.id}>
                  <input
                    aria-label="Column name"
                    value={col.label}
                    onChange={(e) =>
                      setData({
                        ...data,
                        columns: columns.map((c) =>
                          c.id === col.id ? { ...c, label: e.target.value } : c,
                        ),
                        rows,
                      })
                    }
                  />
                  <SearchableSelect
                    aria-label={"Type of " + col.label}
                    value={col.type || "text"}
                    onChange={(e) =>
                      setData({
                        ...data,
                        columns: columns.map((c) =>
                          c.id === col.id ? { ...c, type: e.target.value } : c,
                        ),
                        rows,
                      })
                    }
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="article">Entry link</option>
                    <option value="dice">Dice formula</option>
                  </SearchableSelect>
                </th>
              ))}
              <th className="weight">Weight</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id}>
                {columns.map((col) => (
                  <td key={col.id}>
                    {col.type === "checkbox" ? (
                      <input
                        aria-label={col.label + " row " + (i + 1)}
                        type="checkbox"
                        checked={!!row.cells?.[col.id]}
                        onChange={(e) =>
                          rowChange(row.id, {
                            cells: { ...row.cells, [col.id]: e.target.checked },
                          })
                        }
                      />
                    ) : col.type === "article" ? (
                      <SearchableSelect
                        aria-label={col.label + " row " + (i + 1)}
                        value={row.cells?.[col.id] || ""}
                        onChange={(e) =>
                          rowChange(row.id, {
                            cells: { ...row.cells, [col.id]: e.target.value },
                          })
                        }
                      >
                        <option value="">Choose…</option>
                        {ctx.entries.map((r) => (
                          <option value={r.id} key={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </SearchableSelect>
                    ) : (
                      <input
                        aria-label={col.label + " row " + (i + 1)}
                        type={col.type === "number" ? "number" : "text"}
                        value={row.cells?.[col.id] ?? row.value ?? ""}
                        onChange={(e) =>
                          rowChange(row.id, {
                            cells: {
                              ...row.cells,
                              [col.id]:
                                col.type === "number"
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
                  <input
                    aria-label={"Weight row " + (i + 1)}
                    type="number"
                    min={0}
                    value={row.weight ?? 1}
                    onChange={(e) =>
                      rowChange(row.id, { weight: Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={"Remove row " + (i + 1)}
                    onClick={() =>
                      setData({
                        ...data,
                        columns,
                        rows: rows.filter((r) => r.id !== row.id),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="text-button table-add"
        onClick={() =>
          setData({
            ...data,
            columns,
            rows: [...rows, { id: uid(), weight: 1, cells: {} }],
          })
        }
      >
        <Plus size={16} />
        Add row
      </button>
      {result && (
        <div className="roll-result">
          <Dices size={24} />
          <div>
            <small>YOUR RESULT</small>
            <h3>
              {columns
                .map((col) => {
                  const v = result.cells?.[col.id] ?? result.value ?? "";
                  return col.type === "article"
                    ? ctx.entries.find((e) => e.id === v)?.title ||
                        "Unavailable entry"
                    : col.type === "dice" && result.rolled?.[col.id]
                      ? String(v) + " = " + result.rolled[col.id].total
                      : String(v);
                })
                .join(" · ")}
            </h3>
          </div>
          <button
            className="button secondary small"
            onClick={async () => {
              try {
                const label = columns
                  .map((c) =>
                    String(result.cells?.[c.id] ?? result.value ?? ""),
                  )
                  .join(" · ");
                const r = await post<Entry>(
                  "/worlds/" + ctx.world.id + "/resources",
                  {
                    title: label.slice(0, 180) || "Generated entry",
                    document: docFromText(label),
                    kind: "article",
                    template: "generic",
                  },
                );
                await ctx.refresh();
                ctx.go("entry/" + r.id);
              } catch (e: any) {
                ctx.notify(e.message, true);
              }
            }}
          >
            Keep as article
          </button>
        </div>
      )}
      {csv && (
        <Modal title="Review CSV import" onClose={() => setCsv(null)}>
          <p>
            {csv.columns.length} columns and {csv.rows.length} rows will replace
            this table’s current contents. Previous saved revisions remain in
            History.
          </p>
          <div className="notice">
            {csv.columns.map((c: any) => c.label).join(" · ")}
          </div>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setCsv(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => {
                setData({ ...data, ...csv });
                setCsv(null);
              }}
            >
              Use this table
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function BoardEditor({
  data,
  setData,
  ctx,
}: {
  data: Record<string, any>;
  setData: (v: Record<string, any>) => void;
  ctx: AppContext;
}) {
  const cards: any[] = data.cards || [];
  const [selected, setSelected] = useState<string | null>(null),
    [connecting, setConnecting] = useState(false),
    [pick, setPick] = useState(false);
  const board = useRef<HTMLDivElement>(null),
    drag = useRef<any>(null);
  const add = (resource?: Entry) => {
    const card = {
      id: uid(),
      x: 50 + (cards.length % 4) * 235,
      y: 55 + Math.floor(cards.length / 4) * 165,
      text: resource?.title || "A new idea…",
      color: "#f5e9b9",
      resource_id: resource?.id || "",
    };
    setData({ ...data, cards: [...cards, card] });
    setSelected(card.id);
    setPick(false);
  };
  const update = (id: string, patch: any) =>
    setData({
      ...data,
      cards: cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  return (
    <>
      <div className="section-heading">
        <p className="muted">
          Arrange ideas, connect them, and keep your world within reach.
        </p>
        <div className="button-row">
          <button className="button secondary small" onClick={() => add()}>
            <Plus size={15} />
            Note
          </button>
          <button
            className="button secondary small"
            onClick={() => setPick(true)}
          >
            <Link2 size={15} />
            World entry
          </button>
          <button
            className={"button small " + (connecting ? "primary" : "secondary")}
            onClick={() => {
              setConnecting(!connecting);
              setSelected(null);
            }}
          >
            <Route size={15} />
            {connecting ? "Choose two cards" : "Connect"}
          </button>
        </div>
      </div>
      <div
        ref={board}
        className="whiteboard"
        onPointerMove={(e) => {
          if (!drag.current || !board.current) return;
          const bounds = board.current.getBoundingClientRect();
          update(drag.current.id, {
            x: Math.max(
              0,
              Math.min(
                1100,
                e.clientX -
                  bounds.left +
                  board.current.scrollLeft -
                  drag.current.dx,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                700,
                e.clientY -
                  bounds.top +
                  board.current.scrollTop -
                  drag.current.dy,
              ),
            ),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <svg
          className="board-lines"
          viewBox="0 0 1400 900"
          preserveAspectRatio="none"
        >
          {(data.connections || []).map((edge: any) => {
            const a = cards.find((c) => c.id === edge.source),
              b = cards.find((c) => c.id === edge.target);
            return a && b ? (
              <line
                key={edge.id}
                x1={((a.x + 100) / 1400) * 1400}
                y1={a.y + 60}
                x2={b.x + 100}
                y2={b.y + 60}
                stroke="#8a9b90"
                strokeWidth="2"
              />
            ) : null;
          })}
        </svg>
        {cards.map((card) => (
          <div
            className={"board-card " + (selected === card.id ? "selected" : "")}
            key={card.id}
            style={{ left: card.x, top: card.y, background: card.color }}
          >
            <button
              className="board-handle"
              aria-label={"Move " + card.text}
              onPointerDown={(e) => {
                if (connecting) {
                  if (selected && selected !== card.id) {
                    setData({
                      ...data,
                      connections: [
                        ...(data.connections || []),
                        { id: uid(), source: selected, target: card.id },
                      ],
                    });
                    setConnecting(false);
                    setSelected(null);
                  } else setSelected(card.id);
                  return;
                }
                setSelected(card.id);
                const bounds =
                  e.currentTarget.parentElement!.getBoundingClientRect();
                drag.current = {
                  id: card.id,
                  dx: e.clientX - bounds.left,
                  dy: e.clientY - bounds.top,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
            >
              ⠿ <span>{card.resource_id ? "Linked entry" : "Idea"}</span>
            </button>
            <textarea
              aria-label="Board note"
              value={card.text}
              onChange={(e) => update(card.id, { text: e.target.value })}
            />
            <div className="board-card-footer">
              {card.resource_id ? (
                <button
                  className="text-button"
                  onClick={() => ctx.go("entry/" + card.resource_id)}
                >
                  Open entry ↗
                </button>
              ) : (
                <input
                  aria-label="Note color"
                  type="color"
                  value={card.color}
                  onChange={(e) => update(card.id, { color: e.target.value })}
                />
              )}
              <button
                className="icon-button"
                aria-label="Remove board card"
                onClick={() =>
                  setData({
                    ...data,
                    cards: cards.filter((c) => c.id !== card.id),
                    connections: (data.connections || []).filter(
                      (e: any) => e.source !== card.id && e.target !== card.id,
                    ),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {pick && (
        <Modal title="Add a world entry" onClose={() => setPick(false)}>
          <div className="picker-list">
            {ctx.entries
              .filter((e) => e.id !== data.id)
              .map((e) => (
                <button key={e.id} onClick={() => add(e)}>
                  {e.title}
                  <Badge>{human(e.template)}</Badge>
                </button>
              ))}
          </div>
        </Modal>
      )}
    </>
  );
}
