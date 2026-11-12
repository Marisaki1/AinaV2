(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaSessionGuide),
    pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw Error(m);
  };
  const button = (name, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === name,
    );
  const field = (name) =>
    [...document.querySelectorAll(".modal label.field")]
      .find((l) => l.querySelector("span")?.textContent === name)
      ?.querySelector("input,select,textarea");
  const set = async (el, value) => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await pause();
  };
  const wait = async (test, m) => {
    for (let i = 0; i < 60; i++) {
      if (test()) return;
      await pause();
    }
    throw Error(m);
  };
  const oldFetch = window.fetch,
    oldConfirm = window.confirm;
  try {
    location.hash = "/sessions/" + f.session;
    await wait(
      () => document.querySelector(".session-guide h1"),
      "Session guide",
    );
    button("Edit session plan & outcomes").click();
    await pause();
    const original = field("Preparation (GM only)").value;
    await set(
      field("Preparation (GM only)"),
      original + "\nUnsaved conflict note.",
    );
    window.confirm = () => false;
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await pause();
    expect(
      field("Preparation (GM only)")?.value.includes("Unsaved conflict note"),
      "Escape discarded edits",
    );
    button("Open campaign workspace").click();
    await pause();
    expect(
      location.hash === "#/sessions/" + f.session &&
        !!field("Preparation (GM only)"),
      "Navigation discarded edits",
    );
    window.fetch = async (input, options) => {
      if (
        String(input) === "/api/resources/" + f.session &&
        options?.method === "PATCH"
      )
        return new Response(
          JSON.stringify({
            error:
              "This entry changed in another window. Reload before saving.",
            code: "conflict",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      return oldFetch(input, options);
    };
    button("Save session plan").click();
    await wait(() => button("Reload latest session"), "Conflict action");
    expect(
      field("Preparation (GM only)").value.includes("Unsaved conflict note"),
      "Conflict lost text",
    );
    window.fetch = oldFetch;
    window.confirm = () => true;
    button("Reload latest session").click();
    await wait(
      () => field("Preparation (GM only)")?.value === original,
      "Reload latest plan",
    );
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    button("Write session record").click();
    await pause();
    await set(field("Record title"), "Retryable draft");
    await set(field("Record notes"), "Keep these unsaved words.");
    window.fetch = async (input, options) => {
      if (
        String(input) === `/api/worlds/${f.world}/resources` &&
        options?.method === "POST"
      )
        throw new TypeError("QA simulated offline connection");
      return oldFetch(input, options);
    };
    button("Save session record").click();
    await wait(
      () =>
        document
          .querySelector(".modal .error-box")
          ?.textContent.includes("Cannot reach WorldBuilder"),
      "Offline error",
    );
    expect(
      field("Record notes").value === "Keep these unsaved words.",
      "Failed record save lost text",
    );
    window.fetch = oldFetch;
    button("Cancel", document.querySelector(".modal")).click();
    return {
      discardGuardOnEscapeAndNavigation: true,
      simulatedConflictRetainsText: true,
      reloadLatestPlan: true,
      simulatedOfflineSaveRetainsText: true,
      realServerConflictCoveredByBackend: true,
    };
  } finally {
    window.fetch = oldFetch;
    window.confirm = oldConfirm;
  }
})();
