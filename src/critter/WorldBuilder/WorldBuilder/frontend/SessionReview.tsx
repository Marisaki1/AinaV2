import React, { useEffect, useState } from "react";
import {
  AppContext,
  Entry,
  api,
  patch,
  post,
  saveBeforeNavigate,
} from "./domain";
import { EntryPicker, ErrorBox, Field } from "./ui";
import { AgendaItem } from "./AgendaPanel";

export function SessionReview({
  ctx,
  session,
  sessions,
  records,
  followups,
  onSaved,
}: {
  ctx: AppContext;
  session: Entry;
  sessions: Entry[];
  records: Entry[];
  followups: Entry[];
  onSaved: () => Promise<void>;
}) {
  const [base, setBase] = useState(session),
    [text, setText] = useState(session.data.recap || ""),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const candidates = records.filter(
      (e) => e.kind === "note" && e.data.session_id === session.id,
    ),
    dirty = text !== (base.data.recap || "");
  useEffect(() => {
    if (!dirty && session.revision > base.revision) {
      setBase(session);
      setText(session.data.recap || "");
    }
  }, [session.revision, dirty]);
  useEffect(() => {
    const previous = saveBeforeNavigate.current,
      guard = async () =>
        !busy && (!dirty || confirm("Leave this unsaved recap draft?"));
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
    <section className="session-review">
      <h2>Review {session.title}</h2>
      <p className="notice">
        This is an editable private draft. Review the selected events before
        publishing a reader version; no publication happens here.
      </p>
      {error && <ErrorBox message={error} />}
      <h3>Assemble selected event notes</h3>
      <div className="checkbox-list">
        {candidates.map((e) => (
          <label key={e.id}>
            <input
              type="checkbox"
              checked={selected.includes(e.id)}
              onChange={(ev) =>
                setSelected(
                  ev.target.checked
                    ? [...selected, e.id]
                    : selected.filter((id) => id !== e.id),
                )
              }
            />
            {e.title}
          </label>
        ))}
      </div>
      <button
        className="button secondary"
        disabled={busy || !selected.length}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await post<{ text: string }>(
              `/resources/${session.id}/recap-draft`,
              { ids: selected },
            );
            setText([text, result.text].filter(Boolean).join("\n\n"));
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Append selected notes to recap
      </button>
      <label className="field">
        <span>Editable session recap</span>
        <textarea
          rows={12}
          disabled={busy}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="button-row">
        <button
          className="button primary"
          disabled={busy || !dirty}
          onClick={async () => {
            setBusy(true);
            setError("");
            let saved = false;
            try {
              const result = await patch<Entry>("/resources/" + base.id, {
                data: { ...base.data, recap: text },
                expected_revision: base.revision,
              });
              saved = true;
              setBase(result);
              await onSaved();
            } catch (e: any) {
              if (saved)
                ctx.notify(
                  "Recap saved, but refresh failed: " + e.message,
                  true,
                );
              else setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save recap draft
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            if (
              dirty &&
              !confirm("Discard this draft and reload the saved recap?")
            )
              return;
            try {
              const latest = await api<Entry>("/resources/" + session.id);
              setBase(latest);
              setText(latest.data.recap || "");
              setError("");
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          Reload saved recap
        </button>
      </div>
      <button
        className="button secondary"
        onClick={() =>
          ctx.go(
            `campaign-continuity/${session.data.campaign_id || session.parent}/wrapup/${session.id}`,
          )
        }
      >
        Review loot, progression & consequences
      </button>
      <HandoffPanel
        ctx={ctx}
        source={session}
        sessions={sessions}
        followups={followups}
        disabled={dirty || busy}
        onSaved={onSaved}
      />
    </section>
  );
}

function HandoffPanel({
  ctx,
  source,
  sessions,
  followups,
  disabled,
  onSaved,
}: {
  ctx: AppContext;
  source: Entry;
  sessions: Entry[];
  followups: Entry[];
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const agenda: AgendaItem[] = source.data.agenda || [],
    candidates = agenda.filter((v) => v.state !== "completed");
  const [target, setTarget] = useState(""),
    [title, setTitle] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [followIds, setFollowIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState("");
  const targetEntry = sessions.find((e) => e.id === target);
  return (
    <section className="handoff-panel panel">
      <h2>Prepare the next session</h2>
      <p>
        Carry selected unfinished references forward. Earlier agenda states and
        original notes remain intact.
      </p>
      {disabled && (
        <p className="muted">
          Save or discard the recap draft before handing off.
        </p>
      )}
      {error && <ErrorBox message={error} />}
      <EntryPicker
        label="Handoff target session"
        value={target}
        entries={sessions.filter((e) => e.id !== source.id)}
        onChange={(v) => {
          setTarget(v);
          setResult("");
        }}
      />
      {!target && (
        <Field
          label="New session title"
          value={title}
          onChange={(v) => {
            setTitle(v);
            setResult("");
          }}
        />
      )}
      <h3>Unfinished agenda items</h3>
      <div className="checkbox-list">
        {candidates.map((v) => (
          <label key={v.entry_id}>
            <input
              type="checkbox"
              disabled={disabled || busy}
              checked={ids.includes(v.entry_id)}
              onChange={(e) => {
                setIds(
                  e.target.checked
                    ? [...ids, v.entry_id]
                    : ids.filter((id) => id !== v.entry_id),
                );
                setResult("");
              }}
            />
            {ctx.entries.find((e) => e.id === v.entry_id)?.title ||
              "Unavailable reference"}{" "}
            · {v.state}
          </label>
        ))}
      </div>
      <h3>Follow-ups to schedule</h3>
      <div className="checkbox-list">
        {followups.map((v) => (
          <label key={v.id}>
            <input
              type="checkbox"
              disabled={disabled || busy}
              checked={followIds.includes(v.id)}
              onChange={(e) => {
                setFollowIds(
                  e.target.checked
                    ? [...followIds, v.id]
                    : followIds.filter((id) => id !== v.id),
                );
                setResult("");
              }}
            />
            {v.title}
          </label>
        ))}
      </div>
      <button
        className="button primary"
        disabled={disabled || busy || !!result}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const value = await post<{ target_id: string }>(
              `/resources/${source.id}/handoff`,
              {
                expected_revision: source.revision,
                target_id: target,
                target_revision: targetEntry?.revision,
                title,
                entry_ids: ids,
                followup_ids: followIds,
              },
            );
            setResult(value.target_id);
            await onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Prepare next session
      </button>
      {result && (
        <p>
          <button
            className="button secondary"
            onClick={() =>
              ctx.go(
                `campaign-flow/${source.data.campaign_id || source.parent}/agenda/${result}`,
              )
            }
          >
            Open prepared session agenda
          </button>
        </p>
      )}
    </section>
  );
}
