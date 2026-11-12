(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaContinuity),
    pause = (ms = 85) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 85; i++) {
      if (await test()) return;
      await pause();
    }
    throw Error(m);
  };
  const button = (n, root = document) =>
      [...root.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === n,
      ),
    field = (n) =>
      [...document.querySelectorAll("label.field")]
        .find((l) => l.querySelector("span")?.textContent === n)
        ?.querySelector("input,textarea,select");
  const set = async (el, v) => {
    expect(el, "Missing field");
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    ).set.call(el, v);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await pause();
  };
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json()),
    list = () =>
      fetch(`/api/worlds/${f.world}/resources`).then((r) => r.json());
  const original = await get(f.npc),
    before = (await list()).resources.length;
  location.hash = `/campaign-continuity/${f.campaign}/party/${f.session}`;
  await wait(() => button("Edit party & roles"), "Party");
  for (const role of ["npc", "pc", "companion"]) {
    button("Edit party & roles").click();
    await pause();
    await set(field("Role: " + original.title), role);
    button("Save campaign changes").click();
    await wait(() => !document.querySelector(".modal"), "Role saves");
    await wait(
      async () =>
        (await get(f.campaign)).data.party_profiles.find(
          (p) => p.entry_id === f.npc,
        ).role === role,
      "Role persisted",
    );
    await pause(120);
    const campaign = await get(f.campaign);
    expect(
      campaign.data.party.includes(f.npc) === (role !== "npc"),
      "Role updates actual party membership",
    );
  }
  const after = await get(f.npc);
  expect(
    JSON.stringify(after.document) === JSON.stringify(original.document) &&
      after.id === original.id &&
      (await list()).resources.length === before,
    "Promotion preserves source lore and creates no duplicate",
  );
  location.hash = "/campaigns/" + f.campaign;
  await wait(() => button("Run session"), "Original GM screen");
  button("Run session").click();
  await pause();
  await wait(
    () => document.querySelector(`[data-gm-equipment="${f.item}"]`),
    "Tracked inventory in original GM screen",
  );
  expect(
    getComputedStyle(document.querySelector(".gm-layout")).display !== "none",
    "GM screen visible",
  );
  expect(
    document.querySelector(".party-list").textContent.includes(original.title),
    "Party promotion reflected on GM screen",
  );
  expect(
    document
      .querySelector(`[data-gm-equipment="${f.item}"]`)
      .textContent.includes("Party storage: 10"),
    "GM stock uses same database balance",
  );
  button("Equipment, loot & transfers").click();
  await wait(
    () => document.querySelector('[data-continuity-view="inventory"]'),
    "GM screen opens inventory workflow",
  );
  return {
    npcPromotionPreservesUUIDAndLore: true,
    noDuplicateResources: true,
    pcNpcCompanionMembershipConsistent: true,
    originalGMPartyUpdated: true,
    originalGMEquipmentUsesSameBalances: true,
  };
})();
