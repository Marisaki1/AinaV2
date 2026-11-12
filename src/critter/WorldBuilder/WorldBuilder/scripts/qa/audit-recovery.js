(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAudit),
    pause = (ms = 140) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 90; i++) {
      if (await test()) return;
      await pause(100);
    }
    throw Error(m);
  };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  location.hash = "/entry/" + f.milestone;
  await pause(650);
  const marker = " Latest recovery detail " + Date.now() + ".";
  const editor = document.querySelector(".prose-editor");
  expect(editor, "Milestone editor missing");
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("insertText", false, marker);
  await pause(50);
  expect(
    document.querySelector(".save-state").textContent.includes("Unsaved"),
    "Latest edit was not pending before Trash",
  );
  const oldConfirm = window.confirm;
  try {
    window.confirm = () => true;
    button("Move to Trash").click();
    await wait(() => location.hash === "#/library", "Trash navigation");
  } finally {
    window.confirm = oldConfirm;
  }
  location.hash = "/settings";
  await pause(650);
  const row = [...document.querySelectorAll(".trash-list > div")].find((row) =>
    row.textContent.includes("A promise kept " + f.stamp),
  );
  expect(row, "Trashed milestone missing");
  button("Restore", row).click();
  await wait(
    async () =>
      !(
        await fetch(`/api/worlds/${f.world}/resources?trash=1`).then((r) =>
          r.json(),
        )
      ).resources.some((e) => e.id === f.milestone),
    "Trash restore",
  );
  location.hash = "/entry/" + f.milestone;
  await pause(650);
  const restored = await fetch("/api/resources/" + f.milestone).then((r) =>
    r.json(),
  );
  expect(
    JSON.stringify(restored.document).includes(marker.trim()),
    "Trash recovery lost the latest unsaved note edit",
  );
  expect(
    restored.data.related_entries.includes(f.hero) &&
      restored.data.session_id === f.session,
    "Restored note lost associations",
  );
  location.hash = "/characters/" + f.hero + "/" + f.campaign;
  await pause(650);
  button(
    "Progression",
    document.querySelector('[aria-label="Character dossier sections"]'),
  ).click();
  await pause(150);
  expect(
    document.querySelector(`[data-dossier-record="${f.milestone}"]`),
    "Restored milestone not in dossier",
  );
  return {
    checks: [
      "latest edit was pending immediately before Trash",
      "Trash and restore retained the same milestone ID, latest prose and character/session associations",
      "reopened character progression shows the restored record",
    ],
    id: f.milestone,
  };
})();
