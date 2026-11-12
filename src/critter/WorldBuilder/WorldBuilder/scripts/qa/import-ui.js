(async () => {
  const qaBoot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!qaBoot.test_workspace || location.port !== "8768")
    throw new Error(
      "This script only runs against an isolated .preview workspace on port 8768.",
    );
  if (location.port !== "8768") throw new Error("QA only");
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  location.hash = "/import";
  await pause(350);
  const button = (t) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === t,
    );
  button("Preview files").click();
  await pause(650);
  const rows = document.querySelectorAll(".import-table tbody tr");
  if (!rows.length) throw new Error("Existing campaign scan returned no files");
  const boot = await fetch("/api/bootstrap").then((r) => r.json()),
    csrf = decodeURIComponent(
      document.cookie
        .split("; ")
        .find((v) => v.startsWith(boot.csrf_cookie + "="))
        ?.split("=")[1] || "",
    );
  const scan = await fetch("/api/import/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: JSON.stringify({ folders: ["NPC Catalogue"] }),
  }).then((r) => r.json());
  rows[0].querySelector("input").click();
  await pause(50);
  button("Import selected files").click();
  await pause(900);
  if (
    !document
      .querySelector(".success-panel")
      ?.textContent.includes("entries created")
  )
    throw new Error("Copy import did not report success");
  const after = await fetch("/api/import/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: JSON.stringify({ folders: ["NPC Catalogue"] }),
  }).then((r) => r.json());
  for (const row of scan.files) {
    if (after.files.find((f) => f.path === row.path)?.digest !== row.digest)
      throw new Error("Original campaign file changed");
  }
  return {
    realCampaignPreview: true,
    selectedFileCopied: true,
    sourceFilesUnchanged: scan.files.length,
  };
})();
