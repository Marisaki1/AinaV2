import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Compass,
  FolderOpen,
  MapPin,
  Users,
  Flag,
  ArrowRight,
  ArrowLeft,
  LayoutGrid,
  List,
  Bookmark,
  Search,
} from "lucide-react";
import { AppContext, Entry, api, post, uid, human, text } from "./domain";
import { ErrorBox, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { LiveDocument } from "./LiveBlocks";
import { StructuredReader } from "./StructuredFields";
import { imageURL } from "./LinkedPortrait";
import { MapGuide } from "./MapGuide";
import { isLocationEntry } from "./domain";

type Card = {
  id: string;
  title: string;
  kind: string;
  template: string;
  section: string;
  summary: string;
  tags: string[];
  cover_asset: string;
  cover_url: string;
  parent: string;
  revision: number;
};
type Browse = {
  entries: Card[];
  total: number;
  page: number;
  pages: number;
  sections: Record<string, number>;
  collections: Card[];
  trail: { id: string; title: string }[];
};
type Shelf = { id: string; name: string; entries: string[] };
type Shelves = { revision: number; shelves: Shelf[] };
type Filters = {
  query: string;
  section: string;
  tag: string;
  parent: string;
  shelf: string;
  sort: string;
  page: number;
  include_internal: boolean;
};
const defaults: Filters = {
  query: "",
  section: "all",
  tag: "",
  parent: "",
  shelf: "",
  sort: "title",
  page: 0,
  include_internal: false,
};
const sections = [
  ["all", "Everything", Compass],
  ["people", "People", Users],
  ["places", "Places", MapPin],
  ["groups", "Factions & groups", Flag],
  ["stories", "Campaign & stories", BookOpen],
  ["reference", "Reference", Bookmark],
] as const;
function read<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (
      value === null ||
      typeof value !== typeof fallback ||
      (Array.isArray(fallback) && !Array.isArray(value))
    )
      return fallback;
    return value;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function cover(
  ctx: AppContext,
  card: { cover_asset?: string; cover_url?: string },
) {
  return (
    ctx.assets.find((a) => a.id === card.cover_asset)?.url ||
    imageURL(card.cover_url || "")
  );
}

function Artwork({
  src,
  title,
  section,
}: {
  src: string;
  title: string;
  section: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const Icon = sections.find((s) => s[0] === section)?.[2] || BookOpen;
  return (
    <div className={"explorer-art explorer-art-" + section}>
      {src && !failed ? (
        <img
          src={src}
          alt={title}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon size={42} aria-hidden="true" />
      )}
    </div>
  );
}

export function WorldExplorer({ ctx }: { ctx: AppContext }) {
  const key = "worldbuilder.explorer:" + ctx.world.id;
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaults,
    ...read<Partial<Filters>>(key, {}),
  }));
  const [layout, setLayout] = useState(() =>
    read<string>(key + ":layout", "grid"),
  );
  const [result, setResult] = useState<Browse | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const [shelves, setShelves] = useState<Shelves | null>(null),
    [shelfError, setShelfError] = useState("");
  const [editing, setEditing] = useState<Shelf | null>(null);
  const [selected, setSelected] = useState(() =>
    read<string>(key + ":entry", ""),
  );
  const opener = useRef<HTMLElement | null>(null);
  const reloadShelves = async () => {
    const next = await api<Shelves>(`/worlds/${ctx.world.id}/explorer/shelves`);
    setShelves(next);
    setShelfError("");
    return next;
  };
  useEffect(() => {
    let alive = true;
    api<Shelves>(`/worlds/${ctx.world.id}/explorer/shelves`)
      .then((v) => {
        if (alive) setShelves(v);
      })
      .catch((e) => {
        if (alive) setShelfError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [ctx.world.id]);
  useEffect(() => {
    store(key, filters);
    let alive = true;
    setBusy(true);
    setError("");
    const timer = setTimeout(() => {
      post<Browse>(`/worlds/${ctx.world.id}/explorer`, filters)
        .then((v) => {
          if (alive) setResult(v);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setBusy(false);
        });
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [ctx.world.id, JSON.stringify(filters), retry]);
  useEffect(() => store(key + ":layout", layout), [layout, key]);
  useEffect(() => store(key + ":entry", selected), [selected, key]);
  const change = (value: Partial<Filters>) =>
    setFilters((v) => ({ ...v, ...value, page: 0 }));
  const open = (id: string) => {
    opener.current = document.activeElement as HTMLElement;
    setSelected(id);
  };
  const close = () => {
    setSelected("");
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
  };
  const tags = [...new Set(ctx.entries.flatMap((e) => e.tags))].sort((a, b) =>
    a.localeCompare(b),
  );
  const shelf = shelves?.shelves.find((s) => s.id === filters.shelf);
  const newShelf = () => {
    const saved = read<Shelf | null>(key + ":shelf-draft", null);
    setEditing(
      saved &&
        typeof saved.id === "string" &&
        typeof saved.name === "string" &&
        Array.isArray(saved.entries) &&
        saved.entries.every((id) => typeof id === "string")
        ? saved
        : { id: uid(), name: "", entries: [] },
    );
  };
  return (
    <div className="page explorer-page">
      <header className="explorer-hero">
        <div>
          <span className="eyebrow">WORLD EXPLORER</span>
          <h1>{ctx.world.name}</h1>
          <p>
            {ctx.world.tagline ||
              "People, places and the stories that connect them."}
          </p>
        </div>
        <div className="explorer-hero-actions">
          <button className="button secondary" onClick={newShelf}>
            <Bookmark size={16} />
            New shelf
          </button>
          <button className="text-button" onClick={() => ctx.go("library")}>
            Open library
            <ArrowRight size={16} />
          </button>
        </div>
      </header>
      {shelfError && <ErrorBox message={shelfError} />}
      <div className="explorer-toolbar">
        <label className="explorer-search">
          <Search size={17} />
          <input
            aria-label="Search explorer"
            placeholder="Find a name, place or passage…"
            maxLength={200}
            value={filters.query}
            onChange={(e) => change({ query: e.target.value })}
          />
        </label>
        <SearchableSelect
          aria-label="Explorer shelf"
          value={filters.shelf}
          onChange={(e) =>
            change({
              shelf: e.target.value,
              sort: e.target.value ? "shelf" : "title",
            })
          }
        >
          <option value="">All shelves</option>
          {shelves?.shelves.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SearchableSelect>
        <SearchableSelect
          aria-label="Explorer tag"
          value={filters.tag}
          onChange={(e) => change({ tag: e.target.value })}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SearchableSelect>
        <SearchableSelect
          aria-label="Explorer sort"
          value={filters.sort}
          onChange={(e) => change({ sort: e.target.value })}
        >
          <option value="title">Title</option>
          <option value="recent">Recently edited</option>
          <option value="shelf">Shelf order</option>
        </SearchableSelect>
        <div className="explorer-view-switch" aria-label="Explorer layout">
          <button
            aria-label="Card view"
            aria-pressed={layout === "grid"}
            onClick={() => setLayout("grid")}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            aria-label="List view"
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      <nav className="explorer-sections" aria-label="Explore by subject">
        {sections.map(([id, label, Icon]) => (
          <button
            key={id}
            aria-pressed={filters.section === id}
            onClick={() => change({ section: id })}
          >
            <Icon size={18} />
            {label}
            <span>{result?.sections[id] ?? "–"}</span>
          </button>
        ))}
      </nav>
      <div className="explorer-location">
        <nav aria-label="Explorer collections">
          <button onClick={() => change({ parent: "" })}>
            All collections
          </button>
          {result?.trail.map((r) => (
            <React.Fragment key={r.id}>
              <span>/</span>
              <button onClick={() => change({ parent: r.id })}>
                {r.title}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <label>
          <input
            type="checkbox"
            checked={filters.include_internal}
            onChange={(e) => change({ include_internal: e.target.checked })}
          />
          Include transcripts & research
        </label>
      </div>
      {shelf && (
        <div className="explorer-shelf-banner">
          <Bookmark size={20} />
          <div>
            <strong>{shelf.name}</strong>
            <small>{shelf.entries.length} original references</small>
          </div>
          <button
            className="text-button"
            onClick={() => setEditing(structuredClone(shelf))}
          >
            Edit shelf
          </button>
        </div>
      )}
      {!!result?.collections.length && (
        <div className="explorer-collections">
          {result.collections.map((c) => (
            <button key={c.id} onClick={() => change({ parent: c.id })}>
              <FolderOpen size={20} />
              {c.title}
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      )}
      {error ? (
        <div>
          <ErrorBox message={error} />
          <button
            className="button secondary"
            onClick={() => setRetry((v) => v + 1)}
          >
            Retry explorer
          </button>
          <button className="text-button" onClick={() => setFilters(defaults)}>
            Reset explorer filters
          </button>
        </div>
      ) : (
        <>
          <div className="explorer-results-meta" role="status">
            {busy ? "Loading entries…" : `${result?.total ?? 0} entries`}
            {filters.query && ` matching “${filters.query}”`}
          </div>
          <div
            className={
              "explorer-cards " + (layout === "list" ? "explorer-list" : "")
            }
            aria-busy={busy}
          >
            {result?.entries.map((c) => (
              <button
                key={c.id}
                className="explorer-card"
                disabled={busy}
                onClick={() => open(c.id)}
              >
                <Artwork
                  src={cover(ctx, c)}
                  title={c.title}
                  section={c.section}
                />
                <div className="explorer-card-copy">
                  <span className="eyebrow">
                    {human(c.template === "generic" ? c.kind : c.template)}
                  </span>
                  <h2>{c.title}</h2>
                  <p>{c.summary || "No overview yet."}</p>
                  <div className="explorer-card-tags">
                    {c.tags.slice(0, 3).map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
                <ArrowRight className="explorer-card-arrow" size={18} />
              </button>
            ))}
          </div>
          {!busy && result?.total === 0 && (
            <div className="explorer-empty">
              <Compass size={36} />
              <h2>No entries in this view</h2>
              <p>
                Choose another subject, collection or shelf, or clear the
                filters.
              </p>
              <button
                className="button secondary"
                onClick={() => setFilters(defaults)}
              >
                Show all entries
              </button>
            </div>
          )}
          {result && result.pages > 1 && (
            <div className="explorer-pagination">
              <button
                className="button secondary"
                disabled={busy || result.page === 0}
                onClick={() =>
                  setFilters((v) => ({ ...v, page: result.page - 1 }))
                }
              >
                Previous page
              </button>
              <span>
                Page {result.page + 1} of {result.pages}
              </span>
              <button
                className="button secondary"
                disabled={busy || result.page + 1 === result.pages}
                onClick={() =>
                  setFilters((v) => ({ ...v, page: result.page + 1 }))
                }
              >
                Next page
              </button>
            </div>
          )}
        </>
      )}
      {selected && (
        <ExplorerReader
          key={selected}
          ctx={ctx}
          id={selected}
          sequence={
            shelf?.entries.filter((id) =>
              ctx.entries.some((e) => e.id === id),
            ) || []
          }
          open={setSelected}
          close={close}
        />
      )}
      {editing && shelves && (
        <ShelfEditor
          ctx={ctx}
          initial={editing}
          settings={shelves}
          reload={reloadShelves}
          close={() => setEditing(null)}
          draftKey={key + ":shelf-draft"}
          saved={(value) => {
            setShelves(value);
            if (
              filters.shelf &&
              !value.shelves.some((s) => s.id === filters.shelf)
            )
              change({ shelf: "", sort: "title" });
            setEditing(null);
            setRetry((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

function ExplorerReader({
  ctx,
  id,
  open,
  close,
  sequence,
}: {
  ctx: AppContext;
  id: string;
  open: (id: string) => void;
  close: () => void;
  sequence: string[];
}) {
  const [value, setValue] = useState<{
      entry: Entry;
      connections: {
        id: string;
        title: string;
        label: string;
        direction: string;
      }[];
      connection_total: number;
      links: { id: string; title: string }[];
    } | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const reader = useRef<HTMLDivElement>(null);
  const restoring = useRef(true),
    stopRestore = useRef<() => void>(() => {});
  const key = "worldbuilder.explorer-reading:" + ctx.world.id + ":" + id;
  const [gmOpen, setGmOpen] = useState(() => read<boolean>(key + ":gm", false));
  const [history, setHistory] = useState<string[]>(() =>
    read<string[]>("worldbuilder.explorer-trail:" + ctx.world.id, []),
  );
  useEffect(() => {
    let alive = true;
    setValue(null);
    setError("");
    api<any>(`/resources/${id}/explorer`)
      .then((v) => {
        if (alive) {
          setValue(v);
          const trail = [id, ...history.filter((v) => v !== id)].slice(0, 20);
          store("worldbuilder.explorer-trail:" + ctx.world.id, trail);
          setHistory(trail);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, retry]);
  useEffect(() => {
    if (!value || !reader.current) return;
    const element = reader.current;
    const pos = read<number>(key, 0);
    restoring.current = true;
    const restore = () => {
      if (restoring.current) element.scrollTop = pos;
    };
    const observer = new ResizeObserver(restore);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    const finish = () => {
      restoring.current = false;
      observer.disconnect();
    };
    stopRestore.current = finish;
    for (const type of ["pointerdown", "wheel", "touchstart", "keydown"])
      element.addEventListener(type, finish, { capture: true, passive: true });
    const frame = requestAnimationFrame(restore);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const type of ["pointerdown", "wheel", "touchstart", "keydown"])
        element.removeEventListener(type, finish, true);
    };
  }, [value]);
  const entry = value?.entry;
  const placeInShelf = sequence.indexOf(id);
  const headings: { label: string; index: number }[] = [];
  function scan(node: any) {
    if (node.type === "heading")
      headings.push({ label: text(node), index: headings.length });
    for (const child of node.content || []) scan(child);
  }
  if (entry) scan(entry.document || {});
  const recent = history
    .filter((v) => v !== id)
    .map((v) => ctx.entries.find((e) => e.id === v))
    .filter((v): v is Entry => !!v)
    .slice(0, 5);
  return (
    <Modal title={entry?.title || "Reading entry"} onClose={close} wide>
      <div className="explorer-reader-shell">
        {error ? (
          <div>
            <ErrorBox message={error} />
            <button
              className="button secondary"
              onClick={() => setRetry((v) => v + 1)}
            >
              Retry entry
            </button>
          </div>
        ) : !entry ? (
          <p role="status">Loading original…</p>
        ) : (
          <>
            <div
              className="explorer-reading"
              ref={reader}
              onScroll={() => {
                if (!restoring.current)
                  store(key, reader.current?.scrollTop || 0);
              }}
              tabIndex={0}
              aria-label="Entry reading pane"
            >
              <div className="explorer-reading-content">
                {cover(ctx, {
                  cover_asset: entry.data.cover_asset || entry.data.asset_id,
                  cover_url: entry.data.cover_url,
                }) && (
                  <Artwork
                    src={cover(ctx, {
                      cover_asset:
                        entry.data.cover_asset || entry.data.asset_id,
                      cover_url: entry.data.cover_url,
                    })}
                    title={entry.title}
                    section="reference"
                  />
                )}
                <div className="explorer-reading-intro">
                  <span className="eyebrow">
                    {human(
                      entry.template === "generic"
                        ? entry.kind
                        : entry.template,
                    )}{" "}
                    · OWNER VIEW
                  </span>
                  <h2>{entry.title}</h2>
                  {entry.summary && <p>{entry.summary}</p>}
                  <div className="explorer-card-tags">
                    {entry.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
                {entry.data.structured_schema && (
                  <StructuredReader entry={entry} />
                )}
                {!entry.data.structured_schema && entry.data.fields && (
                  <dl className="reader-fields">
                    {(
                      ctx.templates.find((t) => t.id === entry.template)
                        ?.fields || []
                    )
                      .filter(
                        (k) =>
                          entry.data.fields[k] !== undefined &&
                          entry.data.fields[k] !== "",
                      )
                      .map((k) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>
                            {typeof entry.data.fields[k] === "object"
                              ? JSON.stringify(entry.data.fields[k])
                              : String(entry.data.fields[k])}
                          </dd>
                        </div>
                      ))}
                  </dl>
                )}
                <LiveDocument ctx={ctx} html={entry.html || ""} />
                {entry.kind === "map" && <MapGuide ctx={ctx} mapId={id} />}
                {!text(entry.document || { type: "doc" }).trim() &&
                  !entry.summary && (
                    <p className="muted">
                      This entry has no written notes yet.
                    </p>
                  )}
                {entry.private_notes && (
                  <details
                    className="explorer-private"
                    open={gmOpen}
                    onToggle={(event) => {
                      setGmOpen(event.currentTarget.open);
                      store(key + ":gm", event.currentTarget.open);
                    }}
                  >
                    <summary>Private GM notes</summary>
                    <p>{entry.private_notes}</p>
                  </details>
                )}
              </div>
            </div>
            <aside className="explorer-reading-context">
              {placeInShelf >= 0 && (
                <section
                  className="explorer-sequence"
                  aria-label="Shelf reading order"
                >
                  <h3>
                    Reading shelf · {placeInShelf + 1}/{sequence.length}
                  </h3>
                  <button
                    disabled={placeInShelf === 0}
                    onClick={() => open(sequence[placeInShelf - 1])}
                  >
                    Previous in shelf
                  </button>
                  <button
                    disabled={placeInShelf + 1 === sequence.length}
                    onClick={() => open(sequence[placeInShelf + 1])}
                  >
                    Next in shelf
                  </button>
                </section>
              )}
              <button
                className="button primary"
                onClick={() => ctx.go("entry/" + id)}
              >
                Edit original
                <ArrowRight size={16} />
              </button>
              <button
                className="text-button"
                onClick={() => setRetry((v) => v + 1)}
              >
                Refresh original
              </button>
              {!!headings.length && (
                <section>
                  <h3>On this page</h3>
                  {headings.map((h) => (
                    <button
                      className="text-button"
                      key={h.index}
                      onClick={() => {
                        stopRestore.current();
                        const el = reader.current?.querySelectorAll(
                          ".reader-prose h1,.reader-prose h2,.reader-prose h3,.reader-prose h4,.reader-prose h5,.reader-prose h6",
                        )[h.index] as HTMLElement;
                        if (el && reader.current)
                          reader.current.scrollTop +=
                            el.getBoundingClientRect().top -
                            reader.current.getBoundingClientRect().top -
                            16;
                      }}
                    >
                      {h.label || "Untitled heading"}
                    </button>
                  ))}
                </section>
              )}
              <section>
                <h3>
                  Connections
                  {value!.connection_total
                    ? ` · ${value!.connection_total}`
                    : ""}
                </h3>
                {value!.connections.length ? (
                  value!.connections.map((r, i) => (
                    <button key={r.id + ":" + i} onClick={() => open(r.id)}>
                      <strong>{r.title}</strong>
                      <small>
                        {r.direction === "incoming" ? "←" : "→"} {r.label}
                      </small>
                    </button>
                  ))
                ) : (
                  <p className="muted">No recorded connections.</p>
                )}
                {value!.connection_total > 60 && (
                  <p className="muted">Showing the first 60 connections.</p>
                )}
              </section>
              {!!value!.links.length && (
                <section>
                  <h3>Linked in these notes</h3>
                  {value!.links.map((r) => (
                    <button key={r.id} onClick={() => open(r.id)}>
                      {r.title}
                    </button>
                  ))}
                </section>
              )}
              {!!recent.length && (
                <section>
                  <h3>Recently read</h3>
                  {recent.map((r) => (
                    <button key={r.id} onClick={() => open(r.id)}>
                      <ArrowLeft size={13} />
                      {r.title}
                    </button>
                  ))}
                </section>
              )}
              {(["character", "session", "quest", "task"].includes(
                entry.kind,
              ) ||
                isLocationEntry(entry)) && (
                <button
                  className="text-button"
                  onClick={() =>
                    ctx.go(
                      isLocationEntry(entry)
                        ? "locations/" + id
                        : entry.kind === "character"
                          ? "characters/" + id
                          : entry.kind === "session"
                            ? "sessions/" + id
                            : "threads/" + id,
                    )
                  }
                >
                  Open full guide
                </button>
              )}
            </aside>
          </>
        )}
      </div>
    </Modal>
  );
}

function ShelfEditor({
  ctx,
  initial,
  settings,
  reload,
  close,
  saved,
  draftKey,
}: {
  ctx: AppContext;
  initial: Shelf;
  settings: Shelves;
  reload: () => Promise<Shelves>;
  close: () => void;
  saved: (v: Shelves) => void;
  draftKey: string;
}) {
  const [draft, setDraft] = useState(initial),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    [revision, setRevision] = useState(settings.revision);
  const available = ctx.entries.filter(
    (e) =>
      e.kind !== "folder" &&
      (e.title + " " + e.tags.join(" "))
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(available.length / 36)),
    current = Math.min(page, pages - 1);
  useEffect(() => store(draftKey, draft), [draft, draftKey]);
  const act = async (action: string) => {
    if (lock.current) return;
    if (
      action === "delete" &&
      !window.confirm("Delete this shelf? Its original entries will remain.")
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await post<Shelves>(
        `/worlds/${ctx.world.id}/explorer/shelves`,
        { ...draft, action, expected_revision: revision },
      );
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      saved(next);
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const move = (index: number, delta: number) => {
    const ids = [...draft.entries];
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    setDraft({ ...draft, entries: ids });
  };
  return (
    <Modal
      title={
        settings.shelves.some((s) => s.id === draft.id)
          ? "Edit explorer shelf"
          : "New explorer shelf"
      }
      onClose={close}
      wide
    >
      <div className="explorer-shelf-editor">
        {error && <ErrorBox message={error} />}
        <label className="field">
          <span>Shelf name</span>
          <input
            data-autofocus
            aria-label="Shelf name"
            maxLength={80}
            value={draft.name}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <div className="explorer-shelf-columns">
          <section>
            <h3>Choose originals</h3>
            <input
              aria-label="Find shelf entries"
              placeholder="Filter names and tags…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <div className="explorer-shelf-options">
              {available.slice(current * 36, current * 36 + 36).map((e) => (
                <label key={e.id}>
                  <input
                    type="checkbox"
                    disabled={
                      busy ||
                      (!draft.entries.includes(e.id) &&
                        draft.entries.length >= 120)
                    }
                    checked={draft.entries.includes(e.id)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        entries: event.target.checked
                          ? [...draft.entries, e.id]
                          : draft.entries.filter((v) => v !== e.id),
                      })
                    }
                  />
                  <span>
                    {e.title}
                    <small>
                      {human(e.template === "generic" ? e.kind : e.template)}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <div className="explorer-pagination">
              <button
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                Previous entries
              </button>
              <small>
                {current + 1} / {pages}
              </small>
              <button
                disabled={current + 1 === pages}
                onClick={() => setPage(current + 1)}
              >
                Next entries
              </button>
            </div>
          </section>
          <section>
            <h3>Reading order · {draft.entries.length}/120</h3>
            <div className="explorer-shelf-order">
              {draft.entries.map((id, index) => (
                <div key={id}>
                  <span>
                    {ctx.entries.find((e) => e.id === id)?.title ||
                      "Unavailable original"}
                  </span>
                  <button
                    disabled={busy || index === 0}
                    aria-label={"Move shelf entry " + (index + 1) + " earlier"}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    disabled={busy || index + 1 === draft.entries.length}
                    aria-label={"Move shelf entry " + (index + 1) + " later"}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    disabled={busy}
                    aria-label={"Remove shelf entry " + (index + 1)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        entries: draft.entries.filter((v) => v !== id),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="modal-actions">
          {settings.shelves.some((s) => s.id === draft.id) && (
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => void act("delete")}
            >
              Delete shelf
            </button>
          )}
          {error && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const latest = await reload();
                  setRevision(latest.revision);
                  setError("");
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reload shelf settings
            </button>
          )}
          <button className="button secondary" disabled={busy} onClick={close}>
            Keep draft
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              try {
                localStorage.removeItem(draftKey);
              } catch {}
              close();
            }}
          >
            Discard draft
          </button>
          <button
            className="button primary"
            disabled={busy || !draft.name.trim()}
            onClick={() => void act("save")}
          >
            {busy ? "Saving…" : "Save shelf"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
