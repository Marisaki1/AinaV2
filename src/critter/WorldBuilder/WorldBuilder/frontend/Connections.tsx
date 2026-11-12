import React, { useState } from "react";
import { Edit3, History, RotateCcw, Trash2 } from "lucide-react";
import { AppContext, Edge, api, human, post } from "./domain";
import { EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";

const kinds = [
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
];
export function ConnectionFields({
  data,
  onChange,
  ctx,
}: {
  data: any;
  onChange: (data: any) => void;
  ctx: AppContext;
}) {
  const update = (key: string, value: any) =>
    onChange({ ...data, [key]: value });
  return (
    <>
      <EntryPicker
        label="From"
        value={data.source}
        onChange={(v) => update("source", v)}
        entries={ctx.entries}
      />
      <EntryPicker
        label="To"
        value={data.target}
        onChange={(v) => update("target", v)}
        entries={ctx.entries.filter((e) => e.id !== data.source)}
      />
      <div className="field-grid">
        <label className="field">
          <span>Relationship</span>
          <SearchableSelect
            value={data.kind}
            onChange={(e) => update("kind", e.target.value)}
          >
            {!kinds.includes(data.kind) && (
              <option value={data.kind}>{human(data.kind)}</option>
            )}
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {human(kind)}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <Field
          label="Label (optional)"
          value={data.label}
          onChange={(v) => update("label", v)}
        />
      </div>
      <Field
        label="Directional strength (-100 to 100)"
        type="number"
        min={-100}
        max={100}
        value={data.strength}
        onChange={(v) => update("strength", v)}
      />
      <label className="field">
        <span>Relationship notes</span>
        <textarea
          value={data.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </label>
      <label className="field">
        <span>Connection visibility</span>
        <SearchableSelect
          value={data.visibility || "private"}
          onChange={(e) => update("visibility", e.target.value)}
        >
          <option value="private">GM only</option>
          <option value="public">Include in reader view</option>
        </SearchableSelect>
      </label>
      <p className="muted small-copy">
        Parent links point from parent to child. Strength is directional. Reader
        visibility updates immediately; both endpoints still need saved reader
        versions. Notes and connection history stay private.
      </p>
    </>
  );
}

export function ConnectionManager({
  ctx,
  initialEdges,
}: {
  ctx: AppContext;
  initialEdges?: Edge[];
}) {
  const [query, setQuery] = useState(""),
    [removed, setRemoved] = useState<Edge[] | null>(null),
    [form, setForm] = useState<any>(null),
    [history, setHistory] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const name = (id: string) =>
    ctx.entries.find((e) => e.id === id)?.title || "Unavailable entry";
  const refresh = async () => {
    await ctx.refresh();
    if (removed !== null) {
      const value = await api(`/worlds/${ctx.world.id}/connections?trash=1`);
      setRemoved(value.connections);
    }
  };
  const loadHistory = async (edge: Edge) => {
    setError("");
    try {
      const value = await api(`/connections/${edge.id}/revisions`);
      setHistory({ edge, ...value });
    } catch (e: any) {
      setError(e.message);
    }
  };
  const restore = async (edge: Edge, number?: number) => {
    if (
      !confirm(
        number
          ? "Restore this connection revision as a new version?"
          : "Restore this removed connection?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await post(`/connections/${edge.id}/restore`, {
        expected_revision:
          history?.edge.id === edge.id ? history.revision : edge.revision,
        ...(number != null ? { number } : {}),
      });
      setHistory(null);
      await refresh();
      ctx.notify("Connection restored with its original identity.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const values = (removed ?? initialEdges ?? ctx.edges).filter((e) =>
    [name(e.source), name(e.target), e.label, e.kind, e.notes].some((value) =>
      value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ),
  );
  return (
    <section className="connection-manager">
      <div className="section-heading">
        <h3>{removed === null ? "Connections" : "Removed connections"}</h3>
        <button
          className="button secondary small"
          onClick={async () => {
            setError("");
            if (removed !== null) setRemoved(null);
            else
              try {
                const value = await api(
                  `/worlds/${ctx.world.id}/connections?trash=1`,
                );
                setRemoved(value.connections);
              } catch (e: any) {
                setError(e.message);
              }
          }}
        >
          {removed === null ? "Removed connections" : "Active connections"}
        </button>
      </div>
      <Field
        label="Search connections"
        value={query}
        onChange={setQuery}
        placeholder="Names, types, labels or owner notes"
      />
      {error && <ErrorBox message={error} />}
      <div className="connection-edit-list">
        {values.map((edge) => (
          <div key={edge.id} data-connection-id={edge.id}>
            <div>
              <strong>
                {name(edge.source)} → {name(edge.target)}
              </strong>
              <p>
                {edge.label || human(edge.kind)} · {edge.strength} ·{" "}
                {edge.visibility === "public" ? "Reader visible" : "GM only"} ·
                revision {edge.revision}
              </p>
            </div>
            <div className="button-row">
              {removed === null ? (
                <>
                  <button
                    className="button secondary small"
                    aria-label={"Edit connection " + edge.id}
                    onClick={() => {
                      setError("");
                      setForm({ ...edge });
                    }}
                  >
                    <Edit3 size={14} />
                    Edit
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Remove connection " + edge.id}
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !confirm(
                          "Move this connection to Removed connections? Its history will be kept.",
                        )
                      )
                        return;
                      setBusy(true);
                      setError("");
                      try {
                        await api(`/connections/${edge.id}`, {
                          method: "DELETE",
                          body: JSON.stringify({
                            expected_revision: edge.revision,
                          }),
                        });
                        await refresh();
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              ) : (
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => restore(edge)}
                >
                  <RotateCcw size={14} />
                  Restore
                </button>
              )}
              <button
                className="button secondary small"
                aria-label={"Connection history " + edge.id}
                onClick={() => loadHistory(edge)}
              >
                <History size={14} />
                History
              </button>
            </div>
          </div>
        ))}
      </div>
      {!values.length && <p className="muted">No matching connections.</p>}
      {form && (
        <Modal
          title="Edit connection"
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <ConnectionFields data={form} onChange={setForm} ctx={ctx} />
          {error && <ErrorBox message={error} />}
          <p className="muted small-copy">
            Saving retains this connection's ID and records a new revision.
            Another tab's edits will require a reload.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setForm(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy || !form.source || !form.target}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api(`/connections/${form.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      expected_revision: form.revision,
                      ...Object.fromEntries(
                        [
                          "source",
                          "target",
                          "kind",
                          "label",
                          "strength",
                          "notes",
                          "visibility",
                        ].map((key) => [key, form[key]]),
                      ),
                    }),
                  });
                  setForm(null);
                  await refresh();
                  ctx.notify("Connection saved.");
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save connection
            </button>
          </div>
          {error && (
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                try {
                  const current = await api(`/connections/${form.id}`);
                  setForm(current);
                  setError("");
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Reload current connection
            </button>
          )}
        </Modal>
      )}
      {history && (
        <Modal
          title="Connection history"
          wide
          onClose={() => {
            if (!busy) setHistory(null);
          }}
        >
          <p>
            Current revision {history.revision}. Restoring keeps this link's ID
            and creates a new revision.
          </p>
          {error && <ErrorBox message={error} />}
          <div className="connection-history-list">
            {history.revisions.map((row: any) => (
              <details
                key={row.number}
                open={row.number === history.revisions[0].number}
              >
                <summary>
                  Revision {row.number} · {human(row.action)} ·{" "}
                  {new Date(row.created_at).toLocaleString()}
                </summary>
                <dl>
                  <dt>Endpoints</dt>
                  <dd>
                    {name(row.snapshot.source)} → {name(row.snapshot.target)}
                  </dd>
                  <dt>Type / label</dt>
                  <dd>
                    {human(row.snapshot.kind)} /{" "}
                    {row.snapshot.label || "No label"}
                  </dd>
                  <dt>Directional strength</dt>
                  <dd>{row.snapshot.strength}</dd>
                  <dt>Visibility / state</dt>
                  <dd>
                    {row.snapshot.visibility} /{" "}
                    {row.snapshot.deleted ? "Removed" : "Active"}
                  </dd>
                  <dt>Owner notes</dt>
                  <dd className="connection-history-notes">
                    {row.snapshot.notes || "No notes"}
                  </dd>
                </dl>
                {!row.snapshot.deleted && (
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => restore(history.edge, row.number)}
                  >
                    <RotateCcw size={14} />
                    Restore revision {row.number}
                  </button>
                )}
              </details>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
