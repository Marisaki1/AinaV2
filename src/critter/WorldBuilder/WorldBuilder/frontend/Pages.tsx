import { ConnectionManager } from "./Connections";
import { AffinityWorkspace } from "./AffinityWeb";
import { SearchableSelect } from "./SearchableSelect";
import { HistoryWorkspace } from "./History";
import { MediaLibrary } from "./MediaLibrary";
import { LibraryOrganizer } from "./Collections";
import { FamilyExplorer, NodeDiagram } from "./GraphViews";
import { SavedGraphLibrary } from "./SavedGraphs";
import React, { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  Download,
  FileText,
  Flag,
  GitBranch,
  Grid2X2,
  Image as ImageIcon,
  Layers,
  Link2,
  List,
  Loader2,
  Map,
  MapPin,
  Network,
  NotebookPen,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Dices,
  Play,
  Square,
  ExternalLink,
  Settings2,
  FolderOpen,
  Archive,
} from "lucide-react";
import {
  AppContext,
  Entry,
  Edge,
  Asset,
  World,
  api,
  post,
  patch,
  when,
  size,
  human,
  uid,
  kindLabels,
  saveBeforeNavigate,
} from "./domain";
import {
  Badge,
  Empty,
  EntryPicker,
  ErrorBox,
  Field,
  KindIcon,
  Modal,
  Section,
} from "./ui";
import { MapCanvas } from "./SpecialEditors";
import { EntryEditor } from "./EntryEditor";

