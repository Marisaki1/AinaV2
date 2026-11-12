(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaWorkbench),
    pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 75; i++) {
        if (test()) return;
        await pause();
      }
      throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const campaign = await fetch("/api/resources/" + f.campaign).then((r) =>
    r.json(),
  );
  const publication = await fetch(`/api/resources/${f.campaign}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: JSON.stringify({ expected_revision: campaign.revision }),
  });
  expect(publication.ok, "Publish campaign");
  const projection = await fetch(
    `/api/resources/${f.campaign}?audience=reader`,
  ).then((r) => r.json());
  expect(!projection.data.gm_workspace, "GM layout in reader campaign");
  for (const id of [
    f.capturedNote,
    f.milestone,
    f.newQuest,
    f.threadUpdate,
    f.refreshNote,
  ].filter(Boolean))
    expect(
      !JSON.stringify(projection).includes(id),
      "Private pin identity leaked",
    );
  location.hash = "/entry/" + f.quest;
  await pause(550);
  button("Reader preview").click();
  await wait(
    () => document.querySelector(".modal .thread-guide h1"),
    "Reader thread guide",
  );
  const guide = document.querySelector(".modal .thread-guide");
  expect(
    guide.textContent.includes("Objectives · 0/1") &&
      !guide.textContent.includes("Return the shrine clue"),
    "Draft objectives leaked",
  );
  expect(
    !guide.textContent.includes("GM-only") &&
      !button("Edit objectives & outcome", guide) &&
      !button("Record thread update", guide),
    "Reader GM fields/actions",
  );
  expect(
    guide.querySelector(`[data-thread-update="${f.note}"]`) &&
      !guide.querySelector(`[data-thread-update="${f.threadUpdate}"]`),
    "Private update leak or missing public note",
  );
  expect(
    guide.querySelector(`[data-resource-id="${f.hero}"]`),
    "Published outcome automatic source link",
  );
  const data = await fetch(
    `/api/resources/${f.quest}/thread-guide?audience=reader`,
  ).then((r) => r.json());
  const encoded = JSON.stringify(data);
  for (const secret of [
    "GM-only",
    f.capturedNote,
    f.milestone,
    f.threadUpdate,
    f.refreshNote,
  ].filter(Boolean))
    expect(!encoded.includes(secret), "Reader JSON leak " + secret);
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  return {
    publishedObjectivesAndOutcome: true,
    privateNextActionAndUpdatesExcluded: true,
    noOwnerControls: true,
    automaticSourceLinks: true,
    gmLayoutsAndPrivatePinIdsExcludedFromPublishedCampaign: true,
  };
})();
