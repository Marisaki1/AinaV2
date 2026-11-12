(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaWorkbench),
    pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 80; i++) {
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
    [...document.querySelectorAll(".modal label.field")]
      .find((l) => l.querySelector("span")?.textContent === n)
      ?.querySelector("input,textarea");
  const set = async (el, v) => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await pause(70);
  };
  const originalFetch = window.fetch,
    originalConfirm = window.confirm;
  try {
    location.hash = `/campaign-desk/${f.campaign}/desk/${f.session}`;
    await wait(
      () => button("Configure desk") && !button("Configure desk").disabled,
      "Desk",
    );
    button("Configure desk").click();
    await pause();
    await set(field("Desk layout name"), "Retain unsaved layout draft");
    window.confirm = () => false;
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await pause();
    expect(
      field("Desk layout name")?.value === "Retain unsaved layout draft",
      "Escape lost layout",
    );
    button("Campaign workspace").click();
    await pause();
    expect(
      location.hash === `#/campaign-desk/${f.campaign}/desk/${f.session}`,
      "Navigation lost layout",
    );
    window.fetch = async (input, options) =>
      String(input) === `/api/resources/${f.campaign}` &&
      options?.method === "PATCH"
        ? new Response(
            JSON.stringify({
              error: "QA simulated stale layout",
              code: "revision_conflict",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          )
        : originalFetch(input, options);
    button("Save desk layout").click();
    await wait(
      () => document.querySelector(".modal .error-box"),
      "Layout conflict feedback",
    );
    expect(
      field("Desk layout name").value === "Retain unsaved layout draft",
      "Conflict lost layout",
    );
    window.fetch = originalFetch;
    window.confirm = () => true;
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    button("Quick capture").click();
    await pause();
    await set(field("Capture title"), "Offline draft");
    await set(field("Capture notes"), "Keep all of this unsaved note.");
    window.fetch = async (input, options) => {
      if (
        String(input) === `/api/worlds/${f.world}/resources` &&
        options?.method === "POST"
      )
        throw new TypeError("QA simulated offline");
      return originalFetch(input, options);
    };
    button("Save capture").click();
    await wait(
      () =>
        document
          .querySelector(".modal .error-box")
          ?.textContent.includes("Cannot reach"),
      "Offline feedback",
    );
    expect(
      field("Capture notes").value === "Keep all of this unsaved note.",
      "Offline lost capture",
    );
    window.fetch = originalFetch;
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    button("Quick capture").click();
    await pause();
    const title = "Saved once after refresh failure " + Date.now();
    await set(field("Capture title"), title);
    await set(field("Capture notes"), "Saved original note, not a duplicate.");
    let posted = false;
    window.fetch = async (input, options) => {
      if (
        String(input) === `/api/worlds/${f.world}/resources` &&
        options?.method === "POST"
      ) {
        const r = await originalFetch(input, options);
        posted = r.ok;
        return r;
      }
      if (
        posted &&
        String(input) === `/api/worlds/${f.world}/resources` &&
        !options?.method
      )
        throw new TypeError("QA refresh failure");
      return originalFetch(input, options);
    };
    button("Save capture").click();
    await wait(
      () => !document.querySelector(".modal"),
      "Saved capture did not close",
    );
    window.fetch = originalFetch;
    const rows = (
      await originalFetch(`/api/worlds/${f.world}/resources`).then((r) =>
        r.json(),
      )
    ).resources.filter((e) => e.title === title);
    expect(rows.length === 1, "Refresh failure duplicated or lost note");
    f.refreshNote = rows[0].id;
    location.hash = "/threads/" + f.quest;
    await wait(
      () => document.querySelector(".thread-guide h1"),
      "Thread guide",
    );
    button("Edit objectives & outcome").click();
    await pause();
    await set(field("Outcome & discoveries"), "Unsaved thread conflict draft");
    window.fetch = async (input, options) =>
      String(input) === `/api/resources/${f.quest}` &&
      options?.method === "PATCH"
        ? new Response(
            JSON.stringify({
              error: "QA simulated thread conflict",
              code: "revision_conflict",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          )
        : originalFetch(input, options);
    button("Save thread changes").click();
    await wait(
      () => document.querySelector(".modal .error-box"),
      "Thread conflict",
    );
    expect(
      field("Outcome & discoveries").value === "Unsaved thread conflict draft",
      "Conflict lost thread data",
    );
    window.fetch = originalFetch;
    button("Cancel", document.querySelector(".modal")).click();
    localStorage.qaWorkbench = JSON.stringify(f);
    return {
      layoutDiscardAndNavigationGuards: true,
      simulatedLayoutConflictRetainsDraft: true,
      simulatedOfflineCaptureRetainsText: true,
      successfulWriteWithSimulatedRefreshFailureSavedOnce: true,
      simulatedThreadConflictRetainsDraft: true,
    };
  } finally {
    window.fetch = originalFetch;
    window.confirm = () => true;
    for (let i = 0; i < 3 && document.querySelector(".modal"); i++) {
      button("Cancel", document.querySelector(".modal"))?.click();
      await pause();
    }
    window.confirm = originalConfirm;
  }
})();
