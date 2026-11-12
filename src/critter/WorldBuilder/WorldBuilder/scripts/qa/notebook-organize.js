(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaNotebook),
    pause = (ms = 80) => new Promise((r) => setTimeout(r, ms)),
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
    expect(el, "Field missing " + v);
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
  const get = (id) => fetch("/api/resources/" + id).then((r) => r.json());
  location.hash = `/notebooks/all/${f.book}/${f.section}/${f.note}`;
  await wait(
    () =>
      button("Save selected as template") && document.querySelector(".tiptap"),
    "Original note editor",
  );
  const original = await get(f.note);
  button("Save selected as template").click();
  await wait(() => field("Note template title"), "Template form");
  await set(field("Note template title"), "Investigation template " + f.stamp);
  await set(field("Default note category"), "fact");
  button("Add metadata field").click();
  await pause();
  await set(field("Metadata label 1"), "Confidence");
  await set(field("Metadata type 1"), "number");
  button("Add metadata field").click();
  await pause();
  await set(field("Metadata label 2"), "Witnessed");
  await set(field("Metadata type 2"), "check");
  button("Save note template").click();
  await wait(() => !document.querySelector(".modal"), "Template saved");
  let desk = await fetch(`/api/worlds/${f.world}/notebooks`).then((r) =>
    r.json(),
  );
  f.template = desk.templates.find(
    (e) => e.title === "Investigation template " + f.stamp,
  ).id;
  expect(
    JSON.stringify((await get(f.template)).document) ===
      JSON.stringify(original.document),
    "Rich template copies original without rewrite",
  );
  button("Quick note").click();
  await wait(() => field("Reusable note template"), "Capture form");
  await set(
    field("Quick note title (optional)"),
    "Established lantern fact " + f.stamp,
  );
  await set(field("Reusable note template"), f.template);
  button("Create & write note").click();
  await wait(
    () =>
      location.hash.split("/").at(-1) !== f.note &&
      !document.querySelector(".modal") &&
      document.querySelector(".tiptap"),
    "Template note opens",
  );
  f.fact = location.hash.split("/").at(-1);
  expect(
    JSON.stringify((await get(f.fact)).document) ===
      JSON.stringify(original.document),
    "Created note retains rich template",
  );
  button("Edit selected note metadata").click();
  await wait(() => field("Value: Confidence"), "Typed metadata form");
  await set(field("Value: Confidence"), "0.85");
  const witness = [...document.querySelectorAll(".modal label")].find(
    (l) => l.textContent.trim() === "Witnessed",
  );
  expect(witness, "Checkbox field");
  witness.querySelector("input").click();
  [...document.querySelectorAll(".modal label")]
    .find((l) => l.textContent.includes("Favorite this original"))
    .querySelector("input")
    .click();
  button("Save note metadata").click();
  await wait(() => !document.querySelector(".modal"), "Metadata saved");
  const fact = await get(f.fact);
  expect(
    fact.data.note_starred &&
      Object.values(fact.data.note_values).includes(0.85) &&
      Object.values(fact.data.note_values).includes(true),
    "Typed values persisted",
  );
  expect(
    JSON.stringify(fact.document) === JSON.stringify(original.document),
    "Metadata preserves source prose",
  );
  button("Favorites", document.querySelector(".notebook-navigation")).click();
  await wait(
    () => document.querySelector(`[data-notebook-note="${f.fact}"]`),
    "Favorites contains original",
  );
  await set(field("Search note text, tags & metadata"), "0.85");
  await wait(
    () =>
      document
        .querySelector(`[data-notebook-note="${f.fact}"] .notebook-excerpt`)
        ?.textContent.includes("Confidence"),
    "Metadata match excerpt",
  );
  await set(field("Search note text, tags & metadata"), "");
  button("All notes", document.querySelector(".notebook-navigation")).click();
  await wait(
    () => document.querySelector(`[data-notebook-note="${f.original}"]`),
    "Original source available",
  );
  button(
    "File original",
    document.querySelector(`[data-notebook-note="${f.original}"]`),
  ).click();
  await wait(() => field("Destination notebook"), "File original form");
  await set(field("Destination notebook"), f.book);
  await set(field("Destination section"), f.mysteries);
  button("File originals").click();
  await wait(() => !document.querySelector(".modal"), "Original filed");
  expect(
    (await get(f.original)).revision === 1,
    "Filing leaves original revision unchanged",
  );
  const select = document.querySelector(
    `[data-notebook-note="${f.original}"] input[type="checkbox"]`,
  );
  select.click();
  await pause();
  button("Tag selected").click();
  await wait(() => field("Tags to add"), "Bulk tags form");
  await set(field("Tags to add"), "reviewed, clue");
  button("Add tags to originals").click();
  await wait(() => !document.querySelector(".modal"), "Bulk tags saved");
  expect(
    (await get(f.original)).tags.includes("reviewed"),
    "Tag persisted without copy",
  );
  document.querySelector(`[data-notebook-link="${f.book}"]`).click();
  await wait(() => button("Manage notebook sections"), "Return notebook");
  button("Manage notebook sections").click();
  await wait(() => field("Section parent 2"), "Nested section form");
  await set(field("Section parent 2"), f.section);
  button("Save notebook").click();
  await wait(() => !document.querySelector(".modal"), "Nested sections saved");
  expect(
    (await get(f.book)).data.notebook_sections[1].parent_id === f.section,
    "Section hierarchy persisted",
  );
  localStorage.qaNotebook = JSON.stringify(f);
  return {
    template: f.template,
    fact: f.fact,
    richTemplatePreserved: true,
    typedMetadata: true,
    favorites: true,
    structuredSearchExcerpt: true,
    originalFilingPreservesRevision: true,
    bulkTags: true,
    nestedSections: true,
  };
})();
