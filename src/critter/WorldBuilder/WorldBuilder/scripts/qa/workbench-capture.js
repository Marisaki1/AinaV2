(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaWorkbench),
    pause = (ms = 90) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
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
    [...document.querySelectorAll(".modal label.field")]
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
    await pause(50);
  };
  location.hash = `/campaign-desk/${f.campaign}/desk/${f.session}`;
  await wait(
    () =>
      button("Quick capture") && document.querySelector("[data-desk-panel]"),
    "Desk",
  );
  f.longFact = "deep-body-clue-" + f.stamp;
  for (const kind of ["journal", "milestone", "quest"]) {
    button("Quick capture").click();
    await pause();
    await set(field("Capture title"), `Captured ${kind} ${f.stamp}`);
    await set(field("Capture type"), kind);
    await set(
      field("Capture notes"),
      kind === "journal"
        ? "A long journal. " + "Earlier observations. ".repeat(20) + f.longFact
        : `${f.alias} records ${kind} progress.`,
    );
    expect(
      field("Capture session").value === f.session,
      "Capture lost current session",
    );
    if (kind !== "quest") await set(field("Related quest or task"), f.quest);
    if (kind !== "quest")
      await set(field("In-world day / chapter"), "Day 16 / shrine return");
    await set(field("Capture tags (comma separated)"), "table-notes, shrine");
    await set(field("Capture map"), f.map);
    await set(field("Capture map pin"), "hamlet");
    const lore = [
      ...document.querySelectorAll(".modal .checkbox-list label"),
    ].find((l) => l.textContent.includes("Lantern hamlet"));
    if (lore) lore.querySelector("input").click();
    if (kind === "milestone")
      [...document.querySelectorAll(".modal label")]
        .find((l) => l.textContent.includes("Pin the saved record"))
        .querySelector("input")
        .click();
    button("Save capture").click();
    await wait(() => !document.querySelector(".modal"), "Capture save " + kind);
    const rows = (
        await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
      ).resources,
      e = rows.find((e) => e.title === `Captured ${kind} ${f.stamp}`);
    expect(
      e?.data.campaign_id === f.campaign &&
        e.data.session_id === f.session &&
        e.data.map_id === f.map &&
        e.data.marker_id === "hamlet" &&
        e.visibility === "private",
      "Capture associations " + kind,
    );
    if (kind !== "quest")
      expect(
        e.data.thread_id === f.quest &&
          e.data.related_entries.includes(f.quest),
        "Thread association " + kind,
      );
    f[
      kind === "journal"
        ? "capturedNote"
        : kind === "milestone"
          ? "milestone"
          : "newQuest"
    ] = e.id;
    await wait(
      () => !document.querySelector('.campaign-workbench [role="status"]'),
      "Refreshed capture",
    );
  }
  const campaign = await fetch("/api/resources/" + f.campaign).then((r) =>
    r.json(),
  );
  expect(
    campaign.data.gm_workspace.layouts
      .find((l) => l.id === f.mainLayout)
      .pins.some((p) => p.entry_id === f.milestone),
    "Capture pin not saved",
  );
  localStorage.qaWorkbench = JSON.stringify(f);
  return {
    privateJournalMilestoneQuest: true,
    sessionThreadMapAndLoreAssociations: true,
    datesAndTags: true,
    pinAfterCapture: true,
    longBodySearchFixture: f.longFact,
  };
})();
