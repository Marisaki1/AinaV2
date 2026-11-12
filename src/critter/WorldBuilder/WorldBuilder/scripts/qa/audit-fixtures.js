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
  const name = "Aki field scout " + stamp,
    alias = "Aki-" + stamp,
    placeName = "Lantern hamlet " + stamp;
  const hero = await add(
    name,
    "character",
    {
      fields: {
        Occupation: "Forest scout",
        Motivation: "Find the missing villagers",
      },
    },
    {
      aliases: [alias],
      document: doc("A traveller who records promises and discoveries."),
      private_notes: "GM secret: the scout is being followed.",
    },
  );
  const npc = await add(
    "Village keeper " + stamp,
    "article",
    {},
    { template: "character", summary: "Remembers the old roads." },
  );
  const hidden = await add(
    "Hidden informant " + stamp,
    "character",
    {},
    {},
    false,
  );
  const place = await add(
    placeName,
    "article",
    {},
    {
      template: "settlement",
      document: doc("Lanterns illuminate the road to the shrine."),
      private_notes: "GM-only village response.",
    },
  );
  const assets = await fetch(`/api/worlds/${world}/assets`).then((r) =>
      r.json(),
    ),
    asset = (Array.isArray(assets) ? assets : assets.assets)[0];
  const map = await add("Campaign audit map " + stamp, "map", {
    asset_id: asset.id,
    markers: [
      {
        id: "hamlet",
        label: "Lantern hamlet",
        type: "pin",
        x: 0.3,
        y: 0.4,
        link_id: place.id,
      },
      {
        id: "hidden",
        label: "GM hidden camp",
        type: "pin",
        x: 0.7,
        y: 0.4,
        link_id: place.id,
        private: true,
      },
    ],
    layers: [],
  });
  const campaign = await add("Campaign workflow audit " + stamp, "campaign", {
    party: [hero.id],
    related_entries: [npc.id, hidden.id, place.id, map.id],
  });
  const first = await add("Earlier session " + stamp, "session", {
    campaign_id: campaign.id,
    number: 1,
    session_status: "completed",
  });
  const quest = await add("Find the villagers " + stamp, "quest", {
    campaign_id: campaign.id,
    progress: "active",
    link_id: hero.id,
  });
  const task = await add(
    "Prepare the next scene " + stamp,
    "task",
    { campaign_id: campaign.id, progress: "open" },
    {},
    false,
  );
  const edge = await request(`/worlds/${world}/connections`, {
    source: hero.id,
    target: npc.id,
    kind: "friend",
    label: "Trust built on the road",
    notes: "GM-only trust secret.",
    visibility: "public",
  });
  await request(`/worlds/${world}/connections`, {
    source: hero.id,
    target: place.id,
    kind: "located-in",
    label: "Investigating disappearances",
    notes: "",
    visibility: "public",
  });
  await request(`/worlds/${world}/connections`, {
    source: hero.id,
    target: hidden.id,
    kind: "mentor",
    label: "Secret contact",
    notes: "GM-only informant secret.",
    visibility: "private",
  });
  const f = {
    world,
    stamp,
    name,
    alias,
    placeName,
    hero: hero.id,
    npc: npc.id,
    hidden: hidden.id,
    place: place.id,
    map: map.id,
    campaign: campaign.id,
    first: first.id,
    quest: quest.id,
    task: task.id,
    edge: edge.id,
    asset: asset.id,
    original: hero.document,
  };
  localStorage.qaAudit = JSON.stringify(f);
  location.reload();
  return f;
})();
