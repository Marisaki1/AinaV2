import { SpecialDaysEditor } from "./SpecialDays";
import { SearchableSelect } from "./SearchableSelect";
import React, { useEffect, useRef, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import {
  api,
  AppContext,
  Entry,
  post,
  saveBeforeNavigate,
  uid,
} from "./domain";
import { ErrorBox, Field } from "./ui";

const defaultMonths = [
  "First Moon",
  "Second Moon",
  "Third Moon",
  "Fourth Moon",
].map((name) => ({ name, days: 30 }));
const defaultWeekdays = [
  "Firstday",
  "Seconday",
  "Thirday",
  "Fourthday",
  "Fifthday",
  "Sixthday",
  "Seventhday",
];
const phases = ["●", "◔", "◐", "◕", "○", "◕", "◑", "◔"];
const rulesFor = (data: Record<string, any>) =>
  data.leap_rules ??
  (data.leap_every
    ? [
        {
          id: "legacy-leap",
          name: "Leap day",
          interval: data.leap_every,
          offset: 0,
          month: data.leap_month || (data.months || defaultMonths).length,
          days: 1,
          except_every: 0,
          except_unless: 0,
        },
      ]
    : []);
const moonsFor = (data: Record<string, any>) =>
  data.moons ?? [
    {
      id: "legacy-moon",
      name: "Moon",
      period: data.moon_cycle || 28,
      offset: 0,
    },
  ];

export function ImportCalendarButton({ ctx }: { ctx: AppContext }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="calendar-import">
      <input
        hidden
        ref={file}
        type="file"
        accept=".json,application/json"
        aria-label="Calendar definition file"
        onChange={async (e) => {
          const selected = e.target.files?.[0];
          e.target.value = "";
          if (!selected) return;
          setBusy(true);
          setError("");
          try {
            if (selected.size > 100000)
              throw new Error(
                "Choose a calendar definition smaller than 100 KB.",
              );
            if (
              saveBeforeNavigate.current &&
              !(await saveBeforeNavigate.current())
            )
              throw new Error("Save or recover your edits before importing.");
            const entry = await post(
              `/worlds/${ctx.world.id}/calendars/import`,
              { definition: JSON.parse(await selected.text()) },
            );
            await ctx.refresh();
            ctx.go("entry/" + entry.id);
            ctx.notify("Calendar imported as a new private entry.");
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        className="button secondary small"
        disabled={busy}
        onClick={() => file.current?.click()}
      >
        <Upload size={14} />
        Import calendar JSON
      </button>
      {error && <ErrorBox message={error} />}
    </div>
  );
}

export function CalendarExport({
  id,
  reader = false,
}: {
  id: string;
  reader?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <button
        className="button secondary small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            if (
              saveBeforeNavigate.current &&
              !(await saveBeforeNavigate.current())
            )
              throw new Error("Save or recover your edits before exporting.");
            const response = await fetch(
              `/api/resources/${id}/calendar-export${reader ? "?audience=reader" : ""}`,
              { credentials: "same-origin" },
            );
            if (!response.ok)
              throw new Error(
                (await response.json()).error || "Calendar export failed.",
              );
            const url = URL.createObjectURL(await response.blob()),
              link = document.createElement("a");
            link.href = url;
            link.download =
              "WorldBuilder-calendar-" +
              id +
              (reader ? "-reader" : "") +
              ".json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={14} />
        Export calendar JSON
      </button>
      {error && <ErrorBox message={error} />}
    </div>
  );
}

export function CalendarPreview({
  data,
  calendarId,
  reader = false,
  ctx,
}: {
  data: Record<string, any>;
  calendarId?: string;
  reader?: boolean;
  ctx?: AppContext;
}) {
  const [year, setYear] = useState(1),
    [month, setMonth] = useState(1),
    [special, setSpecial] = useState(""),
    [day, setDay] = useState(1);
  const [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(""),
    [ordinal, setOrdinal] = useState(0),
    [conversionError, setConversionError] = useState("");
  const token = JSON.stringify([data, year, month, special]);
  const latest = useRef(token);
  latest.current = token;
  const months = data.months || defaultMonths;
  useEffect(() => {
    let active = true;
    setPreview(null);
    setError("");
    const timer = setTimeout(
      () =>
        post("/tools/calendar", {
          calendar: data,
          year,
          month: Math.min(month, months.length),
          special_day_id: special || undefined,
          include_month: true,
        })
          .then((value) => {
            if (active) {
              setPreview({ ...value, token });
              setDay((d) => Math.min(d, value.days.length));
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token]);
  const [festivals, setFestivals] = useState<any>(null),
    [festivalError, setFestivalError] = useState("");
  const festivalToken = JSON.stringify([
    calendarId,
    reader,
    data,
    year,
    ctx?.entries.map((e) => [
      e.id,
      e.revision,
      e.visibility,
      e.published_revision,
    ]),
  ]);
  useEffect(() => {
    let alive = true;
    setFestivals(null);
    setFestivalError("");
    if (!calendarId) return;
    const timer = setTimeout(
      () =>
        api(
          `/resources/${calendarId}/occurrences?from_year=${year}&to_year=${year}${reader ? "&audience=reader" : ""}`,
        )
          .then((value) => {
            if (alive) setFestivals({ token: festivalToken, value });
          })
          .catch((e) => {
            if (alive) setFestivalError(e.message);
          }),
      300,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [festivalToken]);
  const calendarEvents =
    festivals?.token === festivalToken ? festivals.value.events : [];
  const current = preview?.token === token ? preview : null;
  const selected = current?.days[day - 1];
  return (
    <div className="calendar-preview">
      <div className="field-grid">
        <Field
          label="Preview year"
          type="number"
          min={-1000000000}
          max={1000000000}
          value={year}
          onChange={setYear}
        />
        <label className="field">
          <span>Preview month</span>
          <SearchableSelect
            value={
              special ? "special:" + special : Math.min(month, months.length)
            }
            onChange={(e) => {
              if (e.target.value.startsWith("special:"))
                setSpecial(e.target.value.slice(8));
              else {
                setSpecial("");
                setMonth(Number(e.target.value));
              }
              setDay(1);
            }}
          >
            {months.map((m: any, i: number) => (
              <option key={i} value={i + 1}>
                {m.name}
              </option>
            ))}
            {!!data.special_days?.length && (
              <optgroup label="Special days outside months">
                {data.special_days.map((row: any) => (
                  <option key={row.id} value={"special:" + row.id}>
                    {row.name}
                  </option>
                ))}
              </optgroup>
            )}
          </SearchableSelect>
        </label>
      </div>
      {error && <ErrorBox message={error} />}
      {current && (
        <>
          <h3>
            {current.month_name} <span className="muted">{year}</span>
          </h3>
          <div className="calendar-scroll">
            <div
              className="calendar-grid"
              style={{
                gridTemplateColumns: `repeat(${current.outside_week ? Math.min(current.days.length, 7) : current.weekdays.length}, minmax(42px, 1fr))`,
              }}
            >
              {!current.outside_week &&
                current.weekdays.map((name: string, i: number) => (
                  <strong title={name} key={"w" + i}>
                    {name.slice(0, 3)}
                  </strong>
                ))}
              {Array.from({ length: current.first_weekday || 0 }, (_, i) => (
                <span key={"p" + i} />
              ))}
              {current.days.map((d: any) => (
                <button
                  key={d.day}
                  className={day === d.day ? "selected" : ""}
                  aria-label={`${current.month_name} ${d.day}, ${year}, ${d.weekday || "Outside weekday cycle"}`}
                  aria-pressed={day === d.day}
                  onClick={() => setDay(d.day)}
                >
                  {d.day}
                  {calendarEvents.filter(
                    (e: any) =>
                      e.ordinal != null &&
                      e.ordinal <= current.ordinal + d.day - 1 &&
                      e.end_ordinal >= current.ordinal + d.day - 1,
                  ).length > 0 && (
                    <span
                      className="calendar-event-count"
                      title="Events on this day"
                    >
                      *
                    </span>
                  )}
                  <small>
                    {d.moons.map((moon: any) => (
                      <span
                        key={moon.id}
                        title={`${moon.name}: ${moon.phase}, cycle day ${moon.cycle_day}/${moon.period}`}
                      >
                        {phases[moon.phase_index]}
                      </span>
                    ))}
                  </small>
                </button>
              ))}
            </div>
          </div>
          {selected && (
            <div className="calendar-day-detail" aria-live="polite">
              <strong>
                {selected.weekday || "Outside weekday cycle"} ·{" "}
                {current.month_name} {day}, {year}
              </strong>
              <p className="muted small-copy">
                Day ordinal {current.ordinal + day - 1}
              </p>
              {calendarId && (
                <div className="calendar-festivals">
                  <strong>Events and festivals</strong>
                  {calendarEvents
                    .filter(
                      (e: any) =>
                        e.ordinal != null &&
                        e.ordinal <= current.ordinal + day - 1 &&
                        e.end_ordinal >= current.ordinal + day - 1,
                    )
                    .map((event: any) => (
                      <p key={event.occurrence_id}>
                        {event.title}
                        {event.uncertain ? " (date uncertain)" : ""}
                      </p>
                    ))}
                  {festivalError && <ErrorBox message={festivalError} />}{" "}
                  {festivals?.value.occurrences_truncated && (
                    <p className="notice">
                      Date preview limit reached for this year; some events are
                      omitted.
                    </p>
                  )}
                  {festivals?.value.recurrence_warnings?.map((w: any) => (
                    <p className="notice" key={w.id}>
                      {w.message}
                    </p>
                  ))}
                </div>
              )}
              {selected.moons.map((moon: any) => (
                <p key={moon.id}>
                  {moon.name}: {moon.phase} · day {moon.cycle_day} of{" "}
                  {moon.period}
                </p>
              ))}
            </div>
          )}
        </>
      )}
      <div className="field-grid">
        <Field
          label="Convert day ordinal"
          type="number"
          min={-1000000000000000}
          max={1000000000000000}
          value={ordinal}
          onChange={setOrdinal}
        />
        <button
          className="button secondary small"
          onClick={async () => {
            const started = token;
            setConversionError("");
            try {
              const value = await post("/tools/calendar", {
                calendar: data,
                ordinal,
              });
              if (latest.current === started) {
                setYear(value.year);
                setMonth(value.month);
                setSpecial(value.special_day_id || "");
                setDay(value.day);
              }
            } catch (e: any) {
              if (latest.current === started) setConversionError(e.message);
            }
          }}
        >
          Find date
        </button>
      </div>
      {conversionError && <ErrorBox message={conversionError} />}
      <p className="muted small-copy">
        The epoch is the first day of year 0. Negative years and year 0 use the
        same periodic rules. Celestial offsets specify the ordinal of a new
        phase.
      </p>
    </div>
  );
}

export function CalendarEditor({
  data,
  setData,
  ctx,
  id,
}: {
  data: Record<string, any>;
  setData: (v: Record<string, any>) => void;
  ctx: AppContext;
  id: string;
}) {
  const months: any[] = data.months || defaultMonths,
    rules: any[] = rulesFor(data),
    moons: any[] = moonsFor(data);
  const update = (patch: Record<string, any>) => setData({ ...data, ...patch });
  const ruleChange = (id: string, patch: any) =>
    update({
      leap_rules: rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  const moonChange = (id: string, patch: any) =>
    update({ moons: moons.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  return (
    <>
      <div className="button-row">
        <CalendarExport id={id} />
        <ImportCalendarButton ctx={ctx} />
      </div>
      <div className="calendar-editor">
        <div>
          <div className="section-heading">
            <h3>Months</h3>
            <button
              className="text-button"
              disabled={months.length >= 60}
              onClick={() =>
                update({ months: [...months, { name: "New month", days: 30 }] })
              }
            >
              <Plus size={15} />
              Add month
            </button>
          </div>
          {months.map((m, i) => (
            <div className="month-row" key={i}>
              <input
                aria-label={`Month ${i + 1} name`}
                maxLength={60}
                value={m.name}
                onChange={(e) =>
                  update({
                    months: months.map((v, n) =>
                      n === i ? { ...v, name: e.target.value } : v,
                    ),
                  })
                }
              />
              <input
                aria-label={`Month ${i + 1} days`}
                type="number"
                min={1}
                max={1000}
                value={m.days}
                onChange={(e) =>
                  update({
                    months: months.map((v, n) =>
                      n === i ? { ...v, days: Number(e.target.value) } : v,
                    ),
                  })
                }
              />
              <small>days</small>
              <button
                className="icon-button"
                aria-label={`Remove month ${i + 1}`}
                disabled={months.length === 1}
                onClick={() => {
                  const remap = (value: number) =>
                    value === i + 1 ? 1 : value > i + 1 ? value - 1 : value;
                  update({
                    months: months.filter((_, n) => n !== i),
                    leap_month: remap(data.leap_month || months.length),
                    ...(data.special_days
                      ? {
                          special_days: data.special_days.map((row: any) => ({
                            ...row,
                            after_month:
                              (row.after_month ?? months.length) >= i + 1
                                ? (row.after_month ?? months.length) - 1
                                : row.after_month,
                          })),
                        }
                      : {}),
                    ...(data.leap_rules
                      ? {
                          leap_rules: rules.map((r) => ({
                            ...r,
                            month: remap(r.month || months.length),
                          })),
                        }
                      : {}),
                  });
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <Field
            label="Weekdays separated by commas"
            value={(data.weekdays || defaultWeekdays).join(", ")}
            onChange={(v) =>
              update({ weekdays: v.split(",").map((s: string) => s.trim()) })
            }
          />
          <div className="field-grid">
            <label className="field">
              <span>Weekday cycle</span>
              <SearchableSelect
                value={data.week_mode || "continuous"}
                onChange={(e) => update({ week_mode: e.target.value })}
              >
                <option value="continuous">Continuous</option>
                <option value="reset_month">Reset each month</option>
                <option value="reset_year">Reset each year</option>
              </SearchableSelect>
            </label>
            <Field
              label="Weekday offset"
              type="number"
              min={-100000}
              max={100000}
              value={data.day_offset || 0}
              onChange={(v) => update({ day_offset: v })}
            />
          </div>
          <div className="section-heading">
            <h3>Leap rules</h3>
            <button
              className="text-button"
              disabled={rules.length >= 12}
              onClick={() =>
                update({
                  leap_rules: [
                    ...rules,
                    {
                      id: uid(),
                      name: "Leap day",
                      interval: 4,
                      offset: 0,
                      month: months.length,
                      days: 1,
                      except_every: 0,
                      except_unless: 0,
                    },
                  ],
                })
              }
            >
              <Plus size={15} />
              Add leap rule
            </button>
          </div>
          <p className="muted small-copy">
            A rule applies when (year − offset) is divisible by its interval. An
            exception skips that leap; restoration includes it again. Exception
            intervals must divide into restoration intervals and be multiples of
            the leap interval. Zero disables either exception.
          </p>
          {rules.length === 0 && <p className="muted">No leap days.</p>}
          {rules.map((r, i) => (
            <fieldset className="calendar-rule" key={r.id}>
              <legend>Leap rule {i + 1}</legend>
              <Field
                label={`Leap rule ${i + 1} name`}
                value={r.name}
                onChange={(v) => ruleChange(r.id, { name: v })}
              />
              <div className="field-grid">
                {[
                  ["interval", "Every years", 1, 10000, 4],
                  ["offset", "Year offset", -1000000000, 1000000000, 0],
                  ["month", "In month number", 1, months.length, months.length],
                  ["days", "Added days", 1, 10, 1],
                  ["except_every", "Except every years", 0, 10000, 0],
                  ["except_unless", "Restore every years", 0, 10000, 0],
                ].map(([key, label, min, max, fallback]) => (
                  <Field
                    key={String(key)}
                    label={String(label)}
                    type="number"
                    min={Number(min)}
                    max={Number(max)}
                    value={r[String(key)] ?? fallback}
                    onChange={(v) => ruleChange(r.id, { [String(key)]: v })}
                  />
                ))}
              </div>
              <button
                className="text-button danger"
                onClick={() =>
                  update({ leap_rules: rules.filter((v) => v.id !== r.id) })
                }
              >
                <Trash2 size={14} />
                Remove leap rule {i + 1}
              </button>
            </fieldset>
          ))}
          <SpecialDaysEditor data={data} onData={setData} months={months} />
          <div className="section-heading">
            <h3>Celestial cycles</h3>
            <button
              className="text-button"
              disabled={moons.length >= 8}
              onClick={() =>
                update({
                  moons: [
                    ...moons,
                    { id: uid(), name: "New moon", period: 28, offset: 0 },
                  ],
                })
              }
            >
              <Plus size={15} />
              Add moon
            </button>
          </div>
          {moons.length === 0 && <p className="muted">No celestial cycles.</p>}
          {moons.map((m, i) => (
            <fieldset className="calendar-rule" key={m.id}>
              <legend>Celestial cycle {i + 1}</legend>
              <Field
                label={`Moon ${i + 1} name`}
                value={m.name}
                onChange={(v) => moonChange(m.id, { name: v })}
              />
              <div className="field-grid">
                <Field
                  label="Cycle days"
                  type="number"
                  min={1}
                  max={1000000}
                  value={m.period ?? 28}
                  onChange={(v) => moonChange(m.id, { period: v })}
                />
                <Field
                  label="New phase ordinal"
                  type="number"
                  min={-1000000000}
                  max={1000000000}
                  value={m.offset || 0}
                  onChange={(v) => moonChange(m.id, { offset: v })}
                />
              </div>
              <button
                className="text-button danger"
                onClick={() =>
                  update({ moons: moons.filter((v) => v.id !== m.id) })
                }
              >
                <Trash2 size={14} />
                Remove moon {i + 1}
              </button>
            </fieldset>
          ))}
        </div>
        <CalendarPreview data={data} calendarId={id} ctx={ctx} />
      </div>
    </>
  );
}

export function CalendarReader({
  entry,
  reader,
  ctx,
}: {
  entry: Entry;
  reader: boolean;
  ctx: AppContext;
}) {
  return (
    <div className="reader-calendar">
      <CalendarExport id={entry.id} reader={reader} />
      <CalendarPreview
        data={entry.data}
        calendarId={entry.id}
        reader={reader}
        ctx={ctx}
      />
    </div>
  );
}
