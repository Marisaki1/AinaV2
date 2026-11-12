(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaSessionGuide),
    pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw Error(m);
  };
  const wait = async (test, m) => {
    for (let i = 0; i < 80; i++) {
      if (await test()) return;
      await pause();
    }
    throw Error(m);
  };
  const button = (name, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === name,
    );
  const field = (name) =>
    [...document.querySelectorAll(".modal label.field")]
      .find((l) => l.querySelector("span")?.textContent === name)
      ?.querySelector("input,select,textarea");
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
    await pause(50);
  };
  location.hash = "/campaigns/" + f.campaign;
  await pause(500);
  const card = document.querySelector(`[data-campaign-record="${f.session}"]`);
  expect(card, "Session campaign card");
  button("Open session guide", card).click();
  await wait(
    () =>
      document.querySelector(".session-guide h1")?.textContent ===
      "Guide session " + f.guideStamp,
    "Session route",
  );
  expect(
    document
      .querySelector(".session-guide")
      .textContent.includes("Private carryover"),
    "Previous follow-up reference",
  );
  button("Edit session plan & outcomes").click();
  await pause();
  button("Append previous session follow-up").click();
  await pause();
  expect(
    field("Preparation (GM only)").value.includes("Private ambush plan.") &&
      field("Preparation (GM only)").value.includes("Private carryover"),
    "Append preserves preparation",
  );
  await set(field("Session status"), "in_progress");
  await set(
    field("Session recap"),
    `${f.alias} fulfilled the village promise.`,
  );
  button("Save session plan").click();
  await wait(() => !document.querySelector(".modal"), "Save plan");
  await wait(
    () =>
      document
        .querySelector(".session-guide")
        .textContent.includes("fulfilled the village promise"),
    "Updated guide",
  );
  const original = await fetch("/api/resources/" + f.session).then((r) =>
    r.json(),
  );
  const published = await fetch(
    `/api/resources/${f.session}?audience=reader`,
  ).then((r) => r.json());
  expect(
    original.data.session_status === "in_progress" &&
      published.data.session_status === "planned",
    "Draft changed publication",
  );
  expect(
    original.document.content[0].content[0].text ===
      "Original session body remains intact.",
    "Original body changed",
  );
  f.created = [];
  for (const type of ["journal", "milestone", "task"]) {
    button("Write session record").click();
    await pause();
    await set(field("Record title"), `Guide ${type} ${f.guideStamp}`);
    await set(field("Record type"), type);
    await set(field("Record notes"), `${f.alias} recorded ${type} progress.`);
    if (type !== "task")
      await set(field("In-world day / chapter"), "Day 14 / village promise");
    button("Save session record").click();
    await wait(() => !document.querySelector(".modal"), "Save " + type);
    const rows = (
      await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
    ).resources;
    const record = rows.find(
      (e) => e.title === `Guide ${type} ${f.guideStamp}`,
    );
    expect(
      record?.data.session_id === f.session &&
        record.data.campaign_id === f.campaign &&
        record.data.marker_id === "hamlet" &&
        record.data.related_entries.includes(f.hero) &&
        record.visibility === "private",
      "Record associations " + type,
    );
    f.created.push(record.id);
  }
  localStorage.qaSessionGuide = JSON.stringify(f);
  button(
    "Session notes",
    document.querySelector('[aria-label="Session guide sections"]'),
  ).click();
  await pause(200);
  expect(
    f.created.every((id) =>
      document.querySelector(`[data-session-record="${id}"]`),
    ),
    "New records not visible",
  );
  expect(
    !document.querySelector(`[data-session-record="${f.outside}"]`),
    "Other-session note leaked",
  );
  const task = document.querySelector(
    `[data-session-record="${f.created[2]}"]`,
  );
  const select = task.querySelector("select");
  await set(select, "done");
  await wait(
    async () =>
      (await fetch("/api/resources/" + f.created[2]).then((r) => r.json())).data
        .progress === "done",
    "Task progress",
  );
  button(
    "Cast & lore",
    document.querySelector('[aria-label="Session guide sections"]'),
  ).click();
  await pause(160);
  expect(
    document.querySelector(".session-guide-cards").textContent.includes(f.name),
    "Cast missing",
  );
  button(
    "View character dossier",
    document.querySelector(".session-guide-cards"),
  ).click();
  await wait(
    () => document.querySelector(".dossier-header"),
    "Character dossier navigation",
  );
  location.hash = "/sessions/" + f.session;
  await wait(
    () => document.querySelector(".session-guide h1"),
    "Return session",
  );
  button(
    "Maps & places",
    document.querySelector('[aria-label="Session guide sections"]'),
  ).click();
  await pause();
  button("Explore this location").click();
  await wait(
    () =>
      document
        .querySelector(".modal .map-guide-inspector")
        ?.textContent.includes(f.placeName),
    "Focused location guide",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  button("Next: Guide next " + f.guideStamp).click();
  await wait(
    () =>
      document.querySelector(".session-guide h1")?.textContent ===
      "Guide next " + f.guideStamp,
    "Next-session navigation",
  );
  location.hash = "/sessions/" + f.session;
  await wait(
    () =>
      document.querySelector(".session-guide h1")?.textContent ===
      "Guide session " + f.guideStamp,
    "Reopen session",
  );
  return {
    campaignCardNavigation: true,
    planOutcomesPreserved: true,
    followUpAppended: true,
    publicationUnchanged: true,
    originalBodyUnchanged: true,
    privateJournalMilestoneTask: f.created,
    scopedRecords: true,
    taskProgress: true,
    characterDossier: true,
    focusedMap: true,
    adjacentSessions: true,
  };
})();
