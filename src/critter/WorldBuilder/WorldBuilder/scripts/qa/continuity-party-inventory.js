(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaContinuity),
    pause = (ms = 75) => new Promise((r) => setTimeout(r, ms)),
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
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json()),
    flow = () =>
      fetch(
        `/api/resources/${f.campaign}/continuity?session=${f.session}`,
      ).then((r) => r.json());
  location.hash = `/campaign-continuity/${f.campaign}/party/${f.session}`;
  await wait(() => button("Edit party & roles"), "Party opens");
  button("Edit party & roles").click();
  await pause();
  await set(field("Current party location"), f.place);
  await set(field("Party goals"), "Follow the silver lanterns");
  await set(field("Party conditions & situation"), "Rested and ready");
  for (const [id, role] of [
    [f.hero, "pc"],
    [f.npc, "companion"],
  ]) {
    const row = await get(id);
    await set(field("Character to configure"), id);
    button("Configure cast member").click();
    await pause();
    await set(field("Role: " + row.title), role);
    await set(field("Goals: " + row.title), "Protect the party");
    await set(field("Conditions: " + row.title), "Uninjured");
  }
  button("Save campaign changes").click();
  await wait(() => !document.querySelector(".modal"), "Party saves");
  await wait(
    () => document.querySelectorAll("[data-party-member]").length === 2,
    "Two cast cards",
  );
  await set(field("Cast role filter"), "companion");
  expect(
    document.querySelectorAll("[data-party-member]").length === 1,
    "Role filter",
  );
  await set(field("Cast role filter"), "all");
  button("Equipment & loot").click();
  await wait(
    () => button("Convert existing equipment (up to 100)"),
    "Existing equipment",
  );
  button("Convert existing equipment (up to 100)").click();
  await wait(
    () => document.querySelectorAll("[data-equipment-item]").length === 1,
    "Legacy conversion",
  );
  let value = await flow();
  f.legacy = value.items.find((e) => e.title.startsWith("Legacy rope")).id;
  expect(
    (await get(f.legacy)).data.legacy_item.notes === "Original shared rope",
    "Legacy notes preserved",
  );
  button("Record & distribute loot").click();
  await pause();
  await set(field("New item name"), "Silver arrows " + f.stamp);
  await set(
    field("New item description"),
    "Arrows received from the shrine keeper",
  );
  await set(field("Movement quantity"), "20");
  await set(field("Movement reason"), "Reward for helping the keeper");
  button("Record loot").click();
  await wait(() => !document.querySelector(".modal"), "Loot recorded");
  await wait(
    () => document.querySelectorAll("[data-equipment-item]").length === 2,
    "New inventory original",
  );
  value = await flow();
  f.item = value.items.find((e) => e.title === "Silver arrows " + f.stamp).id;
  button("Transfer equipment").click();
  await pause();
  await set(field("Equipment item"), f.item);
  await set(field("Movement quantity"), "10");
  await set(field("Recipient / storage"), f.hero);
  button("Commit transfer").click();
  await wait(() => !document.querySelector(".modal"), "Transfer to character");
  button("Transfer equipment").click();
  await pause();
  await set(field("Equipment item"), f.item);
  await set(field("Source holder"), f.hero);
  await set(field("Movement quantity"), "4");
  await set(field("Recipient / storage"), f.storage);
  button("Commit transfer").click();
  await wait(() => !document.querySelector(".modal"), "Transfer to location");
  button("Adjust stock").click();
  await pause();
  await set(field("Equipment item"), f.item);
  await set(field("Adjustment direction"), "remove");
  await set(field("Source holder"), f.storage);
  await set(field("Movement quantity"), "2");
  await set(field("Movement reason"), "Two arrows consumed in training");
  button("Record adjustment").click();
  await wait(() => !document.querySelector(".modal"), "Adjustment");
  button("Record & distribute loot").click();
  await pause();
  await set(field("Equipment item"), f.item);
  await set(field("Movement quantity"), "3");
  await set(field("Recipient / storage"), f.npc);
  button("Record loot").click();
  await wait(
    () => !document.querySelector(".modal"),
    "Existing loot distribution",
  );
  const item = await get(f.item),
    holdings = Object.fromEntries(
      item.data.holdings.map((h) => [h.holder_id, h.quantity]),
    );
  expect(
    holdings.party === 10 &&
      holdings[f.hero] === 6 &&
      holdings[f.storage] === 2 &&
      holdings[f.npc] === 3,
    "Persisted balances",
  );
  value = await flow();
  expect(
    value.records.filter((e) => e.data.item_id === f.item).length === 5,
    "Five movement records",
  );
  expect(
    !item.published_revision && item.visibility === "private",
    "Inventory remains private",
  );
  localStorage.qaContinuity = JSON.stringify(f);
  return {
    partyRoles: true,
    currentLocation: f.place,
    legacyConverted: f.legacy,
    item: f.item,
    holdings,
    movementRecords: 5,
    originalIdentityPreserved: true,
  };
})();
