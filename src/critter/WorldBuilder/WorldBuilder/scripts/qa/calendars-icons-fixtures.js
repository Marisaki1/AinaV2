(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const old = JSON.parse(localStorage.getItem("qaFixtures"));
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const post = async (path, body) => {
    const response = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    return data;
  };
  const assets = await fetch(`/api/worlds/${old.world}/assets`).then((r) =>
    r.json(),
  );
  const list = Array.isArray(assets) ? assets : assets.assets;
  if (!list?.length) throw new Error("QA image required");
  const stamp = Date.now();
  const data = {
    months: [
      { name: "Dawn", days: 30 },
      { name: "Dusk", days: 20 },
    ],
    weekdays: ["Sun", "Moon", "Star", "Cloud", "Rain", "Wind", "Sky"],
    leap_rules: [
      {
        id: "leap",
        name: "Century leap",
        interval: 4,
        offset: 0,
        month: 2,
        days: 1,
        except_every: 100,
        except_unless: 400,
      },
    ],
    day_offset: 2,
    week_mode: "continuous",
    moons: [
      { id: "silver", name: "Silver", period: 28, offset: 0 },
      { id: "red", name: "Red", period: 16, offset: 2 },
    ],
  };
  const add = (title, kind, data) =>
    post(`/worlds/${old.world}/resources`, {
      title,
      kind,
      data,
      visibility: "public",
    });
  const cal = await add("QA calendar " + stamp, "calendar", data);
  const map = await add("QA icons " + stamp, "map", {
    asset_id: list[0].id,
    calendar_id: cal.id,
    markers: [
      {
        id: "castle",
        type: "pin",
        label: "Castle icon",
        x: 0.25,
        y: 0.5,
        symbol: "castle",
        icon_size: 48,
      },
      {
        id: "raster",
        type: "pin",
        label: "Raster icon",
        x: 0.65,
        y: 0.5,
        icon_asset_id: list[0].id,
        icon_size: 40,
      },
      {
        id: "secret",
        type: "pin",
        label: "Secret icon",
        x: 0.5,
        y: 0.8,
        symbol: "danger",
        private: true,
      },
    ],
    versions: [
      {
        id: "past",
        name: "Leap terrain",
        year: 2000,
        month: 2,
        day: 21,
        scene: {
          asset_id: list[0].id,
          markers: [
            {
              id: "past-pin",
              type: "pin",
              label: "Past temple",
              x: 0.5,
              y: 0.5,
              symbol: "temple",
              icon_size: 48,
            },
          ],
        },
      },
    ],
  });
  for (const entry of [cal, map])
    await post(`/resources/${entry.id}/publish`, {
      expected_revision: entry.revision,
    });
  const result = {
    world: old.world,
    cal: cal.id,
    map: map.id,
    asset: list[0].id,
    data,
  };
  localStorage.setItem("qaCalendarIcons", JSON.stringify(result));
  location.reload();
  return result;
})();
