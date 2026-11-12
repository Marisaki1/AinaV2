(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaSpecialDays")),
    checks = [];
  const pause = (ms = 160) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw Error(m);
  };
  const wait = async (test, m) => {
    for (let i = 0; i < 75; i++) {
      if (await test()) return;
      await pause(100);
    }
    throw Error(m);
  };
  const field = (name, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === name)
      ?.querySelector("input,select");
  const button = (name, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === name,
    );
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
    await pause();
  };
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(650);
  };
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json());
  await go("entry/" + f.cal);
  await set(field("Preview year"), 0);
  await set(field("Preview month"), "special:new");
  await wait(
    () => document.querySelectorAll(".calendar-grid button").length === 1,
    "Special preview",
  );
  document.querySelector(".calendar-grid button").click();
  await pause();
  expect(
    document
      .querySelector(".calendar-day-detail")
      .textContent.includes("Outside weekday cycle"),
    "Outside week label",
  );
  await set(field("Convert day ordinal"), 0);
  button("Find date").click();
  await wait(
    () => field("Preview month").value === "special:new",
    "Inverse special date",
  );
  checks.push("special grid, outside-week label and ordinal conversion");
  button("Add special days").click();
  await pause();
  await set(field("Special period 4 name"), "Quiet turning");
  const rule = [...document.querySelectorAll(".calendar-rule")].find((r) =>
    r.textContent.includes("Special period 4"),
  );
  await set(field("Special-day count", rule), 2);
  await set(field("Occurs every years", rule), 2);
  await set(field("Special year offset", rule), 1);
  await wait(
    async () => (await get(f.cal)).data.special_days[3]?.offset === 1,
    "Special edit persistence",
  );
  const added = (await get(f.cal)).data.special_days[3].id;
  await set(field("Preview year"), 1);
  await set(field("Preview month"), "special:" + added);
  await wait(
    () => document.querySelectorAll(".calendar-grid button").length === 2,
    "Periodic special preview",
  );
  await set(field("Special period 2 name"), "Draft still days");
  await wait(
    async () =>
      (await get(f.cal)).data.special_days[1].name === "Draft still days",
    "Rename persistence",
  );
  const reader = await fetch(
    "/api/resources/" + f.cal + "?audience=reader",
  ).then((r) => r.json());
  expect(
    reader.data.special_days.length === 3 &&
      reader.data.special_days[1].name === "Still days",
    "Published calendar isolation",
  );
  checks.push(
    "create periodic special block, save, preview, stable IDs and published isolation",
  );
  await go("entry/" + f.series);
  expect(
    field("Start date period").value === "mid" && !field("Month"),
    "Special event period and hidden month",
  );
  expect(field("Date precision").disabled, "Special date exact precision");
  expect(
    [...field("Repeat frequency").options].find((o) => o.value === "monthly")
      .disabled,
    "Monthly disabled",
  );
  await set(field("Start date period"), "end");
  await set(field("Preview repeats from year"), 0);
  await set(field("Preview repeats through year"), 2);
  button("Preview repeat dates").click();
  await wait(
    () => document.querySelectorAll(".recurrence-preview li").length === 2,
    "Inactive special years skipped",
  );
  await set(field("Start date period"), "mid");
  await set(field("Day"), 2);
  await wait(
    async () => (await get(f.series)).data.day === 2,
    "Event date persistence",
  );
  button("Preview repeat dates").click();
  await wait(
    () => document.querySelectorAll(".recurrence-preview li").length === 3,
    "Annual special recurrence",
  );
  button("Reader preview").click();
  await pause(500);
  expect(
    document.querySelector(".modal").textContent.includes("Still days 1") &&
      !document
        .querySelector(".modal")
        .textContent.includes("Draft still days"),
    "Published event isolation",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  checks.push(
    "special event controls, inactive-year recurrence, draft dates and reader snapshots",
  );
  await go("history/" + f.timeline);
  await wait(
    () => document.querySelectorAll(".timeline-event-card").length === 3,
    "Special timeline occurrences",
  );
  checks.push("three actual special-day timeline occurrences");
  return { checks, fixture: f };
})();
