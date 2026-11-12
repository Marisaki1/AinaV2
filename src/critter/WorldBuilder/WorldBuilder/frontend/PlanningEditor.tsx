import React, { useEffect, useState } from "react";
import {
  AppContext,
  Entry,
  docFromText,
  patch,
  post,
  saveBeforeNavigate,
} from "./domain";
import { EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { RelatedEntries, belongsToCampaign } from "./CampaignRecords";
import { SearchableSelect } from "./SearchableSelect";

export const planningTypes = [
  "adventure",
  "campaign-scene",
  "encounter",
  "handout",
];
export function PlanningEditor({
  ctx,
  campaign,
  entry,
  type,
  adventureId = "",
  onClose,
  onSaved,
}: {
  ctx: AppContext;
  campaign: Entry;
  entry?: Entry;
  type: string;
  adventureId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(entry?.title || ""),
    [body, setBody] = useState(""),
    [data, setData] = useState<Record<string, any>>(() =>
      structuredClone(
        entry?.data || {
          planning_type: type,
          campaign_id: campaign.id,
          related_entries: [],
          ...(["campaign-scene", "encounter"].includes(type) && adventureId
            ? { adventure_id: adventureId }
            : {}),
        },
      ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty =
    title !== (entry?.title || "") ||
    !!body ||
    JSON.stringify(data) !==
      JSON.stringify(
        entry?.data || {
          planning_type: type,
          campaign_id: campaign.id,
          related_entries: [],
          ...(["campaign-scene", "encounter"].includes(type) && adventureId
            ? { adventure_id: adventureId }
            : {}),
        },
      );
  const close = () =>
    !busy && (!dirty || confirm("Discard unsaved planning changes?"));
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
  const choices = ctx.entries.filter(
      (e) =>
        belongsToCampaign(e, campaign.id) &&
        ["campaign-scene", "encounter"].includes(e.data.planning_type) &&
        e.id !== entry?.id,
    ),
    map = ctx.entries.find((e) => e.id === data.map_id && e.kind === "map");
  const update = (key: string, value: any) =>
    setData({ ...data, [key]: value });
  return (
    <Modal
      title={(entry ? "Edit " : "New ") + type.replaceAll("-", " ")}
      wide
      onClose={() => {
        if (close()) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !title.trim()) return;
          setBusy(true);
          setError("");
          let saved = false;
          try {
            if (entry)
              await patch("/resources/" + entry.id, {
                title,
                data,
                expected_revision: entry.revision,
              });
            else
              await post(`/worlds/${ctx.world.id}/resources`, {
                kind: "article",
                template: type,
                title,
                document: docFromText(body),
                data,
                parent: campaign.id,
                visibility: "private",
              });
            saved = true;
            await onSaved();
            onClose();
          } catch (e: any) {
            if (saved) {
              onClose();
              ctx.notify(
                "Planning record saved, but refresh failed: " + e.message,
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
              The unsaved form is retained. Copy changes before reloading a
              newer version.
            </p>
          </>
        )}
        <fieldset className="session-guide-form-fields" disabled={busy}>
          <Field label="Planning title" value={title} onChange={setTitle} />
          {!entry && (
            <label className="field">
              <span>Initial planning notes</span>
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
          )}
          {entry && (
            <p className="muted small-copy">
              Original rich notes remain unchanged. Use the original editor to
              edit their contents.
            </p>
          )}
          {type !== "adventure" && type !== "handout" && (
            <EntryPicker
              label="Adventure group"
              value={data.adventure_id || ""}
              entries={ctx.entries.filter(
                (e) =>
                  belongsToCampaign(e, campaign.id) &&
                  e.data.planning_type === "adventure",
              )}
              onChange={(v) => update("adventure_id", v)}
            />
          )}
          {type !== "handout" && (
            <>
              <label className="field">
                <span>Player-visible summary</span>
                <textarea
                  rows={3}
                  value={data.public_summary || ""}
                  onChange={(e) => update("public_summary", e.target.value)}
                />
              </label>
              <div className="field-grid">
                <EntryPicker
                  label="Planning map"
                  value={data.map_id || ""}
                  entries={ctx.entries.filter((e) => e.kind === "map")}
                  onChange={(v) =>
                    setData({ ...data, map_id: v, marker_id: "" })
                  }
                />
                <label className="field">
                  <span>Planning map pin</span>
                  <SearchableSelect
                    disabled={!map}
                    value={data.marker_id || ""}
                    onChange={(e) => update("marker_id", e.target.value)}
                  >
                    <option value="">Whole map</option>
                    {data.marker_id &&
                      !map?.data.markers?.some(
                        (m: any) => m.id === data.marker_id,
                      ) && (
                        <option value={data.marker_id}>
                          Unavailable recorded pin
                        </option>
                      )}
                    {(map?.data.markers || []).map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.label || "Unnamed pin"}
                      </option>
                    ))}
                  </SearchableSelect>
                </label>
              </div>
              {[
                ["stakes", "Stakes (GM only)"],
                ["environment", "Environment (GM only)"],
                ["possible_outcomes", "Possible outcomes (GM only)"],
                ["branch_notes", "Preparation & branch notes (GM only)"],
              ].map(([key, label]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <textarea
                    rows={3}
                    value={data[key] || ""}
                    onChange={(e) => update(key, e.target.value)}
                  />
                </label>
              ))}
            </>
          )}
          {["campaign-scene", "encounter"].includes(type) && (
            <>
              <h3>Prerequisites</h3>
              <div className="checkbox-list">
                {choices.map((e) => (
                  <label key={e.id}>
                    <input
                      type="checkbox"
                      checked={(data.prerequisites || []).includes(e.id)}
                      onChange={(ev) =>
                        update(
                          "prerequisites",
                          ev.target.checked
                            ? [...(data.prerequisites || []), e.id]
                            : (data.prerequisites || []).filter(
                                (id: string) => id !== e.id,
                              ),
                        )
                      }
                    />
                    {e.title}
                  </label>
                ))}
              </div>
              <h3>Branching routes</h3>
              {(data.next_scenes || []).map((branch: any, index: number) => (
                <div className="planning-branch-edit" key={index}>
                  <EntryPicker
                    label={"Branch target " + (index + 1)}
                    value={branch.target_id}
                    entries={choices}
                    onChange={(v) =>
                      update(
                        "next_scenes",
                        data.next_scenes.map((b: any, i: number) =>
                          i === index ? { ...b, target_id: v } : b,
                        ),
                      )
                    }
                  />
                  <Field
                    label={"Branch label " + (index + 1)}
                    value={branch.label}
                    onChange={(v) =>
                      update(
                        "next_scenes",
                        data.next_scenes.map((b: any, i: number) =>
                          i === index ? { ...b, label: v } : b,
                        ),
                      )
                    }
                  />
                  <Field
                    label={"Branch condition (GM only) " + (index + 1)}
                    value={branch.condition}
                    onChange={(v) =>
                      update(
                        "next_scenes",
                        data.next_scenes.map((b: any, i: number) =>
                          i === index ? { ...b, condition: v } : b,
                        ),
                      )
                    }
                  />
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      update(
                        "next_scenes",
                        data.next_scenes.filter(
                          (_: any, i: number) => i !== index,
                        ),
                      )
                    }
                  >
                    Remove branch
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                disabled={
                  (data.next_scenes || []).length >= 40 || !choices.length
                }
                onClick={() =>
                  update("next_scenes", [
                    ...(data.next_scenes || []),
                    {
                      target_id: choices[0]?.id || "",
                      label: "Next route",
                      condition: "",
                    },
                  ])
                }
              >
                Add scene branch
              </button>
            </>
          )}
          {type === "handout" && (
            <>
              <label className="field">
                <span>Handout introduction</span>
                <textarea
                  rows={5}
                  value={data.handout_text || ""}
                  onChange={(e) => update("handout_text", e.target.value)}
                />
              </label>
              <h3>Published sources</h3>
              <p className="muted small-copy">
                Preview/export uses published versions and excludes GM
                fields/private blocks. Unpublished selections are omitted. This
                introduction and selected images are explicitly included.
              </p>
              <div className="checkbox-list">
                {ctx.entries
                  .filter((e) => e.id !== entry?.id && e.kind !== "folder")
                  .map((e) => (
                    <label key={e.id}>
                      <input
                        type="checkbox"
                        checked={(data.handout_sources || []).includes(e.id)}
                        onChange={(ev) =>
                          update(
                            "handout_sources",
                            ev.target.checked
                              ? [...(data.handout_sources || []), e.id]
                              : (data.handout_sources || []).filter(
                                  (id: string) => id !== e.id,
                                ),
                          )
                        }
                      />
                      {e.title}
                      {e.published_revision ? " · published" : " · unpublished"}
                    </label>
                  ))}
              </div>
              <h3>Selected images</h3>
              <div className="checkbox-list">
                {ctx.assets.map((a) => (
                  <label key={a.id}>
                    <input
                      type="checkbox"
                      checked={(data.handout_images || []).includes(a.id)}
                      onChange={(ev) =>
                        update(
                          "handout_images",
                          ev.target.checked
                            ? [...(data.handout_images || []), a.id]
                            : (data.handout_images || []).filter(
                                (id: string) => id !== a.id,
                              ),
                        )
                      }
                    />
                    {a.name}
                  </label>
                ))}
              </div>
            </>
          )}
          <RelatedEntries
            ctx={ctx}
            data={data}
            onData={setData}
            exclude={entry?.id || campaign.id}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={["open", "scheduled"].includes(data.follow_up_state)}
              onChange={(e) =>
                update("follow_up_state", e.target.checked ? "open" : "")
              }
            />{" "}
            Needs GM follow-up
          </label>
        </fieldset>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
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
              busy ||
              !title.trim() ||
              (data.next_scenes || []).some((b: any) => !b.target_id)
            }
          >
            Save planning record
          </button>
        </div>
      </form>
    </Modal>
  );
}
