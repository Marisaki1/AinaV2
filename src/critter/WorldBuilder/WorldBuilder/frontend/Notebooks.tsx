import React, { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  AppContext,
  Entry,
  api,
  post,
  saveBeforeNavigate,
  human,
} from "./domain";
import { Badge, EntryPicker, ErrorBox, Field } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { EntryEditor } from "./EntryEditor";
import {
  BookForm,
  CaptureForm,
  FileNotesForm,
  NoteMetadataForm,
  TemplateForm,
  Section,
  BulkNoteTags,
  categories,
} from "./NotebookForms";
import { NotebookBoard } from "./NotebookBoard";
import { ChecklistDesk } from "./ChecklistDesk";
import { SnippetLibrary } from './Snippets';
import { NoteConversion } from './NoteConversion';

type Desk = {
  books: Entry[];
  templates: Entry[];
  book: Entry | null;
  results: (Entry & { note_excerpt?: string })[];
  total: number;
  offset: number;
  has_more: boolean;
  unavailable: number;
  inbox_count: number;
};
function NotePreview({
  ctx,
  id,
  onClose,
}: {
  ctx: AppContext;
  id: string;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<Entry | null>(null),
    [error, setError] = useState("");
  const revision = ctx.entries.find((e) => e.id === id)?.revision;
  useEffect(() => {
    let alive = true;
    setEntry(null);
    setError("");
    api<Entry>("/resources/" + id)
      .then((e) => {
        if (e.world_id !== ctx.world.id)
          throw Error("This source belongs to another world.");
        if (alive) setEntry(e);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, revision]);
  return (
    <aside
      className="notebook-reference"
      aria-label="Note reference beside draft"
    >
      <div className="section-heading">
        <h2>Reference</h2>
        <button className="text-button" onClick={onClose}>
          Close reference
        </button>
      </div>
      {error ? (
        <ErrorBox message={error} />
      ) : !entry ? (
        <p role="status">Opening original reference…</p>
      ) : (
        <>
          <h3>{entry.title}</h3>
          <div
            className="reader-prose"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(entry.html || ""),
            }}
          />
          {entry.private_notes && (
            <details>
              <summary>GM source notes</summary>
              <p className="campaign-record-excerpt">{entry.private_notes}</p>
            </details>
          )}
          <button
            className="button secondary"
            onClick={() => ctx.go("entry/" + entry.id)}
          >
            Open full original
          </button>
        </>
      )}
    </aside>
  );
}
export function Notebooks({
  ctx,
  view = "all",
  bookId = "",
  sectionId = "",
  noteId = "",
}: {
  ctx: AppContext;
  view?: string;
  bookId?: string;
  sectionId?: string;
  noteId?: string;
}) {
  const bookKey = bookId === "all" ? "" : bookId,
    sectionKey = sectionId === "all" ? "" : sectionId,
    sourceId = noteId === "none" ? "" : noteId;
  const filterKey = `worldbuilder.notebook-filters:${ctx.world.id}`;
  const [savedFilters] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(filterKey) || "{}");
    } catch {
      return {};
    }
  });
  const [query, setQuery] = useState(savedFilters.query || ""),
    [debounced, setDebounced] = useState(""),
    [category, setCategory] = useState(savedFilters.category || ""),
    [campaign, setCampaign] = useState(savedFilters.campaign || ""),
    [tag, setTag] = useState(savedFilters.tag || ""),
    [metadata, setMetadata] = useState(savedFilters.metadata || ""),
    [sort, setSort] = useState(savedFilters.sort || "recent"),
    [offset, setOffset] = useState(0),
    [payload, setPayload] = useState<{ scope: string; value: Desk } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<any>(null),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState(""),
    [editorVersion, setEditorVersion] = useState(0),
    [audit, setAudit] = useState<any>(null);
  const [trashed, setTrashed] = useState<{ id: string; revision: number }[]>(
    [],
  );
  useEffect(() => {
    try {
      sessionStorage.setItem(
        filterKey,
        JSON.stringify({ query, category, campaign, tag, metadata, sort }),
      );
    } catch {}
  }, [filterKey, query, category, campaign, tag, metadata, sort]);
  const referenceOrigin = useRef<{
    element: HTMLElement | null;
    range: Range | null;
  }>({ element: null, range: null });
  const peek = (id: string) => {
    if (!preview) {
      const selection = getSelection();
      referenceOrigin.current = {
        element: document.activeElement as HTMLElement,
        range: selection?.rangeCount
          ? selection.getRangeAt(0).cloneRange()
          : null,
      };
    }
    setPreview(id);
  };
  const closeReference = () => {
    setPreview("");
    requestAnimationFrame(() => {
      const { element, range } = referenceOrigin.current;
      if (element?.isConnected) element.focus({ preventScroll: true });
      if (range?.commonAncestorContainer.isConnected) {
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      }
    });
  };
  const created = useRef<{ entry: Entry; section: string } | null>(null),
    scope = JSON.stringify([
      ctx.world.id,
      view,
      bookKey,
      sectionKey,
      debounced,
      category,
      campaign,
      tag,
      metadata,
      sort,
      offset,
    ]),
    token = JSON.stringify([scope, ctx.entries.map((e) => [e.id, e.revision])]);
  const queryString = new URLSearchParams({
      book: bookKey,
      section: sectionKey,
      view,
      q: debounced,
      category,
      campaign,
      tag,
      metadata,
      sort,
      offset: String(offset),
    }),
    endpoint = `/worlds/${ctx.world.id}/notebooks?${queryString}`;
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setOffset(0);
    setSelected([]);
  }, [bookKey, sectionKey, view, debounced, category, campaign, tag, metadata]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<Desk>(endpoint)
      .then((value) => {
        if (alive) setPayload({ scope, value });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  useEffect(() => {
    if (view !== "audit") return;
    let alive = true;
    api(`/worlds/${ctx.world.id}/note-audit`)
      .then((v) => {
        if (alive) setAudit(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [view, ctx.entries]);
  const data = payload?.value,
    ready = payload?.scope === scope,
    book = [
      ...ctx.entries.filter(
        (e) => e.id === bookKey && e.data.notebook_type === "notebook",
      ),
      ...(payload?.value.book?.id === bookKey ? [payload.value.book] : []),
    ].sort((a, b) => b.revision - a.revision)[0],
    books = ctx.entries.filter((e) => e.data.notebook_type === "notebook"),
    templates = ctx.entries.filter((e) => e.data.notebook_type === "template"),
    source = ctx.entries.find((e) => e.id === sourceId);
  const route = (nextView = view, b = bookKey, s = sectionKey, n = sourceId) =>
    `notebooks/${nextView}/${b || "all"}/${s || "all"}/${n || "none"}`;
  const editorCtx = useMemo(
    () => ({
      ...ctx,
      go: (target: string) => {
        const id = target.startsWith("entry/") ? target.split("/")[1] : "",
          entry = ctx.entries.find((e) => e.id === id);
        if (entry && ["note", "task"].includes(entry.kind))
          ctx.go(route(view, bookKey, sectionKey, id));
        else ctx.go(target);
      },
    }),
    [ctx, view, bookKey, sectionKey],
  );
  const refresh = async () => {
    await ctx.refresh();
    const value = await api<Desk>(endpoint);
    setPayload({ scope, value });
  };
  const save = async (body: Record<string, any>) => {
    const value = await post(`/worlds/${ctx.world.id}/notebooks`, body);
    if (
      (["metadata", "note_article"].includes(body.action) && body.id === sourceId) ||
      (body.action === "bulk" &&
        body.entries?.some((e: any) => e.id === sourceId))
    )
      setEditorVersion((v) => v + 1);
    try {
      await refresh();
    } catch (e: any) {
      ctx.notify(
        "Saved to the database, but the list could not refresh: " + e.message,
        true,
      );
    }
    return value;
  };
  const guard = async () =>
    !saveBeforeNavigate.current || (await saveBeforeNavigate.current());
  const open = async (value: any) => {
    if (busy || !(await guard())) return;
    try {
      if (value.entry)
        value = {
          ...value,
          entry: await api<Entry>("/resources/" + value.entry.id),
        };
      if (value.type === "file" || value.type === "bulk-tags")
        value.entries = await Promise.all(
          (value.ids || selected).map((id: string) =>
            api<Entry>("/resources/" + id),
          ),
        );
      created.current = null;
      setModal(value);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const close = () => {
    setModal(null);
    const note = created.current;
    created.current = null;
    if (note)
      setTimeout(
        () => ctx.go(route("all", bookKey, note.section, note.entry.id)),
        60,
      );
  };
  const star = async (entry: Entry) => {
    if (busy || !(await guard())) return;
    setBusy(true);
    setError("");
    try {
      const current = await api<Entry>("/resources/" + entry.id);
      await save({
        action: "metadata",
        id: current.id,
        expected_revision: current.revision,
        data: { note_starred: !current.data.note_starred },
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        open({ type: "capture" });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  const roots = (
    sections: Section[],
    parent = "",
    level = 0,
  ): React.ReactNode =>
    sections
      .filter((s) => s.parent_id === parent)
      .map((s) => (
        <React.Fragment key={s.id}>
          <button
            className={sectionKey === s.id ? "active" : ""}
            style={{ paddingLeft: 12 + level * 12 }}
            onClick={() => ctx.go(route("all", bookKey, s.id))}
          >
            {s.title}
            <small>{s.entry_ids.length}</small>
          </button>
          {level < 8 && roots(sections, s.id, level + 1)}
        </React.Fragment>
      ));
  return (
    <div className="page notebook-page">
      <header className="workbench-heading">
        <div>
          <p className="eyebrow">CAPTURE · ORGANIZE · WRITE · CONNECT</p>
          <h1>{book?.title || "Notebooks"}</h1>
          <p className="muted">
            Original notes, rich writing and sources in one workspace
          </p>
        </div>
        <div className="button-row">
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setCategory("");
              setCampaign("");
              setTag("");
              setMetadata("");
              setSort("recent");
              setOffset(0);
            }}
          >
            Clear filters
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => open({ type: "capture" })}
          >
            Quick note
          </button>
          <button
            className="button secondary"
            onClick={() => open({ type: "book" })}
          >
            New notebook
          </button>
          <button className="text-button" onClick={() => ctx.go("tasks")}>
            Open task list
          </button>
        </div>
      </header>
      {error && <ErrorBox message={error} />}
      <div className="notebook-body">
        <aside
          className="notebook-navigation"
          aria-label="Notebooks and sections"
        >
          {[
            ["all", "All notes"],
            ["inbox", "Unfiled inbox"],
            ["favorites", "Favorites"],
            ["checklists", "Checklist desk"],
            ['snippets','Reusable snippets'],
            ["trash", "Trashed notes"],
            ["knowledge", "Facts & questions"],
            ["templates", "Note templates"],
            ["audit", "Reference audit"],
          ].map(([key, title]) => (
            <button
              key={key}
              className={view === key && !bookKey ? "active" : ""}
              onClick={() => ctx.go(route(key, "", ""))}
            >
              {title}
              {key === "inbox" && <small>{data?.inbox_count || 0}</small>}
            </button>
          ))}
          <h2>Your notebooks</h2>
          {books.map((e) => (
            <button
              className={e.id === bookKey ? "active" : ""}
              key={e.id}
              data-notebook-link={e.id}
              onClick={() => ctx.go(route("all", e.id, ""))}
            >
              {e.title}
            </button>
          ))}
          {book && (
            <>
              <h3>Sections</h3>
              <div className="notebook-section-tree">
                {roots(book.data.notebook_sections || [])}
              </div>
              <button
                className="text-button"
                onClick={() => open({ type: "book", entry: book })}
              >
                Manage notebook sections
              </button>
              <button
                className="text-button"
                onClick={() => ctx.go(route("board", book.id, ""))}
              >
                Visual note board
              </button>
              <details>
                <summary>Export notebook</summary>
                <a
                  className="button secondary small"
                  href={`/api/resources/${book.id}/notebook-export?section=${sectionKey}&audience=owner`}
                  download
                >
                  Export private notebook HTML
                </a>
                <a
                  className="button secondary small"
                  href={`/api/resources/${book.id}/notebook-export?section=${sectionKey}&audience=reader`}
                  download
                >
                  Export published notes HTML
                </a>
                <p className="small-copy muted">
                  Private export includes GM prose. Published export omits
                  private sources, GM blocks and notebook labels.
                </p>
              </details>
            </>
          )}
        </aside>
        <div
          className={
            "notebook-workarea " +
            (preview ? "with-reference " : "") +
            (sourceId && !["board", "checklists", "trash", "snippets"].includes(view)
              ? "has-editor"
              : "")
          }
        >
          <section className="notebook-results" aria-label="Notebook results">
            {view==='snippets'?<SnippetLibrary ctx={ctx}/>:view === "checklists" ? (
              <ChecklistDesk ctx={ctx} />
            ) : view === "board" ? (
              book ? (
                <NotebookBoard
                  key={book.id}
                  ctx={ctx}
                  book={book}
                  onSave={save}
                  onPreview={peek}
                />
              ) : (
                <p>Choose a notebook for its visual board.</p>
              )
            ) : view === "templates" ? (
              <>
                <h2>Reusable note templates</h2>
                <button
                  className="button secondary"
                  onClick={() => open({ type: "template" })}
                >
                  Create note template
                </button>
                <div className="card-grid">
                  {templates.map((t) => (
                    <article
                      className="notebook-result"
                      key={t.id}
                      data-note-template={t.id}
                    >
                      <h3>{t.title}</h3>
                      <p>{t.data.note_schema?.length || 0} metadata fields</p>
                      <button
                        className="text-button"
                        onClick={() => open({ type: "template", entry: t })}
                      >
                        Edit note template
                      </button>
                      <button
                        className="text-button"
                        onClick={() => ctx.go("entry/" + t.id)}
                      >
                        Edit template rich text
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : view === "audit" ? (
              <>
                <h2>Reference audit</h2>
                <p className="muted">
                  Review unavailable explicit references and ambiguous names.
                  Originals are preserved; no automatic merging.
                </p>
                {audit ? (
                  <>
                    <h3>
                      {audit.broken_total} originals with unavailable links
                    </h3>
                    {audit.broken.map((e: any) => (
                      <article className="notebook-result" key={e.id}>
                        <button
                          className="text-button"
                          onClick={() => peek(e.id)}
                        >
                          {e.title}
                        </button>
                        <p>{e.missing_count} unavailable references</p>
                      </article>
                    ))}
                    <h3>
                      {audit.ambiguous_total} ambiguous names / possible
                      duplicates
                    </h3>
                    {audit.ambiguous.map((e: any) => (
                      <article className="notebook-result" key={e.name}>
                        <strong>{e.name}</strong>
                        {e.sources.map((s: any) => (
                          <button
                            className="text-button"
                            key={s.id}
                            onClick={() => peek(s.id)}
                          >
                            {s.title}
                          </button>
                        ))}
                      </article>
                    ))}
                  </>
                ) : (
                  <p role="status">Checking world references…</p>
                )}
              </>
            ) : (
              <>
                <div className="notebook-search">
                  <Field
                    label="Search note text, tags & metadata"
                    value={query}
                    onChange={setQuery}
                  />
                  <div className="field-grid">
                    <label className="field">
                      <span>Note category filter</span>
                      <SearchableSelect
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option value="">All categories</option>
                        {categories.map((v) => (
                          <option key={v} value={v}>
                            {human(v)}
                          </option>
                        ))}
                      </SearchableSelect>
                    </label>
                    <label className="field">
                      <span>Note result order</span>
                      <SearchableSelect
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        {["recent", "title", "oldest", "section"].map((v) => (
                          <option value={v} key={v}>
                            {human(v)}
                          </option>
                        ))}
                      </SearchableSelect>
                    </label>
                  </div>
                  <details>
                    <summary>More note filters</summary>
                    <EntryPicker
                      label="Notebook campaign filter"
                      value={campaign}
                      onChange={setCampaign}
                      entries={ctx.entries.filter((e) => e.kind === "campaign")}
                    />
                    <Field
                      label="Notebook tag filter"
                      value={tag}
                      onChange={setTag}
                    />
                    <Field
                      label="Metadata label or value filter"
                      value={metadata}
                      onChange={setMetadata}
                    />
                  </details>
                </div>
                <div className="button-row">
                  <button
                    className="text-button"
                    disabled={busy || !ready || !data?.results.length}
                    onClick={() =>
                      setSelected(data!.results.slice(0, 100).map((e) => e.id))
                    }
                  >
                    Select this page
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || !selected.length}
                    onClick={() => setSelected([])}
                  >
                    Clear selection
                  </button>
                  <button
                    className="text-button danger"
                    disabled={busy || !selected.length}
                    onClick={async () => {
                      if (
                        !(await guard()) ||
                        (view !== "trash" &&
                          !confirm(
                            `Move ${selected.length} original entries to Trash? Their notebook references will remain for recovery.`,
                          ))
                      )
                        return;
                      setBusy(true);
                      try {
                        const originals = await Promise.all(
                          selected.map((id) => api<Entry>("/resources/" + id)),
                        );
                        const result = await save({
                          action: view === "trash" ? "restore_bulk" : "trash",
                          entries: originals.map((e) => ({
                            id: e.id,
                            revision: e.revision,
                          })),
                        });
                        if (view !== "trash") setTrashed(result.entries);
                        setSelected([]);
                        if (selected.includes(sourceId))
                          ctx.go(route(view, bookKey, sectionKey, ""));
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {view === "trash" ? "Restore selected" : "Trash selected"}
                  </button>
                  {!!trashed.length && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        if (!(await guard())) return;
                        setBusy(true);
                        try {
                          await save({
                            action: "restore_bulk",
                            entries: trashed,
                          });
                          setTrashed([]);
                        } catch (e: any) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Undo last trash ({trashed.length})
                    </button>
                  )}
                  <button
                    className="text-button"
                    disabled={!selected.length || busy || view === "trash"}
                    onClick={() => open({ type: "file" })}
                  >
                    File selected ({selected.length})
                  </button>
                  <button
                    className="text-button"
                    disabled={!selected.length || busy || view === "trash"}
                    onClick={() => open({ type: "bulk-tags" })}
                  >
                    Tag selected
                  </button>
                  {book && (
                    <button
                      className="text-button"
                      disabled={!selected.length || busy || view === "trash"}
                      onClick={async () => {
                        if (!(await guard())) return;
                        setBusy(true);
                        try {
                          const originals = await Promise.all(
                              selected.map((id) =>
                                api<Entry>("/resources/" + id),
                              ),
                            ),
                            currentBook = await api<Entry>(
                              "/resources/" + book.id,
                            );
                          await save({
                            action: "unfile",
                            book_id: book.id,
                            section_id:
                              sectionKey ||
                              currentBook.data.notebook_sections?.[0]?.id,
                            expected_revision: currentBook.revision,
                            entries: originals.map((e) => ({
                              id: e.id,
                              revision: e.revision,
                            })),
                          });
                          setSelected([]);
                        } catch (e: any) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Remove selected notebook references
                    </button>
                  )}
                  <button
                    className="text-button"
                    disabled={!selected.length || busy || view === "trash"}
                    onClick={async () => {
                      if (!(await guard())) return;
                      setBusy(true);
                      try {
                        const entries = await Promise.all(
                          selected.map((id) => api<Entry>("/resources/" + id)),
                        );
                        await save({
                          action: "bulk",
                          starred: true,
                          entries: entries.map((e) => ({
                            id: e.id,
                            revision: e.revision,
                          })),
                        });
                        if (selected.includes(sourceId))
                          setEditorVersion((v) => v + 1);
                        setSelected([]);
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Favorite selected
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || !selected.length || view === "trash"}
                    onClick={async () => {
                      if (!(await guard())) return;
                      setBusy(true);
                      try {
                        const originals = await Promise.all(
                          selected.map((id) => api<Entry>("/resources/" + id)),
                        );
                        await save({
                          action: "bulk",
                          starred: false,
                          entries: originals.map((e) => ({
                            id: e.id,
                            revision: e.revision,
                          })),
                        });
                        setSelected([]);
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Unfavorite selected
                  </button>
                </div>
                <p className="small-copy muted">
                  {ready
                    ? `${data?.results.length || 0} of ${data?.total || 0} matching originals`
                    : "Updating note results…"}
                </p>
                {!!data?.unavailable && (
                  <p className="notice">
                    {data.unavailable} unavailable references remain in this
                    notebook. Originals in Trash can be restored.
                  </p>
                )}
                <div className="card-grid notebook-note-list">
                  {ready &&
                    data?.results.map((e) => (
                      <article
                        className={
                          "notebook-result " +
                          (sourceId === e.id ? "active" : "")
                        }
                        key={e.id}
                        data-notebook-note={e.id}
                      >
                        <div className="section-heading">
                          <label>
                            <input
                              type="checkbox"
                              aria-label={"Select note " + e.title}
                              checked={selected.includes(e.id)}
                              onChange={(event) =>
                                setSelected(
                                  event.target.checked
                                    ? [...selected, e.id].slice(0, 100)
                                    : selected.filter((id) => id !== e.id),
                                )
                              }
                            />
                          </label>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => star(e)}
                            hidden={view === "trash"}
                            aria-label={
                              (e.data.note_starred
                                ? "Unfavorite "
                                : "Favorite ") + e.title
                            }
                          >
                            {e.data.note_starred ? "★" : "☆"}
                          </button>
                        </div>
                        <button
                          className="notebook-note-title"
                          disabled={view === "trash"}
                          onClick={() =>
                            ctx.go(route(view, bookKey, sectionKey, e.id))
                          }
                        >
                          {e.title}
                        </button>
                        <div>
                          <Badge>{human(e.data.note_category || e.kind)}</Badge>
                          {e.data.note_category === "question" && (
                            <Badge>
                              {human(e.data.note_question_status || "open")}
                            </Badge>
                          )}
                        </div>
                        <p className="notebook-excerpt">{e.note_excerpt}</p>
                        <small>{e.tags.join(" · ")}</small>
                        <div className="button-row">
                          {view === "trash" && (
                            <button
                              className="button secondary small"
                              disabled={busy}
                              onClick={async () => {
                                if (!(await guard())) return;
                                setBusy(true);
                                try {
                                  await save({
                                    action: "restore_bulk",
                                    entries: [
                                      { id: e.id, revision: e.revision },
                                    ],
                                  });
                                } catch (error: any) {
                                  setError(error.message);
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Restore note
                            </button>
                          )}
                          <button
                            className="text-button"
                            disabled={view === "trash"}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => peek(e.id)}
                          >
                            Preview beside draft
                          </button>
                          <button
                            className="text-button"
                            onClick={() => open({ type: "metadata", entry: e })}
                            hidden={view === "trash"}
                          >
                            Note metadata
                          </button>
                          <button
                            className="text-button"
                            onClick={() => open({ type: "file", ids: [e.id] })}
                            hidden={view === "trash"}
                          >
                            File original
                          </button>
                          {e.kind==='note'&&view!=='trash'&&(e.data.note_article_id?
                            <button className="text-button" onClick={()=>ctx.go('entry/'+e.data.note_article_id)}>Open linked article</button>:
                            <button className="text-button" onClick={()=>open({type:'convert',entry:e})}>Create linked article</button>)}
                        </div>
                      </article>
                    ))}
                </div>
                {ready && !data?.total && (
                  <p className="muted">
                    No matching originals. Capture a note or file existing notes
                    into this section.
                  </p>
                )}
                <div className="button-row">
                  <button
                    className="text-button"
                    disabled={!offset}
                    onClick={() => setOffset(Math.max(0, offset - 100))}
                  >
                    Previous notes page
                  </button>
                  <button
                    className="text-button"
                    disabled={!data?.has_more}
                    onClick={() => setOffset(offset + 100)}
                  >
                    Next notes page
                  </button>
                </div>
              </>
            )}
          </section>
          {sourceId && !["board", "checklists", "trash", "snippets"].includes(view) && (
            <section
              className="notebook-editor"
              inert={busy || undefined}
              aria-label="Notebook original editor"
            >
              <div className="button-row notebook-editor-actions">
                <button
                  className="text-button"
                  onClick={() => ctx.go("entry/" + sourceId)}
                >
                  Open full editor
                </button>
                {source && (
                  <>
                    <button
                      className="text-button"
                      onClick={() => open({ type: "metadata", entry: source })}
                    >
                      Edit selected note metadata
                    </button>
                    <button
                      className="text-button"
                      onClick={() => open({ type: "template", source })}
                    >
                      Save selected as template
                    </button>
                  </>
                )}
                <button
                  className="text-button"
                  onClick={() => ctx.go(route(view, bookKey, sectionKey, ""))}
                >
                  Close note editor
                </button>
              </div>
              <EntryEditor
                key={sourceId + ":" + editorVersion}
                id={sourceId}
                ctx={editorCtx}
              />
            </section>
          )}
          {preview && (
            <NotePreview ctx={ctx} id={preview} onClose={closeReference} />
          )}
        </div>
      </div>
      {modal?.type === "book" && (
        <BookForm entry={modal.entry} onSave={save} onClose={close} />
      )}
      {modal?.type === "capture" && (
        <CaptureForm
          ctx={ctx}
          book={book}
          sectionId={sectionKey}
          templates={templates}
          onSave={save}
          onClose={close}
          onCreated={(note, section) => {
            created.current = { entry: note, section };
          }}
        />
      )}
      {modal?.type === "template" && (
        <TemplateForm
          entry={modal.entry}
          source={modal.source}
          onSave={save}
          onClose={close}
        />
      )}
      {modal?.type === "metadata" && (
        <NoteMetadataForm
          ctx={ctx}
          entry={modal.entry}
          onSave={save}
          onClose={close}
        />
      )}
      {modal?.type==='convert'&&<NoteConversion ctx={ctx} entry={modal.entry} onSave={save} onClose={close}/>}
      {modal?.type === "file" && (
        <FileNotesForm
          books={books}
          entries={modal.entries || []}
          onSave={save}
          onClose={close}
        />
      )}
      {modal?.type === "bulk-tags" && (
        <BulkNoteTags
          entries={modal.entries || []}
          onSave={save}
          onClose={close}
        />
      )}
    </div>
  );
}
