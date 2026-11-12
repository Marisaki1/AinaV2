import { SearchableSelect } from "./SearchableSelect";
import React, { useRef, useState } from "react";
import { api, saveBeforeNavigate } from "./domain";
import { ErrorBox, Field } from "./ui";

export function RecurrenceSummary({ data }: { data: Record<string, any> }) {
  const rule = data.recurrence;
  if (!rule) return null;
  return (
    <p className="recurrence-summary">
      Repeats {rule.frequency}, every {rule.interval || 1}{" "}
      {
        (
          {
            daily: "day(s)",
            weekly: "weekday-count span(s)",
            monthly: "month(s)",
            yearly: "year(s)",
          } as Record<string, string>
        )[rule.frequency]
      }
      .
      {rule.until_year != null
        ? ` Last start year: ${rule.until_year}.`
        : " No final year."}{" "}
      Missing dates{" "}
      {rule.invalid_date === "last_day"
        ? "use the month's last day"
        : "are skipped"}
      . Durations keep the same number of calendar days.
    </p>
  );
}

export function RecurrenceEditor({
  data,
  onData,
  id,
}: {
  data: Record<string, any>;
  onData: (data: Record<string, any>) => void;
  id?: string;
}) {
  const rule = data.recurrence;
  const [from, setFrom] = useState(data.year ?? 1),
    [to, setTo] = useState(Math.min((data.year ?? 1) + 9, 1000000000));
  const [result, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const token = JSON.stringify([id, data, from, to]),
    latest = useRef(token);
  latest.current = token;
  const change = (patch: any) =>
    onData({ ...data, recurrence: { ...rule, ...patch } });
  const exact =
    (data.date_precision || "day") === "day" &&
    (data.end_precision || "day") === "day" &&
    !data.date_approximate &&
    !data.end_approximate;
  return (
    <section className="recurrence-editor">
      <h3>Repeating event / festival</h3>
      <label className="field">
        <span>Repeat frequency</span>
        <SearchableSelect
          value={rule?.frequency || "none"}
          onChange={(e) => {
            setResult(null);
            setError("");
            if (e.target.value === "none") {
              const { recurrence, ...rest } = data;
              onData(rest);
            } else
              onData({
                ...data,
                recurrence: {
                  frequency: e.target.value,
                  interval: rule?.interval || 1,
                  invalid_date: rule?.invalid_date || "skip",
                  ...(rule?.until_year != null
                    ? { until_year: rule.until_year }
                    : {}),
                },
              });
          }}
        >
          <option value="none">Does not repeat</option>
          {exact && data.calendar_id && (
            <>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (weekday-count days)</option>
              <option value="monthly" disabled={!!data.special_day_id}>
                Monthly
              </option>
              <option value="yearly">Yearly</option>
            </>
          )}
          {rule && (!exact || !data.calendar_id) && (
            <option value={rule.frequency}>
              {rule.frequency} (needs review)
            </option>
          )}
        </SearchableSelect>
      </label>
      {!rule && (!exact || !data.calendar_id) && (
        <p className="muted small-copy">
          Choose a custom calendar and known day precision without circa
          estimates to enable repeats.
        </p>
      )}
      {rule && (
        <>
          <div className="field-grid three">
            <Field
              label="Repeat every"
              type="number"
              min={1}
              max={10000}
              value={rule.interval ?? 1}
              onChange={(v) => change({ interval: v })}
            />
            <label className="field">
              <span>Final repeat year (optional)</span>
              <input
                type="number"
                min={data.year ?? 1}
                max={1000000000}
                value={rule.until_year ?? ""}
                onChange={(e) => {
                  if (e.target.value === "") {
                    const { until_year, ...rest } = rule;
                    onData({ ...data, recurrence: rest });
                  } else change({ until_year: Number(e.target.value) });
                }}
              />
            </label>
            <label className="field">
              <span>Missing month day</span>
              <SearchableSelect
                value={rule.invalid_date || "skip"}
                onChange={(e) => change({ invalid_date: e.target.value })}
              >
                <option value="skip">Skip that occurrence</option>
                <option value="last_day">Use the month's last day</option>
              </SearchableSelect>
            </label>
          </div>
          <RecurrenceSummary data={data} />
          <p className="muted small-copy">
            Edit the event once to update its series. Repeats need exact day
            dates. Turn repeats off before choosing uncertain dates. A week
            always spans the number of weekday names, even with resetting
            weekdays.
          </p>
          {id && (
            <>
              <div className="field-grid three">
                <Field
                  label="Preview repeats from year"
                  type="number"
                  min={-1000000000}
                  max={1000000000}
                  value={from}
                  onChange={setFrom}
                />
                <Field
                  label="Preview repeats through year"
                  type="number"
                  min={-1000000000}
                  max={1000000000}
                  value={to}
                  onChange={setTo}
                />
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={async () => {
                    const started = token;
                    setBusy(true);
                    setError("");
                    try {
                      if (
                        saveBeforeNavigate.current &&
                        !(await saveBeforeNavigate.current())
                      )
                        throw new Error(
                          "Save or recover your edits before previewing dates.",
                        );
                      const value = await api(
                        `/resources/${id}/occurrences?from_year=${from}&to_year=${to}`,
                      );
                      if (latest.current === started)
                        setResult({ token: started, value });
                    } catch (e: any) {
                      if (latest.current === started) setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Preview repeat dates
                </button>
              </div>
              {error && <ErrorBox message={error} />}
              {result?.token === token && (
                <div className="recurrence-preview" aria-live="polite">
                  <p>
                    {result.value.events.length} occurrence(s) in this window.
                  </p>
                  {result.value.occurrences_truncated && (
                    <p className="notice">
                      The preview limit was reached. Choose fewer years.
                    </p>
                  )}
                  {result.value.recurrence_warnings.map((w: any) => (
                    <p className="notice" key={w.id}>
                      {w.message}
                    </p>
                  ))}
                  <ol>
                    {result.value.events.map((e: any) => (
                      <li key={e.occurrence_id}>
                        {e.date_label}
                        {e.data.end_year != null ? " to " + e.end_label : ""}
                        {e.date_warning ? " - " + e.date_warning : ""}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
