import React, { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import {
  AppContext,
  Entry,
  Doc,
  api,
  post,
  saveBeforeNavigate,
} from "./domain";
import { ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";

export function SnippetLibrary({
  ctx,
  insert,
  onClose,
  selection,
  currentId,
}: {
  ctx: AppContext;
  insert?: (entry: Entry, copy: boolean) => void;
  onClose?: () => void;
  selection?: Doc;
  currentId?: string;
}) {
  const [query, setQuery] = useState(""),
    [collection, setCollection] = useState(""),
    [preview, setPreview] = useState<Entry | null>(null),
    [title, setTitle] = useState(""),
    [newCollection, setNewCollection] = useState(""),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [matches, setMatches] = useState<{
    query: string;
    entries: Entry[];
  } | null>(null);
  useEffect(() => {
    if (!query) return;
    let active = true;
    const timer = setTimeout(
      () =>
        api<{ resources: Entry[] }>(
          `/worlds/${ctx.world.id}/resources?q=${encodeURIComponent(query)}`,
        )
          .then((value) => {
            if (active) setMatches({ query, entries: value.resources });
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      180,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, ctx.world.id, ctx.entries]);
  const snippets = ctx.entries.filter(
      (e) => e.kind === "article" && e.data.reusable_snippet && e.id!==currentId,
    ),
    collections = [
      ...new Set(
        snippets.map((e) => e.data.snippet_collection || "").filter(Boolean),
      ),
    ].sort();
  const results = useMemo(
    () =>
      (query
        ? matches?.query === query
          ? matches.entries
          : []
        : snippets
      ).filter(
        (e) =>
          e.kind === "article" &&
          e.id!==currentId && e.data.reusable_snippet &&
          (!collection || e.data.snippet_collection === collection),
      ),
    [snippets, collection, query, matches],
  );
  const choose = async (entry: Entry, copy: boolean) => {
    setBusy(true);
    setError("");
    try {
      const original = await api<Entry>("/resources/" + entry.id);
      if (
        original.world_id !== ctx.world.id ||
        original.deleted_at ||
        !original.data.reusable_snippet
      )
        throw Error("This snippet is unavailable.");
      if (copy) {
        const result = await api<{ document: Doc }>(
          `/resources/${entry.id}/snippet-copy`,
        );
        original.document = result.document;
      }
      insert?.(original, copy);
      onClose?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Reusable snippets">
      <div className="section-heading">
        <h2>Reusable snippets</h2>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => setCreating(true)}
        >
          {selection ? "Save selection as snippet" : "New snippet"}
        </button>
      </div>
      <div className="field-grid">
        <Field label="Find snippets" value={query} onChange={setQuery} />
        <label>
          Collection
          <SearchableSelect
            aria-label="Snippet collection filter"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
          >
            <option value="">All collections</option>
            {collections.map((c) => (
              <option key={String(c)} value={String(c)}>
                {String(c)}
              </option>
            ))}
          </SearchableSelect>
        </label>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="card-grid">
        {results.map((entry) => (
          <article className="notebook-result" key={entry.id}>
            <h3>{entry.title}</h3>
            <small>
              {entry.data.snippet_collection || "Unfiled"} ·{" "}
              {entry.tags.join(", ")}
            </small>
            <div className="button-row">
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  try {
                    setPreview(await api<Entry>("/resources/" + entry.id));
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                Preview {entry.title}
              </button>
              {insert && (
                <>
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => void choose(entry, false)}
                  >
                    Insert live snippet
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void choose(entry, true)}
                  >
                    Insert copy
                  </button>
                </>
              )}
              <button
                className="text-button"
                onClick={async () => {
                  if (
                    saveBeforeNavigate.current &&
                    !(await saveBeforeNavigate.current())
                  )
                    return;
                  onClose?.();
                  ctx.go("entry/" + entry.id);
                }}
              >
                Edit original
              </button>
            </div>
          </article>
        ))}
      </div>
      {!results.length && (
        <p>
          No matching snippets. Create one or save a selection from the editor.
        </p>
      )}
      {preview && (
        <aside className="snippet-preview">
          <div className="section-heading">
            <h3>{preview.title}</h3>
            <button className="text-button" onClick={() => setPreview(null)}>
              Close preview
            </button>
          </div>
          <div
            className="reader-prose"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(preview.html || ""),
            }}
          />
          <h4>Used directly by</h4>
          {(preview.backlinks || []).map((entry: any) => (
            <button
              key={entry.id}
              className="backlink"
              onClick={() => ctx.go("entry/" + entry.id)}
            >
              {entry.title}
            </button>
          ))}
          {!preview.backlinks?.length && <p>No direct uses yet.</p>}
        </aside>
      )}
      {creating && (
        <Modal
          title="Create reusable snippet"
          onClose={() => !busy && setCreating(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const entry = await post<Entry>(
                  `/worlds/${ctx.world.id}/resources`,
                  {
                    title,
                    kind: "article",
                    template: "generic",
                    visibility: "private",
                    document: selection || {
                      type: "doc",
                      content: [{ type: "paragraph" }],
                    },
                    data: {
                      reusable_snippet: true,
                      snippet_collection: newCollection,
                    },
                  },
                );
                setCreating(false);
                setTitle("");
                try {
                  await ctx.refresh();
                } catch (e: any) {
                  ctx.notify(
                    "Snippet saved. Refresh the library to update its list.",
                    true,
                  );
                }
                if (!insert) ctx.go("entry/" + entry.id);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Snippet name" value={title} onChange={setTitle} />
            <Field
              label="Snippet collection"
              value={newCollection}
              onChange={setNewCollection}
            />
            <button className="button primary" disabled={busy || !title.trim()}>
              Save snippet
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
