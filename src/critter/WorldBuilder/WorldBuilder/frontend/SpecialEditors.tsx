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

export { TableEditor } from "./RollTableEditor";

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
