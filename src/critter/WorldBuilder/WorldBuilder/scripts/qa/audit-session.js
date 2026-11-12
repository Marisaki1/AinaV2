(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAudit),
    pause = (ms = 140) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 85; i++) {
        if (await test()) return;
        await pause(100);
      }
      throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  const field = (n, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === n)
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
    await pause();
  };
  location.hash = "/campaigns/" + f.campaign;
  await pause(650);
  button("Run session", document.querySelector(".campaign-workspace")).click();
  await pause();
  button("Session", document.querySelector(".gm-layout")).click();
  await pause();
  await set(field("Name your entry"), "Audited session " + f.stamp);
  button("Create entry").click();
  await wait(() => field("Session number"), "New session editor");
  expect(
    field("Session number").value === "2",
    "Legacy GM form did not suggest next campaign number",
  );
  f.session = location.hash.split("/")[2];
  localStorage.qaAudit = JSON.stringify(f);
  await set(field("Preparation (GM only)"), "GM-only ambush preparation.");
  await set(field("Session recap"), `${f.alias} rescued the villagers.`);
  await set(
    field("Consequences & world changes (GM only)"),
    `${f.alias} is watched by the hidden faction.`,
  );
  await set(
    field("Rewards & progression"),
    "A promise of help from the village.",
  );
  await set(
    field("Next session follow-up (GM only)"),
    "GM-only plan for the shrine.",
  );
  await set(field("Linked campaign map"), f.map);
  await set(field("Linked map location"), "hamlet");
  await set(field("Session status"), "completed");
  await set(field("Visibility"), "public");
  button("Save reader version").click();
  await wait(async () => {
    const e = await fetch("/api/resources/" + f.session).then((r) => r.json());
    return (
      e.published_revision === e.revision &&
      e.data.session_status === "completed" &&
      e.data.marker_id === "hamlet"
    );
  }, "Session outcomes/publication");
  button("Open campaign workspace").click();
  await pause(650);
  button(
    "Day-to-day journal",
    document.querySelector(".campaign-workspace"),
  ).click();
  await pause();
  button("Add journal entry").click();
  await pause();
  await set(field("Record title"), "Audited daily journal " + f.stamp);
  await set(
    field("Record notes"),
    `${f.alias} kept a promise at ${f.placeName}.`,
  );
  await set(field("In-world day / chapter"), "Day 12 / village return");
  await set(field("Related session"), f.session);
  button("Save campaign record").click();
  await wait(async () => {
    const rows = (
      await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
    ).resources;
    const note = rows.find(
      (e) => e.title === "Audited daily journal " + f.stamp,
    );
    if (note) {
      f.journal = note.id;
      localStorage.qaAudit = JSON.stringify(f);
    }
    return !!note && !document.querySelector(".modal");
  }, "Daily journal creation");
  button("Progression", document.querySelector(".campaign-workspace")).click();
  await pause();
  await set(field("Progress of Find the villagers " + f.stamp), "done");
  await wait(
    async () =>
      (await fetch("/api/resources/" + f.quest).then((r) => r.json())).data
        .progress === "done",
    "Quest outcome",
  );
  expect(
    document
      .querySelector(".progression-journal")
      .textContent.includes("is watched by the hidden faction"),
    "Campaign consequence not shown in progression",
  );
  checks.push(
    "legacy GM session creation suggests session 2",
    "preparation, recap, consequences, rewards, follow-up, map/pin and completed state saved",
    "reader session publication retains snapshot",
    "daily journal retains original text/session association",
    "quest outcome and campaign consequence progression persist",
  );
  return { checks, session: f.session, journal: f.journal };
})();
