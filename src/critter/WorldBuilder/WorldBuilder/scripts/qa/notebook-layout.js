(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaNotebook),
    pause = (ms = 80) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 85; i++) {
      if (await test()) return;
      await pause();
    }
    throw Error(m);
  };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) =>
        b.textContent.trim() === n || b.firstChild?.textContent?.trim() === n,
    );
  location.hash = `/notebooks/all/${f.book}/${f.section}/${f.note}`;
  await wait(
    () => document.querySelector(".notebook-editor .tiptap"),
    "Notebook writing view",
  );
  await pause(150);
  expect(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "Writing page overflow",
  );
  const rows = document.querySelectorAll("[data-notebook-note]");
  button("Preview beside draft", rows[0]).click();
  await wait(
    () => document.querySelector(".notebook-reference h3"),
    "Split reference",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "Reference page overflow",
  );
  button("Close reference").click();
  await pause();
  button("Quick note").click();
  await wait(() => document.querySelector(".modal"), "Capture form");
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
      "Dropdown search focus",
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
  button("Visual note board").click();
  await wait(() => document.querySelector(".notebook-board"), "Board view");
  await pause(100);
  expect(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "Board page overflow",
  );
  expect(
    document.querySelector(".notebook-board-viewport").scrollWidth >
      document.querySelector(".notebook-board-viewport").clientWidth,
    "Board internally scrolls",
  );
  window.scrollTo(0, 0);
  return {
    width: innerWidth,
    writingAndReferenceFit: true,
    captureSearchFocusAndBounds: true,
    boardFitsAndScrollsInternally: true,
  };
})();
