import { DayPeriodPicker } from "./SpecialDays";
import { SearchableSelect } from "./SearchableSelect";
import { ImportCalendarButton } from "./Calendars";
import React, { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Layers,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
} from "lucide-react";
import { AppContext, Entry, api, post, uid } from "./domain";
import {
  Badge,
  Empty,
  EntryPicker,
  ErrorBox,
  Field,
  Modal,
  TagField,
} from "./ui";
import { ChronicleMap } from "./MapHistory";

const eventKey = (e?: Entry) => e?.occurrence_id || e?.id || "";

type HistoricEvent = Entry & {
  ordinal: number | null;
  end_ordinal: number | null;
  date_label: string;
  end_label?: string;
  date_warning?: string;
  calendar_key: string;
  lane: number;
  era_label?: string;
  era_warning?: string;
  uncertain?: boolean;
  open_ended?: boolean;
};
type Lane = { id: number; name: string; private?: boolean };
type HistoryData = {
  events: HistoricEvent[];
  occurrence_window: { from_year: number; to_year: number };
  occurrences_truncated: boolean;
  recurrence_warnings: { id: string; message: string }[];
  eras: HistoricEvent[];
  lanes: Lane[];
  axis: {
    minimum: number;
    maximum: number;
    ticks: { at: number; year: number; label: string }[];
    custom_calendar: boolean;
  } | null;
  timeline: Entry | null;
  calendar: Entry | null;
  calendar_key: string;
  calendars: Entry[];
  timelines: Entry[];
};

