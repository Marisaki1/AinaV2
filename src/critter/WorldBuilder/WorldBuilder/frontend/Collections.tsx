import { SearchableSelect } from "./SearchableSelect";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  List,
  Loader2,
  MoveRight,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Tags,
} from "lucide-react";
import {
  AppContext,
  Asset,
  Entry,
  api,
  post,
  human,
  kindLabels,
  when,
} from "./domain";
import { Badge, Empty, ErrorBox, Field, KindIcon, Modal, TagField } from "./ui";
import { EntryCard, PageHeading } from "./Pages";

export const tagKey = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("en").trim();
export const isSmart = (entry?: Entry) =>
  entry?.kind === "folder" && entry.data.collection_type === "smart";
const ordered = (a: Entry, b: Entry) =>
  a.position - b.position ||
  a.title.localeCompare(b.title) ||
  a.id.localeCompare(b.id);

export function descendants(entries: Entry[], ids: Iterable<string>) {
  const found = new Set(ids),
    children = new Map<string, Entry[]>();
  for (const entry of entries)
    if (entry.parent)
      children.set(entry.parent, [
        ...(children.get(entry.parent) || []),
        entry,
      ]);
  const queue = [...found];
  while (queue.length) {
    for (const entry of children.get(queue.pop()!) || [])
      if (!found.has(entry.id)) {
        found.add(entry.id);
        queue.push(entry.id);
      }
  }
  return found;
}

