(async () => {
  const qaBoot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!qaBoot.test_workspace || location.port !== "8768")
    throw new Error(
      "This script only runs against an isolated .preview workspace on port 8768.",
    );
  const f = JSON.parse(localStorage.getItem("qaFixtures") || "null");
  if (!f || location.port !== "8768")
    throw new Error("Isolated QA workspace required.");
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  location.hash = "/entry/" + f.note;
  await pause(450);
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const original = await fetch("/api/resources/" + f.note).then((r) =>
    r.json(),
  );
  const remote = await fetch("/api/resources/" + f.note, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: JSON.stringify({
      summary: "Saved in another tab",
      expected_revision: original.revision,
    }),
  });
  if (!remote.ok) throw new Error("Could not simulate another tab");
  const title = document.querySelector(".entry-title");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    title,
    "Local edits worth keeping",
  );
  title.dispatchEvent(new Event("input", { bubbles: true }));
  await pause(1450);
  if (
    !document.querySelector(".entry-error")?.textContent.includes("another tab")
  )
    throw new Error("Conflict warning not displayed");
  const cached = JSON.parse(
    localStorage.getItem("worldbuilder.draft:" + f.note) || "null",
  );
  if (cached?.title !== "Local edits worth keeping")
    throw new Error("Conflicting edits were not retained locally");
  const recover = [...document.querySelectorAll("button")].find((b) =>
    b.textContent.includes("Keep edits as a new entry"),
  );
  if (!recover) throw new Error("Recovery action missing");
  recover.click();
  await pause(700);
  if (
    document.querySelector(".entry-title")?.value !==
    "Local edits worth keeping (recovered copy)"
  )
    throw new Error("Recovered copy was not opened");
  const saved = await fetch("/api/resources/" + f.note).then((r) => r.json());
  if (saved.summary !== "Saved in another tab")
    throw new Error("The newer saved version was overwritten");
  return {
    conflictVisible: true,
    localDraftPreserved: true,
    recoveredCopyCreated: true,
    newerSavedVersionPreserved: true,
    expectedHttpStatus: 409,
  };
})();
