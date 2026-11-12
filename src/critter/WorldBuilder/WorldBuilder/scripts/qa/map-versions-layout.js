(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaMapVersions"));
  const pause = (ms = 300) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw new Error(m);
    };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const set = async (el, value) => {
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
    await pause(750);
  };
  await go("entry/" + f.map);
  const states = document.querySelector('[aria-label="Editing map state"]');
  expect(states?.options.length === 3, "Saved historical versions missing");
  await set(states, states.options[2].value);
  expect(
    document.querySelector(".leaflet-image-layer")?.getAttribute("src") ===
      f.afterUrl,
    "Reopened historical image missing",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Historical map editor overflows",
  );
  button("Capture version").click();
  await pause();
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Capture dialog overflows",
  );
  button("Cancel").click();
  await pause();
  await go("history/" + f.timeline);
  button("Chronicles").click();
  await pause(500);
  await set(
    document.querySelector('[aria-label="Chronicle event position"]'),
    2,
  );
  await pause(500);
  expect(
    document.querySelector(".historical-map-caption strong")?.textContent ===
      "After the flood",
    "Historical scene did not load",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Historical Chronicle overflows",
  );
  return {
    width: innerWidth,
    checks: [
      "historical editor and capture dialog fit",
      "reopened scene retains image and overlays",
      "Chronicle date selects the expected scene",
    ],
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})();
