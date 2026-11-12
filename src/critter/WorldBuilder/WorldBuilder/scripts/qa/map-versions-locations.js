(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaMapVersions"));
  const pause = (ms = 200) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw new Error(m);
    };
  const set = async (el, value) => {
    expect(el, "Missing field");
    const p =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(p, "value").set.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(800);
  };
  await go("entry/" + f.map);
  const states = document.querySelector('[aria-label="Editing map state"]');
  await set(states, states.options[2].value);
  document.querySelector('[aria-label="Pin tool"]').click();
  await pause();
  const canvas = document.querySelector(".leaflet-container"),
    rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      clientX: rect.left + rect.width * 0.6,
      clientY: rect.top + rect.height * 0.6,
    }),
  );
  await pause();
  const label = [...document.querySelectorAll("label.field")]
    .find((l) => l.querySelector("span")?.textContent === "Marker label")
    ?.querySelector("input");
  await set(label, "Flood memorial");
  let map, marker;
  for (let i = 0; i < 45; i++) {
    await pause();
    map = await fetch("/api/resources/" + f.map).then((r) => r.json());
    marker = map.data.versions[1].scene.markers.find(
      (m) => m.label === "Flood memorial",
    );
    if (marker) break;
  }
  expect(
    marker && !map.data.markers.some((m) => m.id === marker.id),
    "Historical-only marker did not persist independently",
  );
  await go("entry/" + f.events[2]);
  const picker = [...document.querySelectorAll("label.field")]
    .find((l) => l.querySelector("span")?.textContent === "Map location")
    ?.querySelector("select");
  expect(
    [...picker.options].some((o) => o.value === marker.id),
    "Event picker omitted historical location",
  );
  await set(picker, marker.id);
  let saved = false;
  for (let i = 0; i < 40; i++) {
    await pause();
    const event = await fetch("/api/resources/" + f.events[2]).then((r) =>
      r.json(),
    );
    if (event.data.marker_id === marker.id) {
      saved = true;
      break;
    }
  }
  expect(saved, "Event historical location did not save");
  await go("history/" + f.timeline);
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent.trim() === "Chronicles")
    .click();
  await pause(500);
  await set(
    document.querySelector('[aria-label="Chronicle event position"]'),
    2,
  );
  await pause(500);
  expect(
    document.querySelector('.chronicle-map .map-pin[title="Flood memorial"]'),
    "Chronicle did not render historical-only location",
  );
  return {
    checks: [
      "create a location only in a historical scene",
      "select and save that location from the event editor",
      "show it on the event’s dated Chronicle map",
    ],
  };
})();
