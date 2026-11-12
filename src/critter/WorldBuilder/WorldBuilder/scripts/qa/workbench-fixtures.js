(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAudit),
    stamp = Date.now(),
    g = {
      world: f.world,
      hero: f.hero,
      place: f.place,
      map: f.map,
      alias: f.alias,
      stamp,
    };
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const request = async (path, body) => {
    const r = await fetch("/api" + path, {
      method: "POST",
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
  const add = async (title, kind, data = {}, text = "", publish = false) => {
    const e = await request(`/worlds/${g.world}/resources`, {
      title,
      kind,
      data,
      document: doc(text),
      visibility: publish ? "public" : "private",
    });
    if (publish)
      await request(`/resources/${e.id}/publish`, {
        expected_revision: e.revision,
      });
    return e.id;
  };
  g.campaign = await add(
    "Complete campaign workflow " + stamp,
    "campaign",
    { party: [g.hero], related_entries: [g.place, g.map] },
    "",
    true,
  );
  g.session = await add(
    "Prepare and play " + stamp,
    "session",
    {
      campaign_id: g.campaign,
      number: 1,
      session_status: "planned",
      prep: "GM-only ambush preparation.",
      recap: `${g.alias} arrived.`,
      map_id: g.map,
      marker_id: "hamlet",
    },
    "Original session report.",
    true,
  );
  g.next = await add(
    "Next session " + stamp,
    "session",
    { campaign_id: g.campaign, number: 2 },
    "Future session.",
  );
  g.quest = await add(
    "Recover the shrine clue " + stamp,
    "quest",
    {
      campaign_id: g.campaign,
      session_id: g.session,
      progress: "active",
      story_arc: "Shrine arc " + stamp,
      objectives: [{ id: "meet", text: "Meet the keeper", done: false }],
      outcome: `${g.alias} found a trail.`,
      gm_next_step: "GM-only thread culprit.",
      related_entries: [g.hero, g.place],
    },
    "Original thread lore remains intact.",
    true,
  );
  g.task = await add(
    "Repair the village gate " + stamp,
    "task",
    { campaign_id: g.campaign, session_id: g.session, progress: "open" },
    "Private repair instructions.",
  );
  g.done = await add(
    "Earlier road mystery " + stamp,
    "quest",
    {
      campaign_id: g.campaign,
      progress: "done",
      story_arc: "Road arc " + stamp,
    },
    "Finished elsewhere.",
  );
  g.note = await add(
    "Published field note " + stamp,
    "note",
    {
      campaign_id: g.campaign,
      session_id: g.session,
      record_type: "journal",
      thread_id: g.quest,
      related_entries: [g.quest],
    },
    "A public discovery.",
    true,
  );
  const other = await add("Other workflow campaign " + stamp, "campaign");
  g.outside = await add(
    "Must stay in another campaign " + stamp,
    "note",
    { campaign_id: other },
    "Other-campaign-only body.",
  );
  g.futureNote = await add(
    "Future-session record " + stamp,
    "note",
    { campaign_id: g.campaign, session_id: g.next },
    "Should not appear in the active session.",
  );
  localStorage.qaWorkbench = JSON.stringify(g);
  return {
    campaign: g.campaign,
    session: g.session,
    quest: g.quest,
    originalRecords: true,
  };
})();
