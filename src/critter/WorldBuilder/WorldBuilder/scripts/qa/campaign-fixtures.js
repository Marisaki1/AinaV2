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
  const add = (title, kind, data = {}, more = {}) =>
    request(`/worlds/${world}/resources`, {
      title: title + " " + stamp,
      kind,
      data,
      ...more,
    });
  const campaign = await add("Campaign essentials", "campaign"),
    other = await add("Unrelated campaign", "campaign");
  const character = await add("Campaign hero", "character"),
    npc = await add("Campaign NPC", "article", {}, { template: "character" }),
    place = await add(
      "Campaign village",
      "article",
      {},
      { template: "settlement" },
    );
  const assets = await fetch(`/api/worlds/${world}/assets`).then((r) =>
      r.json(),
    ),
    asset = (Array.isArray(assets) ? assets : assets.assets)[0];
  const map = await add("Campaign region", "map", {
    asset_id: asset.id,
    markers: [
      {
        id: "village",
        label: "Village",
        x: 0.4,
        y: 0.4,
        type: "pin",
        link_id: place.id,
      },
    ],
    layers: [],
  });
  const session = await add("Existing session", "session", {
    campaign_id: campaign.id,
    number: 1,
    session_status: "planned",
  });
  const hidden = await add("Other campaign private note", "note", {
    campaign_id: other.id,
    record_type: "journal",
  });
  await request(
    "/resources/" + campaign.id,
    {
      expected_revision: campaign.revision,
      data: {
        party: [character.id],
        related_entries: [npc.id, place.id, map.id],
      },
    },
    "PATCH",
  );
  const f = {
    world,
    campaign: campaign.id,
    other: other.id,
    character: character.id,
    npc: npc.id,
    place: place.id,
    map: map.id,
    session: session.id,
    hidden: hidden.id,
    stamp,
  };
  localStorage.qaCampaign = JSON.stringify(f);
  location.reload();
  return f;
})();
