import { DayPeriodPicker } from "./SpecialDays";
import { SearchableSelect } from "./SearchableSelect";
import { RecurrenceEditor } from "./Recurrence";
import React from "react";
import { AppContext } from "./domain";
import { EntryPicker, Field } from "./ui";

export function HistoricalDetails({
  data,
  onData,
  ctx,
  era = false,
  id,
}: {
  data: Record<string, any>;
  onData: (data: Record<string, any>) => void;
  ctx: AppContext;
  era?: boolean;
  id?: string;
}) {
  const update = (key: string, value: any) => onData({ ...data, [key]: value });
  const hasEnd =
    data.end_year !== undefined &&
    data.end_year !== null &&
    data.end_year !== "";
  const precision = data.date_precision || "day",
    endPrecision = data.end_precision || precision;
  const calendar = ctx.entries.find((e) => e.id === data.calendar_id)?.data;
  const mapData = ctx.entries.find((e) => e.id === data.map_id)?.data;
  const locations = new Map<string, any>();
  for (const scene of [
    mapData,
    ...(mapData?.versions || []).map((v: any) => v.scene),
  ])
    for (const marker of scene?.markers || [])
      if (!locations.has(marker.id)) locations.set(marker.id, marker);
  const precisionField = (end = false) => (
    <label className="field">
      <span>{end ? "End date precision" : "Date precision"}</span>
      <SearchableSelect
        disabled={
          !!data.recurrence ||
          !!(end ? data.end_special_day_id : data.special_day_id)
        }
        value={end ? endPrecision : precision}
        onChange={(e) =>
          update(end ? "end_precision" : "date_precision", e.target.value)
        }
      >
        <option value="day">Day known</option>
        <option value="month">Month known</option>
        <option value="year">Year known</option>
      </SearchableSelect>
    </label>
  );
  return (
    <>
      <p className="muted small-copy">
        {era
          ? "An era is an independent period with an optional end. Overlapping eras can describe different histories."
          : "Keep the precision of your source. A month or year is shown as a possible date interval."}{" "}
        “Circa” marks an estimate without assuming a numeric margin of error.
      </p>
      <div className="field-grid three">
        {precisionField()}
        <Field
          label="Year"
          type="number"
          min={-1000000000}
          max={1000000000}
          value={data.year ?? 1}
          onChange={(v) => update("year", v)}
        />
        <DayPeriodPicker
          calendar={calendar}
          value={data.special_day_id}
          monthly={data.recurrence?.frequency === "monthly"}
          label="Start date period"
          onChange={(value) =>
            onData({
              ...data,
              special_day_id: value,
              day: 1,
              ...(value ? { date_precision: "day" } : {}),
            })
          }
        />
        {precision !== "year" && !data.special_day_id && (
          <Field
            label="Month"
            type="number"
            min={1}
            max={60}
            value={data.month ?? 1}
            onChange={(v) => update("month", v)}
          />
        )}
        {precision === "day" && (
          <Field
            label="Day"
            type="number"
            min={1}
            max={2000}
            value={data.day ?? 1}
            onChange={(v) => update("day", v)}
          />
        )}
        <label className="historical-checkbox">
          <input
            type="checkbox"
            disabled={!!data.recurrence}
            checked={!!data.date_approximate}
            onChange={(e) => update("date_approximate", e.target.checked)}
          />
          Approximate start (circa)
        </label>
        <EntryPicker
          label="Calendar"
          value={data.calendar_id || ""}
          onChange={(v) => {
            if (v === (data.calendar_id || "")) return;
            onData({
              ...data,
              calendar_id: v,
              special_day_id: "",
              end_special_day_id: "",
              ...(era ? {} : { era_id: "" }),
            });
          }}
          entries={ctx.entries.filter((e) => e.kind === "calendar")}
          empty="Recorded year / month / day"
        />
        <label className="field">
          <span>End year (optional)</span>
          <input
            aria-label="End year (optional)"
            type="number"
            min={-1000000000}
            max={1000000000}
            value={data.end_year ?? ""}
            onChange={(e) => {
              if (e.target.value === "") {
                const {
                  end_year,
                  end_month,
                  end_day,
                  end_precision,
                  end_approximate,
                  end_special_day_id,
                  ...rest
                } = data;
                onData(rest);
              } else update("end_year", Number(e.target.value));
            }}
          />
        </label>
        {hasEnd && (
          <>
            {precisionField(true)}
            <DayPeriodPicker
              calendar={calendar}
              value={data.end_special_day_id}
              label="End date period"
              onChange={(value) =>
                onData({
                  ...data,
                  end_special_day_id: value,
                  end_day: 1,
                  ...(value ? { end_precision: "day" } : {}),
                })
              }
            />
            {endPrecision !== "year" && !data.end_special_day_id && (
              <Field
                label="End month"
                type="number"
                min={1}
                max={60}
                value={data.end_month ?? data.month ?? 1}
                onChange={(v) => update("end_month", v)}
              />
            )}
            {endPrecision === "day" && (
              <Field
                label="End day"
                type="number"
                min={1}
                max={2000}
                value={data.end_day ?? data.day ?? 1}
                onChange={(v) => update("end_day", v)}
              />
            )}
            <label className="historical-checkbox">
              <input
                type="checkbox"
                disabled={!!data.recurrence}
                checked={!!data.end_approximate}
                onChange={(e) => update("end_approximate", e.target.checked)}
              />
              Approximate end (circa)
            </label>
          </>
        )}
        {!era && (
          <>
            <EntryPicker
              label="Linked era"
              value={data.era_id || ""}
              onChange={(v) => update("era_id", v)}
              entries={ctx.entries.filter(
                (e) =>
                  e.kind === "era" &&
                  (e.data.calendar_id || "") === (data.calendar_id || ""),
              )}
              empty="No linked era"
            />
            <Field
              label="Era / period label (optional)"
              value={data.era || ""}
              onChange={(v) => update("era", v)}
            />
            <Field
              label="Timeline lane"
              type="number"
              min={-1000}
              max={1000}
              value={data.lane ?? 0}
              onChange={(v) => update("lane", v)}
            />
            <EntryPicker
              label="Event map"
              value={data.map_id || ""}
              onChange={(v) => onData({ ...data, map_id: v, marker_id: "" })}
              entries={ctx.entries.filter((e) => e.kind === "map")}
            />
            <label className="field">
              <span>Map location</span>
              <SearchableSelect
                value={data.marker_id || ""}
                onChange={(e) => update("marker_id", e.target.value)}
              >
                <option value="">No marker</option>
                {data.marker_id && !locations.has(data.marker_id) && (
                  <option value={data.marker_id}>
                    Unavailable map location
                  </option>
                )}
                {[...locations.values()].map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.label || m.type}
                  </option>
                ))}
              </SearchableSelect>
            </label>
          </>
        )}
      </div>
      {!era && <RecurrenceEditor data={data} onData={onData} id={id} />}
    </>
  );
}
