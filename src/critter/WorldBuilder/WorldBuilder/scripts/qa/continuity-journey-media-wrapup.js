(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaContinuity),
    pause = (ms = 80) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 85; i++) {
      if (await test()) return;
      await pause();
    }
    throw Error(m);
  };
  const button = (n, root = document) =>
      [...root.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === n,
      ),
    field = (n) =>
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
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json()),
    flow = () =>
      fetch(
        `/api/resources/${f.campaign}/continuity?session=${f.session}`,
      ).then((r) => r.json()),
    saved = async () => {
      button("Save campaign changes").click();
      await wait(() => !document.querySelector(".modal"), "Record saves");
    };
  location.hash = `/campaign-continuity/${f.campaign}/journeys/${f.session}`;
  await wait(() => button("Draw campaign journey"), "Journeys");
  button("Draw campaign journey").click();
  await pause();
  await set(
    field("Continuity record title"),
    "Lantern road travelled " + f.stamp,
  );
  await set(field("Journey map"), f.map);
  await wait(
    () => document.querySelector(".modal .journey-map svg image"),
    "Journey image",
  );
  const svg = document.querySelector(".modal .journey-map svg"),
    r = svg.getBoundingClientRect();
  svg.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      clientX: r.left + r.width * 0.3,
      clientY: r.top + r.height * 0.4,
    }),
  );
  await pause();
  expect(field("Waypoint label 1"), "Click draws waypoint");
  await set(field("Waypoint label 1"), "Lantern shrine");
  await set(field("Waypoint location 1"), f.place);
  button("Add waypoint").click();
  await pause();
  await set(field("Waypoint label 2"), "Camp store");
  await set(field("Waypoint location 2"), f.storage);
  await set(field("Waypoint X 2"), "80");
  await set(field("Waypoint Y 2"), "70");
  button("Add waypoint").click();
  await pause();
  [...document.querySelectorAll(".modal button")]
    .filter((b) => b.textContent.trim() === "Remove waypoint")
    .at(-1)
    .click();
  await pause();
  await set(
    field("Continuity notes"),
    "The party followed the spirit road from shrine to camp.",
  );
  await saved();
  let value = await flow();
  f.journey = value.records.find(
    (e) => e.title === "Lantern road travelled " + f.stamp,
  ).id;
  expect(
    (await get(f.journey)).data.route_points.length === 2,
    "Two waypoints persisted",
  );
  await wait(
    () =>
      document.querySelector(`[data-journey-record="${f.journey}"] polyline`),
    "Saved route rendered",
  );
  button("Location status").click();
  await wait(() => button("Record location change"), "Place changes");
  button("Record location change").click();
  await pause();
  await set(
    field("Continuity record title"),
    "Keeper restores the shrine " + f.stamp,
  );
  await set(field("Affected location"), f.place);
  await set(field("Location status category"), "control");
  await set(field("Controlled by"), f.npc);
  await set(
    field("Continuity notes"),
    "The keeper holds the shrine after the rescue.",
  );
  await saved();
  value = await flow();
  f.placeStatus = value.records.find(
    (e) => e.title === "Keeper restores the shrine " + f.stamp,
  ).id;
  button("Session media").click();
  await wait(() => button("Prepare media collection"), "Session media");
  button("Prepare media collection").click();
  await pause();
  await set(
    field("Media collection title"),
    "First night visual references " + f.stamp,
  );
  await set(field("Media original source"), f.map);
  await set(field("Media category"), "map");
  await set(field("Media caption"), "Journey map");
  button("Add media reference").click();
  await pause();
  await set(field("Media image source"), f.image);
  await set(field("Media category"), "portrait");
  await set(field("Media caption"), "Show the keeper");
  button("Add media reference").click();
  await pause();
  await set(field("Media original source"), f.handout);
  await set(field("Media category"), "handout");
  await set(field("Media caption"), "Approved player clue");
  button("Add media reference").click();
  await pause();
  const up = [...document.querySelectorAll(".modal button")].filter(
    (b) => b.textContent.trim() === "Move media up",
  );
  up.at(-1).click();
  await pause();
  await saved();
  value = await flow();
  f.media = value.media.find(
    (e) => e.title === "First night visual references " + f.stamp,
  ).id;
  expect(
    (await get(f.media)).data.collection_items[1].entry_id === f.handout,
    "Media order persists",
  );
  await wait(() => button("Preview player handout"), "Handout reference");
  button("Preview player handout").click();
  await wait(
    () => document.querySelector(".handout-preview"),
    "Safe handout preview",
  );
  expect(
    document
      .querySelector(".handout-preview")
      .textContent.includes("PUBLISHED CLUE") &&
      !document
        .querySelector(".handout-preview")
        .textContent.includes("UNPUBLISHED SECRET"),
    "Media handout published source filtering",
  );
  document.querySelector('.modal [aria-label="Close dialog"]')?.click();
  if (document.querySelector(".modal"))
    document.querySelector(".modal button[aria-label]")?.click();
  await wait(() => !document.querySelector(".modal"), "Preview closes");
  button("Session wrap-up").click();
  await wait(() => field("Session wrap-up notes"), "Unified wrap-up");
  const wrap = document.querySelector(".session-wrapup");
  for (const id of [f.item, f.progression, f.relationship, f.consequence])
    expect(
      wrap.textContent.includes((await get(id)).title) || id === f.item,
      "Wrap-up original records",
    );
  [...wrap.querySelectorAll("label")]
    .filter((l) => l.textContent.trim().startsWith("Reviewed "))
    .forEach((l) => {
      if (!l.querySelector("input").checked) l.querySelector("input").click();
    });
  await pause();
  await set(
    field("Session wrap-up notes"),
    "Reviewed rewards, abilities, trust, shrine control and the next favour.",
  );
  [...wrap.querySelectorAll("label")]
    .find((l) => l.textContent.includes("Mark this session completed"))
    .querySelector("input")
    .click();
  await pause();
  button("Save session wrap-up").click();
  await wait(
    () => wrap.textContent.includes("Session wrap-up saved privately"),
    "Wrap-up saved",
  );
  const session = await get(f.session);
  f.wrapup = session.data.wrap_up_note_id;
  expect(
    session.data.session_status === "completed" && f.wrapup,
    "Session completion recorded",
  );
  const note = await get(f.wrapup);
  expect(
    Object.values(note.data.reviewed).every(Boolean) &&
      !note.published_revision,
    "Checklist private",
  );
  const originalConfirm = window.confirm;
  window.confirm = () => false;
  button("Continuity overview").click();
  await wait(
    () => document.querySelector('[data-continuity-view="overview"]'),
    "Saved review leaves without draft prompt",
  );
  window.confirm = originalConfirm;
  expect(
    document
      .querySelector(".continuity-situation")
      .textContent.includes("Follow the silver lanterns"),
    "Continuity goals visible",
  );
  localStorage.qaContinuity = JSON.stringify(f);
  return {
    journey: f.journey,
    routePoints: 2,
    placeStatus: f.placeStatus,
    sessionMedia: f.media,
    orderedOriginalReferences: true,
    safeHandoutPreview: true,
    wrapup: f.wrapup,
    sessionCompleted: true,
    continuityOverview: true,
  };
})();
