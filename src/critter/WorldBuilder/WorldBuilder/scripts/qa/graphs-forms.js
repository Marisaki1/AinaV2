(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaGraphs")),
    checks = [];
  const pause = (ms = 180) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw new Error(m);
    };
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const field = (name, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === name)
      ?.querySelector("input,select,textarea");
  const set = async (el, value) => {
    expect(el, "Missing field " + value);
    const p =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(p, "value").set.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  location.hash = "/relationships";
  await pause(600);
  button("Add connection").click();
  await pause();
  const form = document.querySelector(".modal");
  await set(field("From", form), f.people.Aoi);
  await set(field("To", form), f.people.Unrelated);
  await set(field("Relationship", form), "guardian");
  await set(field("Connection visibility", form), "public");
  await set(field("Label (optional)", form), "Caretaker");
  await set(field("Relationship notes", form), "Secret caretaker motive");
  button("Add connection", form).click();
  for (let i = 0; i < 50 && document.querySelector(".modal"); i++)
    await pause(100);
  expect(!document.querySelector(".modal"), "Connection form did not save");
  const edges = (
      await fetch("/api/worlds/" + f.world + "/connections").then((r) =>
        r.json(),
      )
    ).connections,
    edge = edges.find(
      (e) =>
        e.source === f.people.Aoi &&
        e.target === f.people.Unrelated &&
        e.kind === "guardian",
    );
  expect(
    edge?.visibility === "public" && edge.notes === "Secret caretaker motive",
    "Connection form lost role/visibility/notes",
  );
  const reader = (
    await fetch("/api/worlds/" + f.world + "/connections?audience=reader").then(
      (r) => r.json(),
    )
  ).connections.find((e) => e.id === edge.id);
  expect(
    reader?.label === "Caretaker" && reader.notes === "",
    "Reader connection leaked notes or lost shared label",
  );
  checks.push(
    "create guardian link with shared visibility while keeping notes private",
  );
  location.hash = "/entry/" + f.tree;
  await pause(650);
  document.querySelector(".hierarchy-editor details summary").click();
  await pause();
  const checkbox = () =>
    document.querySelector(
      '[aria-label="Include QA Tagged lore in hierarchy"]',
    );
  expect(!checkbox().checked, "Fixture tagged entry was already manual");
  checkbox().click();
  let saved;
  for (let i = 0; i < 40; i++) {
    await pause(200);
    saved = await fetch("/api/resources/" + f.tree).then((r) => r.json());
    if (saved.data.items.includes(f.lore.Tagged)) break;
  }
  expect(
    saved.data.items.includes(f.lore.Tagged),
    "Manual membership did not save",
  );
  checkbox().click();
  for (let i = 0; i < 40; i++) {
    await pause(200);
    saved = await fetch("/api/resources/" + f.tree).then((r) => r.json());
    if (!saved.data.items.includes(f.lore.Tagged)) break;
  }
  expect(
    !saved.data.items.includes(f.lore.Tagged),
    "Manual membership removal did not save",
  );
  expect(
    document.querySelector('[aria-label="Parent of QA Tagged lore"]'),
    "Removing manual selection incorrectly removed the tagged member",
  );
  checks.push(
    "manual membership toggles persist and preserve tag-selected membership",
  );
  return { checks };
})();
