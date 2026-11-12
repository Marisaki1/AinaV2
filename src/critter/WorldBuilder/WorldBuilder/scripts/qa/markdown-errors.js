(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaInputMedia),
    originalFetch = window.fetch,
    originalConfirm = window.confirm;
  const pause = (ms = 100) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 80; i++) {
      if (await test()) return;
      await pause();
    }
    throw Error(m);
  };
  const before = await fetch("/api/resources/" + f.note).then((r) => r.json());
  location.hash = "/entry/" + f.note;
  await wait(() => document.querySelector(".tiptap"), "Writer");
  document.querySelector('button[aria-label="Insert Markdown"]').click();
  await wait(
    () => document.querySelector(".modal textarea"),
    "Markdown dialog",
  );
  const textarea = document.querySelector(".modal textarea");
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  ).set.call(textarea, "**Pending text stays here**");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await pause();
  window.fetch = async (...args) =>
    String(args[0]).endsWith("/documents/parse")
      ? new Response(JSON.stringify({ error: "Injected parse conflict" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
      : originalFetch(...args);
  [...document.querySelectorAll(".modal button")]
    .find((b) => b.textContent === "Insert Markdown")
    .click();
  await wait(
    () =>
      document
        .querySelector(".modal")
        ?.textContent.includes("Injected parse conflict"),
    "Parse error displayed",
  );
  expect(
    document.querySelector(".modal textarea").value ===
      "**Pending text stays here**",
    "Failure retains Markdown",
  );
  window.confirm = () => false;
  document
    .querySelector(".modal")
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  await pause();
  expect(
    document.querySelector(".modal textarea"),
    "Escape cancellation retains draft",
  );
  const route = location.hash;
  [...document.querySelectorAll(".sidebar button")]
    .find((b) => b.textContent.trim() === "Overview")
    .click();
  await pause();
  expect(
    location.hash === route && document.querySelector(".modal textarea"),
    "Navigation cancellation retains draft",
  );
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented, "Reload warns about Markdown draft");
  const after = await originalFetch("/api/resources/" + f.note).then((r) =>
    r.json(),
  );
  expect(
    JSON.stringify(before.document) === JSON.stringify(after.document),
    "Parse failure does not change saved document",
  );
  window.fetch = originalFetch;
  window.confirm = () => true;
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause();
  window.confirm = originalConfirm;
  return {
    parseFailureRetainsMarkdown: true,
    escapeAndNavigationGuard: true,
    beforeUnloadGuard: true,
    savedOriginalUntouched: true,
  };
})();
