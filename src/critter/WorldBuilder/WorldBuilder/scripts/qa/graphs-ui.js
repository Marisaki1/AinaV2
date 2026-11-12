(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaGraphs")),
    checks = [];
  const pause = (ms = 150) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw new Error(m);
    };
  const wait = async (predicate, message) => {
    for (let i = 0; i < 70; i++) {
      if (predicate()) return;
      await pause(100);
    }
    throw new Error(message);
  };
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const field = (name, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === name)
      ?.querySelector("input,select");
  const set = async (el, value) => {
    expect(el, "Missing input " + value);
    const p =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(p, "value").set.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(500);
  };
  const ids = () =>
    [...document.querySelectorAll(".family-explorer [data-node-id]")].map(
      (n) => n.dataset.nodeId,
    );
  await go("relationships");
  button("Family & bloodlines").click();
  await wait(
    () => document.querySelector(".family-explorer [data-node-id]"),
    "Family did not render",
  );
  await set(document.querySelector('[aria-label="Family root"]'), f.people.Aoi);
  await set(
    document.querySelector('[aria-label="Family query"]'),
    "descendants",
  );
  await wait(
    () => ids().includes(f.people.Yuki) && !ids().includes(f.people.Ren),
    "Descendant query wrong",
  );
  expect(
    !ids().includes(f.people.Unrelated) && !ids().includes(f.people.Rin),
    "Descendants include unrelated or adoptive branch",
  );
  await set(
    document.querySelector('[aria-label="Couple second root"]'),
    f.people.Ren,
  );
  await wait(() => ids().length === 4, "Couple filter did not settle");
  expect(
    ids().includes(f.people.Mio) &&
      ids().includes(f.people.Yuki) &&
      !ids().includes(f.people.Hana),
    "Couple includes another branch",
  );
  expect(new Set(ids()).size === ids().length, "Family duplicated a person");
  await set(document.querySelector('[aria-label="Couple second root"]'), "");
  document.querySelector('[aria-label="Include adoptive parents"]').click();
  await wait(() => ids().includes(f.people.Rin), "Adoptive branch absent");
  await set(document.querySelector('[aria-label="Family depth"]'), 1);
  await wait(() => !ids().includes(f.people.Yuki), "Depth limit did not apply");
  checks.push(
    "ancestor/descendant roots, shared couple descendants, adoption and depth controls",
  );
  await set(document.querySelector('[aria-label="Family depth"]'), 6);
  await set(document.querySelector('[aria-label="Family root"]'), f.people.Mio);
  await set(document.querySelector('[aria-label="Family query"]'), "family");
  button("Family list").click();
  await wait(
    () =>
      document
        .querySelector(".family-result-list")
        ?.textContent.includes("Cousin"),
    "Extended-family labels missing",
  );
  expect(
    document
      .querySelector(".family-result-list")
      .textContent.includes("Grandparent"),
    "Grandparent label missing",
  );
  document.querySelector('[aria-label="Family reader preview"]').click();
  await wait(
    () =>
      !document
        .querySelector(".family-explorer")
        ?.textContent.includes("QA Hidden heir") &&
      !document.querySelector(".family-explorer .page-loading"),
    "Reader view did not filter private endpoint",
  );
  expect(
    !document
      .querySelector(".family-explorer")
      .textContent.includes("GM graph fixture notes"),
    "Relationship notes leaked",
  );
  button("Diagram", document.querySelector(".family-explorer")).click();
  await wait(
    () => document.querySelector(".family-explorer [data-node-id]"),
    "Reader diagram missing",
  );
  document.querySelector('[aria-label="Zoom graph in"]').click();
  await pause();
  expect(
    document.querySelector(".graph-zoom").textContent.includes("125%"),
    "Graph zoom failed",
  );
  checks.push(
    "extended kinship labels, unique diagram nodes, zoom and server-filtered reader view",
  );

  await go("entry/" + f.tree);
  await wait(
    () => document.querySelector('[aria-label="Parent of QA Lore B"]'),
    "Hierarchy editor missing",
  );
  await set(
    document.querySelector('[aria-label="Parent of QA Lore B"]'),
    f.lore.D,
  );
  await wait(
    () =>
      document.querySelector('[aria-label="Parent of QA Lore B"]')?.value ===
        f.lore.D && !document.querySelector(".hierarchy-editor .page-loading"),
    "Hierarchy parent control did not update",
  );
  let saved;
  for (let i = 0; i < 50; i++) {
    await pause(200);
    saved = await fetch("/api/resources/" + f.tree).then((r) => r.json());
    if (saved.data.parents[f.lore.B] === f.lore.D) break;
  }
  expect(
    saved.data.parents[f.lore.B] === f.lore.D &&
      saved.data.parents[f.lore.C] === f.lore.B,
    "Moving a branch lost descendants",
  );
  const parentD = document.querySelector('[aria-label="Parent of QA Lore D"]');
  expect(
    ![...parentD.options].some((o) => o.value === f.lore.C),
    "Parent picker permits a descendant cycle",
  );
  await wait(
    () =>
      document
        .querySelector(".hierarchy-result-list")
        ?.textContent.includes("QA Lore C"),
    "Hierarchy list missing descendant",
  );
  button("Hierarchy diagram").click();
  await wait(
    () => document.querySelector(".hierarchy-view [data-node-id]"),
    "Hierarchy diagram missing",
  );
  expect(
    document.querySelectorAll(".hierarchy-view [data-node-id]").length === 5,
    "Hierarchy diagram has duplicate/missing nodes",
  );
  const d = await fetch("/api/resources/" + f.lore.D).then((r) => r.json());
  expect(d.parent === null, "Hierarchy move changed library collections");
  checks.push(
    "hierarchy subtree reparent, cycle-safe parent choices, independent library parent and diagram",
  );
  const move = document.querySelector('[aria-label="Move QA Lore D earlier"]');
  expect(!move.disabled, "Sibling reorder unavailable");
  move.click();
  for (let i = 0; i < 50; i++) {
    await pause(200);
    saved = await fetch("/api/resources/" + f.tree).then((r) => r.json());
    if (
      saved.data.order?.indexOf(f.lore.D) < saved.data.order?.indexOf(f.lore.A)
    )
      break;
  }
  expect(
    saved.data.order.indexOf(f.lore.D) < saved.data.order.indexOf(f.lore.A),
    "Sibling order did not save",
  );
  await set(
    document.querySelector('[aria-label="Hierarchy membership"]'),
    "both",
  );
  await set(field("Hierarchy tags"), "graph-lore");
  await wait(
    () => document.querySelector('[aria-label="Parent of QA Tagged lore"]'),
    "Tagged entry did not join hierarchy",
  );
  checks.push("persisted sibling ordering and dynamic tag membership");
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((s) => s.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  saved = await fetch("/api/resources/" + f.tree).then((r) => r.json());
  const published = await fetch("/api/resources/" + f.tree + "/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: JSON.stringify({ expected_revision: saved.revision }),
  });
  expect(published.ok, "Could not save reader hierarchy");
  button("Reader preview").click();
  await wait(
    () => document.querySelector(".modal .hierarchy-result-list"),
    "Reader hierarchy missing",
  );
  const preview = document.querySelector(".modal .reader-article");
  expect(
    !preview.textContent.includes("QA Hidden lore") &&
      preview.textContent.includes("QA Tagged lore"),
    "Reader hierarchy does not match grants",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  await go("home");
  await go("entry/" + f.tree);
  await wait(
    () => document.querySelector('[aria-label="Parent of QA Lore B"]'),
    "Reopened hierarchy missing",
  );
  expect(
    document.querySelector('[aria-label="Parent of QA Lore B"]').value ===
      f.lore.D,
    "Reopened hierarchy lost parent",
  );
  checks.push("actual saved reader hierarchy privacy and reopened structure");
  return {
    checks,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})();
