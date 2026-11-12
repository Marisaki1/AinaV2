(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaPlanning),
    pause = (ms = 90) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 75; i++) {
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
  const fetchOriginal = window.fetch,
    confirmOriginal = window.confirm;
  try {
    location.hash = `/campaign-flow/${f.campaign}/planner/${f.session}`;
    await wait(() => button("New scene"), "Planner");
    button("New scene").click();
    await pause();
    await set(field("Planning title"), "Retained planning draft");
    window.confirm = () => false;
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    expect(
      field("Planning title")?.value === "Retained planning draft",
      "Cancel guard",
    );
    button("Campaign workspace").click();
    await pause();
    expect(
      field("Planning title")?.value === "Retained planning draft",
      "Navigation guard",
    );
    window.fetch = async (input, options) =>
      options?.method === "POST" && String(input).endsWith("/resources")
        ? new Response(
            JSON.stringify({
              error: "Injected stale write",
              code: "revision_conflict",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          )
        : fetchOriginal(input, options);
    button("Save planning record").click();
    await wait(
      () =>
        document
          .querySelector(".modal")
          ?.textContent.includes("Injected stale write"),
      "Conflict visible",
    );
    expect(
      field("Planning title").value === "Retained planning draft",
      "Conflict retains draft",
    );
    window.fetch = fetchOriginal;
    window.confirm = () => true;
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    button("Session agenda").click();
    await wait(() => button("Edit session agenda"), "Agenda");
    button("Edit session agenda").click();
    await pause();
    await set(field("Agenda preparation 1"), "Retained agenda preparation");
    window.fetch = async (input, options) =>
      options?.method === "PATCH"
        ? Promise.reject(Error("Injected offline"))
        : fetchOriginal(input, options);
    button("Save agenda").click();
    await wait(
      () =>
        document
          .querySelector(".modal")
          ?.textContent.includes("Cannot reach WorldBuilder"),
      "Agenda error",
    );
    expect(
      field("Agenda preparation 1").value === "Retained agenda preparation",
      "Offline agenda retained",
    );
    window.fetch = fetchOriginal;
    button("Cancel", document.querySelector(".modal")).click();
    await pause();
    button("Review & handoff").click();
    await wait(() => field("Editable session recap"), "Review");
    const saved = field("Editable session recap").value;
    await set(
      field("Editable session recap"),
      saved + "\nRetained recap draft",
    );
    window.fetch = async (input, options) =>
      options?.method === "PATCH"
        ? Promise.reject(Error("Injected offline recap"))
        : fetchOriginal(input, options);
    button("Save recap draft").click();
    await wait(
      () =>
        document
          .querySelector(".session-review")
          ?.textContent.includes("Cannot reach WorldBuilder"),
      "Recap error",
    );
    expect(
      field("Editable session recap").value.endsWith("Retained recap draft"),
      "Offline recap retained",
    );
    window.fetch = fetchOriginal;
    button("Reload saved recap").click();
    await wait(
      () => field("Editable session recap").value === saved,
      "Explicit draft discard",
    );
    return {
      planningConflictRetainsDraft: true,
      cancelAndNavigationGuard: true,
      agendaOfflineRetainsDraft: true,
      recapOfflineRetainsDraft: true,
      explicitReload: true,
    };
  } finally {
    window.fetch = fetchOriginal;
    window.confirm = confirmOriginal;
  }
})();
