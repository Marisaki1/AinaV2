(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAudit),
    pause = (ms = 140) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 85; i++) {
        if (await test()) return;
        await pause(100);
      }
      throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  const field = (n) =>
    [...document.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === n)
      ?.querySelector("input,select,textarea");
  const set = async (el, v) => {
    expect(el, "Missing field " + v);
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
      "value",
    ).set.call(el, v);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  location.hash = "/campaigns/" + f.campaign;
  await pause(650);
  button(
    "Characters & places",
    document.querySelector(".campaign-workspace"),
  ).click();
  await pause();
  const card = document.querySelector(`[data-campaign-record="${f.hero}"]`);
  button("View character dossier", card).click();
  await wait(
    () => document.querySelector(".dossier-header h1")?.textContent === f.name,
    "Campaign character dossier",
  );
  expect(
    document
      .querySelector(".dossier-fields")
      .textContent.includes("Forest scout"),
    "Character fields missing",
  );
  button(
    "Sessions & journal",
    document.querySelector('[aria-label="Character dossier sections"]'),
  ).click();
  await pause();
  expect(
    document
      .querySelector(".dossier-timeline")
      .textContent.includes("Audited session") &&
      document
        .querySelector(".dossier-timeline")
        .textContent.includes("Audited daily journal"),
    "Mentioned session/journal appearances",
  );
  button(
    "Relationship web",
    document.querySelector('[aria-label="Character dossier sections"]'),
  ).click();
  await pause();
  expect(
    document.querySelectorAll("[data-affinity-node]").length === 4,
    "Character neighborhood",
  );
  expect(
    document
      .querySelector(".dossier-relationship-list")
      .textContent.includes("GM-only trust secret."),
    "Owner relationship notes missing",
  );
  button(
    "Places & maps",
    document.querySelector('[aria-label="Character dossier sections"]'),
  ).click();
  await pause();
  button("Inspect place on map").click();
  await wait(
    () =>
      document
        .querySelector(".modal .map-guide-inspector")
        ?.textContent.includes("Lanterns illuminate"),
    "Dossier map did not open exact location",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  button("Record character milestone").click();
  await pause();
  await set(field("Character record title"), "A promise kept " + f.stamp);
  await set(
    field("Character record notes"),
    `${f.alias} earned the villagers’ trust after the rescue.`,
  );
  await set(field("In-world day / chapter"), "Day 13 / promise kept");
  await set(field("Related session"), f.session);
  button("Save character record").click();
  await wait(async () => {
    const rows = (
      await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
    ).resources;
    const milestone = rows.find((e) => e.title === "A promise kept " + f.stamp);
    if (milestone) {
      f.milestone = milestone.id;
      localStorage.qaAudit = JSON.stringify(f);
    }
    return !!milestone && !document.querySelector(".modal");
  }, "Character milestone");
  button(
    "Progression",
    document.querySelector('[aria-label="Character dossier sections"]'),
  ).click();
  await wait(
    () =>
      document
        .querySelector(".dossier-timeline")
        ?.textContent.includes("A promise kept"),
    "Progression note missing",
  );
  button("Link existing campaign record").click();
  await pause();
  await set(field("Existing character record"), f.task);
  button("Save character link").click();
  await wait(
    async () =>
      !document.querySelector(".modal") &&
      (
        await fetch("/api/resources/" + f.task).then((r) => r.json())
      ).data.related_entries?.includes(f.hero),
    "Existing task link",
  );
  button(
    "Overview",
    document.querySelector('[aria-label="Character dossier sections"]'),
  ).click();
  await wait(
    () =>
      document
        .querySelector(".dossier-overview")
        ?.textContent.includes("Prepare the next scene"),
    "Unresolved linked task",
  );
  await set(field("Character portrait"), f.asset);
  await wait(
    () => document.querySelector(".dossier-portrait"),
    "Character portrait selection",
  );
  const source = await fetch("/api/resources/" + f.hero).then((r) => r.json());
  expect(
    JSON.stringify(source.document) === JSON.stringify(f.original),
    "Dossier actions changed character lore",
  );
  checks.push(
    "campaign cast opens original character dossier",
    "lore/fields, alias-based session appearances and journal records together",
    "relationship neighborhood and private owner notes",
    "place card opens focused map guide",
    "private character milestone and existing task link retain original IDs",
    "unresolved thread and portrait selection; original lore unchanged",
  );
  return { checks, milestone: f.milestone };
})();
