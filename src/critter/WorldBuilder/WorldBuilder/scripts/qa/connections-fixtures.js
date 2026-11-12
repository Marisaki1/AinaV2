(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const old = JSON.parse(localStorage.getItem("qaFixtures")),
    csrf = decodeURIComponent(
      document.cookie
        .split("; ")
        .find((s) => s.startsWith(boot.csrf_cookie + "="))
        ?.split("=")[1] || "",
    );
  const post = async (path, body) => {
    const r = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(body),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(v));
    return v;
  };
  const stamp = Date.now(),
    tag = "connection-edit-" + stamp;
  const add = async (name) => {
    const r = await post(`/worlds/${old.world}/resources`, {
      title: name,
      kind: "character",
      tags: [tag],
      visibility: "public",
    });
    await post(`/resources/${r.id}/publish`, { expected_revision: r.revision });
    return r.id;
  };
  const a = await add("Étoile guardian " + stamp),
    b = await add("Harbor partner " + stamp);
  const edge = await post(`/worlds/${old.world}/connections`, {
    source: a,
    target: b,
    kind: "diplomacy",
    label: "Old allegiance",
    strength: -20,
    notes: "Private original note",
    visibility: "public",
  });
  const graph = await post(`/worlds/${old.world}/resources`, {
    title: "Connection edit graph " + stamp,
    kind: "relationship",
    visibility: "public",
    data: { mode: "diplomacy", tags: [tag], tag_mode: "all" },
  });
  await post(`/resources/${graph.id}/publish`, {
    expected_revision: graph.revision,
  });
  const f = { world: old.world, a, b, edge: edge.id, graph: graph.id, tag };
  localStorage.setItem("qaDropdowns", JSON.stringify(f));
  location.reload();
  return f;
})();
