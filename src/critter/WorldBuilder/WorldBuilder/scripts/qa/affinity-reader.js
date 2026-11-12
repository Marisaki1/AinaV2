(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAffinity),
    pause = (ms = 150) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  location.hash = "/entry/" + f.board;
  await pause(750);
  const visibility = [...document.querySelectorAll("label.field")]
    .find((l) => l.querySelector("span")?.textContent === "Visibility")
    .querySelector("select");
  Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  ).set.call(visibility, "public");
  visibility.dispatchEvent(new Event("change", { bubbles: true }));
  await pause(150);
  button("Save reader version").click();
  await pause(600);
  button("Reader preview").click();
  for (
    let i = 0;
    i < 85 &&
    document.querySelectorAll(".modal [data-affinity-node]").length !== 7;
    i++
  )
    await pause(100);
  expect(
    document.querySelectorAll(".modal [data-affinity-node]").length === 7,
    "Reader cast filtering",
  );
  expect(
    document.querySelectorAll(".modal [data-affinity-edge]").length === 5,
    "Reader edge filtering",
  );
  document
    .querySelector(`.modal [data-affinity-node="${f.hero}"]`)
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await pause(500);
  const content = document.querySelector(".modal").textContent;
  expect(
    !content.includes("Hidden campaign NPC") &&
      !content.includes("GM secret") &&
      !content.includes("Private reminder") &&
      !content.includes("Affinity field note"),
    "Private chart information leaked",
  );
  expect(
    !document.querySelector(".modal [data-affinity-node] image"),
    "Reader used draft portrait",
  );
  expect(
    !button("Open full entry & notes", document.querySelector(".modal")),
    "Reader inspector opened owner editor",
  );
  const graph = await fetch(
    "/api/resources/" + f.board + "/graph?audience=reader",
  ).then((r) => r.json());
  expect(
    !JSON.stringify(graph).includes(f.secret) &&
      !JSON.stringify(graph).includes("Private reminder"),
    "Reader graph IDs or notes leaked",
  );
  expect(!graph.positions[f.secret], "Private layout key leaked");
  document
    .querySelector(`.modal [data-affinity-node="${f.hero}"]`)
    .dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 200,
      }),
    );
  await pause(150);
  const contextMenu = document.querySelector('[role="menu"]');
  expect(
    contextMenu &&
      !contextMenu.textContent.includes("Open full original") &&
      !contextMenu.textContent.includes("Connect this entry"),
    "Reader menu exposed owner actions",
  );
  contextMenu.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await pause(100);
  expect(
    document.querySelector(".modal") &&
      !document.querySelector('[role="menu"]'),
    "Escape must close only context menu",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  return {
    checks: [
      "published affinity preview retains its layout",
      "private nodes, relationships, GM notes and layout IDs excluded",
      "draft portrait excluded and reader inspector stays in reader view",
    ],
    nodes: graph.nodes.length,
    edges: graph.edges.length,
  };
})();
