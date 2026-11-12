(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaGuideLinks),
    pause = (ms = 160) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const button = (n, root = document) =>
      [...root.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === n,
      ),
    get = () => fetch("/api/resources/" + f.note).then((r) => r.json());
  location.hash = "/entry/" + f.note;
  await pause(700);
  const before = await get();
  button("Read linked notes").click();
  await pause(500);
  const links = [
    ...document.querySelectorAll(".linked-reading-view a.auto-resource-link"),
  ];
  expect(links.length === 3, "Automatic title/alias links");
  expect(
    links.map((a) => a.textContent).join("|") ===
      [f.heroTitle, f.placeTitle, f.alias].join("|"),
    "Original wording changed",
  );
  const link = links.find((a) => a.dataset.resourceId === f.place);
  expect(
    link?.getAttribute("href") === "/#/entry/" + f.place,
    "Wrong source UUID",
  );
  link.click();
  await pause(500);
  expect(
    document
      .querySelector(".quick-entry-preview")
      ?.textContent.includes("Lanterns mark the path"),
    "Source preview did not open",
  );
  button("Keep writing", document.querySelector(".modal")).click();
  await pause(100);
  button("Write notes").click();
  await pause();
  expect(
    document.querySelector(".prose-editor").textContent === f.text,
    "Source notes changed by reading view",
  );
  const after = await get();
  expect(
    JSON.stringify(after.document) === JSON.stringify(before.document) &&
      after.revision === before.revision,
    "Automatic links rewrote saved notes",
  );
  location.hash = "/entry/" + f.map;
  await pause(650);
  button("Explore map guide").click();
  await pause(600);
  expect(
    document.querySelector(".modal .campaign-map-guide .leaflet-image-layer"),
    "Owner map guide modal",
  );
  document.querySelector('.modal [data-guide-marker="hamlet"]').click();
  await pause(550);
  expect(
    document
      .querySelector(".modal .map-guide-inspector")
      .textContent.includes(f.placeTitle),
    "Owner modal location context",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  return {
    checks: [
      "automatic title/alias links preserve words and resolve to original source UUID",
      "clicking a generated link opens the existing source preview",
      "read/write toggles do not modify document or revision",
      "owner map editor opens the location guide",
    ],
  };
})();
