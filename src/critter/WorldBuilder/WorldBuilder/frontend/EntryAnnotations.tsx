import React, { useEffect, useRef, useState } from "react";
import { AppContext, Entry, api, post, uid, text } from "./domain";
import { ErrorBox, Modal } from "./ui";
import {
  Check,
  LockKeyhole,
  MessageSquare,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";

type Draft = { key: string; title: string; text: string; quote: string };
type Notes = { notes: Entry[]; page: number; pages: number; total: number };
export function EntryAnnotations({
  ctx,
  entry,
  beforeChange,
}: {
  ctx: AppContext;
  entry: Entry;
  beforeChange: () => Promise<boolean>;
}) {
  const cache = `worldbuilder.research-draft:${ctx.world.id}:${entry.id}`;
  const blank = (): Draft => ({ key: uid(), title: "", text: "", quote: "" });
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      return { ...blank(), ...JSON.parse(localStorage.getItem(cache) || "{}") };
    } catch {
      return blank();
    }
  });
  const [open, setOpen] = useState(false),
    [notes, setNotes] = useState<Notes | null>(null),
    [page, setPage] = useState(0),
    [resolved, setResolved] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    locked = useRef(false);
  useEffect(() => {
    try {
      if (draft.title || draft.text || draft.quote)
        localStorage.setItem(cache, JSON.stringify(draft));
      else localStorage.removeItem(cache);
    } catch {}
  }, [cache, draft]);
  useEffect(() => {
    let alive = true;
    api<Notes>(
      `/resources/${entry.id}/annotations?resolved=${resolved ? 1 : 0}&page=${page}`,
    )
      .then((value) => {
        if (alive) {
          setNotes(value);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [entry.id, resolved, page, refresh]);
  const start = (clip = false) => {
    setError("");
    let quote = "";
    if (clip) {
      const selection = window.getSelection(),
        area = document.querySelector(
          ".entry-main .prose-editor, .entry-main .linked-reading-view",
        );
      if (
        selection?.anchorNode &&
        selection.focusNode &&
        area?.contains(selection.anchorNode) &&
        area.contains(selection.focusNode)
      )
        quote = selection.toString().slice(0, 2000);
      if (!quote.trim()) {
        setError("Select text in this entry before clipping it.");
        return;
      }
    }
    setDraft((previous) => ({
      ...previous,
      title: previous.title || ("Note on " + entry.title).slice(0, 180),
      quote: quote || previous.quote,
    }));
    setOpen(true);
  };
  const action = async (value: any) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await post(`/resources/${entry.id}/annotations`, value);
      setRefresh((n) => n + 1);
      await ctx.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="entry-research" aria-label="Private research notes">
      <div className="entry-context-heading">
        <h3>
          <MessageSquare size={14} />
          Research notes
        </h3>
        <div className="button-row">
          <button
            type="button"
            className="icon-button"
            aria-label="Clip selected text"
            title="Clip selected text"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => start(true)}
          >
            <Scissors size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Add private research note"
            title="Add research note"
            onClick={() => start()}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      <label className="entry-context-filter">
        <input
          type="checkbox"
          checked={resolved}
          onChange={(e) => {
            setResolved(e.target.checked);
            setPage(0);
          }}
        />
        Show resolved
      </label>
      {error && !open && (
        <>
          <ErrorBox message={error} />
          <button
            className="text-button"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Reload research notes
          </button>
        </>
      )}
      <div className="entry-research-list">
        {notes?.notes.map((note) => (
          <article
            key={note.id}
            className={
              note.data.annotation_status === "resolved" ? "resolved" : ""
            }
          >
            <strong>{note.title}</strong>
            <p>
              {text(note.document).replace(/\s+/g, " ").trim().slice(0, 210)}
            </p>
            <small>
              Source revision {note.data.annotation_source_revision}
            </small>
            <div className="button-row">
              <button
                type="button"
                className="text-button"
                onClick={() => ctx.go("entry/" + note.id)}
              >
                Edit note
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                aria-label={
                  (note.data.annotation_status === "resolved"
                    ? "Reopen "
                    : "Resolve ") + note.title
                }
                onClick={() =>
                  void action({
                    action: "status",
                    id: note.id,
                    expected_revision: note.revision,
                    status:
                      note.data.annotation_status === "resolved"
                        ? "open"
                        : "resolved",
                  })
                }
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                className="icon-button danger"
                disabled={busy}
                aria-label={"Trash research note " + note.title}
                onClick={() =>
                  void action({
                    action: "trash",
                    id: note.id,
                    expected_revision: note.revision,
                  })
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {notes?.total === 0 && (
        <p className="muted small-copy">No open research notes.</p>
      )}
      {notes && notes.pages > 1 && (
        <div className="button-row">
          <button
            className="text-button"
            disabled={!notes.page}
            onClick={() => setPage(notes.page - 1)}
          >
            Previous
          </button>
          <small>
            {notes.page + 1}/{notes.pages}
          </small>
          <button
            className="text-button"
            disabled={notes.page + 1 === notes.pages}
            onClick={() => setPage(notes.page + 1)}
          >
            Next
          </button>
        </div>
      )}
      {open && (
        <Modal
          title="Private research note"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p className="muted small-copy">
            <LockKeyhole size={13} />
            Linked to {entry.title}. Research notes remain private.
          </p>
          {error && <ErrorBox message={error} />}
          {error.includes("capture key") && (
            <button
              type="button"
              className="button secondary small"
              disabled={busy}
              onClick={() => {
                setDraft({ ...draft, key: uid() });
                setError("");
              }}
            >
              New capture from this draft
            </button>
          )}
          <label className="field">
            <span>Research title</span>
            <input
              autoFocus
              data-autofocus
              maxLength={180}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Source excerpt (optional)</span>
            <textarea
              aria-label="Source excerpt (optional)"
              maxLength={2000}
              value={draft.quote}
              onChange={(e) => setDraft({ ...draft, quote: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Research note</span>
            <textarea
              aria-label="Research note"
              rows={6}
              maxLength={20000}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
          </label>
          <div className="modal-actions">
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => {
                setDraft(blank());
                setOpen(false);
              }}
            >
              Discard draft
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Keep draft
            </button>
            <button
              className="button primary"
              disabled={busy || !draft.title.trim() || !draft.text.trim()}
              onClick={async () => {
                if (locked.current) return;
                locked.current = true;
                setBusy(true);
                setError("");
                try {
                  if (!(await beforeChange()))
                    throw Error(
                      "Save or recover the source entry first. This research draft is retained.",
                    );
                  const current = await api<Entry>(`/resources/${entry.id}`);
                  await post(`/resources/${entry.id}/annotations`, {
                    action: "create",
                    ...draft,
                    source_revision: current.revision,
                  });
                  try {
                    localStorage.removeItem(cache);
                  } catch {}
                  setDraft(blank());
                  setOpen(false);
                  setRefresh((n) => n + 1);
                  try {
                    await ctx.refresh();
                  } catch {
                    setError(
                      "Research note saved. Reload to refresh the list.",
                    );
                  }
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  locked.current = false;
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save research note"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
