(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaWorkbench),
    pause = (ms = 100) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 65; i++) {
        if (test()) return;
        await pause();
      }
      throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  location.hash = "/campaigns/" + f.campaign;
  await pause(450);
  button("Run session", document.querySelector(".campaign-workspace")).click();
  await pause();
  expect(
    !document
      .querySelector(".gm-layout .quest-list")
      .textContent.includes("Explicitly detached quest"),
    "Legacy GM screen retained cleared campaign membership",
  );
  button("Open GM desk").click();
  await wait(
    () => document.querySelector("[data-desk-panel]"),
    "GM desk integration",
  );
  button(
    "Open session guide",
    document.querySelector('[data-desk-panel="session"]'),
  ).click();
  await wait(
    () => document.querySelector(".session-guide h1"),
    "Session guide integration",
  );
  button("Open session GM desk").click();
  await wait(
    () => document.querySelector("[data-desk-panel]"),
    "Session context return",
  );
  expect(
    location.hash === `#/campaign-desk/${f.campaign}/desk/${f.session}`,
    "Session GM desk lost session identity",
  );
  button(
    "Open reference",
    document.querySelector(`[data-desk-pin="${f.hero}"]`),
  ).click();
  await wait(
    () => document.querySelector(".dossier-header h1"),
    "Character reference",
  );
  expect(
    location.hash.endsWith("/" + f.campaign),
    "Campaign character reference lost context",
  );
  location.hash = `/campaign-desk/${f.campaign}/threads/${f.session}`;
  await wait(() => document.querySelector("[data-story-lane]"), "Board");
  expect(
    !document.querySelector(`[data-thread-card="${f.detached}"]`),
    "Board includes cleared campaign membership",
  );
  return {
    legacyMembershipConsistent: true,
    campaignToDeskToSessionAndBack: true,
    originalCharacterDossier: true,
    boardCampaignScope: true,
  };
})();
