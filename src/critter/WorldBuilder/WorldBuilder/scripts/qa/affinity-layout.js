(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAffinity),
    pause = (ms = 150) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  location.hash = "/campaigns/" + f.campaign;
  await pause(650);
  button("Affinity web", document.querySelector(".campaign-workspace")).click();
  await pause(650);
  expect(
    document.querySelectorAll("[data-affinity-node]").length === 8,
    "Affinity chart missing",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "Chart page overflow",
  );
  const canvas = document.querySelector(".affinity-stage"),
    r = canvas.getBoundingClientRect();
  expect(r.width <= innerWidth && r.width > 200, "Chart viewport width");
  document
    .querySelector(`[data-affinity-node="${f.hero}"]`)
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await pause(350);
  expect(
    document
      .querySelector(".affinity-inspector")
      .textContent.includes("Affinity field note"),
    "Inspector note missing",
  );
  const select = [...document.querySelectorAll("label.field")]
    .find((l) => l.querySelector("span")?.textContent === "Connection type")
    .querySelector(".searchable-select-trigger");
  select.scrollIntoView({ block: "center" });
  select.click();
  await pause(120);
  let popup = document.querySelector(".searchable-select-popup"),
    rect = popup.getBoundingClientRect();
  expect(
    rect.left >= 0 &&
      rect.right <= innerWidth + 1 &&
      rect.top >= 0 &&
      rect.bottom <= innerHeight + 1,
    "Chart filter popup bounds",
  );
  expect(
    document.activeElement === popup.querySelector("input"),
    "Filter search focus",
  );
  popup
    .querySelector("input")
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  await pause(80);
  button("Connect this entry").click();
  await pause(150);
  for (const trigger of document.querySelectorAll(
    ".modal .searchable-select-trigger",
  )) {
    trigger.scrollIntoView({ block: "center" });
    trigger.click();
    await pause(80);
    popup = document.querySelector(".searchable-select-popup");
    rect = popup.getBoundingClientRect();
    expect(
      document.querySelector(".modal").contains(popup) &&
        rect.left >= 0 &&
        rect.right <= innerWidth + 1 &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight + 1,
      "Connection modal popup bounds",
    );
    popup
      .querySelector("input")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await pause(50);
  }
  button("Cancel", document.querySelector(".modal")).click();
  await pause(150);
  canvas.scrollIntoView({ block: "start" });
  window.scrollBy(0, -85);
  return {
    width: innerWidth,
    nodes: 8,
    chartFits: true,
    notesAccessible: true,
    filterAndConnectionDropdownBounds: true,
  };
})();
