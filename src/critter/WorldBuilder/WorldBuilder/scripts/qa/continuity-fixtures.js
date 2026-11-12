(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const old = JSON.parse(localStorage.qaAudit),
    f = {
      world: old.world,
      hero: old.hero,
      place: old.place,
      map: old.map,
      stamp: Date.now(),
    };
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const post = async (path, body) => {
    const r = await fetch("/api" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
        body: JSON.stringify(body),
      }),
      v = await r.json();
    if (!r.ok) throw Error(JSON.stringify(v));
    return v;
  };
  const add = async (title, kind, data = {}, template) =>
    post(`/worlds/${f.world}/resources`, {
      title,
      kind,
      data,
      ...(template ? { template } : {}),
      visibility: "private",
    });
  f.npc = (await add("Travelling keeper " + f.stamp, "character")).id;
  f.storage = (
    await add("Camp storage " + f.stamp, "article", {}, "building")
  ).id;
  f.campaign = (
    await add("Campaign continuity " + f.stamp, "campaign", {
      party: [f.hero],
      inventory: [
        {
          name: "Legacy rope " + f.stamp,
          quantity: 2,
          notes: "Original shared rope",
        },
      ],
    })
  ).id;
  f.session = (
    await add("Continuity session one " + f.stamp, "session", {
      campaign_id: f.campaign,
      number: 1,
      session_status: "in_progress",
    })
  ).id;
  f.next = (
    await add("Continuity session two " + f.stamp, "session", {
      campaign_id: f.campaign,
      number: 2,
    })
  ).id;
  f.quest = (
    await add("Find the lantern shrine " + f.stamp, "quest", {
      campaign_id: f.campaign,
      progress: "open",
      objectives: [
        { id: "locate", text: "Locate the hidden shrine", done: false },
      ],
    })
  ).id;
  f.scene = (
    await add(
      "Keeper at the gate " + f.stamp,
      "article",
      { campaign_id: f.campaign, planning_type: "campaign-scene" },
      "campaign-scene",
    )
  ).id;
  f.edge = (
    await post(`/worlds/${f.world}/connections`, {
      source: f.hero,
      target: f.npc,
      kind: "friend",
      label: "Cautious trust",
      strength: 5,
      visibility: "private",
    })
  ).id;
  f.handout = JSON.parse(localStorage.qaPlanning).handout;
  const assets = await fetch(`/api/worlds/${f.world}/assets`).then((r) =>
    r.json(),
  );
  f.image = (
    Array.isArray(assets) ? assets : assets.assets || assets.results
  )[0].id;
  localStorage.qaContinuity = JSON.stringify(f);
  return f;
})();
