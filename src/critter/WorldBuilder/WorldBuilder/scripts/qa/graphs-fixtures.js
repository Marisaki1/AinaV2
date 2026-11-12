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
  const post = async (path, data) => {
    const r = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(data),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(v));
    return v;
  };
  const add = async (title, kind = "character", data = {}, more = {}) => {
    const e = await post("/worlds/" + f.world + "/resources", {
      title,
      kind,
      data,
      visibility: "public",
      ...more,
    });
    if (e.visibility === "public")
      await post("/resources/" + e.id + "/publish", {
        expected_revision: e.revision,
      });
    return e;
  };
  const people = {};
  for (const name of [
    "Aoi",
    "Ren",
    "Mio",
    "Yuki",
    "Hana",
    "Kai",
    "Rin",
    "Sana",
    "Emi",
    "Unrelated",
  ])
    people[name] = (await add("QA " + name)).id;
  people.Secret = (
    await add("QA Hidden heir", "character", {}, { visibility: "private" })
  ).id;
  const edges = [
    ["Sana", "Aoi", "parent"],
    ["Sana", "Emi", "parent"],
    ["Emi", "Kai", "parent"],
    ["Aoi", "Mio", "parent"],
    ["Ren", "Mio", "parent"],
    ["Mio", "Yuki", "parent"],
    ["Aoi", "Hana", "parent"],
    ["Aoi", "Rin", "adoptive-parent"],
    ["Aoi", "Ren", "spouse"],
    ["Aoi", "Secret", "parent"],
  ];
  for (const [a, b, kind] of edges)
    await post("/worlds/" + f.world + "/connections", {
      source: people[a],
      target: people[b],
      kind,
      visibility: "public",
      notes: "GM graph fixture notes",
    });
  const lore = {};
  for (const name of ["A", "B", "C", "D"])
    lore[name] = (await add("QA Lore " + name, "article")).id;
  lore.Secret = (
    await add("QA Hidden lore", "article", {}, { visibility: "private" })
  ).id;
  lore.Tagged = (
    await add("QA Tagged lore", "article", {}, { tags: ["graph-lore"] })
  ).id;
  const tree = await add("QA content hierarchy", "tree", {
    items: [lore.A, lore.B, lore.C, lore.D, lore.Secret],
    parents: { [lore.B]: lore.A, [lore.C]: lore.B },
    selection: "manual",
  });
  const out = { world: f.world, people, lore, tree: tree.id };
  localStorage.setItem("qaGraphs", JSON.stringify(out));
  return out;
})();
