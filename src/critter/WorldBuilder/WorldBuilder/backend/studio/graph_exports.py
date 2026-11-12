"""Self-contained graph artifacts; no remote assets or article/GM bodies."""

import base64
import hashlib
import json
from collections import defaultdict
from html import escape
from xml.etree import ElementTree as ET
from django.utils import timezone

NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)


def edge_label(edge):
    label = edge.get("label") or edge["kind"]
    return label + (
        f" ({edge.get('strength', 0)})" if edge["kind"] == "diplomacy" else ""
    )


def svg_graph(graph, list_links=False):
    columns = defaultdict(int)
    positions = {}
    for node in graph["nodes"]:
        level = node.get("level", node.get("depth", 0))
        positions[node["id"]] = (30 + columns[level] * 245, 35 + level * 150)
        columns[level] += 1
    width = max([600, *(x + 260 for x, y in positions.values())])
    height = max([200, *(y + 125 for x, y in positions.values())])
    root = ET.Element(
        f"{{{NS}}}svg",
        {
            "viewBox": f"0 0 {width} {height}",
            "width": str(width),
            "height": str(height),
            "role": "img",
            "aria-labelledby": "graph-title graph-description",
        },
    )

    def child(parent, name, attrs=None, text=None):
        node = ET.SubElement(parent, f"{{{NS}}}{name}", attrs or {})
        node.text = text
        return node

    child(root, "title", {"id": "graph-title"}, graph["view"]["title"])
    child(
        root,
        "desc",
        {"id": "graph-description"},
        f"{len(graph['nodes'])} entries and {len(graph['edges'])} connections. Full names are retained in node titles.",
    )
    child(
        root,
        "style",
        text="text{font-family:Segoe UI,Arial,sans-serif;fill:#31533e} .node-title{font-size:13px} .node-detail{font-size:10px;fill:#6c7d64} a:focus rect,a:hover rect{stroke:#607e4a;stroke-width:3}",
    )
    defs = child(root, "defs")
    marker = child(
        defs,
        "marker",
        {
            "id": "graph-arrow",
            "viewBox": "0 0 10 10",
            "refX": "9",
            "refY": "5",
            "markerWidth": "6",
            "markerHeight": "6",
            "orient": "auto",
        },
    )
    child(marker, "path", {"d": "M0 0 10 5 0 10Z", "fill": "#8e9d84"})
    child(root, "rect", {"width": "100%", "height": "100%", "fill": "#fafcf3"})
    for edge in graph["edges"]:
        if edge["source"] not in positions or edge["target"] not in positions:
            continue
        ax, ay = positions[edge["source"]]
        bx, by = positions[edge["target"]]
        symmetric = edge["kind"] in ("spouse", "sibling")
        path = (
            f"M{ax + 95},{ay} Q{(ax + bx) / 2 + 95},{ay - 32} {bx + 95},{by}"
            if ay == by
            else f"M{ax + 190},{ay + 45} C{ax + 230},{ay + 45} {bx + 230},{by + 45} {bx + 190},{by + 45}"
            if symmetric
            else f"M{ax + 95},{ay + 90} C{ax + 95},{ay + 120} {bx + 95},{by - 35} {bx + 95},{by}"
        )
        attrs = {
            "d": path,
            "fill": "none",
            "stroke": "#a5b59c",
            "stroke-width": "2",
            "data-edge": edge["id"],
        }
        if not symmetric:
            attrs["marker-end"] = "url(#graph-arrow)"
        if edge["kind"] == "adoptive-parent":
            attrs["stroke-dasharray"] = "6 4"
        element = child(root, "path", attrs)
        child(
            element,
            "title",
            text=(edge.get("label") or edge["kind"])
            + (f" ({edge.get('strength', 0)})" if edge["kind"] == "diplomacy" else ""),
        )
    for node in graph["nodes"]:
        x, y = positions[node["id"]]
        anchor = child(
            root,
            "a",
            {
                "href": ("#node-" if list_links else "#diagram-") + node["id"],
                "aria-label": node["title"],
            },
        )
        group = child(
            anchor,
            "g",
            {
                "id": "diagram-" + node["id"],
                "data-node": node["id"],
                "data-title": node["title"],
                "transform": f"translate({x},{y})",
            },
        )
        child(group, "title", text=node["title"])
        child(
            group,
            "rect",
            {
                "width": "190",
                "height": "90",
                "rx": "8",
                "fill": "#fffef8",
                "stroke": "#d4dfc8",
            },
        )
        title = node["title"]
        child(group, "text", {"x": "14", "y": "27", "class": "node-title"}, title[:23])
        if len(title) > 23:
            child(
                group,
                "text",
                {"x": "14", "y": "46", "class": "node-title"},
                title[23:44] + ("…" if len(title) > 44 else ""),
            )
        detail = " · ".join(node.get("relationships", [])) or node.get(
            "template", node["kind"]
        )
        child(
            group, "text", {"x": "14", "y": "74", "class": "node-detail"}, detail[:29]
        )
    return ET.tostring(root, encoding="unicode")