export function CollectionRulesEditor({
  data,
  onChange,
  ctx,
}: {
  data: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
  ctx: AppContext;
}) {
  const rules = data.rules || {},
    smart = data.collection_type === "smart";
  const update = (key: string, value: any) =>
    onChange({ ...data, rules: { ...rules, [key]: value } });
  const toggle = (key: string, value: string, checked: boolean) =>
    update(
      key,
      checked
        ? [...(rules[key] || []), value]
        : (rules[key] || []).filter((v: string) => v !== value),
    );
  return (
    <div className="collection-rules">
      <label className="field">
        <span>Collection type</span>
        <SearchableSelect
          value={smart ? "smart" : "folder"}
          onChange={(e) =>
            onChange({ ...data, collection_type: e.target.value })
          }
        >
          <option value="folder">Folder · organize entries</option>
          <option value="smart">Saved filter · gather matching content</option>
        </SearchableSelect>
      </label>
      {smart ? (
        <>
          <p className="muted small-copy">
            Matching entries and images appear here automatically as their tags
            and details change.
          </p>
          <TagField
            label="Matching tags"
            value={rules.tags || []}
            onChange={(v) => update("tags", v)}
            placeholder="shrine, character"
          />
          <label className="field">
            <span>Tag matching</span>
            <SearchableSelect
              value={rules.tag_mode || "all"}
              onChange={(e) => update("tag_mode", e.target.value)}
            >
              <option value="all">Must have every selected tag</option>
              <option value="any">May have any selected tag</option>
            </SearchableSelect>
          </label>
          <Field
            label="Search words"
            value={rules.query || ""}
            onChange={(v) => update("query", v)}
            placeholder="Optional words from names, notes or details"
          />
          <details className="rule-options" open>
            <summary>
              Content types{" "}
              <span>
                {(rules.kinds || []).length ? "Selected types" : "All types"}
              </span>
            </summary>
            <div className="rule-checkboxes">
              {[
                ...Object.entries(kindLabels).filter(
                  ([key]) => key !== "folder",
                ),
                ["media", "Images"],
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={(rules.kinds || []).includes(key)}
                    onChange={(e) => toggle("kinds", key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
          <details className="rule-options">
            <summary>
              Article templates{" "}
              <span>{(rules.templates || []).length || "All"}</span>
            </summary>
            <div className="rule-checkboxes">
              {[
                ...ctx.templates.map((t) => ({ id: t.id, label: t.label })),
                ...ctx.entries
                  .filter((e) => e.kind === "template")
                  .map((t) => ({ id: "custom:" + t.id, label: t.title })),
              ].map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    checked={(rules.templates || []).includes(t.id)}
                    onChange={(e) =>
                      toggle("templates", t.id, e.target.checked)
                    }
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </details>
          <details className="rule-options">
            <summary>
              Writing status{" "}
              <span>{(rules.statuses || []).length || "All"}</span>
            </summary>
            <div className="rule-checkboxes">
              {[
                ["draft", "Draft"],
                ["wip", "In progress"],
                ["done", "Complete"],
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={(rules.statuses || []).includes(key)}
                    onChange={(e) => toggle("statuses", key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
        </>
      ) : (
        <p className="muted small-copy">
          Folders can contain entries and other collections. Moving a folder
          carries its contents with it.
        </p>
      )}
    </div>
  );
}

type Contents = {
  collection: Entry;
  resources: Entry[];
  assets: Asset[];
  breadcrumbs: { id: string; title: string }[];
};
export function LibraryOrganizer({ ctx }: { ctx: AppContext }) {
  const selection = location.hash.slice(2).split("/")[1] || "all";
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [tag, setTag] = useState(""),
    [sort, setSort] = useState("order"),
    [view, setView] = useState("grid"),
    [recursive, setRecursive] = useState(false),
    [checked, setChecked] = useState<Set<string>>(new Set()),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [contents, setContents] = useState<Contents | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [moving, setMoving] = useState<string[] | null>(null),
    [target, setTarget] = useState(""),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [parent, setParent] = useState(""),
    [collectionData, setCollectionData] = useState<Record<string, any>>({
      collection_type: "folder",
    }),
    [searchIds, setSearchIds] = useState<Set<string> | null>(null),
    [searching, setSearching] = useState(false);
  const preferenceRef = useRef({ view: "grid", sort: "order" });
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("worldbuilder.library:" + ctx.world.id) || "{}",
      );
      setSort(
        ["order", "recent", "title"].includes(saved.sort)
          ? saved.sort
          : "order",
      );
      setView(["grid", "list"].includes(saved.view) ? saved.view : "grid");
      preferenceRef.current = {
        view: ["grid", "list"].includes(saved.view) ? saved.view : "grid",
        sort: ["order", "recent", "title"].includes(saved.sort)
          ? saved.sort
          : "order",
      };
    } catch {
      setSort("order");
      setView("grid");
      preferenceRef.current = { view: "grid", sort: "order" };
    }
  }, [ctx.world.id]);
  const preference = (key: "view" | "sort", value: string) => {
    preferenceRef.current = { ...preferenceRef.current, [key]: value };
    if (key === "view") setView(value);
    else setSort(value);
    try {
      localStorage.setItem(
        "worldbuilder.library:" + ctx.world.id,
        JSON.stringify(preferenceRef.current),
      );
    } catch {}
  };
  const folders = useMemo(
    () => ctx.entries.filter((e) => e.kind === "folder").sort(ordered),
    [ctx.entries],
  );
  const selectedFolder = folders.find((e) => e.id === selection),
    smart = isSmart(selectedFolder);
  const currentContents =
    contents?.collection.id === selection &&
    contents.collection.world_id === ctx.world.id
      ? contents
      : null;
  useEffect(() => {
    setChecked(new Set());
    setError("");
  }, [selection, ctx.world.id]);
  useEffect(() => {
    try {
      setCollapsed(
        new Set(
          JSON.parse(
            localStorage.getItem("worldbuilder.collections:" + ctx.world.id) ||
              "[]",
          ),
        ),
      );
    } catch {
      setCollapsed(new Set());
    }
  }, [ctx.world.id]);
  useEffect(() => {
    if (selection === "all" || selection === "unfiled") {
      setContents(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    api<Contents>(
      "/worlds/" +
        ctx.world.id +
        "/collections/" +
        selection +
        (recursive ? "?recursive=1" : ""),
    )
      .then((value) => {
        if (alive) setContents(value);
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
  }, [selection, recursive, ctx.entries, ctx.assets, ctx.world.id]);
  useEffect(() => {
    if (!query.trim()) {
      setSearchIds(null);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    setSearchIds(null);
    const timer = setTimeout(
      () =>
        api(
          "/worlds/" +
            ctx.world.id +
            "/resources?q=" +
            encodeURIComponent(query),
        )
          .then((value) => {
            if (alive)
              setSearchIds(new Set(value.resources.map((e: Entry) => e.id)));
          })
          .catch((e) => {
            if (alive) setError(e.message);
          })
          .finally(() => {
            if (alive) setSearching(false);
          }),
      200,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, ctx.entries, ctx.world.id]);
  const tree = useMemo(() => {
    const ids = new Set(folders.map((e) => e.id)),
      children = new Map<string, Entry[]>();
    for (const f of folders) {
      const key = f.parent && ids.has(f.parent) ? f.parent : "root";
      children.set(key, [...(children.get(key) || []), f]);
    }
    const rows: { entry: Entry; depth: number; children: boolean }[] = [],
      seen = new Set<string>();
    const pending = (children.get("root") || [])
      .map((entry) => ({ entry, depth: 0 }))
      .reverse();
    while (pending.length) {
      const item = pending.pop()!;
      if (seen.has(item.entry.id)) continue;
      seen.add(item.entry.id);
      const child = children.get(item.entry.id) || [];
      rows.push({ ...item, children: !!child.length });
      if (!collapsed.has(item.entry.id))
        pending.push(
          ...child.map((entry) => ({ entry, depth: item.depth + 1 })).reverse(),
        );
    }
    return rows;
  }, [folders, collapsed]);
  const base =
    selection === "all"
      ? ctx.entries
      : selection === "unfiled"
        ? ctx.entries.filter((e) => !e.parent)
        : currentContents?.resources || [];
  const childFolders = folders.filter((e) =>
    selection === "all" || selection === "unfiled"
      ? !e.parent || !folders.some((f) => f.id === e.parent)
      : e.parent === selection,
  );
  const tagOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of [...ctx.entries, ...ctx.assets])
      for (const t of item.tags || [])
        if (!names.has(tagKey(t))) names.set(tagKey(t), t);
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [ctx.entries, ctx.assets]);
  const matches = (entry: Entry) =>
    entry.kind !== "folder" &&
    (kind === "all" || entry.kind === kind) &&
    (tag === "" || entry.tags.some((t) => tagKey(t) === tag)) &&
    (!query.trim() || (!searching && searchIds?.has(entry.id)));
  const entries = base
    .filter(matches)
    .sort(
      sort === "title"
        ? (a, b) => a.title.localeCompare(b.title)
        : sort === "recent"
          ? (a, b) => b.updated_at.localeCompare(a.updated_at)
          : ordered,
    );
  const images = (currentContents?.assets || []).filter(
    (a) =>
      (kind === "all" || kind === "media") &&
      (!tag || (a.tags || []).some((t) => tagKey(t) === tag)) &&
      (!query.trim() ||
        tagKey(a.name + " " + a.credit + " " + a.tags.join(" ")).includes(
          tagKey(query),
        )),
  );
  const select = (id: string) =>
    ctx.go(id === "all" ? "library" : "library/" + id);
  const toggle = (id: string) =>
    setChecked((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const beginMove = (ids: string[]) => {
    setMoving(ids);
    setTarget("");
    setError("");
  };
  const move = async (ids: string[], destination: string) => {
    setBusy(true);
    setError("");
    try {
      const siblings = ctx.entries.filter(
        (e) => e.parent === (destination || null),
      );
      let position = Math.max(-1, ...siblings.map((e) => e.position));
      await post("/worlds/" + ctx.world.id + "/organize", {
        entries: ids.map((id) => {
          const entry = ctx.entries.find((e) => e.id === id);
          if (!entry)
            throw new Error(
              "An entry is no longer available. Refresh and try again.",
            );
          return {
            id,
            parent: destination || null,
            position: ++position,
            revision: entry.revision,
          };
        }),
      });
      await ctx.refresh();
      setMoving(null);
      setChecked(new Set());
      ctx.notify(
        "Moved " +
          ids.length +
          " " +
          (ids.length === 1 ? "entry." : "entries."),
      );
    } catch (e: any) {
      setError(e.message);
      if (e.status === 409) await ctx.refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const drop = (event: React.DragEvent, destination: string) => {
    event.preventDefault();
    try {
      const value = JSON.parse(
        event.dataTransfer.getData("application/x-worldbuilder-resource"),
      );
      if (
        value.world !== ctx.world.id ||
        !Array.isArray(value.ids) ||
        value.ids.some((id: any) => typeof id !== "string")
      )
        return;
      move(value.ids, destination);
    } catch {
      ctx.notify("That item could not be moved.", true);
    }
  };
  const drag = (event: React.DragEvent, id: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-worldbuilder-resource",
      JSON.stringify({
        world: ctx.world.id,
        ids: checked.has(id) ? [...checked] : [id],
      }),
    );
  };
  const allowDrop = (event: React.DragEvent) => {
    if (
      event.dataTransfer.types.includes("application/x-worldbuilder-resource")
    )
      event.preventDefault();
  };
  const reorder = async (folder: Entry, delta: number) => {
    const siblings = folders.filter((e) => e.parent === folder.parent),
      index = siblings.findIndex((e) => e.id === folder.id),
      other = index + delta;
    if (other < 0 || other >= siblings.length) return;
    [siblings[index], siblings[other]] = [siblings[other], siblings[index]];
    setBusy(true);
    try {
      await post("/worlds/" + ctx.world.id + "/organize", {
        entries: siblings.map((e, i) => ({
          id: e.id,
          parent: e.parent,
          position: i,
          revision: e.revision,
        })),
      });
      await ctx.refresh();
    } catch (e: any) {
      ctx.notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const forbidden = descendants(ctx.entries, moving || []);
  const createCollection = () => {
    setName("");
    setParent(selectedFolder && !smart ? selectedFolder.id : "");
    setCollectionData({ collection_type: "folder" });
    setError("");
    setCreating(true);
  };
  return (
    <div className="page organizer-page">
      <PageHeading
        eyebrow="EVERYTHING HAS A PLACE"
        title="World library"
        action={
          <div className="button-row">
            <button className="button secondary" onClick={createCollection}>
              <FolderPlus size={16} />
              New collection
            </button>
            <button
              className="button primary"
              onClick={() =>
                ctx.create(
                  "article",
                  selectedFolder && !smart ? selection : undefined,
                )
              }
            >
              <Plus size={17} />
              New entry
            </button>
          </div>
        }
      >
        Organize your world, follow a thread, or gather a collection that grows
        with you.
      </PageHeading>
      <div className="organizer-layout">
        <aside className="collection-tree" aria-label="Collections">
          <div className="section-heading">
            <h2>Collections</h2>
            <button
              className="icon-button"
              aria-label="New collection"
              onClick={createCollection}
            >
              <Plus size={17} />
            </button>
          </div>
          <button
            className={
              "collection-root " + (selection === "all" ? "active" : "")
            }
            onClick={() => select("all")}
          >
            All entries{" "}
            <span>{ctx.entries.filter((e) => e.kind !== "folder").length}</span>
          </button>
          <button
            className={
              "collection-root " + (selection === "unfiled" ? "active" : "")
            }
            onClick={() => select("unfiled")}
            onDragOver={allowDrop}
            onDrop={(e) => drop(e, "")}
          >
            Unfiled
          </button>
          <div className="collection-tree-rows">
            {tree.map(({ entry, depth, children }) => (
              <div
                className={
                  "collection-tree-row " +
                  (selection === entry.id ? "active" : "")
                }
                key={entry.id}
                style={{ paddingLeft: Math.min(depth, 8) * 13 + 5 }}
                draggable={!busy}
                onDragStart={(e) => drag(e, entry.id)}
                onDragOver={!isSmart(entry) ? allowDrop : undefined}
                onDrop={!isSmart(entry) ? (e) => drop(e, entry.id) : undefined}
              >
                {children ? (
                  <button
                    className="tree-expander"
                    aria-label={
                      (collapsed.has(entry.id) ? "Expand " : "Collapse ") +
                      entry.title
                    }
                    aria-expanded={!collapsed.has(entry.id)}
                    onClick={() =>
                      setCollapsed((old) => {
                        const next = new Set(old);
                        if (next.has(entry.id)) next.delete(entry.id);
                        else next.add(entry.id);
                        localStorage.setItem(
                          "worldbuilder.collections:" + ctx.world.id,
                          JSON.stringify([...next]),
                        );
                        return next;
                      })
                    }
                  >
                    {collapsed.has(entry.id) ? (
                      <ChevronRight size={13} />
                    ) : (
                      <ChevronDown size={13} />
                    )}
                  </button>
                ) : (
                  <span className="tree-spacer" />
                )}
                <button
                  className="tree-name"
                  onClick={() => select(entry.id)}
                  title={entry.title}
                >
                  {isSmart(entry) ? (
                    <SlidersHorizontal size={15} />
                  ) : (
                    <FolderOpen size={15} />
                  )}
                  <span>{entry.title}</span>
                </button>
              </div>
            ))}
          </div>
          {!folders.length && (
            <p className="muted small-copy">
              Create a collection for people, places, or any thread you want to
              follow.
            </p>
          )}
          <p className="tree-hint">
            Drag entries into a folder, or select them and choose Move.
          </p>
        </aside>
        <main className="organizer-content">
          <nav className="collection-breadcrumbs" aria-label="Collection path">
            <button onClick={() => select("all")}>World library</button>
            {selection === "unfiled" && (
              <>
                <ChevronRight size={13} />
                <span>Unfiled</span>
              </>
            )}
            {currentContents?.breadcrumbs.map((b) => (
              <React.Fragment key={b.id}>
                <ChevronRight size={13} />
                <button
                  onClick={() =>
                    ctx.entries.find((e) => e.id === b.id)?.kind === "folder"
                      ? select(b.id)
                      : ctx.go("entry/" + b.id)
                  }
                >
                  {b.title}
                </button>
              </React.Fragment>
            ))}
          </nav>
          {selectedFolder && (
            <div className="collection-heading">
              <div>
                <span className="eyebrow">
                  {smart ? "SAVED FILTER" : "COLLECTION"}
                </span>
                <h2>{selectedFolder.title}</h2>
                {selectedFolder.summary && <p>{selectedFolder.summary}</p>}
              </div>
              <div className="button-row">
                <button
                  className="button secondary small"
                  onClick={() => beginMove([selection])}
                >
                  <MoveRight size={14} />
                  Move collection
                </button>
                <button
                  className="button secondary small"
                  onClick={() => ctx.go("entry/" + selection)}
                >
                  <Settings2 size={14} />
                  Edit collection
                </button>
              </div>
            </div>
          )}
          {error && !moving && !creating && <ErrorBox message={error} />}
          <div className="library-toolbar">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="Filter entries"
                placeholder="Search names, aliases and content…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <SearchableSelect
              aria-label="Filter by content type"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">All types</option>
              {Object.entries(kindLabels)
                .filter(([key]) => key !== "folder")
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              {smart && <option value="media">Images</option>}
            </SearchableSelect>
            <SearchableSelect
              aria-label="Filter by tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">All tags</option>
              {tagOptions.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SearchableSelect>
            <SearchableSelect
              aria-label="Sort entries"
              value={sort}
              onChange={(e) => preference("sort", e.target.value)}
            >
              <option value="order">Collection order</option>
              <option value="recent">Recently edited</option>
              <option value="title">Alphabetical</option>
            </SearchableSelect>
            <div className="view-toggle">
              <button
                aria-label="Grid view"
                className={view === "grid" ? "selected" : ""}
                onClick={() => preference("view", "grid")}
              >
                <Grid2X2 size={17} />
              </button>
              <button
                aria-label="List view"
                className={view === "list" ? "selected" : ""}
                onClick={() => preference("view", "list")}
              >
                <List size={17} />
              </button>
            </div>
          </div>
          <div className="collection-selection">
            <label className="check-label">
              <input
                type="checkbox"
                aria-label="Select visible entries"
                disabled={!entries.length && !childFolders.length}
                checked={
                  !!(entries.length + childFolders.length) &&
                  [...entries, ...(smart ? [] : childFolders)].every((e) =>
                    checked.has(e.id),
                  )
                }
                onChange={(e) =>
                  setChecked(
                    e.target.checked
                      ? new Set(
                          [...entries, ...(smart ? [] : childFolders)].map(
                            (e) => e.id,
                          ),
                        )
                      : new Set(),
                  )
                }
              />
              Select visible
            </label>
            <span>
              {checked.size
                ? checked.size + " selected"
                : entries.length +
                  (entries.length === 1 ? " entry" : " entries") +
                  (images.length ? " · " + images.length + " images" : "")}
            </span>
            {!!checked.size && (
              <button
                className="text-button"
                onClick={() => beginMove([...checked])}
              >
                <MoveRight size={15} />
                Move selected
              </button>
            )}
            {selectedFolder && !smart && (
              <label className="check-label recursive-toggle">
                <input
                  type="checkbox"
                  checked={recursive}
                  onChange={(e) => setRecursive(e.target.checked)}
                />
                Include subcollections
              </label>
            )}
          </div>
          {!smart && !!childFolders.length && (
            <div className="collection-cards">
              {childFolders.map((folder) => {
                const siblings = folders.filter(
                    (e) => e.parent === folder.parent,
                  ),
                  index = siblings.findIndex((e) => e.id === folder.id);
                return (
                  <div
                    className="folder-card"
                    key={folder.id}
                    draggable={!busy}
                    onDragStart={(e) => drag(e, folder.id)}
                    onDragOver={!isSmart(folder) ? allowDrop : undefined}
                    onDrop={
                      !isSmart(folder) ? (e) => drop(e, folder.id) : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      aria-label={"Select collection " + folder.title}
                      checked={checked.has(folder.id)}
                      onChange={() => toggle(folder.id)}
                    />
                    <button
                      className="folder-open"
                      onClick={() => select(folder.id)}
                    >
                      {isSmart(folder) ? (
                        <SlidersHorizontal size={20} />
                      ) : (
                        <FolderOpen size={20} />
                      )}
                      <span>
                        <strong>{folder.title}</strong>
                        <small>
                          {isSmart(folder)
                            ? "Saved filter"
                            : ctx.entries.filter((e) => e.parent === folder.id)
                                .length + " items"}
                        </small>
                      </span>
                    </button>
                    <div className="folder-controls">
                      <button
                        className="icon-button"
                        aria-label={"Move " + folder.title + " earlier"}
                        disabled={busy || index === 0}
                        onClick={() => reorder(folder, -1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Move " + folder.title + " later"}
                        disabled={busy || index === siblings.length - 1}
                        onClick={() => reorder(folder, 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Edit " + folder.title}
                        onClick={() => ctx.go("entry/" + folder.id)}
                      >
                        <Settings2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {loading || searching ? (
            <div className="page-loading">
              <Loader2 size={20} className="spin" />
              Gathering your entries…
            </div>
          ) : (
            <>
              {entries.length ? (
                <div
                  className={view === "grid" ? "card-grid" : "organized-list"}
                >
                  {entries.map((entry) => (
                    <div
                      className={
                        "selectable-entry " +
                        (checked.has(entry.id) ? "checked" : "")
                      }
                      key={entry.id}
                      draggable={!busy}
                      onDragStart={(e) => drag(e, entry.id)}
                    >
                      <input
                        className="entry-select"
                        type="checkbox"
                        aria-label={"Select " + entry.title}
                        checked={checked.has(entry.id)}
                        onChange={() => toggle(entry.id)}
                      />
                      {view === "grid" ? (
                        <EntryCard entry={entry} ctx={ctx} />
                      ) : (
                        <button
                          className="organized-list-entry"
                          onClick={() => ctx.go("entry/" + entry.id)}
                        >
                          <KindIcon kind={entry.kind} />
                          <span>
                            <strong>{entry.title}</strong>
                            <small>{entry.summary}</small>
                          </span>
                          <Badge>{kindLabels[entry.kind] || entry.kind}</Badge>
                          <span>{when(entry.updated_at)}</span>
                          <ChevronRight size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                !images.length && (
                  <Empty
                    icon={smart ? Tags : FolderOpen}
                    title={
                      smart ? "No matches yet" : "Room for your next entry"
                    }
                  >
                    {" "}
                    {smart
                      ? "Entries appear here when their tags and details match this collection."
                      : "Create an entry or move one into this collection."}
                  </Empty>
                )
              )}
              {!!images.length && (
                <>
                  <h3 className="collection-media-heading">
                    Images in this collection
                  </h3>
                  <div className="media-grid">
                    {images.map((a) => (
                      <button
                        key={a.id}
                        className="media-card"
                        onClick={() => ctx.go("media/" + a.id)}
                      >
                        <div>
                          <img src={a.url} alt={a.name} />
                        </div>
                        <strong>{a.name}</strong>
                        <span>{a.tags.join(" · ") || "Image"}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {creating && (
        <Modal
          title="Create a collection"
          wide
          onClose={() => !busy && setCreating(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const folder = await post<Entry>(
                  "/worlds/" + ctx.world.id + "/resources",
                  {
                    kind: "folder",
                    title: name,
                    parent: parent || null,
                    data: collectionData,
                    position:
                      Math.max(
                        -1,
                        ...folders
                          .filter((f) => f.parent === (parent || null))
                          .map((f) => f.position),
                      ) + 1,
                  },
                );
                await ctx.refresh();
                setCreating(false);
                select(folder.id);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Collection name"
              value={name}
              onChange={setName}
              placeholder="People of the mountain"
            />
            <label className="field">
              <span>Inside collection</span>
              <SearchableSelect
                value={parent}
                onChange={(e) => setParent(e.target.value)}
              >
                <option value="">World library</option>
                {folders
                  .filter((f) => !isSmart(f))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title}
                    </option>
                  ))}
              </SearchableSelect>
            </label>
            <CollectionRulesEditor
              ctx={ctx}
              data={collectionData}
              onChange={setCollectionData}
            />
            {error && <ErrorBox message={error} />}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || !name.trim()}
              >
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <FolderPlus size={16} />
                )}
                Create collection
              </button>
            </div>
          </form>
        </Modal>
      )}
      {moving && (
        <Modal title="Move entries" onClose={() => !busy && setMoving(null)}>
          <p>
            Move {moving.length} {moving.length === 1 ? "entry" : "entries"} to
            a collection. A folder keeps its contents and links.
          </p>
          <label className="field">
            <span>Destination</span>
            <SearchableSelect
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Unfiled · world library</option>
              {folders
                .filter((f) => !isSmart(f) && !forbidden.has(f.id))
                .map((f) => (
                  <option value={f.id} key={f.id}>
                    {f.title}
                  </option>
                ))}
            </SearchableSelect>
          </label>
          {error && <ErrorBox message={error} />}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setMoving(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => move(moving, target)}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <MoveRight size={16} />
              )}
              Move entries
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
