(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaMapVersions")),
    checks = [];
  const pause = (ms = 150) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw new Error(m);
    };
  const wait = async (selector) => {
    for (let i = 0; i < 70; i++) {
      const el = document.querySelector(selector);
      if (el) return el;
      await pause(100);
    }
    throw new Error("Missing " + selector);
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
  const go = async (route, selector) => {
    location.hash = "/" + route;
    await wait(selector);
    await pause(350);
  };
  const get = () => fetch("/api/resources/" + f.map).then((r) => r.json());
  const saved = async (test) => {
    for (let i = 0; i < 45; i++) {
      await pause(200);
      const e = await get();
      if (test(e)) return e;
    }
    throw new Error("Version save did not persist");
  };
  const capture = async (name, year) => {
    button("Capture version").click();
    await wait(".modal form");
    const modal = document.querySelector(".modal");
    await set(field("Historical version name", modal), name);
    await set(field("Version year", modal), year);
    button("Capture map state", modal).click();
    for (let i = 0; i < 50 && document.querySelector(".modal"); i++)
      await pause(100);
    expect(!document.querySelector(".modal"), "Capture failed");
    await pause();
  };
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((s) => s.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const post = async (path, data) => {
    const r = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(data),
    });
    const v = await r.json();
    expect(r.ok, JSON.stringify(v));
    return v;
  };
  await go("entry/" + f.map, ".map-history-editor");
  await capture("Before the flood", 0);
  document.querySelector(".map-marker-list button").click();
  await pause();
  await set(field("Marker label"), "Old village");
  await saved(
    (e) => e.data.versions?.[0]?.scene.markers[0].label === "Old village",
  );
  button("Capture version").click();
  await wait(".modal form");
  await set(field("Version year", document.querySelector(".modal")), 0);
  button("Capture map state", document.querySelector(".modal")).click();
  await pause();
  expect(
    document
      .querySelector(".modal .error-box")
      ?.textContent.includes("different"),
    "Duplicate date was not explained",
  );
  button("Cancel", document.querySelector(".modal")).click();
  await capture("After the flood", 5);
  await set(field("Map image"), f.afterAsset);
  document.querySelectorAll(".map-marker-list button")[1].click();
  await pause();
  await set(document.querySelector('[aria-label="Vertex 1 across (%)"]'), 22);
  button("Add layer").click();
  await pause();
  await set(
    document.querySelector('[aria-label="Layer name"]'),
    "Old river traces",
  );
  await set(document.querySelector('[aria-label="Layer image"]'), f.baseAsset);
  await set(
    document.querySelector('[aria-label="Opacity of Old river traces"]'),
    22,
  );
  await saved(
    (e) =>
      e.data.versions?.[1]?.scene.asset_id === f.afterAsset &&
      e.data.versions[1].scene.markers[1].points[0][0] === 0.22 &&
      e.data.versions[1].scene.layers[0].opacity === 0.22,
  );
  checks.push(
    "capture versions, reject duplicate date, edit historical image/border/overlay",
  );
  await capture("Secret capital era", 7);
  document.querySelector('[aria-label="Private historical version"]').click();
  await pause();
  document.querySelector(".map-marker-list button").click();
  await pause();
  await set(field("Marker label"), "Secret capital");
  let map = await saved(
    (e) =>
      e.data.versions?.[2]?.private &&
      e.data.versions[2].scene.markers[0].label === "Secret capital",
  );
  expect(
    map.data.markers[0].label === "Founding village" &&
      map.data.versions[0].scene.markers[0].label === "Old village",
    "Editing a version changed earlier states",
  );
  await set(document.querySelector('[aria-label="Editing map state"]'), "");
  expect(
    document.querySelectorAll(".leaflet-image-layer").length === 1,
    "Base retained a historical overlay",
  );
  await post("/resources/" + f.map + "/publish", {
    expected_revision: map.revision,
  });
  checks.push(
    "versions remain independent; private version persists and publishes safely",
  );
  await go("history/" + f.timeline, ".timeline-board");
  button("Chronicles").click();
  await wait(".historical-map-caption");
  const caption = () =>
    document.querySelector(".chronicle-map .historical-map-caption strong")
      ?.textContent;
  expect(caption() === "Base map", "Prehistory should use base");
  document.querySelector('[aria-label="Next historical event"]').click();
  await pause(450);
  expect(caption() === "Before the flood", "Year zero version not selected");
  document.querySelector('[aria-label="Next historical event"]').click();
  await pause(450);
  expect(caption() === "After the flood", "Flood version not selected");
  expect(
    document
      .querySelector(".chronicle-map .leaflet-image-layer")
      ?.getAttribute("src") === f.afterUrl,
    "Historical map image did not change",
  );
  expect(
    document.querySelectorAll(".chronicle-map .leaflet-image-layer").length ===
      2,
    "Historical overlay missing",
  );
  document.querySelector('[aria-label="Next historical event"]').click();
  await pause(450);
  expect(
    caption() === "Secret capital era",
    "Owner cannot inspect private era",
  );
  await set(
    document.querySelector('[aria-label="Chronicle event position"]'),
    0,
  );
  await pause(450);
  expect(caption() === "Base map", "Backward scrub did not restore base");
  document.querySelector(".chronicle-map .map-marker").click();
  await pause(450);
  expect(
    caption() === "Base map",
    "Marker selection changed date unexpectedly",
  );
  document.querySelector('.chronicle-map .map-pin[title="New harbor"]').click();
  await pause(500);
  expect(
    caption() === "After the flood" &&
      document
        .querySelector(".chronicle-stops .active")
        ?.textContent.includes("The flood"),
    "Map marker did not select its matching event",
  );
  checks.push(
    "Chronicle selects dated states, rewinds images/overlays and supports map-to-event selection",
  );
  await go("entry/" + f.map, ".map-history-editor");
  const reopened = await get();
  expect(reopened.data.versions.length === 3, "Versions lost on reopen");
  await go("entry/" + f.timeline, ".timeline-definition");
  button("Reader preview").click();
  await wait(".modal .historical-map-caption");
  const last = [
    ...document.querySelectorAll(".modal .timeline-event-card"),
  ].find((b) => b.textContent.includes("A hidden future"));
  last.click();
  await pause(450);
  expect(
    document.querySelector(".modal .historical-map-caption strong")
      ?.textContent === "After the flood",
    "Reader did not retain last shared version",
  );
  expect(
    !document
      .querySelector(".modal .reader-article")
      .textContent.includes("Secret capital"),
    "Private version leaked in reader preview",
  );
  const response = await fetch(
    "/api/resources/" +
      f.map +
      "/map-state?event=" +
      f.events[3] +
      "&audience=reader",
  ).then((r) => r.json());
  expect(
    response.version.name === "After the flood" &&
      !JSON.stringify(response).includes("Secret capital"),
    "Private era leaked through direct URL",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  checks.push(
    "reopened versions persist; actual reader embed and direct API exclude private era",
  );
  await go("entry/" + f.map, ".map-history-editor");
  await set(
    document.querySelector('[aria-label="Editing map state"]'),
    reopened.data.versions[2].id,
  );
  button("Delete version").click();
  await wait(".modal");
  button("Delete this version", document.querySelector(".modal")).click();
  await saved((e) => e.data.versions.length === 2);
  checks.push("historical version deletion leaves previous states intact");
  await go("history/" + f.timeline, ".timeline-board");
  button("Chronicles").click();
  await wait(".historical-map-caption");
  await set(
    document.querySelector('[aria-label="Chronicle event position"]'),
    2,
  );
  await pause(400);
  return {
    checks,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})();
