import React from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { uid } from "./domain";
import { Field } from "./ui";
import { SearchableSelect } from "./SearchableSelect";

export function DayPeriodPicker({
  calendar,
  value,
  onChange,
  label = "Day belongs to",
  monthly = false,
}: {
  calendar?: Record<string, any>;
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  monthly?: boolean;
}) {
  const rows: any[] = calendar?.special_days || [];
  if (!rows.length && !value) return null;
  return (
    <label className="field">
      <span>{label}</span>
      <SearchableSelect
        value={value || ""}
        onChange={(e) => {
          if (e.target.value !== (value || "")) onChange(e.target.value);
        }}
      >
        <option value="">Ordinary month</option>
        {value && !rows.some((r) => r.id === value) && (
          <option value={value}>Unavailable special-day period</option>
        )}
        {rows.map((row) => (
          <option key={row.id} value={row.id} disabled={monthly}>
            {row.name}
          </option>
        ))}
      </SearchableSelect>
      {monthly && (
        <small>Monthly repeats require an ordinary month date.</small>
      )}
    </label>
  );
}

export function SpecialDaysEditor({
  data,
  onData,
  months,
}: {
  data: Record<string, any>;
  onData: (value: Record<string, any>) => void;
  months: any[];
}) {
  const rows: any[] = data.special_days || [];
  const update = (id: string, patch: any) =>
    onData({
      ...data,
      special_days: rows.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  const move = (index: number, direction: number) => {
    const same = rows
      .map((r, i) => ({ r, i }))
      .filter(
        (v) =>
          (v.r.after_month ?? months.length) ===
          (rows[index].after_month ?? months.length),
      )
      .map((v) => v.i);
    const target = same[same.indexOf(index) + direction];
    if (target == null) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onData({ ...data, special_days: next });
  };
  return (
    <section className="special-days-editor">
      <div className="section-heading">
        <h3>Special days outside months</h3>
        <button
          className="text-button"
          disabled={rows.length >= 24}
          onClick={() =>
            onData({
              ...data,
              special_days: [
                ...rows,
                {
                  id: uid(),
                  name: "New special days",
                  after_month: months.length,
                  days: 1,
                  outside_week: true,
                  interval: 1,
                  offset: 0,
                  except_every: 0,
                  except_unless: 0,
                },
              ],
            })
          }
        >
          <Plus size={15} />
          Add special days
        </button>
      </div>
      <p className="muted small-copy">
        These named periods sit between months. Their stable IDs keep event
        links intact. Outside-week days still advance time and moon phases,
        while the weekday cycle pauses. Periodic rules use the same
        offset/exception logic as leap rules.
      </p>
      {rows.map((row, index) => {
        const same = rows
            .map((r, i) => ({ r, i }))
            .filter(
              (v) =>
                (v.r.after_month ?? months.length) ===
                (row.after_month ?? months.length),
            )
            .map((v) => v.i),
          position = same.indexOf(index);
        return (
          <fieldset className="calendar-rule" key={row.id}>
            <legend>Special period {index + 1}</legend>
            <Field
              label={`Special period ${index + 1} name`}
              value={row.name}
              onChange={(value) => update(row.id, { name: value })}
            />
            <label className="field">
              <span>Insert special days</span>
              <SearchableSelect
                value={row.after_month ?? months.length}
                onChange={(e) =>
                  update(row.id, { after_month: Number(e.target.value) })
                }
              >
                <option value={0}>Before the first month</option>
                {months.map((month, i) => (
                  <option key={i} value={i + 1}>
                    After {month.name}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            <div className="field-grid">
              <Field
                label="Special-day count"
                type="number"
                min={1}
                max={20}
                value={row.days ?? 1}
                onChange={(value) => update(row.id, { days: value })}
              />
              <Field
                label="Occurs every years"
                type="number"
                min={1}
                max={10000}
                value={row.interval ?? 1}
                onChange={(value) => update(row.id, { interval: value })}
              />
              <Field
                label="Special year offset"
                type="number"
                min={-1000000000}
                max={1000000000}
                value={row.offset || 0}
                onChange={(value) => update(row.id, { offset: value })}
              />
              <Field
                label="Skip special days every years"
                type="number"
                min={0}
                max={10000}
                value={row.except_every || 0}
                onChange={(value) => update(row.id, { except_every: value })}
              />
              <Field
                label="Restore special days every years"
                type="number"
                min={0}
                max={10000}
                value={row.except_unless || 0}
                onChange={(value) => update(row.id, { except_unless: value })}
              />
            </div>
            <label className="historical-checkbox">
              <input
                type="checkbox"
                checked={row.outside_week !== false}
                onChange={(e) =>
                  update(row.id, { outside_week: e.target.checked })
                }
              />
              Outside the weekday cycle
            </label>
            <div className="button-row">
              <button
                className="icon-button"
                aria-label={`Move special period ${index + 1} earlier`}
                disabled={position === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={`Move special period ${index + 1} later`}
                disabled={position === same.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                className="text-button danger"
                onClick={() =>
                  onData({
                    ...data,
                    special_days: rows.filter((r) => r.id !== row.id),
                  })
                }
              >
                <Trash2 size={14} />
                Remove special period {index + 1}
              </button>
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}
