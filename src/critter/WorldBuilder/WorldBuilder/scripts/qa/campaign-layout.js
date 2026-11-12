(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaCampaign),
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  location.hash = "/campaigns/" + f.campaign;
  await pause(600);
  for (const name of [
    "Sessions",
    "Day-to-day journal",
    "Notes & tasks",
    "Progression",
    "Characters & places",
    "Maps",
    "Run session",
  ]) {
    button(name, document.querySelector(".campaign-workspace")).click();
    await pause(180);
    if (document.documentElement.scrollWidth > innerWidth + 1)
      throw Error("Campaign page overflow " + name);
    checks.push(name);
  }
  button(
    "Day-to-day journal",
    document.querySelector(".campaign-workspace"),
  ).click();
  await pause(120);
  button("Add journal entry").click();
  await pause(100);
  const trigger = [
    ...document.querySelectorAll(".modal .searchable-select-trigger"),
  ][0];
  trigger.scrollIntoView({ block: "center" });
  trigger.click();
  await pause(120);
  const popup = document.querySelector(".searchable-select-popup"),
    rect = popup.getBoundingClientRect();
  if (
    !document.querySelector(".modal").contains(popup) ||
    rect.left < 0 ||
    rect.right > innerWidth + 1 ||
    rect.bottom > innerHeight + 1 ||
    rect.top < 0
  )
    throw Error("Searchable session picker outside modal/viewport");
  if (document.activeElement !== popup.querySelector("input"))
    throw Error("Session search not focused");
  popup
    .querySelector("input")
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  await pause(60);
  button("Cancel", document.querySelector(".modal")).click();
  button("Sessions", document.querySelector(".campaign-workspace")).click();
  await pause(150);
  return { width: innerWidth, checks, searchableSessionPicker: true };
})();
