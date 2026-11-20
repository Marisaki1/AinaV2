import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  AppContext,
  Entry,
  api,
  post,
  saveBeforeNavigate,
  when,
} from "./domain";
import { EntryEditor } from "./EntryEditor";
import { EntryPicker, ErrorBox, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";

type Workspace = {
  book: Entry;
  nodes: Entry[];
  expected_revisions: Record<string, number>;
  statistics: {
    words: number;
    scenes: number;
    chapters: number;
    stages: Record<string, number>;
  };
  checkpoints: { id: string; name: string; created_at: string }[];
};
type Compilation = {
  book: Entry;
  nodes: (Entry & { depth: number })[];
  reader: boolean;
  words: number;
};

export function ManuscriptRoom({
  ctx,
  bookId,
}: {
  ctx: AppContext;
  bookId?: string;
}) {
  const [work, setWork] = useState<Workspace | null>(null),
    [mode, setMode] = useState("write"),
    [selected, setSelected] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [name, setName] = useState("");
  const [parent, setParent] = useState(""),
    [moveTo, setMoveTo] = useState(""),
    [checkpointName, setCheckpointName] = useState("");
  const [research, setResearch] = useState(false),
    [referenceQuery, setReferenceQuery] = useState(""),
    [referenceResults, setReferenceResults] = useState<Entry[]>([]),
    [reference, setReference] = useState<Entry | null>(null);
  const [assembled, setAssembled] = useState<Compilation | null>(null),
    [edition, setEdition] = useState("owner");
  const [plan, setPlan] = useState<any>(null),
    [checkpointId, setCheckpointId] = useState(""),
    [goal, setGoal] = useState(""),
    [author, setAuthor] = useState(""),
    [subtitle, setSubtitle] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cover, setCover] = useState("");
  const [searchMatches, setSearchMatches] = useState<
    { id: string; excerpt: string }[]
  >([]);
  useEffect(() => {
    if (!bookId || !query.trim()) {
      setSearchMatches([]);
      return;
    }
    let active = true;
    const timer = setTimeout(
      () =>
        api<any>(
          `/resources/${bookId}/manuscript?q=${encodeURIComponent(query.trim())}`,
        )
          .then((value) => {
            if (active) setSearchMatches(value.search_matches || []);
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [bookId, query]);
  const locked = useRef(false),
    referenceOrigin = useRef<HTMLElement | null>(null);
  const path = `/resources/${bookId}/manuscript`;
  const refresh = async () => {
    const value = await api<Workspace>(path);
    setWork(value);
    return value;
  };
  useEffect(() => {
    if (!bookId) return;
    let active = true;
    api<Workspace>(path)
      .then((value) => {
        if (active) {
          setWork(value);
          setParent(bookId);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [bookId]);
  useEffect(() => {
    if (!research) return;
    let active = true;
    const timer = setTimeout(
      () =>
        api<{ resources: Entry[] }>(
          `/worlds/${ctx.world.id}/resources?q=${encodeURIComponent(referenceQuery)}`,
        )
          .then((value) => {
            if (active) setReferenceResults(value.resources.slice(0, 30));
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [research, referenceQuery, ctx.world.id]);
  const flush = async () =>
    !saveBeforeNavigate.current || (await saveBeforeNavigate.current());
  const run = async (operation: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      if (await flush()) await operation();
    } catch (e: any) {
      setError(e.message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const action = async (action: string, extra: any = {}) => {
    const latest = await api<Workspace>(path);
    const value = await post<Workspace>(path, {
      action,
      ...extra,
      expected_revisions: latest.expected_revisions,
    });
    setWork(value);
    await ctx.refresh();
    return value;
  };
  const switchMode = (next: string) =>
    void run(async () => {
      await refresh();
      setMode(next);
      if (next === "read")
        setAssembled(
          await api<Compilation>(path + "/compile?audience=" + edition),
        );
    });
  const openReference = async (id: string) => {
    setError("");
    try {
      setReference(await api<Entry>("/resources/" + id));
    } catch (e: any) {
      setError(e.message);
    }
  };
  const closeResearch = () => {
    setResearch(false);
    requestAnimationFrame(() =>
      referenceOrigin.current?.focus({ preventScroll: true }),
    );
  };
  if (!bookId)
    return (
      <div className="page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">WRITING ROOM</span>
            <h1>Manuscripts</h1>
          </div>
          <button
            className="button primary"
            onClick={() => ctx.create("manuscript")}
          >
            New manuscript
          </button>
        </div>
        <div className="manuscript-grid">
          {ctx.entries
            .filter((e) => e.kind === "manuscript")
            .map((book) => (
              <button
                key={book.id}
                className="manuscript-card"
                onClick={() => ctx.go("writing/" + book.id)}
              >
                <div className="book-cover">
                  <h2>{book.title}</h2>
                  <span>{book.data.label || "Draft"}</span>
                </div>
                <div>
                  <h3>{book.title}</h3>
                  <p>
                    {book.summary || "Open your outline and writing workspace."}
                  </p>
                </div>
              </button>
            ))}
        </div>
      </div>
    );
  if (!work)
    return (
      <div className="page">
        {error ? (
          <ErrorBox message={error} />
        ) : (
          <p role="status">Loading manuscript…</p>
        )}
      </div>
    );
  const book = work.book,
    nodes = work.nodes;
  const current =
    nodes.find((e) => e.id === selected) ||
    nodes.find((e) => e.kind === "scene") ||
    nodes[0];
  const parents = [
    book,
    ...nodes.filter((e) => ["chapter", "folder"].includes(e.kind)),
  ];
  const byParent = (id: string) => nodes.filter((e) => e.parent === id);
  const depth = (entry: Entry) => {
    let n = 0,
      p = entry.parent,
      seen = new Set<string>();
    while (p && p !== book.id && !seen.has(p)) {
      seen.add(p);
      n++;
      p = nodes.find((e) => e.id === p)?.parent || null;
    }
    return Math.min(n, 8);
  };
  const isResearch = (entry: Entry) => {
    let node: Entry | undefined = entry;
    const seen = new Set<string>();
    while (node && !seen.has(node.id)) {
      if (node.kind === "folder") return true;
      seen.add(node.id);
      node = nodes.find((e) => e.id === node!.parent);
    }
    return false;
  };
  const writingNodes = nodes.filter((e) => !isResearch(e));
  const include: string[] =
    book.data.writing_include || writingNodes.map((e) => e.id);
  const matches = query.trim()
    ? nodes.filter((e) => searchMatches.some((match) => match.id === e.id))
    : nodes;
  const changeSelection = (entry: Entry) =>
    void run(async () => {
      setSelected(entry.id);
      setMoveTo(entry.parent || book.id);
      setMode("write");
    });
  const move = (entry: Entry, delta: number) =>
    void run(async () => {
      const latest = await api<Workspace>(path),
        siblings = latest.nodes.filter((e) => e.parent === entry.parent),
        index = siblings.findIndex((e) => e.id === entry.id),
        destination = index + delta;
      if (destination < 0 || destination >= siblings.length) return;
      const value = await post<Workspace>(path, {
        action: "move",
        id: entry.id,
        parent: entry.parent,
        position: destination,
        expected_revisions: latest.expected_revisions,
      });
      setWork(value);
      await ctx.refresh();
    });
  const create = (kind: string) =>
    void run(async () => {
      const latest = await api<Workspace>(path);
      const value = await post<Entry>(`/worlds/${ctx.world.id}/resources`, {
        kind,
        title: name.trim() || "New " + kind,
        parent: parent || book.id,
        position: latest.nodes.filter((e) => e.parent === (parent || book.id))
          .length,
        data:
          kind === "folder"
            ? { collection_type: "folder" }
            : { goal: 0, label: "First draft" },
      });
      await ctx.refresh();
      await refresh();
      setName("");
      setSelected(value.id);
      setMode("write");
    });
  const exportFile = (format: string) =>
    void run(async () => {
      const response = await fetch(
        "/api" + path + "/compile?format=" + format + "&audience=" + edition,
        { credentials: "same-origin" },
      );
      if (!response.ok) {
        const value = await response.json();
        throw Error(value.error || "Compilation failed.");
      }
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = "manuscript." + (format === "html" ? "html" : "txt");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  return (
    <div className="writing-workspace manuscript-room">
      <div className="writing-heading">
        <button className="text-button" onClick={() => ctx.go("writing")}>
          ← Manuscripts
        </button>
        <h1>{book.title}</h1>
        <div className="view-toggle">
          {[
            ["write", "Write"],
            ["board", "Corkboard"],
            ["read", "Read"],
            ["review", "Review"],
            ["drafts", "Draft checkpoints"],
          ].map(([id, label]) => (
            <button
              key={id}
              disabled={busy}
              className={mode === id ? "selected" : ""}
              onClick={() => switchMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="button secondary small"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setGoal(String(book.data.goal || 0));
              setAuthor(book.data.author || "");
              setSubtitle(book.data.subtitle || "");
              setCover(book.data.cover_asset || "");
              setSettingsOpen(true);
            })
          }
        >
          Book settings
        </button>
        <button
          className="button secondary small"
          aria-expanded={research}
          onMouseDown={(e) => {
            referenceOrigin.current = document.activeElement as HTMLElement;
            e.preventDefault();
          }}
          onClick={() => (research ? closeResearch() : setResearch(true))}
        >
          Research & references
        </button>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="writing-progress">
        <span>
          {work.statistics.words.toLocaleString()} draft words
          {book.data.goal
            ? " / " + Number(book.data.goal).toLocaleString() + " goal"
            : ""}
        </span>
        <span>
          {work.statistics.scenes} scenes · {work.statistics.chapters} chapters
        </span>
        <button
          className="text-button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await refresh();
            })
          }
        >
          Refresh statistics
        </button>
      </div>
      <div className={"manuscript-layout" + (research ? " with-research" : "")}>
        <aside className="writing-tree">
          <h2 className="eyebrow">MANUSCRIPT OUTLINE</h2>
          <input
            aria-label="Filter manuscript outline"
            placeholder="Search titles and manuscript prose"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="manuscript-outline">
            {matches.map((entry) => (
              <div
                key={entry.id}
                className={
                  "manuscript-outline-row" +
                  (current?.id === entry.id ? " active" : "")
                }
                style={{ paddingLeft: 8 + depth(entry) * 12 }}
              >
                <button
                  className="text-button"
                  onClick={() => changeSelection(entry)}
                >
                  <strong>{entry.title}</strong>
                  <small>
                    {entry.kind} · {entry.word_count} words
                  </small>
                </button>
                <div>
                  <button
                    className="icon-button"
                    aria-label={"Move " + entry.title + " earlier"}
                    disabled={
                      busy ||
                      byParent(entry.parent || book.id)[0]?.id === entry.id
                    }
                    onClick={() => move(entry, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Move " + entry.title + " later"}
                    disabled={
                      busy ||
                      byParent(entry.parent || book.id).at(-1)?.id === entry.id
                    }
                    onClick={() => move(entry, 1)}
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="quick-scene">
            <input
              aria-label="New manuscript node title"
              placeholder="Scene, chapter, or research folder"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <EntryPicker
              label="Create inside"
              entries={parents}
              value={parent || book.id}
              onChange={setParent}
            />
            <div className="button-row">
              <button
                className="button primary small"
                disabled={busy}
                onClick={() => create("scene")}
              >
                Add scene
              </button>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => create("chapter")}
              >
                Add chapter
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => create("folder")}
              >
                Add research folder
              </button>
            </div>
          </div>
          {current && (
            <details>
              <summary>Move selected node</summary>
              <EntryPicker
                label="Move node into"
                value={moveTo || current.parent || book.id}
                entries={parents.filter((e) => e.id !== current.id)}
                onChange={setMoveTo}
              />
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const latest = await api<Workspace>(path),
                      destination = moveTo || current.parent || book.id;
                    setWork(
                      await post<Workspace>(path, {
                        action: "move",
                        id: current.id,
                        parent: destination,
                        position: latest.nodes.filter(
                          (e) =>
                            e.parent === destination && e.id !== current.id,
                        ).length,
                        expected_revisions: latest.expected_revisions,
                      }),
                    );
                    await ctx.refresh();
                  })
                }
              >
                Move selected node
              </button>
            </details>
          )}
        </aside>
        <main className="writing-main">
          {mode === "write" &&
            (current ? (
              <EntryEditor key={current.id} id={current.id} ctx={ctx} />
            ) : (
              <div className="empty">
                Add your first scene from the outline.
              </div>
            ))}
          {mode === "board" && (
            <div className="corkboard">
              {matches
                .filter((e) => !isResearch(e))
                .map((entry) => (
                  <article key={entry.id}>
                    <small>
                      {entry.kind} · {entry.data.label || "Draft"} ·{" "}
                      {entry.word_count} words
                    </small>
                    <h2>{entry.title}</h2>
                    <p>{entry.summary || "No synopsis yet."}</p>
                    <div className="button-row">
                      <button
                        className="text-button"
                        onClick={() => changeSelection(entry)}
                      >
                        Write {entry.title}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={
                          "Corkboard move " + entry.title + " earlier"
                        }
                        disabled={
                          busy ||
                          byParent(entry.parent || book.id)[0]?.id === entry.id
                        }
                        onClick={() => move(entry, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Corkboard move " + entry.title + " later"}
                        disabled={
                          busy ||
                          byParent(entry.parent || book.id).at(-1)?.id ===
                            entry.id
                        }
                        onClick={() => move(entry, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          )}
          {mode === "read" && (
            <div className="manuscript-reading">
              <div className="button-row">
                <label className="field">
                  <span>Edition</span>
                  <SearchableSelect
                    value={edition}
                    onChange={(e) => {
                      const next = e.target.value;
                      void run(async () => {
                        setAssembled(
                          await api<Compilation>(
                            path + "/compile?audience=" + next,
                          ),
                        );
                        setEdition(next);
                      });
                    }}
                  >
                    <option value="owner">Working draft (owner)</option>
                    <option value="reader">Published reader snapshots</option>
                  </SearchableSelect>
                </label>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => exportFile("html")}
                >
                  Download book HTML
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => exportFile("text")}
                >
                  Download book text
                </button>
              </div>
              {assembled && (
                <>
                  <h1>{assembled.book.title}</h1>
                  <p>{assembled.book.data.author}</p>
                  <p className="muted">
                    {assembled.words.toLocaleString()} words in this edition
                  </p>
                  {assembled.book.data.cover_asset &&
                    ctx.assets.find(
                      (asset) => asset.id === assembled.book.data.cover_asset,
                    ) && (
                      <img
                        alt="Book cover"
                        src={
                          ctx.assets.find(
                            (asset) =>
                              asset.id === assembled.book.data.cover_asset,
                          )!.url
                        }
                      />
                    )}
                  <div
                    className="rendered-prose"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(assembled.book.html || ""),
                    }}
                  />
                  {assembled.nodes.map((entry) => (
                    <article key={entry.id} id={"read-" + entry.id}>
                      <h2>{entry.title}</h2>
                      <div
                        className="rendered-prose"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(entry.html || ""),
                        }}
                      />
                    </article>
                  ))}
                </>
              )}
            </div>
          )}
          {mode === "review" && (
            <div className="manuscript-review">
              <h2>Compilation selection</h2>
              <p>
                Selected chapters include their selected scenes. Research
                folders stay outside the book. Reader editions require published
                snapshots; selecting an entry does not publish it.
              </p>
              <div className="button-row">
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await action("settings", {
                        settings: {
                          writing_include: nodes
                            .filter((e) => !isResearch(e))
                            .map((e) => e.id),
                        },
                      });
                    })
                  }
                >
                  Include all writing
                </button>
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await action("settings", {
                        settings: { writing_include: [] },
                      });
                    })
                  }
                >
                  Clear compilation selection
                </button>
                <button
                  className="button primary small"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Publish the selected manuscript snapshots for the local reader edition? This does not enable public hosting.",
                      )
                    )
                      void run(async () => {
                        await action("publish");
                      });
                  }}
                >
                  Publish selected snapshots
                </button>
              </div>
              <div className="manuscript-review-list">
                {nodes
                  .filter((e) => !isResearch(e))
                  .map((entry) => (
                    <label key={entry.id}>
                      <input
                        type="checkbox"
                        checked={include.includes(entry.id)}
                        disabled={busy}
                        aria-label={
                          "Include " + entry.title + " in compilation"
                        }
                        onChange={() =>
                          void run(async () => {
                            await action("settings", {
                              settings: {
                                writing_include: include.includes(entry.id)
                                  ? include.filter((id) => id !== entry.id)
                                  : [...include, entry.id],
                              },
                            });
                          })
                        }
                      />
                      <strong>{entry.title}</strong>
                      <span>
                        {entry.kind} · {entry.word_count} words ·{" "}
                        {entry.data.label || "No stage"} ·{" "}
                        {entry.published_revision
                          ? "Published r" + entry.published_revision
                          : "Unpublished"}
                      </span>
                    </label>
                  ))}
              </div>
              <h2>Writing stages</h2>
              <div className="button-row">
                {Object.entries(work.statistics.stages).map(
                  ([stage, count]) => (
                    <span className="badge" key={stage}>
                      {stage}: {count}
                    </span>
                  ),
                )}
              </div>
            </div>
          )}
          {mode === "drafts" && (
            <div className="manuscript-drafts">
              <h2>Named draft checkpoints</h2>
              <p>
                A checkpoint retains prose, metadata and structure for up to 200
                manuscript records. Up to five checkpoints are allowed, subject
                to the existing per-record size limit. Complete world archives
                preserve them. Publication is kept separate.
              </p>
              <div className="button-row">
                <input
                  aria-label="Checkpoint name"
                  placeholder="Before revision"
                  value={checkpointName}
                  onChange={(e) => setCheckpointName(e.target.value)}
                />
                <button
                  className="button primary"
                  disabled={busy || !checkpointName.trim()}
                  onClick={() =>
                    void run(async () => {
                      await action("checkpoint", { name: checkpointName });
                      setCheckpointName("");
                    })
                  }
                >
                  Create checkpoint
                </button>
              </div>
              {work.checkpoints.map((c) => (
                <article className="manuscript-checkpoint" key={c.id}>
                  <div>
                    <h3>{c.name}</h3>
                    <small>{when(c.created_at)}</small>
                  </div>
                  <div className="button-row">
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          setPlan(await api(path + "/checkpoints/" + c.id));
                          setCheckpointId(c.id);
                        })
                      }
                    >
                      Review checkpoint {c.name}
                    </button>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove this named checkpoint? Current writing and normal revision history remain.",
                          )
                        )
                          void run(async () => {
                            await action("delete_checkpoint", {
                              checkpoint_id: c.id,
                            });
                          });
                      }}
                    >
                      Remove checkpoint {c.name}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
        {research && (
          <aside className="manuscript-research">
            <div className="section-heading">
              <h2>Research & references</h2>
              <button className="text-button" onClick={closeResearch}>
                Close research
              </button>
            </div>
            <input
              aria-label="Search manuscript research"
              placeholder="Search all world content"
              value={referenceQuery}
              onChange={(e) => setReferenceQuery(e.target.value)}
            />
            <h3>Saved research</h3>
            {(book.data.writing_research || []).map((id: string) => (
              <div key={id} className="button-row">
                <button
                  className="text-button"
                  onClick={() => void openReference(id)}
                >
                  {ctx.entries.find((e) => e.id === id)?.title ||
                    "Unavailable reference"}
                </button>
                <button
                  className="icon-button"
                  aria-label={"Unpin research " + id}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await action("settings", {
                        settings: {
                          writing_research: (
                            book.data.writing_research || []
                          ).filter((v: string) => v !== id),
                        },
                      });
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <div className="manuscript-research-results">
              {referenceResults.map((entry) => (
                <div key={entry.id}>
                  <button
                    className="text-button"
                    onClick={() => void openReference(entry.id)}
                  >
                    {entry.title}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Pin research " + entry.title}
                    disabled={
                      busy ||
                      (book.data.writing_research || []).includes(entry.id)
                    }
                    onClick={() =>
                      void run(async () => {
                        await action("settings", {
                          settings: {
                            writing_research: [
                              ...(book.data.writing_research || []),
                              entry.id,
                            ],
                          },
                        });
                      })
                    }
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
            {reference && (
              <article>
                <h3>{reference.title}</h3>
                <div
                  className="rendered-prose"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(reference.html || ""),
                  }}
                />
              </article>
            )}
          </aside>
        )}
      </div>
      {settingsOpen && (
        <Modal
          title="Manuscript settings"
          onClose={() => {
            if (!busy) setSettingsOpen(false);
          }}
        >
          {error && <ErrorBox message={error} />}
          <label className="field">
            <span>Word goal</span>
            <input
              type="number"
              min={0}
              max={10000000}
              aria-label="Manuscript word goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Author</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <label className="field">
            <span>Subtitle</span>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Book cover image</span>
            <SearchableSelect
              value={cover}
              onChange={(e) => setCover(e.target.value)}
            >
              <option value="">No cover image</option>
              {ctx.assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </SearchableSelect>
          </label>
          <p>
            Use Book details to edit its cover image, introduction and other
            original fields.
          </p>
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await action("settings", {
                    settings: {
                      goal: Number(goal),
                      author,
                      subtitle,
                      cover_asset: cover,
                    },
                  });
                  setSettingsOpen(false);
                })
              }
            >
              Save manuscript settings
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => ctx.go("entry/" + book.id)}
            >
              Book details
            </button>
          </div>
        </Modal>
      )}
      {plan && (
        <Modal
          title={"Review draft: " + plan.name}
          wide
          onClose={() => {
            if (!busy) setPlan(null);
          }}
        >
          {error && <ErrorBox message={error} />}
          <p>
            Restoring keeps original IDs and creates new revisions. Published
            snapshots and access remain unchanged. Newer nodes stay recoverable
            in the library outside the restored manuscript.
          </p>
          {plan.changes.map((change: any) => (
            <details key={change.id}>
              <summary>
                {change.saved_title}
                {change.trashed ? " · restore from Trash" : ""}
              </summary>
              <p>
                Changed fields:{" "}
                {(change.changed_fields || []).join(", ") ||
                  "No draft differences"}
              </p>
              <div className="manuscript-comparison">
                <section>
                  <h3>Current</h3>
                  <p>{change.current_text || "(Empty)"}</p>
                  <small>Parent: {change.current_parent || "None"}</small>
                </section>
                <section>
                  <h3>Checkpoint</h3>
                  <p>{change.saved_text || "(Empty)"}</p>
                  <small>Parent: {change.saved_parent || "None"}</small>
                </section>
              </div>
            </details>
          ))}
          {plan.retained_new_nodes.length > 0 && (
            <div>
              <h3>Newer writing retained outside this draft</h3>
              <ul>
                {plan.retained_new_nodes.map((entry: any) => (
                  <li key={entry.id}>{entry.title}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const value = await post<Workspace>(
                  path + "/checkpoints/" + checkpointId,
                  { expected_revisions: plan.expected_revisions },
                );
                setWork(value);
                setSelected("");
                setMoveTo("");
                setParent(book.id);
                setPlan(null);
                await ctx.refresh();
              })
            }
          >
            Restore reviewed checkpoint
          </button>
        </Modal>
      )}
    </div>
  );
}
