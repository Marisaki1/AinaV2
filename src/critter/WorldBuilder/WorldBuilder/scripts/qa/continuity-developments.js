(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaContinuity),
    pause = (ms = 75) => new Promise((r) => setTimeout(r, ms)),
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
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json()),
    flow = () =>
      fetch(
        `/api/resources/${f.campaign}/continuity?session=${f.session}`,
      ).then((r) => r.json());
  const related = async (id) => {
    const row = await get(id),
      label = [
        ...document.querySelectorAll(".modal .campaign-related-list label"),
      ].find((l) => l.querySelector("span")?.textContent.startsWith(row.title));
    expect(label, "Related original");
    label.querySelector("input").click();
    await pause();
  };
  const saved = async () => {
    button("Save campaign changes").click();
    await wait(() => !document.querySelector(".modal"), "Record save");
  };
  location.hash = `/campaign-continuity/${f.campaign}/progression/${f.session}`;
  await wait(() => button("Record character progression"), "Progression");
  button("Record character progression").click();
  await pause();
  await set(field("Continuity record title"), "Spirit sight gained " + f.stamp);
  await set(field("Progression category"), "ability");
  await set(
    field("Continuity notes"),
    "The hero learned to see the silver spirit paths.",
  );
  await related(f.hero);
  await saved();
  let value = await flow();
  f.progression = value.records.find(
    (e) => e.title === "Spirit sight gained " + f.stamp,
  ).id;
  expect(
    (await get(f.progression)).data.record_type === "milestone",
    "Progression links existing journal",
  );
  button("Quest dependencies").click();
  await wait(
    () => document.querySelector(`[data-dependency-source="${f.quest}"]`),
    "Quest guide",
  );
  button(
    "Edit quest dependencies",
    document.querySelector(`[data-dependency-source="${f.quest}"]`),
  ).click();
  await pause();
  button("Add dependency").click();
  await pause();
  await set(field("Dependency target 1"), f.scene);
  await set(field("Source Objective 1"), "locate");
  await set(
    field("Dependency guidance 1"),
    "After locating the shrine, visit the keeper.",
  );
  await saved();
  await wait(
    async () => (await get(f.quest)).data.continuity_dependencies?.length === 1,
    "Dependency persisted",
  );
  await pause(120);
  button("Arrange web").click();
  await wait(
    async () =>
      Object.keys(
        (await get(f.campaign)).data.continuity_graph?.positions || {},
      ).length >= 2,
    "Quest layout persisted",
  );
  button("Consequences").click();
  await wait(() => button("Record campaign consequence"), "Consequences");
  button("Record campaign consequence").click();
  await pause();
  await set(
    field("Continuity record title"),
    "Keeper owes a favour " + f.stamp,
  );
  await set(
    field("Continuity notes"),
    "Sparing the keeper opens a future alliance.",
  );
  await related(f.hero);
  await related(f.place);
  [...document.querySelectorAll(".modal label")]
    .find((l) => l.textContent.includes("Needs campaign follow-up"))
    .querySelector("input")
    .click();
  await saved();
  value = await flow();
  f.consequence = value.records.find(
    (e) => e.title === "Keeper owes a favour " + f.stamp,
  ).id;
  expect(
    value.followups.some((e) => e.id === f.consequence),
    "Consequence reaches follow-up inbox",
  );
  button("Relationship events").click();
  await wait(() => button("Record relationship development"), "Relationships");
  button("Record relationship development").click();
  await pause();
  await set(
    field("Continuity record title"),
    "Trust earned at the shrine " + f.stamp,
  );
  await set(field("Relationship source"), f.edge);
  await set(
    field("Continuity notes"),
    "The keeper now trusts the hero after the rescue.",
  );
  [...document.querySelectorAll(".modal label")]
    .find((l) => l.textContent.includes("Update the relationship together"))
    .querySelector("input")
    .click();
  await pause();
  await set(field("Updated relationship label"), "Sworn allies");
  await set(field("Updated relationship strength"), "25");
  await saved();
  const edge = await fetch("/api/connections/" + f.edge).then((r) => r.json());
  expect(
    edge.strength === 25 && edge.label === "Sworn allies",
    "Relationship and event save together",
  );
  value = await flow();
  f.relationship = value.records.find(
    (e) => e.title === "Trust earned at the shrine " + f.stamp,
  ).id;
  const event = await get(f.relationship);
  expect(
    event.data.related_entries.includes(f.hero) &&
      event.data.related_entries.includes(f.npc),
    "Relationship endpoints retained",
  );
  localStorage.qaContinuity = JSON.stringify(f);
  return {
    progression: f.progression,
    objectiveDependency: true,
    questDiagramSaved: true,
    consequence: f.consequence,
    followupLinked: true,
    relationshipEvent: f.relationship,
    relationshipStrength: edge.strength,
  };
})();
