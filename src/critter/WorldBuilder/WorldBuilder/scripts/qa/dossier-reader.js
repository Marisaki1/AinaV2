(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAudit),
    pause = (ms = 150) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 85; i++) {
      if (test()) return;
      await pause(100);
    }
    throw Error(m);
  };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  location.hash = "/entry/" + f.hero;
  await pause(650);
  button("Reader preview").click();
  await wait(
    () =>
      document.querySelector(".modal .dossier-header h1")?.textContent ===
      f.name,
    "Reader character dossier",
  );
  expect(
    !document.querySelector(".modal .dossier-portrait"),
    "Draft portrait leaked",
  );
  expect(
    !button("Edit character & lore", document.querySelector(".modal")) &&
      !button("Record character milestone", document.querySelector(".modal")),
    "Reader owner actions",
  );
  button(
    "Sessions & journal",
    document.querySelector('.modal [aria-label="Character dossier sections"]'),
  ).click();
  await pause();
  const records = document.querySelector(
    ".modal .dossier-timeline",
  ).textContent;
  expect(
    records.includes("Audited session"),
    "Published session appearance missing",
  );
  expect(!records.includes("Audited daily journal"), "Private journal leaked");
  for (const secret of ["GM-only ambush", "hidden faction", "GM-only plan"])
    expect(!records.includes(secret), "GM planning text leaked " + secret);
  button(
    "Relationship web",
    document.querySelector('.modal [aria-label="Character dossier sections"]'),
  ).click();
  await pause();
  expect(
    document.querySelectorAll(".modal [data-affinity-node]").length === 3,
    "Private character in reader web",
  );
  expect(
    !document
      .querySelector(".modal .dossier-relationship-list")
      .textContent.includes("GM-only trust"),
    "Private connection notes leaked",
  );
  button(
    "Places & maps",
    document.querySelector('.modal [aria-label="Character dossier sections"]'),
  ).click();
  await pause();
  expect(
    document.querySelectorAll(".modal .dossier-place-grid article").length ===
      1,
    "Private map location leaked",
  );
  const value = await fetch(
    "/api/resources/" +
      f.hero +
      "/dossier?audience=reader&campaign=" +
      f.campaign,
  ).then((r) => r.json());
  const raw = JSON.stringify(value);
  expect(
    !raw.includes(f.hidden) &&
      !raw.includes(f.milestone) &&
      !raw.includes(f.task),
    "Private record identities leaked",
  );
  expect(
    !raw.includes("GM secret:") && !raw.includes("GM-only trust secret."),
    "Private source notes leaked",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  return {
    checks: [
      "published character dossier and session recap retain reader snapshots",
      "private portrait, journal, milestone, task, neighboring character and map pin excluded",
      "GM source/relationship/planning text and owner actions excluded",
    ],
    readerRecords: value.record_total,
  };
})();
