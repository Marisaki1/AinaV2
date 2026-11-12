(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaLocation),
    pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw Error(m);
  };
  const wait = async (test, m) => {
    for (let i = 0; i < 80; i++) {
      if (test()) return;
      await pause();
    }
    throw Error(m);
  };
  const button = (name, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === name,
    );
  location.hash = "/entry/" + f.location;
  await pause(550);
  button("Reader preview").click();
  await wait(
    () =>
      document.querySelector(".modal .location-guide .dossier-header h1")
        ?.textContent === f.name,
    "Reader location guide",
  );
  expect(
    !document.querySelector(".modal .dossier-portrait"),
    "Draft location image leaked",
  );
  expect(
    !button("Edit location & lore", document.querySelector(".modal")) &&
      !button("Record location milestone", document.querySelector(".modal")),
    "Reader owner actions",
  );
  const selector = [...document.querySelectorAll(".modal label.field")]
    .find(
      (l) =>
        l.querySelector("span")?.textContent === "Dossier campaign context",
    )
    .querySelector("select");
  Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  ).set.call(selector, f.campaign);
  selector.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(
    () =>
      document
        .querySelector(".modal .dossier-header")
        ?.textContent.includes("Market expedition"),
    "Published campaign context",
  );
  const guide = document.querySelector(".modal .location-guide"),
    tabs = guide.querySelector('[aria-label="Location guide sections"]');
  button("People & connections", tabs).click();
  await pause();
  expect(
    guide.querySelectorAll("[data-location-person]").length === 2 &&
      guide
        .querySelector(`[data-location-person="${f.hero}"]`)
        ?.textContent.includes("Resident"),
    "Reader people filtering",
  );
  expect(
    !guide.querySelector(`[data-location-person="${f.hidden}"]`),
    "Private resident identity",
  );
  button("Visits & journal", tabs).click();
  await pause();
  expect(
    guide.querySelector(`[data-dossier-record="${f.session}"]`) &&
      guide.querySelector(`[data-dossier-record="${f.journal}"]`),
    "Public pin visits missing",
  );
  for (const id of [f.privateRecord, f.hiddenPinRecord, f.milestone, f.outside])
    expect(
      !guide.querySelector(`[data-dossier-record="${id}"]`),
      "Hidden visit exposed " + id,
    );
  expect(
    !guide.textContent.includes("GM-only") &&
      !!guide.querySelector(`[data-resource-id="${f.location}"]`),
    "Private planning or missing automatic links",
  );
  button("Maps & places", tabs).click();
  await pause();
  expect(
    guide.querySelectorAll(".dossier-place-grid article").length === 2,
    "Private map pin listed",
  );
  const card = [...guide.querySelectorAll(".dossier-place-grid article")].find(
    (e) => e.textContent.includes("Market square"),
  );
  button("Inspect place on map", card).click();
  await wait(
    () =>
      document
        .querySelector(".modal .map-guide-inspector")
        ?.textContent.includes("A lantern-lit market"),
    "Published map location",
  );
  expect(
    document.querySelectorAll(".modal .campaign-map-guide .map-marker")
      .length === 2,
    "Private map canvas pin exposed",
  );
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await pause();
  expect(
    document.querySelector(".modal .location-guide") &&
      !document.querySelector(".modal .campaign-map-guide"),
    "Nested Escape closed parent guide",
  );
  const payload = await fetch(
    `/api/resources/${f.location}/location-guide?campaign=${f.campaign}&audience=reader`,
  ).then((r) => r.json());
  const encoded = JSON.stringify(payload);
  for (const secret of [
    "GM-only",
    f.hidden,
    f.secretEdge,
    f.privateRecord,
    f.hiddenPinRecord,
    f.milestone,
    f.task,
    f.outside,
    f.refreshRecord,
  ].filter(Boolean))
    expect(!encoded.includes(secret), "Reader JSON leaked " + secret);
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  return {
    publishedLoreAndVisits: true,
    residentFiltering: true,
    noGmNotesOrPlanning: true,
    hiddenPinsNotGeneralVisits: true,
    draftImageExcluded: true,
    automaticSourceLinks: true,
    campaignScope: true,
    nestedMapPrivacyAndEscape: true,
  };
})();
