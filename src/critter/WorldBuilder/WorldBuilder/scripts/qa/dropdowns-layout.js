(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.qaDropdowns),
    checks = [];
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  location.hash = "/relationships";
  await pause(600);
  button("Edit & history").click();
  await pause(100);
  const row = document.querySelector(`[data-connection-id="${f.edge}"]`);
  button("Edit", row).click();
  await pause(120);
  for (const trigger of document.querySelectorAll(
    ".modal .searchable-select-trigger",
  )) {
    trigger.scrollIntoView({ block: "center" });
    trigger.click();
    await pause(100);
    const popup = document.querySelector(".searchable-select-popup"),
      rect = popup.getBoundingClientRect();
    if (
      rect.left < 0 ||
      rect.right > innerWidth + 1 ||
      rect.top < 0 ||
      rect.bottom > innerHeight + 1
    )
      throw new Error(
        "Dropdown outside viewport: " + JSON.stringify(rect.toJSON()),
      );
    if (!document.querySelector(".modal").contains(popup))
      throw new Error("Dropdown escaped modal focus scope");
    if (document.activeElement !== popup.querySelector("input"))
      throw new Error("Search input not focused");
    checks.push({
      label: trigger.getAttribute("aria-label"),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: innerWidth,
    });
    popup
      .querySelector("input")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await pause(50);
  }
  if (document.documentElement.scrollWidth > innerWidth + 1)
    throw new Error("Connection editor page overflow");
  document.querySelector('.modal [role=combobox][aria-label="To"]').click();
  await pause(150);
  return checks;
})();
