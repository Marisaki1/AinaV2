(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaGuideLinks),
    pause = (ms = 150) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 80; i++) {
        if (await test()) return;
        await pause(100);
      }
      throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  const field = (n, root = document) =>
    [...root.querySelectorAll("label.field")]
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
    await pause();
  };
  location.hash = "/campaigns/" + f.campaign;
  await pause(650);
  button("Maps", document.querySelector(".campaign-workspace")).click();
  await wait(
    () => document.querySelector(".campaign-map-guide .leaflet-image-layer"),
    "Campaign map image",
  );
  await set(field("Campaign map"), f.map);
  await wait(
    () => document.querySelector('[data-guide-marker="hamlet"]'),
    "Chosen map locations",
  );
  document.querySelector('[data-guide-marker="hamlet"]').click();
  await wait(
    () =>
      document
        .querySelector(".map-guide-inspector")
        .textContent.includes("Lanterns mark the path"),
    "Location notes",
  );
  expect(
    document
      .querySelector(".map-guide-people")
      .textContent.includes(f.heroTitle),
    "Connected character",
  );
  expect(
    document
      .querySelector(".map-guide-records")
      ?.textContent.includes("Road journal"),
    "Journal context",
  );
  expect(
    document.querySelectorAll(".map-guide-records a.auto-resource-link")
      .length >= 3,
    "Automatic source links in map journal",
  );
  await set(field("Find map location"), "bridge");
  expect(
    document.querySelectorAll("[data-guide-marker]").length === 1,
    "Location filter",
  );
  await set(field("Find map location"), "");
  button("Write location note").click();
  await pause();
  await set(field("Location note title"), "Hamlet milestone " + f.stamp);
  await set(field("Location record type"), "milestone");
  await set(
    field("Location note text"),
    `The party resolved the dispute at ${f.placeTitle}.`,
  );
  await set(field("In-world day / chapter"), "Day 13 / village restored");
  await set(field("Related session"), f.session);
  button("Save location note").click();
  await wait(
    () =>
      !document.querySelector(".modal") &&
      document
        .querySelector(".map-guide-records")
        ?.textContent.includes("Hamlet milestone"),
    "New location milestone",
  );
  const entries = (
      await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
    ).resources,
    created = entries.find((e) => e.title === "Hamlet milestone " + f.stamp);
  expect(
    created?.visibility === "private" &&
      created.data.map_id === f.map &&
      created.data.marker_id === "hamlet" &&
      created.data.session_id === f.session,
    "Milestone identity/privacy",
  );
  f.milestone = created.id;
  localStorage.qaGuideLinks = JSON.stringify(f);
  await set(field("Map record filter"), "progression");
  expect(
    document.querySelector(`[data-map-record="${created.id}"]`) &&
      [...document.querySelectorAll("[data-map-record]")].every((card) => {
        const record = entries.find((e) => e.id === card.dataset.mapRecord);
        return (
          record?.kind === "quest" ||
          (record?.kind === "session" &&
            !!(record.data.rewards || record.data.consequences)) ||
          (record?.kind === "note" && record.data.record_type === "milestone")
        );
      }),
    "Progression filter",
  );
  await set(field("Map record filter"), "all");
  document.querySelector('[data-guide-marker="bridge"]').click();
  await wait(
    () =>
      document
        .querySelector(".map-guide-inspector")
        .textContent.includes("This pin has no linked entry"),
    "Unlinked pin inspection",
  );
  await set(field("Campaign map"), f.otherMap);
  await wait(
    () => document.querySelector('[data-guide-marker="summit"]'),
    "Map switch",
  );
  expect(
    !document.querySelector('[data-guide-marker="hamlet"]'),
    "Prior map selection retained",
  );
  await set(field("Campaign map"), f.map);
  await wait(
    () => document.querySelector('[data-guide-marker="hamlet"]'),
    "Original map return",
  );
  document.querySelector('[data-guide-marker="hamlet"]').click();
  await wait(
    () =>
      document
        .querySelector(".map-guide-records")
        ?.textContent.includes("Hamlet milestone"),
    "Saved map records return",
  );
  checks.push(
    "campaign map selection, pin inspection, location notes, connected people and linked session/journal records",
    "location text search, private milestone with map/pin/session identity and progression filtering",
    "unlinked pin support and map switching without stale location requests",
    "automatic title/alias source links in map notes",
  );
  return { checks, milestone: f.milestone };
})();
