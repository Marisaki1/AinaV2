(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const old = JSON.parse(localStorage.getItem("qaFixtures")),
    csrf = decodeURIComponent(
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
    if (!r.ok) throw new Error(JSON.stringify(v));
    return v;
  };
  const add = async (title, kind, data, visibility = "public") => {
    const e = await post(`/worlds/${old.world}/resources`, {
      title,
      kind,
      data,
      visibility,
    });
    if (visibility === "public")
      await post(`/resources/${e.id}/publish`, {
        expected_revision: e.revision,
      });
    return e.id;
  };
  const stamp = Date.now(),
    name = "Leap festival " + stamp;
  const cal = await add("Festival calendar " + stamp, "calendar", {
    months: [
      { name: "Dawn", days: 3 },
      { name: "Dusk", days: 2 },
    ],
    weekdays: ["Sun", "Moon"],
    leap_every: 2,
    leap_month: 2,
  });
  const assets = await fetch(`/api/worlds/${old.world}/assets`).then((r) =>
    r.json(),
  );
  const asset = (Array.isArray(assets) ? assets : assets.assets)[0];
  const map = await add("Festival map " + stamp, "map", {
    asset_id: asset.id,
    calendar_id: cal,
    markers: [
      {
        id: "city",
        type: "pin",
        label: "Old city",
        x: 0.3,
        y: 0.5,
        symbol: "castle",
      },
    ],
    versions: [
      {
        id: "later",
        name: "Later festival terrain",
        year: 2,
        month: 1,
        day: 1,
        scene: {
          asset_id: asset.id,
          markers: [
            {
              id: "city",
              type: "pin",
              label: "New city",
              x: 0.6,
              y: 0.5,
              symbol: "temple",
            },
          ],
        },
      },
    ],
  });
  const series = await add(name, "event", {
    calendar_id: cal,
    year: 0,
    month: 2,
    day: 3,
    map_id: map,
    marker_id: "city",
    recurrence: {
      frequency: "yearly",
      interval: 1,
      until_year: 4,
      invalid_date: "skip",
    },
  });
  const secret = await add(
    "Private recurring secret " + stamp,
    "event",
    {
      calendar_id: cal,
      year: 0,
      month: 2,
      day: 1,
      recurrence: { frequency: "daily", interval: 1 },
    },
    "private",
  );
  const timeline = await add("Festival timeline " + stamp, "timeline", {
    calendar_id: cal,
    selection: "selected",
    event_ids: [series],
    recurrence_from_year: 0,
    recurrence_to_year: 4,
  });
  const out = { world: old.world, cal, map, series, secret, timeline, name };
  localStorage.setItem("qaRecurrence", JSON.stringify(out));
  location.reload();
  return out;
})();
