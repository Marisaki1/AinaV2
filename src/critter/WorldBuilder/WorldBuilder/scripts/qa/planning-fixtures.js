(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const base = JSON.parse(localStorage.qaAudit),
    f = {
      world: base.world,
      hero: base.hero,
      place: base.place,
      map: base.map,
      stamp: Date.now(),
    };
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
  const add = async (title, kind, data = {}, text = "", template = "") =>
    request(`/worlds/${f.world}/resources`, {
      title,
      kind,
      data,
      document: doc(text),
      ...(template ? { template } : {}),
      visibility: "private",
    });
  f.campaign = (
    await add("Adventure lifecycle " + f.stamp, "campaign", { party: [f.hero] })
  ).id;
  f.session = (
    await add("First night " + f.stamp, "session", {
      campaign_id: f.campaign,
      number: 1,
      status: "planned",
    })
  ).id;
  f.next = (
    await add("Second night " + f.stamp, "session", {
      campaign_id: f.campaign,
      number: 2,
      status: "planned",
    })
  ).id;
  f.task = (
    await add("Check the sealed door " + f.stamp, "task", {
      campaign_id: f.campaign,
      progress: "open",
    })
  ).id;
  f.note = (
    await add(
      "Recorded discovery " + f.stamp,
      "note",
      {
        campaign_id: f.campaign,
        session_id: f.session,
        record_type: "journal",
        logged_on: "2026-11-06",
        related_entries: [f.hero, f.place],
        follow_up_state: "open",
      },
      "A clue beyond the summary: silver lanterns point north.",
    )
  ).id;
  const published = await add(
    "Player clue " + f.stamp,
    "article",
    {},
    "PUBLISHED CLUE silver key",
  );
  await request(
    `/resources/${published.id}`,
    { visibility: "public", expected_revision: published.revision },
    "PATCH",
  );
  const publicRow = await fetch("/api/resources/" + published.id).then((r) =>
    r.json(),
  );
  await request(`/resources/${published.id}/publish`, {
    expected_revision: publicRow.revision,
  });
  const live = await fetch("/api/resources/" + published.id).then((r) =>
    r.json(),
  );
  await request(
    `/resources/${published.id}`,
    {
      document: doc("UNPUBLISHED SECRET future betrayal"),
      expected_revision: live.revision,
    },
    "PATCH",
  );
  f.published = published.id;
  f.secret = (
    await add(
      "PRIVATE SOURCE " + f.stamp,
      "note",
      { campaign_id: f.campaign },
      "PRIVATE SECRET concealed plan",
    )
  ).id;
  const assets = await fetch("/api/worlds/" + f.world + "/assets").then((r) =>
    r.json(),
  );
  f.image =
    (Array.isArray(assets) ? assets : assets.results || assets.assets || [])[0]
      ?.id || "";
  f.handout = (
    await add(
      "Travel handout " + f.stamp,
      "article",
      {
        planning_type: "handout",
        campaign_id: f.campaign,
        handout_text: "Approved player introduction",
        handout_sources: [f.published, f.secret],
        handout_images: f.image ? [f.image] : [],
      },
      "",
      "handout",
    )
  ).id;
  f.draft = (
    await add("Reference draft " + f.stamp, "note", {}, "Original draft text")
  ).id;
  localStorage.qaPlanning = JSON.stringify(f);
  return f;
})();
