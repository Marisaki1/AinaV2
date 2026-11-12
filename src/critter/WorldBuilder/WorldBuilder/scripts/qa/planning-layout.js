(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaPlanning),
    pause = (ms = 80) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 75; i++) {
      if (await test()) return;
      await pause();
    }
    throw Error(m);
  };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  const checks = [];
  const titles = {
    planner: "Adventure planner",
    agenda: "Session agenda",
    run: "Run session",
    journal: "Activity journal",
    followups: "Follow-up inbox",
    review: "Review & handoff",
    handouts: "Handouts",
  };
  for (const view of [
    "planner",
    "agenda",
    "run",
    "journal",
    "followups",
    "review",
    "handouts",
  ]) {
    location.hash = `/campaign-flow/${f.campaign}/${view}/${f.session}`;
    await wait(
      () =>
        document.querySelector(".campaign-lifecycle") &&
        document.querySelector(".campaign-lifecycle .tabs button.active")
          ?.textContent === titles[view] &&
        !document.querySelector('.campaign-lifecycle [role="status"]'),
      "View " + view,
    );
    await pause(120);
    expect(
      document.documentElement.scrollWidth <= innerWidth + 1,
      "Page overflow " + view,
    );
    checks.push(view);
  }
  button("New player handout").click();
  await pause();
  expect(
    document.querySelector(".modal").scrollWidth <=
      document.querySelector(".modal").clientWidth + 1,
    "Handout modal fits",
  );
  button("Cancel", document.querySelector(".modal")).click();
  await pause();
  button("Adventure planner").click();
  await wait(() => button("New encounter"), "Planner");
  button("New encounter").click();
  await pause();
  expect(
    document.querySelector(".modal").scrollWidth <=
      document.querySelector(".modal").clientWidth + 1,
    "Encounter modal fits",
  );
  for (const trigger of document.querySelectorAll(
    ".modal .searchable-select-trigger",
  )) {
    if (trigger.disabled) continue;
    trigger.scrollIntoView({ block: "center" });
    trigger.click();
    await pause();
    const popup = document.querySelector(".searchable-select-popup"),
      r = popup?.getBoundingClientRect();
    expect(
      r &&
        r.left >= 0 &&
        r.right <= innerWidth + 1 &&
        r.top >= 0 &&
        r.bottom <= innerHeight + 1,
      "Dropdown bounds",
    );
    expect(
      document.activeElement === popup.querySelector("input"),
      "Filter focus",
    );
    popup
      .querySelector("input")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await pause(35);
  }
  button("Cancel", document.querySelector(".modal")).click();
  await pause();
  const tray = document.querySelector(".reference-tray");
  tray.querySelector("button").click();
  await pause();
  const r = tray.getBoundingClientRect();
  expect(
    r.left >= 0 &&
      r.right <= innerWidth + 1 &&
      r.top >= 0 &&
      r.bottom <= innerHeight + 1,
    "Reference tray bounds",
  );
  tray.querySelector("button").click();
  window.scrollTo(0, 0);
  return {
    width: innerWidth,
    views: checks,
    encounterAndHandoutFit: true,
    searchableDropdownFocusAndBounds: true,
    referenceTrayFits: true,
  };
})();
