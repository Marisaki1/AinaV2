import React, { useEffect, useState } from "react";
import {
  AppContext,
  Entry,
  docFromText,
  post,
  saveBeforeNavigate,
} from "./domain";
import { EntryPicker, ErrorBox, Field, Modal } from "./ui";
import { SearchableSelect } from "./SearchableSelect";
import { RelatedEntries, belongsToCampaign } from "./CampaignRecords";
import { useCaptureRecovery } from "./CaptureRecovery";

export function CampaignCapture({
  ctx,
  campaign,
  sessionId = "",
  threadId = "",
  sceneId = "",
  onClose,
  onSaved,
}: {
  ctx: AppContext;
  campaign: Entry;
  sessionId?: string;
  threadId?: string;
  sceneId?: string;
  onClose: () => void;
  onSaved: (entry: Entry, pin: boolean) => Promise<void>;
}) {
  const now = new Date(),
    today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [kind, setKind] = useState("note"),
    [session, setSession] = useState(sessionId),
    [thread, setThread] = useState(threadId),
    [scene, setScene] = useState(sceneId),
    [followUp, setFollowUp] = useState(false),
    [day, setDay] = useState(today),
    [worldDay, setWorldDay] = useState(""),
    [tags, setTags] = useState(""),
    [pin, setPin] = useState(false),
    [data, setData] = useState<Record<string, any>>(() => {
      const scene = ctx.entries.find((e) => e.id === sceneId),
        map = ctx.entries.find(
          (e) => e.id === scene?.data.map_id && e.kind === "map",
        );
      return {
        related_entries: [
          ...new Set([
            ...(sceneId ? [sceneId] : []),
            ...(scene?.data.related_entries || []),
          ]),
        ].filter((id) => ctx.entries.some((e) => e.id === id)),
        ...(map
          ? {
              map_id: map.id,
              marker_id: map.data.markers?.some(
                (m: any) => m.id === scene?.data.marker_id,
              )
                ? scene?.data.marker_id
                : "",
            }
          : {}),
      };
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = !!(
    title ||
    body ||
    worldDay ||
    tags ||
    (data.related_entries || []).length
  );
  const recovery = useCaptureRecovery(
    `worldbuilder.campaign-capture:${ctx.world.id}:${campaign.id}`,
    {
      title,
      body,
      kind,
      session,
      thread,
      scene,
      followUp,
      day,
      worldDay,
      tags,
      pin,
      data,
    },
    !!(title || body),
    (v) => {
      setTitle(v.title || "");
      setBody(v.body || "");
      setKind(v.kind || "note");
      setSession(v.session || "");
      setThread(v.thread || "");
      setScene(v.scene || "");
      setFollowUp(!!v.followUp);
      setDay(v.day || today);
      setWorldDay(v.worldDay || "");
      setTags(v.tags || "");
      setPin(!!v.pin);
      setData(v.data || {});
    },
  );
  const close = () =>
    !busy && (!dirty || confirm("Discard this unsaved campaign record?"));
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
  const map = ctx.entries.find((e) => e.id === data.map_id && e.kind === "map");
  return (
    <Modal
      title="Quick campaign capture"
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
            const record = await post<Entry>(
              `/worlds/${ctx.world.id}/resources`,
              {
                title: title.trim(),
                kind: ["quest", "task"].includes(kind) ? kind : "note",
                summary: body.slice(0, 240),
                document: docFromText(body),
                visibility: "private",
                parent: campaign.id,
                tags: tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                data: {
                  ...data,
                  campaign_id: campaign.id,
                  session_id: session,
                  thread_id: thread,
                  scene_id: scene,
                  follow_up_state: followUp ? "open" : "",
                  related_entries: [
                    ...new Set([
                      ...(data.related_entries || []),
                      ...(thread ? [thread] : []),
                    ]),
                  ],
                  ...(["quest", "task"].includes(kind)
                    ? { progress: "open" }
                    : {
                        record_type: kind,
                        logged_on: day,
                        world_day: worldDay,
                      }),
                },
              },
            );
            saved = true;
            recovery.clear();
            await onSaved(record, pin);
            onClose();
          } catch (e: any) {
            if (saved) {
              onClose();
              ctx.notify(
                "Record saved. A follow-up action could not finish: " +
                  e.message,
                true,
              );
            } else setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {recovery.controls}
        {error && <ErrorBox message={error} />}
        <fieldset disabled={busy} className="session-guide-form-fields">
          <Field label="Capture title" value={title} onChange={setTitle} />
          <label className="field">
            <span>Capture type</span>
            <SearchableSelect
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {[
                ["note", "Note"],
                ["journal", "Daily journal"],
                ["milestone", "Milestone"],
                ["task", "Task"],
                ["quest", "Quest / story thread"],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </SearchableSelect>
          </label>
          <label className="field">
            <span>Capture notes</span>
            <textarea
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <div className="field-grid">
            <EntryPicker
              label="Capture session"
              value={session}
              onChange={setSession}
              entries={ctx.entries.filter(
                (e) =>
                  e.kind === "session" && belongsToCampaign(e, campaign.id),
              )}
            />
            <EntryPicker
              label="Related quest or task"
              value={thread}
              onChange={setThread}
              entries={ctx.entries.filter(
                (e) =>
                  ["quest", "task"].includes(e.kind) &&
                  belongsToCampaign(e, campaign.id),
              )}
            />
          </div>
          {!["quest", "task"].includes(kind) && (
            <div className="field-grid">
              <Field
                label="Record date"
                type="date"
                value={day}
                onChange={setDay}
              />
              <Field
                label="In-world day / chapter"
                value={worldDay}
                onChange={setWorldDay}
              />
            </div>
          )}
          <Field
            label="Capture tags (comma separated)"
            value={tags}
            onChange={setTags}
          />
          <EntryPicker
            label="Capture scene"
            value={scene}
            entries={ctx.entries.filter(
              (e) =>
                ["campaign-scene", "encounter"].includes(
                  e.data.planning_type,
                ) && belongsToCampaign(e, campaign.id),
            )}
            onChange={(id) => {
              const previous = ctx.entries.find((e) => e.id === scene),
                next = ctx.entries.find((e) => e.id === id),
                nextMap = ctx.entries.find(
                  (e) => e.kind === "map" && e.id === next?.data.map_id,
                );
              setScene(id);
              setData((current) => ({
                ...current,
                related_entries: [
                  ...new Set([
                    ...(current.related_entries || []).filter(
                      (ref: string) => ref !== scene,
                    ),
                    ...(id ? [id] : []),
                    ...(next?.data.related_entries || []),
                  ]),
                ].filter((ref) => ctx.entries.some((e) => e.id === ref)),
                ...(!current.map_id || current.map_id === previous?.data.map_id
                  ? {
                      map_id: nextMap?.id || "",
                      marker_id: nextMap?.data.markers?.some(
                        (m: any) => m.id === next?.data.marker_id,
                      )
                        ? next?.data.marker_id
                        : "",
                    }
                  : {}),
              }));
            }}
          />
          <div className="field-grid">
            <EntryPicker
              label="Capture map"
              value={data.map_id || ""}
              onChange={(v) => setData({ ...data, map_id: v, marker_id: "" })}
              entries={ctx.entries.filter((e) => e.kind === "map")}
            />
            <label className="field">
              <span>Capture map pin</span>
              <SearchableSelect
                disabled={!map}
                value={data.marker_id || ""}
                onChange={(e) =>
                  setData({ ...data, marker_id: e.target.value })
                }
              >
                <option value="">Whole map</option>
                {(map?.data.markers || []).map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.label || "Unnamed pin"}
                  </option>
                ))}
              </SearchableSelect>
            </label>
          </div>
          <RelatedEntries
            ctx={ctx}
            data={data}
            onData={setData}
            exclude={campaign.id}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={followUp}
              onChange={(e) => setFollowUp(e.target.checked)}
            />{" "}
            Needs follow-up
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={pin}
              onChange={(e) => setPin(e.target.checked)}
            />{" "}
            Pin the saved record to the current desk layout
          </label>
          <p className="muted small-copy">
            Saved privately as an original record in {campaign.title}.
            Publication remains separate.
          </p>
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
          <button className="button primary" disabled={busy || !title.trim()}>
            {busy ? "Saving…" : "Save capture"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
