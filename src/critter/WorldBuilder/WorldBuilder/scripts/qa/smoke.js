(async () => {
  const qaBoot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!qaBoot.test_workspace || location.port !== "8768")
    throw new Error(
      "This script only runs against an isolated .preview workspace on port 8768.",
    );
  const f = JSON.parse(localStorage.getItem("qaFixtures") || "null");
  if (!f || location.port !== "8768")
    throw new Error("QA fixtures on port 8768 required.");
  const pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  async function route(name, selector) {
    location.hash = "/" + name;
    await pause(330);
    if (!document.querySelector(selector))
      throw new Error(name + " did not render " + selector);
    if (document.querySelector("#main-content")?.innerText.trim().length < 10)
      throw new Error(name + " rendered blank");
    checks.push(name);
  }
  for (const [name, selector] of [
    ["home", ".world-hero"],
    ["library", ".library-toolbar"],
    ["maps", ".page-heading"],
    ["history", ".history-workspace"],
    ["relationships", ".relationship-canvas"],
    ["campaigns", ".campaign-card"],
    ["campaigns/" + f.campaign, ".gm-layout"],
    ["writing", ".manuscript-card"],
    ["writing/" + f.manuscript, ".writing-workspace"],
    ["notes", ".card-grid"],
    ["tools", ".tabs"],
    ["media", ".media-card"],
    ["import", ".folder-options"],
    ["settings", ".settings-columns"],
  ])
    await route(name, selector);
  for (const kind of [
    "article",
    "character",
    "map",
    "calendar",
    "event",
    "session",
    "quest",
    "task",
    "note",
    "table",
    "generator",
    "variable",
    "statblock",
    "board",
    "tree",
    "template",
    "scene",
  ]) {
    await route("entry/" + f[kind], ".entry-title");
    if (kind === "map" && !document.querySelector(".leaflet-image-layer"))
      throw new Error("Map image did not render.");
    if (
      kind === "statblock" &&
      !document.body.innerText.includes("Strength modifier")
    )
      throw new Error("Computed statblock missing");
  }
  location.hash = "/home";
  await pause(300);
  return {
    renderedRoutes: checks.length,
    checks,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})();
