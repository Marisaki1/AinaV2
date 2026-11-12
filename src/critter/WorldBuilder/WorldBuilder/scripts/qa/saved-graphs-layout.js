(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaSavedGraphs")),
    hierarchy = JSON.parse(localStorage.getItem("qaGraphs"));
  const pause = (ms = 350) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw new Error(m);
    };
  location.hash = "/entry/" + f.saved;
  await pause(800);
  expect(
    document.querySelectorAll(".saved-relationship-graph [data-node-id]")
      .length === 4,
    "Saved owner graph missing",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Saved editor overflows page",
  );
  document.querySelector('[aria-label="Saved graph reader preview"]').click();
  await pause(600);
  expect(
    document.querySelectorAll(".saved-relationship-graph [data-node-id]")
      .length === 2,
    "Reader graph missing",
  );
  expect(
    document.querySelectorAll(".graph-export-actions button").length === 3,
    "Export controls missing",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Reader graph or export controls overflow",
  );
  const graph = await fetch(
      "/api/resources/" + f.saved + "/graph?audience=reader",
    ).then((r) => r.json()),
    exported = await fetch(
      "/api/resources/" + f.saved + "/graph-export?format=json&audience=reader",
    ).then((r) => r.json());
  expect(
    JSON.stringify(graph.nodes.map((n) => n.id).sort()) ===
      JSON.stringify(exported.nodes.map((n) => n.id).sort()),
    "Relationship export membership differs",
  );
  const tree = await fetch(
      "/api/resources/" + hierarchy.tree + "/hierarchy?audience=reader",
    ).then((r) => r.json()),
    svg = await fetch(
      "/api/resources/" +
        hierarchy.tree +
        "/graph-export?format=svg&audience=reader",
    ).then((r) => r.text()),
    xml = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(!xml.querySelector("parsererror"), "Hierarchy SVG is malformed");
  expect(
    JSON.stringify(
      [...xml.querySelectorAll("[data-node]")]
        .map((n) => n.getAttribute("data-node"))
        .sort(),
    ) === JSON.stringify(tree.nodes.map((n) => n.id).sort()),
    "Hierarchy export/list membership differs",
  );
  location.hash = "/relationships";
  await pause(600);
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent.trim() === "Saved views")
    .click();
  await pause();
  expect(
    [...document.querySelectorAll(".saved-graph-library h3")].some(
      (e) => e.textContent === f.name,
    ),
    "Saved view missing from library",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Saved library overflows",
  );
  location.hash = "/entry/" + f.saved;
  await pause(700);
  document.querySelector('[aria-label="Saved graph reader preview"]').click();
  await pause(500);
  window.scrollTo(
    0,
    Math.max(
      0,
      document
        .querySelector(".saved-relationship-graph")
        .getBoundingClientRect().top +
        scrollY -
        90,
    ),
  );
  return {
    width: innerWidth,
    checks: [
      "saved editor, reader graph and export controls fit",
      "relationship JSON and hierarchy SVG match their displayed node sets",
      "saved library reopens named entries",
    ],
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})();
