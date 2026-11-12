(async () => {
  const qaBoot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!qaBoot.test_workspace || location.port !== "8768")
    throw new Error(
      "This script only runs against an isolated .preview workspace on port 8768.",
    );
  if (location.port !== "8768") throw new Error("QA only");
  const field = document.querySelector("#workspace-password");
  if (field) {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(field, "browser-qa-local-only");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 70));
    document.querySelector(".welcome-form form").requestSubmit();
    for (let i = 0; i < 60 && !document.querySelector(".sidebar"); i++)
      await new Promise((r) => setTimeout(r, 200));
  }
  if (!document.querySelector(".sidebar")) throw new Error("QA sign-in failed");
  return { signedIn: true };
})();
