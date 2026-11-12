(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaContinuity),
    pause = (ms = 85) => new Promise((r) => setTimeout(r, ms)),
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
      ),
    field = (n) =>
      [...document.querySelectorAll("label.field")]
        .find((l) => l.querySelector("span")?.textContent === n)
        ?.querySelector("input,textarea,select");
  const set = async (el, v) => {
    expect(el, "Missing field");
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
  location.hash = `/campaign-continuity/${f.campaign}/quests/${f.session}`;
  await wait(
    () =>
      document.querySelector(
        `[data-affinity-node="${f.quest}/objective/locate"]`,
      ),
    "Objective node visible",
  );
  const objective = document.querySelector(
    `[data-affinity-node="${f.quest}/objective/locate"]`,
  );
  objective.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await wait(
    () => document.querySelector(".affinity-inspector .affinity-entry-notes"),
    "Objective opens original lore",
  );
  expect(
    document
      .querySelector(".affinity-inspector h3")
      .textContent.includes("Locate the hidden shrine"),
    "Objective inspector title",
  );
  button("Arrange web").click();
  await wait(
    async () =>
      !!(await get(f.campaign)).data.continuity_graph.positions[
        f.quest + "/objective/locate"
      ],
    "Objective position saved",
  );
  button("Open full entry & notes").click();
  await wait(
    () =>
      location.hash === "#/entry/" + f.quest &&
      document.querySelector(".entry-title"),
    "Original quest opens",
  );
  location.hash = `/characters/${f.hero}/${f.campaign}`;
  await wait(
    () => document.querySelector('[aria-label="Character dossier sections"]'),
    "Character dossier",
  );
  button(
    "Progression",
    document.querySelector('[aria-label="Character dossier sections"]'),
  ).click();
  await wait(
    () => document.querySelector(`[data-dossier-record="${f.progression}"]`),
    "Progression reaches character guide",
  );
  button("Open progression journal").click();
  await wait(
    () => field("Progression character")?.value === f.hero,
    "Character journal carries source filter",
  );
  const place = await fetch(
    `/api/resources/${f.place}/location-guide?campaign=${f.campaign}`,
  ).then((r) => r.json());
  expect(
    place.records.some((e) => e.id === f.placeStatus) &&
      place.records.some((e) => e.id === f.journey),
    "Place guide shares original status and journey",
  );
  location.hash = "/campaigns/" + f.campaign;
  await wait(
    () => document.querySelector(".campaign-workspace"),
    "Campaign workspace",
  );
  button("Affinity web", document.querySelector(".campaign-workspace")).click();
  await wait(() => button("New affinity web"), "Affinity workspace");
  if (!document.querySelector(`[data-affinity-edge="${f.edge}"]`)) {
    button("New affinity web").click();
    await pause();
    await set(
      document.querySelector(".modal input"),
      "Relationship history " + f.stamp,
    );
    button("Create affinity web").click();
    await wait(() => !document.querySelector(".modal"), "Affinity web created");
  }
  await wait(
    () => document.querySelector(`[data-affinity-edge="${f.edge}"]`),
    "Relationship edge visible",
  );
  document
    .querySelector(`[data-affinity-edge="${f.edge}"]`)
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  await wait(
    () =>
      document
        .querySelector(".affinity-inspector")
        .textContent.includes("Session relationship developments"),
    "Relationship developments in web",
  );
  expect(
    document
      .querySelector(".affinity-inspector")
      .textContent.includes("Trust earned at the shrine"),
    "Original session relationship event shown",
  );
  button("Record relationship developments").click();
  await wait(
    () => document.querySelector('[data-continuity-view="relationships"]'),
    "Web opens campaign relationship workflow",
  );
  return {
    objectiveNodeOpensOriginal: true,
    objectivePositionPersisted: true,
    characterProgressionIntegrated: true,
    locationJourneyAndStatusIntegrated: true,
    affinityWebShowsRelationshipHistory: true,
    campaignNavigationIntegrated: true,
  };
})();
