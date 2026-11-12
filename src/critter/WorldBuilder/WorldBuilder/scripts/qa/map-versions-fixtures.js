(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaFixtures"));
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((s) => s.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const post = async (path, value) => {
    const r = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(value),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(v));
    return v;
  };
  const add = (title, kind, data) =>
    post("/worlds/" + f.world + "/resources", {
      title,
      kind,
      data,
      visibility: "public",
    });
  const publish = (e) =>
    post("/resources/" + e.id + "/publish", { expected_revision: e.revision });
  const cal = await add("Flood calendar", "calendar", {
    months: [
      { name: "First moon", days: 30 },
      { name: "Last moon", days: 30 },
    ],
    weekdays: ["Sun", "Moon"],
    leap_every: 2,
    leap_month: 2,
  });
  await publish(cal);
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 360;
  const c = canvas.getContext("2d");
  c.fillStyle = "#9fbac0";
  c.fillRect(0, 0, 720, 360);
  c.fillStyle = "#c9c798";
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(390, 0);
  c.lineTo(490, 180);
  c.lineTo(310, 360);
  c.lineTo(0, 360);
  c.fill();
  c.font = "28px Georgia";
  c.fillStyle = "#3e5549";
  c.fillText("After the great flood", 35, 55);
  const blob = await new Promise((r) => canvas.toBlob(r));
  const form = new FormData();
  form.append("file", blob, "qa-after-flood.png");
  form.append("credit", "WorldBuilder QA map diagram");
  const response = await fetch("/api/worlds/" + f.world + "/assets", {
    method: "POST",
    headers: { "X-CSRFToken": csrf },
    body: form,
  });
  const image = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(image));
  const map = await add("QA evolving borderlands", "map", {
    asset_id: f.asset,
    calendar_id: cal.id,
    markers: [
      {
        id: "village",
        type: "pin",
        label: "Founding village",
        x: 0.35,
        y: 0.55,
      },
      {
        id: "border",
        type: "polygon",
        label: "River border",
        points: [
          [0.1, 0.1],
          [0.6, 0.2],
          [0.5, 0.8],
        ],
        color: "#628342",
      },
      { id: "harbor", type: "pin", label: "New harbor", x: 0.7, y: 0.45 },
    ],
    groups: [],
    layers: [],
  });
  const events = [];
  for (const [year, title] of [
    [-1, "Before settlement"],
    [0, "The founding"],
    [5, "The flood"],
    [7, "A hidden future"],
  ]) {
    const event = await add(title, "event", {
      calendar_id: cal.id,
      map_id: map.id,
      marker_id: year === 5 ? "harbor" : "village",
      year,
      month: 1,
      day: 1,
      lane: 0,
    });
    await publish(event);
    events.push(event.id);
  }
  const timeline = await add("QA Chronicle of the flood", "timeline", {
    calendar_id: cal.id,
    map_id: map.id,
    selection: "selected",
    event_ids: events,
    lanes: [{ id: 0, name: "Borderlands" }],
  });
  await publish(map);
  await publish(timeline);
  const out = {
    world: f.world,
    map: map.id,
    calendar: cal.id,
    timeline: timeline.id,
    events,
    baseAsset: f.asset,
    afterAsset: image.id,
    afterUrl: image.url,
  };
  localStorage.setItem("qaMapVersions", JSON.stringify(out));
  return out;
})();
