(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaWorkbench),
    pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
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
    [...document.querySelectorAll("label.field")]
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
    await pause(55);
  };
  location.hash = `/campaign-desk/${f.campaign}/threads/${f.session}`;
  await wait(
    () => document.querySelector(`[data-thread-card="${f.quest}"]`),
    "Story board",
  );
  button(
    "Open thread guide",
    document.querySelector(`[data-thread-card="${f.quest}"]`),
  ).click();
  await wait(() => document.querySelector(".thread-guide h1"), "Thread guide");
  button("Edit objectives & outcome").click();
  await pause();
  await set(field("Story arc"), "Investigation " + f.stamp);
  document.querySelector('.modal [aria-label="Complete objective 1"]').click();
  button("Add objective").click();
  await pause();
  await set(
    document.querySelector('.modal [aria-label="Objective 2"]'),
    "Return the shrine clue",
  );
  await set(
    field("Outcome & discoveries"),
    `${f.alias} recovered the first clue.`,
  );
  await set(
    field("Next action (GM only)"),
    "GM-only reveal the hidden culprit.",
  );
  button("Save thread changes").click();
  await wait(() => !document.querySelector(".modal"), "Thread save");
  await wait(
    () =>
      document
        .querySelector(".thread-guide")
        .textContent.includes("Objectives · 1/2"),
    "Objective summary",
  );
  const original = await fetch("/api/resources/" + f.quest).then((r) =>
    r.json(),
  );
  expect(
    original.document.content[0].content[0].text ===
      "Original thread lore remains intact.",
    "Metadata edit rewrote thread lore",
  );
  button("Record thread update").click();
  await pause();
  await set(field("Capture title"), "Thread discovery " + f.stamp);
  await set(field("Capture type"), "journal");
  await set(
    field("Capture notes"),
    `${f.alias} discovered the keeper's route.`,
  );
  expect(
    field("Related quest or task").value === f.quest &&
      field("Capture session").value === f.session,
    "Thread capture context",
  );
  [...document.querySelectorAll(".modal label")]
    .find((l) => l.textContent.includes("Pin the saved record"))
    .querySelector("input")
    .click();
  button("Save capture").click();
  await wait(() => !document.querySelector(".modal"), "Thread update save");
  const rows = (
    await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
  ).resources;
  f.threadUpdate = rows.find(
    (e) => e.title === "Thread discovery " + f.stamp,
  ).id;
  await wait(
    () => document.querySelector(`[data-thread-update="${f.threadUpdate}"]`),
    "Linked update",
  );
  const campaign = await fetch("/api/resources/" + f.campaign).then((r) =>
    r.json(),
  );
  expect(
    campaign.data.gm_workspace.layouts
      .find((l) => l.id === f.mainLayout)
      .pins.some((p) => p.entry_id === f.threadUpdate),
    "Thread update pin",
  );
  button("Open story board").click();
  await wait(
    () => document.querySelector(`[data-thread-card="${f.quest}"]`),
    "Return board",
  );
  await pause(160);
  const transfer = new DataTransfer();
  transfer.setData("application/worldbuilder-thread", f.quest);
  document
    .querySelector('[data-story-lane="done"]')
    .dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
    );
  await wait(async () => {
    const e = await fetch("/api/resources/" + f.quest).then((r) => r.json());
    return e.data.progress === "done";
  }, "Drag lane saved");
  await wait(
    () =>
      document.querySelector(
        `[data-story-lane="done"] [data-thread-card="${f.quest}"]`,
      ),
    "Done lane render",
  );
  await set(field("Story arc filter"), "Investigation " + f.stamp);
  await wait(
    () => document.querySelectorAll("[data-thread-card]").length === 1,
    "Arc filter",
  );
  const published = await fetch(
    `/api/resources/${f.quest}?audience=reader`,
  ).then((r) => r.json());
  expect(
    published.data.progress === "active" &&
      published.data.objectives.length === 1 &&
      !published.data.objectives[0].done,
    "Board edits changed publication",
  );
  localStorage.qaWorkbench = JSON.stringify(f);
  return {
    objectiveEditing: true,
    originalLorePreserved: true,
    threadCaptureAndPin: true,
    dragStatusSaved: true,
    arcFilter: true,
    publicationUnchanged: true,
    thread: f.quest,
  };
})();
