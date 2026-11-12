(async () => {
  const qaBoot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!qaBoot.test_workspace || location.port !== "8768")
    throw new Error(
      "This script only runs against an isolated .preview workspace on port 8768.",
    );
  const boot = await fetch("/api/bootstrap").then((r) => r.json()),
    world = boot.worlds[0].id;
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const request = async (path, data) => {
    const r = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(data),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(path + ": " + JSON.stringify(v));
    return v;
  };
  const existing = (
    await fetch("/api/worlds/" + world + "/resources").then((r) => r.json())
  ).resources;
  const out = {};
  const doc = (s) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: s }] }],
  });
  const add = async (title, kind, data = {}, more = {}) => {
    const value =
      existing.find((e) => e.title === title) ||
      (await request("/worlds/" + world + "/resources", {
        title,
        kind,
        data,
        summary: more.summary || "",
        document: doc(
          "Browser verification fixture. This content exists only in the isolated QA workspace.",
        ),
        ...more,
      }));
    out[kind] = value.id;
    return value;
  };
  const reimu = await add(
    "Reimu Hakurei",
    "article",
    {
      fields: { Occupation: "Shrine maiden", Residence: "The Lantern Shrine" },
    },
    {
      template: "character",
      summary: "Keeper of the boundary, collector of unlikely friendships.",
      tags: ["character", "shrine"],
    },
  );
  const marisa = await add(
    "Marisa Kirisame",
    "character",
    {},
    {
      template: "character",
      summary: "An ordinary magician with extraordinary curiosity.",
    },
  );
  const village = await add(
    "The Human Village",
    "article",
    {},
    {
      template: "settlement",
      summary: "A crossroads of stories, trades, and familiar faces.",
      tags: ["location"],
    },
  );
  let assets = (
    await fetch("/api/worlds/" + world + "/assets").then((r) => r.json())
  ).assets;
  let asset = assets[0];
  if (!asset) {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const c = canvas.getContext("2d");
    c.fillStyle = "#ded9b7";
    c.fillRect(0, 0, 1200, 800);
    c.fillStyle = "#a8ba8f";
    for (let i = 0; i < 18; i++) {
      c.beginPath();
      c.ellipse(
        130 + ((i * 173) % 1040),
        100 + ((i * 227) % 640),
        130,
        75,
        -0.3,
        0,
        7,
      );
      c.fill();
    }
    c.strokeStyle = "#719f9c";
    c.lineWidth = 26;
    c.beginPath();
    c.moveTo(760, 0);
    c.bezierCurveTo(400, 260, 1000, 450, 460, 800);
    c.stroke();
    c.strokeStyle = "#a5986c";
    c.lineWidth = 4;
    c.setLineDash([8, 9]);
    c.beginPath();
    c.moveTo(70, 560);
    c.lineTo(430, 420);
    c.lineTo(670, 470);
    c.lineTo(1000, 180);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = "#536046";
    c.font = "italic 44px Georgia";
    c.fillText("The Verdant Borderlands", 80, 90);
    c.font = "24px Georgia";
    c.fillText("Misty Lake", 820, 600);
    c.fillText("Youkai Mountain", 110, 210);
    const blob = await new Promise((r) => canvas.toBlob(r));
    const form = new FormData();
    form.append("file", blob, "qa-borderlands.png");
    form.append("credit", "WorldBuilder generated test diagram");
    const res = await fetch("/api/worlds/" + world + "/assets", {
      method: "POST",
      body: form,
      headers: { "X-CSRFToken": csrf },
    });
    asset = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(asset));
  }
  const map = await add(
    "The Verdant Borderlands",
    "map",
    {
      asset_id: asset.id,
      layers: [],
      markers: [
        {
          id: "shrine",
          type: "pin",
          label: "The Lantern Shrine",
          x: 0.35,
          y: 0.55,
          color: "#916342",
          link_id: existing.find((e) => e.title === "The Lantern Shrine")?.id,
        },
        {
          id: "village",
          type: "pin",
          label: "Human Village",
          x: 0.58,
          y: 0.62,
          color: "#416d57",
          link_id: village.id,
        },
        {
          id: "forest",
          type: "polygon",
          label: "Forest of Magic",
          points: [
            [0.15, 0.3],
            [0.35, 0.25],
            [0.4, 0.48],
            [0.2, 0.5],
          ],
          color: "#5c7b45",
        },
        {
          id: "route",
          type: "line",
          label: "Old mountain road",
          points: [
            [0.35, 0.55],
            [0.45, 0.48],
            [0.58, 0.62],
          ],
          color: "#9c7444",
        },
      ],
    },
    { summary: "Every path leads to another story." },
  );
  const cal = await add("Lunisolar Calendar", "calendar", {
    months: [
      { name: "Spring Moon", days: 30 },
      { name: "Summer Moon", days: 31 },
      { name: "Harvest Moon", days: 30 },
      { name: "Winter Moon", days: 31 },
    ],
    weekdays: ["Sun", "Moon", "Fire", "Water", "Wood", "Gold", "Earth"],
    leap_every: 4,
    leap_month: 4,
    moon_cycle: 28,
  });
  await add(
    "The Scarlet Mist Incident",
    "event",
    {
      year: 118,
      month: 2,
      day: 14,
      calendar_id: cal.id,
      map_id: map.id,
      marker_id: "shrine",
      lane: 0,
      era: "The Spell Card Era",
    },
    { summary: "An unnatural mist gathers beneath a summer sky." },
  );
  const campaign = await add(
    "Beyond the Boundary",
    "campaign",
    {
      system: "Touhou D&D · Homebrew",
      party: [reimu.id, marisa.id],
      inventory: [{ id: "rope", name: "Silken rope", quantity: 2 }],
      campaign_status: "Ongoing",
    },
    { summary: "The next adventure begins where the familiar world ends." },
  );
  await add(
    "A letter from the mountain",
    "session",
    { number: 1, campaign_id: campaign.id, starts_at: "2026-11-01T11:00:00Z" },
    {
      parent: campaign.id,
      summary: "A sealed invitation arrives at the shrine.",
    },
  );
  await add("Find the missing messenger", "quest", {
    campaign_id: campaign.id,
    progress: "active",
    priority: "high",
  });
  await add("Prepare the village encounter", "task", {
    progress: "open",
    priority: "high",
  });
  await add(
    "The festival has a secret",
    "note",
    {},
    { summary: "Private preparations and story possibilities." },
  );
  await add("Roadside encounters", "table", {
    columns: [{ id: "result", label: "Encounter", type: "text" }],
    rows: [
      {
        id: "1",
        weight: 3,
        cells: { result: "A fox carrying a sealed letter" },
      },
      {
        id: "2",
        weight: 1,
        cells: { result: "A bridge that was not here yesterday" },
      },
    ],
  });
  await add("Village rumors", "generator", {
    columns: [{ id: "result", label: "Rumor", type: "text" }],
    rows: [
      { id: "1", weight: 1, cells: { result: "The bells rang before dawn." } },
    ],
  });
  await add("Realm name", "variable", {
    value: "Gensokyo",
    tooltip: "The hidden land",
  });
  await add("Boundary spirit", "statblock", {
    system: "Homebrew",
    fields: { health: 24, strength: 16 },
    formulas: [
      { name: "Strength modifier", expression: "floor((strength-10)/2)" },
    ],
  });
  await add("Places and promises", "board", {
    cards: [
      {
        id: "one",
        x: 70,
        y: 65,
        text: "A promise at the shrine",
        color: "#f5e9b9",
        resource_id: reimu.id,
      },
      {
        id: "two",
        x: 380,
        y: 190,
        text: "Who sent the invitation?",
        color: "#dce7d3",
        resource_id: "",
      },
    ],
    connections: [{ id: "edge", source: "one", target: "two" }],
  });
  await add("The world at a glance", "tree", {
    items: [reimu.id, marisa.id, village.id],
  });
  await add("Spirit profile", "template", {
    fields: [
      { id: "origin", name: "Origin", type: "text", required: true },
      { id: "power", name: "Power", type: "long", required: false },
    ],
  });
  const book = await add("Where the Lanterns Lead", "manuscript", {
    goal: 12000,
    label: "First draft",
  });
  await add(
    "A light at the gate",
    "scene",
    { goal: 1200, label: "First draft" },
    {
      parent: book.id,
      position: 0,
      summary: "The visitor arrives after sunset.",
    },
  );
  try {
    await request("/worlds/" + world + "/connections", {
      source: reimu.id,
      target: marisa.id,
      kind: "friend",
      label: "Trusted rivals",
      strength: 70,
    });
  } catch (e) {
    if (!e.message.includes("already exists")) throw e;
  }
  window.qaFixtures = { world, asset: asset.id, ...out };
  localStorage.setItem("qaFixtures", JSON.stringify(window.qaFixtures));
  location.hash = "/home";
  await new Promise((r) => setTimeout(r, 300));
  location.reload();
  return { created: true, fixtures: window.qaFixtures };
})();
