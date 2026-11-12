import { Asset } from "./domain";

// Fixed geometry only. Labels use text nodes; imported marker HTML is never executed.
export const markerSymbols: Record<string, string> = {
  pin: "M12 22s8-8 8-14a8 8 0 1 0-16 0c0 6 8 14 8 14Z M12 5v6 M9 8h6",
  castle: "M3 22V5h4v4h3V3h4v6h3V5h4v17Z M10 22v-6h4v6",
  home: "M2 11 12 2l10 9 M5 9v13h14V9 M10 22v-8h4v8",
  temple: "M2 8 12 2l10 6Z M4 11v8 M9 11v8 M15 11v8 M20 11v8 M2 22h20",
  forest: "M12 2 4 13h4l-5 6h18l-5-6h4Z M12 19v4",
  mountain: "m2 22 7-16 5 9 3-6 5 13Z M6 13l3 2 3-2",
  water:
    "M12 2C10 6 4 11 4 16a8 8 0 0 0 16 0c0-5-6-10-8-14Z M8 16a4 4 0 0 0 4 4",
  cave: "M2 22 6 8l6-6 6 6 4 14Z M8 22v-6a4 4 0 0 1 8 0v6",
  camp: "M2 22 12 2l10 20Z M7 22l5-10 5 10 M12 2V0",
  treasure:
    "M3 10h18v12H3Z M3 10V5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5 M2 13h20 M10 11h4v5h-4Z",
  danger: "M12 2 1 22h22Z M12 8v7 M12 18v1",
  portal:
    "M12 2a8 10 0 1 0 0 20 8 10 0 1 0 0-20Z M12 6a4 6 0 1 0 0 12 4 6 0 1 0 0-12Z",
};

export function mapIcon(
  marker: Record<string, any>,
  assets: Asset[],
  color: string,
) {
  const element = document.createElement("div"),
    asset = assets.find((a) => a.id === marker.icon_asset_id);
  element.className = "map-custom-marker";
  element.dataset.symbol = marker.symbol || "pin";
  element.title = marker.label || "Location";
  if (asset) {
    const image = document.createElement("img");
    image.src = asset.url;
    image.alt = marker.label || "Location";
    element.append(image);
  } else {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "var(--surface, #202026)");
    svg.setAttribute("stroke", color);
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linejoin", "round");
    path.setAttribute("d", markerSymbols[marker.symbol] || markerSymbols.pin);
    svg.append(path);
    element.append(svg);
  }
  return element;
}
