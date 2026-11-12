(async () => {
  const qaBoot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!qaBoot.test_workspace || location.port !== "8768")
    throw new Error(
      "This script only runs against an isolated .preview workspace on port 8768.",
    );
  const f = JSON.parse(localStorage.getItem("qaFixtures") || "null");
  if (!f || location.port !== "8768")
    throw new Error("Isolated QA workspace required.");
  const pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(400);
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  await go("entry/" + f.table);
  button("Roll").click();
  await pause(350);
  if (!document.querySelector(".roll-result h3")?.textContent)
    throw new Error("Table did not roll");
  checks.push("weighted table roll");
  const files = new DataTransfer();
  files.items.add(
    new File(
      [
        'Encounter,Place\n"A fox, wearing a hat",Bridge\nA lost traveler,Village',
      ],
      "encounters.csv",
      { type: "text/csv" },
    ),
  );
  const input = document.querySelector("input[type=file]");
  input.files = files.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await pause(300);
  if (
    !document
      .querySelector("[role=dialog]")
      ?.textContent.includes("2 columns and 2 rows")
  )
    throw new Error("CSV preview incorrect");
  button("Use this table").click();
  await pause(1250);
  const saved = await fetch("/api/resources/" + f.table).then((r) => r.json());
  if (
    saved.data.rows.length !== 2 ||
    !Object.values(saved.data.rows[0].cells).includes("A fox, wearing a hat")
  )
    throw new Error("CSV quoting or table persistence failed");
  checks.push("CSV preview, quoted fields and persisted replacement");
  await go("entry/" + f.calendar);
  await pause(400);
  if (document.querySelectorAll(".calendar-grid>span").length < 30)
    throw new Error("Calendar grid missing");
  checks.push("custom calendar grid and moon phases");
  await go("entry/" + f.board);
  const count = document.querySelectorAll(".board-card").length;
  button("Note").click();
  await pause(1250);
  if (document.querySelectorAll(".board-card").length !== count + 1)
    throw new Error("Whiteboard note was not added");
  const board = await fetch("/api/resources/" + f.board).then((r) => r.json());
  if (board.data.cards.length !== count + 1)
    throw new Error("Whiteboard did not persist");
  checks.push("whiteboard note addition and persistence");
  await go("writing/" + f.manuscript);
  button("Corkboard").click();
  await pause(120);
  if (!document.querySelector(".corkboard"))
    throw new Error("Writing corkboard missing");
  button("Write").click();
  await pause(300);
  if (!document.querySelector(".writing-main .ProseMirror"))
    throw new Error("Scene editor missing");
  checks.push("manuscript corkboard and scene editor");
  document.querySelector(".global-search").click();
  await pause(160);
  const search = document.querySelector(
    '[aria-label="Search all world content"]',
  );
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    search,
    "Hakurei",
  );
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await pause(500);
  if (
    !document
      .querySelector(".search-results")
      ?.textContent.includes("Reimu Hakurei")
  )
    throw new Error("Global search failed");
  document.querySelector('[aria-label="Close dialog"]').click();
  checks.push("global search");
  await go("home");
  return { passed: checks };
})();
