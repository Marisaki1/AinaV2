(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("Isolated QA installation required.");
  const o = JSON.parse(localStorage.getItem("qaOrganization")),
    f = JSON.parse(localStorage.getItem("qaFixtures"));
  const keeperName = "QA missing keeper " + Date.now().toString(36);
  const initial = await fetch("/api/resources/" + o.article).then((r) =>
    r.json(),
  );
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const reset = await fetch("/api/resources/" + o.article, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: JSON.stringify({
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "A watchful cedar stands beside the gate.",
              },
            ],
          },
        ],
      },
      expected_revision: initial.revision,
    }),
  });
  if (!reset.ok)
    throw new Error("Could not reset the isolated writing fixture.");

  const pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    wait = async (test, message) => {
      for (let n = 0; n < 70; n++) {
        if (test()) return;
        await pause(60);
      }
      throw new Error(message);
    };
  const button = (t) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === t,
    );
  const set = (el, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const full = (id) => fetch("/api/resources/" + id).then((r) => r.json());
  const nodes = (doc, type) => [
    ...(doc.type === type ? [doc] : []),
    ...(doc.content || []).flatMap((child) => nodes(child, type)),
  ];
  const append = (text) => {
    const editor = document.querySelector(".ProseMirror");
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, text);
  };
  location.hash = "/entry/" + o.article;
  await wait(
    () => document.querySelector(".ProseMirror"),
    "Source editor missing",
  );
  append(" A keeper is still missing. ");
  await pause(40);
  document.querySelector('[aria-label="Link an entry"]').click();
  await wait(
    () => document.querySelector('[aria-label="Find an entry to insert"]'),
    "Reference picker missing",
  );
  set(
    document.querySelector('[aria-label="Find an entry to insert"]'),
    keeperName,
  );
  await pause(40);
  button("Create and link").click();
  await wait(
    () =>
      !document.querySelector("[aria-modal=true]") &&
      document.querySelector("a[data-resource-id]"),
    "New article was not linked",
  );
  if (
    !document
      .querySelector(".ProseMirror")
      .textContent.includes("watchful cedar")
  )
    throw new Error("Existing paragraph was lost");
  const link = [
      ...document.querySelectorAll(".ProseMirror a[data-resource-id]"),
    ].find((a) => a.textContent === keeperName),
    created = link.dataset.resourceId;
  link.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  await wait(
    () =>
      document.querySelector(".entry-hover-preview h3")?.textContent ===
      keeperName,
    "Hover preview missing",
  );
  link.click();
  await wait(
    () => document.querySelector(".quick-entry-preview"),
    "Quick preview missing",
  );
  if (location.hash !== "#/entry/" + o.article)
    throw new Error("Quick preview navigated away");
  button("Keep writing").click();
  await pause(90);
  document.querySelector('[aria-label="Insert reusable term"]').click();
  await wait(
    () => document.querySelector('[aria-label="Find an entry to insert"]'),
    "Variable picker missing",
  );
  set(
    document.querySelector('[aria-label="Find an entry to insert"]'),
    "Realm name",
  );
  await pause(60);
  document.querySelector(".reference-insert").click();
  await wait(
    () => !document.querySelector("[aria-modal=true]"),
    "Term insertion failed",
  );
  await pause(1250);
  let saved = await full(o.article);
  if (
    !nodes(saved.document, "resourceLink").some(
      (n) => n.attrs.id === created,
    ) ||
    !nodes(saved.document, "variable").some((n) => n.attrs.id === f.variable)
  )
    throw new Error("Inserted references did not persist");
  const editor = document.querySelector(".ProseMirror");
  editor.focus();
  const pasteRange = document.createRange();
  pasteRange.selectNodeContents(editor);
  pasteRange.collapse(false);
  const pasteSelection = getSelection();
  pasteSelection.removeAllRanges();
  pasteSelection.addRange(pasteRange);
  await pause(80);
  const transfer = new DataTransfer();
  transfer.setData(
    "text/html",
    '<p>Pasted <a data-resource-id="' +
      created +
      '" href="/#/entry/' +
      created +
      '">' +
      keeperName +
      '</a> and <span data-variable-id="' +
      f.variable +
      '">Gensokyo</span>.</p>',
  );
  editor.dispatchEvent(
    new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }),
  );
  await pause(1350);
  saved = await full(o.article);
  if (
    nodes(saved.document, "resourceLink").filter((n) => n.attrs.id === created)
      .length < 2 ||
    nodes(saved.document, "variable").filter((n) => n.attrs.id === f.variable)
      .length < 2
  )
    throw new Error("Pasted stable references lost their IDs");
  if (!saved.html.includes("watchful cedar"))
    throw new Error("Pasting at the caret replaced the existing paragraph.");
  append(" Final unsaved words.");
  await pause(40);
  document
    .querySelector('.ProseMirror a[data-resource-id="' + created + '"]')
    .click();
  await wait(
    () => document.querySelector(".quick-entry-preview"),
    "Second preview missing",
  );
  button("Open entry").click();
  await wait(
    () =>
      location.hash === "#/entry/" + created &&
      document.querySelector(".entry-title")?.value === keeperName,
    "Open entry did not navigate",
  );
  saved = await full(o.article);
  if (!saved.html.includes("Final unsaved words."))
    throw new Error("Opening linked article lost a pending edit");
  const renamed = keeperName + " renamed";
  set(document.querySelector(".entry-title"), renamed);
  await pause(1300);
  const target = await full(created);
  if (!target.backlinks.some((b) => b.id === o.article))
    throw new Error("Backlink to the writing entry was not present");
  saved = await full(o.article);
  if (
    !nodes(saved.document, "resourceLink").some(
      (n) => n.attrs.id === created && n.attrs.label === renamed,
    )
  )
    throw new Error("Target rename did not update linked labels");
  location.hash = "/entry/" + o.article;
  await wait(
    () =>
      document.querySelector(
        '.ProseMirror a[data-resource-id="' + created + '"]',
      ),
    "Renamed mention missing",
  );
  document
    .querySelector('.ProseMirror a[data-resource-id="' + created + '"]')
    .dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  await wait(
    () =>
      document.querySelector(".entry-hover-preview h3")?.textContent ===
      renamed,
    "Cached hover card did not refresh after rename",
  );
  localStorage.setItem("qaLinkedEntry", created);
  return {
    createAndLink: true,
    paragraphPreserved: true,
    hoverPreview: true,
    quickPreviewStayedInEditor: true,
    reusableTerm: true,
    htmlPastePreservedIds: true,
    navigationFlushedPendingEdits: true,
    renameUpdatesMentionsAndPreview: true,
    backlinkPresent: true,
    created,
  };
})();
