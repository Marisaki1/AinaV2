(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA workspace required");
  const f = JSON.parse(localStorage.getItem("qaMapsHistory")),
    checks = [];
  const pause = (ms = 160) => new Promise((r) => setTimeout(r, ms));
  const expect = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const wait = async (selector) => {
    for (let i = 0; i < 60; i++) {
      const el = document.querySelector(selector);
      if (el) return el;
      await pause(100);
    }
    throw new Error("Missing " + selector);
  };
  const go = async (route, selector) => {
    location.hash = "/" + route;
    await wait(selector);
    await pause(300);
  };
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (el) => el.textContent.trim() === text,
    );
  const set = async (element, value) => {
    expect(element, "Missing field " + value);
    const proto =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  const field = (label, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((el) => el.querySelector("span")?.textContent === label)
      ?.querySelector("input,select");
  const get = (id, reader = false) =>
    fetch("/api/resources/" + id + (reader ? "?audience=reader" : "")).then(
      (r) => r.json(),
    );
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((s) => s.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const post = async (path, value) => {
    const r = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(value),
    });
    const result = await r.json();
    expect(r.ok, JSON.stringify(result));
    return result;
  };
  const saved = async (id, predicate) => {
    for (let i = 0; i < 40; i++) {
      await pause(200);
      const entry = await get(id);
      if (predicate(entry)) return entry;
    }
    throw new Error("Save did not persist");
  };
  const publish = async (id) => {
    const e = await get(id);
    return post("/resources/" + id + "/publish", {
      expected_revision: e.revision,
    });
  };

  await go("entry/" + f.map, ".leaflet-container");
  button("Add group").click();
  await pause();
  await set(
    document.querySelector('[aria-label="Group name"]'),
    "Hidden settlements",
  );
  document
    .querySelector('[aria-label="Private group Hidden settlements"]')
    .click();
  await pause();
  document.querySelector(".map-marker-list button").click();
  await pause();
  await set(
    field("Marker group"),
    document
      .querySelector('[aria-label="Group name"]')
      .closest(".map-group-editor")
      ? field("Marker group").options[1].value
      : "",
  );
  await saved(
    f.map,
    (e) =>
      e.data.groups[0]?.private &&
      e.data.markers[0]?.group === e.data.groups[0]?.id,
  );
  const toggle = document.querySelector(".map-group-toggles input");
  toggle.click();
  await pause();
  expect(
    !document.querySelector(".map-pin"),
    "Hidden group still draws marker",
  );
  document.querySelector(".map-group-toggles input").click();
  await pause();
  expect(document.querySelector(".map-pin"), "Visible group missing marker");
  checks.push("create, assign, hide and restore a private marker group");

  button("Add layer").click();
  await pause();
  await set(
    document.querySelector('[aria-label="Layer name"]'),
    "Secret overlay",
  );
  await set(document.querySelector('[aria-label="Layer image"]'), f.asset);
  await set(
    document.querySelector('[aria-label="Opacity of Secret overlay"]'),
    35,
  );
  document.querySelector('[aria-label="Private layer Secret overlay"]').click();
  await pause();
  expect(
    document.querySelectorAll(".leaflet-image-layer").length === 2,
    "Overlay not rendered",
  );
  expect(
    [...document.querySelectorAll(".leaflet-image-layer")].some(
      (el) => Number(el.style.opacity) === 0.35,
    ),
    "Overlay opacity ignored",
  );
  document.querySelector('[aria-label="Visible layer Secret overlay"]').click();
  await pause();
  expect(
    document.querySelectorAll(".leaflet-image-layer").length === 1,
    "Hidden overlay still rendered",
  );
  document.querySelector('[aria-label="Visible layer Secret overlay"]').click();
  await pause();
  checks.push("overlay image, opacity and visibility controls");

  document.querySelector('[aria-label="Hotspot tool"]').click();
  await pause();
  const canvas = document.querySelector(".leaflet-container"),
    rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      clientX: rect.left + rect.width * 0.6,
      clientY: rect.top + rect.height * 0.4,
    }),
  );
  await pause();
  await set(field("Marker label"), "Secret passage");
  await set(field("Across image (%)"), 62);
  await set(field("Down image (%)"), 42);
  await set(field("Radius (% of image width)"), 8);
  let map = await saved(f.map, (e) =>
    e.data.markers.some(
      (m) =>
        m.label === "Secret passage" &&
        m.radius === 0.08 &&
        m.x === 0.62 &&
        m.y === 0.42,
    ),
  );
  expect(document.querySelector(".map-hotspot"), "Hotspot missing");
  document.querySelector(".leaflet-control-zoom-in").click();
  await pause(350);
  button("Save current view").click();
  map = await saved(f.map, (e) => e.data.default_view?.zoom_delta > 0);
  const defaultView = map.data.default_view;
  button("Fit map").click();
  await pause(350);
  button("Saved view").click();
  await pause(350);
  checks.push("hotspot drawing, coordinate/radius editing and saved map view");
  await publish(f.map);
  let reader = await get(f.map, true);
  expect(
    reader.data.groups.length === 0 &&
      reader.data.layers.length === 0 &&
      !reader.data.markers.some((m) => m.id === "village"),
    "Private map data leaked",
  );
  document
    .querySelector('[aria-label="Remove group Hidden settlements"]')
    .click();
  await saved(
    f.map,
    (e) =>
      e.data.groups.length === 0 &&
      e.data.markers.find((m) => m.id === "village")?.private,
  );
  await publish(f.map);
  reader = await get(f.map, true);
  expect(
    !reader.data.markers.some((m) => m.id === "village"),
    "Deleting a private group exposed a marker",
  );
  checks.push("published map filtering and privacy after group deletion");

  await go("entry/" + f.timeline, ".timeline-definition");
  button("Add lane").click();
  await pause();
  const lane = [...document.querySelectorAll(".timeline-lane-definition")].at(
    -1,
  );
  await set(field("Lane name", lane), "Aftermath");
  await saved(f.timeline, (e) =>
    e.data.lanes.some((l) => l.name === "Aftermath"),
  );
  button("View timeline").click();
  await wait(".timeline-track");
  await pause(500);
  expect(
    document.querySelectorAll(".timeline-track").length === 4,
    "Parallel lanes missing",
  );
  const cards = [...document.querySelectorAll(".timeline-event-card")];
  const treaty = cards.find((el) => el.textContent.includes("Treaty signed"));
  const pilgrimage = cards.find((el) =>
    el.textContent.includes("Parallel pilgrimage"),
  );
  expect(
    Math.abs(
      treaty.getBoundingClientRect().x - pilgrimage.getBoundingClientRect().x,
    ) < 1,
    "Same-date lanes misaligned",
  );
  expect(
    document.querySelector(".timeline-duration"),
    "Event duration missing",
  );
  const beforeWidth = document
    .querySelector(".timeline-grid")
    .getBoundingClientRect().width;
  await set(document.querySelector('[aria-label="Timeline zoom"]'), 4);
  expect(
    document.querySelector(".timeline-grid").getBoundingClientRect().width >
      beforeWidth * 3,
    "Timeline zoom failed",
  );
  const scroller = document.querySelector(".timeline-scroll"),
    beforeScroll = scroller.scrollLeft;
  document.querySelector('[aria-label="Pan timeline later"]').click();
  await pause(450);
  expect(scroller.scrollLeft > beforeScroll, "Timeline panning failed");
  checks.push("timeline lane settings, aligned dates, durations, zoom and pan");
  button("Event list").click();
  await wait(".history-record-list");
  expect(
    document.querySelectorAll(".history-record-list > button").length === 5,
    "List missing events",
  );
  button("Chronicles").click();
  await wait(".chronicle-player");
  await pause(400);
  expect(
    document.querySelector(".chronicle-map .leaflet-image-layer"),
    "Chronicle default map missing",
  );
  document.querySelector('[aria-label="Next historical event"]').click();
  await pause();
  expect(
    document
      .querySelector(".chronicle-stops .active")
      ?.textContent.includes("Treaty signed"),
    "Chronicle next failed",
  );
  await set(
    document.querySelector('[aria-label="Chronicle playback speed"]'),
    4,
  );
  button("Play").click();
  await pause(650);
  expect(
    document
      .querySelector(".chronicle-stops .active")
      ?.textContent.includes("Parallel pilgrimage"),
    "Chronicle playback failed",
  );
  button("Pause")?.click();
  await set(
    document.querySelector('[aria-label="Chronicle event position"]'),
    4,
  );
  expect(
    document
      .querySelector(".chronicle-stops .active")
      ?.textContent.includes("Later festival"),
    "Chronicle scrubbing failed",
  );
  checks.push("Chronicle map, next, timed playback and scrubber");

  await publish(f.timeline);
  const history = await fetch(
    "/api/worlds/" +
      f.world +
      "/history?timeline=" +
      f.timeline +
      "&audience=reader",
  ).then((r) => r.json());
  expect(
    !JSON.stringify(history).includes("Hidden conspiracy") &&
      !history.lanes.some((l) => l.id === 2),
    "Private lane leaked",
  );
  checks.push("published timeline excludes private tracks and their events");
  button("New event").click();
  await wait(".modal form");
  await set(
    field("Event name", document.querySelector(".modal")),
    "QA atomic timeline addition",
  );
  button("Create event").click();
  await wait(".entry-title");
  await pause(600);
  const title = document.querySelector(".entry-title");
  expect(
    title.value === "QA atomic timeline addition",
    "Event creation did not open editor",
  );
  const timeline = await get(f.timeline);
  expect(
    timeline.data.event_ids.length === 6,
    "New event not added to selected timeline",
  );
  checks.push("new event created and added to selected timeline atomically");
  await go("history/" + f.timeline, ".timeline-track");
  await pause(400);
  return {
    checks,
    defaultView,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})();
