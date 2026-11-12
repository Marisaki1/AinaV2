(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const old = JSON.parse(localStorage.qaAudit),
    f = { world: old.world, hero: old.hero, stamp: Date.now() };
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
      }),
      v = await r.json();
    if (!r.ok) throw Error(JSON.stringify(v));
    return v;
  };
  const doc = (t) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
  });
  f.original = (
    await request(`/worlds/${f.world}/resources`, {
      kind: "note",
      title: "Notebook original " + f.stamp,
      document: doc("Original source: the silver lantern marks a safe path."),
      visibility: "private",
      data: { record_type: "note" },
    })
  ).id;
  const p = await request(`/worlds/${f.world}/resources`, {
    kind: "note",
    title: "Published notebook clue " + f.stamp,
    document: doc("PUBLIC NOTE SOURCE"),
    visibility: "public",
    data: { record_type: "note" },
  });
  await request(`/resources/${p.id}/publish`, {
    expected_revision: p.revision,
  });
  const live = await fetch("/api/resources/" + p.id).then((r) => r.json());
  await request(
    `/resources/${p.id}`,
    {
      document: doc("UNPUBLISHED NOTE SECRET"),
      expected_revision: live.revision,
    },
    "PATCH",
  );
  f.public = p.id;
  localStorage.qaNotebook = JSON.stringify(f);
  return f;
})();
