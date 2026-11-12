(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaEras")),
    checks = [];
  const pause = (ms = 160) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw new Error(m);
  };
  const wait = async (test, message) => {
    for (let i = 0; i < 90; i++) {
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
    expect(el, "Missing input " + value);
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
    await pause(650);
  };
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json());
  const saved = async (id, test) => {
    for (let i = 0; i < 70; i++) {
      const e = await get(id);
      if (test(e)) return e;
      await pause(150);
    }
    throw new Error("Edits did not save");
  };
  await go("history");
  button("Eras").click();
  await pause();
  expect(
    document.querySelector(".era-library").innerText.includes(f.secretName),
    "Owner era library missing private era",
  );
  button("New era").click();
  await wait(
    () => document.querySelector(".modal form"),
    "Create era modal missing",
  );
  const name =
    document.querySelector(".modal input[data-autofocus]") ||
    document.querySelector(".modal input");
  await set(name, f.createdName);
  document.querySelector(".modal form").requestSubmit();
  await wait(
    () => document.querySelector(".entry-title"),
    "Era editor missing",
  );
  f.created = location.hash.split("/").at(-1);
  await set(field("Calendar"), f.cal);
  await set(field("Date precision"), "year");
  await set(field("Year"), -10);
  await saved(
    f.created,
    (e) =>
      e.kind === "era" &&
      e.visibility === "private" &&
      e.data.year === -10 &&
      e.data.date_precision === "year",
  );
  expect(!field("Linked era"), "Era incorrectly has parent era field");
  expect(!field("Day") && !field("Month"), "Unknown components remain visible");
  checks.push(
    "era library and genuine private era creation with open end and year precision",
  );
  await go("entry/" + f.coarse);
  expect(
    field("Date precision").value === "year" && !field("Month"),
    "Year precision controls wrong",
  );
  expect(field("Linked era").value === f.era, "Linked era missing");
  await set(field("Date precision"), "month");
  await set(field("Month"), 2);
  await saved(
    f.coarse,
    (e) => e.data.date_precision === "month" && e.data.month === 2,
  );
  button("Reader preview").click();
  await wait(
    () => document.querySelector(".modal .reader-date"),
    "Reader event date missing",
  );
  expect(
    document
      .querySelector(".modal .reader-date")
      .innerText.includes("circa -5"),
    "Reader used draft precision",
  );
  expect(
    !document.querySelector(".modal .reader-date").innerText.includes("Dusk"),
    "Reader leaked draft month label",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  await set(field("Date precision"), "year");
  await saved(f.coarse, (e) => e.data.date_precision === "year");
  checks.push(
    "month/year controls save and reader date precision stays on published snapshot",
  );
  await go("entry/" + f.timeline);
  button("Reader preview").click();
  await wait(
    () => document.querySelector(".modal .timeline-era-row"),
    "Reader era band missing",
  );
  expect(
    document.querySelectorAll(".modal .timeline-era-row").length === 1,
    "Private/open unpublished eras leaked",
  );
  expect(
    !document.querySelector(".modal").innerText.includes(f.secretName),
    "Private era label leaked",
  );
  expect(
    document.querySelector(".modal .timeline-duration.uncertain"),
    "Uncertain interval styling missing",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  checks.push(
    "reader timeline bands hide private eras and distinguish uncertain intervals",
  );
  await go("history/" + f.timeline);
  await wait(
    () => document.querySelectorAll(".timeline-era-row").length === 3,
    "Owner era bands missing",
  );
  expect(
    document.querySelector(".timeline-era-row").innerText.length > 0,
    "Era title missing",
  );
  const cards = [...document.querySelectorAll(".timeline-event-card")];
  expect(
    cards.findIndex((c) => c.textContent.includes("Uncertain origin")) <
      cards.findIndex((c) => c.textContent.includes("Known arrival")),
    "Negative uncertain date ordering wrong",
  );
  button("Chronicles").click();
  await pause(600);
  const stop = [...document.querySelectorAll(".chronicle-stops button")].find(
    (b) => b.textContent.includes("Uncertain origin"),
  );
  expect(stop, "Uncertain Chronicle event missing");
  stop.click();
  await wait(
    () =>
      document.querySelector(".chronicle").innerText.includes("uncertain date"),
    "Map uncertainty warning missing",
  );
  expect(
    !document.querySelector(".chronicle").innerText.includes("Later terrain"),
    "Uncertain year selected a later map version",
  );
  [...document.querySelectorAll(".chronicle-stops button")]
    .find((b) => b.textContent.includes("Known arrival"))
    .click();
  await wait(
    () =>
      document.querySelector(".chronicle").innerText.includes("Later terrain"),
    "Exact date did not select map version",
  );
  checks.push(
    "owner bands, signed-date sorting and conservative uncertain-map selection with explicit warning",
  );
  const reader = await fetch(
    `/api/worlds/${f.world}/history?timeline=${f.timeline}&audience=reader`,
  ).then((r) => r.json());
  expect(
    !JSON.stringify(reader).includes(f.secret) &&
      !JSON.stringify(reader).includes(f.secretName),
    "Reader API exposed private era identity",
  );
  localStorage.setItem("qaEras", JSON.stringify(f));
  await go("history/" + f.timeline);
  button("Historical timeline").click();
  await pause();
  return { checks, created: f.created };
})();