export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function EntryCard({ entry, ctx }: { entry: Entry; ctx: AppContext }) {
  const asset = ctx.assets.find(
    (a) =>
      a.id ===
      (entry.kind === "map" ? entry.data.asset_id : entry.data.cover_asset),
  );
  return (
    <button
      className={"entry-card " + (entry.kind === "map" ? "map-card" : "")}
      onClick={() => ctx.go("entry/" + entry.id)}
    >
      {asset || entry.data.cover_url ? (
        <div className="card-image">
          <img
            referrerPolicy="no-referrer"
            src={asset?.url || entry.data.cover_url}
            alt=""
          />
          {entry.kind === "map" && (
            <Badge>{(entry.data.markers || []).length} locations</Badge>
          )}
        </div>
      ) : entry.kind === "map" ? (
        <div className="map-placeholder">
          <Map size={42} />
          <span>Choose a map image</span>
        </div>
      ) : null}
      <div className="card-content">
        <div className="card-top">
          <span className={"type-mark " + entry.kind}>
            <KindIcon
              kind={
                entry.kind === "article" && entry.template === "character"
                  ? "character"
                  : entry.kind
              }
              size={17}
            />
          </span>
          <span className="card-type">
            {entry.kind === "article"
              ? human(entry.template)
              : kindLabels[entry.kind]}
          </span>
          {entry.visibility === "private" && (
            <span className="private-dot" title="Private">
              <ShieldCheck size={13} />
            </span>
          )}
        </div>
        <h3>{entry.title}</h3>
        <p>{entry.summary || "A story waiting to be told."}</p>
        <div className="card-bottom">
          <span>{entry.tags[0] || when(entry.updated_at).split(",")[0]}</span>
          <ArrowRight size={16} />
        </div>
      </div>
    </button>
  );
}
export function Home({ ctx }: { ctx: AppContext }) {
  const articles = ctx.entries.filter(
      (e) => e.kind === "article" || e.kind === "character",
    ),
    maps = ctx.entries.filter((e) => e.kind === "map"),
    recent = [...ctx.entries]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 6);
  return (
    <div className="page home-page">
      <div className="home-welcome">
        <div>
          <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
          <h1>Welcome to your world.</h1>
          <p>A place for every person, place, and possibility.</p>
        </div>
        <span className="local-pill">
          <span />
          On this computer
        </span>
      </div>
      <section className="world-hero">
        <div className="hero-copy">
          <span className="eyebrow">THE WORLD YOU'RE BUILDING</span>
          <h2>{ctx.world.name}</h2>
          <p>
            {ctx.world.tagline ||
              "Every great story starts with a world worth exploring."}
          </p>
          <div className="button-row">
            <button
              className="button parchment"
              onClick={() => ctx.go("library")}
            >
              Explore your world
              <ArrowRight size={16} />
            </button>
            <button
              className="button hero-quiet"
              onClick={() => ctx.go("settings")}
            >
              World settings
            </button>
          </div>
        </div>
        <div className="hero-atlas" aria-hidden="true">
          <svg viewBox="0 0 440 300">
            <defs>
              <pattern
                id="atlasgrid"
                width="32"
                height="32"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M32 0H0V32"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth=".5"
                />
              </pattern>
            </defs>
            <rect
              width="440"
              height="300"
              fill="url(#atlasgrid)"
              opacity=".3"
            />
            <path
              d="M23 188c21-42 38-14 54-46s26-76 65-54 29-34 67-9 16 58 53 56 37-35 66-5 12 65-27 81-37-17-72 13-58 7-83-15-31 4-59 10-49-4-64-31Z"
              fill="currentColor"
              opacity=".12"
            />
            <path
              d="M23 188c21-42 38-14 54-46s26-76 65-54 29-34 67-9 16 58 53 56 37-35 66-5 12 65-27 81-37-17-72 13-58 7-83-15-31 4-59 10-49-4-64-31Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="m77 164 45-33 54 20 43-37 62 50"
              fill="none"
              stroke="currentColor"
              strokeDasharray="3 6"
            />
            <circle cx="176" cy="151" r="4" fill="currentColor" />
            <circle cx="122" cy="131" r="3" fill="currentColor" />
            <circle cx="281" cy="164" r="3" fill="currentColor" />
            <g transform="translate(360 65)">
              <circle r="29" fill="none" stroke="currentColor" opacity=".6" />
              <path
                d="m0-23 5 18 18 5-18 5-5 18-5-18-18-5 18-5Z"
                fill="none"
                stroke="currentColor"
              />
              <text
                y="-37"
                textAnchor="middle"
                fill="currentColor"
                fontSize="10"
              >
                N
              </text>
            </g>
            <path
              d="M70 260h140m-140-4v8m70-8v8m70-8v8"
              stroke="currentColor"
              opacity=".5"
            />
          </svg>
        </div>
      </section>
      <div className="stats-row">
        {[
          [FileText, articles.length, "Lore entries", "library"],
          [Map, maps.length, "Interactive maps", "maps"],
          [GitBranch, ctx.edges.length, "Connections", "relationships"],
          [
            BookOpen,
            ctx.entries.filter((e) => e.kind === "manuscript").length,
            "Manuscripts",
            "writing",
          ],
        ].map(([Icon, count, label, route]: any) => (
          <button
            key={label}
            className="stat-card"
            onClick={() => ctx.go(route)}
          >
            <span className="stat-icon">
              <Icon size={22} />
            </span>
            <div>
              <strong>{count}</strong>
              <span>{label}</span>
            </div>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      <div className="section-heading page-section-heading">
        <div>
          <span className="eyebrow">PICK UP A THREAD</span>
          <h2>Recently in your world</h2>
        </div>
        <button className="text-button" onClick={() => ctx.go("library")}>
          View library
          <ArrowRight size={15} />
        </button>
      </div>
      {recent.length ? (
        <div className="card-grid">
          {recent.map((e) => (
            <EntryCard key={e.id} entry={e} ctx={ctx} />
          ))}
        </div>
      ) : (
        <div className="getting-started">
          <div className="getting-copy">
            <span className="eyebrow">
              A BLANK PAGE. ENDLESS POSSIBILITIES.
            </span>
            <h2>
              Start with someone.
              <br />
              Or somewhere.
            </h2>
            <p>
              Create your first entry, or bring in the campaign notes you've
              already written.
            </p>
            <div className="button-row">
              <button
                className="button primary"
                onClick={() => ctx.create("article")}
              >
                <Plus size={16} />
                Create your first entry
              </button>
              <button
                className="button secondary"
                onClick={() => ctx.go("import")}
              >
                <Upload size={16} />
                Import campaign notes
              </button>
            </div>
          </div>
          <div className="getting-suggestions">
            {[
              [
                "character",
                "A memorable character",
                "Give your world a familiar face.",
              ],
              [
                "geography",
                "A place to discover",
                "A village, a mountain, another realm.",
              ],
              [
                "plot",
                "A story taking shape",
                "Follow a thread and see where it leads.",
              ],
            ].map(([kind, title, desc]) => (
              <button key={kind} onClick={() => ctx.create("article")}>
                <KindIcon
                  kind={
                    kind === "character"
                      ? "character"
                      : kind === "geography"
                        ? "map"
                        : "scene"
                  }
                  size={19}
                />
                <div>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </div>
                <Plus size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="home-bottom">
        <Section title="Worldbuilding at a glance">
          <div className="world-checklist">
            {[
              [
                "Find the shape of your world",
                "Write down its themes, tone and rules.",
                "settings",
              ],
              [
                "Connect the details",
                "Bring characters, places and factions together.",
                "relationships",
              ],
              [
                "Keep your world safe",
                "Create a complete backup of your work.",
                "settings",
              ],
            ].map(([title, description, route]) => (
              <button key={title} onClick={() => ctx.go(route)}>
                <span className="check-circle">
                  <Check size={14} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </div>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </Section>
        <Section title="Recent activity">
          <div className="activity-list">
            {ctx.world.activities?.length ? (
              ctx.world.activities.slice(0, 5).map((a) => (
                <div key={a.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{a.title}</strong>
                    <small>
                      {human(a.kind)} · {when(a.created_at)}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">
                Your world’s story will unfold here as you add to it.
              </p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

export function Library(props: {
  ctx: AppContext;
  kind?: string;
  heading?: string;
}) {
  return props.kind ? (
    <BasicLibrary {...props} />
  ) : (
    <LibraryOrganizer ctx={props.ctx} />
  );
}

function BasicLibrary({
  ctx,
  kind,
  heading,
}: {
  ctx: AppContext;
  kind?: string;
  heading?: string;
}) {
  const [query, setQuery] = useState(""),
    [template, setTemplate] = useState("all"),
    [view, setView] = useState("grid"),
    [sort, setSort] = useState("recent"),
    [collection, setCollection] = useState("all");
  const all = kind
    ? ctx.entries.filter((e) => e.kind === kind)
    : ctx.entries.filter((e) =>
        ["article", "character", "folder"].includes(e.kind),
      );
  let list = all.filter(
    (e) =>
      e.kind !== "folder" &&
      (template === "all" || e.template === template) &&
      (collection === "all" || e.parent === collection) &&
      (
        e.title +
        " " +
        e.summary +
        " " +
        e.tags.join(" ") +
        " " +
        e.aliases.join(" ")
      )
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  list.sort(
    sort === "title"
      ? (a, b) => a.title.localeCompare(b.title)
      : (a, b) => b.updated_at.localeCompare(a.updated_at),
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow="THE DETAILS THAT MAKE A WORLD"
        title={heading || "World library"}
        action={
          <button
            className="button primary"
            onClick={() => ctx.create(kind || "article")}
          >
            <Plus size={17} />
            {kind === "map" ? "New map" : "New entry"}
          </button>
        }
      >
        {kind === "map"
          ? "Turn your maps into places to explore."
          : "People, places, stories. Everything connected, everything yours."}
      </PageHeading>
      <div className="library-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Filter entries"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an entry…"
          />
        </label>
        {!kind && (
          <SearchableSelect
            aria-label="Filter by template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="all">All types</option>
            {ctx.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </SearchableSelect>
        )}
        <SearchableSelect
          aria-label="Sort entries"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Recently edited</option>
          <option value="title">Alphabetical</option>
        </SearchableSelect>
        <div className="view-toggle">
          <button
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            className={view === "grid" ? "selected" : ""}
            onClick={() => setView("grid")}
          >
            <Grid2X2 size={17} />
          </button>
          <button
            aria-label="List view"
            aria-pressed={view === "list"}
            className={view === "list" ? "selected" : ""}
            onClick={() => setView("list")}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      {!kind && (
        <div className="collection-tabs">
          <button
            className={collection === "all" ? "active" : ""}
            onClick={() => setCollection("all")}
          >
            All entries{" "}
            <span>{all.filter((e) => e.kind !== "folder").length}</span>
          </button>
          {ctx.entries
            .filter((e) => e.kind === "folder")
            .map((f) => (
              <button
                key={f.id}
                className={collection === f.id ? "active" : ""}
                onClick={() => setCollection(f.id)}
              >
                <FolderOpen size={14} />
                {f.title}
              </button>
            ))}
          <button
            className="add-collection"
            onClick={() => ctx.create("folder")}
          >
            <Plus size={14} />
            Collection
          </button>
        </div>
      )}
      {list.length ? (
        view === "grid" ? (
          <div className="card-grid">
            {list.map((e) => (
              <EntryCard entry={e} ctx={ctx} key={e.id} />
            ))}
          </div>
        ) : (
          <div className="entry-list">
            <div className="list-labels">
              <span>Entry</span>
              <span>Type</span>
              <span>Status</span>
              <span>Last edited</span>
            </div>
            {list.map((e) => (
              <button key={e.id} onClick={() => ctx.go("entry/" + e.id)}>
                <span>
                  <KindIcon kind={e.kind} />
                  <strong>{e.title}</strong>
                </span>
                <span>{human(e.template)}</span>
                <span>
                  <Badge tone={e.status === "done" ? "green" : ""}>
                    {human(e.status)}
                  </Badge>
                </span>
                <span>
                  {when(e.updated_at)}
                  <ChevronRight size={15} />
                </span>
              </button>
            ))}
          </div>
        )
      ) : (
        <Empty
          icon={kind === "map" ? Map : FileText}
          title={
            query
              ? "No matching entries"
              : kind === "map"
                ? "Your atlas is waiting"
                : "Room for a new story"
          }
          action={() => ctx.create(kind || "article")}
          label={kind === "map" ? "Create a map" : "Create an entry"}
        >
          {query
            ? "Try another name, alias or tag."
            : "Add your first entry or import the notes you already have."}
        </Empty>
      )}
    </div>
  );
}

export function Relationships({ ctx }: { ctx: AppContext }) {
  const [mode, setMode] = useState("all"),
    [form, setForm] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const edges = ctx.edges.filter(
    (e) =>
      mode === "all" ||
      (mode === "family"
        ? ["parent", "spouse", "sibling"].includes(e.kind)
        : mode === "diplomacy"
          ? e.kind === "diplomacy"
          : true),
  );
  const ids = new Set(edges.flatMap((e) => [e.source, e.target]));
  const nodes = ctx.entries.filter((e) => ids.has(e.id));
  const save = async () => {
    try {
      setBusy(true);
      await post("/worlds/" + ctx.world.id + "/connections", form);
      await ctx.refresh();
      setForm(null);
      ctx.notify("Connection added.");
    } catch (e: any) {
      ctx.notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <PageHeading
        eyebrow="THE THREADS BETWEEN"
        title="Relationships"
        action={
          <button
            className="button primary"
            onClick={() =>
              setForm({
                source: "",
                target: "",
                kind: "related",
                label: "",
                strength: 0,
                notes: "",
              })
            }
          >
            <Plus size={17} />
            Add connection
          </button>
        }
      >
        Family, friendship, allegiance. See how your world fits together.
      </PageHeading>
      <div className="tabs">
        {[
          ["all", "All connections"],
          ["affinity", "Affinity web"],
          ["family", "Family & bloodlines"],
          ["diplomacy", "Diplomacy"],
          ["saved", "Saved views"],
          ["manage", "Edit & history"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={mode === id ? "active" : ""}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "saved" ? (
        <SavedGraphLibrary ctx={ctx} />
      ) : mode === "manage" ? (
        <ConnectionManager ctx={ctx} />
      ) : mode === "affinity" ? (
        <AffinityWorkspace ctx={ctx} />
      ) : mode === "family" ? (
        <FamilyExplorer ctx={ctx} />
      ) : nodes.length ? (
        <NodeDiagram
          nodes={nodes.map((node, i) => ({
            ...node,
            level: Math.floor(i / 4),
          }))}
          edges={edges}
          onOpen={(id) => ctx.go("entry/" + id)}
        />
      ) : (
        <Empty
          icon={Network}
          title="Everything begins with a connection"
          action={() =>
            setForm({
              source: "",
              target: "",
              kind: "related",
              label: "",
              strength: 0,
              notes: "",
            })
          }
          label="Add a connection"
        >
          Create relationships between entries to reveal the people and powers
          shaping your world.
        </Empty>
      )}
      {mode !== "family" &&
        mode !== "saved" &&
        mode !== "manage" &&
        !!edges.length && <ConnectionManager ctx={ctx} initialEdges={edges} />}
      {form && (
        <Modal title="Add a connection" onClose={() => setForm(null)}>
          <EntryPicker
            label="From"
            value={form.source}
            onChange={(v) => setForm({ ...form, source: v })}
            entries={ctx.entries}
          />
          <EntryPicker
            label="To"
            value={form.target}
            onChange={(v) => setForm({ ...form, target: v })}
            entries={ctx.entries.filter((e) => e.id !== form.source)}
          />
          <div className="field-grid">
            <label className="field">
              <span>Relationship</span>
              <SearchableSelect
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                {[
                  "related",
                  "parent",
                  "adoptive-parent",
                  "guardian",
                  "spouse",
                  "sibling",
                  "friend",
                  "rival",
                  "mentor",
                  "member",
                  "located-in",
                  "diplomacy",
                ].map((k) => (
                  <option value={k} key={k}>
                    {human(k)}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            <Field
              label="Label (optional)"
              value={form.label}
              onChange={(v) => setForm({ ...form, label: v })}
            />
          </div>
          {form.kind === "diplomacy" && (
            <>
              <Field
                label="How From feels about To (−100 to +100)"
                type="number"
                value={form.strength}
                onChange={(v) => setForm({ ...form, strength: v })}
              />
              <p className="muted small-copy">
                This is directional. Add a reverse connection to represent the
                other side’s view.
              </p>
            </>
          )}
          <label className="field">
            <span>Relationship notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Connection visibility</span>
            <SearchableSelect
              aria-label="Connection visibility"
              value={form.visibility || "private"}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            >
              <option value="private">GM only</option>
              <option value="public">Include in reader view</option>
            </SearchableSelect>
          </label>
          <p className="muted small-copy">
            Parent links point from parent to child. Shared connections appear
            only when both entries have saved reader versions. Notes stay
            private.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy || !form.source || !form.target}
              onClick={save}
            >
              {busy ? "Saving…" : "Add connection"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function HistoryPage({ ctx }: { ctx: AppContext }) {
  return <HistoryWorkspace ctx={ctx} />;
}

export function Notes({
  ctx,
  initialTab = "note",
}: {
  ctx: AppContext;
  initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab),
    [filter, setFilter] = useState("all");
  const rows = ctx.entries.filter(
    (e) =>
      e.kind === tab &&
      (filter === "all" ||
        (filter === "open"
          ? e.data.progress !== "done"
          : e.data.progress === "done")),
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow="KEEP THE SPARK"
        title="Notes & tasks"
        action={
          <button className="button primary" onClick={() => ctx.create(tab)}>
            <Plus size={17} />
            {tab === "note" ? "New note" : "New task"}
          </button>
        }
      >
        An idea in passing. A detail for later. Nothing needs to get lost.
      </PageHeading>
      <div className="tabs">
        <button
          className={tab === "note" ? "active" : ""}
          onClick={() => setTab("note")}
        >
          Private notebook
        </button>
        <button
          className={tab === "task" ? "active" : ""}
          onClick={() => setTab("task")}
        >
          To-do list
        </button>
      </div>
      {tab === "task" && (
        <div className="filter-pills">
          {["all", "open", "done"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {human(f)}
            </button>
          ))}
        </div>
      )}
      {rows.length ? (
        tab === "note" ? (
          <div className="card-grid">
            {rows.map((e) => (
              <EntryCard key={e.id} entry={e} ctx={ctx} />
            ))}
          </div>
        ) : (
          <div className="task-list">
            {rows.map((task) => (
              <div key={task.id}>
                <input
                  aria-label={"Complete " + task.title}
                  type="checkbox"
                  checked={task.data.progress === "done"}
                  onChange={async (e) => {
                    try {
                      await patch("/resources/" + task.id, {
                        data: {
                          ...task.data,
                          progress: e.target.checked ? "done" : "open",
                        },
                        expected_revision: task.revision,
                      });
                      await ctx.refresh();
                    } catch (err: any) {
                      ctx.notify(err.message, true);
                    }
                  }}
                />
                <button
                  className={task.data.progress === "done" ? "done" : ""}
                  onClick={() => ctx.go("entry/" + task.id)}
                >
                  <strong>{task.title}</strong>
                  <small>{task.summary}</small>
                </button>
                <Badge
                  tone={
                    ["high", "critical"].includes(task.data.priority)
                      ? "gold"
                      : ""
                  }
                >
                  {human(task.data.priority || "normal")}
                </Badge>
                <ChevronRight size={16} />
              </div>
            ))}
          </div>
        )
      ) : (
        <Empty
          icon={NotebookPen}
          title={
            tab === "note"
              ? "A place to think out loud"
              : "Make room for your next idea"
          }
          action={() => ctx.create(tab)}
          label={tab === "note" ? "Write a note" : "Add a task"}
        >
          {tab === "note"
            ? "These notes stay private, separate from your reader-facing lore."
            : "Keep a short list of the things you want to create next."}
        </Empty>
      )}
    </div>
  );
}

export function Tools({ ctx }: { ctx: AppContext }) {
  const [tab, setTab] = useState("table");
  const tabs = [
    ["table", "Roll tables"],
    ["generator", "Generators"],
    ["variable", "Reusable terms"],
    ["template", "Custom templates"],
    ["statblock", "Statblocks"],
    ["board", "Whiteboards"],
    ["tree", "Content trees"],
  ];
  const rows = ctx.entries.filter((e) => e.kind === tab);
  return (
    <div className="page">
      <PageHeading
        eyebrow="MAKE SOMETHING UNEXPECTED"
        title="Creative tools"
        action={
          <button className="button primary" onClick={() => ctx.create(tab)}>
            <Plus size={17} />
            New {kindLabels[tab]?.toLowerCase()}
          </button>
        }
      >
        Reusable ideas, a little chance, and tools that fit the way you think.
      </PageHeading>
      <div className="tabs scroll-tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="card-grid">
          {rows.map((e) => (
            <EntryCard key={e.id} entry={e} ctx={ctx} />
          ))}
        </div>
      ) : (
        <Empty
          icon={tab === "board" ? Layers : Sparkles}
          title={"Your first " + kindLabels[tab]?.toLowerCase()}
          action={() => ctx.create(tab)}
          label={"Create " + kindLabels[tab]?.toLowerCase()}
        >
          Build a tool you can reuse throughout your world.
        </Empty>
      )}
    </div>
  );
}

export function Media({ ctx }: { ctx: AppContext }) {
  return <MediaLibrary ctx={ctx} />;
}

export function Writing({ ctx, bookId }: { ctx: AppContext; bookId?: string }) {
  const books = ctx.entries.filter((e) => e.kind === "manuscript");
  const book = books.find((e) => e.id === bookId);
  const [scene, setScene] = useState(""),
    [mode, setMode] = useState("write"),
    [name, setName] = useState("");
  const chapters = ctx.entries
    .filter((e) => e.kind === "chapter" && e.parent === bookId)
    .sort((a, b) => a.position - b.position);
  const ids = new Set([bookId, ...chapters.map((e) => e.id)]);
  const scenes = ctx.entries
    .filter((e) => e.kind === "scene" && ids.has(e.parent || ""))
    .sort((a, b) => a.position - b.position);
  const selected = scenes.find((e) => e.id === scene) || scenes[0];
  const create = async (kind: string) => {
    if (!book) return;
    if (saveBeforeNavigate.current && !(await saveBeforeNavigate.current()))
      return;
    try {
      const value = await post<Entry>(
        "/worlds/" + ctx.world.id + "/resources",
        {
          kind,
          title:
            name.trim() ||
            (kind === "scene" ? "Untitled scene" : "New chapter"),
          parent: book.id,
          position: scenes.length + chapters.length,
          data: { goal: 0, label: "First draft" },
        },
      );
      await ctx.refresh();
      setName("");
      if (kind === "scene") setScene(value.id);
    } catch (e: any) {
      ctx.notify(e.message, true);
    }
  };
  if (!book)
    return (
      <div className="page">
        <PageHeading
          eyebrow="LET THE STORY UNFOLD"
          title="Writing room"
          action={
            <button
              className="button primary"
              onClick={() => ctx.create("manuscript")}
            >
              <Plus size={17} />
              New manuscript
            </button>
          }
        >
          Your stories and your world, finally on the same page.
        </PageHeading>
        {books.length ? (
          <div className="manuscript-grid">
            {books.map((b) => (
              <button
                key={b.id}
                className="manuscript-card"
                onClick={() => ctx.go("writing/" + b.id)}
              >
                <div className="book-cover">
                  <BookOpen size={42} />
                  <h2>{b.title}</h2>
                  <span>{b.data.label || "A story in progress"}</span>
                </div>
                <div>
                  <h3>{b.title}</h3>
                  <p>{b.summary || "Open your writing workspace."}</p>
                  <span>
                    Enter writing room
                    <ArrowRight size={15} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            icon={BookOpen}
            title="There’s a story only you can tell"
            action={() => ctx.create("manuscript")}
            label="Start a manuscript"
          >
            Outline, draft and revise, with your world always within reach.
          </Empty>
        )}
      </div>
    );
  const move = async (entry: Entry, delta: number) => {
    if (saveBeforeNavigate.current && !(await saveBeforeNavigate.current()))
      return;
    const index = scenes.findIndex((e) => e.id === entry.id),
      other = scenes[index + delta];
    if (!other) return;
    try {
      await post("/worlds/" + ctx.world.id + "/reorder", {
        entries: [
          { id: entry.id, position: index + delta, revision: entry.revision },
          { id: other.id, position: index, revision: other.revision },
        ],
      });
      await ctx.refresh();
    } catch (e: any) {
      ctx.notify(e.message, true);
    }
  };
  return (
    <div className="writing-workspace">
      <div className="writing-heading">
        <button className="text-button" onClick={() => ctx.go("writing")}>
          <ChevronLeft size={16} />
          Manuscripts
        </button>
        <h1>{book.title}</h1>
        <div className="view-toggle">
          <button
            className={mode === "write" ? "selected" : ""}
            onClick={() => setMode("write")}
          >
            Write
          </button>
          <button
            className={mode === "board" ? "selected" : ""}
            onClick={async () => {
              if (
                !saveBeforeNavigate.current ||
                (await saveBeforeNavigate.current())
              )
                setMode("board");
            }}
          >
            Corkboard
          </button>
        </div>
        <button
          className="button secondary small"
          onClick={() => ctx.go("entry/" + book.id)}
        >
          Book details
        </button>
      </div>
      <div className="writing-progress">
        <span>
          {scenes.reduce((sum, e) => sum + e.word_count, 0).toLocaleString()}{" "}
          words
          {book.data.goal
            ? " / " + Number(book.data.goal).toLocaleString() + " goal"
            : ""}
        </span>
        <span>
          {scenes.length} scenes · {chapters.length} chapters
        </span>
      </div>
      <div className="writing-layout">
        <aside className="writing-tree">
          <span className="eyebrow">YOUR MANUSCRIPT</span>
          {chapters.map((c) => (
            <div className="chapter-label" key={c.id}>
              <BookOpen size={15} />
              <button onClick={() => ctx.go("entry/" + c.id)}>{c.title}</button>
            </div>
          ))}
          {scenes.map((s, i) => (
            <button
              className={
                "scene-link " + (selected?.id === s.id ? "active" : "")
              }
              key={s.id}
              onClick={async () => {
                if (
                  !saveBeforeNavigate.current ||
                  (await saveBeforeNavigate.current())
                )
                  setScene(s.id);
              }}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>{s.title}</strong>
                <small>{s.word_count} words</small>
              </div>
            </button>
          ))}
          <div className="quick-scene">
            <input
              aria-label="New scene or chapter title"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New scene or chapter…"
            />
            <button
              className="button primary small full-button"
              onClick={() => create("scene")}
            >
              <Plus size={15} />
              Add scene
            </button>
            <button className="text-button" onClick={() => create("chapter")}>
              Add chapter
            </button>
          </div>
        </aside>
        <main className="writing-main">
          {mode === "board" ? (
            <div className="corkboard">
              {scenes.map((s, i) => (
                <div key={s.id}>
                  <Badge>{s.data.label || "Draft"}</Badge>
                  <h3>{s.title}</h3>
                  <p>{s.summary || "Add a synopsis in the scene editor."}</p>
                  <div className="button-row">
                    <button
                      className="text-button"
                      onClick={() => {
                        setScene(s.id);
                        setMode("write");
                      }}
                    >
                      Open scene
                      <ArrowRight size={14} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={i === 0}
                      aria-label={"Move " + s.title + " earlier"}
                      onClick={() => move(s, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={i === scenes.length - 1}
                      aria-label={"Move " + s.title + " later"}
                      onClick={() => move(s, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : selected ? (
            <EntryEditor key={selected.id} id={selected.id} ctx={ctx} />
          ) : (
            <Empty
              icon={BookOpen}
              title="Begin with a scene"
              action={() => create("scene")}
              label="Write your first scene"
            >
              The first sentence doesn’t have to be perfect. It just has to
              begin.
            </Empty>
          )}
        </main>
      </div>
    </div>
  );
}
