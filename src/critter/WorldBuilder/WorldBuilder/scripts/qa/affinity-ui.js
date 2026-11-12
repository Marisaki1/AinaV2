(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAffinity),
    pause = (ms = 140) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 80; i++) {
        if (await test()) return;
        await pause(100);
      }
      throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  const field = (n, root = document) =>
    [...root.querySelectorAll("label.field")]
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
  button("Affinity web", document.querySelector(".campaign-workspace")).click();
  await pause();
  button("New affinity web").click();
  await pause();
  await set(
    field("Affinity web name"),
    "Scarlet Forest connections " + f.stamp,
  );
  button("Create affinity web").click();
  await wait(
    () => document.querySelectorAll("[data-affinity-node]").length === 8,
    "Campaign cast web missing",
  );
  f.board = field("Saved affinity web").value;
  localStorage.qaAffinity = JSON.stringify(f);
  expect(
    document.querySelectorAll("[data-affinity-edge]").length === 6,
    "Connection web missing edges",
  );
  document
    .querySelector(`[data-affinity-node="${f.hero}"]`)
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await wait(
    () =>
      document
        .querySelector(".affinity-entry-notes")
        ?.textContent.includes("Keep track of clues"),
    "Inspector notes missing",
  );
  expect(
    document
      .querySelector(".affinity-inspector")
      .textContent.includes("Promise at the shrine"),
    "Linked journal missing",
  );
  document.querySelector(".affinity-focus input").click();
  await pause();
  expect(
    document.querySelectorAll("[data-affinity-node]").length === 5,
    "One-hop focus",
  );
  document.querySelector(".affinity-focus input").click();
  await set(field("Find in affinity web"), "Alice");
  expect(
    document.querySelectorAll("[data-affinity-node]").length === 1,
    "Web search",
  );
  await set(field("Find in affinity web"), "");
  await set(field("Connection type"), "rival");
  expect(
    document.querySelectorAll("[data-affinity-edge]").length === 1,
    "Relationship type filter",
  );
  await set(field("Connection type"), "all");
  document
    .querySelector(`[data-affinity-edge="${f.rival}"]`)
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await pause();
  expect(
    document
      .querySelector(".affinity-connection-note")
      .textContent.includes("Private reminder"),
    "Relationship notes missing",
  );
  button("Edit relationship & notes").click();
  await pause();
  await set(field("Label (optional)"), "Growing trust");
  await set(field("Directional strength (-100 to 100)"), 25);
  await set(
    field("Relationship notes"),
    "Private reminder: trust earned after rescuing villagers.",
  );
  button("Save affinity relationship").click();
  await wait(
    () =>
      !document.querySelector(".modal") &&
      document
        .querySelector(`[data-affinity-edge="${f.rival}"]`)
        ?.textContent.includes("Growing trust"),
    "Relationship edit not refreshed",
  );
  checks.push(
    "private saved campaign web with original nodes/edges",
    "node inspector, linked journal, one-hop focus, name/type filters",
    "relationship label, strength and GM notes edited with original edge identity",
  );
  document
    .querySelector(`[data-affinity-node="${f.hero}"]`)
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await pause();
  await set(field("Portrait image"), f.asset);
  await wait(
    () => document.querySelector(`[data-affinity-node="${f.hero}"] image`),
    "Portrait not updated",
  );
  button("Write linked note").click();
  await pause();
  await set(field("Linked note title"), "Affinity field note " + f.stamp);
  await set(
    field("Linked note text"),
    "The party suspects the forest route is watched.",
  );
  button("Save linked note").click();
  await wait(
    () =>
      !document.querySelector(".modal") &&
      document
        .querySelector(".affinity-inspector")
        .textContent.includes("Affinity field note"),
    "Linked note not shown",
  );
  const notes = (
    await fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
  ).resources;
  const saved = notes.find((e) => e.title === "Affinity field note " + f.stamp);
  expect(
    saved?.visibility === "private" &&
      saved.data.campaign_id === f.campaign &&
      saved.data.related_entries.includes(f.hero),
    "Linked note data",
  );
  checks.push(
    "portrait selection and private linked campaign note created directly from the web",
  );
  return { checks, board: f.board };
})();
