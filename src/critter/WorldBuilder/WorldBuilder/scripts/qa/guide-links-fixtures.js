(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const world = JSON.parse(localStorage.qaFixtures).world,
    stamp = Date.now(),
    csrf = decodeURIComponent(
      document.cookie
        .split("; ")
        .find((s) => s.startsWith(boot.csrf_cookie + "="))
        ?.split("=")[1] || "",
    );
  const request = async (path, body, method = "POST") => {
    const r = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(body),
    });
    const v = await r.json();
    if (!r.ok) throw Error(JSON.stringify(v));
    return v;
  };
  const doc = (text) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  const add = async (title, kind, data = {}, more = {}, publish = true) => {
    const e = await request(`/worlds/${world}/resources`, {
      title,
      kind,
      data,
      ...more,
      visibility: publish ? "public" : "private",
    });
    if (publish)
      await request("/resources/" + e.id + "/publish", {
        expected_revision: e.revision,
      });
    return e;
  };
  const placeTitle = "Lantern Hamlet " + stamp,
    alias = "Lantern village " + stamp,
    heroTitle = "Forest scout " + stamp;
  const place = await add(
    placeTitle,
    "article",
    {},
    {
      template: "settlement",
      aliases: [alias],
      document: doc("Lanterns mark the path to the red tower."),
      private_notes: "GM-only hamlet clue",
    },
  );
  const hero = await add(
    heroTitle,
    "character",
    {},
    { document: doc("This scout knows the forest route.") },
  );
  const assets = await fetch(`/api/worlds/${world}/assets`).then((r) =>
      r.json(),
    ),
    rows = Array.isArray(assets) ? assets : assets.assets,
    asset = rows[0];
  const map = await add("Forest atlas " + stamp, "map", {
    asset_id: asset.id,
    markers: [
      {
        id: "hamlet",
        label: "Lantern Hamlet",
        type: "pin",
        symbol: "home",
        x: 0.28,
        y: 0.42,
        link_id: place.id,
      },
      {
        id: "bridge",
        label: "Old bridge",
        type: "pin",
        symbol: "water",
        x: 0.68,
        y: 0.64,
      },
      {
        id: "secret",
        label: "GM secret camp",
        type: "pin",
        x: 0.72,
        y: 0.3,
        private: true,
      },
    ],
    layers: [],
  });
  const otherMap = await add("Mountain atlas " + stamp, "map", {
    asset_id: (rows[1] || asset).id,
    markers: [
      { id: "summit", label: "Mountain summit", type: "pin", x: 0.5, y: 0.5 },
    ],
    layers: [],
  });
  const campaign = await add("Lantern expedition " + stamp, "campaign", {
    related_entries: [map.id, otherMap.id, place.id],
    party: [hero.id],
  });
  const session = await add("Lantern session " + stamp, "session", {
    campaign_id: campaign.id,
    number: 1,
    session_status: "completed",
    related_entries: [place.id],
    recap: "The party arrived at the village.",
    prep: "GM-only session preparation",
  });
  const text = `${heroTitle} visited ${placeTitle}. The locals call it ${alias}.`;
  const note = await add(
    "Road journal " + stamp,
    "note",
    {
      campaign_id: campaign.id,
      session_id: session.id,
      map_id: map.id,
      marker_id: "hamlet",
      record_type: "journal",
      related_entries: [place.id, map.id],
      world_day: "Day 12 / forest road",
    },
    { document: doc(text) },
  );
  const secret = await add(
    "Secret camp record " + stamp,
    "note",
    {
      campaign_id: campaign.id,
      map_id: map.id,
      marker_id: "secret",
      related_entries: [map.id],
    },
    { document: doc("GM-only camp record body") },
    true,
  );
  await request(`/worlds/${world}/connections`, {
    source: hero.id,
    target: place.id,
    kind: "located-in",
    label: "Investigating the village",
    notes: "GM-only relationship note",
    visibility: "public",
  });
  const f = {
    world,
    stamp,
    map: map.id,
    otherMap: otherMap.id,
    campaign: campaign.id,
    place: place.id,
    hero: hero.id,
    session: session.id,
    note: note.id,
    secret: secret.id,
    placeTitle,
    heroTitle,
    alias,
    text,
  };
  localStorage.qaGuideLinks = JSON.stringify(f);
  location.reload();
  return f;
})();
