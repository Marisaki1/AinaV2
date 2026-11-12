(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaPlanning),
    pause = (ms = 70) => new Promise((r) => setTimeout(r, ms)),
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
      (b) => b.textContent.trim() === n,
    );
  const field = (n) =>
    [...document.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === n)
      ?.querySelector("input,textarea,select");
  const set = async (el, v) => {
    expect(el, "Missing field " + v);
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
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
  const rows = () =>
    fetch("/api/resources/" + f.campaign + "/lifecycle").then((r) => r.json());
  location.hash = `/campaign-flow/${f.campaign}/planner/${f.session}`;
  await wait(() => button("New adventure"), "Planner opens");
  button("New adventure").click();
  await pause();
  await set(field("Planning title"), "Lantern road " + f.stamp);
  await set(field("Initial planning notes"), "Original adventure outline");
  button("Save planning record").click();
  await wait(() => !document.querySelector(".modal"), "Adventure saved");
  f.adventure = (await rows()).planning.find(
    (e) => e.data.planning_type === "adventure",
  ).id;
  await wait(
    () =>
      field("Adventure group filter")?.querySelector(
        `option[value="${f.adventure}"]`,
      ),
    "Adventure refresh",
  );
  await set(field("Adventure group filter"), f.adventure);
  for (const [type, title, text] of [
    ["scene", "Lantern gate", "Original approach lore"],
    ["encounter", "Bridge ambush", "Original encounter lore"],
  ]) {
    button("New " + type).click();
    await pause();
    expect(
      field("Adventure group").value === f.adventure,
      "Selected group inherited",
    );
    await set(field("Planning title"), title + " " + f.stamp);
    await set(field("Initial planning notes"), text);
    await set(field("Player-visible summary"), "Public " + type + " context");
    await set(field("Stakes (GM only)"), "GM secret stakes " + type);
    await set(field("Environment (GM only)"), "Fog over the road");
    await set(field("Possible outcomes (GM only)"), "Negotiate or retreat");
    await set(field("Planning map"), f.map);
    button("Save planning record").click();
    await wait(() => !document.querySelector(".modal"), "Scene saved");
    const e = (await rows()).planning.find(
      (e) => e.title === title + " " + f.stamp,
    );
    f[type] = e.id;
    await wait(
      () => document.querySelector(`[data-planning-card="${e.id}"]`),
      "Scene card appears",
    );
  }
  const card = (id) => document.querySelector(`[data-planning-card="${id}"]`);
  button("Edit planning card", card(f.scene)).click();
  await pause();
  button("Add scene branch").click();
  await pause();
  await set(field("Branch target 1"), f.encounter);
  await set(field("Branch label 1"), "Cross the bridge");
  await set(field("Branch condition (GM only) 1"), "GM route condition");
  button("Save planning record").click();
  await wait(() => !document.querySelector(".modal"), "Branch saved");
  await wait(
    async () => !!(await get(f.scene)).data.next_scenes?.length,
    "Branch persisted",
  );
  button("Edit planning card", card(f.encounter)).click();
  await pause();
  const prerequisite = [
    ...document.querySelectorAll(".modal .checkbox-list label"),
  ].find((l) => l.textContent.includes("Lantern gate"));
  expect(prerequisite, "Prerequisite choice");
  prerequisite.querySelector("input").click();
  button("Save planning record").click();
  await wait(() => !document.querySelector(".modal"), "Prerequisite saved");
  await wait(
    async () => (await get(f.encounter)).data.prerequisites?.includes(f.scene),
    "Prerequisite persisted",
  );
  const first = () =>
    [...document.querySelectorAll("[data-planning-card]")].map(
      (e) => e.dataset.planningCard,
    );
  const before = first(),
    toMove = before[1];
  button("Move scene up", card(toMove)).click();
  await wait(() => first()[0] === toMove, "Scene order saved");
  const scene = await get(f.scene),
    encounter = await get(f.encounter),
    adventure = await get(f.adventure);
  expect(
    scene.document.content[0].content[0].text === "Original approach lore",
    "Metadata preserves original rich document",
  );
  expect(
    encounter.data.prerequisites.includes(f.scene),
    "Prerequisite identity",
  );
  expect(adventure.data.scene_ids[0] === toMove, "Ordered adventure UUIDs");
  expect(document.querySelector(".affinity-stage"), "Visual route graph");
  localStorage.qaPlanning = JSON.stringify(f);
  return {
    adventure: f.adventure,
    scene: f.scene,
    encounter: f.encounter,
    branches: scene.data.next_scenes,
    prerequisites: encounter.data.prerequisites,
    order: adventure.data.scene_ids,
    originalDocumentPreserved: true,
  };
})();
