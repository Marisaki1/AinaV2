(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaContinuity),
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  // This deliberately removes application preferences/recovery copies, retaining only test fixture IDs.
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith("worldbuilder."),
  );
  keys.forEach((k) => localStorage.removeItem(k));
  const value = await fetch(
    `/api/resources/${f.campaign}/continuity?session=${f.session}`,
  ).then((r) => r.json());
  const item = value.items.find((e) => e.id === f.item);
  expect(item, "Same inventory UUID after restart");
  expect(
    item.data.holdings.reduce((n, h) => n + h.quantity, 0) === 21,
    "Database stock survives without browser cache",
  );
  expect(
    value.records.some((e) => e.id === f.journey) &&
      value.wrapup?.id === f.wrapup,
    "Original notes and wrap-up survive",
  );
  expect(
    value.campaign.data.party_goals === "Follow the silver lanterns",
    "Database campaign state survives",
  );
  location.hash = `/campaign-continuity/${f.campaign}/inventory/${f.session}`;
  for (
    let i = 0;
    i < 85 && !document.querySelector(`[data-equipment-item="${f.item}"]`);
    i++
  )
    await pause(90);
  expect(
    document.querySelector(`[data-equipment-item="${f.item}"]`),
    "Browser renders database inventory",
  );
  return {
    applicationStorageKeysCleared: keys.length,
    sameItemUUID: true,
    inventoryTotal: 21,
    originalJourneyAndWrapupRetained: true,
    campaignStateRetained: true,
  };
})();
