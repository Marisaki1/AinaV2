(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaCampaign),
    pause = (ms = 120) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 70; i++) {
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
    const proto =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  const entries = () =>
    fetch(`/api/worlds/${f.world}/resources`)
      .then((r) => r.json())
      .then((v) => v.resources);
  location.hash = "/campaigns/" + f.campaign;
  await pause(600);
  for (const [tab, action, title, body] of [
    [
      "Day-to-day journal",
      "Add journal entry",
      "Day on the forest road",
      "Met the travelling merchant and camped by the river.",
    ],
    [
      "Progression",
      "Record milestone",
      "Tower milestone",
      "The party reached level 3 after resolving the shrine.",
    ],
    [
      "Notes & tasks",
      "Add campaign note",
      "Campaign clue",
      "The merchant wears the missing faction sigil.",
    ],
    [
      "Notes & tasks",
      "Add campaign task",
      "Prepare next session",
      "Prepare the tower map.",
    ],
    [
      "Progression",
      "Add campaign quest",
      "Find the missing villagers",
      "Follow the tracks through the forest.",
    ],
  ]) {
    button(tab, document.querySelector(".campaign-workspace")).click();
    await pause();
    button(action).click();
    await pause();
    await set(field("Record title"), title + " " + f.stamp);
    await set(field("Record notes"), body);
    await set(field("Related session"), f.played);
    if (field("Journal date")) {
      await set(field("Journal date"), "2026-11-05");
      await set(field("In-world day / chapter"), "Day 12 / forest road");
    }
    button("Save campaign record").click();
    let record;
    await wait(async () => {
      record = (await entries()).find((e) => e.title === title + " " + f.stamp);
      return record && !document.querySelector(".modal");
    }, "Record not saved " + title);
    expect(
      record.data.campaign_id === f.campaign &&
        record.data.session_id === f.played &&
        record.visibility === "private",
      "Record association or privacy",
    );
    expect(
      JSON.stringify(
        (await fetch("/api/resources/" + record.id).then((r) => r.json()))
          .document,
      ).includes(body),
      "Record body lost",
    );
    if (action === "Add journal entry") f.journal = record.id;
    if (action === "Add campaign task") f.task = record.id;
    if (action === "Add campaign quest") f.quest = record.id;
  }
  localStorage.qaCampaign = JSON.stringify(f);
  checks.push(
    "create private daily journal, milestone, campaign note, task and quest with original body text and session associations",
  );
  button(
    "Notes & tasks",
    document.querySelector(".campaign-workspace"),
  ).click();
  await pause();
  const text = document.querySelector(".campaign-workspace").textContent;
  expect(
    !text.includes("Other campaign private note"),
    "Other campaign record leaked into workspace",
  );
  await set(field("Search campaign records"), "Campaign clue");
  expect(
    document.querySelectorAll(".campaign-record-card").length === 1,
    "Campaign search",
  );
  await set(field("Search campaign records"), "");
  await set(field("Progress of Prepare next session " + f.stamp), "done");
  await wait(
    async () =>
      (await entries()).find((e) => e.id === f.task).data.progress === "done",
    "Task progress not saved",
  );
  button("Progression").click();
  await pause();
  await set(
    field("Progress of Find the missing villagers " + f.stamp),
    "failed",
  );
  await wait(
    async () =>
      (await entries()).find((e) => e.id === f.quest).data.progress ===
      "failed",
    "Quest outcome not saved",
  );
  checks.push(
    "campaign isolation, text filtering, completed task and abandoned quest persist",
  );
  button("Day-to-day journal").click();
  await pause();
  expect(
    document
      .querySelector(".campaign-workspace")
      .textContent.includes("Day 12 / forest road"),
    "Journal day label missing",
  );
  return { checks, journal: f.journal, task: f.task, quest: f.quest };
})();
