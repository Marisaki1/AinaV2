(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const world = JSON.parse(localStorage.getItem("qaFixtures")).world;
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((s) => s.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const post = async (path, body) => {
    const r = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(body),
    });
    const v = await r.json();
    if (!r.ok) throw Error(JSON.stringify(v));
    return v;
  };
  const add = async (title, kind, data) => {
    const e = await post(`/worlds/${world}/resources`, {
      title: title + " " + Date.now(),
      kind,
      data,
      visibility: "public",
    });
    await post(`/resources/${e.id}/publish`, { expected_revision: e.revision });
    return e.id;
  };
  const cal = await add("Special calendar", "calendar", {
    months: [
      { name: "Dawn", days: 3 },
      { name: "Dusk", days: 2 },
    ],
    weekdays: ["A", "B", "C"],
    special_days: [
      {
        id: "new",
        name: "Year opening",
        after_month: 0,
        days: 1,
        outside_week: true,
      },
      {
        id: "mid",
        name: "Still days",
        after_month: 1,
        days: 2,
        outside_week: true,
      },
      {
        id: "end",
        name: "Leap vigil",
        after_month: 2,
        days: 1,
        outside_week: false,
        interval: 2,
      },
    ],
  });
  const assets = await fetch(`/api/worlds/${world}/assets`).then((r) =>
    r.json(),
  );
  const asset = (Array.isArray(assets) ? assets : assets.assets)[0];
  const map = await add("Special map", "map", {
    asset_id: asset.id,
    calendar_id: cal,
    versions: [
      {
        id: "before",
        name: "Before still days",
        year: 0,
        month: 1,
        day: 3,
        scene: { asset_id: asset.id },
      },
      {
        id: "mid-scene",
        name: "Still terrain",
        year: 0,
        month: 1,
        day: 1,
        special_day_id: "mid",
        scene: { asset_id: asset.id },
      },
      {
        id: "later",
        name: "Later still terrain",
        year: 2,
        month: 1,
        day: 1,
        special_day_id: "mid",
        scene: { asset_id: asset.id },
      },
    ],
  });
  const series = await add("Special festival", "event", {
    calendar_id: cal,
    year: 0,
    month: 1,
    day: 1,
    special_day_id: "mid",
    map_id: map,
    recurrence: { frequency: "yearly", interval: 1, until_year: 2 },
  });
  const timeline = await add("Special timeline", "timeline", {
    calendar_id: cal,
    selection: "selected",
    event_ids: [series],
    recurrence_from_year: 0,
    recurrence_to_year: 2,
  });
  const f = { world, cal, map, series, timeline };
  localStorage.setItem("qaSpecialDays", JSON.stringify(f));
  location.reload();
  return f;
})();
