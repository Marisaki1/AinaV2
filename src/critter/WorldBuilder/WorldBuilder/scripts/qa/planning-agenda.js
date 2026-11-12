(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaPlanning),
    pause = (ms = 80) => new Promise((r) => setTimeout(r, ms)),
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
  location.hash = `/campaign-flow/${f.campaign}/agenda/${f.session}`;
  await wait(() => button("Edit session agenda"), "Agenda opens");
  button("Edit session agenda").click();
  await pause();
  button("Add prepared scenes").click();
  await pause();
  await set(field("Add agenda reference"), f.task);
  button("Add agenda item").click();
  await pause();
  await set(field("Agenda preparation 1"), "Ask about the missing courier");
  await set(field("Agenda state 1"), "active");
  button("Save agenda").click();
  await wait(() => !document.querySelector(".modal"), "Agenda saves");
  await wait(
    () => document.querySelectorAll("[data-agenda-item]").length === 3,
    "Agenda updated",
  );
  let session = await get(f.session);
  expect(session.data.agenda.length === 3, "Three references");
  const originalScenes = await Promise.all([get(f.scene), get(f.encounter)]);
  button("Run session").click();
  await wait(() => document.querySelector(".current-scene"), "Running view");
  const row = (id) => document.querySelector(`[data-agenda-item="${id}"]`);
  button("Start item", row(f.scene)).click();
  await wait(
    () => row(f.scene)?.classList.contains("active"),
    "First scene active",
  );
  await pause(150);
  expect(
    document.body.textContent.includes("GM secret stakes scene"),
    "GM preparation visible",
  );
  expect(button("Take this route"), "Branch available");
  button("Take this route").click();
  await wait(
    () => row(f.encounter)?.classList.contains("active"),
    "Branch target active",
  );
  await pause(160);
  expect(
    document.body.textContent.includes("You can still choose the route"),
    "Prerequisite guidance visible",
  );
  button("Capture session event").click();
  await pause();
  expect(
    field("Capture session").value === f.session,
    "Capture session inherited",
  );
  expect(
    field("Capture scene").value === f.encounter,
    "Capture scene inherited",
  );
  expect(field("Capture map").value === f.map, "Capture map inherited");
  await set(field("Capture title"), "Bridge discovery " + f.stamp);
  await set(
    field("Capture notes"),
    "Players spared the courier. Remember the silver lanterns.",
  );
  const follow = [...document.querySelectorAll(".modal label")].find((l) =>
    l.textContent.includes("Needs follow-up"),
  );
  expect(follow, "Capture follow-up control");
  follow.querySelector("input").click();
  button("Save capture").click();
  await wait(() => !document.querySelector(".modal"), "Capture saved");
  const flow = await fetch(
    `/api/resources/${f.campaign}/lifecycle?session=${f.session}`,
  ).then((r) => r.json());
  const captured = flow.journal.find(
    (e) => e.title === "Bridge discovery " + f.stamp,
  );
  expect(captured, "Captured event exists");
  expect(
    captured.data.session_id === f.session &&
      captured.data.scene_id === f.encounter,
    "Origin identity",
  );
  expect(
    captured.data.follow_up_state === "open" &&
      captured.visibility === "private",
    "Private flagged capture",
  );
  f.captured = captured.id;
  button("Skip current item").click();
  await wait(
    () => !row(f.encounter)?.classList.contains("active"),
    "Skip applied",
  );
  await pause(150);
  session = await get(f.session);
  expect(
    session.data.agenda.find((v) => v.entry_id === f.encounter).state ===
      "skipped",
    "Skipped state",
  );
  expect(
    (await get(f.next)).data.agenda === undefined,
    "Next session independent",
  );
  for (const original of originalScenes)
    expect(
      (await get(original.id)).revision === original.revision,
      "Running must not change definition",
    );
  localStorage.qaPlanning = JSON.stringify(f);
  return {
    agenda: session.data.agenda,
    captured: f.captured,
    originSession: f.session,
    originScene: f.encounter,
    sceneDefinitionsUnchanged: true,
    nextSessionUnchanged: true,
  };
})();