export function TimelineEditor({
  data,
  onData,
  ctx,
  id,
}: {
  data: Record<string, any>;
  onData: (v: Record<string, any>) => void;
  ctx: AppContext;
  id: string;
}) {
  const update = (key: string, value: any) => onData({ ...data, [key]: value }),
    lanes: Lane[] = data.lanes || [{ id: 0, name: "Events" }];
  const events = ctx.entries.filter(
    (e) =>
      e.kind === "event" &&
      (e.data.calendar_id || "") === (data.calendar_id || ""),
  );
  return (
    <div className="timeline-definition">
      <div className="field-grid">
        <EntryPicker
          label="Timeline calendar"
          value={data.calendar_id || ""}
          onChange={(v) => update("calendar_id", v)}
          entries={ctx.entries.filter((e) => e.kind === "calendar")}
          empty="Recorded years · no custom calendar"
        />
        <EntryPicker
          label="Default Chronicle map"
          value={data.map_id || ""}
          onChange={(v) => update("map_id", v)}
          entries={ctx.entries.filter((e) => e.kind === "map")}
        />
      </div>
      <p className="muted small-copy">
        Events on a timeline share one calendar. Events keep their own maps and
        recorded dates.
      </p>
      <TagField
        label="Event tags"
        value={data.tags || []}
        onChange={(v) => update("tags", v)}
        placeholder="Optional tags to gather matching events"
      />
      <label className="field">
        <span>Tag matching</span>
        <SearchableSelect
          value={data.tag_mode || "all"}
          onChange={(e) => update("tag_mode", e.target.value)}
        >
          <option value="all">Every selected tag</option>
          <option value="any">Any selected tag</option>
        </SearchableSelect>
      </label>
      <label className="field">
        <span>Events to show</span>
        <SearchableSelect
          value={data.selection || "all"}
          onChange={(e) => update("selection", e.target.value)}
        >
          <option value="all">All matching events in this calendar</option>
          <option value="selected">Only selected events</option>
        </SearchableSelect>
      </label>
      {data.selection === "selected" && (
        <div className="timeline-event-choices">
          {events.map((e) => (
            <label key={e.id}>
              <input
                type="checkbox"
                checked={(data.event_ids || []).includes(e.id)}
                onChange={(ev) =>
                  update(
                    "event_ids",
                    ev.target.checked
                      ? [...(data.event_ids || []), e.id]
                      : (data.event_ids || []).filter(
                          (value: string) => value !== e.id,
                        ),
                  )
                }
              />
              <span>
                {e.title}
                <small>
                  {e.data.year ?? 1} · {e.data.month || 1}/{e.data.day || 1}
                </small>
              </span>
            </label>
          ))}
          {!events.length && (
            <p className="muted">
              Create an event in this calendar to select it here.
            </p>
          )}
        </div>
      )}
      <label className="historical-checkbox">
        <input
          type="checkbox"
          checked={data.recurrence_from_year != null}
          onChange={(e) => {
            if (e.target.checked) {
              const start =
                events.find((e) => e.data.recurrence)?.data.year ?? 1;
              onData({
                ...data,
                recurrence_from_year: start,
                recurrence_to_year: Math.min(start + 9, 1000000000),
              });
            } else {
              const { recurrence_from_year, recurrence_to_year, ...rest } =
                data;
              onData(rest);
            }
          }}
        />
        Save a repeating-date window
      </label>
      {data.recurrence_from_year != null && (
        <div className="field-grid">
          <Field
            label="Saved repeats from year"
            type="number"
            min={-1000000000}
            max={1000000000}
            value={data.recurrence_from_year}
            onChange={(v) => update("recurrence_from_year", v)}
          />
          <Field
            label="Saved repeats through year"
            type="number"
            min={-1000000000}
            max={1000000000}
            value={data.recurrence_to_year}
            onChange={(v) => update("recurrence_to_year", v)}
          />
        </div>
      )}
      <div className="section-heading">
        <h3>Parallel lanes</h3>
        <button
          className="text-button"
          disabled={lanes.length >= 40}
          onClick={() =>
            update("lanes", [
              ...lanes,
              {
                id:
                  Array.from({ length: 1001 }, (_, i) => i).find(
                    (i) => !lanes.some((l) => l.id === i),
                  ) ?? 0,
                name: "New lane",
                private: false,
              },
            ])
          }
        >
          <Plus size={15} />
          Add lane
        </button>
      </div>
      {lanes.map((lane, index) => (
        <div className="timeline-lane-definition" key={index}>
          <label className="field">
            <span>Lane number</span>
            <input
              aria-label={"Lane " + (index + 1) + " number"}
              type="number"
              min={-1000}
              max={1000}
              value={lane.id}
              onChange={(e) =>
                update(
                  "lanes",
                  lanes.map((l, n) =>
                    n === index ? { ...l, id: Number(e.target.value) } : l,
                  ),
                )
              }
            />
          </label>
          <Field
            label="Lane name"
            value={lane.name}
            onChange={(v) =>
              update(
                "lanes",
                lanes.map((l, n) => (n === index ? { ...l, name: v } : l)),
              )
            }
          />
          <label className="check-label">
            <input
              aria-label={"Private lane " + lane.name}
              type="checkbox"
              checked={!!lane.private}
              onChange={(e) =>
                update(
                  "lanes",
                  lanes.map((l, n) =>
                    n === index ? { ...l, private: e.target.checked } : l,
                  ),
                )
              }
            />
            GM only
          </label>
          <button
            className="icon-button"
            aria-label={"Remove lane " + lane.name}
            onClick={() =>
              update(
                "lanes",
                lanes.filter((_, n) => n !== index),
              )
            }
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <p className="muted small-copy">
        Set each event's lane number to place it on a track. GM lanes are
        omitted from this timeline's reader view; entry visibility controls
        access elsewhere.
      </p>
      <button
        className="button secondary"
        onClick={() => ctx.go("history/" + id)}
      >
        <Layers size={16} />
        View timeline
      </button>
    </div>
  );
}

export { HistoricalDetails as EventDetails } from "./HistoricalDetails";

function RepeatNotice({ view }: { view: HistoryData }) {
  return (
    <>
      {view.occurrences_truncated && (
        <div className="notice">
          Repeating-date preview limit reached. Choose fewer years to see a
          complete window.
        </div>
      )}
      {view.recurrence_warnings?.map((w) => (
        <ErrorBox key={w.id} message={w.message} />
      ))}
    </>
  );
}

export function TimelineBoard({
  view,
  selected,
  onSelect,
}: {
  view: HistoryData;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null),
    [zoom, setZoom] = useState(1),
    [width, setWidth] = useState(800);
  useEffect(() => {
    if (!scroll.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(550, entries[0].contentRect.width - 150)),
    );
    observer.observe(scroll.current);
    return () => observer.disconnect();
  }, []);
  const chartWidth = width * zoom,
    axis = view.axis;
  const layout = useMemo(() => {
    if (!axis) return [];
    const span = Math.max(1, axis.maximum - axis.minimum);
    return view.lanes.map((lane) => {
      const slots: number[] = [],
        events = view.events
          .filter((e) => e.lane === lane.id && e.ordinal !== null)
          .map((event) => {
            const left = ((event.ordinal! - axis.minimum) / span) * chartWidth,
              bar = Math.max(
                2,
                ((event.end_ordinal! - event.ordinal!) / span) * chartWidth,
              );
            let row = slots.findIndex((end) => end + 16 < left);
            if (row < 0) {
              row = slots.length;
              slots.push(0);
            }
            slots[row] = Math.max(left + 160, left + bar);
            return { event, left, row, bar };
          });
      return { lane, events, height: Math.max(145, slots.length * 112 + 40) };
    });
  }, [view, chartWidth, axis]);
  useEffect(() => {
    if (!axis || !selected || !scroll.current) return;
    const event = view.events.find((e) => eventKey(e) === selected);
    if (event?.ordinal != null)
      scroll.current.scrollLeft = Math.max(
        0,
        150 +
          ((event.ordinal - axis.minimum) / (axis.maximum - axis.minimum)) *
            chartWidth -
          scroll.current.clientWidth / 2,
      );
  }, [selected, zoom, axis, chartWidth]);
  if (!axis)
    return (
      <div className="notice">
        Select one calendar to plot events on a shared scale. The list keeps all
        recorded dates available.
      </div>
    );
  return (
    <div className="timeline-board">
      <div className="timeline-board-controls">
        <div className="button-row">
          <button
            className="icon-button"
            aria-label="Pan timeline earlier"
            onClick={() =>
              scroll.current?.scrollBy({
                left: -width * 0.75,
                behavior: "smooth",
              })
            }
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Pan timeline later"
            onClick={() =>
              scroll.current?.scrollBy({
                left: width * 0.75,
                behavior: "smooth",
              })
            }
          >
            <ChevronRight size={17} />
          </button>
          <label>
            Zoom{" "}
            <input
              aria-label="Timeline zoom"
              type="range"
              min={1}
              max={16}
              step={1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
            <span>{zoom}×</span>
          </label>
        </div>
        <span>
          {view.calendar?.title || "Recorded years · unspecified calendar"}
        </span>
      </div>
      <div
        className="timeline-scroll"
        ref={scroll}
        tabIndex={0}
        aria-label="Parallel timeline lanes"
      >
        <div className="timeline-grid" style={{ width: chartWidth + 165 }}>
          <div className="timeline-axis">
            <span className="timeline-axis-name">
              {view.timeline?.title || "Historical events"}
            </span>
            {axis.ticks
              .filter(
                (_, i) =>
                  i %
                    Math.max(
                      1,
                      Math.ceil(
                        axis.ticks.length /
                          Math.max(2, Math.floor(chartWidth / 130)),
                      ),
                    ) ===
                  0,
              )
              .map((tick) => (
                <div
                  className="timeline-tick"
                  key={tick.at}
                  style={{
                    left:
                      150 +
                      ((tick.at - axis.minimum) /
                        (axis.maximum - axis.minimum)) *
                        chartWidth,
                  }}
                >
                  <strong>{tick.year}</strong>
                  {axis.custom_calendar && (
                    <small title={tick.label}>
                      {tick.label.split(" · ").slice(1).join(" · ")}
                    </small>
                  )}
                </div>
              ))}
          </div>
          {(view.eras || [])
            .filter((e) => e.ordinal !== null)
            .map((period) => {
              const start = Math.max(axis.minimum, period.ordinal!),
                end = Math.min(
                  axis.maximum,
                  period.end_ordinal ?? axis.maximum,
                );
              if (end < start) return null;
              return (
                <div
                  className="timeline-era-row"
                  key={period.id}
                  role="group"
                  aria-label={
                    period.title +
                    ": " +
                    period.date_label +
                    " to " +
                    (period.open_ended ? "ongoing" : period.end_label)
                  }
                >
                  <strong>{period.title}</strong>
                  <span
                    className="timeline-era-band"
                    style={{
                      left:
                        150 +
                        ((start - axis.minimum) /
                          (axis.maximum - axis.minimum)) *
                          chartWidth,
                      width: Math.max(
                        3,
                        ((end - start) / (axis.maximum - axis.minimum)) *
                          chartWidth,
                      ),
                    }}
                    title={
                      period.date_label +
                      " to " +
                      (period.open_ended ? "ongoing" : period.end_label)
                    }
                  >
                    {period.date_label} to{" "}
                    {period.open_ended ? "ongoing" : period.end_label}
                  </span>
                </div>
              );
            })}
          {layout.map(({ lane, events, height }) => (
            <section
              className="timeline-track"
              key={lane.id}
              style={{ height }}
              aria-label={"Timeline lane " + lane.name}
            >
              <div className="timeline-track-name">
                <strong>{lane.name}</strong>
                {lane.private && <Badge>GM only</Badge>}
                <small>Lane {lane.id}</small>
              </div>
              {events.map(({ event, left, row, bar }) => (
                <React.Fragment key={eventKey(event)}>
                  {event.end_ordinal !== event.ordinal && (
                    <span
                      className={
                        "timeline-duration" +
                        (event.uncertain ? " uncertain" : "")
                      }
                      style={{
                        left: 150 + left,
                        top: row * 112 + 21,
                        width: bar,
                      }}
                    />
                  )}
                  <button
                    className={
                      "timeline-event-card " +
                      (selected === eventKey(event) ? "active" : "")
                    }
                    style={{ left: 150 + left, top: row * 112 + 29 }}
                    aria-label={event.title + " · " + event.date_label}
                    aria-pressed={selected === eventKey(event)}
                    onClick={() => onSelect(eventKey(event))}
                  >
                    <small>
                      {event.data.year ?? 1}
                      {event.data.era ? " · " + event.data.era : ""}
                    </small>
                    <strong>{event.title}</strong>
                    <span>{event.date_label}</span>
                  </button>
                </React.Fragment>
              ))}
            </section>
          ))}
        </div>
      </div>
      {!!view.events.filter((e) => e.date_warning).length && (
        <div className="notice">
          Some recorded dates need review. They remain available in the event
          list.
        </div>
      )}
    </div>
  );
}

function EventPanel({
  ctx,
  event,
  reader = false,
}: {
  ctx: AppContext;
  event?: HistoricEvent;
  reader?: boolean;
}) {
  const [full, setFull] = useState<Entry | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setFull(null);
    setError("");
    if (event)
      api<Entry>("/resources/" + event.id + (reader ? "?audience=reader" : ""))
        .then((value) => {
          if (alive && value.world_id === ctx.world.id) setFull(value);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [event?.id, event?.revision, ctx.world.id, reader]);
  if (!event) return null;
  return (
    <aside className="history-event-panel">
      <div>
        <Badge>{event.era_label || event.data.era || "Historical event"}</Badge>
        <h2>{event.title}</h2>
        <p className="history-date-label">
          {event.date_label}
          {event.data.end_year != null &&
          event.data.end_year !== "" &&
          event.end_label
            ? " → " + event.end_label
            : ""}
        </p>
      </div>
      <p>{event.summary}</p>
      {event.uncertain && (
        <p className="notice">
          This date is uncertain. Its bar shows the stated month/year interval;
          circa does not add an assumed margin.
        </p>
      )}
      {event.era_warning && <ErrorBox message={event.era_warning} />}
      {event.date_warning && <ErrorBox message={event.date_warning} />}{" "}
      {error && <ErrorBox message={error} />}{" "}
      {full && (
        <div
          className="reader-prose"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(full.html || ""),
          }}
        />
      )}
      {!reader && (
        <button
          className="button secondary small"
          onClick={() => ctx.go("entry/" + event.id)}
        >
          <Edit3 size={14} />
          {event.data.recurrence ? "Edit event series" : "Edit event"}
        </button>
      )}
    </aside>
  );
}

export function TimelineEmbed({
  ctx,
  id,
  reader = false,
}: {
  ctx: AppContext;
  id: string;
  reader?: boolean;
}) {
  const [view, setView] = useState<HistoryData | null>(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    setView(null);
    setSelected("");
    api<HistoryData>(
      "/worlds/" +
        ctx.world.id +
        "/history?timeline=" +
        id +
        (reader ? "&audience=reader" : ""),
    )
      .then((value) => {
        if (alive) setView(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, ctx.world.id, reader, ctx.entries]);
  if (error) return <ErrorBox message={error} />;
  if (!view)
    return (
      <div className="page-loading">
        <Loader2 className="spin" size={18} />
        Opening timeline…
      </div>
    );
  return (
    <div className="timeline-embed">
      <RepeatNotice view={view} />
      <TimelineBoard
        view={view}
        selected={selected || eventKey(view.events[0])}
        onSelect={setSelected}
      />
      {!view.axis && (
        <div className="button-row wrap" aria-label="Recorded timeline events">
          {view.events.map((event) => (
            <button
              key={eventKey(event)}
              className="button secondary small"
              aria-pressed={
                (selected || eventKey(view.events[0])) === eventKey(event)
              }
              onClick={() => setSelected(eventKey(event))}
            >
              {event.title} · {event.date_label}
            </button>
          ))}
        </div>
      )}
      <EventPanel
        ctx={ctx}
        event={
          view.events.find((e) => eventKey(e) === selected) || view.events[0]
        }
        reader={reader}
      />
      {view.events.length > 0 && (
        <ChronicleMap
          ctx={ctx}
          event={
            view.events.find((e) => eventKey(e) === selected) || view.events[0]
          }
          mapId={
            (
              view.events.find((e) => eventKey(e) === selected) ||
              view.events[0]
            )?.data.map_id || view.timeline?.data.map_id
          }
          reader={reader}
        />
      )}
    </div>
  );
}

export function HistoryWorkspace({ ctx }: { ctx: AppContext }) {
  const timelineId = location.hash.slice(2).split("/")[1] || "";
  const [tab, setTab] = useState("timeline"),
    [calendar, setCalendar] = useState(
      () =>
        ctx.entries.find(
          (e) =>
            e.kind === "event" &&
            ctx.entries.some(
              (c) => c.id === e.data.calendar_id && c.kind === "calendar",
            ),
        )?.data.calendar_id || "none",
    ),
    [query, setQuery] = useState(""),
    [payload, setPayload] = useState<{
      token: string;
      view: HistoryData;
    } | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [creating, setCreating] = useState(false),
    [title, setTitle] = useState(""),
    [year, setYear] = useState(1),
    [month, setMonth] = useState(1),
    [day, setDay] = useState(1),
    [specialDay, setSpecialDay] = useState(""),
    [busy, setBusy] = useState(false),
    [repeatWindow, setRepeatWindow] = useState<{
      from: number;
      to: number;
    } | null>(null),
    [repeatFrom, setRepeatFrom] = useState(1),
    [repeatTo, setRepeatTo] = useState(10);
  const token = JSON.stringify([
    ctx.world.id,
    timelineId,
    calendar,
    query,
    repeatWindow,
  ]);
  const view = payload?.token === token ? payload.view : null,
    events = view?.events || [],
    active = events.find((e) => eventKey(e) === selected) || events[0],
    index = events.findIndex((e) => eventKey(e) === eventKey(active));
  useEffect(() => {
    let alive = true;
    setError("");
    const params = new URLSearchParams(
      timelineId ? { timeline: timelineId } : { calendar },
    );
    if (query) params.set("q", query);
    if (repeatWindow) {
      params.set("from_year", String(repeatWindow.from));
      params.set("to_year", String(repeatWindow.to));
    }
    const timer = setTimeout(
      () =>
        api<HistoryData>("/worlds/" + ctx.world.id + "/history?" + params)
          .then((value) => {
            if (alive) setPayload({ token, view: value });
          })
          .catch((e) => {
            if (alive) setError(e.message);
          }),
      query ? 200 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [token, ctx.entries, ctx.assets]);
  useEffect(() => {
    setSelected("");
    setPlaying(false);
  }, [timelineId, calendar, query]);
  useEffect(() => {
    if (!playing || tab !== "chronicles" || index < 0) return;
    if (index >= events.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setSelected(eventKey(events[index + 1])),
      2000 / speed,
    );
    return () => clearTimeout(timer);
  }, [playing, tab, index, events, speed]);
  useEffect(() => {
    setRepeatWindow(null);
  }, [ctx.world.id, timelineId, calendar]);
  useEffect(() => {
    if (view?.occurrence_window) {
      setRepeatFrom(view.occurrence_window.from_year);
      setRepeatTo(view.occurrence_window.to_year);
    }
  }, [view?.occurrence_window?.from_year, view?.occurrence_window?.to_year]);
  const mapId = active?.data.map_id || view?.timeline?.data.map_id;
  const choose = (id: string) => {
    setSelected(id);
    setPlaying(false);
  };
  const newEvent = () => {
    setTitle("");
    setYear(active?.data.year ?? 1);
    setMonth(active?.data.month ?? 1);
    setDay(active?.data.day ?? 1);
    setSpecialDay(view?.calendar ? active?.data.special_day_id || "" : "");
    setCreating(true);
    setError("");
  };
  return (
    <div className="page history-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE PASSAGE OF TIME</span>
          <h1>History & calendars</h1>
          <p>
            Place events on parallel tracks, and follow their stories across
            your maps.
          </p>
        </div>
        <div className="button-row">
          {tab === "calendars" && <ImportCalendarButton ctx={ctx} />}
          {tab === "eras" && (
            <button
              className="button primary"
              onClick={() => ctx.create("era")}
            >
              <Plus size={16} />
              New era
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => ctx.create("timeline")}
          >
            <Layers size={16} />
            New timeline
          </button>
          <button
            className="button primary"
            disabled={tab !== "calendars" && !view}
            onClick={() =>
              tab === "calendars" ? ctx.create("calendar") : newEvent()
            }
          >
            <Plus size={17} />
            {tab === "calendars" ? "New calendar" : "New event"}
          </button>
        </div>
      </div>
      <div className="tabs">
        {[
          ["timeline", "Historical timeline"],
          ["list", "Event list"],
          ["chronicles", "Chronicles"],
          ["calendars", "Calendars"],
          ["eras", "Eras"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setPlaying(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "eras" ? (
        <div className="card-grid era-library">
          {ctx.entries
            .filter((e) => e.kind === "era")
            .map((e) => (
              <button
                className="entry-card"
                key={e.id}
                onClick={() => ctx.go("entry/" + e.id)}
              >
                <CalendarDays size={22} />
                <h3>{e.title}</h3>
                <p>{e.summary}</p>
                <small>
                  {e.data.date_approximate ? "circa " : ""}
                  {e.data.year ?? 1} to {e.data.end_year ?? "ongoing"}
                </small>
              </button>
            ))}
          {!ctx.entries.some((e) => e.kind === "era") && (
            <Empty
              icon={Clock3}
              title="Name the ages of your world"
              action={() => ctx.create("era")}
              label="Create an era"
            >
              Give a period its own dates, lore and saved reader version.
            </Empty>
          )}
        </div>
      ) : tab === "calendars" ? (
        <div className="card-grid">
          {ctx.entries
            .filter((e) => e.kind === "calendar")
            .map((cal) => (
              <button
                className="entry-card calendar-card"
                key={cal.id}
                onClick={() => ctx.go("entry/" + cal.id)}
              >
                <CalendarDays size={25} />
                <h3>{cal.title}</h3>
                <p>
                  {cal.summary ||
                    "Custom months, weekdays and celestial rhythm."}
                </p>
                <span>
                  {cal.data.months?.length || 4} months <ArrowRight size={15} />
                </span>
              </button>
            ))}
          {!ctx.entries.some((e) => e.kind === "calendar") && (
            <Empty
              icon={CalendarDays}
              title="A different rhythm of days"
              action={() => ctx.create("calendar")}
              label="Create a calendar"
            >
              Define the days and seasons of your world.
            </Empty>
          )}
        </div>
      ) : (
        <>
          <div className="history-controls">
            <label className="field">
              <span>Timeline</span>
              <SearchableSelect
                aria-label="Choose timeline"
                value={timelineId}
                onChange={(e) =>
                  ctx.go(
                    e.target.value ? "history/" + e.target.value : "history",
                  )
                }
              >
                <option value="">All events in a calendar</option>
                {ctx.entries
                  .filter((e) => e.kind === "timeline")
                  .map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.title}
                    </option>
                  ))}
              </SearchableSelect>
            </label>
            {!timelineId && (
              <label className="field">
                <span>Calendar</span>
                <SearchableSelect
                  aria-label="Filter history by calendar"
                  value={calendar}
                  onChange={(e) => setCalendar(e.target.value)}
                >
                  <option value="none">
                    Recorded years · no custom calendar
                  </option>
                  <option value="all">All calendars · list only</option>
                  <option value="unavailable">
                    Unavailable calendars · list only
                  </option>
                  {ctx.entries
                    .filter((e) => e.kind === "calendar")
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.title}
                      </option>
                    ))}
                </SearchableSelect>
              </label>
            )}
            <label className="history-search">
              <Search size={16} />
              <input
                aria-label="Search historical events"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a moment…"
              />
            </label>
            {view?.timeline && (
              <button
                className="button secondary small"
                onClick={() => ctx.go("entry/" + view.timeline!.id)}
              >
                <Edit3 size={14} />
                Timeline settings
              </button>
            )}
          </div>
          <div className="repeat-window-controls field-grid three">
            <Field
              label="Repeating dates from year"
              type="number"
              min={-1000000000}
              max={1000000000}
              value={repeatFrom}
              onChange={setRepeatFrom}
            />
            <Field
              label="Repeating dates through year"
              type="number"
              min={-1000000000}
              max={1000000000}
              value={repeatTo}
              onChange={setRepeatTo}
            />
            <button
              className="button secondary small"
              onClick={() => {
                setSelected("");
                setPlaying(false);
                setRepeatWindow({ from: repeatFrom, to: repeatTo });
              }}
            >
              Show repeating dates
            </button>
          </div>
          {view && <RepeatNotice view={view} />}
          {error && !creating && <ErrorBox message={error} />}{" "}
          {!view && !error ? (
            <div className="page-loading">
              <Loader2 className="spin" size={20} />
              Gathering your history…
            </div>
          ) : (
            view && (
              <>
                <div className="history-context">
                  <span>
                    {events.length} {events.length === 1 ? "event" : "events"}
                  </span>
                  <span>
                    {view.calendar?.title ||
                      (view.calendar_key === "all"
                        ? "Separate calendars · recorded dates"
                        : view.calendar_key === "unavailable"
                          ? "Dates kept from unavailable calendars"
                          : "Recorded years · no custom calendar")}
                  </span>
                </div>
                {!events.length &&
                !(tab === "timeline" && view.axis && view.eras?.length) ? (
                  <Empty
                    icon={Clock3}
                    title="Your history starts here"
                    action={newEvent}
                    label="Add a historical event"
                  >
                    Create an event in this calendar or adjust the timeline's
                    selection.
                  </Empty>
                ) : (
                  <>
                    {tab === "timeline" && view.axis ? (
                      <>
                        <TimelineBoard
                          view={view}
                          selected={eventKey(active)}
                          onSelect={choose}
                        />
                        <EventPanel ctx={ctx} event={active} />
                      </>
                    ) : tab === "chronicles" && view.axis ? (
                      <div className="chronicle chronicle-player">
                        <div className="chronicle-toolbar">
                          <button
                            className="icon-button"
                            aria-label="Previous historical event"
                            disabled={index <= 0}
                            onClick={() => choose(eventKey(events[index - 1]))}
                          >
                            <SkipBack size={17} />
                          </button>
                          <button
                            className="button primary small"
                            disabled={events.length < 2}
                            onClick={() => {
                              if (index === events.length - 1)
                                setSelected(eventKey(events[0]));
                              setPlaying(!playing);
                            }}
                          >
                            {playing ? <Pause size={15} /> : <Play size={15} />}{" "}
                            {playing ? "Pause" : "Play"}
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Next historical event"
                            disabled={index >= events.length - 1}
                            onClick={() => choose(eventKey(events[index + 1]))}
                          >
                            <SkipForward size={17} />
                          </button>
                          <input
                            aria-label="Chronicle event position"
                            type="range"
                            min={0}
                            max={Math.max(0, events.length - 1)}
                            value={Math.max(0, index)}
                            onChange={(e) =>
                              choose(eventKey(events[Number(e.target.value)]))
                            }
                          />
                          <SearchableSelect
                            aria-label="Chronicle playback speed"
                            value={speed}
                            onChange={(e) => setSpeed(Number(e.target.value))}
                          >
                            <option value={1}>1×</option>
                            <option value={2}>2×</option>
                            <option value={4}>4×</option>
                          </SearchableSelect>
                          <span>
                            {index + 1} / {events.length}
                          </span>
                        </div>
                        <div className="chronicle-map">
                          <ChronicleMap
                            ctx={ctx}
                            event={active}
                            mapId={mapId}
                            onMarker={(id) => {
                              const matches = events.filter(
                                (e) =>
                                  e.data.marker_id === id &&
                                  (e.data.map_id ||
                                    view?.timeline?.data.map_id) === mapId,
                              );
                              const target =
                                matches.find(
                                  (e) => eventKey(e) === eventKey(active),
                                ) || matches[0];
                              if (target) choose(eventKey(target));
                            }}
                          />
                        </div>
                        <div className="chronicle-stops">
                          {events.map((event) => (
                            <button
                              key={eventKey(event)}
                              className={
                                eventKey(active) === eventKey(event)
                                  ? "active"
                                  : ""
                              }
                              onClick={() => choose(eventKey(event))}
                            >
                              <small>{event.data.year ?? 1}</small>
                              <span />
                              {event.title}
                            </button>
                          ))}
                        </div>
                        <EventPanel ctx={ctx} event={active} />
                      </div>
                    ) : (
                      <>
                        {tab !== "list" && !view.axis && (
                          <div className="notice">
                            These dates belong to separate or unavailable
                            calendars. Choose one available calendar to use the
                            timeline or Chronicle.
                          </div>
                        )}
                        <div className="timeline-list history-record-list">
                          {events.map((event) => (
                            <button
                              key={eventKey(event)}
                              className={
                                eventKey(active) === eventKey(event)
                                  ? "active"
                                  : ""
                              }
                              onClick={() => choose(eventKey(event))}
                            >
                              <div className="timeline-year">
                                <strong>{event.data.year ?? 1}</strong>
                                <small>{event.date_label}</small>
                              </div>
                              <span className="timeline-point" />
                              <div>
                                <Badge>
                                  {view.calendars.find(
                                    (c) => c.id === event.calendar_key,
                                  )?.title || "Recorded date"}
                                </Badge>
                                <h3>{event.title}</h3>
                                <p>{event.summary}</p>
                                {event.date_warning && (
                                  <small className="date-needs-review">
                                    Date needs review
                                  </small>
                                )}
                              </div>
                              <ChevronRight size={17} />
                            </button>
                          ))}
                        </div>
                        <EventPanel ctx={ctx} event={active} />
                      </>
                    )}
                  </>
                )}
              </>
            )
          )}
        </>
      )}
      {creating && (
        <Modal
          title="Add a historical event"
          onClose={() => !busy && setCreating(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const value = await post<Entry>(
                  "/worlds/" + ctx.world.id + "/history/events",
                  {
                    title,
                    timeline_id: view?.timeline?.id,
                    timeline_revision: view?.timeline?.revision,
                    calendar_id: view?.calendar?.id || "",
                    data: {
                      year,
                      month,
                      day,
                      ...(specialDay ? { special_day_id: specialDay } : {}),
                      lane: view?.lanes[0]?.id ?? 0,
                      map_id: view?.timeline?.data.map_id || "",
                    },
                  },
                );
                await ctx.refresh();
                setCreating(false);
                ctx.go("entry/" + value.id);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Event name" value={title} onChange={setTitle} />
            <div className="field-grid three">
              <Field
                label="Year"
                type="number"
                value={year}
                onChange={setYear}
              />
              <DayPeriodPicker
                calendar={view?.calendar?.data}
                value={specialDay}
                label="Event date period"
                onChange={(value) => {
                  setSpecialDay(value);
                  setDay(1);
                }}
              />
              {!specialDay && (
                <Field
                  label="Month"
                  type="number"
                  min={1}
                  max={60}
                  value={month}
                  onChange={setMonth}
                />
              )}
              <Field
                label="Day"
                type="number"
                min={1}
                max={2000}
                value={day}
                onChange={setDay}
              />
            </div>
            <p className="muted small-copy">
              {view?.calendar?.title || "Recorded years · no custom calendar"} ·
              new entries start private.
            </p>
            {error && <ErrorBox message={error} />}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || !title.trim()}
              >
                {busy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Plus size={16} />
                )}
                Create event
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
