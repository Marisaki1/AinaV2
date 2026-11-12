(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaPlanning),
    pause = (ms = 85) => new Promise((r) => setTimeout(r, ms)),
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
    );
  const field = (n) =>
    [...document.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === n)
      ?.querySelector("input,textarea,select");
  const set = async (el, v) => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(el, v);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json());
  location.hash = `/campaign-flow/${f.campaign}/planner/${f.session}`;
  await wait(() => field("Adventure group filter"), "Planner");
  await set(field("Adventure group filter"), f.adventure);
  await wait(() => button("Arrange web"), "Adventure graph");
  button("Arrange web").click();
  await wait(
    async () =>
      Object.keys((await get(f.adventure)).data.positions || {}).length === 2,
    "Positions saved",
  );
  await pause(180);
  const savedPositions = (await get(f.adventure)).data.positions;
  const card = document.querySelector(`[data-planning-card="${f.encounter}"]`);
  button("Edit planning card", card).click();
  await pause();
  const base = JSON.parse(localStorage.qaFixtures);
  const related = document.querySelector(".modal .campaign-related");
  for (const id of [f.hero, base.statblock]) {
    const resource = await get(id);
    const choice = [...related.querySelectorAll("label")].find((l) =>
      l.textContent.includes(resource.title),
    );
    expect(choice, "Related cast/statblock choice");
    if (!choice.querySelector("input").checked)
      choice.querySelector("input").click();
    await pause();
  }
  button("Save planning record").click();
  await wait(() => !document.querySelector(".modal"), "Encounter cast saved");
  await wait(
    async () =>
      (await get(f.encounter)).data.related_entries.includes(base.statblock),
    "Cast saved",
  );
  location.hash = `/campaign-flow/${f.campaign}/run/${f.next}`;
  await wait(
    () => document.querySelector(`[data-agenda-item="${f.encounter}"]`),
    "Next session",
  );
  button(
    "Start item",
    document.querySelector(`[data-agenda-item="${f.encounter}"]`),
  ).click();
  await wait(
    () =>
      document
        .querySelector(".current-scene")
        ?.textContent.includes("GM secret stakes"),
    "Encounter running",
  );
  expect(
    button((await get(f.hero)).title, document.querySelector(".current-scene")),
    "Character guide link",
  );
  expect(
    button(
      (await get(base.statblock)).title,
      document.querySelector(".current-scene"),
    ),
    "Statblock link",
  );
  button("Capture session event").click();
  await pause();
  const refs = [...document.querySelectorAll(".modal .campaign-related label")]
    .filter((l) => l.querySelector("input").checked)
    .map((l) => l.textContent);
  expect(
    refs.some((t) =>
      t.includes(
        document.querySelector(".current-scene h2")?.textContent ||
          "impossible",
      ),
    ),
    "Current scene link inherited",
  );
  expect(
    refs.some(
      (t) =>
        t.includes("Strength") ||
        t.includes("statblock") ||
        t.includes(
          document.querySelector(".current-scene .button-row")?.textContent ||
            "impossible",
        ),
    ) || refs.length >= 3,
    "Cast and statblock inherited",
  );
  const oldConfirm = window.confirm;
  window.confirm = () => true;
  button("Cancel", document.querySelector(".modal")).click();
  window.confirm = oldConfirm;
  const source = await get(f.session);
  expect(
    source.data.agenda.find((v) => v.entry_id === f.encounter).state ===
      "skipped",
    "Earlier session unchanged by later run",
  );
  location.hash = `/campaign-flow/${f.campaign}/planner/${f.session}`;
  await wait(() => field("Adventure group filter"), "Reopen planner");
  await set(field("Adventure group filter"), f.adventure);
  await pause(150);
  expect(
    JSON.stringify((await get(f.adventure)).data.positions) ===
      JSON.stringify(savedPositions),
    "Layout retained",
  );
  return {
    diagramPositionsSaved: true,
    layoutRetained: true,
    castAndStatblockLinked: true,
    captureInheritsContext: true,
    earlierSessionStillSkipped: true,
  };
})();
