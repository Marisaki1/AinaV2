import fs from "node:fs/promises";
const target = (
  await fetch("http://127.0.0.1:9225/json/list").then((r) => r.json())
).find((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:8768/"));
if (!target) throw Error("Isolated QA page required");
const socket = new WebSocket(target.webSocketDebuggerUrl),
  pending = new Map();
let next = 0;
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
socket.onmessage = (event) => {
  const value = JSON.parse(event.data);
  if (value.id && pending.has(value.id)) {
    const { resolve, reject } = pending.get(value.id);
    pending.delete(value.id);
    value.error ? reject(Error(value.error.message)) : resolve(value.result);
  }
};
const command = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const v = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (v.exceptionDetails)
    throw Error(
      v.exceptionDetails.exception?.description || v.exceptionDetails.text,
    );
  return v.result?.value;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const mouse = (type, x, y, more = {}) =>
  command("Input.dispatchMouseEvent", { type, x, y, ...more });
const expect = (v, m) => {
  if (!v) throw Error(m);
};
try {
  await command("Page.reload");
  await pause(1500);
  const boot = await evaluate("fetch('/api/bootstrap').then(r=>r.json())");
  expect(boot.test_workspace, "QA only");
  const f = await evaluate("JSON.parse(localStorage.qaAffinity)");
  const wait = async (expression, message) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw Error(message);
  };
  await evaluate(`location.hash='/campaigns/${f.campaign}'`);
  await wait(
    "!![...document.querySelectorAll('.campaign-workspace button')].find(b=>b.textContent.trim()==='Affinity web')",
    "Campaign tabs",
  );
  await evaluate(
    "[...document.querySelectorAll('.campaign-workspace button')].find(b=>b.textContent.trim()==='Affinity web').click()",
  );
  await wait(
    `!!document.querySelector('[data-affinity-node="${f.hero}"]')`,
    "Affinity node",
  );
  await evaluate(
    `document.querySelector('[data-affinity-node="${f.hero}"]').scrollIntoView({block:'center'})`,
  );
  await pause(200);
  const geometry = await evaluate(
    `(()=>{const n=document.querySelector('[data-affinity-node="${f.hero}"]'),s=n.closest('svg'),r=n.querySelector('circle').getBoundingClientRect(),p=new DOMPoint(Math.floor(r.x+r.width/2),Math.floor(r.y+r.height/2)).matrixTransform(s.getScreenCTM().inverse());return{x:Math.floor(r.x+r.width/2),y:Math.floor(r.y+r.height/2),anchor:{x:p.x,y:p.y},box:s.viewBox.baseVal.width,scrollY,position:n.getAttribute('transform')}})()`,
  );
  await mouse("mouseWheel", geometry.x, geometry.y, {
    deltaX: 0,
    deltaY: -220,
  });
  await pause(250);
  const zoomed = await evaluate(
    `(()=>{const s=document.querySelector('.affinity-stage svg'),p=new DOMPoint(${geometry.x},${geometry.y}).matrixTransform(s.getScreenCTM().inverse());return{w:s.viewBox.baseVal.width,x:p.x,y:p.y,scrollY}})()`,
  );
  expect(zoomed.w < geometry.box, "Real wheel zooms in");
  expect(
    Math.abs(zoomed.x - geometry.anchor.x) < 0.1 &&
      Math.abs(zoomed.y - geometry.anchor.y) < 0.1,
    "Wheel zoom anchor stays at pointer",
  );
  expect(zoomed.scrollY === geometry.scrollY, "Wheel does not scroll page");
  await mouse("mouseWheel", geometry.x, geometry.y, { deltaX: 0, deltaY: 160 });
  await pause(200);
  const out = await evaluate(
    "document.querySelector('.affinity-stage svg').viewBox.baseVal.width",
  );
  expect(out > zoomed.w, "Real wheel zooms out");
  const beforePan = await evaluate(
    "(()=>{const s=document.querySelector('.affinity-stage svg'),c=s.viewBox.baseVal;return{x:c.x,y:c.y,w:c.width}})()",
  );
  await mouse("mousePressed", geometry.x, geometry.y, {
    button: "middle",
    buttons: 4,
    clickCount: 1,
  });
  await mouse("mouseMoved", geometry.x + 70, geometry.y + 30, {
    button: "middle",
    buttons: 4,
  });
  await pause(100);
  await mouse("mouseReleased", geometry.x + 70, geometry.y + 30, {
    button: "middle",
    buttons: 0,
    clickCount: 1,
  });
  await pause(200);
  const afterPan = await evaluate(
    `(()=>{const s=document.querySelector('.affinity-stage svg'),c=s.viewBox.baseVal;return{x:c.x,y:c.y,w:c.width,position:document.querySelector('[data-affinity-node="${f.hero}"]').getAttribute('transform')}})()`,
  );
  expect(
    afterPan.x !== beforePan.x && afterPan.y !== beforePan.y,
    "Middle drag on node pans camera",
  );
  expect(
    afterPan.position === geometry.position,
    "Middle drag does not move original node",
  );
  await evaluate(
    "[...document.querySelectorAll('.affinity-controls button')].find(b=>b.textContent.trim()==='Fit web').click()",
  );
  await pause(150);
  await evaluate(
    `document.querySelector('[data-affinity-node="${f.hero}"]').scrollIntoView({block:'center'})`,
  );
  await pause(150);
  const point = await evaluate(
    `(()=>{const r=document.querySelector('[data-affinity-node="${f.hero}"] circle').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  await evaluate(
    "window.qaGraphEvents=[]; for(const type of ['pointerdown','contextmenu','pointerup','scroll']) document.addEventListener(type,e=>window.qaGraphEvents.push({type,target:e.target.tagName,cls:e.target.getAttribute?.('class'),prevented:e.defaultPrevented,x:e.clientX,y:e.clientY}),true)",
  );
  await mouse("mousePressed", point.x, point.y, {
    button: "right",
    clickCount: 1,
  });
  await mouse("mouseReleased", point.x, point.y, {
    button: "right",
    clickCount: 1,
  });
  await pause(400);
  console.log(
    JSON.stringify(
      await evaluate(
        "({events:window.qaGraphEvents,menus:document.querySelectorAll('[role=menu]').length,scrollY})",
      ),
    ),
  );
  await wait(
    "!!document.querySelector('[role=menu][aria-label=\"Graph actions\"]')",
    "Real right click opens custom menu",
  );
  const actions = await evaluate(
    "[...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent)",
  );
  expect(
    actions.includes("Inspect source notes") &&
      actions.includes("Connect this entry"),
    "Node menu has relevant actions",
  );
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
  });
  expect(
    await evaluate("!document.querySelector('[role=menu]')"),
    "Escape closes menu",
  );
  // The real left drag and keyboard arrangement remain covered by affinity-interactions.mjs.
  const report = {
    realWheelZoomInAndOut: true,
    pointerAnchorPreserved: true,
    wheelDoesNotScrollPage: true,
    realMiddleDragOnNodePansWithoutMovingNode: true,
    realRightClickCustomNodeMenu: true,
    escapeClosesMenu: true,
    actions,
  };
  await fs.writeFile(
    ".preview/graph-inputs-0.22.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  socket.close();
}
