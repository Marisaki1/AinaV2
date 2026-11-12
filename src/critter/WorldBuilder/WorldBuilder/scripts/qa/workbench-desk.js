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
    [...document.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === n)
      ?.querySelector("input,select,textarea");
  const set = async (el, v) => {
    expect(el, "Missing field " + v);
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
    await pause(50);
  };
  const ready = async () => {
    await pause(90);
    await wait(
      () => button("Configure desk") && !button("Configure desk").disabled,
      "Desk ready",
    );
  };
  const saved = async () => {
    await wait(() => !document.querySelector(".modal"), "Modal save");
    await ready();
  };
  location.hash = "/campaigns/" + f.campaign;
  await pause(450);
  button("Open GM desk").click();
  await ready();
  expect(
    document.querySelectorAll("[data-desk-panel]").length === 6,
    "Default six panels",
  );
  button("Configure desk").click();
  await pause();
  await set(field("Desk layout name"), "Play layout " + f.stamp);
  await set(field("Desk columns"), "2");
  await set(field("Layout session"), f.session);
  button("Save desk layout").click();
  await saved();
  expect(
    field("Session view").value === f.session,
    "Configured session not activated",
  );
  for (const id of [f.hero, f.map, f.note]) {
    button("Pin a reference").click();
    await pause();
    await set(field("Reference to pin"), id);
    button("Save pin").click();
    await saved();
    expect(
      document.querySelector(`[data-desk-pin="${id}"]`),
      "Pin did not appear",
    );
  }
  const pin = document.querySelector(`[data-desk-pin="${f.map}"]`);
  button("Up", pin).click();
  await ready();
  await wait(
    () =>
      document.querySelectorAll("[data-desk-pin]")[0]?.dataset.deskPin ===
      f.map,
    "Pin order",
  );
  button(
    "Wide card",
    document.querySelector(`[data-desk-pin="${f.map}"]`),
  ).click();
  await ready();
  await wait(
    () =>
      document
        .querySelector(`[data-desk-pin="${f.map}"]`)
        ?.classList.contains("wide"),
    "Wide pin",
  );
  const mapsPanel = () => document.querySelector('[data-desk-panel="maps"]');
  button("Collapse", mapsPanel()).click();
  await ready();
  await wait(() => button("Expand", mapsPanel()), "Collapse persisted");
  document.querySelector('[aria-label="Move Quick capture up"]').click();
  await ready();
  button("Configure desk").click();
  await pause();
  await set(field("Desk layout name"), "Review layout " + f.stamp);
  [...document.querySelectorAll(".modal label")]
    .find((l) => l.textContent.trim() === "Save as a new layout")
    .querySelector("input")
    .click();
  button("Save desk layout").click();
  await saved();
  const entry = await fetch("/api/resources/" + f.campaign).then((r) =>
    r.json(),
  );
  const settings = entry.data.gm_workspace;
  expect(settings.layouts.length === 2, "Saved layout copy");
  f.reviewLayout = settings.selected_layout;
  f.mainLayout = "default";
  await set(field("Saved desk layout"), f.mainLayout);
  await ready();
  await wait(
    () => field("Saved desk layout")?.value === f.mainLayout,
    "Layout selection",
  );
  localStorage.qaWorkbench = JSON.stringify(f);
  return {
    campaignNavigation: true,
    sixConfigurablePanels: true,
    savedLayoutAndSession: true,
    pinOrderAndWidth: true,
    collapseAndPanelOrder: true,
    separateSavedLayouts: true,
    sourcePins: [f.hero, f.map, f.note],
  };
})();
