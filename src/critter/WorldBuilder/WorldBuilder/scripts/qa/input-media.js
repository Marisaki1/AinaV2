(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaAffinity),
    pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
  const expect = (v, m) => {
    if (!v) throw Error(m);
  };
  const wait = async (test, m) => {
    for (let i = 0; i < 100; i++) {
      if (await test()) return;
      await pause();
    }
    throw Error(m);
  };
  const button = (label, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) =>
        b.textContent.trim() === label ||
        b.getAttribute("aria-label") === label,
    );
  const field = (label, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === label)
      ?.querySelector("input,textarea");
  const set = (element, value) => {
    expect(element, "Field exists");
    Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const csrf = () =>
    decodeURIComponent(
      document.cookie
        .split("; ")
        .find((value) => value.startsWith(boot.csrf_cookie + "="))
        ?.split("=")[1] || "",
    );
  const request = async (path, data) => {
    const r = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
      body: JSON.stringify(data),
    });
    const v = await r.json();
    if (!r.ok) throw Error(v.error);
    return v;
  };
  const source = "http://127.0.0.1:8769/61a45d3011e84d42847d8e9f7a012d57.png";
  const note = await request("/worlds/" + f.world + "/resources", {
    kind: "note",
    title: "Mouse and Markdown QA " + Date.now(),
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Existing original remains intact." },
          ],
        },
      ],
    },
  });
  location.hash = "/entry/" + note.id;
  await wait(() => document.querySelector(".tiptap"), "Original editor");
  document.querySelector(".tiptap").focus();
  button("Insert Markdown").click();
  await wait(() => document.querySelector(".modal"), "Markdown modal");
  set(
    field("Markdown source"),
    "# Markdown heading\n\n**Rich evidence**\n\n![Linked clue](" + source + ")",
  );
  await pause();
  button("Preview Markdown", document.querySelector(".modal")).click();
  await wait(
    () =>
      document.querySelector(".markdown-preview img")?.complete &&
      document.querySelector(".markdown-preview img")?.naturalWidth > 0,
    "Real remote image renders in Markdown preview",
  );
  button("Insert Markdown", document.querySelector(".modal")).click();
  await wait(() => !document.querySelector(".modal"), "Markdown inserted");
  expect(
    document
      .querySelector(".tiptap")
      .textContent.includes("Existing original remains intact."),
    "Original prose retained",
  );
  await wait(
    () => document.querySelector(".tiptap img")?.naturalWidth > 0,
    "Remote image in actual rich editor",
  );
  button("Insert image").click();
  await wait(() => field("Image URL"), "Linked image picker");
  set(field("Image URL"), source + "?direct=1");
  set(field("Image description"), "Direct linked image");
  await pause();
  button("Insert linked image").click();
  await wait(
    () => document.querySelectorAll(".tiptap img").length === 2,
    "Direct URL inserted",
  );
  const clipboard = new DataTransfer();
  clipboard.setData("text/plain", "![Pasted image](" + source + "?paste=1)");
  document.querySelector(".tiptap").dispatchEvent(
    new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    }),
  );
  await wait(
    () => field("Markdown source")?.value.includes("Pasted image"),
    "Markdown paste recognized",
  );
  button("Insert Markdown", document.querySelector(".modal")).click();
  await wait(
    () =>
      !document.querySelector(".modal") &&
      document.querySelectorAll(".tiptap img").length === 3,
    "Markdown paste inserted",
  );
  button("Save").click();
  const countImages = (doc) =>
    (doc.type === "image" ? 1 : 0) +
    (doc.content || []).reduce((n, c) => n + countImages(c), 0);
  await wait(
    async () =>
      countImages(
        (await fetch("/api/resources/" + note.id).then((r) => r.json()))
          .document,
      ) === 3,
    "Three linked images persisted in database",
  );
  location.hash = "/campaigns/" + f.campaign;
  await wait(() => button("Affinity web"), "Campaign workspace");
  button("Affinity web").click();
  await wait(
    () => document.querySelector('[data-affinity-node="' + f.hero + '"]'),
    "Affinity source",
  );
  document
    .querySelector('[data-affinity-node="' + f.hero + '"]')
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await wait(() => field("Linked portrait URL"), "Portrait URL field");
  set(field("Linked portrait URL"), source + "?portrait=1");
  await pause();
  button("Save linked portrait").click();
  await wait(
    async () =>
      (await fetch("/api/resources/" + f.hero).then((r) => r.json())).data
        .cover_url ===
      source + "?portrait=1",
    "Portrait URL persists",
  );
  await wait(
    () =>
      document
        .querySelector('[data-affinity-node="' + f.hero + '"] image')
        ?.getAttribute("href") ===
      source + "?portrait=1",
    "Linked portrait appears in graph",
  );
  const loaded = await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0);
    image.onerror = () => resolve(false);
    image.src = source + "?portrait=1";
  });
  expect(loaded, "Actual external portrait loads");
  localStorage.qaInputMedia = JSON.stringify({
    note: note.id,
    hero: f.hero,
    world: f.world,
    source,
  });
  return {
    note: note.id,
    markdownPreviewLoadsImage: true,
    markdownPreservesOriginalProse: true,
    directImageURLInserted: true,
    markdownPasteRecognized: true,
    threeLinkedImagesSavedInDatabase: true,
    linkedPortraitSavedAndRendered: true,
  };
})();
