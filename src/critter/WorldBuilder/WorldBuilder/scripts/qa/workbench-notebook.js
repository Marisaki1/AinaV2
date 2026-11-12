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
    await pause(75);
  };
  location.hash = `/campaign-desk/${f.campaign}/notes/${f.session}`;
  await wait(
    () => document.querySelector(`[data-workbench-record="${f.capturedNote}"]`),
    "Campaign notebook",
  );
  expect(field("Session view").value === f.session, "Notebook session context");
  expect(
    !document.querySelector(`[data-workbench-record="${f.futureNote}"]`) &&
      !document.querySelector(`[data-workbench-record="${f.outside}"]`),
    "Notebook scope",
  );
  await set(field("Search campaign records"), f.longFact);
  await wait(
    () =>
      document.querySelectorAll(".workbench-notebook [data-workbench-record]")
        .length === 1 &&
      !!document.querySelector(`[data-workbench-record="${f.capturedNote}"]`),
    "Full body search after summary prefix",
  );
  await set(field("Search campaign records"), "");
  await set(field("Notebook record type"), "milestone");
  await wait(
    () =>
      document.querySelectorAll(".workbench-notebook [data-workbench-record]")
        .length === 1 &&
      !!document.querySelector(`[data-workbench-record="${f.milestone}"]`),
    "Record type filter",
  );
  await set(field("Notebook record type"), "journal");
  await wait(
    () => document.querySelector(`[data-workbench-record="${f.capturedNote}"]`),
    "Journal filter",
  );
  await pause(160);
  button(
    "Pin reference",
    document.querySelector(`[data-workbench-record="${f.capturedNote}"]`),
  ).click();
  await wait(
    () =>
      button(
        "Pinned",
        document.querySelector(`[data-workbench-record="${f.capturedNote}"]`),
      ),
    "Pin original from notebook",
  );
  button(
    "GM desk",
    document.querySelector('[aria-label="Campaign workbench views"]'),
  ).click();
  await wait(
    () => document.querySelector(`[data-desk-pin="${f.capturedNote}"]`),
    "Notebook pin on desk",
  );
  expect(
    field("Session view").value === f.session,
    "View navigation lost context",
  );
  button(
    "Explore map",
    document.querySelector(`[data-desk-pin="${f.map}"]`),
  ).click();
  await wait(
    () => document.querySelector(".modal .campaign-map-guide"),
    "Desk map",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await set(field("Saved desk layout"), f.reviewLayout);
  await pause(180);
  await wait(
    () => button("Configure desk") && !button("Configure desk").disabled,
    "Review layout",
  );
  button("Configure desk").click();
  await pause();
  const oldConfirm = window.confirm;
  try {
    window.confirm = () => true;
    button("Remove saved layout").click();
    await wait(() => !document.querySelector(".modal"), "Remove saved layout");
  } finally {
    window.confirm = oldConfirm;
  }
  const campaign = await fetch("/api/resources/" + f.campaign).then((r) =>
    r.json(),
  );
  expect(campaign.data.gm_workspace.layouts.length === 1, "Layout deletion");
  const note = await fetch("/api/resources/" + f.capturedNote).then((r) =>
    r.json(),
  );
  expect(
    note.document.content[0].content[0].text.includes(f.longFact),
    "Removing layout changed source note",
  );
  return {
    fullBodySearch: true,
    recordTypeAndSessionFilters: true,
    otherCampaignExcluded: true,
    pinFromNotebook: true,
    contextAcrossViews: true,
    mapReference: true,
    removeLayoutPreservesOriginals: true,
  };
})();
