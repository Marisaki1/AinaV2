(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA workspace required");
  const f = JSON.parse(localStorage.getItem("qaMapsHistory"));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, msg) => {
    if (!v) throw new Error(msg);
  };
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(700);
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  await go("entry/" + f.map);
  const image = () => document.querySelector(".leaflet-image-layer");
  const saved = image().getBoundingClientRect().width;
  button("Fit map").click();
  await pause(350);
  expect(
    image().getBoundingClientRect().width < saved,
    "Reopened map did not use saved zoom",
  );
  button("Saved view").click();
  await pause(350);
  expect(
    Math.abs(image().getBoundingClientRect().width - saved) < 1,
    "Saved view does not restore zoom",
  );
  const click = (x, y) => {
    const c = document.querySelector(".leaflet-container"),
      r = c.getBoundingClientRect();
    c.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: r.left + r.width * x,
        clientY: r.top + r.height * y,
      }),
    );
  };
  button("Fit map").click();
  await pause(350);
  for (const [tool, points] of [
    [
      "Line",
      [
        [0.2, 0.2],
        [0.4, 0.25],
      ],
    ],
    [
      "Polygon",
      [
        [0.5, 0.3],
        [0.7, 0.35],
        [0.6, 0.6],
      ],
    ],
  ]) {
    document.querySelector('[aria-label="' + tool + ' tool"]').click();
    await pause(80);
    for (const p of points) {
      click(...p);
      await pause(80);
    }
    button("Finish").click();
    await pause(150);
  }
  document.querySelector('[aria-label="Circle tool"]').click();
  await pause(80);
  click(0.3, 0.65);
  await pause(1500);
  const before = await fetch("/api/resources/" + f.map).then((r) => r.json());
  expect(
    ["line", "polygon", "circle"].every((t) =>
      before.data.markers.some((m) => m.type === t),
    ),
    "Geometry did not save",
  );
  await go("home");
  await go("entry/" + f.map);
  expect(
    document.querySelectorAll(".leaflet-overlay-pane path").length >= 4,
    "Reopened shapes missing",
  );
  const after = await fetch("/api/resources/" + f.map).then((r) => r.json());
  expect(
    JSON.stringify(before.data) === JSON.stringify(after.data),
    "Reopening changed geometry",
  );
  await go("history/" + f.timeline);
  expect(
    document.querySelectorAll(".timeline-track").length === 4,
    "Reopened timeline lanes missing",
  );
  return {
    checks: [
      "saved map zoom survives reload and restores after fit",
      "line/polygon/circle drawing persists through reopen",
      "timeline definition survives reopen",
    ],
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})();
