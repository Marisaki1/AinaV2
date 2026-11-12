(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaContinuity),
    pause = (ms = 80) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 80; i++) {
      if (await test()) return;
      await pause();
    }
    throw Error(m);
  };
  const button = (n, root = document) =>
      [...root.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === n,
      ),
    checks = [];
  for (const view of [
    "overview",
    "party",
    "progression",
    "inventory",
    "quests",
    "consequences",
    "relationships",
    "journeys",
    "places",
    "media",
    "wrapup",
  ]) {
    location.hash = `/campaign-continuity/${f.campaign}/${view}/${f.session}`;
    await wait(
      () => document.querySelector(`[data-continuity-view="${view}"]`),
      "View " + view,
    );
    await pause(100);
    expect(
      document.documentElement.scrollWidth <= innerWidth + 1,
      "Page overflow " + view,
    );
    checks.push(view);
  }
  button("Equipment & loot").click();
  await wait(() => button("Record & distribute loot"), "Inventory");
  button("Record & distribute loot").click();
  await pause();
  expect(
    document.querySelector(".modal").scrollWidth <=
      document.querySelector(".modal").clientWidth + 1,
    "Inventory modal fits",
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
      "Dropdown filter focus",
    );
    popup
      .querySelector("input")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await pause(30);
  }
  button("Cancel", document.querySelector(".modal")).click();
  await pause();
  button("Map journeys").click();
  await wait(() => button("Draw campaign journey"), "Journey tab");
  button("Draw campaign journey").click();
  await pause();
  expect(
    document.querySelector(".modal").scrollWidth <=
      document.querySelector(".modal").clientWidth + 1,
    "Journey modal fits",
  );
  button("Cancel", document.querySelector(".modal")).click();
  await pause();
  button("Party & cast").click();
  await wait(() => button("Edit party & roles"), "Party tab");
  button("Edit party & roles").click();
  await pause();
  expect(
    document.querySelector(".modal").scrollWidth <=
      document.querySelector(".modal").clientWidth + 1,
    "Party modal fits",
  );
  button("Cancel", document.querySelector(".modal")).click();
  await pause();
  button("Continuity overview").click();
  await wait(
    () => document.querySelector('[data-continuity-view="overview"]'),
    "Final overview",
  );
  window.scrollTo(0, 0);
  return {
    width: innerWidth,
    views: checks,
    inventoryJourneyPartyFormsFit: true,
    dropdownFilterFocusAndBounds: true,
  };
})();
