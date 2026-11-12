(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaSessionGuide),
    pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw Error(m);
  };
  const button = (name, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === name,
    );
  location.hash = "/sessions/" + f.session;
  for (let i = 0; i < 60 && !document.querySelector(".session-guide h1"); i++)
    await pause();
  expect(document.querySelector(".session-guide h1"), "Session route");
  const checks = [];
  for (const name of [
    "Plan & outcomes",
    "Session notes",
    "Cast & lore",
    "Maps & places",
  ]) {
    button(
      name,
      document.querySelector('[aria-label="Session guide sections"]'),
    ).click();
    await pause();
    expect(
      document.documentElement.scrollWidth <= innerWidth + 1,
      "Horizontal overflow " + name,
    );
    checks.push(name);
  }
  for (const [action, field] of [
    ["Edit session plan & outcomes", "Session status"],
    ["Write session record", "Record type"],
  ]) {
    button(action).click();
    await pause();
    const label = [...document.querySelectorAll(".modal label.field")].find(
      (l) => l.querySelector("span")?.textContent === field,
    );
    label.querySelector('button[aria-haspopup="listbox"]').click();
    await pause();
    const popup = document.querySelector(".searchable-select-popup"),
      rect = popup?.getBoundingClientRect();
    expect(
      rect &&
        rect.left >= 0 &&
        rect.right <= innerWidth + 1 &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight + 1,
      "Dropdown bounds " + field,
    );
    expect(
      document.activeElement === popup.querySelector("input"),
      "Dropdown search focus",
    );
    popup
      .querySelector("input")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await pause();
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
  }
  button(
    "Plan & outcomes",
    document.querySelector('[aria-label="Session guide sections"]'),
  ).click();
  window.scrollTo(0, 0);
  return { width: innerWidth, checks, searchableDropdownBoundsAndFocus: true };
})();
