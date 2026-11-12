(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("Isolated QA installation required.");
  const f = JSON.parse(localStorage.getItem("qaFixtures") || "null");
  const world = f.world;
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, message) => {
    for (let i = 0; i < 70; i++) {
      if (test()) return;
      await pause(60);
    }
    throw new Error(message);
  };
  const csrf = () =>
    decodeURIComponent(
      document.cookie
        .split("; ")
        .find((v) => v.startsWith(boot.csrf_cookie + "="))
        ?.split("=")[1] || "",
    );
  const call = async (path, data) => {
    const response = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
      body: JSON.stringify(data),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(value));
    return value;
  };
  const full = (id) => fetch("/api/resources/" + id).then((r) => r.json());
  const set = (el, value) => {
    if (!el) throw new Error("Input missing");
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const field = (name) =>
    [...document.querySelectorAll("label.field")]
      .find((e) => e.querySelector("span")?.textContent === name)
      ?.querySelector("input");
  const names = {
    root: "QA organizer Lore",
    child: "QA organizer Shrines",
    archive: "QA organizer Archive",
    second: "QA organizer Second",
  };
  const article = await call("/worlds/" + world + "/resources", {
    title: "QA organizer Shrine",
    tags: ["qashrine"],
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "A watchful cedar stands beside the gate." },
          ],
        },
      ],
    },
  });
  const note = await call("/worlds/" + world + "/resources", {
    title: "QA organizer Drag note",
    kind: "note",
  });
  location.hash = "/library";
  await wait(() => button("New collection"), "Library did not open");
  async function create(name) {
    button("New collection").click();
    await wait(() => field("Collection name"), "Collection form missing");
    set(field("Collection name"), name);
    await pause(30);
    document.querySelector("[role=dialog] form").requestSubmit();
    await wait(
      () =>
        !document.querySelector("[role=dialog]") &&
        document.querySelector(".collection-heading h2")?.textContent === name,
      "Collection did not open: " + name,
    );
    return location.hash.split("/").at(-1);
  }
  const root = await create(names.root),
    child = await create(names.child);
  let result = await full(child);
  if (result.parent !== root)
    throw new Error("Nested collection parent was not preserved");
  location.hash = "/library";
  await wait(
    () => document.querySelector('[aria-label="Select QA organizer Shrine"]'),
    "New entry not visible",
  );
  document.querySelector('[aria-label="Select QA organizer Shrine"]').click();
  await pause(40);
  button("Move selected").click();
  await wait(
    () => document.querySelector("[role=dialog] select"),
    "Move dialog missing",
  );
  const destination = document.querySelector("[role=dialog] select");
  destination.value = child;
  destination.dispatchEvent(new Event("change", { bubbles: true }));
  await pause(25);
  button("Move entries").click();
  await wait(
    () => !document.querySelector("[role=dialog]"),
    "Move dialog did not close",
  );
  if ((await full(article.id)).parent !== child)
    throw new Error("Bulk move did not persist");
  const archive = await create(names.archive);
  location.hash = "/library/" + root;
  await wait(
    () =>
      document.querySelector(".collection-heading h2")?.textContent ===
      names.root,
    "Root collection missing",
  );
  button("Move collection").click();
  await wait(
    () => document.querySelector("[role=dialog] select"),
    "Subtree move form missing",
  );
  const target = document.querySelector("[role=dialog] select");
  target.value = archive;
  target.dispatchEvent(new Event("change", { bubbles: true }));
  await pause(25);
  button("Move entries").click();
  await wait(
    () => !document.querySelector("[role=dialog]"),
    "Subtree move did not finish",
  );
  if (
    (await full(child)).parent !== root ||
    (await full(article.id)).parent !== child
  )
    throw new Error("Moving a subtree changed descendant parents");
  location.hash = "/library/" + child;
  await wait(
    () =>
      document
        .querySelector(".collection-breadcrumbs")
        ?.textContent.includes(names.archive),
    "Nested breadcrumbs missing",
  );
  document
    .querySelector('[aria-label="Collapse ' + names.archive + '"]')
    .click();
  await pause(40);
  if (
    [...document.querySelectorAll(".tree-name")].some(
      (e) => e.textContent === names.child,
    )
  )
    throw new Error("Collapsed tree still showed descendants");
  document.querySelector('[aria-label="Expand ' + names.archive + '"]').click();
  location.hash = "/library";
  await wait(
    () =>
      document.querySelector('[aria-label="Select QA organizer Drag note"]'),
    "Drag fixture missing",
  );
  const dragSource = document
    .querySelector('[aria-label="Select QA organizer Drag note"]')
    .closest(".selectable-entry");
  const dropTarget = [
    ...document.querySelectorAll(".collection-tree-row"),
  ].find((e) => e.textContent.trim() === names.archive);
  const transfer = new DataTransfer();
  dragSource.dispatchEvent(
    new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }),
  );
  dropTarget.dispatchEvent(
    new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
  );
  await pause(450);
  if ((await full(note.id)).parent !== archive)
    throw new Error("Drag and drop move did not persist");
  const second = await create(names.second);
  location.hash = "/library";
  await wait(
    () =>
      document.querySelector('[aria-label="Move ' + names.archive + ' later"]'),
    "Reorder control missing",
  );
  document
    .querySelector('[aria-label="Move ' + names.archive + ' later"]')
    .click();
  await pause(450);
  if ((await full(archive)).position <= (await full(second)).position)
    throw new Error("Collection order did not persist");
  const state = {
    world,
    root,
    child,
    archive,
    second,
    article: article.id,
    note: note.id,
    asset: f.asset,
  };
  localStorage.setItem("qaOrganization", JSON.stringify(state));
  location.hash = "/library/" + child;
  await pause(250);
  return {
    nestedCollectionCreation: true,
    bulkMove: true,
    subtreePreserved: true,
    breadcrumbs: true,
    collapseExpand: true,
    dragDrop: true,
    reorder: true,
    fixtures: state,
  };
})();
