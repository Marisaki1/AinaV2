(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const prior = JSON.parse(localStorage.qaAudit),
    stamp = Date.now(),
    g = { world: prior.world, asset: prior.asset, stamp };
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
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
    const e = await request(`/worlds/${g.world}/resources`, {
      title,
      kind,
      data,
      ...more,
      visibility: publish ? "public" : "private",
    });
    if (publish)
      await request(`/resources/${e.id}/publish`, {
        expected_revision: e.revision,
      });
    return e;
  };
  g.name = "Moonlit market " + stamp;
  g.alias = "Old market " + stamp;
  g.location = (
    await add(
      g.name,
      "article",
      { fields: { Population: "A dozen wandering merchants" } },
      {
        template: "settlement",
        aliases: [g.alias],
        document: doc("A lantern-lit market beside the old shrine."),
        private_notes: "GM-only market patron.",
      },
    )
  ).id;
  g.hero = (
    await add(
      "Market resident " + stamp,
      "character",
      {},
      { summary: "Keeps the market safe." },
    )
  ).id;
  g.npc = (
    await add(
      "Visiting merchant " + stamp,
      "article",
      {},
      { template: "character", summary: "Brings news from the river." },
    )
  ).id;
  g.hidden = (
    await add("Hidden market patron " + stamp, "character", {}, {}, false)
  ).id;
  g.building = (
    await add("Market shrine " + stamp, "article", {}, { template: "building" })
  ).id;
  g.region = (
    await add(
      "Moonlit valley " + stamp,
      "article",
      {},
      { template: "geography" },
    )
  ).id;
  g.map = (
    await add("Market map " + stamp, "map", {
      asset_id: g.asset,
      markers: [
        {
          id: "market",
          type: "pin",
          label: "Market square",
          x: 0.3,
          y: 0.4,
          link_id: g.location,
        },
        {
          id: "private",
          type: "pin",
          label: "Secret market camp",
          x: 0.5,
          y: 0.4,
          link_id: g.location,
          private: true,
        },
        {
          id: "shrine",
          type: "pin",
          label: "Shrine gates",
          x: 0.7,
          y: 0.3,
          link_id: g.building,
        },
      ],
    })
  ).id;
  const edge = async (source, kind, label, visibility = "public") =>
    (
      await request(`/worlds/${g.world}/connections`, {
        source,
        target: g.location,
        kind,
        label,
        visibility,
        notes: "GM-only market relationship.",
      })
    ).id;
  g.residence = await edge(g.hero, "located-in", "Lives at the market");
  await edge(g.npc, "friend", "Trades here");
  await edge(g.building, "located-in", "Within the market");
  g.secretEdge = await edge(g.hidden, "located-in", "Secret patron", "private");
  g.campaign = (
    await add("Market expedition " + stamp, "campaign", {
      party: [g.hero],
      related_entries: [g.npc, g.hidden, g.building, g.map],
    })
  ).id;
  g.session = (
    await add("Market visit " + stamp, "session", {
      campaign_id: g.campaign,
      number: 1,
      recap: `${g.alias} welcomed the party.`,
      prep: "GM-only market ambush.",
      consequences: "GM-only market faction.",
      rewards: "Shelter for the party.",
      map_id: g.map,
      marker_id: "market",
    })
  ).id;
  g.journal = (
    await add(
      "Public market journal " + stamp,
      "note",
      {
        campaign_id: g.campaign,
        session_id: g.session,
        record_type: "journal",
        map_id: g.map,
        marker_id: "market",
      },
      { document: doc("A promise was made here.") },
    )
  ).id;
  g.privateRecord = (
    await add(
      "Secret market visit " + stamp,
      "note",
      {
        campaign_id: g.campaign,
        record_type: "journal",
        related_entries: [g.location],
      },
      { document: doc("Private patron clue.") },
      false,
    )
  ).id;
  g.hiddenPinRecord = (
    await add(
      "Hidden pin visit " + stamp,
      "note",
      {
        campaign_id: g.campaign,
        map_id: g.map,
        marker_id: "private",
        related_entries: [g.location],
      },
      { document: doc("Must not become a general market visit.") },
    )
  ).id;
  const other = await add("Other expedition " + stamp, "campaign");
  g.outside = (
    await add("Other campaign market note " + stamp, "note", {
      campaign_id: other.id,
      related_entries: [g.location],
    })
  ).id;
  g.task = (
    await add(
      "Repair market gate " + stamp,
      "task",
      { campaign_id: g.campaign, progress: "open" },
      {},
      false,
    )
  ).id;
  localStorage.qaLocation = JSON.stringify(g);
  return {
    location: g.location,
    campaign: g.campaign,
    session: g.session,
    map: g.map,
    originalRecords: true,
  };
})();
