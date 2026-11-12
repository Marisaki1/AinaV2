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
  await go("relationships");
  button("Edit & history").click();
  await pause();
  button("Edit", row()).click();
  await pause();
  const before = await fetch(`/api/connections/${f.edge}`).then((r) =>
    r.json(),
  );
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((s) => s.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  await fetch(`/api/connections/${f.edge}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: JSON.stringify({
      expected_revision: before.revision,
      label: "Other tab label",
    }),
  });
  await set(
    field("Label (optional)", document.querySelector(".modal")),
    "Stale label",
  );
  button("Save connection", document.querySelector(".modal")).click();
  await wait(
    () => document.querySelector(".modal .error-box"),
    "Stale edit was not blocked",
  );
  expect(
    field("Label (optional)", document.querySelector(".modal")).value ===
      "Stale label",
    "Stale input was discarded",
  );
  button("Reload current connection", document.querySelector(".modal")).click();
  await wait(
    () =>
      field("Label (optional)", document.querySelector(".modal"))?.value ===
      "Other tab label",
    "Current revision reload failed",
  );
  button("Cancel", document.querySelector(".modal")).click();
  await pause();
  checks.push(
    "stale save rejected, local edits retained and explicit current-version reload works",
  );
  return { checks, edge: f.edge, expected_status: 409 };
})();
