(async () => {
  const qaBoot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!qaBoot.test_workspace || location.port !== "8768")
    throw new Error(
      "This script only runs against an isolated .preview workspace on port 8768.",
    );
  const f = JSON.parse(localStorage.getItem("qaFixtures") || "null");
  if (!f || location.port !== "8768")
    throw new Error("Isolated QA workspace required.");
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const checks = [];
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(420);
  };
  const set = (el, v) => {
    if (!el) throw new Error("Expected input is missing");
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  await go("entry/" + f.map);
  const before = await fetch("/api/resources/" + f.map).then((r) => r.json());
  document.querySelector('[aria-label="Pin tool"]').click();
  await pause(80);
  const canvas = document.querySelector(".leaflet-container"),
    rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      clientX: rect.left + rect.width * 0.7,
      clientY: rect.top + rect.height * 0.55,
    }),
  );
  await pause(120);
  const name = document.querySelector(
    ".map-selection input:not([type=color]):not([type=checkbox])",
  );
  set(name, "QA saved pin");
  await pause(1350);
  const after = await fetch("/api/resources/" + f.map).then((r) => r.json());
  if (
    after.data.markers.length !== before.data.markers.length + 1 ||
    !after.data.markers.some((m) => m.label === "QA saved pin")
  )
    throw new Error("Map pin did not persist");
  checks.push("map pin placement, naming and autosave");
  await go("entry/" + f.article);
  const tags = document.querySelector('[aria-label="Entry tags"]');
  tags.focus();
  for (const value of ["l", "lo", "lore", "lore,", "lore, ", "lore, shrine"]) {
    set(tags, value);
    await pause(20);
  }
  if (tags.value !== "lore, shrine")
    throw new Error("Comma-separated tag input lost its delimiter");
  tags.blur();
  await pause(1300);
  const saved = await fetch("/api/resources/" + f.article).then((r) =>
    r.json(),
  );
  if (saved.tags.join("|") !== "lore|shrine")
    throw new Error("Tags did not persist");
  checks.push("multiple tags typed and saved");
  const visibility = document.querySelector(".entry-properties select");
  visibility.value = "public";
  visibility.dispatchEvent(new Event("change", { bubbles: true }));
  await pause(30);
  button("Save reader version").click();
  await pause(650);
  button("Reader preview").click();
  await pause(300);
  if (!document.querySelector(".reader-article"))
    throw new Error("Reader preview failed");
  document.querySelector('[aria-label="Close dialog"]').click();
  checks.push("reader snapshot and preview");
  document.querySelector('[aria-label="Revision history"]').click();
  await pause(300);
  if (!document.querySelector(".revision-list"))
    throw new Error("Revision history is missing");
  document.querySelector('[aria-label="Close dialog"]').click();
  checks.push("saved revision history");
  await go("campaigns/" + f.campaign);
  const dice = document.querySelector(".dice-form");
  dice.requestSubmit();
  await pause(450);
  if (!document.querySelector(".dice-result strong"))
    throw new Error("GM dice result missing");
  checks.push("GM screen dice roll and activity refresh");
  await go("history");
  button("Chronicles").click();
  await pause(350);
  if (!document.querySelector(".chronicle .leaflet-image-layer"))
    throw new Error("Chronicle map did not render");
  checks.push("chronicle event and map view");
  await go("home");
  return { passed: checks };
})();
