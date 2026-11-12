import { AinaMenu } from "./AinaMenu";
import { SearchableSelect } from "./SearchableSelect";
import { ReferencePreviewController } from "./References";
import { tagKey } from "./Collections";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Compass,
  FileText,
  Flag,
  FolderOpen,
  GitBranch,
  HelpCircle,
  History,
  Home,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  LogOut,
  Map,
  Menu,
  Network,
  NotebookPen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  AppContext,
  Entry,
  World,
  Asset,
  Edge,
  Template,
  api,
  post,
  uid,
  kindLabels,
  saveBeforeNavigate,
} from "./domain";
import { Modal, Field, Badge, ErrorBox, KindIcon } from "./ui";
import { EntryEditor } from "./EntryEditor";
import {
  Home as Dashboard,
  Library,
  Relationships,
  HistoryPage,
  Notes,
  Tools,
  Media,
  Writing,
} from "./Pages";
import { ImportPage, SettingsPage, Campaigns } from "./Operations";
import { CharacterDossier } from "./CharacterDossier";
import { SessionGuide } from "./SessionGuide";
import { LocationGuide } from "./LocationGuide";
import { CampaignWorkbench } from "./CampaignWorkbench";
import { ThreadGuide } from "./ThreadGuide";
import { ReferenceTray } from "./ReferenceTray";
import { CampaignLifecycle } from "./CampaignLifecycle";
import { CampaignContinuity } from "./CampaignContinuity";
import { Notebooks } from "./Notebooks";

const nav = [
  ["home", "Overview", Home],
  ["library", "World library", BookOpen],
  ["maps", "Maps & places", Map],
  ["history", "History & calendars", History],
  ["relationships", "Relationships", Network],
  ["campaigns", "Campaigns", Flag],
  ["writing", "Writing room", FileText],
  ["notebooks", "Notebooks", NotebookPen],
  ["tools", "Creative tools", Sparkles],
  ["media", "Media library", ImageIcon],
] as const;
function initialData(kind: string, parent?: string, existing: Entry[] = []) {
  if (kind === "calendar")
    return {
      months: [
        { name: "First Moon", days: 30 },
        { name: "Second Moon", days: 30 },
        { name: "Third Moon", days: 30 },
        { name: "Fourth Moon", days: 30 },
      ],
      weekdays: [
        "Firstday",
        "Seconday",
        "Thirday",
        "Fourthday",
        "Fifthday",
        "Sixthday",
        "Seventhday",
      ],
      leap_every: 0,
      leap_month: 4,
      moon_cycle: 28,
    };
  if (kind === "timeline")
    return {
      calendar_id: "",
      lanes: [{ id: 0, name: "Events", private: false }],
      selection: "all",
      event_ids: [],
    };
  if (kind === "map") return { markers: [], layers: [] };
  if (kind === "board") return { cards: [], connections: [] };
  if (kind === "table" || kind === "generator")
    return {
      columns: [{ id: "result", label: "Result", type: "text" }],
      rows: [],
    };
  if (kind === "era") return { year: 1, month: 1, day: 1 };
  if (kind === "event") return { year: 1, month: 1, day: 1, lane: 0 };
  if (kind === "campaign")
    return {
      system: "Homebrew",
      party: [],
      inventory: [],
      campaign_status: "Preparing",
    };
  if (kind === "session")
    return {
      campaign_id: parent || "",
      number: Math.min(
        1000000,
        Math.max(
          0,
          ...existing
            .filter(
              (e) =>
                e.kind === "session" &&
                (e.data.campaign_id ?? e.parent ?? "") === (parent || ""),
            )
            .map((e) => Number(e.data.number) || 0),
        ) + 1,
      ),
      session_status: "planned",
    };
  if (kind === "quest" || kind === "task")
    return {
      progress: "open",
      priority: "normal",
      ...(kind === "quest" ? { campaign_id: parent || "" } : {}),
    };
  if (kind === "statblock")
    return {
      system: "Homebrew",
      block_type: "Character",
      fields: { health: 10, defense: 10, strength: 10, dexterity: 10 },
      formulas: [],
    };
  if (kind === "template") return { fields: [] };
  if (kind === "tree") return { items: [], parents: {}, selection: "manual" };
  if (kind === "relationship")
    return {
      mode: "family",
      root_id: "",
      partner_id: "",
      direction: "family",
      depth: 6,
      adoptive: false,
      tags: [],
      kinds: [],
    };
  if (["scene", "chapter", "manuscript"].includes(kind))
    return { goal: 0, label: "First draft" };
  return {};
}

