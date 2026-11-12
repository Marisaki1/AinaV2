(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAudit),
    stamp = Date.now();
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
    const value = await r.json();
    if (!r.ok) throw Error(JSON.stringify(value));
    return value;
  };
  const add = async (title, kind, data, publish = false, text = "") => {
    const entry = await request(`/worlds/${f.world}/resources`, {
      title,
      kind,
      data,
      visibility: publish ? "public" : "private",
      document: {
        type: "doc",
        content: [
          { type: "paragraph", content: text ? [{ type: "text", text }] : [] },
        ],
      },
    });
    if (publish)
      await request(`/resources/${entry.id}/publish`, {
        expected_revision: entry.revision,
      });
    return entry;
  };
  const rows = (
    await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
  ).resources;
  const number =
    Math.max(
      0,
      ...rows
        .filter(
          (e) => e.kind === "session" && e.data.campaign_id === f.campaign,
        )
        .map((e) => Number(e.data.number) || 0),
    ) + 1;
  const data = { campaign_id: f.campaign },
    g = { ...f, guideStamp: stamp };
  g.previous = (
    await add(
      "Guide previous " + stamp,
      "session",
      {
        ...data,
        number,
        next_steps: "Private carryover: investigate the shrine.",
      },
      true,
    )
  ).id;
  g.session = (
    await add(
      "Guide session " + stamp,
      "session",
      {
        ...data,
        number: number + 1,
        session_status: "planned",
        prep: "Private ambush plan.",
        recap: `${f.alias} reached the hamlet.`,
        consequences: "Private hidden faction.",
        rewards: "Village shelter.",
        next_steps: "Private follow-up.",
        map_id: f.map,
        marker_id: "hamlet",
        related_entries: [f.hero, f.npc],
      },
      true,
      "Original session body remains intact.",
    )
  ).id;
  g.next = (
    await add("Guide next " + stamp, "session", { ...data, number: number + 2 })
  ).id;
  g.publicRecord = (
    await add(
      "Published session discovery " + stamp,
      "note",
      {
        ...data,
        session_id: g.session,
        record_type: "journal",
        logged_on: "2026-11-05",
        related_entries: [f.hero],
      },
      true,
      `${f.alias} found a path.`,
    )
  ).id;
  g.privateRecord = (
    await add(
      "Secret session discovery " + stamp,
      "note",
      {
        ...data,
        session_id: g.session,
        record_type: "note",
        related_entries: [f.hidden],
      },
      false,
      "Private patron identity.",
    )
  ).id;
  g.outside = (
    await add(
      "Other-session note " + stamp,
      "note",
      { ...data, session_id: g.next },
      false,
      "Must not appear in the selected session.",
    )
  ).id;
  localStorage.qaSessionGuide = JSON.stringify(g);
  return { session: g.session, previous: g.previous, next: g.next, records: 3 };
})();
