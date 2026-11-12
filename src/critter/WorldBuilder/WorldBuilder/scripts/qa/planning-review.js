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
  location.hash = `/campaign-flow/${f.campaign}/journal/${f.session}`;
  await wait(() => field("Search activity records"), "Journal opens");
  await set(field("Search activity records"), "silver lanterns point north");
  await wait(
    () => document.querySelectorAll("[data-activity-record]").length === 1,
    "Full-body journal search",
  );
  expect(
    document.querySelector(`[data-activity-record="${f.note}"]`),
    "Original note found",
  );
  await set(field("Search activity records"), "");
  await set(field("Activity character"), f.hero);
  await wait(
    () => document.querySelector(`[data-activity-record="${f.note}"]`),
    "Character filter",
  );
  button("Record change log").click();
  await pause();
  expect(
    document.querySelector(".progression-journal .workbench-record"),
    "Change log entries",
  );
  button("Follow-up inbox").click();
  await wait(
    () => document.querySelector(`[data-followup-record="${f.note}"]`),
    "Follow-up inbox",
  );
  const card = (id) => document.querySelector(`[data-followup-record="${id}"]`);
  await set(field("Schedule follow-up: Recorded discovery " + f.stamp), f.next);
  await wait(
    async () => (await get(f.note)).data.follow_up_session_id === f.next,
    "Follow-up schedule saved",
  );
  await pause(200);
  button("Turn into linked task", card(f.note)).click();
  await pause();
  await set(
    field("Follow-up task title"),
    "Investigate the lanterns " + f.stamp,
  );
  button("Create linked task").click();
  await wait(() => !document.querySelector(".modal"), "Linked task created");
  await wait(() => !card(f.note), "Converted original removed from inbox");
  const flow = await fetch(`/api/resources/${f.campaign}/lifecycle`).then((r) =>
    r.json(),
  );
  const task = flow.followups.find(
    (e) => e.title === "Investigate the lanterns " + f.stamp,
  );
  expect(task, "New linked task");
  f.followTask = task.id;
  expect(
    task.data.origin_session_id === f.session &&
      task.data.session_id === f.next,
    "Task origin and future session",
  );
  expect(JSON.stringify(task.document).includes(f.note), "Task links original");
  expect(
    (await get(f.note)).data.session_id === f.session,
    "Scheduling keeps original session",
  );
  button("Resolve follow-up", card(f.task)).click();
  await wait(() => !card(f.task), "Resolve task removes it");
  expect(
    (await get(f.task)).data.progress === "done",
    "Resolved task progress",
  );
  button("Review & handoff").click();
  await wait(() => field("Editable session recap"), "Review opens");
  const selected = [
    ...document.querySelectorAll(".session-review > .checkbox-list label"),
  ].find((l) => l.textContent.includes("Bridge discovery"));
  expect(selected, "Recap source");
  selected.querySelector("input").click();
  await pause();
  button("Append selected notes to recap").click();
  await wait(
    () => field("Editable session recap").value.includes("Players spared"),
    "Recap draft assembled",
  );
  await set(
    field("Editable session recap"),
    field("Editable session recap").value + "\nGM reviewed this recap.",
  );
  const originalConfirm = window.confirm;
  window.confirm = () => false;
  await set(field("Workflow session"), f.next);
  expect(
    field("Workflow session").value === f.session,
    "Unsaved recap blocks session switch",
  );
  window.confirm = originalConfirm;
  button("Save recap draft").click();
  await wait(
    () =>
      button("Save recap draft").disabled &&
      !button("Prepare next session")?.disabled,
    "Recap save",
  );
  const source = await get(f.session),
    oldAgenda = JSON.stringify(source.data.agenda);
  expect(source.data.recap.includes("GM reviewed"), "Editable recap persisted");
  expect(!source.published_revision, "No automatic publication");
  await set(field("Handoff target session"), f.next);
  const handoff = document.querySelector(".handoff-panel");
  for (const root of handoff.querySelectorAll(".checkbox-list")) {
    const checkbox = root.querySelector("input");
    if (checkbox) checkbox.click();
  }
  await pause();
  const go = [...handoff.querySelectorAll("button")].find(
    (b) => b.textContent.includes("Prepare") || b.textContent.includes("Carry"),
  );
  expect(go, "Handoff action");
  go.click();
  await wait(() => button("Open prepared session agenda"), "Handoff succeeds");
  const next = await get(f.next),
    after = await get(f.session);
  expect(next.data.agenda?.length === 1, "Selected unfinished item carried");
  expect(next.data.agenda[0].state === "planned", "New session resets state");
  expect(
    JSON.stringify(after.data.agenda) === oldAgenda,
    "Earlier agenda remains intact",
  );
  expect(after.data.handoff_target_id === f.next, "Handoff recorded");
  localStorage.qaPlanning = JSON.stringify(f);
  return {
    journalFilters: true,
    changeLog: true,
    followTask: f.followTask,
    recapPrivate: true,
    handoffTarget: f.next,
    sourceAgendaPreserved: true,
    targetAgenda: next.data.agenda,
  };
})();
