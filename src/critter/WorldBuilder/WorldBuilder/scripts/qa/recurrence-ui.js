(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaRecurrence")),
    checks = [];
  const pause = (ms = 160) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw new Error(m);
  };
  const wait = async (test, message) => {
    for (let i = 0; i < 100; i++) {
      if (test()) return;
      await pause(100);
    }
    throw new Error(message);
  };
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const field = (label, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === label)
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
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(700);
  };
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json());
  const saved = async (id, test) => {
    for (let i = 0; i < 70; i++) {
      const e = await get(id);
      if (test(e)) return e;
      await pause(150);
    }
    throw new Error("Edits did not persist");
  };
  await go("entry/" + f.series);
  expect(
    field("Date precision").disabled,
    "Recurring date precision should remain exact",
  );
  await set(field("Repeat frequency"), "none");
  await saved(f.series, (e) => !e.data.recurrence);
  expect(
    !field("Date precision").disabled,
    "Precision did not unlock after disabling repeats",
  );
  await set(field("Repeat frequency"), "yearly");
  await set(field("Missing month day"), "last_day");
  await set(field("Final repeat year (optional)"), 4);
  await set(field("Preview repeats from year"), 0);
  await set(field("Preview repeats through year"), 4);
  button("Preview repeat dates").click();
  await wait(
    () => document.querySelectorAll(".recurrence-preview li").length === 5,
    "Clamped yearly preview should have five dates",
  );
  expect(
    document
      .querySelector(".recurrence-preview")
      .innerText.includes("Dusk 2, 1"),
    "Short-year date not clamped",
  );
  const resource = await get(f.series);
  expect(
    resource.data.year === 0 &&
      resource.data.recurrence.invalid_date === "last_day",
    "Preview changed first event date",
  );
  checks.push(
    "enable/disable repeat rules, exact-date controls, final year, leap-day clamp preview and preserved source date",
  );
  const count = (
    await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
  ).resources.length;
  await go("history/" + f.timeline);
  await wait(
    () => document.querySelectorAll(".timeline-event-card").length === 5,
    "Timeline occurrences missing",
  );
  const cards = [...document.querySelectorAll(".timeline-event-card")];
  cards[3].click();
  await pause(300);
  expect(
    document
      .querySelector(".history-date-label")
      .innerText.includes("Dusk 2, 3"),
    "Timeline selected the wrong occurrence",
  );
  button("Chronicles").click();
  await pause(500);
  const stops = () => [...document.querySelectorAll(".chronicle-stops button")];
  expect(stops().length === 5, "Chronicle stops missing");
  stops()[0].click();
  await wait(
    () =>
      document
        .querySelector(".historical-map-caption")
        ?.innerText.includes("Base map"),
    "First date did not select base map",
  );
  stops()[2].click();
  await wait(
    () =>
      document
        .querySelector(".historical-map-caption")
        ?.innerText.includes("Later festival terrain"),
    "Later occurrence reused first-date map",
  );
  expect(
    document
      .querySelector(".history-date-label")
      .innerText.includes("Dusk 3, 2"),
    "Chronicle date panel is stale",
  );
  expect(button("Edit event series"), "Series edit action missing");
  await set(field("Repeating dates from year"), 2);
  await set(field("Repeating dates through year"), 3);
  button("Show repeating dates").click();
  await wait(
    () => stops().length === 2,
    "Repeat window did not update occurrences",
  );
  expect(
    (await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json()))
      .resources.length === count,
    "Date reads created duplicate entries",
  );
  checks.push(
    "distinct timeline/Chronicle occurrence selection, dated-map switching, repeat window and no copied entries",
  );
  await go("entry/" + f.timeline);
  button("Reader preview").click();
  await wait(
    () => document.querySelectorAll(".modal .timeline-event-card").length === 3,
    "Reader should retain published skip rule",
  );
  const reader = await fetch(
    `/api/worlds/${f.world}/history?timeline=${f.timeline}&audience=reader`,
  ).then((r) => r.json());
  expect(
    reader.events.length === 3 && !JSON.stringify(reader).includes(f.secret),
    "Private recurrence leaked",
  );
  document.querySelectorAll(".modal .timeline-event-card")[2].click();
  await wait(
    () =>
      document
        .querySelector(".modal .historical-map-caption")
        ?.innerText.includes("Later festival terrain"),
    "Reader occurrence map did not update",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  checks.push(
    "published rule/window snapshots, private-series exclusion and reader occurrence maps",
  );
  await go("entry/" + f.cal);
  await set(field("Preview year"), 1);
  await set(field("Preview month"), 2);
  await wait(
    () => document.querySelectorAll(".calendar-grid button").length === 2,
    "Short month not displayed",
  );
  document.querySelectorAll(".calendar-grid button")[1].click();
  await wait(
    () =>
      document.querySelector(".calendar-festivals")?.innerText.includes(f.name),
    "Owner calendar festival missing",
  );
  button("Reader preview").click();
  await wait(
    () => document.querySelector(".modal .calendar-grid button"),
    "Reader calendar missing",
  );
  await set(field("Preview year", document.querySelector(".modal")), 1);
  await set(field("Preview month", document.querySelector(".modal")), 2);
  await wait(
    () =>
      document.querySelectorAll(".modal .calendar-grid button").length === 2,
    "Reader short month not displayed",
  );
  document.querySelectorAll(".modal .calendar-grid button")[1].click();
  await pause(650);
  expect(
    !document
      .querySelector(".modal .calendar-festivals")
      .innerText.includes(f.name),
    "Reader calendar used owner clamp draft",
  );
  expect(
    !document
      .querySelector(".modal .calendar-festivals")
      .innerText.includes("Private recurring secret"),
    "Reader calendar leaked private festival",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  checks.push(
    "calendar day observances use owner rules and filtered published reader rules",
  );
  await go("entry/" + f.series);
  return { checks, series: f.series };
})();
