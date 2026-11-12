import React from "react";
import { human, uid } from "./domain";
import { Field } from "./ui";
import { SearchableSelect } from "./SearchableSelect";

export function ThreadFields({
  data,
  onData,
}: {
  data: Record<string, any>;
  onData: (data: Record<string, any>) => void;
}) {
  const objectives: { id: string; text: string; done: boolean }[] =
    data.objectives || [];
  const update = (index: number, change: object) =>
    onData({
      ...data,
      objectives: objectives.map((v, i) =>
        i === index ? { ...v, ...change } : v,
      ),
    });
  return (
    <section className="thread-fields">
      <div className="field-grid">
        <Field
          label="Story arc"
          value={data.story_arc || ""}
          onChange={(v) => onData({ ...data, story_arc: v })}
        />
        <label className="field">
          <span>Thread progress</span>
          <SearchableSelect
            value={data.progress || "open"}
            onChange={(e) => onData({ ...data, progress: e.target.value })}
          >
            {["open", "active", "done", "failed"].map((v) => (
              <option key={v} value={v}>
                {human(v)}
              </option>
            ))}
          </SearchableSelect>
        </label>
      </div>
      <div className="section-heading">
        <h3>Objectives</h3>
        <button
          type="button"
          className="button secondary small"
          disabled={objectives.length >= 100}
          onClick={() =>
            onData({
              ...data,
              objectives: [
                ...objectives,
                { id: uid(), text: "New objective", done: false },
              ],
            })
          }
        >
          Add objective
        </button>
      </div>
      {objectives.map((item, index) => (
        <div className="thread-objective-edit" key={item.id}>
          <input
            type="checkbox"
            aria-label={"Complete objective " + (index + 1)}
            checked={item.done}
            onChange={(e) => update(index, { done: e.target.checked })}
          />
          <input
            aria-label={"Objective " + (index + 1)}
            value={item.text}
            onChange={(e) => update(index, { text: e.target.value })}
            maxLength={5000}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={"Move objective " + (index + 1) + " up"}
            disabled={!index}
            onClick={() => {
              const next = [...objectives];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              onData({ ...data, objectives: next });
            }}
          >
            ↑
          </button>
          <button
            type="button"
            className="text-button"
            aria-label={"Remove objective " + (index + 1)}
            onClick={() =>
              onData({
                ...data,
                objectives: objectives.filter((_, i) => i !== index),
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <label className="field">
        <span>Outcome & discoveries</span>
        <textarea
          rows={4}
          value={data.outcome || ""}
          onChange={(e) => onData({ ...data, outcome: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Next action (GM only)</span>
        <textarea
          rows={3}
          value={data.gm_next_step || ""}
          onChange={(e) => onData({ ...data, gm_next_step: e.target.value })}
        />
      </label>
      <p className="muted small-copy">
        Objectives and outcomes appear in reader versions only when published.
        Next action stays GM-only. Completing objectives does not automatically
        finish the thread.
      </p>
    </section>
  );
}
