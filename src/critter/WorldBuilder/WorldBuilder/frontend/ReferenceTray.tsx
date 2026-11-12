import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { AppContext, Entry, api } from "./domain";
import { EntryPicker, ErrorBox, Modal } from "./ui";
import { MapGuide } from "./MapGuide";

export function ReferenceTray({ ctx }: { ctx: AppContext }) {
  const key = "worldbuilder.reference-tray." + ctx.world.id;
  const initial = () => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "{}");
      return {
        ids: Array.isArray(v.ids)
          ? v.ids.filter((id: any) => typeof id === "string").slice(0, 12)
          : [],
        selected: typeof v.selected === "string" ? v.selected : "",
      };
    } catch {
      return { ids: [], selected: "" };
    }
  };
  const [state, setState] = useState<{ ids: string[]; selected: string }>(
      initial,
    ),
    [open, setOpen] = useState(false),
    [wide, setWide] = useState(false),
    [choice, setChoice] = useState(""),
    [payload, setPayload] = useState<{
      id: string;
      revision: number;
      entry: Entry;
    } | null>(null),
    [error, setError] = useState(""),
    [map, setMap] = useState(false);
  const origin = useRef<{ element: HTMLElement | null; range: Range | null }>({
    element: null,
    range: null,
  });
  const revision = ctx.entries.find((e) => e.id === state.selected)?.revision;
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  useEffect(() => {
    let alive = true;
    setError("");
    if (open && state.selected)
      api<Entry>("/resources/" + state.selected)
        .then((entry) => {
          if (entry.world_id !== ctx.world.id)
            throw Error("This reference belongs to another world.");
          if (alive)
            setPayload({ id: entry.id, revision: entry.revision, entry });
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [open, state.selected, revision]);
  const remember = (e: React.MouseEvent) => {
    if (!open) {
      const selection = getSelection();
      origin.current = {
        element: document.activeElement as HTMLElement,
        range: selection?.rangeCount
          ? selection.getRangeAt(0).cloneRange()
          : null,
      };
    }
    e.preventDefault();
  };
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => {
      const { element, range } = origin.current;
      if (element?.isConnected) element.focus({ preventScroll: true });
      if (range?.commonAncestorContainer.isConnected) {
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    });
  };
  const entry = payload?.id === state.selected ? payload.entry : null;
  return (
    <aside
      className={
        "reference-tray " + (open ? "open " : "") + (wide ? "wide" : "")
      }
      aria-label="Persistent reference tray"
    >
      <div className="reference-tray-heading">
        <button
          className="button secondary"
          onMouseDown={remember}
          onClick={() => (open ? close() : setOpen(true))}
          aria-expanded={open}
        >
          {open ? "Fold references" : "References"} · {state.ids.length}
        </button>
        {open && (
          <button className="text-button" onClick={() => setWide(!wide)}>
            {wide ? "Narrow" : "Widen"}
          </button>
        )}
      </div>
      {open && (
        <div className="reference-tray-body">
          <p className="muted small-copy">
            Inspect original references alongside your draft. Folding returns
            focus and cursor to the editor.
          </p>
          <EntryPicker
            label="Add tray reference"
            value={choice}
            onChange={setChoice}
            entries={ctx.entries.filter(
              (e) => e.kind !== "folder" && !state.ids.includes(e.id),
            )}
          />
          <button
            className="button secondary small"
            disabled={!choice || state.ids.length >= 12}
            onClick={() => {
              setState({ ids: [...state.ids, choice], selected: choice });
              setChoice("");
            }}
          >
            Pin to tray
          </button>
          <div className="reference-tray-tabs">
            {state.ids.map((id) => (
              <button
                className={id === state.selected ? "active" : ""}
                key={id}
                onClick={() => setState({ ...state, selected: id })}
              >
                {ctx.entries.find((e) => e.id === id)?.title ||
                  "Unavailable reference"}
              </button>
            ))}
          </div>
          {error && <ErrorBox message={error} />}
          {entry ? (
            <article>
              <h2>{entry.title}</h2>
              {(ctx.assets.find(
                (a) =>
                  a.id ===
                  (entry.kind === "map"
                    ? entry.data.asset_id
                    : entry.data.cover_asset),
              )?.url ||
                entry.data.cover_url) && (
                <img
                  className="desk-pin-image"
                  src={
                    ctx.assets.find(
                      (a) =>
                        a.id ===
                        (entry.kind === "map"
                          ? entry.data.asset_id
                          : entry.data.cover_asset),
                    )?.url || entry.data.cover_url
                  }
                  referrerPolicy="no-referrer"
                  alt=""
                />
              )}
              <div
                className="reader-prose"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(entry.html || ""),
                }}
              />
              {entry.kind === "map" && (
                <button
                  className="button secondary"
                  onClick={() => setMap(true)}
                >
                  Inspect tray map
                </button>
              )}
              {Object.keys(entry.data.fields || {}).length > 0 && (
                <dl>
                  {Object.entries(entry.data.fields).map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value ?? "")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {entry.private_notes && (
                <details>
                  <summary>GM reference notes</summary>
                  <p className="campaign-record-excerpt">
                    {entry.private_notes}
                  </p>
                </details>
              )}
              <button
                className="text-button"
                onClick={() => ctx.go("entry/" + entry.id)}
              >
                Open original editor
              </button>
            </article>
          ) : state.selected && !error ? (
            <p role="status">Loading reference…</p>
          ) : (
            <p className="muted">Pin a note, character, location or map.</p>
          )}
          {state.selected && (
            <button
              className="text-button"
              onClick={() => {
                const ids = state.ids.filter((id) => id !== state.selected);
                setState({ ids, selected: ids[0] || "" });
              }}
            >
              Remove from tray
            </button>
          )}
        </div>
      )}
      {map && entry?.kind === "map" && (
        <Modal title="Reference tray map" wide onClose={() => setMap(false)}>
          <MapGuide ctx={ctx} mapId={entry.id} />
        </Modal>
      )}
    </aside>
  );
}
