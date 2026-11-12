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
      if (await test()) return;
      await pause();
    }
    throw Error(m);
  };
  const button = (name, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === name,
    );
  const field = (name) =>
    [...document.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === name)
      ?.querySelector("input,select,textarea");
  const set = async (el, value) => {
    expect(el, "Missing field " + value);
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause(50);
  };
  location.hash = "/entry/" + f.location;
  await pause(550);
  button("Open location guide").click();
  await wait(
    () =>
      document.querySelector(".location-guide .dossier-header h1")
        ?.textContent === f.name,
    "Location editor action",
  );
  expect(
    document
      .querySelector(".dossier-fields")
      .textContent.includes("A dozen wandering merchants"),
    "Location fields",
  );
  await set(field("Dossier campaign context"), f.campaign);
  await wait(
    () =>
      document
        .querySelector(".dossier-header")
        ?.textContent.includes("Market expedition"),
    "Campaign context",
  );
  const tabs = () =>
    document.querySelector('[aria-label="Location guide sections"]');
  button("People & connections", tabs()).click();
  await pause();
  const hero = document.querySelector(`[data-location-person="${f.hero}"]`),
    npc = document.querySelector(`[data-location-person="${f.npc}"]`);
  expect(
    hero?.textContent.includes("Resident") &&
      npc?.textContent.includes("Connected person"),
    "Resident direction or visitor labeling",
  );
  expect(
    document.querySelectorAll(".affinity-node").length >= 4,
    "Location relationship web",
  );
  button("View character dossier", hero).click();
  await wait(
    () =>
      document.querySelector(
        ".character-dossier:not(.location-guide) .dossier-header h1",
      ),
    "Resident dossier navigation",
  );
  location.hash = `/locations/${f.location}/${f.campaign}`;
  await wait(
    () => document.querySelector(".location-guide .dossier-header h1"),
    "Return location",
  );
  button("Visits & journal", tabs()).click();
  await pause();
  expect(
    document.querySelector(`[data-dossier-record="${f.session}"]`) &&
      document.querySelector(`[data-dossier-record="${f.journal}"]`),
    "Pin-linked visits",
  );
  expect(
    !document.querySelector(`[data-dossier-record="${f.outside}"]`),
    "Other campaign record leaked",
  );
  button(
    "Open original record",
    document.querySelector(`[data-dossier-record="${f.session}"]`),
  ).click();
  await wait(
    () => document.querySelector(".session-guide h1"),
    "Visit session guide",
  );
  location.hash = `/locations/${f.location}/${f.campaign}`;
  await wait(
    () => document.querySelector(".location-guide .dossier-header h1"),
    "Return after visit",
  );
  button("Record location milestone").click();
  await pause();
  await set(field("Location record title"), "Market promise kept " + f.stamp);
  await set(
    field("Location record notes"),
    `${f.alias} gained the party's trust.`,
  );
  await set(field("In-world day / chapter"), "Day 15 / market return");
  await set(field("Related session"), f.session);
  button("Save location record").click();
  await wait(
    () => !document.querySelector(".modal"),
    "Save location milestone",
  );
  const rows = (
    await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
  ).resources;
  const note = rows.find((e) => e.title === "Market promise kept " + f.stamp);
  expect(
    note?.data.related_entries.includes(f.location) &&
      note.data.session_id === f.session &&
      note.data.campaign_id === f.campaign &&
      note.visibility === "private",
    "Location note associations",
  );
  f.milestone = note.id;
  button("All notes", tabs()).click();
  await pause();
  button("Link existing campaign record").click();
  await pause();
  await set(field("Existing location record"), f.task);
  button("Save location link").click();
  await wait(() => !document.querySelector(".modal"), "Link existing task");
  button("Overview", tabs()).click();
  await pause();
  await wait(
    () => document.querySelector(`[data-dossier-record="${f.task}"]`),
    "Unresolved task",
  );
  await set(field("Location image"), f.asset);
  await wait(
    async () =>
      (await fetch(`/api/resources/${f.location}`).then((r) => r.json())).data
        .cover_asset === f.asset,
    "Location image save",
  );
  const source = await fetch(`/api/resources/${f.location}`).then((r) =>
    r.json(),
  );
  expect(
    source.document.content[0].content[0].text ===
      "A lantern-lit market beside the old shrine.",
    "Location lore was copied or rewritten",
  );
  button("Maps & places", tabs()).click();
  await pause();
  const mapCard = [
    ...document.querySelectorAll(".dossier-place-grid article"),
  ].find((e) => e.textContent.includes("Market square"));
  button("Inspect place on map", mapCard).click();
  await wait(
    () =>
      document
        .querySelector(".modal .map-guide-inspector")
        ?.textContent.includes("A lantern-lit market"),
    "Focused map pin",
  );
  button(
    "View location guide",
    document.querySelector(".modal .map-guide-inspector"),
  ).click();
  await wait(
    () =>
      !document.querySelector(".modal") &&
      !!document.querySelector(".location-guide"),
    "Map inspector location navigation",
  );
  location.hash = "/campaigns/" + f.campaign;
  await pause(400);
  button(
    "Characters & places",
    document.querySelector(".campaign-workspace"),
  ).click();
  await pause();
  button(
    "View location guide",
    document.querySelector(`[data-campaign-record="${f.location}"]`),
  ).click();
  await wait(
    () => document.querySelector(".location-guide h1"),
    "Campaign cast location action",
  );
  localStorage.qaLocation = JSON.stringify(f);
  window.scrollTo(0, 0);
  return {
    originalEditorAction: true,
    campaignContext: true,
    residentsVsVisitors: true,
    relationshipWeb: true,
    characterDossierNavigation: true,
    pinLinkedVisits: true,
    sessionGuideNavigation: true,
    privateMilestone: f.milestone,
    existingTaskLinked: true,
    portraitWithoutLoreRewrite: true,
    focusedMapAndReturn: true,
    campaignCastAction: true,
  };
})();
