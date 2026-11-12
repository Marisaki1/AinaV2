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
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json()),
    before = await get(f.item),
    originalConfirm = window.confirm;
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const update = await fetch("/api/resources/" + f.item, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: JSON.stringify({
      expected_revision: before.revision,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Temporary item prose to restore" },
            ],
          },
        ],
      },
    }),
  });
  expect(update.ok, "Fixture prose edit");
  location.hash = "/entry/" + f.item;
  await wait(
    () =>
      document
        .querySelector(".tiptap")
        ?.textContent.includes("Temporary item prose"),
    "Item original editor",
  );
  document.querySelector('[aria-label="Revision history"]').click();
  await wait(
    () => document.querySelector(".modal .revision-list"),
    "Item history",
  );
  expect(
    document
      .querySelector(".modal")
      .textContent.includes("keeping current quantities"),
    "Quantity preservation explained",
  );
  const row = [...document.querySelectorAll(".revision-list > div")].find((e) =>
    e.querySelector("strong")?.textContent.trim().startsWith("Revision 2 "),
  );
  expect(row, "Earlier item revision");
  window.confirm = () => true;
  row.querySelector("button").click();
  await wait(() => !document.querySelector(".modal"), "Restore succeeds");
  window.confirm = originalConfirm;
  const after = await get(f.item);
  expect(
    JSON.stringify(after.data.holdings) ===
      JSON.stringify(before.data.holdings),
    "Restoring prose preserves current holdings",
  );
  expect(
    !JSON.stringify(after.document).includes("Temporary item prose"),
    "Original prose restored",
  );
  const value = await fetch(
    `/api/resources/${f.campaign}/continuity?session=${f.session}`,
  ).then((r) => r.json());
  expect(
    value.records.filter((e) => e.data.item_id === f.item).length === 5,
    "Original movement history unchanged",
  );
  return {
    actualHistoryRestore: true,
    currentHoldingsPreserved: true,
    olderProseRestored: true,
    movementRecords: 5,
    sourceUUID: after.id,
  };
})();
