(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaPlanning),
    pause = (ms = 75) => new Promise((r) => setTimeout(r, ms)),
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
    );
  const field = (n) =>
    [...document.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === n)
      ?.querySelector("input,textarea,select");
  const set = async (el, v) => {
    expect(el, "Missing field");
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
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
  location.hash = "/entry/" + f.draft;
  await wait(() => document.querySelector(".tiptap"), "Draft editor opens");
  const editor = document.querySelector(".tiptap"),
    textNode = editor.querySelector("p").firstChild;
  editor.focus();
  const range = document.createRange();
  range.setStart(textNode, 8);
  range.collapse(true);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  document.execCommand("insertText", false, "UNSAVED ");
  await pause(50);
  const before = editor.textContent,
    offset = getSelection().anchorOffset;
  const tray = document.querySelector(".reference-tray"),
    toggle = tray.querySelector("button");
  toggle.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
  );
  toggle.click();
  await pause();
  await set(field("Add tray reference"), f.note);
  button("Pin to tray", tray).click();
  await wait(
    () => tray.textContent.includes("silver lanterns point north"),
    "Original reference read",
  );
  expect(
    editor.isConnected && document.querySelector(".tiptap") === editor,
    "Editor remains mounted",
  );
  expect(editor.textContent === before, "Draft text retained");
  button("Fold references " + String.fromCharCode(183) + " 1", tray)?.click();
  if (tray.classList.contains("open")) tray.querySelector("button").click();
  await pause();
  expect(document.activeElement === editor, "Editor focus restored");
  expect(getSelection().anchorOffset === offset, "Cursor restored");
  document.execCommand("insertText", false, "AFTER ");
  await pause();
  expect(
    editor.textContent.includes("UNSAVED AFTER "),
    "Typing resumes at original cursor",
  );
  const state = JSON.parse(
    localStorage.getItem("worldbuilder.reference-tray." + f.world),
  );
  expect(
    state.ids.includes(f.note) && !JSON.stringify(state).includes("lanterns"),
    "Tray stores source IDs only",
  );
  const save = button("Save");
  expect(save, "Explicit save action");
  save.click();
  await wait(
    async () =>
      JSON.stringify(
        (await fetch("/api/resources/" + f.draft).then((r) => r.json()))
          .document,
      ).includes("UNSAVED AFTER "),
    "Draft saved after reference inspection",
  );
  return {
    sameEditor: true,
    draftRetained: true,
    cursorRestored: true,
    typingAtCursor: true,
    sourceIdsOnly: true,
  };
})();
