(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaSpecialDays),
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  for (const id of [f.cal, f.series, f.map]) {
    location.hash = "/entry/" + id;
    await pause(650);
    if (document.documentElement.scrollWidth > innerWidth + 1)
      throw Error("Page overflow " + id);
    const controls =
      id === f.cal
        ? [
            ...document.querySelectorAll(
              ".special-days-editor .searchable-select-trigger",
            ),
          ]
        : [...document.querySelectorAll(".searchable-select-trigger")].filter(
            (b) => b.getAttribute("aria-label") === "Start date period",
          );
    for (const el of controls) {
      el.scrollIntoView({ block: "center" });
      el.click();
      await pause(80);
      const p = document.querySelector(".searchable-select-popup"),
        r = p.getBoundingClientRect();
      if (
        r.left < 0 ||
        r.right > innerWidth + 1 ||
        r.top < 0 ||
        r.bottom > innerHeight + 1
      )
        throw Error("Popup overflow");
      if (document.activeElement !== p.querySelector("input"))
        throw Error("Search not focused");
      p.querySelector("input").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await pause(60);
    }
    checks.push({ id, searchableControls: controls.length });
  }
  location.hash = "/entry/" + f.cal;
  await pause(600);
  document
    .querySelector(".special-days-editor")
    .scrollIntoView({ block: "start" });
  return { width: innerWidth, checks };
})();
