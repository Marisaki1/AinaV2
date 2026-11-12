(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaWorkbench),
    pause = (ms = 110) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 65; i++) {
        if (test()) return;
        await pause();
      }
      throw Error(m);
    };
  const button = (n, root = document) =>
      [...root.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === n,
      ),
    checks = [];
  for (const view of ["desk", "threads", "notes"]) {
    location.hash = `/campaign-desk/${f.campaign}/${view}/${f.session}`;
    await wait(
      () =>
        document.querySelector(".campaign-workbench") &&
        !document.querySelector('.campaign-workbench [role="status"]'),
      "View " + view,
    );
    await pause(200);
    expect(
      document.documentElement.scrollWidth <= innerWidth + 1,
      "Page overflow " + view,
    );
    checks.push(view);
  }
  button("Quick capture").click();
  await pause();
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
      "Capture dropdown bounds",
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
    await pause(40);
  }
  button("Cancel", document.querySelector(".modal")).click();
  location.hash = "/threads/" + f.quest;
  await wait(() => document.querySelector(".thread-guide h1"), "Thread layout");
  await pause();
  expect(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "Thread page overflow",
  );
  checks.push("thread-guide");
  button("Edit objectives & outcome").click();
  await pause();
  expect(
    document.querySelector(".modal").scrollWidth <=
      document.querySelector(".modal").clientWidth + 1,
    "Objective editor overflow",
  );
  button("Cancel", document.querySelector(".modal")).click();
  location.hash = `/campaign-desk/${f.campaign}/desk/${f.session}`;
  await wait(
    () =>
      document.querySelector(".campaign-workbench") &&
      !document.querySelector('.campaign-workbench [role="status"]'),
    "Final desk",
  );
  window.scrollTo(0, 0);
  return {
    width: innerWidth,
    checks,
    captureDropdownSearchFocusAndBounds: true,
    objectiveEditorFits: true,
  };
})();
