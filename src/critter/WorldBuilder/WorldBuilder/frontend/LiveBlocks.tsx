import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import DOMPurify from "dompurify";
import { AppContext, Asset, Entry, api, docFromText, post } from "./domain";
import { ErrorBox, Modal } from "./ui";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Copy,
  Dices,
  GripVertical,
  Maximize2,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { MapCanvas as Map } from "./Maps";
import { TimelineEmbed as Timeline } from "./History";
import { RelationshipView as Relationships } from "./SavedGraphs";
export const liveKinds = new Set([
  "table",
  "generator",
  "map",
  "timeline",
  "relationship",
]);

function outputText(result: any, depth = 0): string {
  return [
    "  ".repeat(depth) +
      (result.step_label ? result.step_label + ": " : "") +
      result.text,
    ...(result.children || []).map((c: any) => outputText(c, depth + 1)),
  ].join("\n");
}

export function DiceControl({
  ctx,
  formula,
  label = "Roll",
  reader = false,
}: {
  ctx?: AppContext;
  formula: string;
  label?: string;
  reader?: boolean;
}) {
  const [result, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    scope = useRef("");
  scope.current = `${ctx?.world.id}:${formula}:${reader}`;
  useEffect(() => {
    setResult(null);
    setError("");
  }, [formula, ctx?.world.id, reader]);
  return (
    <span className="live-dice">
      <button
        type="button"
        className="button secondary small"
        disabled={!ctx || reader || busy}
        aria-label={`${label} ${formula}`}
        onClick={async () => {
          if (!ctx || reader || lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          const current = scope.current;
          try {
            const value = await post("/tools/dice", {
              world_id: ctx.world.id,
              formula,
            });
            if (scope.current === current) setResult(value);
          } catch (e: any) {
            if (scope.current === current) setError(e.message);
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <Dices size={14} />
        {busy ? "Rolling…" : `${label} · ${formula}`}
      </button>
      {result && (
        <output aria-live="polite">
          {result.rolls.map((roll: number, i: number) =>
            result.kept.includes(i) ? (
              <strong key={i}>{roll} </strong>
            ) : (
              <s key={i}>{roll} </s>
            ),
          )}
          {result.modifier
            ? ` ${result.modifier > 0 ? "+" : "−"} ${Math.abs(result.modifier)}`
            : ""}{" "}
          = <strong>{result.total}</strong>
        </output>
      )}
      {error && <span role="alert">{error}</span>}
    </span>
  );
}

type SourcePayload = {
  entry: Entry;
  assets: Asset[];
  links: Record<string, string>;
  audience: "owner" | "reader";
};
function TableView({
  value,
  ctx,
  reader,
  onInsert,
}: {
  value: SourcePayload;
  ctx: AppContext;
  reader: boolean;
  onInsert?: (text: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = useRef(false),
    source = value.entry;
  const columns: any[] = source.data.columns || [],
    rows: any[] = source.data.rows || [];
  const display = (row: any, c: any) => {
    const val = row.cells?.[c.id] ?? row.value ?? "";
    return c.type === "article"
      ? value.links[val] || "Unavailable entry"
      : typeof val === "boolean"
        ? val
          ? "Yes"
          : "No"
        : String(val);
  };
  const visible = rows.filter((r) =>
    columns.some((c) =>
      display(r, c).toLowerCase().includes(query.toLowerCase()),
    ),
  );
  const last = Math.max(0, Math.ceil(visible.length / 10) - 1),
    current = Math.min(page, last);
  useEffect(() => {
    setResult(null);
    setError("");
    setPage(0);
  }, [source.id, source.revision, reader]);
  return (
    <div className="live-table-view">
      <div className="live-table-tools">
        <input
          aria-label="Filter embedded table"
          placeholder="Find a row…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <span className="muted">{visible.length} rows</span>
        {!reader && (
          <button
            type="button"
            className="button primary small"
            disabled={busy}
            onClick={async () => {
              if (locked.current) return;
              locked.current = true;
              setBusy(true);
              setError("");
              try {
                setResult((await post(`/resources/${source.id}/roll`)).result);
              } catch (e: any) {
                setError(e.message);
              } finally {
                locked.current = false;
                setBusy(false);
              }
            }}
          >
            <Dices size={14} />
            {busy ? "Rolling…" : "Generate"}
          </button>
        )}
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.id}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible
              .slice(current * 10, current * 10 + 10)
              .map((row, index) => (
                <tr key={row.id || index}>
                  {columns.map((c) => (
                    <td key={c.id}>
                      {c.type === "dice" && row.cells?.[c.id] ? (
                        <DiceControl
                          ctx={ctx}
                          formula={row.cells[c.id]}
                          reader={reader}
                        />
                      ) : c.type === "article" &&
                        value.links[row.cells?.[c.id]] ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => ctx.go("entry/" + row.cells[c.id])}
                        >
                          {display(row, c)}
                        </button>
                      ) : (
                        display(row, c)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {last > 0 && (
        <nav className="button-row" aria-label="Embedded table pages">
          <button
            type="button"
            className="button secondary small"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            Previous rows
          </button>
          <span>
            {current * 10 + 1}–{Math.min((current + 1) * 10, visible.length)} of{" "}
            {visible.length}
          </span>
          <button
            type="button"
            className="button secondary small"
            disabled={current === last}
            onClick={() => setPage(current + 1)}
          >
            Next rows
          </button>
        </nav>
      )}
      {error && <ErrorBox message={error} />}
      {result && (
        <section
          className="live-generation"
          aria-label="Embedded generated result"
        >
          <pre>{outputText(result)}</pre>
          <div className="button-row">
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(outputText(result))
                  .catch(() => setError("Could not access the clipboard."))
              }
            >
              <Copy size={13} />
              Copy result
            </button>
            {onInsert && (
              <button
                type="button"
                className="button secondary small"
                onClick={() => onInsert(outputText(result))}
              >
                Insert result below
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function LiveSource({
  ctx,
  sourceId,
  reader = false,
  onInsert,
}: {
  ctx: AppContext;
  sourceId: string;
  reader?: boolean;
  onInsert?: (text: string) => void;
}) {
  const preference = `worldbuilder.live-block:${ctx.world.id}:${sourceId}:${reader}`;
  const element = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    if (nearby || !element.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearby(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [nearby]);
  const [value, setValue] = useState<SourcePayload | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [expanded, setExpanded] = useState(false),
    [collapsed, setCollapsed] = useState(() => {
      try {
        return localStorage.getItem(preference) === "collapsed";
      } catch {
        return false;
      }
    });
  useEffect(() => {
    try {
      localStorage.setItem(preference, collapsed ? "collapsed" : "open");
    } catch {}
  }, [collapsed, preference]);
  const revision = ctx.entries.find((e) => e.id === sourceId)?.revision;
  useEffect(() => {
    if (!nearby) return;
    let alive = true;
    setValue((old) =>
      old?.entry.id === sourceId &&
      old.audience === (reader ? "reader" : "owner")
        ? old
        : null,
    );
    setError("");
    api<SourcePayload>(
      `/resources/${sourceId}/live-source${reader ? "?audience=reader" : ""}`,
    )
      .then((v) => {
        if (!alive) return;
        if (v.entry.world_id !== ctx.world.id) {
          setError("This source belongs to another world.");
          return;
        }
        setValue(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [ctx.world.id, sourceId, reader, refresh, revision, nearby]);
  const content = () =>
    !value ? (
      <p className="muted">Loading source…</p>
    ) : ["table", "generator"].includes(value.entry.kind) ? (
      <TableView
        key={value.entry.id + ":" + value.entry.revision + ":" + reader}
        value={value}
        ctx={ctx}
        reader={reader}
        onInsert={reader ? undefined : onInsert}
      />
    ) : (
      <>
        {value.entry.kind === "map" &&
          (value.assets.find((a) => a.id === value.entry.data.asset_id) ? (
            <Map
              asset={value.assets.find(
                (a) => a.id === value.entry.data.asset_id,
              )}
              assets={value.assets}
              data={value.entry.data}
              readOnly
              mapKey={value.entry.id}
            />
          ) : (
            <p className="muted">No map image is available.</p>
          ))}
        {value.entry.kind === "timeline" && (
          <Timeline ctx={ctx} id={sourceId} reader={reader} />
        )}
        {value.entry.kind === "relationship" && (
          <Relationships ctx={ctx} id={sourceId} reader={reader} />
        )}
      </>
    );
  return (
    <section
      ref={element}
      className="live-source"
      aria-label="Live source block"
    >
      <header>
        <button
          type="button"
          className="text-button live-source-title"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          {value?.entry.title || "Live source"}
        </button>
        <div className="button-row">
          <span className="muted small-copy">
            {reader ? "Published view" : "Live original"}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh live source"
            onClick={() => setRefresh((n) => n + 1)}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Expand live source"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 size={14} />
          </button>
          {!reader && value && (
            <button
              type="button"
              className="icon-button"
              aria-label="Open source entry"
              onClick={() => ctx.go("entry/" + sourceId)}
            >
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      </header>
      {error ? (
        <ErrorBox message={error} />
      ) : (
        !collapsed && <div className="live-source-body">{content()}</div>
      )}
      {expanded && (
        <Modal
          title={value?.entry.title || "Live source"}
          wide
          onClose={() => setExpanded(false)}
        >
          {error ? <ErrorBox message={error} /> : content()}
        </Modal>
      )}
    </section>
  );
}

function SourceNodeView(props: any) {
  const ctx: AppContext | undefined = props.extension.options.context?.();
  return (
    <NodeViewWrapper
      className="source-node"
      contentEditable={false}
      onMouseDown={(event: React.MouseEvent<HTMLElement>) => {
        if ((event.target as Element).closest("button")) event.preventDefault();
      }}
    >
      <div className="source-node-controls">
        <span data-drag-handle title="Drag block">
          <GripVertical size={15} />
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Remove live block"
          onClick={() => props.deleteNode()}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {ctx ? (
        <LiveSource
          key={props.node.attrs.id}
          ctx={ctx}
          sourceId={props.node.attrs.id}
          onInsert={(text) => {
            const position = props.getPos();
            if (typeof position !== "number") return;
            props.editor
              .chain()
              .insertContentAt(
                position + props.node.nodeSize,
                docFromText(text).content || [],
              )
              .run();
          }}
        />
      ) : (
        <p>{props.node.attrs.label || "Live source"}</p>
      )}
    </NodeViewWrapper>
  );
}
function DiceNodeView(props: any) {
  return (
    <NodeViewWrapper
      as="span"
      className="dice-node"
      contentEditable={false}
      onMouseDown={(event: React.MouseEvent<HTMLElement>) => {
        if ((event.target as Element).closest("button")) event.preventDefault();
      }}
    >
      <DiceControl
        ctx={props.extension.options.context?.()}
        formula={props.node.attrs.formula}
        label={props.node.attrs.label || "Roll"}
      />
    </NodeViewWrapper>
  );
}
export const SourceBlock = Node.create({
  name: "sourceBlock",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() {
    return { context: () => undefined as AppContext | undefined };
  },
  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-live-source"),
      },
      label: {
        default: "Live source",
        parseHTML: (el) => el.getAttribute("data-label") || "Live source",
      },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-live-source]", priority: 1200 }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes({
        "data-live-source": HTMLAttributes.id,
        "data-label": HTMLAttributes.label,
        class: "source-token",
      }),
      HTMLAttributes.label || "Live source",
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SourceNodeView);
  },
});
export const DiceButton = Node.create({
  name: "diceButton",
  group: "inline",
  inline: true,
  atom: true,
  addOptions() {
    return { context: () => undefined as AppContext | undefined };
  },
  addAttributes() {
    return {
      formula: {
        default: "1d20",
        parseHTML: (el) => el.getAttribute("data-live-dice"),
      },
      label: {
        default: "Roll",
        parseHTML: (el) => el.getAttribute("data-dice-label") || "Roll",
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-live-dice]", priority: 1200 }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-live-dice": HTMLAttributes.formula,
        "data-dice-label": HTMLAttributes.label,
      },
      `${HTMLAttributes.label} (${HTMLAttributes.formula})`,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DiceNodeView);
  },
});

// Keep the server-rendered prose and place interactive views exactly at its native blocks.
export function LiveDocument({
  html,
  ctx,
  reader = false,
  className = "reader-prose",
}: {
  html: string;
  ctx: AppContext;
  reader?: boolean;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null),
    [slots, setSlots] = useState<HTMLElement[]>([]);
  const safe = useMemo(() => DOMPurify.sanitize(html), [html]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    element.innerHTML = safe;
    const blocks = [
      ...element.querySelectorAll<HTMLElement>(
        "[data-live-source], [data-live-dice]",
      ),
    ].slice(0, 40);
    blocks.forEach((block) => block.replaceChildren());
    setSlots(blocks);
  }, [safe]);
  return (
    <>
      <div ref={container} className={className} />
      {slots.map((slot, index) =>
        createPortal(
          slot.dataset.liveSource ? (
            <LiveSource
              key={slot.dataset.liveSource + String(reader)}
              ctx={ctx}
              sourceId={slot.dataset.liveSource}
              reader={reader}
            />
          ) : (
            <DiceControl
              ctx={ctx}
              formula={slot.dataset.liveDice || "1d20"}
              label={slot.dataset.diceLabel || "Roll"}
              reader={reader}
            />
          ),
          slot,
          String(index),
        ),
      )}
    </>
  );
}
