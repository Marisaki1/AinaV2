(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaGraphs")),
    checks = [];
  const pause = (ms = 350) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw new Error(m);
    };
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(700);
  };
  const set = async (el, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await pause();
  };
  await go("relationships");
  button("Family & bloodlines").click();
  await pause(500);
  await set(document.querySelector('[aria-label="Family root"]'), f.people.Aoi);
  await set(
    document.querySelector('[aria-label="Family query"]'),
    "descendants",
  );
  expect(
    document.querySelectorAll(".family-explorer [data-node-id]").length > 2,
    "Family diagram absent",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Family query or diagram overflows page",
  );
  button("Family list").click();
  await pause();
  expect(
    document
      .querySelector(".family-result-list")
      ?.textContent.includes("QA Mio"),
    "Accessible family list missing",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Family list overflows",
  );
  checks.push("family controls, diagram, and full-name list fit");
  await go("entry/" + f.tree);
  expect(
    document.querySelector('[aria-label="Parent of QA Lore B"]')?.value ===
      f.lore.D,
    "Reopened hierarchy has wrong parent",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Hierarchy editor overflows",
  );
  document.querySelector(".hierarchy-editor details summary").click();
  await pause();
  expect(
    document.querySelector(".hierarchy-member-choices"),
    "Manual membership missing",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Membership controls overflow",
  );
  button("Hierarchy diagram").click();
  await pause();
  expect(
    document.querySelectorAll(".hierarchy-view [data-node-id]").length === 6,
    "Hierarchy diagram missing selected/tagged nodes",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Hierarchy diagram overflows",
  );
  checks.push("hierarchy controls, membership and diagram fit");
  button("Reader preview").click();
  await pause(500);
  const preview = document.querySelector(".modal .reader-article");
  expect(
    preview?.querySelectorAll(".hierarchy-result-list li").length === 5,
    "Reader list has wrong membership",
  );
  expect(
    !preview.textContent.includes("QA Hidden lore"),
    "Hidden hierarchy entry leaked",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth,
    "Reader preview overflows",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  checks.push("reader hierarchy fits and omits private membership");
  await go("relationships");
  button("Family & bloodlines").click();
  await pause(500);
  await set(document.querySelector('[aria-label="Family root"]'), f.people.Mio);
  await pause();
  const spouse = document.querySelector(
    '.family-explorer [data-edge-kind="spouse"] path',
  );
  expect(
    spouse && !spouse.hasAttribute("marker-end"),
    "Spouse link should be undirected",
  );
  expect(
    document
      .querySelector('.family-explorer [data-edge-kind="parent"] path')
      ?.hasAttribute("marker-end"),
    "Parent link needs a direction",
  );
  window.scrollTo(0, innerWidth < 700 ? 400 : 0);
  return {
    width: innerWidth,
    checks,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})();
