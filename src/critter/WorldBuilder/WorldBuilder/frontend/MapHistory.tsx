import React, { useEffect, useState } from "react";
import { AppContext, Entry, api } from "./domain";
import { Empty, ErrorBox } from "./ui";
import { MapPin, Loader2 } from "lucide-react";
import { MapCanvas } from "./Maps";

type MapState = {
  data: Record<string, any>;
  version: { id: string; name: string } | null;
  effective_label: string | null;
  warnings: string[];
};

export function ChronicleMap({
  ctx,
  mapId,
  event,
  onMarker,
  reader = false,
}: {
  ctx: AppContext;
  mapId?: string;
  event?: Entry;
  onMarker?: (id: string) => void;
  reader?: boolean;
}) {
  const [result, setResult] = useState<{
      token: string;
      value: MapState;
    } | null>(null),
    [error, setError] = useState<{ token: string; message: string } | null>(
      null,
    );
  const map = ctx.entries.find((e) => e.id === mapId);
  const token = JSON.stringify([
    ctx.world.id,
    mapId,
    event?.id,
    event?.revision,
    event?.occurrence_id,
    map?.revision,
    reader,
    ctx.entries
      .filter((e) => e.kind === "calendar")
      .map((e) => [e.id, e.revision, e.visibility, e.published_revision]),
  ]);
  useEffect(() => {
    let alive = true;
    if (mapId && event)
      api<MapState>(
        "/resources/" +
          mapId +
          "/map-state?event=" +
          event.id +
          (reader ? "&audience=reader" : "") +
          (event.occurrence_id?.includes("@")
            ? "&occurrence=" +
              encodeURIComponent(
                [event.data.year, event.data.month, event.data.day].join(":"),
              )
            : "") +
          (event.occurrence_id?.includes("@") && event.data.special_day_id
            ? "&special_day_id=" + encodeURIComponent(event.data.special_day_id)
            : ""),
      )
        .then((value) => {
          if (alive) {
            setResult({ token, value });
            setError(null);
          }
        })
        .catch((e) => {
          if (alive) setError({ token, message: e.message });
        });
    return () => {
      alive = false;
    };
  }, [token]);
  if (!mapId || !event)
    return (
      <Empty icon={MapPin} title="Choose a map for this story">
        Link a map to the event or choose a default in Timeline settings.
      </Empty>
    );
  if (error?.token === token) return <ErrorBox message={error.message} />;
  if (result?.token !== token)
    return (
      <div className="page-loading">
        <Loader2 size={18} className="spin" /> Opening historical map…
      </div>
    );
  const state = result.value,
    marker = state.data.markers?.find(
      (m: any) => m.id === event.data.marker_id,
    );
  return (
    <div className="historical-map-state">
      <div className="historical-map-caption">
        <strong>{state.version?.name || "Base map"}</strong>
        {state.effective_label && <span>From {state.effective_label}</span>}
      </div>
      {state.warnings.map((message) => (
        <div className="notice" key={message}>
          {message}
        </div>
      ))}
      <MapCanvas
        asset={ctx.assets.find((a) => a.id === state.data.asset_id)}
        assets={ctx.assets}
        data={state.data}
        readOnly
        focus={marker}
        mapKey={mapId + ":" + (state.version?.id || "base")}
        onSelect={(id) => {
          if (id) onMarker?.(id);
        }}
      />
    </div>
  );
}
