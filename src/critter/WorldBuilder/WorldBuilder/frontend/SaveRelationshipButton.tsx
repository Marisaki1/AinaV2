import React, { useState } from "react";
import { Save } from "lucide-react";
import { AppContext, Entry, post } from "./domain";
import { ErrorBox, Field, Modal } from "./ui";

export function SaveRelationshipButton({
  ctx,
  config,
  disabled = false,
}: {
  ctx: AppContext;
  config: Record<string, any>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="button secondary small"
        disabled={disabled}
        onClick={() => {
          setName("Family view");
          setError("");
          setOpen(true);
        }}
      >
        <Save size={15} />
        Save family view
      </button>
      {open && (
        <Modal
          title="Save relationship view"
          onClose={() => !busy && setOpen(false)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                const entry = await post<Entry>(
                  "/worlds/" + ctx.world.id + "/resources",
                  { kind: "relationship", title: name, data: config },
                );
                await ctx.refresh();
                setOpen(false);
                ctx.go("entry/" + entry.id);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Relationship view name"
              value={name}
              onChange={setName}
            />
            <p className="muted small-copy">
              Saves the filters as a private entry. The graph follows changes to
              its source entries and connections.
            </p>
            {error && <ErrorBox message={error} />}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || !name.trim()}
              >
                {busy ? "Saving…" : "Save view"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
