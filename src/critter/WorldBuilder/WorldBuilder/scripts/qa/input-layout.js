(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const pause = (ms = 100) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const wait = async (test, m) => {
    for (let i = 0; i < 90; i++) {
      if (test()) return;
      await pause();
    }
    throw Error(m);
  };
  location.hash = "/relationships";
  await wait(
    () => document.querySelector(".node-diagram .relationship-canvas > svg"),
    "All relationship graph",
  );
  await pause(250);
  const svg = document.querySelector(
    ".node-diagram .relationship-canvas > svg",
  );
  const initial = svg.viewBox.baseVal.width;
  svg.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY: -200,
      bubbles: true,
      cancelable: true,
      clientX: svg.getBoundingClientRect().x + 30,
      clientY: svg.getBoundingClientRect().y + 30,
    }),
  );
  await pause();
  expect(
    svg.viewBox.baseVal.width < initial,
    "All graph wheel zoom " + initial + " -> " + svg.viewBox.baseVal.width,
  );
  svg.querySelector("[data-node-id]").dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: innerWidth - 2,
      clientY: innerHeight - 2,
    }),
  );
  await wait(() => document.querySelector("[role=menu]"), "Source menu");
  let menu = document.querySelector("[role=menu]"),
    rect = menu.getBoundingClientRect();
  expect(
    menu.textContent.includes("Open original notes"),
    "Relevant original action",
  );
  expect(rect.right <= innerWidth && rect.bottom <= innerHeight, "Menu bounds");
  menu.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await pause();
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent.trim() === "Family & bloodlines")
    .click();
  await wait(
    () =>
      document.querySelector(
        ".family-explorer .node-diagram .relationship-canvas > svg",
      ),
    "Family graph",
  );
  document
    .querySelector(".family-explorer .node-diagram .relationship-canvas > svg")
    .dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: innerWidth - 2,
        clientY: innerHeight - 2,
      }),
    );
  await wait(() => document.querySelector("[role=menu]"), "Family menu");
  menu = document.querySelector("[role=menu]");
  expect(menu.textContent.includes("Fit graph"), "Family navigation");
  menu.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await pause();
  expect(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "No page overflow",
  );
  return {
    width: innerWidth,
    allGraphWheelZoom: true,
    sourceContextMenu: true,
    contextMenuFitsViewport: true,
    familyMenu: true,
    noPageOverflow: true,
  };
})();
