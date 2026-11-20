import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  AppContext,
  api,
  post,
  saveBeforeNavigate,
  uid,
  kindLabels,
  human,
  when,
} from "./domain";
import { SearchableSelect } from "./SearchableSelect";
import { Badge, ErrorBox, Modal } from "./ui";
import {
  ArrowRight,
  Bookmark,
  Image,
  Network,
  Search,
  Trash2,
  X,
} from "lucide-react";

type Filters = {
  query: string;
  scope: string;
  kind: string;
  tag: string;
  status: string;
  visibility: string;
  sort: string;
};
const defaults: Filters = {
  query: "",
  scope: "all",
  kind: "",
  tag: "",
  status: "",
  visibility: "",
  sort: "relevance",
};
type Result = {
  id: string;
  scope: string;
  kind: string;
  title: string;
  context: string;
  excerpt: string;
  matched_in: string;
  updated_at: string;
  tags: string[];
  source?: string;
  target?: string;
  source_title?: string;
  target_title?: string;
  url?: string;
  revision: number;
};
type Results = {
  results: Result[];
  total: number;
  page: number;
  pages: number;
  scopes: Record<string, number>;
  kinds: Record<string, number>;
};
type Saved = {
  revision: number;
  saved: { id: string; name: string; filters: Filters }[];
};
function Highlight({ text, query }: { text: string; query: string }) {
  const words = query
    .replace(/"/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const matcher = new RegExp(`(${words.join("|")})`, "ig");
  return (
    <>
      {text
        .split(matcher)
        .map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}
    </>
  );
}
export function WorldSearch({
  ctx,
  close,
}: {
  ctx: AppContext;
  close: () => void;
}) {
  const cache = "worldbuilder.search-view:" + ctx.world.id;
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem(cache) || "{}"),
      };
    } catch {
      return defaults;
    }
  });
  const [filtersOpen, setFiltersOpen] = useState(() => {
    try {
      return localStorage.getItem(cache + ":panel") === "open";
    } catch {
      return false;
    }
  });
  const [page, setPage] = useState(0),
    [result, setResult] = useState<Results | null>(null),
    [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<any>(null),
    [previewError, setPreviewError] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null),
    [saveError, setSaveError] = useState(""),
    [editing, setEditing] = useState<{ id: string; name: string } | null>(null),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false),
    [retry, setRetry] = useState(0);
  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };
  const [loadingSaved, setLoadingSaved] = useState(false);
  const loadSaved = async () => {
    setLoadingSaved(true);
    try {
      setSaved(await api<Saved>(`/worlds/${ctx.world.id}/saved-searches`));
      setSaveError("");
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setLoadingSaved(false);
    }
  };
  useEffect(() => {
    void loadSaved();
  }, [ctx.world.id]);
  useEffect(() => {
    try {
      localStorage.setItem(cache, JSON.stringify(filters));
    } catch {}
  }, [cache, filters]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () =>
        void post<Results>(`/worlds/${ctx.world.id}/search`, { filters, page })
          .then((value) => {
            if (!alive) return;
            setResult(value);
            setSelected((previous) =>
              value.results.some((r) => r.scope + ":" + r.id === previous)
                ? previous
                : value.results[0]
                  ? value.results[0].scope + ":" + value.results[0].id
                  : "",
            );
          })
          .catch((e) => {
            if (alive) {
              setError(e.message);
              setResult(null);
            }
          })
          .finally(() => {
            if (alive) setLoading(false);
          }),
      180,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [ctx.world.id, JSON.stringify(filters), page, retry]);
  const active = result?.results.find((r) => r.scope + ":" + r.id === selected);
  useEffect(() => {
    if (active && document.activeElement === input.current)
      document
        .getElementById("world-search-row-" + active.scope + active.id)
        ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  useEffect(() => {
    let alive = true;
    setPreview(null);
    setPreviewError("");
    if (!active) return;
    if (active.scope === "images") {
      setPreview(active);
      return;
    }
    api(
      active.scope === "relationships"
        ? `/connections/${active.id}`
        : `/resources/${active.id}`,
    )
      .then((value) => {
        if (alive) setPreview(value);
      })
      .catch((e) => {
        if (alive) setPreviewError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [selected, active?.revision, retry]);
  const navigate = async (path: string) => {
    if (saveBeforeNavigate.current && !(await saveBeforeNavigate.current()))
      return;
    close();
    ctx.go(path);
  };
  const open = async (row: Result) => {
    if (row.scope === "relationships") {
      try {
        localStorage.setItem(
          `worldbuilder.relationship-board:${ctx.world.id}:all`,
          JSON.stringify({
            selected: row.source,
            detail: row.id,
            query: "",
            category: "all",
            page: 0,
          }),
        );
        localStorage.setItem(
          "worldbuilder.relationship-mode:" + ctx.world.id,
          "all",
        );
      } catch {}
      await navigate("relationships");
    } else
      await navigate((row.scope === "images" ? "media/" : "entry/") + row.id);
  };
  const saveDefinition = async (value: any) => {
    if (!saved || lock.current || loadingSaved) return;
    lock.current = true;
    setBusy(true);
    setSaveError("");
    try {
      setSaved(
        await post<Saved>(`/worlds/${ctx.world.id}/saved-searches`, {
          ...value,
          expected_revision: saved.revision,
        }),
      );
      setEditing(null);
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const scopes = [
    ["all", "All", result?.total],
    ["entries", "Entries", result?.scopes.entries],
    ["images", "Images", result?.scopes.images],
    ["relationships", "Relationships", result?.scopes.relationships],
  ];
  return (
    <div className="world-search-workspace">
      <label className="command-search">
        <Search size={20} />
        <input
          ref={input}
          autoFocus
          data-autofocus
          aria-label="Search all world content"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="world-search-matches"
          aria-activedescendant={
            active ? "world-search-row-" + active.scope + active.id : undefined
          }
          placeholder="Names, phrases, notes, images or connections…"
          value={filters.query}
          onChange={(e) => update({ query: e.target.value })}
          onKeyDown={(e) => {
            if (!result?.results.length || loading) return;
            const index = Math.max(
              0,
              result.results.findIndex(
                (r) => r.scope + ":" + r.id === selected,
              ),
            );
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const row =
                result.results[
                  (index +
                    (e.key === "ArrowDown" ? 1 : result.results.length - 1)) %
                    result.results.length
                ];
              setSelected(row.scope + ":" + row.id);
            }
            if (e.key === "Enter" && active) {
              e.preventDefault();
              void open(active);
            }
          }}
        />
        {filters.query && (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear search text"
            onClick={() => update({ query: "" })}
          >
            <X size={15} />
          </button>
        )}
      </label>
      <div
        className="search-scope-tabs"
        role="tablist"
        aria-label="Search result scopes"
      >
        {scopes.map(([id, label, count]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filters.scope === id}
            onClick={() => update({ scope: String(id), kind: "" })}
          >
            {label}
            {id !== "all" && typeof count === "number" && <span>{count}</span>}
          </button>
        ))}
      </div>
      <details className="world-search-filter-panel" open={filtersOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            const next = !filtersOpen;
            setFiltersOpen(next);
            try {
              localStorage.setItem(cache + ":panel", next ? "open" : "closed");
            } catch {}
          }}
        >
          Filters{" "}
          <span>
            {[
              filters.kind,
              filters.tag,
              filters.status,
              filters.visibility,
            ].filter(Boolean).length || "Type, tag, state & visibility"}
          </span>
        </summary>
        <div className="world-search-filters">
          <label className="field">
            <span>Entry type</span>
            <SearchableSelect
              aria-label="Search entry type"
              value={filters.kind}
              onChange={(e) =>
                update({
                  kind: e.target.value,
                  scope: e.target.value ? "entries" : filters.scope,
                })
              }
            >
              <option value="">All entry types</option>
              {Object.entries(kindLabels).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                  {result?.kinds[id] ? ` (${result.kinds[id]})` : ""}
                </option>
              ))}
            </SearchableSelect>
          </label>
          <label className="field">
            <span>Tag</span>
            <SearchableSelect
              aria-label="Search tag"
              value={filters.tag}
              onChange={(e) => update({ tag: e.target.value })}
            >
              <option value="">All tags</option>
              {[
                ...new Set([
                  ...ctx.entries.flatMap((e) => e.tags),
                  ...ctx.assets.flatMap((a) => a.tags),
                ]),
              ]
                .sort()
                .map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
            </SearchableSelect>
          </label>
          <label className="field">
            <span>Writing state</span>
            <SearchableSelect
              aria-label="Search writing state"
              value={filters.status}
              onChange={(e) => update({ status: e.target.value })}
            >
              <option value="">Any state</option>
              <option value="draft">Draft</option>
              <option value="wip">In progress</option>
              <option value="done">Completed</option>
            </SearchableSelect>
          </label>
          <label className="field">
            <span>Visibility</span>
            <SearchableSelect
              aria-label="Search visibility"
              value={filters.visibility}
              onChange={(e) => update({ visibility: e.target.value })}
            >
              <option value="">Any visibility</option>
              <option value="private">Private</option>
              <option value="public">Reader-visible</option>
            </SearchableSelect>
          </label>
          <label className="field">
            <span>Sort</span>
            <SearchableSelect
              aria-label="Search sort"
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value })}
            >
              <option value="relevance">Relevance</option>
              <option value="recent">Recent</option>
              <option value="title">Title</option>
            </SearchableSelect>
          </label>
        </div>
      </details>
      <div className="world-search-saved">
        <label className="field">
          <span>Saved searches</span>
          <SearchableSelect
            aria-label="Saved searches"
            value=""
            onChange={(e) => {
              const row = saved?.saved.find((s) => s.id === e.target.value);
              if (row) {
                setFilters({ ...defaults, ...row.filters });
                setPage(0);
              }
            }}
          >
            <option value="">Choose a saved search</option>
            {saved?.saved.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <button
          type="button"
          className="button secondary small"
          disabled={!saved || busy || loadingSaved}
          onClick={() => setEditing({ id: uid(), name: "" })}
        >
          <Bookmark size={14} />
          Save search
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setFilters(defaults);
            setPage(0);
          }}
        >
          Reset filters
        </button>
        {!!saved?.saved.length && (
          <details>
            <summary>Manage saved searches</summary>
            <div>
              {saved.saved.map((row) => (
                <div className="saved-search-row" key={row.id}>
                  <span>{row.name}</span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || loadingSaved}
                    onClick={() => {
                      setFilters({ ...defaults, ...row.filters });
                      setPage(0);
                      setEditing({ id: row.id, name: row.name });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={"Delete saved search " + row.name}
                    disabled={busy || loadingSaved}
                    onClick={() =>
                      void saveDefinition({ action: "delete", id: row.id })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      {saveError && (
        <>
          <ErrorBox message={saveError} />
          <button
            type="button"
            className="text-button"
            onClick={() => void loadSaved()}
          >
            Reload saved searches
          </button>
        </>
      )}
      {error && (
        <>
          <ErrorBox message={error} />
          <button
            type="button"
            className="text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry search
          </button>
        </>
      )}
      <div className="world-search-columns">
        <section
          className="world-search-list"
          aria-label="World search results"
          aria-busy={loading}
        >
          <p className="muted small-copy" aria-live="polite">
            {loading
              ? "Searching…"
              : `${result?.total || 0} ${result?.total === 1 ? "result" : "results"}`}
          </p>
          {!loading && !result?.total && !error && (
            <p className="empty-search">
              No matches. Try fewer filters or another phrase.
            </p>
          )}
          <div
            id="world-search-matches"
            role="listbox"
            aria-label="Search matches"
          >
            {result?.results.map((row) => (
              <button
                type="button"
                key={row.scope + row.id}
                id={"world-search-row-" + row.scope + row.id}
                disabled={loading}
                role="option"
                aria-selected={selected === row.scope + ":" + row.id}
                onClick={() => setSelected(row.scope + ":" + row.id)}
                className="world-search-result"
              >
                <span className="search-result-category">
                  {row.scope === "images" ? (
                    <Image size={15} />
                  ) : row.scope === "relationships" ? (
                    <Network size={15} />
                  ) : null}
                  {kindLabels[row.kind] || human(row.kind)}
                </span>
                <strong>
                  <Highlight text={row.title} query={filters.query} />
                </strong>
                {row.context && <small>{row.context}</small>}
                <p>
                  <Highlight text={row.excerpt} query={filters.query} />
                </p>
                <span className="muted small-copy">
                  {row.matched_in} ? {when(row.updated_at)}
                </span>
              </button>
            ))}
          </div>
          {result && result.pages > 1 && (
            <nav className="button-row" aria-label="Search pages">
              <button
                type="button"
                className="button secondary small"
                disabled={loading || result.page === 0}
                onClick={() => setPage(result.page - 1)}
              >
                Previous results
              </button>
              <span>
                {result.page + 1}/{result.pages}
              </span>
              <button
                type="button"
                className="button secondary small"
                disabled={loading || result.page + 1 === result.pages}
                onClick={() => setPage(result.page + 1)}
              >
                Next results
              </button>
            </nav>
          )}
        </section>
        <aside className="world-search-preview" aria-label="Search preview">
          {!active ? (
            <p className="muted">Choose a result to preview it here.</p>
          ) : (
            <>
              <header>
                <h3>{active.title}</h3>
                <Badge>
                  {active.matched_in === "GM notes"
                    ? "Private GM notes"
                    : "Owner preview"}
                </Badge>
              </header>
              {previewError ? (
                <ErrorBox message={previewError} />
              ) : !preview ? (
                <p className="muted">Loading preview…</p>
              ) : active.scope === "images" ? (
                <>
                  <img src={active.url} alt={active.title} />
                  <p>{active.context}</p>
                </>
              ) : active.scope === "relationships" ? (
                <>
                  <p>
                    <strong>{active.context}</strong>
                  </p>
                  <p>{preview.notes || "No connection notes."}</p>
                  <div className="button-row">
                    <button
                      className="text-button"
                      onClick={() => void navigate("entry/" + active.source)}
                    >
                      Open source entry
                    </button>
                    <button
                      className="text-button"
                      onClick={() => void navigate("entry/" + active.target)}
                    >
                      Open target entry
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>{preview.summary}</p>
                  <div
                    className="reader-prose"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(preview.html || ""),
                    }}
                  />
                  {preview.private_notes && (
                    <details open={active.matched_in === "GM notes"}>
                      <summary>Private GM notes</summary>
                      <p>{preview.private_notes}</p>
                    </details>
                  )}
                </>
              )}
              <button
                type="button"
                className="button primary small"
                onClick={() => void open(active)}
              >
                Open{" "}
                {active.scope === "relationships"
                  ? "relationship"
                  : active.scope === "images"
                    ? "image"
                    : "entry"}
                <ArrowRight size={14} />
              </button>
            </>
          )}
        </aside>
      </div>
      {editing && (
        <Modal
          title="Save world search"
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <label className="field">
            <span>Saved search name</span>
            <input
              autoFocus
              data-autofocus
              maxLength={80}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          {saveError && (
            <>
              <ErrorBox message={saveError} />
              <button
                type="button"
                className="text-button"
                disabled={busy || loadingSaved}
                onClick={() => void loadSaved()}
              >
                Reload saved searches
              </button>
            </>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy || loadingSaved}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || loadingSaved || !editing.name.trim()}
              onClick={() =>
                void saveDefinition({ action: "save", ...editing, filters })
              }
            >
              {busy ? "Saving…" : "Save definition"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
