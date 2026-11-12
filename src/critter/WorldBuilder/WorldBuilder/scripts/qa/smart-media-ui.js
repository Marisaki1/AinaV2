(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("Isolated QA installation required.");
  const o = JSON.parse(localStorage.getItem("qaOrganization"));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    wait = async (test, message) => {
      for (let n = 0; n < 70; n++) {
        if (test()) return;
        await pause(60);
      }
      throw new Error(message);
    };
  const button = (t) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === t,
    );
  const field = (name) =>
    [...document.querySelectorAll("label.field")]
      .find((e) => e.querySelector("span")?.textContent === name)
      ?.querySelector("input");
  const set = (el, value) => {
    if (!el) throw new Error("Input missing");
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const original = await fetch("/api/media/" + o.asset).then((r) => r.json());
  location.hash = "/media/" + o.asset;
  await wait(() => field("Image name"), "Image details missing");
  set(field("Image name"), "QA tagged borderlands.png");
  set(field("Artist / source credit"), "QA artist");
  set(field("Media tags"), "qashrine, map");
  await pause(40);
  button("Save details").click();
  await wait(
    () =>
      document.querySelector("[role=dialog] h2")?.textContent ===
      "QA tagged borderlands.png",
    "Image details did not save",
  );
  const updated = await fetch("/api/media/" + o.asset).then((r) => r.json());
  if (updated.digest !== original.digest || !updated.tags.includes("qashrine"))
    throw new Error("Tag edit changed image bytes or lost tags");
  button("Close").click();
  location.hash = "/library";
  await wait(() => button("New collection"), "Library missing");
  button("New collection").click();
  await wait(() => field("Collection name"), "New collection form missing");
  set(field("Collection name"), "QA organizer Tagged shrine");
  const mode = document.querySelector(".collection-rules select");
  mode.value = "smart";
  mode.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(() => field("Matching tags"), "Saved-filter rules missing");
  set(field("Matching tags"), "QASHRINE");
  await pause(40);
  document.querySelector("[role=dialog] form").requestSubmit();
  await wait(
    () =>
      !document.querySelector("[aria-modal=true]") &&
      document.querySelector(".collection-heading h2")?.textContent ===
        "QA organizer Tagged shrine",
    "Saved filter not created",
  );
  const savedFilter = location.hash.split("/").at(-1);
  o.savedFilter = savedFilter;
  localStorage.setItem("qaOrganization", JSON.stringify(o));
  await wait(
    () =>
      document.querySelectorAll(".organizer-content .entry-card").length ===
        1 &&
      document.querySelectorAll(".organizer-content .media-card").length === 1,
    "Tag collection did not gather the article and image",
  );
  location.hash = "/entry/" + o.article;
  await wait(
    () => document.querySelector('[aria-label="Entry tags"]'),
    "Article editor missing",
  );
  set(document.querySelector('[aria-label="Entry tags"]'), "forest");
  await pause(1300);
  location.hash = "/library/" + savedFilter;
  await wait(
    () =>
      document.querySelector(".collection-heading h2")?.textContent ===
        "QA organizer Tagged shrine" &&
      !document.querySelector(".page-loading"),
    "Saved filter did not reopen",
  );
  if (
    document.querySelectorAll(".organizer-content .entry-card").length !== 0 ||
    document.querySelectorAll(".organizer-content .media-card").length !== 1
  )
    throw new Error("Removing an article tag did not update membership");
  location.hash = "/entry/" + o.article;
  await wait(
    () => document.querySelector('[aria-label="Entry tags"]'),
    "Article editor missing",
  );
  set(document.querySelector('[aria-label="Entry tags"]'), "qashrine");
  await pause(1300);
  location.hash = "/library/" + savedFilter;
  await wait(
    () =>
      document.querySelectorAll(".organizer-content .entry-card").length === 1,
    "Restored tag did not restore membership",
  );
  document.querySelector(".global-search").click();
  await wait(
    () => document.querySelector('[aria-label="Search all world content"]'),
    "Search dialog missing",
  );
  set(
    document.querySelector('[aria-label="Search all world content"]'),
    "qashrine",
  );
  await wait(
    () =>
      document.querySelector(".search-media-heading") &&
      document
        .querySelector(".search-results")
        ?.textContent.includes("QA tagged borderlands.png"),
    "Global search did not find media tags",
  );
  document.querySelector('[aria-label="Close dialog"]').click();
  document.querySelector('[aria-label="List view"]').click();
  const sort = document.querySelector('[aria-label="Sort entries"]');
  sort.value = "title";
  sort.dispatchEvent(new Event("change", { bubbles: true }));
  await pause(80);
  const prefs = JSON.parse(
    localStorage.getItem("worldbuilder.library:" + o.world),
  );
  if (prefs.view !== "list" || prefs.sort !== "title")
    throw new Error("Library view preferences did not persist");
  const article = await fetch("/api/resources/" + o.article).then((r) =>
    r.json(),
  );
  if (article.parent !== o.child)
    throw new Error("Saved collection moved the original entry");
  return {
    mediaMetadata: true,
    imageBytesUnchanged: true,
    taggedArticleAndImageMembership: true,
    caseInsensitiveTags: true,
    membershipRemovalAndAddition: true,
    globalMediaSearch: true,
    originalFolderPreserved: true,
    viewPreferencesSaved: true,
    savedFilter,
  };
})();
