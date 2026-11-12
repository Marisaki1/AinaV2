import fs from "node:fs/promises";

// Real CDP key/text events against the isolated QA browser, never the owner installation.
const targets = await fetch("http://127.0.0.1:9225/json/list").then((r) =>
  r.json(),
);
const target = targets.find(
  (t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:8768/"),
);
if (!target) throw new Error("Open the isolated QA page on port 8768 first.");
const socket = new WebSocket(target.webSocketDebuggerUrl),
  pending = new Map();
let next = 0;
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    message.error
      ? reject(new Error(message.error.message))
      : resolve(message.result);
  }
};
const command = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++next,
      timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("CDP timeout " + method));
      }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text,
    );
  return r.result?.value;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const key = async (name, code, number, modifiers = 0) => {
  for (const type of ["keyDown", "keyUp"])
    await command("Input.dispatchKeyEvent", {
      type,
      key: name,
      code,
      windowsVirtualKeyCode: number,
      modifiers,
    });
  await pause(100);
};
const checks = [];
try {
  const boot = await evaluate('fetch("/api/bootstrap").then(r=>r.json())');
  if (!boot.test_workspace) throw new Error("QA data required");
  await evaluate('location.hash="/relationships"');
  await pause(700);
  await evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Add connection").click()',
  );
  await pause(150);
  await evaluate(
    'document.querySelector(".modal [role=combobox][aria-label=From]").focus()',
  );
  await key("ArrowDown", "ArrowDown", 40);
  const fromQuery = await evaluate(
    'fetch("/api/resources/"+JSON.parse(localStorage.qaDropdowns).a).then(r=>r.json()).then(e=>e.title.normalize("NFKD").replace(/\\p{M}/gu,"").toUpperCase())',
  );
  await command("Input.insertText", { text: fromQuery });
  await pause(150);
  if (
    !(await evaluate(
      'document.activeElement.getAttribute("aria-label")==="Filter From" && document.querySelectorAll("[role=option]").length===1',
    ))
  )
    throw new Error("Text filtering or focus failed");
  await key("Enter", "Enter", 13);
  if (
    !(await evaluate(
      'document.querySelector(".modal label.field select").value===JSON.parse(localStorage.qaDropdowns).a',
    ))
  )
    throw new Error("Keyboard selection did not update source");
  checks.push(
    "real key/text filtering is case/accent insensitive and selects controlled values",
  );
  await evaluate(
    'document.querySelector(".modal [role=combobox][aria-label=To]").focus()',
  );
  await key(" ", "Space", 32);
  await command("Input.insertText", { text: "no_such_option_987654" });
  await pause(100);
  if (
    !(await evaluate(
      'document.querySelector(".searchable-select-empty")?.textContent.includes("No matching")',
    ))
  )
    throw new Error("Empty result state missing");
  await key("Escape", "Escape", 27);
  if (
    !(await evaluate(
      '!!document.querySelector(".modal") && !document.querySelector(".searchable-select-popup") && document.activeElement.getAttribute("aria-label")==="To"',
    ))
  )
    throw new Error("Escape closed modal or failed to restore focus");
  await key("ArrowDown", "ArrowDown", 40);
  const toQuery = await evaluate(
    'fetch("/api/resources/"+JSON.parse(localStorage.qaDropdowns).b).then(r=>r.json()).then(e=>e.title)',
  );
  await command("Input.insertText", { text: toQuery });
  await key("Enter", "Enter", 13);
  checks.push(
    "space opens, no-match state works, Escape closes only dropdown and restores focus",
  );
  await evaluate(
    'document.querySelector(".modal [role=combobox][aria-label=Relationship]").focus()',
  );
  await key("ArrowDown", "ArrowDown", 40);
  await command("Input.insertText", { text: "diplom" });
  await key("Home", "Home", 36);
  await key("Enter", "Enter", 13);
  if (
    !(await evaluate(
      '[...document.querySelectorAll(".modal label.field")].find(l=>l.querySelector("span")?.textContent==="Relationship").querySelector("select").value==="diplomacy"',
    ))
  )
    throw new Error("Filtered relationship selection failed");
  await evaluate(
    'document.querySelector(".modal [role=combobox][aria-label=From]").focus()',
  );
  await key("ArrowDown", "ArrowDown", 40);
  await key("Tab", "Tab", 9);
  if (
    !(await evaluate(
      '!document.querySelector(".searchable-select-popup") && document.activeElement.getAttribute("aria-label")==="To"',
    ))
  )
    throw new Error("Tab did not reach next visible control");
  await key("ArrowDown", "ArrowDown", 40);
  await key("Tab", "Tab", 9, 8);
  if (
    !(await evaluate(
      'document.activeElement.getAttribute("aria-label")==="From"',
    ))
  )
    throw new Error("Shift+Tab focus failed");
  await key("Escape", "Escape", 27);
  if (await evaluate('!!document.querySelector(".modal")'))
    throw new Error("Escape should close modal once dropdown is closed");
  checks.push(
    "Home/Enter choose filtered results and Tab/Shift+Tab skip hidden native controls inside modal",
  );
  const result = { checks, real_cdp_keyboard: true };
  await fs.writeFile(
    ".preview/dropdowns-keyboard-0.10.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  socket.close();
  for (const p of pending.values()) clearTimeout(p.timer);
}
