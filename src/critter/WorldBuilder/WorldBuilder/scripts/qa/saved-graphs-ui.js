(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaSavedGraphs")),
    checks = [];
  const pause = (ms = 170) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw new Error(m);
    };
  const wait = async (test, message) => {
    for (let i = 0; i < 70; i++) {
      if (test()) return;
      await pause(100);
    }
    throw new Error(message);
  };
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(550);
  };
  const button = (text, root = document) =>
    [...(root?.querySelectorAll("button") || [])].find(
      (b) => b.textContent.trim() === text,
    );
  const field = (name, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === name)
      ?.querySelector("input,select");
  const set = async (el, value) => {
    expect(el, "Missing field " + value);
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
  const nodes = () =>
    [
      ...document.querySelectorAll(".saved-relationship-graph [data-node-id]"),
    ].map((n) => n.dataset.nodeId);
  await go("relationships");
  button("Family & bloodlines").click();
  await wait(
    () => document.querySelector(".family-explorer [data-node-id]"),
    "Family did not load",
  );
  await set(document.querySelector('[aria-label="Family root"]'), f.root);
  await set(
    document.querySelector('[aria-label="Family query"]'),
    "descendants",
  );
  await wait(
    () =>
      document.querySelectorAll(".family-explorer [data-node-id]").length === 3,
    "Family root filter wrong",
  );
  button("Save family view").click();
  await wait(
    () => document.querySelector(".modal form"),
    "Save view dialog missing",
  );
  await set(
    field("Relationship view name", document.querySelector(".modal")),
    f.name,
  );
  button("Save view", document.querySelector(".modal")).click();
  await wait(
    () => document.querySelector(".saved-relationship-editor"),
    "Saved view editor missing",
  );
  f.saved = location.hash.split("/").at(-1);
  localStorage.setItem("qaSavedGraphs", JSON.stringify(f));
  let resource = await fetch("/api/resources/" + f.saved).then((r) => r.json());
  expect(
    resource.kind === "relationship" &&
      resource.data.root_id === f.root &&
      resource.visibility === "private",
    "Saved view did not retain filters/private default",
  );
  expect(
    document.querySelector('[aria-label="Saved graph reader preview"]')
      .disabled,
    "Unpublished reader preview should be unavailable",
  );
  checks.push("save current family filters as a named private entry");
  await set(document.querySelector('[aria-label="Graph type"]'), "all");
  await set(field("Relationship view tags"), f.tag);
  await wait(
    () => nodes().length === 3,
    "Tagged network did not filter source nodes",
  );
  document
    .querySelector(".saved-relationship-editor > details summary")
    .click();
  await pause();
  document
    .querySelector('[aria-label="Include connection type friend"]')
    .click();
  await wait(
    () =>
      document.querySelector(".saved-relationship-graph .empty-state") ||
      document.querySelector(".saved-relationship-graph .empty"),
    "Type filter did not remove unrelated edges",
  );
  document
    .querySelector('[aria-label="Include connection type friend"]')
    .click();
  await wait(
    () => nodes().length === 3,
    "Clearing connection type filter did not restore graph",
  );
  checks.push("saved mode, tag and connection-type filtering");
  await go("entry/" + f.other);
  await set(document.querySelector('[aria-label="Entry tags"]'), f.tag);
  for (let i = 0; i < 50; i++) {
    await pause(200);
    resource = await fetch("/api/resources/" + f.other).then((r) => r.json());
    if (resource.tags.includes(f.tag)) break;
  }
  expect(resource.tags.includes(f.tag), "Source tag did not save");
  await go("entry/" + f.saved);
  await wait(
    () => nodes().length === 4,
    "Changing source tag did not update saved membership",
  );
  checks.push("source tag edits update saved graph membership");
  await set(
    field("Visibility", document.querySelector(".entry-details") || document),
    "public",
  );
  for (let i = 0; i < 50; i++) {
    await pause(200);
    resource = await fetch("/api/resources/" + f.saved).then((r) => r.json());
    if (resource.visibility === "public") break;
  }
  expect(resource.visibility === "public", "View visibility did not save");
  button("Save reader version").click();
  await wait(
    () =>
      !document.querySelector('[aria-label="Saved graph reader preview"]')
        .disabled,
    "Reader version did not save",
  );
  document.querySelector('[aria-label="Saved graph reader preview"]').click();
  await wait(
    () => nodes().length === 2,
    "Reader did not use saved source tags and endpoint permissions",
  );
  const visible = document.querySelector(
    ".saved-relationship-graph",
  ).textContent;
  expect(
    !visible.includes("Hidden export keeper") &&
      !visible.includes("Export traveler") &&
      !visible.includes("Do not export motive"),
    "Reader graph leaked hidden/draft data",
  );
  checks.push(
    "saved reader definition and source snapshots filter private entries and draft tags",
  );
  for (const format of ["svg", "html", "json"]) {
    const action = document.querySelector(
      '.saved-relationship-graph [data-export-format="' + format + '"]',
    );
    action.click();
    await pause();
    await wait(() => !action.disabled, "Export action did not finish");
    await pause(350);
    expect(
      !document.querySelector(".graph-export-actions .error-box"),
      "Export action failed",
    );
  }
  checks.push("actual SVG, offline HTML and JSON downloads");
  button("Reader preview").click();
  await wait(
    () =>
      document.querySelector(".modal .saved-relationship-graph [data-node-id]"),
    "Entry reader graph missing",
  );
  expect(
    document.querySelectorAll(".modal .saved-relationship-graph [data-node-id]")
      .length === 2,
    "Entry reader embed membership differs",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  await go("relationships");
  button("Saved views").click();
  await wait(
    () =>
      [...document.querySelectorAll(".saved-graph-library .entry-card")].find(
        (card) => card.querySelector("h3")?.textContent === f.name,
      ),
    "Saved graph library omitted entry",
  );
  [...document.querySelectorAll(".saved-graph-library .entry-card")]
    .find((card) => card.querySelector("h3")?.textContent === f.name)
    .click();
  await wait(
    () => document.querySelector(".saved-relationship-editor"),
    "Saved library entry did not reopen",
  );
  expect(
    document.querySelector('[aria-label="Graph type"]').value === "all" &&
      field("Relationship view tags").value === f.tag,
    "Reopened saved settings differ",
  );
  checks.push("reader entry embed and reopened named view");
  return {
    checks,
    id: f.saved,
    name: f.name,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})();
