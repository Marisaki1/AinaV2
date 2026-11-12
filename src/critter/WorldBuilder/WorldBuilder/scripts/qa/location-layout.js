(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaLocation),
    pause = (ms = 130) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw Error(m);
  };
  const button = (name, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === name,
    );
  location.hash = `/locations/${f.location}/${f.campaign}`;
  for (
    let i = 0;
    i < 60 && !document.querySelector(".location-guide .dossier-header h1");
    i++
  )
    await pause();
  expect(
    document.querySelector(".location-guide .dossier-header h1"),
    "Location guide route",
  );
  const checks = [];
  for (const name of [
    "Overview",
    "People & connections",
    "Visits & journal",
    "Changes & progression",
    "Maps & places",
    "All notes",
  ]) {
    button(
      name,
      document.querySelector('[aria-label="Location guide sections"]'),
    ).click();
    await pause();
    expect(
      document.documentElement.scrollWidth <= innerWidth + 1,
      "Page overflow " + name,
    );
    checks.push(name);
  }
  button("Record location milestone").click();
  await pause();
  for (const trigger of document.querySelectorAll(
    ".modal .searchable-select-trigger",
  )) {
    trigger.scrollIntoView({ block: "center" });
    trigger.click();
    await pause();
    const popup = document.querySelector(".searchable-select-popup"),
      rect = popup?.getBoundingClientRect();
    expect(
      rect &&
        rect.left >= 0 &&
        rect.right <= innerWidth + 1 &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight + 1 &&
        document.querySelector(".modal").contains(popup),
      "Dropdown viewport/modal bounds",
    );
    expect(
      document.activeElement === popup.querySelector("input"),
      "Search field focus",
    );
    popup
      .querySelector("input")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await pause();
  }
  button("Cancel", document.querySelector(".modal")).click();
  button(
    "People & connections",
    document.querySelector('[aria-label="Location guide sections"]'),
  ).click();
  window.scrollTo(0, 0);
  return { width: innerWidth, checks, searchableDropdownFocusAndBounds: true };
})();
