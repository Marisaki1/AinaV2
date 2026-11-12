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
        (b) =>
          b.textContent.trim() === n || b.firstChild?.textContent?.trim() === n,
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
  location.hash = "/notebooks/all/all/all/none";
  for (const id of [f.public, f.original]) {
    await wait(
      () => document.querySelector(`[data-notebook-note="${id}"]`),
      "World notes",
    );
    button(
      "File original",
      document.querySelector(`[data-notebook-note="${id}"]`),
    ).click();
    await wait(() => field("Destination notebook"), "File public source");
    await set(field("Destination notebook"), f.book);
    await set(field("Destination section"), f.section);
    button("File originals").click();
    await wait(() => !document.querySelector(".modal"), "Source filed");
  }
  document.querySelector(`[data-notebook-link="${f.book}"]`).click();
  await wait(() => button("Visual note board"), "Notebook");
  button("Visual note board").click();
  await wait(() => field("Board original to add"), "Visual board");
  const original = await get(f.original);
  for (const card of [...document.querySelectorAll("[data-notebook-card]")]) {
    button("Unpin card", card).click();
    await pause();
  }
  for (const id of [f.original, f.fact]) {
    await set(field("Board original to add"), id);
    button("Add original card").click();
    await pause();
  }
  const cards = [...document.querySelectorAll("[data-notebook-card]")];
  expect(cards.length === 2, "Two source cards");
  f.card = cards[0].dataset.notebookCard;
  const oldX = parseFloat(cards[0].style.left);
  cards[0]
    .querySelector(".notebook-card-handle")
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  await pause();
  expect(
    parseFloat(cards[0].style.left) === oldX + 10,
    "Keyboard card arrangement",
  );
  await set(cards[0].querySelector("textarea"), "Supports our working theory");
  await set(field("Connection from"), cards[0].dataset.notebookCard);
  await set(field("Connection to"), cards[1].dataset.notebookCard);
  await set(field("Board connection label"), "Supports");
  button("Connect original cards").click();
  await pause();
  button("Save visual board").click();
  await wait(
    () =>
      button("Save visual board").disabled &&
      !document.querySelector(".notebook-board fieldset").disabled,
    "Board saved",
  );
  const book = await get(f.book);
  expect(
    book.data.note_board.edges[0].label === "Supports",
    "Labeled connection persisted",
  );
  expect(
    JSON.stringify((await get(f.original)).document) ===
      JSON.stringify(original.document),
    "Board keeps original source prose",
  );
  button("Preview source", cards[0]).click();
  await wait(
    () =>
      document
        .querySelector(".notebook-reference")
        ?.textContent.includes("Original source"),
    "Source preview",
  );
  button("Close reference").click();
  const owner = await fetch(
      `/api/resources/${f.book}/notebook-export?audience=owner`,
    ).then((r) => r.text()),
    reader = await fetch(
      `/api/resources/${f.book}/notebook-export?audience=reader`,
    ).then((r) => r.text());
  expect(
    owner.includes("Confidence") &&
      owner.includes("0.85") &&
      owner.includes("UNPUBLISHED NOTE SECRET"),
    "Private export includes original metadata/draft",
  );
  expect(
    reader.includes("PUBLIC NOTE SOURCE") &&
      !reader.includes("UNPUBLISHED NOTE SECRET") &&
      !reader.includes("Campaign notebook " + f.stamp) &&
      !reader.includes("Confidence"),
    "Published export excludes draft/GM organization/metadata",
  );
  const details = [
    ...document.querySelectorAll(".notebook-navigation details"),
  ].find((d) => d.querySelector("summary")?.textContent === "Export notebook");
  details.open = true;
  [...details.querySelectorAll("a")].forEach((a) => a.click());
  await pause(200);
  document.querySelector(`[data-notebook-link="${f.book}"]`).click();
  await wait(
    () => document.querySelector(`[data-notebook-note="${f.original}"]`),
    "Book notes",
  );
  document
    .querySelector(
      `[data-notebook-note="${f.original}"] input[type="checkbox"]`,
    )
    .click();
  await pause();
  button("Remove selected notebook references").click();
  await wait(
    () => !document.querySelector(`[data-notebook-note="${f.original}"]`),
    "Unfile source",
  );
  expect(
    (await get(f.original)).id === f.original,
    "Unfiling preserves original",
  );
  button(
    "Unfiled inbox",
    document.querySelector(".notebook-navigation"),
  ).click();
  await wait(
    () => document.querySelector(`[data-notebook-note="${f.original}"]`),
    "Original returns to inbox",
  );
  button(
    "Note metadata",
    document.querySelector(`[data-notebook-note="${f.original}"]`),
  ).click();
  await wait(() => field("Note category"), "Question metadata");
  await set(field("Note category"), "question");
  button("Save note metadata").click();
  await wait(() => !document.querySelector(".modal"), "Question saved");
  button(
    "Facts & questions",
    document.querySelector(".notebook-navigation"),
  ).click();
  await wait(
    () => document.querySelector(`[data-notebook-note="${f.original}"]`),
    "Knowledge index",
  );
  button(
    "Note metadata",
    document.querySelector(`[data-notebook-note="${f.original}"]`),
  ).click();
  await wait(() => field("Question status"), "Question resolution");
  await set(field("Question status"), "resolved");
  button("Save note metadata").click();
  await wait(() => !document.querySelector(".modal"), "Question resolved");
  expect(
    (await get(f.original)).data.note_question_status === "resolved",
    "Question state persisted",
  );
  localStorage.qaNotebook = JSON.stringify(f);
  return {
    visualSourceCards: 2,
    keyboardPositions: true,
    labeledConnections: true,
    originalsUnchangedByBoard: true,
    privateExportIncludesMetadata: true,
    publishedExportUsesSnapshot: true,
    downloadRequested: true,
    unfilePreservesOriginal: true,
    inboxRecovery: true,
    knowledgeQuestions: true,
  };
})();
