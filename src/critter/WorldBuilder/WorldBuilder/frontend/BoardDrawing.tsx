import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SearchableSelect } from "./SearchableSelect";

export function BoardDrawing({
  board,
  edit,
  update,
  checkpoint,
  toolbarHost,
}: {
  board: any;
  edit: (v: any) => void;
  update: (v: any) => void;
  checkpoint: () => void;
  toolbarHost: HTMLElement | null;
}) {
  const [tool, setTool] = useState("select"),
    [color, setColor] = useState("#315c45"),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<number[][] | null>(null);
  const drag = useRef<any>(null),
    svg = useRef<SVGSVGElement>(null);
  const point = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(5000, e.clientX - r.left)),
      Math.max(0, Math.min(5000, e.clientY - r.top)),
    ];
  };
  const shapes = board.shapes || [],
    strokes = board.strokes || [];
  const shape = shapes.find((v: any) => v.id === selected);
  const change = (patch: any) =>
    edit({
      ...board,
      shapes: shapes.map((v: any) =>
        v.id === selected ? { ...v, ...patch } : v,
      ),
    });
  return (
    <>
      {toolbarHost &&
        createPortal(
          <div className="board-drawing-tools">
            <label>
              Board tool
              <SearchableSelect
                aria-label="Board tool"
                value={tool}
                onChange={(e) => setTool(e.target.value)}
              >
                <option value="select">Select / move shapes</option>
                <option value="pen">Freehand</option>
                <option value="rectangle">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="text">Text box</option>
              </SearchableSelect>
            </label>
            <label>
              Drawing color
              <input
                aria-label="Drawing color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <label>
              Edit shape
              <SearchableSelect
                aria-label="Edit shape"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Choose a shape</option>
                {shapes.map((s: any, i: number) => (
                  <option key={s.id} value={s.id}>
                    {s.text || s.type + " " + (i + 1)}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            {shape && (
              <div className="board-shape-fields">
                <label>
                  Shape text
                  <textarea
                    aria-label="Shape text"
                    value={shape.text}
                    onChange={(e) => change({ text: e.target.value })}
                  />
                </label>
                {["x", "y", "width", "height"].map((k) => (
                  <label key={k}>
                    {k}
                    <input
                      aria-label={"Shape " + k}
                      type="number"
                      min={k === "x" || k === "y" ? 0 : 10}
                      max="5000"
                      value={shape[k]}
                      onChange={(e) =>
                        change({
                          [k]: Math.max(
                            k === "x" || k === "y" ? 0 : 10,
                            Math.min(5000, Number(e.target.value)),
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  Shape color
                  <input
                    type="color"
                    value={shape.color}
                    onChange={(e) => change({ color: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => {
                    edit({
                      ...board,
                      shapes: shapes.filter((s: any) => s.id !== selected),
                    });
                    setSelected("");
                  }}
                >
                  Delete shape
                </button>
              </div>
            )}
            {strokes.length > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  edit({ ...board, strokes: strokes.slice(0, -1) })
                }
              >
                Remove last stroke
              </button>
            )}
          </div>,
          toolbarHost,
        )}
      <svg
        ref={svg}
        className={
          "board-drawing-layer " + (tool === "select" ? "select" : "drawing")
        }
        width="5300"
        height="5300"
        aria-label="Board drawing canvas"
        onPointerDown={(e) => {
          if (tool === "select") return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDraft([point(e)]);
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            const p = point(e);
            const moving = {...drag.current};
            update((b: any) => ({
              ...b,
              shapes: (b.shapes || []).map((s: any) =>
                s.id === moving.id
                  ? {
                      ...s,
                      x: Math.max(0, Math.min(5000, p[0] - moving.dx)),
                      y: Math.max(0, Math.min(5000, p[1] - moving.dy)),
                    }
                  : s,
              ),
            }));
            return;
          }
          if (!draft) return;
          const p = point(e);
          setDraft(
            tool === "pen" ? [...draft.slice(0, 999), p] : [draft[0], p],
          );
        }}
        onPointerUp={() => {
          drag.current = null;
          if (!draft) return;
          const points = draft;
          setDraft(null);
          if (tool === "pen") {
            if (points.length > 1 && strokes.length < 100)
              edit({
                ...board,
                strokes: [
                  ...strokes,
                  { id: crypto.randomUUID(), color, points },
                ],
              });
          } else if (shapes.length < 100) {
            const a = points[0],
              b = points.at(-1)!;
            const s = {
              id: crypto.randomUUID(),
              type: tool,
              color,
              x: Math.min(a[0], b[0]),
              y: Math.min(a[1], b[1]),
              width: Math.max(120, Math.abs(a[0] - b[0])),
              height: Math.max(80, Math.abs(a[1] - b[1])),
              text: "",
            };
            edit({ ...board, shapes: [...shapes, s] });
            setSelected(s.id);
          }
          setTool("select");
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDraft(null);
        }}
      >
        {shapes.map((s: any) => (
          <g
            key={s.id}
            data-board-shape={s.id}
            style={{
              pointerEvents: tool === "select" ? "auto" : "none",
              cursor: "move",
            }}
            onPointerDown={(e) => {
              if (tool !== "select") return;
              e.stopPropagation();
              checkpoint();
              setSelected(s.id);
              const p = point(e);
              drag.current = { id: s.id, dx: p[0] - s.x, dy: p[1] - s.y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
          >
            {s.type === "ellipse" ? (
              <ellipse
                cx={s.x + s.width / 2}
                cy={s.y + s.height / 2}
                rx={s.width / 2}
                ry={s.height / 2}
                fill={s.color}
                fillOpacity=".15"
                stroke={s.color}
                strokeWidth={selected === s.id ? 4 : 2}
              />
            ) : (
              <rect
                x={s.x}
                y={s.y}
                width={s.width}
                height={s.height}
                fill={s.color}
                fillOpacity={s.type === "text" ? ".04" : ".15"}
                stroke={s.color}
                strokeWidth={selected === s.id ? 4 : 2}
              />
            )}
            <text x={s.x + 12} y={s.y + 26} fill={s.color}>
              {s.text
                .split("\n")
                .slice(0, 25)
                .map((line: string, i: number) => (
                  <tspan key={i} x={s.x + 12} dy={i ? 20 : 0}>
                    {line}
                  </tspan>
                ))}
            </text>
          </g>
        ))}
        {strokes.map((s: any) => (
          <polyline
            key={s.id}
            points={s.points.map((p: number[]) => p.join(",")).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth="3"
          />
        ))}
        {draft && (
          <polyline
            points={draft.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="3"
          />
        )}
      </svg>
    </>
  );
}
