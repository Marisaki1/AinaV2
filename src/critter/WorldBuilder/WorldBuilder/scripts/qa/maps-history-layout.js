(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA workspace required");
  const f = JSON.parse(localStorage.getItem("qaMapsHistory"));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, msg) => {
    if (!v) throw new Error(msg);
  };
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(1000);
  };
  const checks = [];
  await go("history/" + f.timeline);
  expect(
    document.querySelectorAll(".timeline-track").length === 4,
    "Timeline not rendered",
  );
  for (const card of document.querySelectorAll(".timeline-event-card")) {
    expect(
      card.getBoundingClientRect().bottom <
        card.closest(".timeline-track").getBoundingClientRect().bottom,
      "Event card crosses lane boundary",
    );
  }
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Timeline overflows page",
  );
  checks.push("timeline cards remain within lanes; page width fits");
  button("Chronicles").click();
  await pause(400);
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Chronicle overflows page",
  );
  checks.push("Chronicle controls fit");
  await go("entry/" + f.map);
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Map editor overflows page",
  );
  button("Reader preview").click();
  await pause(500);
  const mapReader = document.querySelector(".modal .reader-article");
  expect(mapReader, "Map reader preview missing");
  expect(
    !mapReader.textContent.includes("Secret overlay"),
    "Private overlay visible in preview",
  );
  expect(
    !mapReader.querySelector(".map-pin"),
    "Private pin visible in preview",
  );
  const hotspot = mapReader.querySelector(".map-hotspot");
  expect(
    hotspot &&
      hotspot.getAttribute("fill-opacity") === "0" &&
      hotspot.getAttribute("stroke-opacity") === "0",
    "Reader hotspot is visible",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause(150);
  checks.push(
    "map editor fits; saved preview hides private data and hotspot shape",
  );
  await go("entry/" + f.timeline);
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Timeline settings overflow page",
  );
  button("Reader preview").click();
  await pause(600);
  const timelineReader = document.querySelector(".modal .reader-article");
  expect(
    timelineReader?.querySelector(".timeline-board"),
    "Reader timeline missing",
  );
  expect(
    !timelineReader.textContent.includes("Hidden conspiracy") &&
      !timelineReader.textContent.includes("Secret history"),
    "Reader timeline leaked a private lane",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause(150);
  checks.push(
    "timeline settings fit; actual reader embed omits private lane and event",
  );
  await go("history/" + f.timeline);
  return {
    width: innerWidth,
    checks,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})();
