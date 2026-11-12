(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaPlanning),
    pause = (ms = 90) => new Promise((r) => setTimeout(r, ms)),
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
    );
  location.hash = `/campaign-flow/${f.campaign}/handouts/${f.session}`;
  await wait(
    () => document.querySelector(`[data-handout-card="${f.handout}"]`),
    "Handout card",
  );
  button(
    "Preview safe handout",
    document.querySelector(`[data-handout-card="${f.handout}"]`),
  ).click();
  await wait(
    () => document.querySelector(".handout-preview"),
    "Safe preview opens",
  );
  const view = document.querySelector(".handout-preview"),
    text = view.textContent;
  expect(text.includes("PUBLISHED CLUE silver key"), "Published version");
  expect(
    !text.includes("UNPUBLISHED SECRET") &&
      !text.includes("PRIVATE SOURCE") &&
      !text.includes("PRIVATE SECRET"),
    "Secrets excluded",
  );
  expect(
    text.includes("1 unpublished or unavailable"),
    "Omission count without identity",
  );
  expect(
    view.querySelectorAll(".handout-image").length === (f.image ? 1 : 0),
    "Selected image",
  );
  const link = [...view.querySelectorAll("a")].find((a) =>
    a.textContent.includes("Download safe handout"),
  );
  const response = await fetch(link.href),
    html = await response.text();
  expect(
    response.ok &&
      response.headers.get("content-disposition")?.includes("attachment"),
    "Download headers",
  );
  expect(
    html.includes("PUBLISHED CLUE silver key") &&
      !html.includes("UNPUBLISHED SECRET") &&
      !html.includes("PRIVATE SECRET"),
    "Export source privacy",
  );
  if (f.image)
    expect(
      html.includes("data:image/") && !html.includes('src="/media/'),
      "Standalone embedded image",
    );
  link.click();
  await pause(350);
  return {
    previewPublishedOnly: true,
    omittedPrivateSource: true,
    standaloneImages: !!f.image,
    downloadBytes: new Blob([html]).size,
    downloadRequested: true,
  };
})();
