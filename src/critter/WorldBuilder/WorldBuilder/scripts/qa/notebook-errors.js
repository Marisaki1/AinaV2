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
    expect(el, "Missing field");
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await pause();
  };
  const originalFetch = window.fetch,
    originalConfirm = window.confirm;
  try {
    location.hash = `/notebooks/all/${f.book}/${f.section}/none`;
    await wait(() => button("Quick note"), "Notebook");
    button("Quick note").click();
    await wait(() => field("Quick note text"), "Capture");
    await set(field("Quick note title (optional)"), "Retained note draft");
    await set(field("Quick note text"), "Do not lose this capture");
    window.confirm = () => false;
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await pause();
    expect(
      field("Quick note text")?.value === "Do not lose this capture",
      "Capture escape guard",
    );
    window.fetch = async (input, options) =>
      String(input).includes("/notebooks") && options?.method === "POST"
        ? new Response(
            JSON.stringify({
              error: "Injected capture conflict",
              code: "revision_conflict",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          )
        : originalFetch(input, options);
    button("Create & write note").click();
    await wait(
      () =>
        document
          .querySelector(".modal")
          ?.textContent.includes("Injected capture conflict"),
      "Capture conflict",
    );
    expect(
      field("Quick note text").value === "Do not lose this capture",
      "Conflict retains draft",
    );
    window.fetch = originalFetch;
    window.confirm = () => true;
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    button("New notebook").click();
    await wait(() => field("Notebook title"), "Book form");
    await set(field("Notebook title"), "Retained notebook draft");
    window.fetch = async (input, options) =>
      options?.method === "POST"
        ? Promise.reject(Error("offline"))
        : originalFetch(input, options);
    button("Save notebook").click();
    await wait(
      () =>
        document
          .querySelector(".modal")
          ?.textContent.includes("Cannot reach WorldBuilder"),
      "Offline notebook",
    );
    expect(
      field("Notebook title").value === "Retained notebook draft",
      "Offline book draft",
    );
    window.fetch = originalFetch;
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    button("Visual note board").click();
    await wait(() => button("Reload saved board"), "Board ready");
    const card = document.querySelector("[data-notebook-card]");
    await set(
      card.querySelector("textarea"),
      "Retained visual board annotation",
    );
    window.confirm = () => false;
    button("All notes", document.querySelector(".notebook-navigation")).click();
    await pause();
    expect(document.querySelector(".notebook-board"), "Board navigation guard");
    window.fetch = async (input, options) =>
      options?.method === "POST"
        ? new Response(
            JSON.stringify({
              error: "Injected board conflict",
              code: "revision_conflict",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          )
        : originalFetch(input, options);
    button("Save visual board").click();
    await wait(
      () =>
        document
          .querySelector(".notebook-board")
          .textContent.includes("Injected board conflict"),
      "Board conflict",
    );
    expect(
      card.querySelector("textarea").value ===
        "Retained visual board annotation",
      "Board conflict retains draft",
    );
    window.fetch = originalFetch;
    window.confirm = () => true;
    button("Reload saved board").click();
    await wait(
      () =>
        document.querySelector("[data-notebook-card] textarea").value !==
        "Retained visual board annotation",
      "Explicit board reload",
    );
    return {
      captureEscapeGuard: true,
      captureConflictKeepsText: true,
      offlineNotebookKeepsText: true,
      boardNavigationAndConflictKeepDraft: true,
      explicitReload: true,
    };
  } finally {
    window.fetch = originalFetch;
    window.confirm = originalConfirm;
  }
})();
