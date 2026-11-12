(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaLocation),
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
      ?.querySelector("input,textarea");
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
    for (let i = 0; i < 65; i++) {
      if (await test()) return;
      await pause();
    }
    throw Error(m);
  };
  const oldFetch = window.fetch,
    oldConfirm = window.confirm;
  try {
    location.hash = `/locations/${f.location}/${f.campaign}`;
    await wait(
      () => document.querySelector(".location-guide .dossier-header h1"),
      "Location guide",
    );
    button("Record location milestone").click();
    await pause();
    await set(field("Location record title"), "Draft that must survive");
    await set(field("Location record notes"), "Keep this place-specific text.");
    window.confirm = () => false;
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await pause();
    expect(
      field("Location record notes")?.value ===
        "Keep this place-specific text.",
      "Escape discarded text",
    );
    button("Edit location & lore").click();
    await pause();
    expect(
      location.hash === `#/locations/${f.location}/${f.campaign}`,
      "Navigation discarded text",
    );
    window.fetch = async (input, options) => {
      if (
        String(input) === `/api/worlds/${f.world}/resources` &&
        options?.method === "POST"
      )
        throw new TypeError("QA simulated offline connection");
      return oldFetch(input, options);
    };
    button("Save location record").click();
    await wait(
      () =>
        document
          .querySelector(".modal .error-box")
          ?.textContent.includes("Cannot reach WorldBuilder"),
      "Offline save feedback",
    );
    expect(
      field("Location record notes").value === "Keep this place-specific text.",
      "Failed save lost text",
    );
    window.fetch = oldFetch;
    window.confirm = () => true;
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    button("Record location milestone").click();
    await pause();
    const title = "Saved despite refresh failure " + Date.now();
    await set(field("Location record title"), title);
    await set(
      field("Location record notes"),
      "This write must happen only once.",
    );
    let posted = false;
    window.fetch = async (input, options) => {
      if (
        String(input) === `/api/worlds/${f.world}/resources` &&
        options?.method === "POST"
      ) {
        const r = await oldFetch(input, options);
        posted = r.ok;
        return r;
      }
      if (
        posted &&
        String(input) === `/api/worlds/${f.world}/resources` &&
        !options?.method
      )
        throw new TypeError("QA simulated refresh failure");
      return oldFetch(input, options);
    };
    button("Save location record").click();
    await wait(
      () => !document.querySelector(".modal"),
      "Saved form did not close after refresh error",
    );
    window.fetch = oldFetch;
    const rows = (
      await oldFetch(`/api/worlds/${f.world}/resources`).then((r) => r.json())
    ).resources.filter((e) => e.title === title);
    expect(
      rows.length === 1 &&
        rows[0].data.related_entries.includes(f.location) &&
        rows[0].visibility === "private",
      "Successful write was lost or duplicated",
    );
    f.refreshRecord = rows[0].id;
    localStorage.qaLocation = JSON.stringify(f);
    return {
      discardGuards: true,
      simulatedOfflineRetainsText: true,
      successfulWriteWithSimulatedRefreshFailureSavedOnce: true,
      record: f.refreshRecord,
    };
  } finally {
    window.fetch = oldFetch;
    window.confirm = () => true;
    button("Cancel", document.querySelector(".modal") || document)?.click();
    window.confirm = oldConfirm;
  }
})();
