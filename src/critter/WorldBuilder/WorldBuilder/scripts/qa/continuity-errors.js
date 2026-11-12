(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaContinuity),
    pause = (ms = 85) => new Promise((r) => setTimeout(r, ms)),
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
  const button = (n, root = document) =>
      [...root.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === n,
      ),
    field = (n) =>
      [...document.querySelectorAll("label.field")]
        .find((l) => l.querySelector("span")?.textContent === n)
        ?.querySelector("input,textarea,select");
  const set = async (el, v) => {
    expect(el, "Field missing");
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
  const originalFetch = window.fetch,
    originalConfirm = window.confirm;
  const originalItem = await fetch("/api/resources/" + f.item).then((r) =>
    r.json(),
  );
  try {
    location.hash = `/campaign-continuity/${f.campaign}/inventory/${f.session}`;
    await wait(() => button("Transfer equipment"), "Inventory");
    button("Transfer equipment").click();
    await pause();
    await set(field("Equipment item"), f.item);
    await set(field("Recipient / storage"), f.hero);
    await set(field("Movement notes"), "Retained transfer draft");
    window.confirm = () => false;
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await pause();
    expect(
      field("Movement notes")?.value === "Retained transfer draft",
      "Escape guard",
    );
    button("Campaign workspace").click();
    await pause();
    expect(
      field("Movement notes")?.value === "Retained transfer draft",
      "Navigation guard",
    );
    window.fetch = async (input, options) =>
      String(input).includes("/continuity") && options?.method === "POST"
        ? new Response(
            JSON.stringify({
              error: "Injected stale stock",
              code: "revision_conflict",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          )
        : originalFetch(input, options);
    button("Commit transfer").click();
    await wait(
      () =>
        document
          .querySelector(".modal")
          ?.textContent.includes("Injected stale stock"),
      "Conflict shown",
    );
    expect(
      field("Movement notes").value === "Retained transfer draft",
      "Conflict draft retained",
    );
    window.fetch = originalFetch;
    window.confirm = () => true;
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    button("Consequences").click();
    await wait(() => button("Record campaign consequence"), "Consequences");
    button("Record campaign consequence").click();
    await pause();
    await set(field("Continuity record title"), "Retained consequence draft");
    await set(field("Continuity notes"), "Offline notes must remain");
    window.fetch = async (input, options) =>
      options?.method === "POST"
        ? Promise.reject(Error("Injected offline"))
        : originalFetch(input, options);
    button("Save campaign changes").click();
    await wait(
      () =>
        document
          .querySelector(".modal")
          ?.textContent.includes("Cannot reach WorldBuilder"),
      "Offline shown",
    );
    expect(
      field("Continuity notes").value === "Offline notes must remain",
      "Offline note retained",
    );
    window.fetch = originalFetch;
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    const after = await originalFetch("/api/resources/" + f.item).then((r) =>
      r.json(),
    );
    expect(
      after.revision === originalItem.revision &&
        JSON.stringify(after.data.holdings) ===
          JSON.stringify(originalItem.data.holdings),
      "Failed operations leave actual stock unchanged",
    );
    return {
      escapeAndNavigationGuard: true,
      staleTransferRetainsDraft: true,
      offlineConsequenceRetainsDraft: true,
      actualStockUnchanged: true,
    };
  } finally {
    window.fetch = originalFetch;
    window.confirm = originalConfirm;
  }
})();
