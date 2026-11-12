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
  const add = async (title, kind, data = {}, more = {}, publish = true) => {
    const e = await request(`/worlds/${world}/resources`, {
      title,
      kind,
      data,
      visibility: publish ? "public" : "private",
      ...more,
    });
    if (publish)
      await request("/resources/" + e.id + "/publish", {
        expected_revision: e.revision,
      });
    return e;
  };
  const doc = (text) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  const hero = await add(
    "Reimu Hakurei",
    "character",
    {},
    {
      summary: "Shrine maiden. Investigating the missing villagers.",
      document: doc(
        "Keep track of clues, promises and people met during the campaign.",
      ),
      private_notes: "GM secret: the shrine seal is weakening.",
    },
  );
  const marisa = await add(
    "Marisa Kirisame",
    "character",
    {},
    { summary: "Magician and travelling companion." },
  );
  const alice = await add(
    "Alice Margatroid",
    "article",
    {},
    {
      template: "character",
      summary: "An independent magician in the forest.",
    },
  );
  const sakuya = await add(
    "Sakuya Izayoi",
    "article",
    {},
    { template: "character", summary: "A wary ally from the mansion." },
  );
  const keine = await add(
    "Keine Kamishirasawa",
    "article",
    {},
    {
      template: "character",
      summary: "Protects the village and remembers its history.",
    },
  );
  const secret = await add("Hidden campaign NPC", "character", {}, {}, false);
  const place = await add(
    "Human Village",
    "article",
    {},
    { template: "settlement", summary: "The investigation begins here." },
  );
  const assets = await fetch(`/api/worlds/${world}/assets`).then((r) =>
      r.json(),
    ),
    asset = (Array.isArray(assets) ? assets : assets.assets)[0];
  const map = await add("Forest route map", "map", {
    asset_id: asset.id,
    markers: [],
    layers: [],
  });
  const campaign = await add("Scarlet Forest affinity " + stamp, "campaign", {
    party: [hero.id, marisa.id],
    related_entries: [
      alice.id,
      sakuya.id,
      keine.id,
      secret.id,
      place.id,
      map.id,
    ],
  });
  const edges = [];
  for (const [source, target, kind, label, strength, notes, visibility] of [
    [
      hero.id,
      marisa.id,
      "friend",
      "Trusted companions",
      80,
      "They share discoveries after each incident.",
      "public",
    ],
    [
      hero.id,
      sakuya.id,
      "rival",
      "Uneasy alliance",
      -20,
      "Private reminder: Sakuya knows more about the tower.",
      "public",
    ],
    [keine.id, place.id, "guardian", "Protects the village", 60, "", "public"],
    [marisa.id, alice.id, "friend", "Magical rivals", 30, "", "public"],
    [
      hero.id,
      place.id,
      "located-in",
      "Investigating disappearances",
      0,
      "",
      "public",
    ],
    [
      hero.id,
      secret.id,
      "mentor",
      "Secret mentor",
      10,
      "Never reveal this relationship.",
      "private",
    ],
  ])
    edges.push(
      await request(`/worlds/${world}/connections`, {
        source,
        target,
        kind,
        label,
        strength,
        notes,
        visibility,
      }),
    );
  const note = await add(
    "Promise at the shrine " + stamp,
    "note",
    {
      campaign_id: campaign.id,
      related_entries: [hero.id],
      record_type: "journal",
      world_day: "Day 12",
    },
    { document: doc("Reimu promised to return before dusk.") },
    false,
  );
  const f = {
    world,
    stamp,
    campaign: campaign.id,
    hero: hero.id,
    marisa: marisa.id,
    alice: alice.id,
    sakuya: sakuya.id,
    keine: keine.id,
    secret: secret.id,
    place: place.id,
    map: map.id,
    asset: asset.id,
    friend: edges[0].id,
    rival: edges[1].id,
    note: note.id,
  };
  localStorage.qaAffinity = JSON.stringify(f);
  location.reload();
  return f;
})();