OFFLINE_SCRIPT = """(()=>{
const canvas=document.getElementById('graph-canvas'),svg=canvas.querySelector('svg'),field=document.getElementById('find-node'),status=document.getElementById('find-status');
let zoom=1;const width=Number(svg.getAttribute('width'));
function size(){svg.style.width=width*zoom+'px';svg.style.height='auto';document.getElementById('zoom-value').textContent=Math.round(zoom*100)+'%';}
document.getElementById('zoom-in').addEventListener('click',()=>{zoom=Math.min(2,zoom+.25);size();});
document.getElementById('zoom-out').addEventListener('click',()=>{zoom=Math.max(.25,zoom-.25);size();});
document.getElementById('zoom-reset').addEventListener('click',()=>{zoom=1;size();});
function find(){const q=field.value.normalize('NFKC').toLowerCase().trim();let count=0;for(const row of document.querySelectorAll('[data-node-entry]')){const match=row.dataset.title.normalize('NFKC').toLowerCase().includes(q);row.hidden=!match;if(match)count++;}for(const node of svg.querySelectorAll('[data-node]'))node.style.opacity=node.dataset.title.normalize('NFKC').toLowerCase().includes(q)?'1':'.18';status.textContent=count+' matching entries';}
field.addEventListener('input',find);svg.addEventListener('click',event=>{if(event.target.closest('a')){field.value='';find();}});find();
})();"""


def html_graph(graph, reader):
    svg = svg_graph(graph, list_links=True)
    title = escape(graph["view"]["title"])
    nodes = {n["id"]: n for n in graph["nodes"]}
    rows = []
    for node in graph["nodes"]:
        detail = " · ".join(node.get("relationships", [])) or node.get(
            "template", node["kind"]
        )
        rows.append(
            f'<li id="node-{escape(node["id"], quote=True)}" data-node-entry data-title="{escape(node["title"], quote=True)}"><strong>{escape(node["title"])}</strong><p>{escape(detail)}</p></li>'
        )
    edges = [
        f"<li>{escape(nodes[e['source']]['title'])} → {escape(edge_label(e))} → {escape(nodes[e['target']]['title'])}</li>"
        for e in graph["edges"]
        if e["source"] in nodes and e["target"] in nodes
    ]
    warnings = "".join(
        f'<p class="notice">{escape(w)}</p>' for w in graph.get("warnings", [])
    )
    digest = base64.b64encode(hashlib.sha256(OFFLINE_SCRIPT.encode()).digest()).decode()
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-{digest}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>{title}</title>
<style>body{{font:15px/1.6 system-ui,sans-serif;background:#f5f4ee;color:#293b2e;margin:0;padding:clamp(16px,4vw,48px)}}main{{max-width:1300px;margin:auto}}h1{{font:36px Georgia,serif}}button,input{{font:inherit;padding:8px 12px;border:1px solid #cddbc2;border-radius:6px;background:#fffef8}}button{{cursor:pointer}}nav{{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:24px 0}}.canvas{{max-height:650px;overflow:auto;border:1px solid #d6e1c9;background:#fafcf3}}svg{{display:block}}ol{{padding-left:24px}}li{{padding:9px 0;overflow-wrap:anywhere}}li p{{margin:4px 0;color:#718365}}.notice{{padding:14px;background:#e9efdd}}small{{color:#718365}}[hidden]{{display:none!important}}</style></head><body><main><small>WorldBuilder · {"Reader view" if reader else "Owner view"} · Offline copy</small><h1>{title}</h1><p>{len(nodes)} entries · {len(graph["edges"])} connections. This fixed copy does not update when the world changes.</p>{warnings}
<nav aria-label="Graph controls"><button id="zoom-out" type="button">Zoom out</button><span id="zoom-value">100%</span><button id="zoom-in" type="button">Zoom in</button><button id="zoom-reset" type="button">Reset zoom</button><label>Find an entry <input id="find-node" type="search"></label><span id="find-status" role="status"></span></nav>
<div class="canvas" id="graph-canvas" tabindex="0" aria-label="Graph scroll area">{svg}</div><h2>Entries</h2><ol>{"".join(rows)}</ol><details><summary>Connections</summary><ul>{"".join(edges)}</ul></details><footer><small>Exported {escape(timezone.now().isoformat())}. Includes only the graph's entries and relationships; article bodies and relationship notes are excluded.</small></footer></main><script>{OFFLINE_SCRIPT}</script></body></html>"""


def export_graph(graph, format_name, reader):
    if format_name == "svg":
        return svg_graph(graph), "image/svg+xml; charset=utf-8"
    if format_name == "html":
        return html_graph(graph, reader), "text/html; charset=utf-8"
    if format_name == "json":
        return json.dumps(
            {
                "format": "worldbuilder-graph-v1",
                "audience": "reader" if reader else "owner",
                **graph,
            },
            ensure_ascii=False,
            indent=2,
        ), "application/json; charset=utf-8"
    raise ValueError("Choose SVG, HTML or JSON graph export.")
