import React, { useEffect, useRef, useState } from "react";
import { AppContext, Entry, saveBeforeNavigate, api, post } from "./domain";
import { BoardDrawing } from "./BoardDrawing";
import { boardSVG } from "./board-export";
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
    [board, setRawBoard] = useState<any>(() =>
      structuredClone(book.data.note_board || empty),
    ),
    [choice, setChoice] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [label, setLabel] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [drawingHost, setDrawingHost] = useState<HTMLDivElement | null>(null),
    [historyVersion, setHistoryVersion] = useState(0),
    [recovered, setRecovered] = useState<any>(() => {
      try {
        return JSON.parse(
          localStorage.getItem("worldbuilder.board-draft:" + book.id) || "null",
        );
      } catch {
        return null;
      }
    }),
    undo = useRef<any[]>([]),
    redo = useRef<any[]>([]),
    upload = useRef<HTMLInputElement>(null),
    drag = useRef<any>(null),
    surface = useRef<HTMLDivElement>(null);
  const dirty =
    JSON.stringify(board) !== JSON.stringify(base.data.note_board || empty);
  const checkpoint = () => {
    undo.current = [...undo.current.slice(-39), structuredClone(board)];
    redo.current = [];
    setHistoryVersion((n) => n + 1);
  };
  const setBoard = (next: any) => {
    checkpoint();
    setRawBoard(next);
  };
  useEffect(() => {
    try {
      if (!recovered) {
        if (dirty)
          localStorage.setItem(
            "worldbuilder.board-draft:" + book.id,
            JSON.stringify({ board, revision: base.revision }),
          );
        else localStorage.removeItem("worldbuilder.board-draft:" + book.id);
      }
    } catch {
      setError(
        "Board recovery storage is full. Save or export your draft before leaving.",
      );
    }
  }, [board, base.revision, dirty, recovered]);
  useEffect(() => {
    if (!dirty && book.revision > base.revision) {
      setBase(book);
      setRawBoard(structuredClone(book.data.note_board || empty));
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
    setRawBoard((v: any) => ({
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
      {recovered && (
        <div className="button-row">
          <span>An unfinished board draft is available.</span>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await post<any>(
                  `/worlds/${ctx.world.id}/notebooks`,
                  {
                    action: "board_preview",
                    book_id: base.id,
                    world_id: ctx.world.id,
                    board: recovered.board,
                  },
                );
                setRawBoard(result.board);
                setBase({ ...base, revision: recovered.revision });
                setRecovered(null);
              } catch (e: any) {
                setError(e.message + " Your recovery copy is retained.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Recover board draft
          </button>
          <button
            className="text-button"
            onClick={() => {
              setRecovered(null);
              localStorage.removeItem("worldbuilder.board-draft:" + book.id);
            }}
          >
            Discard recovered board
          </button>
        </div>
      )}
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
            className="text-button"
            disabled={!undo.current.length}
            onClick={() => {
              redo.current.push(structuredClone(board));
              setRawBoard(undo.current.pop());
              setHistoryVersion((n) => n + 1);
            }}
          >
            Undo board edit
          </button>
          <button
            className="text-button"
            disabled={!redo.current.length}
            onClick={() => {
              undo.current.push(structuredClone(board));
              setRawBoard(redo.current.pop());
              setHistoryVersion((n) => n + 1);
            }}
          >
            Redo board edit
          </button>
          <button
            className="text-button"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        format: "worldbuilder-note-board-v1",
                        world_id: ctx.world.id,
                        board,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "note-board.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export board JSON
          </button>
          <button
            className="text-button"
            onClick={() => upload.current?.click()}
          >
            Import board JSON
          </button>
          <button
            className="text-button"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([boardSVG(board, ctx.entries)], {
                  type: "image/svg+xml",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "note-board.svg";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export board SVG
          </button>
          <input
            hidden
            ref={upload}
            type="file"
            accept=".json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                if (file.size > 4000000)
                  throw Error("Use a board smaller than 4 MB.");
                const data = JSON.parse(await file.text());
                if (data.format !== "worldbuilder-note-board-v1")
                  throw Error("Choose a WorldBuilder note board.");
                const preview = await post<any>(
                  `/worlds/${ctx.world.id}/notebooks`,
                  {
                    action: "board_preview",
                    book_id: base.id,
                    world_id: data.world_id,
                    board: data.board,
                  },
                );
                if (
                  confirm(
                    "Replace this board draft with the imported board? Save visual board commits it.",
                  )
                )
                  setBoard(preview.board);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
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
                setRecovered(null);
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
                setRawBoard(structuredClone(latest.data.note_board || empty));
                undo.current = [];
                redo.current = [];
                setRecovered(null);
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
        <div ref={setDrawingHost} />
        <div className="notebook-board-viewport" ref={surface}>
          <div
            className="notebook-board-surface"
            style={{ pointerEvents: busy ? "none" : undefined }}
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
            <BoardDrawing
              board={board}
              edit={setBoard}
              update={setRawBoard}
              checkpoint={checkpoint}
              toolbarHost={drawingHost}
            />
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
                      checkpoint();
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
                        checkpoint();
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
