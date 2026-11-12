import { RecurrenceSummary } from "./Recurrence";
import { CalendarReader } from "./Calendars";
import { TimelineEmbed } from "./History";
import { HierarchyView } from "./GraphViews";
import { RelationshipView } from "./SavedGraphs";
import React from "react";
import DOMPurify from "dompurify";
import { AppContext, Entry } from "./domain";
import { MapGuide } from "./MapGuide";
import { CharacterDossier } from "./CharacterDossier";
import { SessionGuide } from "./SessionGuide";
import { LocationGuide } from "./LocationGuide";
import { isLocationEntry } from "./domain";
import { ThreadGuide } from "./ThreadGuide";
import { HandoutView } from "./HandoutView";

export function ReaderContent({
  entry,
  ctx,
  reader = false,
}: {
  entry: Entry;
  ctx: AppContext;
  reader?: boolean;
}) {
  const fields = entry.data.fields || {};
  if (entry.data.planning_type === "handout")
    return <HandoutView ctx={ctx} id={entry.id} reader={reader} />;
  if (["quest", "task"].includes(entry.kind))
    return <ThreadGuide ctx={ctx} id={entry.id} reader={reader} />;
  if (isLocationEntry(entry))
    return (
      <LocationGuide
        key={entry.id + String(reader)}
        ctx={ctx}
        id={entry.id}
        reader={reader}
      />
    );
  if (entry.kind === "character" || entry.template === "character")
    return <CharacterDossier ctx={ctx} id={entry.id} reader={reader} />;
  if (entry.kind === "session")
    return (
      <SessionGuide
        key={entry.id + String(reader)}
        ctx={ctx}
        id={entry.id}
        reader={reader}
      />
    );
  return (
    <>
      {entry.kind === "relationship" && (
        <RelationshipView ctx={ctx} id={entry.id} reader={reader} />
      )}
      {entry.kind === "tree" && (
        <HierarchyView ctx={ctx} id={entry.id} reader={reader} />
      )}
      {entry.kind === "timeline" && (
        <TimelineEmbed ctx={ctx} id={entry.id} reader={reader} />
      )}
      {entry.kind === "variable" && (
        <dl className="reader-fields">
          <div>
            <dt>Displayed value</dt>
            <dd>{String(entry.data.value ?? "")}</dd>
          </div>
          {entry.data.tooltip && (
            <div>
              <dt>Tooltip</dt>
              <dd>{String(entry.data.tooltip)}</dd>
            </div>
          )}
        </dl>
      )}
      {entry.kind === "map" && (
        <MapGuide ctx={ctx} mapId={entry.id} reader={reader} />
      )}
      {entry.kind === "session" && (
        <dl className="reader-fields">
          {[
            ["Session recap", "recap"],
            ["Rewards & progression", "rewards"],
          ]
            .filter(([, key]) => entry.data[key])
            .map(([label, key]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd className="campaign-record-excerpt">{entry.data[key]}</dd>
              </div>
            ))}
        </dl>
      )}
      {Object.keys(fields).length > 0 && (
        <dl className="reader-fields">
          {Object.entries(fields).map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                {typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value ?? "")}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {entry.computed && (
        <dl className="reader-fields">
          {Object.entries(entry.computed).map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {entry.kind === "calendar" && (
        <CalendarReader entry={entry} reader={reader} ctx={ctx} />
      )}
      {["event", "era"].includes(entry.kind) && (
        <div className="reader-date">
          <p>
            {entry.date_context?.date_label || String(entry.data.year ?? 1)}
            {entry.date_context?.open_ended
              ? " to ongoing"
              : entry.data.end_year != null && entry.data.end_year !== ""
                ? " to " + entry.date_context?.end_label
                : ""}
          </p>
          {(entry.date_context?.era_label || entry.data.era) && (
            <p>{entry.date_context?.era_label || entry.data.era}</p>
          )}
          {entry.date_context?.uncertain && (
            <p className="muted small-copy">
              Date precision is {entry.data.date_precision || "day"}. Circa
              marks an estimate without an assumed numeric margin.
            </p>
          )}
          <RecurrenceSummary data={entry.data} />
          {entry.date_context?.date_warning && (
            <p className="notice">{entry.date_context.date_warning}</p>
          )}
          {entry.date_context?.era_warning && (
            <p className="notice">{entry.date_context.era_warning}</p>
          )}
        </div>
      )}
      {["table", "generator"].includes(entry.kind) && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {entry.data.columns?.map((c: any) => (
                  <th key={c.id}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entry.data.rows?.map((row: any) => (
                <tr key={row.id}>
                  {entry.data.columns?.map((c: any) => (
                    <td key={c.id}>
                      {c.type === "article"
                        ? "Linked entry"
                        : String(row.cells?.[c.id] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {entry.kind !== "map" && (
        <div
          className="reader-prose"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(entry.html || ""),
          }}
        />
      )}
    </>
  );
}
