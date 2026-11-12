(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA workspace required");
  const f = JSON.parse(localStorage.getItem("qaFixtures"));
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((s) => s.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const post = async (path, value) => {
    const response = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(value),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));
    return result;
  };
  const add = (title, kind, data) =>
    post("/worlds/" + f.world + "/resources", {
      title,
      kind,
      data,
      visibility: "public",
    });
  const publish = (entry) =>
    post("/resources/" + entry.id + "/publish", {
      expected_revision: entry.revision,
    });
  const sourceCalendar = await fetch("/api/resources/" + f.calendar).then((r) =>
    r.json(),
  );
  const calendar = await add(
    "QA 0.3 shared calendar",
    "calendar",
    sourceCalendar.data,
  );
  await publish(calendar);
  const map = await add("QA 0.3 boundary map", "map", {
    asset_id: f.asset,
    groups: [],
    layers: [],
    markers: [
      {
        id: "village",
        type: "pin",
        label: "Village",
        x: 0.25,
        y: 0.3,
        color: "#c18d44",
      },
    ],
  });
  const events = [];
  for (const [title, year, lane, end_year] of [
    ["Ancient settlement", -20, 0, -10],
    ["Treaty signed", 0, 0, null],
    ["Parallel pilgrimage", 0, 1, null],
    ["Hidden conspiracy", 5, 2, null],
    ["Later festival", 20, 1, null],
  ]) {
    const entry = await add(title, "event", {
      year,
      month: 1,
      day: 1,
      lane,
      calendar_id: calendar.id,
      map_id: map.id,
      marker_id: "village",
      ...(end_year === null ? {} : { end_year }),
    });
    await publish(entry);
    events.push(entry.id);
  }
  const timeline = await add("QA 0.3 parallel history", "timeline", {
    calendar_id: calendar.id,
    map_id: map.id,
    selection: "selected",
    event_ids: events,
    lanes: [
      { id: 0, name: "Settlement" },
      { id: 1, name: "Pilgrimage" },
      { id: 2, name: "Secret history", private: true },
    ],
  });
  await publish(map);
  await publish(timeline);
  const out = {
    world: f.world,
    map: map.id,
    timeline: timeline.id,
    events,
    asset: f.asset,
    calendar: calendar.id,
  };
  localStorage.setItem("qaMapsHistory", JSON.stringify(out));
  return out;
})();
