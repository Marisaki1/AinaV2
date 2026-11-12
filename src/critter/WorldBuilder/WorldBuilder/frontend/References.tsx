import { SearchableSelect } from "./SearchableSelect";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Eye,
  Loader2,
  LockKeyhole,
  Plus,
  Search,
  X,
} from "lucide-react";
import { AppContext, Entry, api, post, human, when } from "./domain";
import { Badge, Empty, ErrorBox, KindIcon, Modal } from "./ui";
import { ReaderContent } from "./ReaderContent";
import { imageURL } from "./LinkedPortrait";
import { tagKey } from "./Collections";

function excerpt(entry: Entry) {
  if (entry.kind === "variable")
    return (
      String(entry.data.value ?? entry.title) +
      (entry.data.tooltip ? " ? " + entry.data.tooltip : "")
    );
  const visit = (node: any): string =>
    node?.type === "privateBlock"
      ? ""
      : String(node?.text || "") +
        " " +
        (node?.content || []).map(visit).join(" ");
  return (entry.summary || visit(entry.document).trim()).slice(0, 280);
}

export function ResourcePicker({
  ctx,
  mode,
  currentId,
  insert,
  close,
}: {
  ctx: AppContext;
  mode: string;
  currentId: string;
  insert: (id: string, label: string) => void;
  close: () => void;
}) {
  const [linkedImage, setLinkedImage] = useState(""),
    [imageAlt, setImageAlt] = useState("");
  const [query, setQuery] = useState(""),
    [template, setTemplate] = useState("generic"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [previewId, setPreviewId] = useState(""),
    [preview, setPreview] = useState<Entry | null>(null),
    [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    let alive = true;
    setPreview(null);
    if (!previewId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api<Entry>("/resources/" + previewId)
      .then((value) => {
        if (alive && value.world_id === ctx.world.id) setPreview(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [previewId, ctx.world.id]);
  const needle = tagKey(query),
    entries = ctx.entries.filter(
      (e) =>
        e.id !== currentId &&
        (mode !== "variable" || e.kind === "variable") &&
        tagKey(
          e.title + " " + e.aliases.join(" ") + " " + e.tags.join(" "),
        ).includes(needle),
    );
  const assets = ctx.assets.filter((a) =>
    tagKey(a.name + " " + a.credit + " " + a.tags.join(" ")).includes(needle),
  );
  const choose = (entry: Entry) => {
    insert(
      entry.id,
      mode === "variable"
        ? String(entry.data.value ?? entry.title)
        : entry.title,
    );
    close();
  };
  const exact = entries.find((e) => tagKey(e.title) === needle);
  const create = async () => {
    if (busy || !query.trim() || mode !== "entry") return;
    if (exact) {
      choose(exact);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const entry = await post<Entry>(
        "/worlds/" + ctx.world.id + "/resources",
        { title: query.trim(), kind: "article", template },
      );
      choose(entry);
      ctx.refresh().catch((e) => ctx.notify(e.message, true));
      ctx.notify(
        "Article created and linked. Add its details whenever you are ready.",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      wide={mode === "entry"}
      title={
        mode === "image"
          ? "Choose an image"
          : mode === "variable"
            ? "Insert a reusable term"
            : "Link a world entry"
      }
      onClose={() => !busy && close()}
    >
      {mode === "image" && (
        <form
          className="linked-image-form"
          onSubmit={(event) => {
            event.preventDefault();
            const url = linkedImage.trim();
            if (!imageURL(url)) {
              setError("Use a direct HTTP or HTTPS image URL.");
              return;
            }
            insert(url, imageAlt);
            close();
          }}
        >
          <label className="field">
            <span>Image URL</span>
            <input
              value={linkedImage}
              maxLength={2000}
              placeholder="https://example.com/image.png"
              onChange={(e) => setLinkedImage(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Image description</span>
            <input
              value={imageAlt}
              onChange={(e) => setImageAlt(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={!linkedImage.trim()}>
            Insert linked image
          </button>
          <p className="muted small-copy">
            Use the direct image address. External hosts must allow image
            embedding. Upload below for an offline copy.
          </p>
        </form>
      )}
      <label className="command-search">
        <Search size={19} />
        <input
          ref={input}
          data-autofocus
          aria-label="Find an entry to insert"
          value={query}
          maxLength={mode === "entry" ? 180 : 200}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            mode === "image"
              ? "Image name, tag or credit…"
              : "Name, alias or tag…"
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && mode === "entry") {
              e.preventDefault();
              create();
            }
          }}
        />
      </label>
      {error && <ErrorBox message={error} />}
      <div
        className={
          "reference-picker-layout " + (previewId ? "has-preview" : "")
        }
      >
        <div
          className={mode === "image" ? "asset-picker" : "reference-results"}
        >
          {mode === "image"
            ? assets.slice(0, 100).map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    insert(a.url, a.name);
                    close();
                  }}
                >
                  <img src={a.url} alt="" />
                  <span>{a.name}</span>
                </button>
              ))
            : entries.slice(0, 100).map((e) => (
                <div
                  className={
                    "reference-result " + (previewId === e.id ? "active" : "")
                  }
                  key={e.id}
                >
                  <button
                    className="reference-insert"
                    onClick={() => choose(e)}
                  >
                    <KindIcon kind={e.kind} />
                    <span>
                      <strong>{e.title}</strong>
                      <small>{e.summary || human(e.template)}</small>
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Preview " + e.title}
                    onClick={() => setPreviewId(e.id)}
                  >
                    <Eye size={16} />
                  </button>
                </div>
              ))}
          {(mode === "image" ? assets : entries).length > 100 && (
            <p className="muted small-copy">
              Showing the first 100 matches. Refine your search to find more.
            </p>
          )}
          {!(mode === "image" ? assets : entries).length && (
            <Empty
              title={
                mode === "image" ? "No matching images" : "No matching entries"
              }
            >
              {mode === "entry"
                ? "Create the missing article below and keep writing."
                : "Try another name or tag."}
            </Empty>
          )}
        </div>
        {previewId && (
          <aside
            className="picker-entry-preview"
            onClick={(event) => {
              if (
                event.ctrlKey ||
                event.metaKey ||
                !(event.target instanceof Element)
              )
                return;
              const link = event.target.closest('a[href*="/#/entry/"]');
              const id = link
                ?.getAttribute("href")
                ?.match(/\/#\/entry\/([a-f0-9-]{36})/i)?.[1];
              if (id) {
                event.preventDefault();
                setPreviewId(id);
              }
            }}
          >
            <button
              className="icon-button preview-close"
              aria-label="Close entry preview"
              onClick={() => setPreviewId("")}
            >
              <X size={16} />
            </button>
            {loading ? (
              <div className="page-loading">
                <Loader2 className="spin" size={20} />
                Opening preview…
              </div>
            ) : (
              preview && (
                <>
                  <Badge>{human(preview.template)}</Badge>
                  <h3>{preview.title}</h3>
                  <p>{preview.summary}</p>
                  <ReaderContent entry={preview} ctx={ctx} />
                  <button
                    className="button primary small"
                    onClick={() => choose(preview)}
                  >
                    Insert this entry
                    <ArrowRight size={14} />
                  </button>
                </>
              )
            )}
          </aside>
        )}
      </div>
      {mode === "entry" && (
        <div className="create-linked-entry">
          <div>
            <strong>
              {exact
                ? "Use the matching entry"
                : query.trim()
                  ? "Create “" + query.trim() + "”"
                  : "Missing someone or somewhere?"}
            </strong>
            <p>
              The new article starts private. Its link is inserted here so you
              can keep writing.
            </p>
          </div>
          <label className="field">
            <span>Article template</span>
            <SearchableSelect
              aria-label="Template for linked article"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {ctx.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </SearchableSelect>
          </label>
          <button
            className="button primary"
            disabled={busy || !query.trim()}
            onClick={create}
          >
            {busy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}{" "}
            {exact ? "Insert existing entry" : "Create and link"}
          </button>
        </div>
      )}
    </Modal>
  );
}

export function ReferencePreviewController({ ctx }: { ctx: AppContext }) {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [hover, setHover] = useState<{
      id: string;
      anchor: HTMLElement;
    } | null>(null),
    [hoverEntry, setHoverEntry] = useState<Entry | null>(null),
    [modalId, setModalId] = useState(""),
    [entry, setEntry] = useState<Entry | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const cache = useRef(
      new Map<string, { revision: number; promise: Promise<Entry> }>(),
    ),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    popup = useRef<HTMLDivElement>(null),
    suppressed = useRef(0);
  const fetchEntry = useCallback((id: string) => {
    const current = ctxRef.current,
      known = current.entries.find((e) => e.id === id);
    if (!known)
      return Promise.reject(new Error("This entry is no longer available."));
    const previous = cache.current.get(id);
    if (previous?.revision === known.revision) return previous.promise;
    const world = current.world.id;
    const promise = api<Entry>("/resources/" + id).then((value) => {
      if (value.world_id !== world || ctxRef.current.world.id !== world)
        throw new Error("This entry is unavailable in the current world.");
      return value;
    });
    cache.current.set(id, { revision: known.revision, promise });
    if (cache.current.size > 60)
      cache.current.delete(cache.current.keys().next().value!);
    promise.catch(() => cache.current.delete(id));
    return promise;
  }, []);
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHover(null);
  }, []);
  const open = useCallback(
    (id: string) => {
      suppressed.current = Date.now() + 600;
      hide();
      setModalId(id);
    },
    [hide],
  );
  useEffect(() => {
    cache.current.clear();
    hide();
    setModalId("");
  }, [ctx.world.id]);
  useEffect(() => {
    let alive = true;
    setHoverEntry(null);
    if (hover)
      fetchEntry(hover.id)
        .then((value) => {
          if (alive) setHoverEntry(value);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [hover, fetchEntry]);
  useEffect(() => {
    let alive = true;
    setEntry(null);
    setError("");
    setLoading(!!modalId);
    if (modalId)
      fetchEntry(modalId)
        .then((value) => {
          if (alive) setEntry(value);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    return () => {
      alive = false;
    };
  }, [modalId, fetchEntry]);
  useEffect(() => {
    const find = (target: EventTarget | null) => {
      if (!(target instanceof Element) || target.closest(".reader-article"))
        return null;
      const button = target.closest<HTMLElement>("[data-preview-entry]");
      if (button) return { anchor: button, id: button.dataset.previewEntry! };
      const anchor = target.closest<HTMLAnchorElement>(
        'a[data-resource-id],span[data-variable-id],.rich-editor a[href*="/#/entry/"],.quick-entry-preview a[href*="/#/entry/"],.gm-reference a[href*="/#/entry/"]',
      );
      if (!anchor) return null;
      const id =
        anchor.dataset.resourceId ||
        anchor.dataset.variableId ||
        anchor.getAttribute("href")?.match(/\/#\/entry\/([a-f0-9-]{36})/i)?.[1];
      return id ? { id, anchor } : null;
    };
    const over = (event: Event) => {
      const item = find(event.target);
      if (
        !item ||
        Date.now() < suppressed.current ||
        document.querySelector("[role=dialog][aria-modal=true]")
      )
        return;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setHover(item), 350);
    };
    const out = (event: MouseEvent | FocusEvent) => {
      const item = find(event.target);
      if (
        !item ||
        (event.relatedTarget instanceof Node &&
          (item.anchor.contains(event.relatedTarget) ||
            popup.current?.contains(event.relatedTarget)))
      )
        return;
      if (timer.current) clearTimeout(timer.current);
      hideTimer.current = setTimeout(() => setHover(null), 180);
    };
    const click = (event: MouseEvent) => {
      const item = find(event.target);
      if (!item || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      open(item.id);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
      if (
        (event.key === "Enter" || event.key === " ") &&
        event.target instanceof Element &&
        event.target.closest("span[data-variable-id]")
      ) {
        const item = find(event.target);
        if (item) {
          event.preventDefault();
          open(item.id);
        }
      }
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusout", out);
    document.addEventListener("click", click);
    document.addEventListener("keydown", keys);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusout", out);
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", keys);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      hide();
    };
  }, [ctx.world.id, hide, open]);
  useEffect(() => {
    if (!hover) return;
    hover.anchor.setAttribute("aria-controls", "entry-hover-preview");
    return () => hover.anchor.removeAttribute("aria-controls");
  }, [hover]);
  let position: React.CSSProperties = {};
  if (hover) {
    const rect = hover.anchor.getBoundingClientRect(),
      width = Math.min(350, innerWidth - 24);
    position = {
      left: Math.max(12, Math.min(innerWidth - width - 12, rect.left)),
      top:
        rect.bottom + 275 > innerHeight
          ? Math.max(12, rect.top - 265)
          : rect.bottom + 8,
      width,
    };
  }
  return (
    <>
      {hover && (
        <div
          ref={popup}
          id="entry-hover-preview"
          className="entry-hover-preview"
          role="dialog"
          aria-label="Entry preview"
          style={position}
          onPointerEnter={() => {
            if (hideTimer.current) clearTimeout(hideTimer.current);
          }}
          onPointerLeave={() => {
            hideTimer.current = setTimeout(() => setHover(null), 180);
          }}
        >
          {hoverEntry ? (
            <>
              <Badge>{human(hoverEntry.template)}</Badge>
              <h3>{hoverEntry.title}</h3>
              <p>
                {excerpt(hoverEntry) ||
                  "This entry is ready for its first details."}
              </p>
              <button
                className="text-button"
                onClick={() => open(hoverEntry.id)}
              >
                <Eye size={15} />
                Open preview
                <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <p className="muted">
              {ctx.entries.some((e) => e.id === hover.id)
                ? "Opening preview…"
                : "Entry unavailable"}
            </p>
          )}
        </div>
      )}
      {modalId && (
        <Modal
          title={entry?.title || "Entry preview"}
          wide
          onClose={() => {
            suppressed.current = Date.now() + 600;
            setModalId("");
          }}
        >
          {error && <ErrorBox message={error} />}{" "}
          {loading ? (
            <div className="page-loading">
              <Loader2 size={20} className="spin" />
              Opening entry…
            </div>
          ) : (
            entry && (
              <article className="quick-entry-preview">
                <div className="quick-entry-meta">
                  <Badge>{human(entry.template)}</Badge>
                  <span>
                    {entry.status === "done" ? "Complete" : human(entry.status)}{" "}
                    · Last edited {when(entry.updated_at)}
                  </span>
                </div>
                <p className="reader-summary">{entry.summary}</p>
                <ReaderContent entry={entry} ctx={ctx} />
                {entry.private_notes && (
                  <details className="quick-private-notes">
                    <summary>
                      <LockKeyhole size={15} />
                      Private GM notes
                    </summary>
                    <p>{entry.private_notes}</p>
                  </details>
                )}
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    onClick={() => setModalId("")}
                  >
                    Keep writing
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      setModalId("");
                      ctx.go("entry/" + entry.id);
                    }}
                  >
                    <BookOpen size={16} />
                    Open entry
                    <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            )
          )}
        </Modal>
      )}
    </>
  );
}
