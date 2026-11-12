(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.qaFixtures),
    c = JSON.parse(localStorage.qaDropdowns),
    r = JSON.parse(localStorage.qaRecurrence),
    checks = [];
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const set = async (input, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await pause(15);
  };
  for (const route of [
    "home",
    "library",
    "maps",
    "history/" + r.timeline,
    "relationships",
    "writing",
    "tools",
    "media",
    "import",
    "settings",
    ...[
      "character",
      "article",
      "calendar",
      "map",
      "event",
      "table",
      "statblock",
    ].map((kind) => "entry/" + f[kind]),
  ]) {
    location.hash = "/" + route;
    await pause(310);
    const selects = [...document.querySelectorAll("select")];
    if (selects.some((select) => !select.closest(".searchable-select")))
      throw new Error("Unconverted dropdown on " + route);
    let tested = 0;
    for (const select of selects) {
      const trigger = select.parentElement.querySelector(
        ".searchable-select-trigger",
      );
      if (select.disabled || !trigger.getClientRects().length) continue;
      const before = select.value;
      trigger.click();
      await pause(15);
      const input = document.querySelector(".searchable-select-popup input");
      if (!input) throw new Error("No filter input on " + route);
      await set(input, "no_match_dropdown_987654321");
      if (
        document.querySelectorAll(".searchable-select-popup [role=option]")
          .length ||
        !document.querySelector(".searchable-select-empty")
      )
        throw new Error("No-match filtering failed on " + route);
      await set(input, "");
      if (
        select.options.length &&
        !document.querySelector(".searchable-select-popup [role=option]")
      )
        throw new Error("Clearing filter failed on " + route);
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await pause(10);
      if (
        document.querySelector(".searchable-select-popup") ||
        select.value !== before
      )
        throw new Error("Cancel changed selection on " + route);
      tested++;
    }
    checks.push({ route, filtered_dropdowns: tested });
  }
  return {
    checks,
    total: checks.reduce((sum, row) => sum + row.filtered_dropdowns, 0),
  };
})();
