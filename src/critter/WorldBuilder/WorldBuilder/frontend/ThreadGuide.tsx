import { QuestNotice } from "./QuestDraft";
import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { AppContext, Entry, api, patch, saveBeforeNavigate } from "./domain";
import { Badge, ErrorBox, Modal } from "./ui";
import { CampaignRecordDetails } from "./CampaignRecords";
import { ThreadFields } from "./ThreadFields";
import { CampaignCapture } from "./CampaignCapture";
import { guideRoute, pinCampaignReference } from "./CampaignWorkbench";

type ThreadData = {
  thread: Entry;
  campaign: Entry | null;
  records: Entry[];
  record_total: number;
  related: Entry[];
};
const prose = (html = "") => (
  <div
    className="reader-prose"
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
  />
);
export function ThreadGuide({
  ctx,
  id,
  reader = false,
}: {
  ctx: AppContext;
  id: string;
  reader?: boolean;
}) {
  const [payload, setPayload] = useState<{
      token: string;
      scope: string;
      value: ThreadData;
    } | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<Entry | null>(null),
    [capture, setCapture] = useState(false),
    [nonce, setNonce] = useState(0);
  const scope = JSON.stringify([ctx.world.id, id, reader]),
    token = JSON.stringify([
      scope,
      nonce,
      ctx.entries.map((e) => [
        e.id,
        e.revision,
        e.published_revision,
        e.visibility,
      ]),
    ]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<ThreadData>(
      `/resources/${id}/thread-guide${reader ? "?audience=reader" : ""}`,
    )
      .then((value) => {
        if (alive) setPayload({ scope, token, value });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  const value =
    payload?.scope === scope && (!reader || payload.token === token)
      ? payload.value
      : null;
  if (!value)
    return (
      <>
        {error ? (
          <ErrorBox message={error} />
        ) : (
          <p role="status">Opening thread guide…</p>
        )}
      </>
    );
  const thread = value.thread,
    objectives: { id: string; text: string; done: boolean }[] =
      thread.data.objectives || [];
  return (
    <section className="thread-guide">
      <header className="workbench-heading">
        <div>
          <p className="eyebrow">
            {value.campaign?.title || "World thread"} · {thread.kind}
          </p>
          <h1>{thread.title}</h1>
          <Badge>{thread.data.progress || "open"}</Badge>
          {thread.data.story_arc && <p>{thread.data.story_arc}</p>}
        </div>
        {!reader && (
          <div className="button-row">
            <button
              className="button primary"
              onClick={() => setEditing(thread)}
            >
              Edit objectives & outcome
            </button>
            {value.campaign && (
              <>
                <button
                  className="button secondary"
                  onClick={() => setCapture(true)}
                >
                  Record thread update
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    ctx.go(`campaign-desk/${value.campaign!.id}/threads`)
                  }
                >
                  Open story board
                </button>
              </>
            )}
            <button
              className="text-button"
              onClick={() => ctx.go("entry/" + id)}
            >
              Edit original thread
            </button>
          </div>
        )}
      </header>
      {error && <ErrorBox message={error} />}
      <div className="thread-guide-grid">
        <section className="panel">
          <h2>Thread notes</h2>
          {thread.summary && <p>{thread.summary}</p>}
          {prose(thread.html)}
          {!reader && thread.private_notes && (
            <details>
              <summary>GM notes</summary>
              <p className="campaign-record-excerpt">{thread.private_notes}</p>
            </details>
          )}
          {!reader && thread.kind === "quest" && <QuestNotice ctx={ctx} quest={thread} />}
          <h2>Connected lore</h2>
          {value.related.map((e) =>
            reader ? (
              <p key={e.id}>{e.title}</p>
            ) : (
              <button
                className="button secondary small"
                key={e.id}
                onClick={() => ctx.go(guideRoute(e, value.campaign?.id))}
              >
                {e.title}
              </button>
            ),
          )}
        </section>
        <section className="panel">
          <h2>
            Objectives · {objectives.filter((v) => v.done).length}/
            {objectives.length}
          </h2>
          {objectives.map((v) => (
            <div className="thread-objective-read" key={v.id}>
              <span aria-label={v.done ? "Complete" : "Incomplete"}>
                {v.done ? "✓" : "○"}
              </span>
              <p>{v.text}</p>
            </div>
          ))}
          {!objectives.length && (
            <p className="muted">No objectives recorded yet.</p>
          )}
          <h2>Outcome & discoveries</h2>
          {thread.workbench_sections?.outcome ? (
            prose(thread.workbench_sections.outcome)
          ) : (
            <p>No outcome recorded yet.</p>
          )}
          {!reader && (
            <>
              <h2>Next action (GM only)</h2>
              {thread.workbench_sections?.gm_next_step ? (
                prose(thread.workbench_sections.gm_next_step)
              ) : (
                <p>No next action recorded.</p>
              )}
            </>
          )}
        </section>
      </div>
      <section>
        <h2>Linked updates & session reports</h2>
        <div className="workbench-notebook">
          {value.records.map((e) => (
            <article
              className="workbench-record"
              key={e.id}
              data-thread-update={e.id}
            >
              <h3>{e.title}</h3>
              <p className="muted small-copy">
                {e.data.world_day || e.data.logged_on || ""}
              </p>
              {prose(e.html)}
              {Object.entries(e.workbench_sections || {}).map(([key, html]) => (
                <details key={key} open={["recap", "rewards"].includes(key)}>
                  <summary>{key.replaceAll("_", " ")}</summary>
                  {prose(html)}
                </details>
              ))}
              {!reader && (
                <button
                  className="text-button"
                  onClick={() => ctx.go(guideRoute(e, value.campaign?.id))}
                >
                  Open original update
                </button>
              )}
            </article>
          ))}
        </div>
        {!value.records.length && (
          <p className="muted">No linked updates yet.</p>
        )}
        {value.record_total > 100 && (
          <p className="muted">
            Showing the latest 100 of {value.record_total} updates. Search the
            campaign notebook for earlier records.
          </p>
        )}
      </section>
      {editing && (
        <ThreadEditor
          ctx={ctx}
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await ctx.refresh();
            setNonce((v) => v + 1);
          }}
        />
      )}
      {!reader && capture && value.campaign && (
        <CampaignCapture
          ctx={ctx}
          campaign={ctx.entries.find((e) => e.id === value.campaign!.id)!}
          sessionId={thread.data.session_id || ""}
          threadId={id}
          onClose={() => setCapture(false)}
          onSaved={async (entry, shouldPin) => {
            if (shouldPin)
              await pinCampaignReference(ctx, value.campaign!.id, entry.id);
            await ctx.refresh();
            setNonce((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}

function ThreadEditor({
  ctx,
  entry,
  onClose,
  onSaved,
}: {
  ctx: AppContext;
  entry: Entry;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [data, setData] = useState(structuredClone(entry.data)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = JSON.stringify(data) !== JSON.stringify(entry.data),
    close = () =>
      !busy && (!dirty || confirm("Discard unsaved thread changes?"));
  useEffect(() => {
    const previous = saveBeforeNavigate.current,
      guard = async () => close();
    saveBeforeNavigate.current = guard;
    const before = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      if (saveBeforeNavigate.current === guard)
        saveBeforeNavigate.current = previous;
      window.removeEventListener("beforeunload", before);
    };
  }, [dirty, busy]);
  return (
    <Modal
      title="Edit thread objectives & outcome"
      wide
      onClose={() => {
        if (close()) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          let saved = false;
          try {
            await patch("/resources/" + entry.id, {
              data,
              expected_revision: entry.revision,
            });
            saved = true;
            await onSaved();
            onClose();
          } catch (e: any) {
            if (saved) {
              onClose();
              ctx.notify(
                "Thread saved, but refresh failed: " + e.message,
                true,
              );
            } else setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && (
          <>
            <ErrorBox message={error} />
            <p className="muted small-copy">
              Your draft is retained. Close and reopen after reloading to edit a
              newer revision.
            </p>
          </>
        )}
        <fieldset className="session-guide-form-fields" disabled={busy}>
          <ThreadFields data={data} onData={setData} />
          <CampaignRecordDetails
            entry={entry}
            data={data}
            onData={setData}
            ctx={ctx}
            hideThreadFields
          />
        </fieldset>
        <div className="modal-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              if (close()) onClose();
            }}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={
              busy || (data.objectives || []).some((v: any) => !v.text.trim())
            }
          >
            Save thread changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