function AtlasMark({ large = false }: { large?: boolean }) {
  return (
    <span className={"atlas-mark " + (large ? "large" : "")}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M7 31V10l13-4 13 4v21l-13-4-13 4Zm13-23v19M11 14l5-2m-5 8 5-2m8-6 5 2m-5 4 5 2" />
        <path d="m28 4 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" />
      </svg>
    </span>
  );
}

function Gate({ boot, onDone }: { boot: any; onDone: () => Promise<void> }) {
  const [registering,setRegistering]=useState(false),[username,setUsername]=useState(""),
    [name,setName]=useState(""),[world,setWorld]=useState("My first world"),
    [password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),
    [error,setError]=useState(""),[busy,setBusy]=useState(false);
  const creating=registering;
  return <div className="welcome-screen">
    <header className="auth-topbar"><AinaMenu parent={boot.aina_parent}/><span>WorldBuilder</span><div className="auth-switch"><button type="button" aria-label="Switch to login" aria-current={!creating?"page":undefined} onClick={()=>{setRegistering(false);setError("");}}>Log in</button><button type="button" aria-label="Switch to create account" aria-current={creating?"page":undefined} onClick={()=>{setRegistering(true);setError("");}}>Create account</button></div></header>
    <main className="welcome-form"><div><h2>{creating?"Create account":"Log in"}</h2><p>{creating?"Create a local account and your first world.":"Welcome back. Enter your username and password."}</p>
      <form onSubmit={async e=>{e.preventDefault();setError("");if(creating&&password!==confirm){setError("The passwords do not match.");return;}setBusy(true);try{
        await post(creating?(!boot.configured?"/setup":"/register"):"/login",{username:username.trim(),password,name:name.trim()||username.trim(),world_name:world});
        setPassword("");setConfirm("");await onDone();
      }catch(e:any){setError(e.message);}finally{setBusy(false);}}}>
        <label className="field"><span>Username</span><input id="worldbuilder-username" autoComplete="username" required maxLength={80} value={username} onChange={e=>setUsername(e.target.value)}/></label>
        {creating&&<><Field label="Display name" value={name} onChange={setName}/><Field label="Your first world" value={world} onChange={setWorld}/></>}
        <label className="field"><span>Password</span><input id="workspace-password" type="password" autoComplete={creating?"new-password":"current-password"} minLength={creating?8:1} maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        {creating&&<label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
        {error&&<ErrorBox message={error}/>}<button className="button primary full-button" type="submit" disabled={busy}>{busy?<Loader2 size={17} className="spin"/>:null}{creating?"Create account":"Log in"}<ArrowRight size={17}/></button>
      </form>
      <button className="button full-button" type="button" disabled={busy} onClick={()=>{setRegistering(!registering);setUsername("");setPassword("");setConfirm("");setError("");}}>{registering?"Back to login":"Create account"}</button>
      <p className="welcome-note"><LockKeyhole size={14}/>Accounts and passwords are stored locally. Each account has its own worlds.</p>
    </div></main></div>;
}

export default function App() {
  const [boot, setBoot] = useState<any>(null),
    [worlds, setWorlds] = useState<World[]>([]),
    [worldId, setWorldId] = useState(""),
    [world, setWorld] = useState<World | null>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [assets, setAssets] = useState<Asset[]>([]),
    [edges, setEdges] = useState<Edge[]>([]),
    [route, setRoute] = useState(location.hash.slice(2) || "home"),
    [error, setError] = useState(""),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [creating, setCreating] = useState<{
      kind: string;
      parent?: string;
    } | null>(null),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<Entry[]>([]),
    [searching, setSearching] = useState(false),
    [help, setHelp] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [newWorld, setNewWorld] = useState(false),
    [worldName, setWorldName] = useState(""),
    [name, setName] = useState(""),
    [template, setTemplate] = useState("generic"),
    [createBusy, setCreateBusy] = useState(false),
    [handout, setHandout] = useState<string | null>(null);
  const activeWorld = useRef(worldId);
  activeWorld.current = worldId;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), error ? 8000 : 4200);
  }, []);
  const loadBoot = useCallback(async () => {
    const value = await api("/bootstrap");
    setBoot(value);
    if (value.authenticated) {
      setWorlds(value.worlds);
      const saved = localStorage.getItem("worldbuilder.world");
      setWorldId((old: string) =>
        value.worlds.some((w: World) => w.id === old)
          ? old
          : value.worlds.some((w: World) => w.id === saved)
            ? saved
            : value.worlds[0]?.id || "",
      );
    } else {
      requestId.current++;setWorldId("");setWorld(null);setWorlds([]);setEntries([]);setAssets([]);setEdges([]);setRoute("home");location.hash="/home";
    }
  }, []);
  const signOut=useCallback(async()=>{
    try{if(saveBeforeNavigate.current&&!(await saveBeforeNavigate.current()))return;await post("/logout");await loadBoot();}catch(e:any){notify(e.message,true);}
  },[loadBoot,notify]);
  useEffect(()=>{
    if(!boot?.aina_parent)return;
    document.body.dataset.ainaIntegrated="true";
    window.parent.postMessage({type:"aina:account",authenticated:boot.authenticated,name:boot.user?.name||""},boot.aina_parent);
    const receive=(e:MessageEvent)=>{if(e.source===window.parent&&e.origin===boot.aina_parent&&e.data?.type==="aina:logout")void signOut();};
    window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
  },[boot,signOut]);
  useEffect(() => {
    loadBoot().catch((e) => setError(e.message));
  }, []);
  const refresh = useCallback(async () => {
    if (!worldId) return;
    const serial = ++requestId.current;
    const [w, r, a, c, all] = await Promise.all([
      api<World>("/worlds/" + worldId),
      api("/worlds/" + worldId + "/resources"),
      api("/worlds/" + worldId + "/assets"),
      api("/worlds/" + worldId + "/connections"),
      api("/worlds"),
    ]);
    if (activeWorld.current !== worldId || serial !== requestId.current) return;
    setWorld(w);
    setEntries(r.resources);
    setAssets(a.assets);
    setEdges(c.connections);
    setWorlds(all.worlds);
    setError("");
  }, [worldId]);
  useEffect(() => {
    if (worldId) {
      localStorage.setItem("worldbuilder.world", worldId);
      refresh().catch((e) => {
        if (e.status === 401)
          setBoot((b: any) => ({ ...b, authenticated: false }));
        else setError(e.message);
      });
    }
  }, [worldId]);
  const go = useCallback(async (target: string) => {
    if (saveBeforeNavigate.current && !(await saveBeforeNavigate.current()))
      return;
    location.hash = "/" + target;
    setMobileNav(false);
  }, []);
  useEffect(() => {
    const onHash = () => setRoute(location.hash.slice(2) || "home");
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", keys);
    };
  }, []);
  useEffect(() => {
    if (!search || !worldId) return;
    let alive = true;
    setSearching(true);
    const timer = setTimeout(
      () =>
        api("/worlds/" + worldId + "/resources?q=" + encodeURIComponent(query))
          .then((r) => {
            if (alive) setResults(r.resources.slice(0, 40));
          })
          .catch((e) => notify(e.message, true))
          .finally(() => {
            if (alive) setSearching(false);
          }),
      200,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search, query, worldId]);
  useEffect(() => {
    if (route.startsWith("handout/")) setHandout(route.split("/")[1]);
    const channel = new BroadcastChannel("worldbuilder-handout");
    channel.onmessage = (e) => {
      if (route.startsWith("handout/")) setHandout(e.data.asset);
    };
    return () => channel.close();
  }, [route]);
  const create = (kind = "article", parent?: string) => {
    setCreating({ kind, parent });
    setName("");
    setTemplate(kind === "character" ? "character" : "generic");
  };
  const switchWorld = async (id: string) => {
    if (saveBeforeNavigate.current && !(await saveBeforeNavigate.current()))
      return;
    setWorldId(id);
    go("home");
  };
  if (!boot)
    return error ? (
      <div className="fatal-error">
        <AtlasMark large />
        <h1>WorldBuilder couldn’t open.</h1>
        <p>{error}</p>
        <button className="button primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    ) : (
      <div className="boot-loading">
        <AtlasMark large />
        <span>Opening your workspace…</span>
      </div>
    );
  if (!boot.authenticated) return <Gate boot={boot} onDone={loadBoot} />;
  if (route.startsWith("handout/")) {
    const asset = assets.find((a) => a.id === handout);
    return (
      <div className="handout-screen">
        {asset ? (
          <img src={asset.url} alt={asset.name} />
        ) : (
          <div>
            <ImageIcon size={42} />
            <p>Your next discovery is waiting.</p>
          </div>
        )}
      </div>
    );
  }
  const ctx: AppContext = {
    installationOwner: boot.user?.installation_owner === true,
    world: world!,
    entries,
    assets,
    edges,
    templates: boot.templates,
    go,
    refresh,
    notify,
    create,
  };
  const currentNav =
    route.startsWith("notebooks") || route === "notes" || route === "tasks"
      ? "notebooks"
      : route.startsWith("entry/") ||
          route.startsWith("characters/") ||
          route.startsWith("locations/")
        ? "library"
        : route.startsWith("sessions/") ||
            route.startsWith("campaign-desk/") ||
            route.startsWith("campaign-flow/") ||
            route.startsWith("campaign-continuity/") ||
            route.startsWith("threads/")
          ? "campaigns"
          : route.split("/")[0];
  const matchingImages = query.trim()
    ? assets
        .filter((a) =>
          tagKey(a.name + " " + a.credit + " " + a.tags.join(" ")).includes(
            tagKey(query),
          ),
        )
        .slice(0, 20)
    : [];
  let page: React.ReactNode = null;
  if (world && world.id === worldId) {
    if (route.startsWith("entry/"))
      page = (
        <EntryEditor
          key={route.split("/")[1]}
          id={route.split("/")[1]}
          ctx={ctx}
        />
      );
    else if (route.startsWith("characters/"))
      page = (
        <div className="page">
          <CharacterDossier
            key={route}
            ctx={ctx}
            id={route.split("/")[1]}
            campaignId={route.split("/")[2] || ""}
          />
        </div>
      );
    else if (route.startsWith("locations/"))
      page = (
        <div className="page">
          <LocationGuide
            key={route}
            ctx={ctx}
            id={route.split("/")[1]}
            campaignId={route.split("/")[2] || ""}
          />
        </div>
      );
    else if (route.startsWith("campaign-continuity/"))
      page = (
        <CampaignContinuity
          key={route}
          ctx={ctx}
          id={route.split("/")[1]}
          view={route.split("/")[2] || "overview"}
          sessionId={route.split("/")[3] || ""}
          initialSource={route.split("/")[4] || ""}
        />
      );
    else if (route.startsWith("campaign-flow/"))
      page = (
        <CampaignLifecycle
          key={route}
          ctx={ctx}
          id={route.split("/")[1]}
          view={route.split("/")[2] || "planner"}
          initialSession={route.split("/")[3] || ""}
          initialRecord={route.split("/")[4] || ""}
        />
      );
    else if (route.startsWith("campaign-desk/"))
      page = (
        <CampaignWorkbench
          key={route}
          ctx={ctx}
          id={route.split("/")[1]}
          view={route.split("/")[2] || "desk"}
          initialSession={route.split("/")[3]}
        />
      );
    else if (route.startsWith("threads/"))
      page = (
        <div className="page">
          <ThreadGuide key={route} ctx={ctx} id={route.split("/")[1]} />
        </div>
      );
    else if (route.startsWith("sessions/"))
      page = (
        <div className="page">
          <SessionGuide key={route} ctx={ctx} id={route.split("/")[1]} />
        </div>
      );
    else if (currentNav === "library") page = <Library ctx={ctx} />;
    else if (currentNav === "maps")
      page = <Library ctx={ctx} kind="map" heading="Maps & places" />;
    else if (currentNav === "relationships") page = <Relationships ctx={ctx} />;
    else if (currentNav === "history") page = <HistoryPage ctx={ctx} />;
    else if (route === "tasks") page = <Notes ctx={ctx} initialTab="task" />;
    else if (currentNav === "notebooks")
      page = (
        <Notebooks
          key={world.id}
          ctx={ctx}
          view={route.split("/")[1] || "all"}
          bookId={route.split("/")[2] || ""}
          sectionId={route.split("/")[3] || ""}
          noteId={route.split("/")[4] || ""}
        />
      );
    else if (currentNav === "tools") page = <Tools ctx={ctx} />;
    else if (currentNav === "media") page = <Media ctx={ctx} />;
    else if (currentNav === "writing")
      page = <Writing key={route} ctx={ctx} bookId={route.split("/")[1]} />;
    else if (currentNav === "campaigns")
      page = <Campaigns key={route} ctx={ctx} id={route.split("/")[1]} />;
    else if (currentNav === "import") page = <ImportPage ctx={ctx} />;
    else if (currentNav === "settings")
      page = <SettingsPage ctx={ctx} onWorldChange={switchWorld} />;
    else page = <Dashboard ctx={ctx} />;
  }
  return (
    <div className={"app-shell " + (mobileNav ? "nav-open" : "")}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#/home"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <AtlasMark />
          <span>
            WorldBuilder<small>YOUR WORLDS, CONNECTED</small>
          </span>
        </a>
        <div className="world-switcher">
          <span className="world-avatar">{world?.name.slice(0, 1) || "W"}</span>
          <label>
            <span>YOUR WORLD</span>
            <SearchableSelect
              aria-label="Current world"
              value={worldId}
              onChange={(e) => switchWorld(e.target.value)}
            >
              {worlds.map((w) => (
                <option value={w.id} key={w.id}>
                  {w.name}
                </option>
              ))}
            </SearchableSelect>
          </label>
          <button
            className="world-add"
            title="Create another world"
            aria-label="Create another world"
            onClick={() => setNewWorld(true)}
          >
            <Plus size={15} />
          </button>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Workspace navigation">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={currentNav === id ? "active" : ""}
              aria-current={currentNav === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "library" && entries.length > 0 && (
                <small>
                  {entries.filter((e) => e.kind !== "folder").length}
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() => go("import")}
            className={currentNav === "import" ? "active" : ""}
          >
            <Upload size={17} />
            Import your notes
          </button>
          <button
            onClick={() => go("settings")}
            className={currentNav === "settings" ? "active" : ""}
          >
            <Settings size={17} />
            World settings
          </button>
          <button onClick={() => setHelp(true)}>
            <HelpCircle size={17} />
            Help & shortcuts
          </button>

        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><AinaMenu parent={boot.aina_parent}/>
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu size={21} />
          </button>
          <div className="topbar-crumb">
            <Compass size={17} />
            <span>{world?.name || "Your world"}</span>
            <ChevronRight size={13} />
            <strong>
              {nav.find((n) => n[0] === currentNav)?.[1] ||
                (currentNav === "settings"
                  ? "Settings"
                  : currentNav === "import"
                    ? "Import"
                    : "Workspace")}
            </strong>
          </div>
          <button className="global-search" onClick={() => setSearch(true)}>
            <Search size={16} />
            <span>Search your world…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            className="button primary topbar-create"
            onClick={() => create("article")}
          >
            <Plus size={17} />
            <span>Create</span>
          </button>
          <details className="wb-account-menu"><summary aria-label="Account menu">{boot.user?.name||boot.user?.username}<ChevronDown size={14}/></summary><div><strong>{boot.user?.name||boot.user?.username}</strong><button type="button" onClick={()=>void signOut()}><LogOut size={16}/>Log out</button></div></details>
        </header>
        <main id="main-content">
          {error && (
            <div className="global-error">
              <ErrorBox message={error} />
              <button
                className="text-button"
                onClick={() => refresh().catch((e) => notify(e.message, true))}
              >
                Retry
              </button>
            </div>
          )}
          {page || (
            <div className="page-loading">
              <Loader2 className="spin" size={21} />
              Opening your world…
            </div>
          )}
        </main>
        <footer className="app-status">
          <span>
            <span className="status-indicator" />
            Your work stays on this computer
          </span>
          <span>
            WorldBuilder <span className="footer-flower">✦</span> Make room for
            a world.
          </span>
        </footer>
      </div>
      {world && world.id === worldId && (
        <ReferenceTray key={world.id} ctx={ctx} />
      )}
      {world && world.id === worldId && (
        <ReferencePreviewController ctx={ctx} />
      )}
      {toast && (
        <div
          className={"toast " + (toast.error ? "toast-error" : "")}
          role={toast.error ? "alert" : "status"}
        >
          <span>
            {toast.error ? <ShieldCheck size={18} /> : <Check size={18} />}
          </span>
          <p>{toast.message}</p>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {creating && (
        <Modal
          title={
            "Create " + (kindLabels[creating.kind] || "entry").toLowerCase()
          }
          onClose={() => setCreating(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                saveBeforeNavigate.current &&
                !(await saveBeforeNavigate.current())
              )
                return;
              setCreateBusy(true);
              try {
                const entry = await post<Entry>(
                  "/worlds/" + worldId + "/resources",
                  {
                    title: name,
                    kind: creating.kind,
                    template,
                    parent: creating.parent || null,
                    data: initialData(creating.kind, creating.parent, entries),
                  },
                );
                await refresh();
                setCreating(null);
                go("entry/" + entry.id);
              } catch (error: any) {
                notify(error.message, true);
              } finally {
                setCreateBusy(false);
              }
            }}
          >
            <Field
              label="Name your entry"
              value={name}
              onChange={setName}
              placeholder="A person, a place, a possibility…"
            />
            <label className="field">
              <span>What are you creating?</span>
              <SearchableSelect
                value={creating.kind}
                onChange={(e) => {
                  setCreating({ ...creating, kind: e.target.value });
                  setTemplate(
                    e.target.value === "character" ? "character" : "generic",
                  );
                }}
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            {["article", "character"].includes(creating.kind) && (
              <label className="field">
                <span>Article template</span>
                <SearchableSelect
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                >
                  {boot.templates.map((t: Template) => (
                    <option value={t.id} key={t.id}>
                      {t.label}
                    </option>
                  ))}
                  {entries
                    .filter((e) => e.kind === "template")
                    .map((t) => (
                      <option value={"custom:" + t.id} key={t.id}>
                        {t.title} · custom
                      </option>
                    ))}
                </SearchableSelect>
              </label>
            )}
            <div className="notice">
              <LockKeyhole size={15} />
              New entries start private. Every detail can be changed later.
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreating(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={!name.trim() || createBusy}
              >
                {createBusy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Plus size={16} />
                )}
                Create entry
              </button>
            </div>
          </form>
        </Modal>
      )}
      {search && (
        <Modal title="Search your world" wide onClose={() => setSearch(false)}>
          <label className="command-search">
            <Search size={20} />
            <input
              aria-label="Search all world content"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Names, aliases, words from your notes…"
              autoFocus
            />
          </label>
          <div className="search-results">
            {searching ? (
              <div className="page-loading">
                <Loader2 className="spin" size={18} />
                Searching…
              </div>
            ) : results.length ? (
              results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSearch(false);
                    go("entry/" + r.id);
                  }}
                >
                  <span className="type-mark">
                    <KindIcon kind={r.kind} />
                  </span>
                  <div>
                    <strong>{r.title}</strong>
                    <small>{r.summary || kindLabels[r.kind]}</small>
                  </div>
                  <Badge>{r.template}</Badge>
                  <ArrowRight size={16} />
                </button>
              ))
            ) : (
              !matchingImages.length && (
                <p className="empty-search">
                  {query
                    ? "No matching entries. Try another name or phrase."
                    : "Your entries will appear here as you build your world."}
                </p>
              )
            )}
            {!!matchingImages.length && !searching && (
              <>
                <h3 className="search-media-heading">Images</h3>
                {matchingImages.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSearch(false);
                      go("media/" + a.id);
                    }}
                  >
                    <img className="search-image-thumb" src={a.url} alt="" />
                    <div>
                      <strong>{a.name}</strong>
                      <small>{a.tags.join(" · ") || a.credit}</small>
                    </div>
                    <Badge>Image</Badge>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </>
            )}
          </div>
        </Modal>
      )}
      {newWorld && (
        <Modal
          title="Make room for another world"
          onClose={() => setNewWorld(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (
                  saveBeforeNavigate.current &&
                  !(await saveBeforeNavigate.current())
                )
                  return;
                const created = await post<World>("/worlds", {
                  name: worldName,
                });
                setWorlds([...worlds, created]);
                setNewWorld(false);
                setWorldName("");
                switchWorld(created.id);
              } catch (error: any) {
                notify(error.message, true);
              }
            }}
          >
            <Field
              label="World name"
              value={worldName}
              onChange={setWorldName}
              placeholder="What is this world called?"
            />
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setNewWorld(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={!worldName.trim()}>
                Create world
              </button>
            </div>
          </form>
        </Modal>
      )}
      {help && (
        <Modal title="Make yourself at home" onClose={() => setHelp(false)}>
          <div className="help-shortcuts">
            <div>
              <kbd>Ctrl K</kbd>
              <span>Search everything in your world</span>
            </div>
            <div>
              <kbd>Ctrl Z</kbd>
              <span>Undo in the text editor</span>
            </div>
            <div>
              <kbd>Esc</kbd>
              <span>Close a dialog</span>
            </div>
          </div>
          <p>
            Entries save automatically after you pause typing. You can also use
            Save. Revision history keeps earlier saved versions, and Trash keeps
            removed entries.
          </p>
          <p>
            Use <strong>Import your notes</strong> to preview and copy existing
            campaign files. Use <strong>World settings</strong> for backups and
            portable exports.
          </p>
          <div className="notice">
            Your app runs locally at 127.0.0.1. Keep the WorldBuilder launcher
            running while you work.
          </div>
          <p className="muted small-copy">
            WorldBuilder 0.21 · Local authoring release. Research and the full
            delivery checklist are in the WorldBuilder/docs folder.
          </p>
        </Modal>
      )}
    </div>
  );
}
