(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaGuideLinks),
    pause = (ms = 150) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const button = (n, root = document) =>
      [...root.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === n,
      ),
    field = (n) =>
      [...document.querySelectorAll("label.field")]
        .find((l) => l.querySelector("span")?.textContent === n)
        ?.querySelector("select");
  location.hash = "/campaigns/" + f.campaign;
  await pause(600);
  button("Maps", document.querySelector(".campaign-workspace")).click();
  await pause(550);
  const select = field("Campaign map");
  Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  ).set.call(select, f.map);
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await pause(450);
  document.querySelector('[data-guide-marker="hamlet"]').click();
  await pause(500);
  expect(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "Map guide page overflow",
  );
  expect(
    document.querySelector(".map-guide-canvas").getBoundingClientRect().width <=
      innerWidth,
    "Map canvas width",
  );
  expect(
    document
      .querySelector(".map-guide-inspector")
      .textContent.includes(f.placeTitle),
    "Location inspector not accessible",
  );
  button("Write location note").click();
  await pause(150);
  for (const trigger of document.querySelectorAll(
    ".modal .searchable-select-trigger",
  )) {
    trigger.scrollIntoView({ block: "center" });
    trigger.click();
    await pause(100);
    const popup = document.querySelector(".searchable-select-popup"),
      rect = popup.getBoundingClientRect();
    expect(
      document.querySelector(".modal").contains(popup) &&
        rect.left >= 0 &&
        rect.right <= innerWidth + 1 &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight + 1,
      "Note dropdown outside modal/viewport",
    );
    expect(
      document.activeElement === popup.querySelector("input"),
      "Note filter not focused",
    );
    popup
      .querySelector("input")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await pause(60);
  }
  button("Cancel", document.querySelector(".modal")).click();
  await pause(100);
  document
    .querySelector(".map-guide-layout")
    .scrollIntoView({ block: "start" });
  window.scrollBy(0, -85);
  return {
    width: innerWidth,
    mapFits: true,
    locationNotesAccessible: true,
    searchableNoteDropdownBounds: true,
  };
})();
