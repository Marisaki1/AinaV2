import { DayPeriodPicker } from "./SpecialDays";
import { SearchableSelect } from "./SearchableSelect";
import { mapIcon, markerSymbols } from "./MapIcons";
import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Circle,
  Eye,
  EyeOff,
  Focus,
  Layers,
  LockKeyhole,
  MapPin,
  MousePointer2,
  Plus,
  Route,
  Save,
  Shapes,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { AppContext, Asset, uid, human, post } from "./domain";
import { Badge, Empty, EntryPicker, Field, Modal, ErrorBox } from "./ui";

const clamp = (value: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, value));
const center = (marker: any) =>
  marker.points?.length
    ? [
        marker.points.reduce((s: number, p: number[]) => s + p[0], 0) /
          marker.points.length,
        marker.points.reduce((s: number, p: number[]) => s + p[1], 0) /
          marker.points.length,
      ]
    : [marker.x ?? 0, marker.y ?? 0];
const percent = (value: number) => Math.round(value * 10000) / 100;

export function MapCanvas({
  asset,
  assets = [],
  data,
  onData,
  readOnly = false,
  focus,
  mapKey,
  selectedId,
  onSelect,
  inspectLinks = false,
}: {
  asset?: Asset;
  assets?: Asset[];
  data: Record<string, any>;
  onData?: (data: Record<string, any>) => void;
  readOnly?: boolean;
  focus?: any;
  mapKey?: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  inspectLinks?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    graphics = useRef<L.LayerGroup | null>(null),
    markerLayers = useRef(new Map<string, L.Layer>()),
    fitZoom = useRef(0),
    latest = useRef({ data, onData, readOnly, onSelect });
  latest.current = { data, onData, readOnly, onSelect };
  const [tool, setTool] = useState("select"),
    toolRef = useRef(tool),
    [points, setPoints] = useState<number[][]>([]),
    [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({}),
    [layerOverrides, setLayerOverrides] = useState<Record<string, boolean>>({}),
    [localSelected, setLocalSelected] = useState<string | null>(null),
    [locations, setLocations] = useState(false);
  toolRef.current = tool;
  const selected = selectedId === undefined ? localSelected : selectedId;
  const choose = (id: string | null) => {
    setLocalSelected(id);
    latest.current.onSelect?.(id);
  };
  const restore = (view = data.default_view) => {
    if (!map.current || !asset) return;
    if (view) {
      map.current.setView(
        [(1 - view.y) * asset.height, view.x * asset.width],
        clamp(fitZoom.current + (view.zoom_delta || 0), -24, 6),
      );
    } else
      map.current.fitBounds([
        [0, 0],
        [asset.height, asset.width],
      ]);
  };
  useEffect(() => {
    if (!element.current || !asset) return;
    setGroupOverrides({});
    setLayerOverrides({});
    setPoints([]);
    setTool("select");
    const instance = L.map(element.current, {
      crs: L.CRS.Simple,
      minZoom: -24,
      maxZoom: 6,
      attributionControl: false,
      zoomControl: true,
    });
    map.current = instance;
    const bounds: L.LatLngBoundsExpression = [
      [0, 0],
      [asset.height, asset.width],
    ];
    L.imageOverlay(asset.url, bounds).addTo(instance);
    instance.fitBounds(bounds);
    fitZoom.current = instance.getZoom();
    graphics.current = L.layerGroup().addTo(instance);
    const view = latest.current.data.default_view;
    if (view)
      instance.setView(
        [(1 - view.y) * asset.height, view.x * asset.width],
        clamp(fitZoom.current + (view.zoom_delta || 0), -24, 6),
      );
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    instance.on("click", (event: L.LeafletMouseEvent) => {
      const state = latest.current,
        active = toolRef.current;
      if (state.readOnly || active === "select") return;
      const point = [
        clamp(event.latlng.lng / asset.width),
        clamp(1 - event.latlng.lat / asset.height),
      ];
      if (active === "line" || active === "polygon") {
        setPoints((old) => [...old, point]);
        return;
      }
      const marker = {
        id: uid(),
        type: active,
        x: point[0],
        y: point[1],
        label:
          active === "label"
            ? "Map label"
            : active === "hotspot"
              ? "Hidden hotspot"
              : "New location",
        radius: 0.05,
        color: "#c18d44",
        private: false,
        group: "",
      };
      state.onData?.({
        ...state.data,
        markers: [...(state.data.markers || []), marker],
      });
      choose(marker.id);
      setTool("select");
    });
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      markerLayers.current.clear();
    };
  }, [asset?.id, mapKey]);
  useEffect(() => {
    if (!map.current || !graphics.current || !asset) return;
    const layers = graphics.current;
    layers.clearLayers();
    markerLayers.current.clear();
    const coordinate = (p: number[]): L.LatLngTuple => [
      (1 - p[1]) * asset.height,
      p[0] * asset.width,
    ];
    for (const overlay of data.layers || []) {
      const image =
        assets.find((a) => a.id === overlay.asset_id) || overlay.asset;
      if (image && (layerOverrides[overlay.id] ?? overlay.visible !== false))
        L.imageOverlay(
          image.url,
          [
            [0, 0],
            [asset.height, asset.width],
          ],
          { opacity: overlay.opacity ?? 0.72 },
        ).addTo(layers);
    }
    for (const marker of data.markers || []) {
      const group = (data.groups || []).find((g: any) => g.id === marker.group);
      if (group && !(groupOverrides[group.id] ?? group.visible !== false))
        continue;
      const color = /^#[0-9a-f]{6}$/i.test(marker.color || "")
        ? marker.color
        : "#c18d44";
      let layer: L.Layer;
      if (marker.type === "line" || marker.type === "polygon") {
        const ps = (marker.points || []).map(coordinate);
        layer =
          marker.type === "line"
            ? L.polyline(ps, { color, weight: 3 })
            : L.polygon(ps, { color, fillOpacity: 0.2 });
      } else if (marker.type === "circle" || marker.type === "hotspot") {
        const hotspot = marker.type === "hotspot";
        layer = L.circle(coordinate([marker.x, marker.y]), {
          radius: (marker.radius || 0.05) * asset.width,
          color,
          weight: hotspot ? (readOnly ? 0 : 2) : 2,
          opacity: hotspot && readOnly ? 0 : 1,
          fillOpacity: hotspot ? (readOnly ? 0 : 0.08) : 0.2,
          dashArray: hotspot ? "5 5" : undefined,
          className: hotspot ? "map-hotspot" : "",
        });
      } else {
        const customIcon =
          marker.type !== "label" &&
          (marker.symbol || marker.icon_asset_id || marker.icon_size);
        const size = marker.icon_size || 32;
        const pin = customIcon
          ? mapIcon(marker, assets, color)
          : document.createElement("div");
        if (!customIcon)
          pin.className = marker.type === "label" ? "map-label" : "map-pin";
        if (!customIcon)
          pin.textContent = marker.type === "label" ? marker.label : "●";
        pin.style.setProperty("--pin", color);
        pin.title = marker.label;
        layer = L.marker(coordinate([marker.x, marker.y]), {
          icon: L.divIcon({
            html: pin,
            className: "map-marker",
            iconSize: customIcon
              ? [size, size]
              : marker.type === "label"
                ? [140, 30]
                : [26, 30],
            iconAnchor: customIcon ? [size / 2, size] : [13, 25],
          }),
          draggable: !readOnly && tool === "select",
        });
        if (!readOnly)
          layer.on("dragend", (event: any) => {
            const pos = event.target.getLatLng(),
              state = latest.current;
            state.onData?.({
              ...state.data,
              markers: (state.data.markers || []).map((m: any) =>
                m.id === marker.id
                  ? {
                      ...m,
                      x: clamp(pos.lng / asset.width),
                      y: clamp(1 - pos.lat / asset.height),
                    }
                  : m,
              ),
            });
          });
      }
      const popup = document.createElement("div"),
        title = document.createElement("strong");
      title.textContent = marker.label || "Location";
      popup.append(title);
      if (marker.link_id) {
        const link = document.createElement(inspectLinks ? "button" : "a");
        if (link instanceof HTMLAnchorElement)
          link.href = "/#/entry/" + encodeURIComponent(marker.link_id);
        else link.addEventListener("click", () => choose(marker.id));
        link.textContent = inspectLinks
          ? "Inspect location notes"
          : "Open linked entry →";
        link.className = "map-popup-link";
        popup.append(link);
      }
      layer.bindPopup(popup);
      layer.on("click", (event: any) => {
        if (event.originalEvent)
          L.DomEvent.stopPropagation(event.originalEvent);
        choose(marker.id);
      });
      layer.addTo(layers);
      markerLayers.current.set(marker.id, layer);
    }
    if (points.length)
      L.polyline(points.map(coordinate), {
        color: "#fff",
        dashArray: "5,6",
      }).addTo(layers);
  }, [
    asset?.id,
    mapKey,
    assets,
    data,
    points,
    tool,
    readOnly,
    groupOverrides,
    layerOverrides,
    inspectLinks,
  ]);
  const focusMarker = (marker: any) => {
    if (!map.current || !asset || !marker) return;
    const [x, y] = center(marker);
    if (Number.isFinite(x) && Number.isFinite(y))
      map.current.flyTo(
        [(1 - y) * asset.height, x * asset.width],
        Math.min(6, Math.max(map.current.getZoom(), fitZoom.current + 1)),
        { duration: 0.3 },
      );
  };
  useEffect(() => {
    focusMarker(focus);
  }, [
    focus?.id,
    focus?.x,
    focus?.y,
    JSON.stringify(focus?.points),
    asset?.id,
    mapKey,
  ]);
  const marker = (data.markers || []).find((m: any) => m.id === selected);
  const update = (patch: Record<string, any>) =>
    onData?.({
      ...data,
      markers: (data.markers || []).map((m: any) =>
        m.id === selected ? { ...m, ...patch } : m,
      ),
    });
  if (!asset)
    return (
      <Empty icon={MapPin} title="Give this map a canvas">
        Choose an image from your media library to start adding locations.
      </Empty>
    );
  return (
    <div className="map-workspace">
      <div
        className="map-canvas"
        ref={element}
        aria-label="Interactive world map"
      />
      {!readOnly && (
        <div
          className="map-tools"
          role="toolbar"
          aria-label="Map drawing tools"
        >
          {[
            ["select", MousePointer2],
            ["pin", MapPin],
            ["label", Type],
            ["line", Route],
            ["polygon", Shapes],
            ["circle", Circle],
            ["hotspot", EyeOff],
          ].map(([name, Icon]: any) => (
            <button
              key={name}
              aria-label={human(name) + " tool"}
              title={human(name)}
              className={tool === name ? "selected" : ""}
              onClick={() => {
                setTool(name);
                setPoints([]);
              }}
            >
              <Icon size={17} />
            </button>
          ))}
          {points.length > 0 && (
            <>
              <button
                disabled={points.length < (tool === "polygon" ? 3 : 2)}
                onClick={() => {
                  const shape = {
                    id: uid(),
                    type: tool,
                    points,
                    label: tool === "polygon" ? "Region" : "Route",
                    color: "#c18d44",
                    group: "",
                  };
                  onData?.({
                    ...data,
                    markers: [...(data.markers || []), shape],
                  });
                  choose(shape.id);
                  setPoints([]);
                  setTool("select");
                }}
              >
                <Check size={16} />
                Finish
              </button>
              <button
                aria-label="Cancel drawing"
                onClick={() => {
                  setPoints([]);
                  setTool("select");
                }}
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>
      )}
      <div className="map-view-controls">
        <button className="text-button" onClick={() => restore(null)}>
          <Focus size={15} />
          Fit map
        </button>
        {data.default_view && (
          <button className="text-button" onClick={() => restore()}>
            <Eye size={15} />
            Saved view
          </button>
        )}
        {!readOnly && (
          <button
            className="text-button"
            onClick={() => {
              if (!map.current) return;
              const pos = map.current.getCenter();
              onData?.({
                ...data,
                default_view: {
                  x: clamp(pos.lng / asset.width),
                  y: clamp(1 - pos.lat / asset.height),
                  zoom_delta: clamp(
                    map.current.getZoom() - fitZoom.current,
                    -8,
                    8,
                  ),
                },
              });
            }}
          >
            <Save size={15} />
            Save current view
          </button>
        )}
        {!readOnly && data.default_view && (
          <button
            className="text-button"
            onClick={() => {
              const { default_view, ...rest } = data;
              onData?.(rest);
            }}
          >
            Clear saved view
          </button>
        )}
        <button
          className="text-button"
          onClick={() => setLocations(!locations)}
          aria-expanded={locations}
        >
          <MapPin size={14} />
          Locations
        </button>
      </div>
      {!!(data.groups || []).length && (
        <div className="map-group-toggles" aria-label="Visible marker groups">
          {data.groups.map((group: any) => (
            <label key={group.id}>
              <input
                type="checkbox"
                checked={groupOverrides[group.id] ?? group.visible !== false}
                onChange={(e) =>
                  readOnly
                    ? setGroupOverrides({
                        ...groupOverrides,
                        [group.id]: e.target.checked,
                      })
                    : onData?.({
                        ...data,
                        groups: data.groups.map((g: any) =>
                          g.id === group.id
                            ? { ...g, visible: e.target.checked }
                            : g,
                        ),
                      })
                }
              />
              {group.private && <LockKeyhole size={12} />}{" "}
              {group.name || "Unnamed group"}
            </label>
          ))}
        </div>
      )}
      {readOnly && !!(data.layers || []).length && (
        <div className="map-group-toggles" aria-label="Visible map layers">
          {data.layers.map((layer: any) => (
            <label key={layer.id}>
              <input
                type="checkbox"
                checked={layerOverrides[layer.id] ?? layer.visible !== false}
                onChange={(e) =>
                  setLayerOverrides({
                    ...layerOverrides,
                    [layer.id]: e.target.checked,
                  })
                }
              />
              {layer.name || "Image layer"}
            </label>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="map-caption">
          {tool === "select"
            ? "Choose a marker to edit it, or drag a pin."
            : tool === "line" || tool === "polygon"
              ? "Click to add vertices, then choose Finish."
              : "Click the map to place a " + tool + "."}
        </div>
      )}
      {locations && (
        <div className="map-location-browser">
          {(data.markers || []).map((m: any) => (
            <button
              key={m.id}
              onClick={() => {
                choose(m.id);
                focusMarker(m);
                markerLayers.current.get(m.id)?.openPopup();
              }}
            >
              {m.private && <LockKeyhole size={12} />}
              <span>{m.label || human(m.type)}</span>
            </button>
          ))}
        </div>
      )}
      {!readOnly && marker && (
        <div className="map-selection">
          <Field
            label="Marker label"
            value={marker.label || ""}
            onChange={(v) => update({ label: v })}
          />
          <Field
            label="Color"
            type="color"
            value={marker.color || "#c18d44"}
            onChange={(v) => update({ color: v })}
          />
          <label className="check-label">
            <input
              type="checkbox"
              checked={!!marker.private}
              onChange={(e) => update({ private: e.target.checked })}
            />
            GM only
          </label>
          <button
            className="button danger small"
            onClick={() => {
              onData?.({
                ...data,
                markers: data.markers.filter((m: any) => m.id !== selected),
              });
              choose(null);
            }}
          >
            <Trash2 size={15} />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

export function MapEditor({
  data,
  setData,
  ctx,
  mapKey,
}: {
  data: Record<string, any>;
  setData: (data: Record<string, any>) => void;
  ctx: AppContext;
  mapKey?: string;
}) {
  const [selected, setSelected] = useState(""),
    [creating, setCreating] = useState(false),
    [deleting, setDeleting] = useState(false),
    [name, setName] = useState(""),
    [year, setYear] = useState(1),
    [month, setMonth] = useState(1),
    [day, setDay] = useState(1),
    [specialDay, setSpecialDay] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const versions: any[] = data.versions || [],
    version = versions.find((v) => v.id === selected),
    scene = version?.scene || data;
  const calendar = ctx.entries.find((entry) => entry.id === data.calendar_id);
  const periodOrder = (value: any) => {
    if (!value.special_day_id) return [value.month * 2, 0];
    const periods = calendar?.data.special_days || [];
    const index = periods.findIndex(
      (row: any) => row.id === value.special_day_id,
    );
    const period = periods[index];
    return [
      (period?.after_month ?? calendar?.data.months?.length ?? value.month) *
        2 +
        1,
      index,
    ];
  };
  useEffect(() => {
    setSelected("");
  }, [mapKey]);
  const patch = (patch: Record<string, any>) =>
    setData({
      ...data,
      versions: versions.map((v) =>
        v.id === version?.id ? { ...v, ...patch } : v,
      ),
    });
  const capture = () => {
    setName("New historical version");
    setYear(
      Math.min(1000000000, Math.max(0, ...versions.map((v) => v.year)) + 1),
    );
    setMonth(1);
    setSpecialDay("");
    setDay(1);
    setError("");
    setCreating(true);
  };
  return (
    <>
      <section className="map-history-editor">
        <div className="section-heading">
          <div>
            <h3>Map through time</h3>
            <p className="muted small-copy">
              The base map applies before the first version. Each dated version
              keeps its own image, markers, borders and overlays.
            </p>
          </div>
          <button
            className="button secondary small"
            disabled={versions.length >= 100}
            onClick={capture}
          >
            <Plus size={15} />
            Capture version
          </button>
        </div>
        <div className="field-grid">
          <EntryPicker
            label="Historical map calendar"
            value={data.calendar_id || ""}
            onChange={(calendar_id) => setData({ ...data, calendar_id })}
            entries={ctx.entries.filter((e) => e.kind === "calendar")}
            empty="Recorded years · no custom calendar"
          />
          <label className="field">
            <span>Editing map state</span>
            <SearchableSelect
              aria-label="Editing map state"
              value={version?.id || ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Base map</option>
              {[...versions]
                .sort((a, b) => {
                  const left = periodOrder(a),
                    right = periodOrder(b);
                  return (
                    a.year - b.year ||
                    left[0] - right[0] ||
                    left[1] - right[1] ||
                    a.day - b.day
                  );
                })
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.year} · {v.name}
                    {v.private ? " · GM only" : ""}
                  </option>
                ))}
            </SearchableSelect>
          </label>
        </div>
        {version && (
          <>
            <Field
              label="Version name"
              value={version.name}
              onChange={(name) => patch({ name })}
            />
            <div className="field-grid three">
              <Field
                label="Effective year"
                type="number"
                value={version.year}
                onChange={(year) => patch({ year })}
              />
              <DayPeriodPicker
                calendar={
                  ctx.entries.find((e) => e.id === data.calendar_id)?.data
                }
                value={version.special_day_id}
                label="Effective date period"
                onChange={(value) => patch({ special_day_id: value, day: 1 })}
              />
              {!version.special_day_id && (
                <Field
                  label="Effective month"
                  type="number"
                  min={1}
                  max={60}
                  value={version.month || 1}
                  onChange={(month) => patch({ month })}
                />
              )}
              <Field
                label="Effective day"
                type="number"
                min={1}
                max={2000}
                value={version.day || 1}
                onChange={(day) => patch({ day })}
              />
            </div>
            <div className="button-row">
              <label className="check-label">
                <input
                  aria-label="Private historical version"
                  type="checkbox"
                  checked={!!version.private}
                  onChange={(e) => patch({ private: e.target.checked })}
                />
                GM only version
              </label>
              <button
                className="text-button danger"
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={14} />
                Delete version
              </button>
            </div>
          </>
        )}
        <p className="muted small-copy">
          Chronicles choose the latest version on or before an event in the same
          calendar. Reader views skip GM-only versions and retain the latest
          shared state. Versions are independent copies; later edits to the base
          do not alter them.
        </p>
      </section>
      <MapSceneEditor
        key={(mapKey || "") + ":" + (version?.id || "base")}
        data={scene}
        ctx={ctx}
        mapKey={mapKey}
        setData={(value) =>
          version ? patch({ scene: value }) : setData(value)
        }
      />
      {creating && (
        <Modal
          title="Capture a historical map version"
          onClose={() => !busy && setCreating(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (
                  versions.some(
                    (v) =>
                      v.year === year &&
                      (specialDay || (v.month || 1) === month) &&
                      (v.special_day_id || "") === specialDay &&
                      (v.day || 1) === day,
                  )
                )
                  throw new Error(
                    "Choose a date different from the existing versions.",
                  );
                const calendar = ctx.entries.find(
                  (c) => c.id === data.calendar_id,
                );
                if (calendar)
                  await post("/tools/calendar", {
                    calendar: calendar.data,
                    year,
                    month,
                    day,
                    special_day_id: specialDay || undefined,
                  });
                const id = uid(),
                  copy: Record<string, any> = {};
                for (const k of [
                  "asset_id",
                  "markers",
                  "groups",
                  "layers",
                  "default_view",
                ])
                  if (scene[k] !== undefined)
                    copy[k] = JSON.parse(JSON.stringify(scene[k]));
                setData({
                  ...data,
                  versions: [
                    ...versions,
                    {
                      id,
                      name: name.trim(),
                      year,
                      month,
                      day,
                      ...(specialDay ? { special_day_id: specialDay } : {}),
                      private: !!version?.private,
                      scene: copy,
                    },
                  ],
                });
                setSelected(id);
                setCreating(false);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Historical version name"
              value={name}
              onChange={setName}
            />
            <div className="field-grid three">
              <Field
                label="Version year"
                type="number"
                min={-1000000000}
                max={1000000000}
                value={year}
                onChange={setYear}
              />
              <DayPeriodPicker
                calendar={
                  ctx.entries.find((e) => e.id === data.calendar_id)?.data
                }
                value={specialDay}
                label="Version date period"
                onChange={(value) => {
                  setSpecialDay(value);
                  setDay(1);
                }}
              />
              {!specialDay && (
                <Field
                  label="Version month"
                  type="number"
                  min={1}
                  max={60}
                  value={month}
                  onChange={setMonth}
                />
              )}
              <Field
                label="Version day"
                type="number"
                min={1}
                max={2000}
                value={day}
                onChange={setDay}
              />
            </div>
            {error && <ErrorBox message={error} />}
            <p className="muted small-copy">
              Copies the state currently shown in the editor. Changes start as a
              draft until you save a reader version.
            </p>
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
                disabled={busy || !name.trim()}
              >
                {busy ? "Checking date…" : "Capture map state"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && version && (
        <Modal
          title="Delete historical map version"
          onClose={() => setDeleting(false)}
        >
          <p>
            Delete {version.name}? Earlier versions and the base map remain. You
            can recover this change through entry revisions.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(false)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              onClick={() => {
                setData({
                  ...data,
                  versions: versions.filter((v) => v.id !== version.id),
                });
                setSelected("");
                setDeleting(false);
              }}
            >
              Delete this version
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function MapSceneEditor({
  data,
  setData,
  ctx,
  mapKey,
}: {
  data: Record<string, any>;
  setData: (v: Record<string, any>) => void;
  ctx: AppContext;
  mapKey?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [focusId, setFocusId] = useState("");
  const marker = (data.markers || []).find((m: any) => m.id === selected),
    asset = ctx.assets.find((a) => a.id === data.asset_id);
  const patchMarker = (patch: any) =>
    setData({
      ...data,
      markers: (data.markers || []).map((m: any) =>
        m.id === selected ? { ...m, ...patch } : m,
      ),
    });
  const reorder = (key: string, index: number, delta: number) => {
    const rows = [...data[key]];
    [rows[index], rows[index + delta]] = [rows[index + delta], rows[index]];
    setData({ ...data, [key]: rows });
  };
  return (
    <>
      <div className="field-grid">
        <label className="field">
          <span>Map image</span>
          <SearchableSelect
            value={data.asset_id || ""}
            onChange={(e) => setData({ ...data, asset_id: e.target.value })}
          >
            <option value="">Choose from Media</option>
            {ctx.assets.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <div className="field">
          <span>Need another image?</span>
          <button className="button secondary" onClick={() => ctx.go("media")}>
            <Upload size={15} />
            Open media library
          </button>
        </div>
      </div>
      <MapCanvas
        asset={asset}
        assets={ctx.assets}
        data={data}
        onData={setData}
        mapKey={mapKey}
        selectedId={selected}
        onSelect={setSelected}
        focus={(data.markers || []).find((m: any) => m.id === focusId)}
      />
      <div className="map-editor-panels">
        <section className="map-marker-panel">
          <div className="section-heading">
            <h3>Locations & markers</h3>
            <span className="muted small-copy">
              {(data.markers || []).length} locations
            </span>
          </div>
          <div className="map-marker-list">
            {(data.markers || []).map((m: any) => (
              <button
                className={selected === m.id ? "active" : ""}
                key={m.id}
                onClick={() => {
                  setSelected(m.id);
                  setFocusId(m.id);
                }}
              >
                <MapPin size={15} />
                <span>{m.label || human(m.type)}</span>
                {m.private && <LockKeyhole size={12} />}
                <small>
                  {(data.groups || []).find((g: any) => g.id === m.group)
                    ?.name || "Ungrouped"}
                </small>
              </button>
            ))}
          </div>
          {marker && (
            <div className="map-marker-inspector">
              <EntryPicker
                label="Linked entry"
                value={marker.link_id || ""}
                onChange={(link_id) => patchMarker({ link_id })}
                entries={ctx.entries.filter((e) => e.id !== mapKey)}
              />
              <label className="field">
                <span>Marker group</span>
                <SearchableSelect
                  value={marker.group || ""}
                  onChange={(e) => patchMarker({ group: e.target.value })}
                >
                  <option value="">Ungrouped</option>
                  {marker.group &&
                    !(data.groups || []).some(
                      (g: any) => g.id === marker.group,
                    ) && (
                      <option value={marker.group}>Unavailable group</option>
                    )}
                  {(data.groups || []).map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.name || "Unnamed group"}
                      {g.private ? " · GM only" : ""}
                    </option>
                  ))}
                </SearchableSelect>
              </label>
              {!["line", "polygon"].includes(marker.type) && (
                <>
                  <label className="field">
                    <span>Marker type</span>
                    <SearchableSelect
                      value={marker.type || "pin"}
                      onChange={(e) =>
                        patchMarker({
                          type: e.target.value,
                          radius: marker.radius || 0.05,
                        })
                      }
                    >
                      {["pin", "label", "circle", "hotspot"].map((t) => (
                        <option value={t} key={t}>
                          {human(t)}
                        </option>
                      ))}
                    </SearchableSelect>
                  </label>
                  <div className="field-grid">
                    <Field
                      label="Across image (%)"
                      type="number"
                      min={0}
                      max={100}
                      value={percent(marker.x || 0)}
                      onChange={(v) => patchMarker({ x: v / 100 })}
                    />
                    <Field
                      label="Down image (%)"
                      type="number"
                      min={0}
                      max={100}
                      value={percent(marker.y || 0)}
                      onChange={(v) => patchMarker({ y: v / 100 })}
                    />
                  </div>
                </>
              )}
              {(marker.type || "pin") === "pin" && (
                <>
                  <label className="field">
                    <span>Marker symbol</span>
                    <SearchableSelect
                      value={marker.symbol || "pin"}
                      onChange={(e) => patchMarker({ symbol: e.target.value })}
                    >
                      {Object.keys(markerSymbols).map((s) => (
                        <option value={s} key={s}>
                          {human(s)}
                        </option>
                      ))}
                    </SearchableSelect>
                  </label>
                  <label className="field">
                    <span>Custom marker image</span>
                    <SearchableSelect
                      value={marker.icon_asset_id || ""}
                      onChange={(e) =>
                        patchMarker({ icon_asset_id: e.target.value })
                      }
                    >
                      <option value="">Use built-in symbol</option>
                      {ctx.assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </SearchableSelect>
                  </label>
                  <Field
                    label="Icon size (pixels)"
                    type="number"
                    min={16}
                    max={64}
                    value={marker.icon_size || 32}
                    onChange={(v) => patchMarker({ icon_size: v })}
                  />
                </>
              )}
              {["circle", "hotspot"].includes(marker.type) && (
                <Field
                  label="Radius (% of image width)"
                  type="number"
                  min={0.01}
                  max={100}
                  value={percent(marker.radius || 0.05)}
                  onChange={(v) => patchMarker({ radius: v / 100 })}
                />
              )}
              {["line", "polygon"].includes(marker.type) && (
                <div className="map-vertices">
                  <h4>Vertices · image percentages</h4>
                  {marker.points.map((p: number[], i: number) => (
                    <div key={i}>
                      <input
                        aria-label={"Vertex " + (i + 1) + " across (%)"}
                        type="number"
                        min={0}
                        max={100}
                        value={percent(p[0])}
                        onChange={(e) =>
                          patchMarker({
                            points: marker.points.map(
                              (point: number[], n: number) =>
                                n === i
                                  ? [Number(e.target.value) / 100, point[1]]
                                  : point,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={"Vertex " + (i + 1) + " down (%)"}
                        type="number"
                        min={0}
                        max={100}
                        value={percent(p[1])}
                        onChange={(e) =>
                          patchMarker({
                            points: marker.points.map(
                              (point: number[], n: number) =>
                                n === i
                                  ? [point[0], Number(e.target.value) / 100]
                                  : point,
                            ),
                          })
                        }
                      />
                      <button
                        className="icon-button"
                        aria-label={"Remove vertex " + (i + 1)}
                        disabled={
                          marker.points.length <=
                          (marker.type === "polygon" ? 3 : 2)
                        }
                        onClick={() =>
                          patchMarker({
                            points: marker.points.filter(
                              (_: any, n: number) => n !== i,
                            ),
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    onClick={() =>
                      patchMarker({
                        points: [...marker.points, [...marker.points.at(-1)]],
                      })
                    }
                  >
                    <Plus size={14} />
                    Add vertex
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
        <section>
          <div className="section-heading">
            <h3>Marker groups</h3>
            <button
              className="text-button"
              onClick={() =>
                setData({
                  ...data,
                  groups: [
                    ...(data.groups || []),
                    {
                      id: uid(),
                      name: "New group",
                      visible: true,
                      private: false,
                    },
                  ],
                })
              }
            >
              <Plus size={15} />
              Add group
            </button>
          </div>
          <p className="muted small-copy">
            Private groups and their markers are excluded from reader views.
            Deleting a private group keeps its markers private.
          </p>
          {(data.groups || []).map((group: any) => (
            <div className="map-group-editor" key={group.id}>
              <input
                aria-label="Group name"
                value={group.name}
                onChange={(e) =>
                  setData({
                    ...data,
                    groups: data.groups.map((g: any) =>
                      g.id === group.id ? { ...g, name: e.target.value } : g,
                    ),
                  })
                }
              />
              <label className="check-label">
                <input
                  aria-label={"Private group " + group.name}
                  type="checkbox"
                  checked={!!group.private}
                  onChange={(e) =>
                    setData({
                      ...data,
                      groups: data.groups.map((g: any) =>
                        g.id === group.id
                          ? { ...g, private: e.target.checked }
                          : g,
                      ),
                    })
                  }
                />
                GM only
              </label>
              <button
                className="icon-button"
                aria-label={"Remove group " + group.name}
                onClick={() =>
                  setData({
                    ...data,
                    groups: data.groups.filter((g: any) => g.id !== group.id),
                    markers: (data.markers || []).map((m: any) =>
                      m.group === group.id
                        ? {
                            ...m,
                            group: "",
                            private: !!m.private || !!group.private,
                          }
                        : m,
                    ),
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div className="section-heading map-layer-heading">
            <h3>Image layers</h3>
            <button
              className="text-button"
              onClick={() =>
                setData({
                  ...data,
                  layers: [
                    ...(data.layers || []),
                    {
                      id: uid(),
                      name: "New layer",
                      asset_id: "",
                      visible: true,
                      private: false,
                      opacity: 0.72,
                    },
                  ],
                })
              }
            >
              <Plus size={15} />
              Add layer
            </button>
          </div>
          {(data.layers || []).map((layer: any, index: number) => (
            <div className="map-layer-editor" key={layer.id}>
              <div className="map-layer-name">
                <input
                  aria-label="Layer name"
                  value={layer.name}
                  onChange={(e) =>
                    setData({
                      ...data,
                      layers: data.layers.map((l: any) =>
                        l.id === layer.id ? { ...l, name: e.target.value } : l,
                      ),
                    })
                  }
                />
                <button
                  className="icon-button"
                  aria-label={"Move layer " + layer.name + " down"}
                  disabled={index === 0}
                  onClick={() => reorder("layers", index, -1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={"Move layer " + layer.name + " up"}
                  disabled={index === data.layers.length - 1}
                  onClick={() => reorder("layers", index, 1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={"Remove layer " + layer.name}
                  onClick={() =>
                    setData({
                      ...data,
                      layers: data.layers.filter((l: any) => l.id !== layer.id),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <SearchableSelect
                aria-label="Layer image"
                value={layer.asset_id || ""}
                onChange={(e) =>
                  setData({
                    ...data,
                    layers: data.layers.map((l: any) =>
                      l.id === layer.id
                        ? { ...l, asset_id: e.target.value }
                        : l,
                    ),
                  })
                }
              >
                <option value="">Choose an image</option>
                {ctx.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SearchableSelect>
              <div className="map-layer-options">
                <label className="check-label">
                  <input
                    aria-label={"Visible layer " + layer.name}
                    type="checkbox"
                    checked={layer.visible !== false}
                    onChange={(e) =>
                      setData({
                        ...data,
                        layers: data.layers.map((l: any) =>
                          l.id === layer.id
                            ? { ...l, visible: e.target.checked }
                            : l,
                        ),
                      })
                    }
                  />
                  Visible
                </label>
                <label className="check-label">
                  <input
                    aria-label={"Private layer " + layer.name}
                    type="checkbox"
                    checked={!!layer.private}
                    onChange={(e) =>
                      setData({
                        ...data,
                        layers: data.layers.map((l: any) =>
                          l.id === layer.id
                            ? { ...l, private: e.target.checked }
                            : l,
                        ),
                      })
                    }
                  />
                  GM only
                </label>
              </div>
              <label className="layer-opacity">
                Opacity{" "}
                <input
                  aria-label={"Opacity of " + layer.name}
                  type="range"
                  min={0}
                  max={100}
                  value={percent(layer.opacity ?? 0.72)}
                  onChange={(e) =>
                    setData({
                      ...data,
                      layers: data.layers.map((l: any) =>
                        l.id === layer.id
                          ? { ...l, opacity: Number(e.target.value) / 100 }
                          : l,
                      ),
                    })
                  }
                />
                <span>{percent(layer.opacity ?? 0.72)}%</span>
              </label>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
