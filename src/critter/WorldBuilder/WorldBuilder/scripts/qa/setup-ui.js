(async () => {
  const qaBoot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!qaBoot.test_workspace || location.port !== "8768")
    throw new Error(
      "This script only runs against an isolated .preview workspace on port 8768.",
    );
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const set = (el, v) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  if (document.querySelector(".welcome-form")) {
    const fields = document.querySelectorAll(".welcome-form input");
    if (fields.length === 3) {
      set(fields[0], "Browser QA");
      set(fields[1], "The Verdant Atlas");
    }
    set(document.querySelector("#workspace-password"), "browser-qa-local-only");
    await pause(100);
    document.querySelector(".welcome-form form").requestSubmit();
    await pause(1800);
  }
  if (!document.querySelector(".sidebar"))
    throw new Error(
      "Setup did not open the workspace: " + document.body.innerText,
    );
  document.querySelector(".topbar-create").click();
  await pause(120);
  const modal = document.querySelector("[role=dialog]");
  if (!modal) throw new Error("Create dialog did not open");
  set(modal.querySelector("input"), "The Lantern Shrine");
  await pause(80);
  modal.querySelector("form").requestSubmit();
  await pause(900);
  if (!document.querySelector(".entry-title"))
    throw new Error("Entry editor did not open");
  const el = document.querySelector('[aria-label="Short description"]');
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  ).set.call(
    el,
    "A quiet threshold between the human village and the mountain.",
  );
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const prose = document.querySelector(".ProseMirror");
  prose.focus();
  document.execCommand(
    "insertText",
    false,
    "At dusk, lanterns wake along the old path. The shrine keeps a record of every promise made beneath its cedar trees.",
  );
  await pause(1800);
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  const world = boot.worlds[0].id;
  const cookie = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const resources = await fetch("/api/worlds/" + world + "/resources").then(
    (r) => r.json(),
  );
  const entry = resources.resources.find(
    (e) => e.title === "The Lantern Shrine",
  );
  const full = await fetch("/api/resources/" + entry.id).then((r) => r.json());
  if (
    !full.html.includes("At dusk") ||
    !full.summary.includes("quiet threshold")
  )
    throw new Error("Autosave did not persist the editor content");
  return {
    setup: true,
    createDialog: true,
    autosave: true,
    world,
    entry: entry.id,
    revision: full.revision,
    csrfPresent: !!cookie,
  };
})();
