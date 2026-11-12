(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaFixtures")),
    csrf = decodeURIComponent(
      document.cookie
        .split("; ")
        .find((s) => s.startsWith(boot.csrf_cookie + "="))
        ?.split("=")[1] || "",
    );
  const post = async (path, value) => {
    const r = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(value),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(v));
    return v;
  };
  const add = async (title, tags, visibility = "public") => {
    const e = await post("/worlds/" + f.world + "/resources", {
      title,
      kind: "character",
      tags,
      visibility,
    });
    if (visibility === "public")
      await post("/resources/" + e.id + "/publish", {
        expected_revision: e.revision,
      });
    return e.id;
  };
  const stamp = Date.now(),
    tag = "export-lore-" + stamp;
  const root = await add("Export root", [tag]),
    child = await add("Export child", [tag]),
    other = await add("Export traveler", ["other"]),
    secret = await add("Hidden export keeper", [tag], "private");
  for (const [a, b, kind] of [
    [root, child, "parent"],
    [root, secret, "parent"],
    [child, other, "friend"],
  ])
    await post("/worlds/" + f.world + "/connections", {
      source: a,
      target: b,
      kind,
      visibility: "public",
      notes: "Do not export motive",
    });
  const out = {
    world: f.world,
    root,
    child,
    other,
    secret,
    name: "QA saved family " + stamp,
    tag,
  };
  localStorage.setItem("qaSavedGraphs", JSON.stringify(out));
  return out;
})();
