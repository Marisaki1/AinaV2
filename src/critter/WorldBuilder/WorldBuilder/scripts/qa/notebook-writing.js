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
    expect(el, "Missing field " + v);
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
  location.hash = "/notebooks";
  await wait(() => button("New notebook"), "Notebook hub");
  button("New notebook").click();
  await pause();
  await set(field("Notebook title"), "Campaign notebook " + f.stamp);
  await set(field("Section title 1"), "Session notes");
  button("Add notebook section").click();
  await pause();
  await set(field("Section title 2"), "Mysteries");
  button("Save notebook").click();
  await wait(() => !document.querySelector(".modal"), "Book saved");
  const data = await fetch(`/api/worlds/${f.world}/notebooks`).then((r) =>
    r.json(),
  );
  f.book = data.books.find(
    (e) => e.title === "Campaign notebook " + f.stamp,
  ).id;
  const book = await get(f.book);
  f.section = book.data.notebook_sections[0].id;
  f.mysteries = book.data.notebook_sections[1].id;
  await wait(
    () => document.querySelector(`[data-notebook-link="${f.book}"]`),
    "Notebook navigation",
  );
  document.querySelector(`[data-notebook-link="${f.book}"]`).click();
  await wait(() => button("Manage notebook sections"), "Book opens");
  button("Quick note").click();
  await pause();
  await set(field("Quick note title (optional)"), "Lantern session " + f.stamp);
  await set(field("Quick note text"), "The party found the silver lantern.");
  await set(field("Note preset"), "session");
  button("Create & write note").click();
  await wait(
    () => document.querySelector(".notebook-editor .tiptap"),
    "In-place editor",
  );
  f.note = location.hash.split("/").at(-1);
  expect(
    (await get(f.note)).visibility === "private",
    "Private captured original",
  );
  expect(
    (await get(f.book)).data.notebook_sections[0].entry_ids.includes(f.note),
    "Filed original",
  );
  const editor = document.querySelector(".notebook-editor .tiptap");
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  document.execCommand("insertText", false, " Unsaved investigation detail");
  await pause();
  // Change only the list search; the current editor must remain mounted.
  await set(field("Search note text, tags & metadata"), "nothing matches this");
  expect(
    document.querySelector(".notebook-editor .tiptap") === editor &&
      editor.textContent.includes("Unsaved investigation detail"),
    "Search preserves active draft",
  );
  await set(field("Search note text, tags & metadata"), "");
  button("Save", document.querySelector(".notebook-editor")).click();
  await wait(
    async () =>
      JSON.stringify((await get(f.note)).document).includes(
        "Unsaved investigation detail",
      ),
    "Saved original rich text",
  );
  button("All notes", document.querySelector(".notebook-navigation")).click();
  await wait(
    () => document.querySelector(`[data-notebook-note="${f.original}"]`),
    "World notes list",
  );
  expect(
    document.querySelector(".notebook-editor .tiptap") === editor,
    "Scope change preserves editor identity",
  );
  editor.focus();
  const end = document.createRange();
  end.selectNodeContents(editor);
  end.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(end);
  document.execCommand("insertText", false, " BEFORE_REFERENCE ");
  const before = editor.textContent,
    offset = getSelection().anchorOffset;
  const preview = button(
    "Preview beside draft",
    document.querySelector(`[data-notebook-note="${f.original}"]`),
  );
  preview.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
  );
  preview.click();
  await wait(
    () =>
      document
        .querySelector(".notebook-reference")
        ?.textContent.includes("silver lantern marks"),
    "Original side reference",
  );
  expect(
    document.querySelector(".notebook-editor .tiptap") === editor &&
      editor.textContent === before,
    "Reference keeps draft",
  );
  button("Close reference").click();
  await pause();
  expect(
    document.activeElement === editor && getSelection().anchorOffset === offset,
    "Reference restores cursor",
  );
  document.execCommand("insertText", false, "AFTER_REFERENCE");
  expect(
    editor.textContent.includes("BEFORE_REFERENCE AFTER_REFERENCE"),
    "Typing resumes at cursor",
  );
  button("Save", document.querySelector(".notebook-editor")).click();
  await wait(
    async () =>
      JSON.stringify((await get(f.note)).document).includes("AFTER_REFERENCE"),
    "Resumed text saved",
  );
  localStorage.qaNotebook = JSON.stringify(f);
  return {
    book: f.book,
    note: f.note,
    sections: 2,
    privateCapture: true,
    originalFiled: true,
    sameEditorDuringSearchAndReference: true,
    cursorRestored: true,
    richTextSaved: true,
  };
})();
