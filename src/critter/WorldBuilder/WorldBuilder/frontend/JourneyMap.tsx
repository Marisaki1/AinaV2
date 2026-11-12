import React from "react";
import { AppContext, Entry } from "./domain";

export type Waypoint = {
  x: number;
  y: number;
  label: string;
  location_id: string;
};
export function JourneyMap({
  ctx,
  map,
  points,
  onAdd,
}: {
  ctx: AppContext;
  map?: Entry;
  points: Waypoint[];
  onAdd?: (p: Waypoint) => void;
}) {
  const asset = ctx.assets.find((a) => a.id === map?.data.asset_id);
  if (!asset)
    return (
      <p className="notice">
        Choose a map with an image to view or draw this journey.
      </p>
    );
  const height = (1000 * asset.height) / Math.max(1, asset.width);
  return (
    <div className="journey-map">
      <svg
        viewBox={`0 0 1000 ${height}`}
        role="img"
        aria-label="Campaign journey map"
        onClick={
          onAdd
            ? (event) => {
                const matrix = event.currentTarget.getScreenCTM();
                if (!matrix) return;
                const point = new DOMPoint(
                    event.clientX,
                    event.clientY,
                  ).matrixTransform(matrix.inverse()),
                  x = point.x / 1000,
                  y = point.y / height;
                if (x < 0 || x > 1 || y < 0 || y > 1) return;
                onAdd({
                  x,
                  y,
                  label: `Stop ${points.length + 1}`,
                  location_id: "",
                });
              }
            : undefined
        }
      >
        <image href={asset.url} width="1000" height={height} />
        {(map?.data.markers || [])
          .filter((m: any) => Number.isFinite(m.x) && Number.isFinite(m.y))
          .map((m: any) => (
            <g
              key={m.id}
              data-journey-map-marker={m.id}
              onClick={
                onAdd
                  ? (e) => {
                      e.stopPropagation();
                      const location = ctx.entries.find(
                        (r) => r.id === m.link_id,
                      );
                      onAdd({
                        x: m.x,
                        y: m.y,
                        label: m.label || location?.title || "Map location",
                        location_id:
                          location &&
                          ["settlement", "building", "geography"].includes(
                            location.template,
                          )
                            ? location.id
                            : "",
                      });
                    }
                  : undefined
              }
            >
              <circle
                cx={m.x * 1000}
                cy={m.y * height}
                r="10"
                fill="#315548"
                stroke="#fffdf7"
                strokeWidth="2"
              />
              <text
                x={m.x * 1000 + 14}
                y={m.y * height - 10}
                fontSize="16"
                fill="#182f27"
                stroke="#fffdf7"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {m.label || "Map location"}
              </text>
            </g>
          ))}
        <polyline
          points={points.map((p) => `${p.x * 1000},${p.y * height}`).join(" ")}
          fill="none"
          stroke="#9e3e30"
          strokeWidth="4"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <g key={i} data-journey-point={i}>
            <circle
              cx={p.x * 1000}
              cy={p.y * height}
              r="14"
              fill="#fffdf7"
              stroke="#9e3e30"
              strokeWidth="2"
            />
            <text
              x={p.x * 1000}
              y={p.y * height + 5}
              textAnchor="middle"
              fontSize="16"
              fill="#182f27"
            >
              {i + 1}
            </text>
            <title>{p.label}</title>
          </g>
        ))}
      </svg>
      {onAdd && (
        <p className="muted small-copy">
          Click the image to add stops. The numbered list below also supports
          adding, moving and removing waypoints.
        </p>
      )}
    </div>
  );
}
