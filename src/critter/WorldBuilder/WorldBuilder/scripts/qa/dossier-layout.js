(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAudit),
    pause = (ms = 160) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  location.hash = "/characters/" + f.hero + "/" + f.campaign;
  await pause(700);
  const checks = [];
  for (const name of [
    "Overview",
    "Relationship web",
    "Progression",
    "Sessions & journal",
    "Places & maps",
    "All notes",
  ]) {
    button(
      name,
      document.querySelector('[aria-label="Character dossier sections"]'),
    ).click();
    await pause(180);
    expect(
      document.documentElement.scrollWidth <= innerWidth + 1,
      "Dossier page overflow " + name,
    );
    checks.push(name);
  }
  button("Record character milestone").click();
  await pause(150);
  for (const trigger of document.querySelectorAll(
    ".modal .searchable-select-trigger",
  )) {
    trigger.scrollIntoView({ block: "center" });
    trigger.click();
    await pause(100);
    const popup = document.querySelector(".searchable-select-popup"),
      r = popup.getBoundingClientRect();
    expect(
      document.querySelector(".modal").contains(popup) &&
        r.left >= 0 &&
        r.right <= innerWidth + 1 &&
        r.top >= 0 &&
        r.bottom <= innerHeight + 1,
      "Dossier note dropdown bounds",
    );
    expect(
      document.activeElement === popup.querySelector("input"),
      "Filter input focus",
    );
    popup
      .querySelector("input")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await pause(50);
  }
  button("Cancel", document.querySelector(".modal")).click();
  button(
    "Progression",
    document.querySelector('[aria-label="Character dossier sections"]'),
  ).click();
  await pause(100);
  document
    .querySelector(".character-dossier")
    .scrollIntoView({ block: "start" });
  return {
    width: innerWidth,
    checks,
    noteDropdownsSearchableAndWithinModal: true,
  };
})();
