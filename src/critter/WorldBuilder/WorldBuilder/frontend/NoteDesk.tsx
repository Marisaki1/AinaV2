import React, { useEffect, useState } from "react";
import { AppContext, post, saveBeforeNavigate } from "./domain";
import { CaptureForm } from "./NotebookForms";

export function NoteDesk({ ctx }: { ctx: AppContext }) {
  const [open, setOpen] = useState(false);
  const [capture, setCapture] = useState(false);
  const start = async () => {
    if (saveBeforeNavigate.current && !(await saveBeforeNavigate.current()))
      return;
    setCapture(true);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!document.querySelector('[role="dialog"]')) void start();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  const notes = ctx.entries
    .filter((e) => ["note", "task"].includes(e.kind))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 12);
  return (
    <div className="note-desk">
      <button
        className="button secondary small"
        aria-label="Quick note from anywhere"
        onClick={() => void start()}
      >
        Quick note
      </button>
      <button
        className="text-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Recent notes
      </button>
      {open && (
        <aside className="note-desk-recent" aria-label="Recent notes">
          <div className="section-heading">
            <strong>Recently edited notes</strong>
            <button className="text-button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {notes.length ? (
            notes.map((n) => (
              <button
                key={n.id}
                className="backlink"
                onClick={() => {
                  ctx.go("entry/" + n.id);
                  setOpen(false);
                }}
              >
                {n.title}
              </button>
            ))
          ) : (
            <p>No notes yet.</p>
          )}
          <button
            className="text-button"
            onClick={() => {
              ctx.go("notebooks");
              setOpen(false);
            }}
          >
            Open notebooks
          </button>
        </aside>
      )}
      {capture && (
        <CaptureForm
          ctx={ctx}
          sectionId=""
          templates={ctx.entries.filter(
            (e) => e.data.notebook_type === "template",
          )}
          onClose={() => setCapture(false)}
          onCreated={(entry) => {
            void ctx
              .refresh()
              .then(() => ctx.go("entry/" + entry.id))
              .catch(() => ctx.go("entry/" + entry.id));
          }}
          onSave={(value) => post(`/worlds/${ctx.world.id}/notebooks`, value)}
        />
      )}
    </div>
  );
}
