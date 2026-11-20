import React, { useRef, useState } from "react";
import { AppContext, Entry, patch, post, uid } from "./domain";
import { FloorSelect } from "./FloorScope";
import { ErrorBox, Field, Modal } from "./ui";

type Objective = { id: string; text: string; done: boolean };

export function QuestDraft({
  ctx,
  campaign,
  floors,
  initialFloor,
  initialSession,
  quest,
  onClose,
  onSaved,
}: {
  ctx: AppContext;
  campaign: Entry;
  floors: Entry[];
  initialFloor?: string;
  initialSession?: string;
  quest?: Entry;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const existingObjectives: Objective[] = quest?.data.objectives || [];
  const [title, setTitle] = useState(quest?.title || "");
  const [giver, setGiver] = useState(quest?.data.quest_giver || "");
  const [reward, setReward] = useState(quest?.data.quest_reward || "");
  const [floor, setFloor] = useState(
    quest ? quest.parent || "" : initialFloor || "",
  );
  const [objectives, setObjectives] = useState(
    existingObjectives.map((item) => item.text).join("\n"),
  );
  const [notes, setNotes] = useState(quest?.private_notes || "");
  const [notice, setNotice] = useState(quest?.data.player_notice || "");
  const [showNotice, setShowNotice] = useState(!!notice.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const selectableFloor = floors.some((entry) => entry.id === floor)
    ? floor
    : "unassigned";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || !title.trim()) return;
    const lines = objectives
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 100 || lines.some((line) => line.length > 5000)) {
      setError(
        "Use up to 100 objectives with at most 5,000 characters per line.",
      );
      return;
    }
    const remaining = [...existingObjectives];
    const nextObjectives = lines.map((text) => {
      const index = remaining.findIndex((item) => item.text === text);
      return index < 0
        ? { id: uid(), text, done: false }
        : remaining.splice(index, 1)[0];
    });
    saving.current = true;
    setBusy(true);
    setError("");
    const payload = {
      title: title.trim(),
      parent: floor || campaign.id,
      private_notes: notes,
      data: {
        progress: "open",
        ...(initialSession && !quest ? { session_id: initialSession } : {}),
        ...quest?.data,
        campaign_id: campaign.id,
        objectives: nextObjectives,
        quest_giver: giver.trim(),
        quest_reward: reward.trim(),
        player_notice: showNotice ? notice.trim() : "",
      },
    };
    try {
      if (quest) {
        await patch("/resources/" + quest.id, {
          ...payload,
          expected_revision: quest.revision,
        });
      } else {
        await post("/worlds/" + ctx.world.id + "/resources", {
          ...payload,
          kind: "quest",
          visibility: "private",
        });
      }
    } catch (failure: any) {
      setError(failure.message);
      setBusy(false);
      saving.current = false;
      return;
    }
    try {
      await ctx.refresh();
      onSaved?.();
      ctx.notify(quest ? "Quest updated." : "Private quest saved.");
    } catch {
      ctx.notify("Quest saved. Reload to see the latest board.", true);
    } finally {
      onClose();
    }
  }

  return (
    <Modal
      title={quest ? "Edit quest" : "Add quest"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        {error && <ErrorBox message={error} />}
        <fieldset disabled={busy} className="quest-draft-fields">
          <Field label="Quest title" value={title} onChange={setTitle} />
          {floors.length > 0 && (
            <FloorSelect
              floors={floors}
              selection={selectableFloor}
              allowAll={false}
              select={(value) => setFloor(value === "unassigned" ? "" : value)}
            />
          )}
          <div className="quest-draft-pair">
            <Field label="Offered by" value={giver} onChange={setGiver} />
            <Field label="Reward" value={reward} onChange={setReward} />
          </div>
          <label className="field">
            <span>Objectives (one per line)</span>
            <textarea
              rows={3}
              value={objectives}
              onChange={(event) => setObjectives(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Private GM notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={showNotice}
              onChange={(event) => setShowNotice(event.target.checked)}
            />
            Draft a player notice
          </label>
          {showNotice && (
            <label className="field">
              <span>Player notice (copyable text)</span>
              <textarea
                rows={4}
                maxLength={10000}
                value={notice}
                onChange={(event) => setNotice(event.target.value)}
              />
            </label>
          )}
        </fieldset>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy || !title.trim()}>
            {busy ? "Saving…" : quest ? "Save quest" : "Save private quest"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function QuestNotice({ ctx, quest }: { ctx: AppContext; quest: Entry }) {
  const notice =
    typeof quest.data.player_notice === "string"
      ? quest.data.player_notice
      : "";
  return notice.trim() ? (
    <details className="quest-notice">
      <summary>Player notice</summary>
      <p>{notice}</p>
      <button
        className="button secondary small"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(notice);
            ctx.notify("Player notice copied.");
          } catch {
            ctx.notify(
              "Clipboard unavailable. Select and copy the notice text.",
              true,
            );
          }
        }}
      >
        Copy player notice
      </button>
    </details>
  ) : null;
}
