import React, { useEffect, useRef, useState } from "react";
import { AppContext, Entry, saveBeforeNavigate, api } from "./domain";
import { EntryPicker, ErrorBox, Field } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { NoteSave } from "./NotebookForms";

export function NotebookBoard({
  ctx,
  book,
  onSave,
  onPreview,
}: {
  ctx: AppContext;
  book: Entry;
  onSave: NoteSave;
  onPreview: (id: string) => void;
}) {
  const empty = { cards: [], edges: [] },
    [base, setBase] = useState(book),
    [board, setBoard] = useState<any>(() =>
      structuredClone(book.data.note_board || empty),
    ),
    [choice, setChoice] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [label, setLabel] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    drag = useRef<any>(null),
    surface = useRef<HTMLDivElement>(null);
  const dirty =
    JSON.stringify(board) !== JSON.stringify(base.data.note_board || empty);
  useEffect(() => {
    if (!dirty && book.revision > base.revision) {
      setBase(book);
      setBoard(structuredClone(book.data.note_board || empty));
    }
  }, [book.revision, dirty]);
  useEffect(() => {
    const previous = saveBeforeNavigate.current,
      guard = async () =>
        !busy &&
        (!dirty || confirm("Discard unsaved visual board changes?")) &&
        (previous ? await previous() : true);
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
  const update = (id: string, values: any) =>
    setBoard((v: any) => ({
      ...v,
      cards: v.cards.map((c: any) => (c.id === id ? { ...c, ...values } : c)),
    }));
  return (
    <section className="notebook-board">
      <h2>Visual note board</h2>
      <p className="muted">
        Arrange original notes and lore, annotate cards and label their
        connections. Previewing a source keeps your current draft open.
      </p>
      {error && <ErrorBox message={error} />}
      <fieldset disabled={busy} className="session-guide-form-fields">
        <EntryPicker
          label="Board original to add"
          value={choice}
          onChange={setChoice}
          entries={ctx.entries.filter(
            (e) => e.kind !== "folder" && e.id !== book.id,
          )}
        />
        <div className="button-row">
          <button
            className="button secondary"
            disabled={!choice || board.cards.length >= 150}
            onClick={() => {
              setBoard({
                ...board,
                cards: [
                  ...board.cards,
                  {
                    id: crypto.randomUUID(),
                    entry_id: choice,
                    x: 30 + (board.cards.length % 4) * 250,
                    y: 30 + Math.floor(board.cards.length / 4) * 190,
                    caption: "",
                    color: "#f5e9b9",
                  },
                ],
              });
              setChoice("");
            }}
          >
            Add original card
          </button>
          <button
            className="button primary"
            disabled={busy || !dirty}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await onSave({
                  action: "board",
                  book_id: base.id,
                  expected_revision: base.revision,
                  board,
                });
                setBase(result.entry);
              } catch (e: any) {
                setError(e.message + " Your board draft remains here.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save visual board
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              if (
                dirty &&
                !confirm("Discard this board draft and reload the saved board?")
              )
                return;
              setBusy(true);
              try {
                const latest = await api<Entry>("/resources/" + book.id);
                setBase(latest);
                setBoard(structuredClone(latest.data.note_board || empty));
                setError("");
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Reload saved board
          </button>
        </div>
        <div className="notebook-board-viewport" ref={surface}>
          <div
            className="notebook-board-surface"
            onPointerMove={(e) => {
              if (!drag.current || !surface.current) return;
              const r = surface.current.getBoundingClientRect();
              update(drag.current.id, {
                x: Math.max(
                  0,
                  Math.min(
                    5000,
                    e.clientX -
                      r.left +
                      surface.current.scrollLeft -
                      drag.current.dx,
                  ),
                ),
                y: Math.max(
                  0,
                  Math.min(
                    5000,
                    e.clientY -
                      r.top +
                      surface.current.scrollTop -
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
            <svg className="notebook-board-lines" width="5300" height="5300">
              {board.edges.map((edge: any) => {
                const a = board.cards.find((c: any) => c.id === edge.source),
                  b = board.cards.find((c: any) => c.id === edge.target);
                return a && b ? (
                  <g key={edge.id}>
                    <line
                      x1={a.x + 110}
                      y1={a.y + 80}
                      x2={b.x + 110}
                      y2={b.y + 80}
                      stroke="#697a64"
                      strokeWidth="2"
                    />
                    <text
                      x={(a.x + b.x) / 2 + 110}
                      y={(a.y + b.y) / 2 + 70}
                      textAnchor="middle"
                    >
                      {edge.label}
                    </text>
                  </g>
                ) : null;
              })}
            </svg>
            {board.cards.map((card: any) => {
              const source = ctx.entries.find((e) => e.id === card.entry_id),
                image = ctx.assets.find(
                  (a) =>
                    a.id ===
                    (source?.data.cover_asset || source?.data.asset_id),
                );
              return (
                <article
                  className="notebook-visual-card"
                  key={card.id}
                  data-notebook-card={card.id}
                  style={{ left: card.x, top: card.y, background: card.color }}
                >
                  <button
                    className="notebook-card-handle"
                    aria-label={
                      "Move card " + (source?.title || "Unavailable original")
                    }
                    onPointerDown={(e) => {
                      if (busy) return;
                      const r =
                        e.currentTarget.parentElement!.getBoundingClientRect();
                      drag.current = {
                        id: card.id,
                        dx: e.clientX - r.left,
                        dy: e.clientY - r.top,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onKeyDown={(e) => {
                      const d: Record<string, number[]> = {
                        ArrowLeft: [-10, 0],
                        ArrowRight: [10, 0],
                        ArrowUp: [0, -10],
                        ArrowDown: [0, 10],
                      };
                      if (d[e.key]) {
                        e.preventDefault();
                        update(card.id, {
                          x: Math.max(0, Math.min(5000, card.x + d[e.key][0])),
                          y: Math.max(0, Math.min(5000, card.y + d[e.key][1])),
                        });
                      }
                    }}
                  >
                    {source?.title || "Unavailable original"}
                  </button>
                  {(image || source?.data.cover_url) && (
                    <img
                      referrerPolicy="no-referrer"
                      src={image?.url || source?.data.cover_url}
                      alt=""
                    />
                  )}
                  <textarea
                    aria-label={"Card annotation " + card.id}
                    rows={3}
                    value={card.caption}
                    onChange={(e) =>
                      update(card.id, { caption: e.target.value })
                    }
                  />
                  <div className="button-row">
                    <button
                      className="text-button"
                      disabled={!source}
                      onClick={() => onPreview(card.entry_id)}
                    >
                      Preview source
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        setBoard({
                          ...board,
                          cards: board.cards.filter(
                            (c: any) => c.id !== card.id,
                          ),
                          edges: board.edges.filter(
                            (e: any) =>
                              e.source !== card.id && e.target !== card.id,
                          ),
                        })
                      }
                    >
                      Unpin card
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <div className="field-grid">
          {[
            ["Connection from", from, setFrom],
            ["Connection to", to, setTo],
          ].map(([title, value, setter]: any) => (
            <label className="field" key={title}>
              <span>{title}</span>
              <SearchableSelect
                value={value}
                onChange={(e) => setter(e.target.value)}
              >
                <option value="">Choose card</option>
                {board.cards.map((c: any) => (
                  <option value={c.id} key={c.id}>
                    {ctx.entries.find((e) => e.id === c.entry_id)?.title ||
                      "Unavailable original"}
                  </option>
                ))}
              </SearchableSelect>
            </label>
          ))}
        </div>
        <Field
          label="Board connection label"
          value={label}
          onChange={setLabel}
        />
        <button
          className="button secondary"
          disabled={!from || !to || from === to || board.edges.length >= 300}
          onClick={() => {
            setBoard({
              ...board,
              edges: [
                ...board.edges,
                { id: crypto.randomUUID(), source: from, target: to, label },
              ],
            });
            setLabel("");
          }}
        >
          Connect original cards
        </button>
        {board.edges.map((e: any) => (
          <div className="notebook-form-row" key={e.id}>
            <strong>{e.label || "Connection"}</strong>
            <button
              className="text-button"
              onClick={() =>
                setBoard({
                  ...board,
                  edges: board.edges.filter((r: any) => r.id !== e.id),
                })
              }
            >
              Remove board connection
            </button>
          </div>
        ))}
      </fieldset>
    </section>
  );
}
