(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaWorkbench),
    other = JSON.parse(localStorage.qaLocation),
    pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 75; i++) {
        if (test()) return;
        await pause();
      }
      throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  location.hash = `/campaign-desk/${f.campaign}/desk/${f.session}`;
  await wait(
    () => button("Configure desk") && !button("Configure desk").disabled,
    "Desk",
  );
  button("Pin a reference").click();
  await pause();
  const select = [...document.querySelectorAll(".modal label.field")]
    .find((l) => l.querySelector("span")?.textContent === "Reference to pin")
    .querySelector("select");
  Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  ).set.call(select, other.npc);
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await pause();
  button("Save pin").click();
  await wait(() => !document.querySelector(".modal"), "World pin save");
  await wait(
    () =>
      document
        .querySelector(`[data-desk-pin="${other.npc}"]`)
        ?.textContent.includes("World reference"),
    "World reference label",
  );
  button(
    "Open reference",
    document.querySelector(`[data-desk-pin="${other.npc}"]`),
  ).click();
  await wait(
    () => document.querySelector(".dossier-header h1"),
    "World dossier",
  );
  expect(
    location.hash === `#/characters/${other.npc}`,
    "World pin incorrectly forced into campaign scope",
  );
  location.hash = `/campaign-desk/${f.campaign}/desk/${f.session}`;
  await wait(
    () => document.querySelector(`[data-desk-pin="${f.map}"]`),
    "Return desk",
  );
  button(
    "Explore map",
    document.querySelector(`[data-desk-pin="${f.map}"]`),
  ).click();
  await wait(
    () => document.querySelector(".modal .map-guide-location-list"),
    "Map inspector",
  );
  const map = await fetch("/api/resources/" + f.map).then((r) => r.json()),
    label = map.data.markers.find((m) => m.id === "hamlet").label;
  const pin = [
    ...document.querySelectorAll(".modal .map-guide-location-list button"),
  ].find((b) => b.textContent.trim() === label);
  expect(pin, "Map location button");
  pin.click();
  await wait(
    () =>
      document
        .querySelector(".modal .map-guide-records")
        ?.textContent.includes("Captured journal " + f.stamp),
    "Campaign map notes",
  );
  expect(
    !document
      .querySelector(".modal .map-guide-records")
      .textContent.includes("Audited session"),
    "Map reference mixed another campaign",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  f.worldReference = other.npc;
  localStorage.qaWorkbench = JSON.stringify(f);
  return {
    worldLorePinUsesWorldGuide: true,
    campaignMapPinKeepsCampaignNotesScoped: true,
  };
})();
