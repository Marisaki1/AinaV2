import { ManuscriptRoom } from "./ManuscriptRoom";
import { Overview } from "./Overview";
import { ConnectionManager } from "./Connections";
import { AffinityWorkspace } from "./AffinityWeb";
import { SearchableSelect } from "./SearchableSelect";
import { HistoryWorkspace } from "./History";
import { MediaLibrary } from "./MediaLibrary";
import { LibraryOrganizer } from "./Collections";
import { FamilyExplorer, NodeDiagram } from "./GraphViews";
import { SavedGraphLibrary } from "./SavedGraphs";
import { FloorConnections } from "./CampaignFloors";
import { FloorSelect, useCampaignFloor } from "./FloorScope";
import { RelationshipExplorer } from "./RelationshipExplorer";
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
  return <Overview key={ctx.world.id} ctx={ctx} />;
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

export function Relationships({ ctx, scope = [] }: { ctx: AppContext; scope?: string[] }) {
  const [mode, setMode] = useState(() => { try { const saved = localStorage.getItem("worldbuilder.relationship-mode:" + ctx.world.id); return ["all", "affinity", "family", "diplomacy", "saved", "manage"].includes(saved || "") ? saved! : "all"; } catch { return "all"; } }),
    [form, setForm] = useState<any>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => { try { localStorage.setItem("worldbuilder.relationship-mode:" + ctx.world.id, mode); } catch {} }, [ctx.world.id, mode]);
  const campaigns = ctx.entries.filter((entry) => entry.kind === "campaign");
  const tower = campaigns.find((entry) => entry.data.tower_campaign);
  const campaignId = scope[0] === "world" ? "" :
    campaigns.find((entry) => entry.id === scope[0])?.id || tower?.id || "";
  const floorScope = useCampaignFloor(ctx.entries, campaignId);
  const routeFloor = floorScope.floors.find((floor) => floor.id === scope[1]);
  const selection = routeFloor?.id || floorScope.selection;
  useEffect(() => {
    if (routeFloor) floorScope.select(routeFloor.id);
  }, [routeFloor?.id]);
  const floor = floorScope.floors.find((entry) => entry.id === selection);
  const edges = campaignId
    ? ctx.edges.filter((edge) => floorScope.includesConnection(edge, selection))
    : ctx.edges;
  const graphKey = campaignId ? campaignId + ":" + selection : "";
  const save = async () => {
    try {
      setBusy(true);
      await post("/worlds/" + ctx.world.id + "/connections", {
        ...form,
        ...(floor ? { floor_id: floor.id } : {}),
      });
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
    <div className="page relationships-page">
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
      {campaigns.length > 0 && (
        <div className="campaign-scope-toolbar">
          <EntryPicker label="Relationship campaign" entries={campaigns} value={campaignId}
            empty="Whole world" onChange={(id) => ctx.go("relationships/" + (id || "world"))} />
          {campaignId && (
            <FloorSelect {...floorScope} selection={selection} select={(id) => {
              floorScope.select(id);
              if (scope[1]) ctx.go("relationships/" + campaignId);
            }} />
          )}
          {floor && <FloorConnections key={floor.id} ctx={ctx} floor={floor} />}
        </div>
      )}
      {mode === "saved" ? (
        <SavedGraphLibrary ctx={ctx} floorScope={campaignId ? { ...floorScope, selection } : undefined} />
      ) : mode === "manage" ? (
        <ConnectionManager key={graphKey} ctx={ctx} initialEdges={edges} />
      ) : mode === "affinity" ? (
        <AffinityWorkspace key={graphKey} ctx={ctx} campaignId={campaignId}
          floorScope={campaignId ? { ...floorScope, selection } : undefined} />
      ) : mode === "family" ? (
        <FamilyExplorer key={graphKey} ctx={ctx} campaignId={campaignId} floor={selection} />
      ) : edges.some((edge) => !edge.deleted_at && (mode !== "diplomacy" || edge.kind === "diplomacy")) ? (
        <RelationshipExplorer key={ctx.world.id + mode + graphKey} ctx={{ ...ctx, edges }}
          diplomacy={mode === "diplomacy"} scope={graphKey} />
      ) : (
        <Empty
          icon={Network}
          title={campaignId ? "No connections in this view" : "Everything begins with a connection"}
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
  return <ManuscriptRoom key={bookId || "manuscripts"} ctx={ctx} bookId={bookId} />;
}
