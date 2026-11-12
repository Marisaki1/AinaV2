(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaCampaign),
    pause = (ms = 160) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  const expect = (v, m) => {
    if (!v) throw Error(m);
  };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  const set = async (el, v) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await pause();
  };
  location.hash = "/campaigns/" + f.campaign;
  await pause(650);
  button("Characters & places").click();
  await pause();
  expect(
    document.querySelectorAll(".campaign-record-card").length === 3,
    "Party, NPC and place should appear",
  );
  button("Link existing entries").click();
  await pause();
  const search = document.querySelector(
    '.modal [aria-label="Search related campaign entries"]',
  );
  await set(search, "Campaign NPC " + f.stamp);
  const checkbox = document.querySelector(
    ".modal .campaign-related-list input[type=checkbox]",
  );
  expect(checkbox?.checked, "Existing NPC link missing");
  checkbox.click();
  button("Save campaign links").click();
  await pause(650);
  expect(
    document.querySelectorAll(".campaign-record-card").length === 2,
    "Unlinked NPC still shown",
  );
  button("Link existing entries").click();
  await pause();
  await set(
    document.querySelector(
      '.modal [aria-label="Search related campaign entries"]',
    ),
    "Campaign NPC " + f.stamp,
  );
  document
    .querySelector(".modal .campaign-related-list input[type=checkbox]")
    .click();
  button("Save campaign links").click();
  await pause(650);
  expect(
    document.querySelectorAll(".campaign-record-card").length === 3,
    "Relinked NPC missing",
  );
  checks.push(
    "party, NPC and place linked without copies; searchable linking and removal persist",
  );
  button("Maps").click();
  await pause();
  expect(
    document.querySelectorAll(".campaign-record-card").length === 1,
    "Campaign map missing",
  );
  button("Open map").click();
  await pause(700);
  expect(
    document.querySelector(".leaflet-image-layer"),
    "Linked map image missing",
  );
  const map = await fetch("/api/resources/" + f.map).then((r) => r.json());
  expect(map.data.markers[0].link_id === f.place, "Map location link changed");
  location.hash = "/entry/" + f.journal;
  await pause(650);
  const campaign = [...document.querySelectorAll("label.field")]
    .find((l) => l.querySelector("span")?.textContent === "Campaign")
    ?.querySelector("select");
  expect(campaign?.value === f.campaign, "Journal campaign editor");
  const related = [...document.querySelectorAll("label.field")]
    .find((l) => l.querySelector("span")?.textContent === "Related session")
    ?.querySelector("select");
  expect(
    related?.value === f.played &&
      !Array.from(related.options).some((o) =>
        o.textContent.includes("Other campaign"),
      ),
    "Session picker scope",
  );
  button("Open campaign workspace").click();
  await pause(650);
  button("Run session", document.querySelector(".campaign-workspace")).click();
  await pause();
  expect(
    getComputedStyle(document.querySelector(".gm-layout")).display !== "none",
    "GM screen not available",
  );
  expect(
    document.querySelector(".party-list").textContent.includes("Campaign hero"),
    "Party lost from GM screen",
  );
  checks.push(
    "linked map opens existing image/location data; journal editor retains campaign/session; original GM screen and party remain available",
  );
  return { checks };
})();
