import { SearchableSelect } from "./SearchableSelect";
import { CampaignWorkspace } from "./CampaignWorkspace";
import { belongsToCampaign } from "./CampaignRecords";
import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Dices,
  Download,
  Eye,
  FileText,
  Flag,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  AppContext,
  Entry,
  api,
  post,
  patch,
  when,
  size,
  World,
  uid,
} from "./domain";
import {
  Badge,
  Empty,
  ErrorBox,
  Field,
  KindIcon,
  Modal,
  Section,
  EntryPicker,
} from "./ui";
import { PageHeading, EntryCard } from "./Pages";

export function ImportPage({ ctx }: { ctx: AppContext }) {
  const folders = [
    "Bestiary",
    "DM Notes",
    "Main Story",
    "NPC Catalogue",
    "Shops",
    "Tower",
    "images",
  ];
  const [selectedFolders, setSelectedFolders] = useState<string[]>([
      "NPC Catalogue",
    ]),
    [scan, setScan] = useState<any>(null),
    [chosen, setChosen] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [result, setResult] = useState<any>(null),
    [preview, setPreview] = useState<any>(null);
  const runScan = async () => {
    setBusy("scan");
    setError("");
    setResult(null);
    try {
      setScan(await post("/import/scan", { folders: selectedFolders }));
      setChosen(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const importFiles = async () => {
    setBusy("import");
    setError("");
    try {
      const files = scan.files.filter((f: any) => chosen.has(f.path));
      const value = await post("/worlds/" + ctx.world.id + "/import", {
        files,
      });
      setResult(value);
      setChosen(new Set());
      await ctx.refresh();
      ctx.notify("Campaign import finished. Review the results below.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="page">
      <PageHeading
        eyebrow="BRING YOUR STORIES WITH YOU"
        title="Import campaign notes"
      >
        Preview your files, choose what belongs here, and keep your originals
        exactly where they are.
      </PageHeading>
      <div className="import-intro">
        <span className="import-step">1</span>
        <div>
          <h2>Choose campaign folders</h2>
          <p>
            Text, Markdown, HTML, extensionless notes and supported images.
            Imported entries start private.
          </p>
          <div className="folder-options">
            {folders.map((folder) => (
              <label key={folder}>
                <input
                  type="checkbox"
                  checked={selectedFolders.includes(folder)}
                  onChange={(e) =>
                    setSelectedFolders(
                      e.target.checked
                        ? [...selectedFolders, folder]
                        : selectedFolders.filter((f) => f !== folder),
                    )
                  }
                />
                <FolderOpen size={16} />
                {folder}
                {folder === "DM Notes" && <LockKeyhole size={13} />}
              </label>
            ))}
          </div>
          <button
            className="button primary"
            disabled={!!busy || !selectedFolders.length}
            onClick={runScan}
          >
            {busy === "scan" ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Eye size={16} />
            )}
            Preview files
          </button>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {scan && (
        <Section
          title={"Choose files · " + scan.files.length + " found"}
          action={
            <div className="button-row">
              <button
                className="text-button"
                onClick={() =>
                  setChosen(
                    new Set(scan.files.slice(0, 200).map((f: any) => f.path)),
                  )
                }
              >
                Select first {Math.min(scan.files.length, 200)}
              </button>
              <button
                className="text-button"
                onClick={() => setChosen(new Set())}
              >
                Clear
              </button>
            </div>
          }
        >
          <div className="notice">
            Nothing is imported until you select files and click Import. Up to
            200 files per batch; previously imported files are kept intact.
          </div>
          <div className="import-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th />
                  <th>Source file</th>
                  <th>Suggested type</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {scan.files.map((file: any) => (
                  <tr key={file.path}>
                    <td>
                      <input
                        aria-label={"Import " + file.path}
                        type="checkbox"
                        checked={chosen.has(file.path)}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) {
                            if (next.size >= 200) {
                              ctx.notify(
                                "Choose up to 200 files per batch.",
                                true,
                              );
                              return;
                            }
                            next.add(file.path);
                          } else next.delete(file.path);
                          setChosen(next);
                        }}
                      />
                    </td>
                    <td>
                      <strong>{file.title}</strong>
                      <small>{file.path}</small>
                    </td>
                    <td>
                      <Badge>
                        {file.kind === "asset"
                          ? "Image"
                          : file.kind === "note"
                            ? "Private note"
                            : file.template}
                      </Badge>
                    </td>
                    <td>{size(file.size)}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setPreview(file)}
                      >
                        Preview
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {scan.warnings.length > 0 && (
            <details className="import-warnings">
              <summary>{scan.warnings.length} files need attention</summary>
              {scan.warnings.map((w: any) => (
                <p key={w.path}>
                  <strong>{w.path}</strong> — {w.message}
                </p>
              ))}
            </details>
          )}
          <div className="import-actions">
            <span>
              {chosen.size} selected · destination: {ctx.world.name}
            </span>
            <button
              className="button primary"
              disabled={!chosen.size || !!busy}
              onClick={importFiles}
            >
              {busy === "import" ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Upload size={16} />
              )}
              Import selected files
            </button>
          </div>
        </Section>
      )}
      {result && (
        <div className="success-panel">
          <ShieldCheck size={27} />
          <div>
            <h2>Your notes have a new home.</h2>
            <p>
              {result.created.length} entries created · {result.assets.length}{" "}
              images added · {result.skipped.length} previously imported files
              kept.
            </p>
            {result.warnings.map((w: any, i: number) => (
              <p className="small-copy" key={i}>
                <strong>{w.path}</strong>: {w.message}
              </p>
            ))}
            <button className="text-button" onClick={() => ctx.go("library")}>
              Explore your library
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
      {preview && (
        <Modal title={preview.title} wide onClose={() => setPreview(null)}>
          <p className="muted">{preview.path}</p>
          <pre className="source-preview">{preview.preview}</pre>
          <p className="muted small-copy">
            This is a short source preview. The original file is preserved
            during import.
          </p>
        </Modal>
      )}
    </div>
  );
}

export function SettingsPage({
  ctx,
  onWorldChange,
}: {
  ctx: AppContext;
  onWorldChange: (id: string) => void;
}) {
  const [world, setWorld] = useState(ctx.world),
    [backups, setBackups] = useState<any[]>([]),
    [trash, setTrash] = useState<Entry[]>([]),
    [busy, setBusy] = useState(""),
    [verified, setVerified] = useState<Record<string, boolean>>({});
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setWorld(ctx.world);
  }, [ctx.world.id]);
  const reload = async () => {
    const [b, t] = await Promise.all([
      ctx.installationOwner===false?Promise.resolve({backups:[]}):api("/backups"),
      api("/worlds/" + ctx.world.id + "/resources?trash=1"),
    ]);
    setBackups(b.backups);
    setTrash(t.resources);
  };
  useEffect(() => {
    reload().catch((e) => ctx.notify(e.message, true));
  }, [ctx.world.id]);
  const meta = world.data.meta || {};
  return (
    <div className="page settings-page">
      <PageHeading eyebrow="MAKE YOURSELF AT HOME" title="World settings">
        The shape of your world, and the care you put into keeping it.
      </PageHeading>
      <div className="settings-columns">
        <div>
          <Section title="Your world">
            <Field
              label="World name"
              value={world.name}
              onChange={(v) => setWorld({ ...world, name: v })}
            />
            <Field
              label="A line to set the scene"
              value={world.tagline}
              onChange={(v) => setWorld({ ...world, tagline: v })}
            />
            <label className="field">
              <span>World description</span>
              <textarea
                value={world.description}
                onChange={(e) =>
                  setWorld({ ...world, description: e.target.value })
                }
              />
            </label>
            <div className="section-heading">
              <h3>Worldbuilding compass</h3>
            </div>
            <label className="historical-checkbox">
              <input
                type="checkbox"
                checked={world.data.auto_link_names !== false}
                onChange={(e) =>
                  setWorld({
                    ...world,
                    data: { ...world.data, auto_link_names: e.target.checked },
                  })
                }
              />
              Automatically link entry names and aliases in reading views
            </label>
            {[
              ["Purpose & scope", "scope"],
              ["Tone & themes", "themes"],
              ["Rules of the world", "rules"],
              ["Inspirations", "inspiration"],
            ].map(([label, key]) => (
              <label className="field" key={key}>
                <span>{label}</span>
                <textarea
                  value={meta[key] || ""}
                  placeholder="A few words to keep your world consistent…"
                  onChange={(e) =>
                    setWorld({
                      ...world,
                      data: {
                        ...world.data,
                        meta: { ...meta, [key]: e.target.value },
                      },
                    })
                  }
                />
              </label>
            ))}
            <button
              className="button primary"
              disabled={busy === "world" || !world.name.trim()}
              onClick={async () => {
                setBusy("world");
                try {
                  await patch("/worlds/" + world.id, {
                    name: world.name,
                    tagline: world.tagline,
                    description: world.description,
                    data: world.data,
                  });
                  await ctx.refresh();
                  ctx.notify("World settings saved.");
                } catch (e: any) {
                  ctx.notify(e.message, true);
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === "world" ? "Saving…" : "Save world settings"}
            </button>
          </Section>
        </div>
        <div>
          {ctx.installationOwner!==false && <>
          <Section
            title="Backups & recovery"
            action={<ShieldCheck size={20} />}
          >
            <p className="muted">
              A complete backup includes all worlds, saved revisions, private
              notes and image files.
            </p>
            <button
              className="button primary full-button"
              disabled={busy === "backup"}
              onClick={async () => {
                setBusy("backup");
                try {
                  await post("/backups");
                  await reload();
                  ctx.notify("Complete backup created.");
                } catch (e: any) {
                  ctx.notify(e.message, true);
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === "backup" ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Archive size={16} />
              )}
              Create complete backup
            </button>
            <div className="backup-list">
              {backups.slice(0, 8).map((b) => (
                <div key={b.name}>
                  <Archive size={17} />
                  <div>
                    <strong>{b.name.split("_")[0]}</strong>
                    <small>
                      {size(b.size)}
                      {verified[b.name] ? " · Integrity verified" : ""}
                    </small>
                  </div>
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        await post("/backups/" + b.name + "/verify");
                        setVerified({ ...verified, [b.name]: true });
                        ctx.notify("Every file matches its backup checksum.");
                      } catch (e: any) {
                        ctx.notify(e.message, true);
                      }
                    }}
                  >
                    Verify
                  </button>
                  <a
                    className="icon-button"
                    href={"/api/backups/" + b.name}
                    download
                    title="Download backup"
                    aria-label="Download backup"
                  >
                    <Download size={16} />
                  </a>
                </div>
              ))}
            </div>
            <p className="muted small-copy">
              For a complete installation restore, close WorldBuilder and run{" "}
              <strong>Restore WorldBuilder.cmd</strong>. It restores to a new
              folder and leaves the existing data intact.
            </p>
          </Section>
          </>}
          <Section title="Take your world with you">
            <p className="muted">
              Export this world as a portable archive with structured data,
              images and a readable HTML copy. Includes private content.
            </p>
            <a
              className="button secondary full-button"
              href={"/api/worlds/" + ctx.world.id + "/export"}
              download
            >
              <Download size={16} />
              Export this world
            </a>
            <input
              hidden
              type="file"
              accept=".zip"
              ref={file}
              onChange={async (e) => {
                const selected = e.target.files?.[0];
                if (!selected) return;
                if (
                  !confirm(
                    "Import this archive as a new world? Existing worlds will stay unchanged.",
                  )
                )
                  return;
                setBusy("restore");
                try {
                  const form = new FormData();
                  form.append("file", selected);
                  const result = await api<World>("/import/archive", {
                    method: "POST",
                    body: form,
                  });
                  await ctx.refresh();
                  onWorldChange(result.id);
                  ctx.notify("World restored into a separate world.");
                } catch (error: any) {
                  ctx.notify(error.message, true);
                } finally {
                  setBusy("");
                  e.target.value = "";
                }
              }}
            />
            <button
              className="button secondary full-button"
              disabled={busy === "restore"}
              onClick={() => file.current?.click()}
            >
              <Upload size={16} />
              {busy === "restore" ? "Restoring…" : "Restore an exported world"}
            </button>
          </Section>
          <Section title="Trash">
            <p className="muted small-copy">
              Entries stay here until restored. This version does not
              permanently erase them.
            </p>
            {trash.length ? (
              <div className="trash-list">
                {trash.map((e) => (
                  <div key={e.id}>
                    <KindIcon kind={e.kind} size={16} />
                    <span>{e.title}</span>
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await post("/resources/" + e.id + "/restore", {
                            expected_revision: e.revision,
                          });
                          await ctx.refresh();
                          await reload();
                          ctx.notify("Entry restored.");
                        } catch (error: any) {
                          ctx.notify(error.message, true);
                        }
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Nothing in Trash.</p>
            )}
          </Section>
          <div className="local-assurance">
            <LockKeyhole size={19} />
            <div>
              <strong>Your private workspace</strong>
              <p>
                Runs on this computer. Core tools work offline. Nothing is
                published to the internet.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Campaigns({ ctx, id }: { ctx: AppContext; id?: string }) {
  const campaigns = ctx.entries.filter((e) => e.kind === "campaign");
  const campaign = campaigns.find((e) => e.id === id);
  const [formula, setFormula] = useState("1d20"),
    [roll, setRoll] = useState<any>(null),
    [reference, setReference] = useState(""),
    [full, setFull] = useState<Entry | null>(null),
    [handout, setHandout] = useState(""),
    [questName, setQuestName] = useState(""),
    [inventoryName, setInventoryName] = useState(""),
    [runningSession, setRunningSession] = useState(false);
  useEffect(() => {
    let alive = true;
    if (reference)
      api<Entry>("/resources/" + reference)
        .then((value) => {
          if (alive) setFull(value);
        })
        .catch((e) => ctx.notify(e.message, true));
    else setFull(null);
    return () => {
      alive = false;
    };
  }, [reference]);
  if (!campaign)
    return (
      <div className="page">
        <PageHeading
          eyebrow="GATHER YOUR PARTY"
          title="Campaigns"
          action={
            <button
              className="button primary"
              onClick={() => ctx.create("campaign")}
            >
              <Plus size={17} />
              New campaign
            </button>
          }
        >
          The people, plans and possibilities behind your next session.
        </PageHeading>
        {campaigns.length ? (
          <div className="campaign-grid">
            {campaigns.map((c) => (
              <button
                key={c.id}
                className="campaign-card"
                onClick={() => ctx.go("campaigns/" + c.id)}
              >
                <div className="campaign-banner">
                  <Flag size={32} />
                  <Badge>{c.data.system || "Homebrew"}</Badge>
                </div>
                <div>
                  <h2>{c.title}</h2>
                  <p>{c.summary || "The next chapter is yours to write."}</p>
                  <span>
                    {(c.data.party || []).length} party members
                    <ArrowRight size={17} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            icon={Flag}
            title="A new adventure is waiting"
            action={() => ctx.create("campaign")}
            label="Create a campaign"
          >
            Bring together the cast, track quests, and keep everything ready for
            the table.
          </Empty>
        )}
      </div>
    );
  const quests = ctx.entries.filter(
    (e) => e.kind === "quest" && belongsToCampaign(e, campaign.id),
  );
  const sessions = ctx.entries.filter(
    (e) => e.kind === "session" && belongsToCampaign(e, campaign.id),
  );
  const party = ctx.entries.filter((e) =>
    (campaign.data.party || []).includes(e.id),
  );
  const updateCampaign = async (data: any) => {
    try {
      await patch("/resources/" + campaign.id, {
        data,
        expected_revision: campaign.revision,
      });
      await ctx.refresh();
    } catch (e: any) {
      ctx.notify(e.message, true);
    }
  };
  return (
    <div className="page gm-page">
      <PageHeading
        eyebrow="YOUR STORYTELLER'S SCREEN"
        title={campaign.title}
        action={
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => ctx.go("entry/" + campaign.id)}
            >
              Campaign details
            </button>
            <button
              className="button primary"
              onClick={() => setRunningSession(true)}
            >
              <Plus size={16} />
              Run session
            </button>
          </div>
        }
      >
        {campaign.data.system || "Homebrew"} ·{" "}
        {campaign.data.campaign_status || "Preparing"}
      </PageHeading>
      <CampaignWorkspace
        key={campaign.id}
        campaign={campaign}
        ctx={ctx}
        run={runningSession}
        onRun={setRunningSession}
      />
      <div
        className="gm-layout"
        style={runningSession ? undefined : { display: "none" }}
      >
        <div className="gm-side">
          <Section title="Your party" action={<Users size={18} />}>
            <div className="party-list">
              {party.length ? (
                party.map((p) => (
                  <button key={p.id} onClick={() => ctx.go("entry/" + p.id)}>
                    <span>{p.title.slice(0, 1)}</span>
                    <div>
                      <strong>{p.title}</strong>
                      <small>{p.summary || "Character"}</small>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                ))
              ) : (
                <p className="muted">
                  Add characters to the party in Campaign details.
                </p>
              )}
            </div>
          </Section>
          <Section title="Dice tray" action={<Dices size={19} />}>
            <div className="dice-buttons">
              {[4, 6, 8, 10, 12, 20, 100].map((d) => (
                <button key={d} onClick={() => setFormula("1d" + d)}>
                  d{d}
                </button>
              ))}
            </div>
            <form
              className="dice-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setRoll(
                    await post("/tools/dice", {
                      world_id: ctx.world.id,
                      formula,
                    }),
                  );
                  await ctx.refresh();
                } catch (error: any) {
                  ctx.notify(error.message, true);
                }
              }}
            >
              <input
                aria-label="Dice formula"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="2d6+3"
              />
              <button className="button primary" type="submit">
                Roll
              </button>
            </form>
            {roll && (
              <div className="dice-result">
                <strong>{roll.total}</strong>
                <span>
                  {roll.formula} · [{roll.rolls.join(", ")}]
                  {roll.modifier
                    ? " " + (roll.modifier > 0 ? "+" : "") + roll.modifier
                    : ""}
                </span>
              </div>
            )}
            <div className="dice-log">
              {ctx.world.activities
                ?.filter((a) => a.kind === "roll")
                .slice(0, 4)
                .map((a) => (
                  <div key={a.id}>
                    <span>{a.data.formula}</span>
                    <strong>{a.data.total}</strong>
                    <small>{when(a.created_at).split(",").at(-1)}</small>
                  </div>
                ))}
            </div>
          </Section>
          <Section title="Handout screen">
            <label className="field">
              <span>Show an image</span>
              <SearchableSelect
                value={handout}
                onChange={(e) => setHandout(e.target.value)}
              >
                <option value="">Choose from Media</option>
                {ctx.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            <button
              className="button secondary full-button"
              disabled={!handout}
              onClick={() => {
                const channel = new BroadcastChannel("worldbuilder-handout");
                channel.postMessage({ asset: handout });
                channel.close();
                const opened = window.open(
                  "/#/handout/" + handout,
                  "worldbuilder-handout",
                );
                if (!opened)
                  ctx.notify(
                    "Allow this local app to open the handout window.",
                    true,
                  );
              }}
            >
              <ImageIcon size={16} />
              Open handout window
            </button>
            <button
              className="text-button"
              onClick={() => {
                const channel = new BroadcastChannel("worldbuilder-handout");
                channel.postMessage({ asset: null });
                channel.close();
              }}
            >
              Clear handout screen
            </button>
          </Section>
        </div>
        <div className="gm-center">
          <Section title="Reference library">
            <EntryPicker
              value={reference}
              onChange={setReference}
              entries={ctx.entries.filter((e) => e.id !== id)}
              label="Open an entry without leaving the table"
            />
            {full ? (
              <div className="gm-reference">
                <Badge>{full.template}</Badge>
                <h2>{full.title}</h2>
                <p>{full.summary}</p>
                <div
                  className="reader-prose"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(full.html || ""),
                  }}
                />
                {full.private_notes && (
                  <div className="gm-private">
                    <LockKeyhole size={15} />
                    <p>{full.private_notes}</p>
                  </div>
                )}
                <button
                  className="text-button"
                  onClick={() => ctx.go("entry/" + full.id)}
                >
                  Edit entry
                  <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              <Empty icon={FileText} title="Everything at your fingertips">
                Choose a plot, character, statblock or piece of lore to keep it
                close while you run your game.
              </Empty>
            )}
          </Section>
          <Section
            title="Session plans"
            action={
              <button
                className="text-button"
                onClick={() => ctx.create("session", campaign.id)}
              >
                <Plus size={15} />
                Session
              </button>
            }
          >
            {sessions.length ? (
              <div className="session-list">
                {sessions.map((s) => (
                  <button key={s.id} onClick={() => ctx.go("entry/" + s.id)}>
                    <span className="session-number">
                      {s.data.number || "•"}
                    </span>
                    <div>
                      <strong>{s.title}</strong>
                      <small>
                        {s.data.starts_at
                          ? when(s.data.starts_at)
                          : "Not scheduled yet"}
                      </small>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">
                Plan your next session, link its plot, and collect your notes.
              </p>
            )}
          </Section>
        </div>
        <div className="gm-side">
          <Section title="Quests">
            <div className="quest-list">
              {quests.map((q) => (
                <div key={q.id}>
                  <input
                    aria-label={"Complete quest " + q.title}
                    type="checkbox"
                    checked={q.data.progress === "done"}
                    onChange={async (e) => {
                      try {
                        await patch("/resources/" + q.id, {
                          data: {
                            ...q.data,
                            progress: e.target.checked ? "done" : "active",
                          },
                          expected_revision: q.revision,
                        });
                        await ctx.refresh();
                      } catch (error: any) {
                        ctx.notify(error.message, true);
                      }
                    }}
                  />
                  <button onClick={() => ctx.go("entry/" + q.id)}>
                    <strong
                      className={q.data.progress === "done" ? "done" : ""}
                    >
                      {q.title}
                    </strong>
                    <small>{q.data.priority || "normal"}</small>
                  </button>
                </div>
              ))}
            </div>
            <form
              className="inline-add"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!questName.trim()) return;
                try {
                  await post("/worlds/" + ctx.world.id + "/resources", {
                    kind: "quest",
                    title: questName,
                    data: {
                      campaign_id: campaign.id,
                      progress: "active",
                      priority: "normal",
                    },
                  });
                  setQuestName("");
                  await ctx.refresh();
                } catch (error: any) {
                  ctx.notify(error.message, true);
                }
              }}
            >
              <input
                aria-label="New quest title"
                value={questName}
                onChange={(e) => setQuestName(e.target.value)}
                placeholder="A new quest…"
              />
              <button className="icon-button" aria-label="Add quest">
                <Plus size={17} />
              </button>
            </form>
          </Section>
          <Section title="Shared equipment">
            <button
              className="button secondary small"
              onClick={() =>
                ctx.go(`campaign-continuity/${campaign.id}/inventory/all`)
              }
            >
              Equipment, loot & transfers
            </button>
            <div className="inventory-list">
              {ctx.entries
                .filter(
                  (e) =>
                    e.data.continuity_type === "item" &&
                    belongsToCampaign(e, campaign.id),
                )
                .map((e) => (
                  <article key={e.id} data-gm-equipment={e.id}>
                    <button
                      className="text-button"
                      onClick={() => ctx.go("entry/" + e.id)}
                    >
                      {e.title}
                    </button>
                    <p>
                      {(e.data.holdings || [])
                        .map(
                          (h: any) =>
                            `${h.holder_id === "party" ? "Party storage" : ctx.entries.find((r) => r.id === h.holder_id)?.title || "Unavailable holder"}: ${h.quantity}`,
                        )
                        .join(" · ")}
                    </p>
                  </article>
                ))}
            </div>
            <div className="inventory-list">
              {(campaign.data.inventory || []).map((item: any) => (
                <div key={item.id}>
                  <span>{item.name}</span>
                  <div>
                    <button
                      aria-label={"Remove one " + item.name}
                      onClick={() =>
                        updateCampaign({
                          ...campaign.data,
                          inventory: campaign.data.inventory.map((r: any) =>
                            r.id === item.id
                              ? { ...r, quantity: Math.max(0, r.quantity - 1) }
                              : r,
                          ),
                        })
                      }
                    >
                      −
                    </button>
                    <strong>{item.quantity}</strong>
                    <button
                      aria-label={"Add one " + item.name}
                      onClick={() =>
                        updateCampaign({
                          ...campaign.data,
                          inventory: campaign.data.inventory.map((r: any) =>
                            r.id === item.id
                              ? { ...r, quantity: r.quantity + 1 }
                              : r,
                          ),
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={"Delete " + item.name}
                    onClick={() =>
                      updateCampaign({
                        ...campaign.data,
                        inventory: campaign.data.inventory.filter(
                          (r: any) => r.id !== item.id,
                        ),
                      })
                    }
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <form
              className="inline-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (inventoryName.trim()) {
                  updateCampaign({
                    ...campaign.data,
                    inventory: [
                      ...(campaign.data.inventory || []),
                      { id: uid(), name: inventoryName.trim(), quantity: 1 },
                    ],
                  });
                  setInventoryName("");
                }
              }}
            >
              <input
                aria-label="Shared item name"
                value={inventoryName}
                onChange={(e) => setInventoryName(e.target.value)}
                placeholder="Add shared equipment…"
              />
              <button className="icon-button" aria-label="Add shared item">
                <Plus size={17} />
              </button>
            </form>
          </Section>
        </div>
      </div>
    </div>
  );
}
