(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaSessionGuide),
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
  location.hash = "/entry/" + f.session;
  await pause(550);
  button("Reader preview").click();
  await wait(
    () => document.querySelector(".modal .session-guide h1"),
    "Reader session guide",
  );
  const guide = document.querySelector(".modal .session-guide");
  expect(
    guide.textContent.includes("reached the hamlet") &&
      !guide.textContent.includes("fulfilled the village promise"),
    "Draft recap leaked",
  );
  expect(
    !button("Edit session plan & outcomes", guide) &&
      !button("Write session record", guide),
    "Reader write controls",
  );
  for (const text of [
    "Private ambush",
    "Private carryover",
    "Private hidden faction",
    "Private follow-up",
  ])
    expect(!guide.textContent.includes(text), "GM text leaked " + text);
  expect(
    guide.querySelector(`[data-resource-id="${f.hero}"]`),
    "Reader recap automatic source link",
  );
  button("Session notes", guide).click();
  await pause();
  expect(
    guide.querySelector(`[data-session-record="${f.publicRecord}"]`),
    "Published record missing",
  );
  expect(
    !guide.querySelector(`[data-session-record="${f.privateRecord}"]`) &&
      f.created.every(
        (id) => !guide.querySelector(`[data-session-record="${id}"]`),
      ),
    "Private record leaked",
  );
  button("Cast & lore", guide).click();
  await pause();
  expect(
    guide.textContent.includes(f.name) &&
      !guide.querySelector(".session-guide-portrait"),
    "Draft portrait or missing published cast",
  );
  button("Maps & places", guide).click();
  await pause();
  button("Explore this location", guide).click();
  await wait(
    () =>
      document
        .querySelector(".modal .map-guide-inspector")
        ?.textContent.includes(f.placeName),
    "Reader location",
  );
  expect(
    document.querySelectorAll(".campaign-map-guide .map-marker").length === 1,
    "Private pin exposed",
  );
  const value = await fetch(
    `/api/resources/${f.session}/session-guide?audience=reader`,
  ).then((r) => r.json());
  const encoded = JSON.stringify(value);
  for (const id of [f.hidden, f.privateRecord, f.outside, f.next, ...f.created])
    expect(!encoded.includes(id), "Private identity leaked " + id);
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await pause();
  expect(
    !document.querySelector(".modal .campaign-map-guide") &&
      !!document.querySelector(".modal .session-guide"),
    "Nested Escape closed parent preview",
  );
  return {
    publishedSnapshot: true,
    sourceLinks: true,
    noGmPlanning: true,
    privateRecordsAndIdentitiesExcluded: true,
    noWriteControls: true,
    publishedCast: true,
    publicMapPinOnly: true,
    hiddenNextSession: true,
    nestedEscapePreservesReader: true,
  };
})();
