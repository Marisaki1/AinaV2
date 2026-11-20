import React, { useEffect, useState } from "react";
import { AppContext, api, post, saveBeforeNavigate } from "./domain";
import { ErrorBox } from "./ui";
import { SearchableSelect } from "./SearchableSelect";

export function ChecklistDesk({ ctx }: { ctx: AppContext }) {
  const [query, setQuery] = useState(""),
    [state, setState] = useState("open"),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [reload, setReload] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(
      () =>
        api(
          `/worlds/${ctx.world.id}/checklists?${new URLSearchParams({ q: query, state, offset: String(offset) })}`,
        )
          .then((v) => {
            if (active) {
              setData(v);
              setError("");
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      150,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ctx.world.id, query, state, offset, reload, ctx.entries]);
  return (
    <section aria-label="Checklist desk">
      <div className="section-heading">
        <h2>Checklists across your notes</h2>
        <button className="text-button" onClick={() => setReload((n) => n + 1)}>
          Refresh tasks
        </button>
      </div>
      <div className="field-grid">
        <label>
          Find a task or note
          <input
            aria-label="Find a task or note"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Completion
          <SearchableSelect
            aria-label="Checklist completion filter"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setOffset(0);
            }}
          >
            <option value="open">Open</option>
            <option value="complete">Complete</option>
            <option value="all">All</option>
          </SearchableSelect>
        </label>
      </div>
      {error && <ErrorBox message={error} />}
      <p role="status">
        {loading
          ? "Updating tasks…"
          : `${data?.completed || 0}/${data?.all_count || 0} complete · ${data?.total || 0} matching items`}
      </p>
      <div className="checklist-desk-items">
        {data?.tasks.map((task: any) => (
          <article key={task.entry_id + ":" + task.path.join(".")}>
            <label>
              <input
                type="checkbox"
                aria-label={"Complete " + task.text}
                checked={task.checked}
                disabled={!!busy || loading}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  if (
                    saveBeforeNavigate.current &&
                    !(await saveBeforeNavigate.current())
                  )
                    return;
                  setBusy(task.entry_id);
                  setError("");
                  const previous = data;
                  setData((current: any) => ({
                    ...current,
                    tasks: current.tasks.map((item: any) =>
                      item === task ? { ...item, checked } : item,
                    ),
                  }));
                  try {
                    await post(`/worlds/${ctx.world.id}/checklists`, {
                      entry_id: task.entry_id,
                      path: task.path,
                      checked,
                      expected_revision: task.revision,
                    });
                    await ctx.refresh();
                    setReload((n) => n + 1);
                  } catch (e: any) {
                    setData(previous);
                    setError(e.message);
                  } finally {
                    setBusy("");
                  }
                }}
              />
              <span>{task.text || "Untitled checklist item"}</span>
            </label>
            <button
              className="text-button"
              onClick={() => ctx.go("entry/" + task.entry_id)}
            >
              Open {task.title}
            </button>
          </article>
        ))}
      </div>
      {!loading && !data?.total && (
        <p>
          No matching checklist items. Add a Checklist inside any entry to see
          its items here.
        </p>
      )}
      <div className="button-row">
        <button
          className="text-button"
          disabled={!offset || loading}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          Previous task page
        </button>
        <button
          className="text-button"
          disabled={!data?.has_more || loading}
          onClick={() => setOffset(offset + 100)}
        >
          Next task page
        </button>
      </div>
    </section>
  );
}
