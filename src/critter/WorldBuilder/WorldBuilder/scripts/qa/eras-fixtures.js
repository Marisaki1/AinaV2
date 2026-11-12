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
  const stamp = Date.now();
  const add = async (title, kind, data, visibility = "public") => {
    const entry = await post(`/worlds/${f.world}/resources`, {
      title,
      kind,
      data,
      visibility,
    });
    if (visibility === "public")
      await post(`/resources/${entry.id}/publish`, {
        expected_revision: entry.revision,
      });
    return entry.id;
  };
  const cal = await add("Era calendar " + stamp, "calendar", {
    months: [
      { name: "Dawn", days: 3 },
      { name: "Dusk", days: 2 },
    ],
    weekdays: ["Sun", "Moon"],
    leap_every: 2,
    leap_month: 2,
  });
  const era = await add("Age of rain " + stamp, "era", {
    calendar_id: cal,
    year: -20,
    end_year: 20,
    date_precision: "year",
  });
  const secretName = "Hidden age " + stamp;
  const secret = await add(
    secretName,
    "era",
    { calendar_id: cal, year: -10 },
    "private",
  );
  const assets = await fetch(`/api/worlds/${f.world}/assets`).then((r) =>
    r.json(),
  );
  const asset = (Array.isArray(assets) ? assets : assets.assets)[0];
  const map = await add("Era map " + stamp, "map", {
    asset_id: asset.id,
    calendar_id: cal,
    markers: [
      {
        id: "base",
        label: "Base city",
        type: "pin",
        x: 0.4,
        y: 0.5,
        symbol: "castle",
      },
    ],
    versions: [
      {
        id: "later",
        name: "Later terrain",
        year: -5,
        month: 2,
        day: 1,
        scene: {
          asset_id: asset.id,
          markers: [
            {
              id: "later-pin",
              label: "Later city",
              type: "pin",
              x: 0.6,
              y: 0.5,
              symbol: "temple",
            },
          ],
        },
      },
    ],
  });
  const coarse = await add("Uncertain origin " + stamp, "event", {
    calendar_id: cal,
    era_id: era,
    year: -5,
    month: 2,
    day: 2,
    date_precision: "year",
    date_approximate: true,
    map_id: map,
  });
  const exact = await add("Known arrival " + stamp, "event", {
    calendar_id: cal,
    era_id: era,
    year: -5,
    month: 2,
    day: 1,
    map_id: map,
  });
  const secretLinked = await add("Visible moment " + stamp, "event", {
    calendar_id: cal,
    era_id: secret,
    year: 0,
  });
  const timeline = await add("Era timeline " + stamp, "timeline", {
    calendar_id: cal,
    selection: "all",
    lanes: [{ id: 0, name: "History" }],
  });
  const out = {
    world: f.world,
    cal,
    era,
    secret,
    secretName,
    map,
    coarse,
    exact,
    secretLinked,
    timeline,
    createdName: "An ongoing age " + stamp,
  };
  localStorage.setItem("qaEras", JSON.stringify(out));
  location.reload();
  return out;
})();
