(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaCampaign),
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  for (const id of [f.journal, f.played]) {
    location.hash = "/entry/" + id;
    await pause(650);
    const before = await fetch("/api/resources/" + id).then((r) => r.json());
    const select = [...document.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === "Campaign")
      ?.querySelector("select");
    if (!select || select.value !== f.campaign)
      throw Error("Campaign association missing");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await pause(700);
    const after = await fetch("/api/resources/" + id).then((r) => r.json());
    if (
      after.revision !== before.revision ||
      JSON.stringify(after.data) !== JSON.stringify(before.data)
    )
      throw Error("Same campaign selection changed existing record");
    checks.push(id);
  }
  return { checks, sameCampaignSelectionPreservesSessionLinks: true };
})();
