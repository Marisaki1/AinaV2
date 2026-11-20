import React, { useEffect, useRef, useState } from "react";
import { AppContext, World, api, post } from "./domain";
import { ErrorBox } from "./ui";
import { SearchableSelect } from "./SearchableSelect";

type Options = {
  ids: string[];
  target: string;
  mode: string;
  descendants: boolean;
  key: string;
  pending: boolean;
};
export function TransferDesk({ ctx }: { ctx: AppContext }) {
  const storage = "worldbuilder.transfer-draft:" + ctx.world.id;
  const [options, setOptions] = useState<Options>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storage) || "null");
      if (saved && Array.isArray(saved.ids) && typeof saved.key === "string")
        return saved;
    } catch {}
    return {
      ids: [],
      target: "",
      mode: "copy",
      descendants: true,
      key: crypto.randomUUID(),
      pending: false,
    };
  });
  const [worlds, setWorlds] = useState<World[]>([]),
    [query, setQuery] = useState(""),
    [review, setReview] = useState<any>(null),
    [result, setResult] = useState<any>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ack, setAck] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(storage, JSON.stringify(options));
    } catch {}
  }, [options, storage]);
  useEffect(() => {
    let active = true;
    api<{ worlds: World[] }>("/worlds")
      .then((v) => {
        if (active) setWorlds(v.worlds.filter((w) => w.id !== ctx.world.id));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [ctx.world.id]);
  useEffect(() => {
    if (!options.pending || !options.target) return;
    let active = true;
    api<any>(
      `/worlds/${ctx.world.id}/transfer?target=${options.target}&key=${options.key}`,
    )
      .then((v) => {
        if (active && v.receipt) setResult({ ...v.receipt, reused: true });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [ctx.world.id, options.key]);
  const change = (patch: Partial<Options>) => {
    setOptions({
      ...options,
      ...patch,
      key: crypto.randomUUID(),
      pending: false,
    });
    setReview(null);
    setResult(null);
    setAck(false);
    setError("");
  };
  const run = async (fn: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const matches = ctx.entries.filter((e) =>
    `${e.title} ${e.summary} ${e.tags.join(" ")} ${e.kind}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const needsAck =
    !!review &&
    (review.literal_references.length ||
      review.incoming_references.length ||
      review.outside_relationships.length);
  return (
    <div className="page transfer-desk">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ORIGINAL CONTENT</span>
          <h1>Copy & move between worlds</h1>
          <p>Source: {ctx.world.name}</p>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="transfer-layout">
        <section className="transfer-selection">
          <fieldset disabled={busy || !!result}>
            <label className="field">
              <span>Destination world</span>
              <SearchableSelect
                value={options.target}
                onChange={(e) => change({ target: e.target.value })}
              >
                <option value="">Choose an owned world</option>
                {worlds.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            {!worlds.length && (
              <p>
                Create another world using the world menu before transferring.
              </p>
            )}
            <div className="button-row">
              {[
                ["copy", "Copy originals"],
                ["move", "Move originals"],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="transfer-mode"
                    value={value}
                    checked={options.mode === value}
                    onChange={() => change({ mode: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="transfer-check">
              <input
                type="checkbox"
                checked={options.descendants}
                onChange={(e) => change({ descendants: e.target.checked })}
              />
              Include selected entries’ descendants
            </label>
            <input
              aria-label="Filter transfer originals"
              placeholder="Find originals by title, tag or type"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="button-row">
              <strong>{options.ids.length}/100 selected</strong>
              <button
                className="text-button"
                onClick={() =>
                  change({
                    ids: [
                      ...new Set([...options.ids, ...matches.map((e) => e.id)]),
                    ].slice(0, 100),
                  })
                }
              >
                Select visible
              </button>
              <button
                className="text-button"
                onClick={() => change({ ids: [] })}
              >
                Clear selection
              </button>
            </div>
            <div className="transfer-originals">
              {matches.map((entry) => (
                <label key={entry.id}>
                  <input
                    type="checkbox"
                    aria-label={"Transfer " + entry.title}
                    checked={options.ids.includes(entry.id)}
                    disabled={
                      !options.ids.includes(entry.id) &&
                      options.ids.length >= 100
                    }
                    onChange={() =>
                      change({
                        ids: options.ids.includes(entry.id)
                          ? options.ids.filter((id) => id !== entry.id)
                          : [...options.ids, entry.id],
                      })
                    }
                  />
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{entry.kind}</small>
                  </span>
                </label>
              ))}
            </div>
            <button
              className="button primary"
              disabled={!options.target || !options.ids.length}
              onClick={() =>
                void run(async () => {
                  setReview(
                    await post(
                      `/worlds/${ctx.world.id}/transfer/preview`,
                      options,
                    ),
                  );
                  setAck(false);
                })
              }
            >
              {busy ? "Reviewing…" : "Review transfer"}
            </button>
          </fieldset>
        </section>
        <section className="transfer-review">
          {!review && !result && (
            <>
              <h2>Review before copying or moving</h2>
              <p>
                The preview lists descendants, referenced dependencies, media,
                naming collisions and references requiring manual attention. No
                entries move until you confirm.
              </p>
              <p>
                Copies start private with new IDs. Move retains selected source
                originals in Trash; supporting dependencies remain in their
                source world. World settings and general revision histories are
                not copied.
              </p>
            </>
          )}
          {review && !result && (
            <>
              <h2>
                {review.mode === "move" ? "Move" : "Copy"} to{" "}
                {review.target_name}
              </h2>
              <p>
                {review.records.length}{" "}
                {review.records.length === 1 ? "record" : "records"} ·{" "}
                {review.assets.length} media · {review.relationship_count}{" "}
                internal relationships
              </p>
              <div className="transfer-records">
                {review.records.map((entry: any) => (
                  <div key={entry.id}>
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.kind} · {entry.role}
                      {entry.trashed ? " · in Trash" : ""}
                      {entry.title_collision
                        ? " · same title exists; kept as a distinct original"
                        : ""}
                    </small>
                  </div>
                ))}
              </div>
              {review.assets.length > 0 && (
                <details>
                  <summary>Included media</summary>
                  {review.assets.map((a: any) => (
                    <p key={a.id}>
                      {a.name}
                      {a.destination_reuse
                        ? " → " +
                          a.destination_reuse.name +
                          " (existing media reused)"
                        : ""}
                      {a.credit ? " · Source credit: " + a.credit : ""}
                      {a.destination_reuse?.credit
                        ? " · Destination credit: " + a.destination_reuse.credit
                        : ""}
                    </p>
                  ))}
                </details>
              )}
              {review.incoming_references.length > 0 && (
                <details open>
                  <summary>
                    Source entries that will still reference moved originals
                  </summary>
                  {review.incoming_references.map((entry: any) => (
                    <p key={entry.id}>{entry.title}</p>
                  ))}
                </details>
              )}
              {review.outside_relationships.length > 0 && (
                <details>
                  <summary>
                    Relationships remaining in the source (
                    {review.outside_relationships.length})
                  </summary>
                  {review.outside_relationships.map((edge: any) => (
                    <p key={edge.id}>
                      {edge.label || "Relationship"} · {edge.source} →{" "}
                      {edge.target}
                    </p>
                  ))}
                </details>
              )}
              {review.literal_references.length > 0 && (
                <details open>
                  <summary>Literal references requiring manual review</summary>
                  {review.literal_references.map(
                    (entry: any, index: number) => (
                      <p key={index}>
                        <strong>{entry.path}</strong>: {entry.reason} (
                        {entry.id})
                      </p>
                    ),
                  )}
                </details>
              )}
              <p>{review.history_policy}</p>
              <p>{review.move_policy}</p>
              <p>{review.metadata_policy}</p>
              {needsAck && (
                <label className="transfer-check">
                  <input
                    type="checkbox"
                    aria-label="Acknowledge transfer references"
                    checked={ack}
                    disabled={busy}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  I reviewed the outside/literal references. Keep those source
                  references unchanged.
                </label>
              )}
              <button
                className="button primary"
                disabled={busy || (!!needsAck && !ack)}
                onClick={() =>
                  void run(async () => {
                    setOptions({ ...options, pending: true });
                    const receipt = await post(
                      `/worlds/${ctx.world.id}/transfer`,
                      {
                        ...options,
                        token: review.token,
                        acknowledge_references: ack,
                      },
                    );
                    setResult(receipt);
                    await ctx
                      .refresh()
                      .catch((e) =>
                        ctx.notify(
                          "Transfer saved; source list refresh failed: " +
                            e.message,
                          true,
                        ),
                      );
                  })
                }
              >
                {busy
                  ? "Transferring…"
                  : review.mode === "move"
                    ? "Confirm reviewed move"
                    : "Confirm reviewed copy"}
              </button>
            </>
          )}
          {result && (
            <>
              <h2>
                {result.reused ? "Saved transfer recovered" : "Transfer saved"}
              </h2>
              <p>
                {result.record_count}{" "}
                {result.record_count === 1 ? "record" : "records"} ·{" "}
                {result.asset_count} referenced media ·{" "}
                {result.relationship_count}{" "}
                {result.relationship_count === 1
                  ? "relationship"
                  : "relationships"}
              </p>
              <p>
                Destination entries are private. Copies have new IDs; original
                source IDs remain available. Selected moved sources are in Trash
                and retain their history. Restore parents before their children
                when recovering a moved subtree.
              </p>
              {result.mapping && (
                <details>
                  <summary>Original-to-destination ID map</summary>
                  <pre>{JSON.stringify(result.mapping, null, 2)}</pre>
                </details>
              )}
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => change({ ids: [] })}
              >
                Start another transfer
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
