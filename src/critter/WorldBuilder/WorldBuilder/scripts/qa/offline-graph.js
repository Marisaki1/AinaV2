(async () => {
  const path = decodeURIComponent(location.pathname).replaceAll("\\", "/");
  if (
    location.protocol !== "file:" ||
    !path.includes("/.preview/graph-downloads/")
  )
    throw new Error("Isolated downloaded graph required");
  const expect = (v, m) => {
      if (!v) throw new Error(m);
    },
    pause = () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  expect(
    document.querySelector("#find-status")?.textContent ===
      "2 matching entries",
    "Offline script did not initialize",
  );
  expect(
    document.querySelectorAll("[data-node]").length === 2,
    "Offline SVG membership differs",
  );
  expect(
    document.querySelectorAll("[data-node-entry]").length === 2,
    "Offline full-name list differs",
  );
  document.querySelector("#zoom-in").click();
  await pause();
  expect(
    document.querySelector("#zoom-value").textContent === "125%",
    "Offline zoom failed",
  );
  const search = document.querySelector("#find-node");
  search.value = "Export child";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await pause();
  expect(
    document.querySelectorAll("[data-node-entry]:not([hidden])").length === 1 &&
      document.querySelector("#find-status").textContent ===
        "1 matching entries",
    "Offline search failed",
  );
  search.value = "";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#zoom-reset").click();
  await pause();
  expect(
    document.querySelector("#zoom-value").textContent === "100%",
    "Offline reset failed",
  );
  expect(
    !document.body.textContent.includes("Hidden export keeper") &&
      !document.body.textContent.includes("Do not export motive"),
    "Offline reader file contains private details",
  );
  expect(
    [...document.querySelectorAll("[href]")].every((n) =>
      n.getAttribute("href").startsWith("#"),
    ),
    "Offline graph has a remote link",
  );
  expect(
    !performance
      .getEntriesByType("resource")
      .some((r) => /^https?:/.test(r.name)),
    "Offline graph requested network assets",
  );
  return {
    checks: [
      "downloaded HTML opens as a local file",
      "offline zoom, reset and search work",
      "SVG and list preserve two reader entries",
      "private content excluded; no HTTP resources requested",
    ],
  };
})();
