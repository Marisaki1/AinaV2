(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaGuideLinks),
    pause = (ms = 160) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 80; i++) {
      if (test()) return;
      await pause(100);
    }
    throw Error(m);
  };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  location.hash = "/entry/" + f.map;
  await pause(700);
  button("Reader preview").click();
  await wait(
    () =>
      document.querySelector(".modal .campaign-map-guide .leaflet-image-layer"),
    "Reader guide image",
  );
  expect(
    document.querySelectorAll(".modal [data-guide-marker]").length === 2,
    "Reader marker filtering",
  );
  expect(
    !document
      .querySelector(".modal .map-guide-records")
      ?.textContent.includes("Secret camp record"),
    "Private marker record promoted to map overview",
  );
  const pin = document.querySelector(
    '.modal .map-marker [title="Lantern Hamlet"]',
  );
  expect(pin, "Public map pin missing");
  pin.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await wait(
    () =>
      document
        .querySelector(".modal .map-guide-inspector")
        .textContent.includes("Lanterns mark the path"),
    "Map pin did not inspect location",
  );
  const text = document.querySelector(
    ".modal .map-guide-inspector",
  ).textContent;
  expect(
    text.includes(f.heroTitle) && text.includes("Road journal"),
    "Reader location context missing",
  );
  for (const secret of [
    "GM-only hamlet clue",
    "GM-only session preparation",
    "GM-only relationship note",
    "GM-only camp record body",
    "Hamlet milestone",
  ])
    expect(!text.includes(secret), "Reader secret leaked " + secret);
  expect(
    !button("Write location note", document.querySelector(".modal")) &&
      !button("Open location entry & notes", document.querySelector(".modal")),
    "Reader owner controls",
  );
  expect(
    document.querySelectorAll(".modal .map-guide-records a.auto-resource-link")
      .length >= 3,
    "Reader automatic source links",
  );
  const payload = await fetch(
    "/api/resources/" +
      f.map +
      "/map-guide?audience=reader&marker=hamlet&campaign=" +
      f.campaign,
  ).then((r) => r.json());
  expect(
    !JSON.stringify(payload).includes(f.secret) &&
      !JSON.stringify(payload).includes(f.milestone),
    "Reader private record identity leaked",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  return {
    checks: [
      "actual map pin opens reader location inspector",
      "private pins and pin records excluded from overview and selected place",
      "private milestone, GM location/session/relationship notes and owner controls excluded",
      "published source names/aliases link in reader journal prose",
    ],
  };
})();
