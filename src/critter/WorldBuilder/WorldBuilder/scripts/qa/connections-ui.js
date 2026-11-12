(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaDropdowns")),
    checks = [];
  const pause = (ms = 160) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw new Error(m);
  };
  const wait = async (test, message) => {
    for (let i = 0; i < 100; i++) {
      if (test()) return;
      await pause(100);
    }
    throw new Error(message);
  };
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const field = (label, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === label)
      ?.querySelector("input,select,textarea");
  const set = async (el, value) => {
    expect(el, "Missing input " + value);
    const proto =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  const go = async (route) => {
    location.hash = "/" + route;
    await pause(650);
  };
  const row = () => document.querySelector(`[data-connection-id="${f.edge}"]`);
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  try {
    await go("relationships");
    button("Edit & history").click();
    await pause();
    button("Edit", row()).click();
    await wait(
      () => document.querySelector('.modal[aria-label="Edit connection"]'),
      "Edit form missing",
    );
    await set(
      field("Label (optional)", document.querySelector(".modal")),
      "New allegiance",
    );
    await set(
      field(
        "Directional strength (-100 to 100)",
        document.querySelector(".modal"),
      ),
      75,
    );
    await set(
      field("Relationship notes", document.querySelector(".modal")),
      "Private changed note",
    );
    button("Save connection", document.querySelector(".modal")).click();
    await wait(
      () => !document.querySelector(".modal"),
      "Connection did not save",
    );
    await wait(
      () =>
        row()?.innerText.includes("New allegiance") &&
        row()?.innerText.includes("revision 2"),
      "Edited list did not refresh",
    );
    expect(
      row().innerText.includes("New allegiance") &&
        row().innerText.includes("revision 2"),
      "Edited connection not refreshed",
    );
    button("History", row()).click();
    await wait(
      () =>
        document.querySelectorAll(".connection-history-list details").length ===
        2,
      "History rows missing",
    );
    expect(
      document
        .querySelector(".connection-history-list")
        .innerText.includes("Private changed note"),
      "New note missing from owner history",
    );
    const revision1 = [
      ...document.querySelectorAll(".connection-history-list details"),
    ].find((d) =>
      d.querySelector("summary").textContent.includes("Revision 1"),
    );
    revision1.open = true;
    expect(
      revision1.innerText.includes("Private original note"),
      "Earlier history overwritten",
    );
    button("Restore revision 1", revision1).click();
    await wait(
      () => !document.querySelector(".modal"),
      "Revision restore failed",
    );
    await wait(
      () =>
        row()?.innerText.includes("Old allegiance") &&
        row()?.innerText.includes("revision 3"),
      "Restored list did not refresh",
    );
    expect(
      row().innerText.includes("Old allegiance") &&
        row().innerText.includes("revision 3"),
      "Restored revision lost identity or state",
    );
    checks.push(
      "edit labels/strength/owner notes, immutable history and restore to original connection identity",
    );
    await go("entry/" + f.graph);
    button("Reader preview").click();
    await wait(
      () => document.querySelector(".modal .saved-relationship-graph"),
      "Reader graph missing",
    );
    document.querySelector(".modal .family-connection-details").open = true;
    expect(
      document.querySelector(".modal").innerText.includes("Old allegiance"),
      "Restored connection not reflected in reader graph",
    );
    expect(
      !document
        .querySelector(".modal")
        .innerText.includes("Private original note"),
      "Owner connection history leaked",
    );
    document.querySelector('.modal [aria-label="Close dialog"]').click();
    await pause();
    await go("relationships");
    button("Edit & history").click();
    await pause();
    row().querySelector('[aria-label^="Remove connection"]').click();
    await wait(() => !row(), "Removed connection remained active");
    button("Removed connections").click();
    await wait(() => row(), "Removed connection not recoverable");
    button("Restore", row()).click();
    await wait(() => !row(), "Removed list did not refresh after restore");
    button("Active connections").click();
    await wait(() => row(), "Restored connection missing");
    expect(
      row().innerText.includes("revision 5"),
      "Removal/restore revisions incorrect",
    );
    checks.push(
      "reader graph follows live restored connection without owner notes, soft removal and recovery retain ID/history",
    );
    return { checks, edge: f.edge };
  } finally {
    window.confirm = originalConfirm;
  }
})();
