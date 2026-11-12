(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaCalendarIcons")),
    checks = [];
  const pause = (ms = 160) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw new Error(m);
  };
  const wait = async (test, message) => {
    for (let i = 0; i < 70; i++) {
      if (test()) return;
      await pause(100);
    }
    throw new Error(message);
  };
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const field = (name, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === name)
      ?.querySelector("input,select");
  const set = async (el, value) => {
    expect(el, "Missing field " + value);
    const proto =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  const go = async (id) => {
    location.hash = "/entry/" + id;
    await pause(650);
  };
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json());
  const saved = async (id, test) => {
    for (let i = 0; i < 60; i++) {
      const entry = await get(id);
      if (test(entry)) return entry;
      await pause(150);
    }
    throw new Error("Edit did not save");
  };
  await go(f.cal);
  await wait(
    () => document.querySelector(".calendar-grid button"),
    "Calendar preview missing",
  );
  await set(field("Preview year"), 1900);
  await set(field("Preview month"), 2);
  await wait(
    () => document.querySelectorAll(".calendar-grid button").length === 20,
    "Century exception did not apply",
  );
  await set(field("Preview year"), 2000);
  await wait(
    () => document.querySelectorAll(".calendar-grid button").length === 21,
    "Restoration did not apply",
  );
  document.querySelectorAll(".calendar-grid button")[20].click();
  await pause();
  expect(
    document
      .querySelector(".calendar-day-detail")
      .innerText.includes("Dusk 21, 2000"),
    "Day selection failed",
  );
  expect(
    document.querySelectorAll(".calendar-day-detail p").length === 3,
    "Multiple moon details missing",
  );
  await set(field("Weekday cycle"), "reset_month");
  await saved(f.cal, (e) => e.data.week_mode === "reset_month");
  await wait(
    () => document.querySelector(".calendar-grid button"),
    "Reset preview missing",
  );
  expect(
    document
      .querySelector(".calendar-grid button")
      .getAttribute("aria-label")
      .endsWith("Star"),
    "Reset weekday offset wrong",
  );
  await set(field("Convert day ordinal"), -1);
  button("Find date").click();
  await wait(
    () => field("Preview year").value === "-1",
    "Negative ordinal conversion failed",
  );
  await wait(
    () =>
      document
        .querySelector(".calendar-grid button[aria-pressed=true]")
        ?.textContent.startsWith("20"),
    "Converted day selection failed",
  );
  checks.push(
    "century exceptions, restoration, month reset, weekday offset, two moons and negative ordinal conversion",
  );
  button("Add leap rule").click();
  await pause();
  expect(
    document.querySelectorAll(".calendar-rule legend").length === 4,
    "New leap rule missing",
  );
  button("Remove leap rule 2").click();
  await pause();
  button("Add moon").click();
  await pause();
  await set(field("Moon 3 name"), "Violet");
  await saved(
    f.cal,
    (e) => e.data.moons.length === 3 && e.data.moons[2].name === "Violet",
  );
  button("Remove moon 3").click();
  await saved(f.cal, (e) => e.data.moons.length === 2);
  checks.push("add/remove leap rules and celestial cycles save correctly");
  button("Export calendar JSON").click();
  await pause(850);
  const definition = await fetch(
    `/api/resources/${f.cal}/calendar-export`,
  ).then((r) => r.json());
  f.exported = definition;
  const input = document.querySelector(
      'input[aria-label="Calendar definition file"]',
    ),
    transfer = new DataTransfer();
  transfer.items.add(
    new File([JSON.stringify(definition)], "calendar.json", {
      type: "application/json",
    }),
  );
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(
    () => location.hash !== "#/entry/" + f.cal,
    "Imported calendar did not open",
  );
  await pause(600);
  f.imported = location.hash.split("/").at(-1);
  let imported = await get(f.imported);
  expect(
    imported.visibility === "private" &&
      JSON.stringify(imported.data) === JSON.stringify(definition.calendar),
    "Import did not preserve settings/private default",
  );
  checks.push(
    "actual calendar download and browser file import preserve settings as a new private entry",
  );
  await go(f.cal);
  button("Reader preview").click();
  await wait(
    () => document.querySelector(".modal .calendar-grid button"),
    "Reader calendar missing",
  );
  expect(
    document
      .querySelector(".modal .calendar-preview")
      .innerText.includes("Silver"),
    "Reader moon details missing",
  );
  button("Export calendar JSON", document.querySelector(".modal")).click();
  await pause(650);
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  checks.push("saved calendar reader preview and reader definition export");
  await go(f.map);
  await wait(
    () => document.querySelectorAll(".map-custom-marker svg").length === 2,
    "Built-in symbols did not render",
  );
  expect(
    document.querySelector(".map-custom-marker img")?.complete,
    "Custom raster did not load",
  );
  [...document.querySelectorAll(".map-marker-list button")]
    .find((b) => b.querySelector("span")?.textContent === "Castle icon")
    .click();
  await pause();
  await set(field("Marker symbol"), "portal");
  await set(field("Icon size (pixels)"), 64);
  await saved(
    f.map,
    (e) =>
      e.data.markers[0].symbol === "portal" &&
      e.data.markers[0].icon_size === 64,
  );
  expect(
    document.querySelector('.map-custom-marker[data-symbol="portal"] svg path'),
    "New symbol not drawn",
  );
  await set(field("Custom marker image"), f.asset);
  await saved(f.map, (e) => e.data.markers[0].icon_asset_id === f.asset);
  expect(
    document.querySelectorAll(".map-custom-marker img").length === 2,
    "Custom image selection did not render",
  );
  await set(field("Custom marker image"), "");
  await saved(f.map, (e) => !e.data.markers[0].icon_asset_id);
  checks.push(
    "fixed SVG symbols, local raster selection, size editing and persistence",
  );
  button("Reader preview").click();
  await wait(
    () => document.querySelector(".modal .leaflet-container"),
    "Reader map missing",
  );
  expect(
    document.querySelectorAll(".modal .map-custom-marker").length === 2,
    "Private icon leaked to reader",
  );
  expect(
    document.querySelector('.modal .map-custom-marker[data-symbol="castle"]'),
    "Reader used draft icon instead of snapshot",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  checks.push("reader map excludes private icon and retains published symbol");
  localStorage.setItem("qaCalendarIcons", JSON.stringify(f));
  await go(f.cal);
  return { checks, fixture: f.cal, imported: f.imported };
})();
