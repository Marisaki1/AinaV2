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
  const boot = await evaluate("fetch('/api/bootstrap').then(r=>r.json())");
  expect(boot.test_workspace, "QA only");
  const f = await evaluate("JSON.parse(localStorage.qaAffinity)");
  await evaluate(`location.hash='/campaigns/${f.campaign}'`);
  await pause(650);
  await evaluate(
    "[...document.querySelectorAll('.campaign-workspace button')].find(b=>b.textContent.trim()==='Affinity web').click()",
  );
  await pause(600);
  await evaluate(
    `document.querySelector('[data-affinity-node="${f.hero}"]').scrollIntoView({block:'center'})`,
  );
  await pause(100);
  const geometry = await evaluate(
    `(()=>{const n=document.querySelector('[data-affinity-node="${f.hero}"]'),r=n.querySelector('circle').getBoundingClientRect(),m=n.transform.baseVal.consolidate().matrix;return {x:r.x+r.width/2,y:r.y+r.height/2,nodeX:m.e,nodeY:m.f}})()`,
  );
  await mouse("mouseMoved", geometry.x, geometry.y);
  await mouse("mousePressed", geometry.x, geometry.y, {
    button: "left",
    clickCount: 1,
  });
  await mouse("mouseMoved", geometry.x + 70, geometry.y + 25, {
    button: "left",
    buttons: 1,
  });
  await pause(80);
  await mouse("mouseReleased", geometry.x + 70, geometry.y + 25, {
    button: "left",
    clickCount: 1,
  });
  await pause(900);
  const saved = await evaluate(
    `fetch('/api/resources/${f.board}').then(r=>r.json()).then(e=>e.data.positions['${f.hero}'])`,
  );
  expect(
    saved &&
      Math.hypot(saved.x - geometry.nodeX, saved.y - geometry.nodeY) > 20,
    "Actual pointer drag did not save",
  );
  await command("Page.reload");
  await pause(950);
  await evaluate(
    "[...document.querySelectorAll('.campaign-workspace button')].find(b=>b.textContent.trim()==='Affinity web').click()",
  );
  await pause(650);
  const restored = await evaluate(
    `(()=>{const m=document.querySelector('[data-affinity-node="${f.hero}"]').transform.baseVal.consolidate().matrix;return{x:m.e,y:m.f}})()`,
  );
  expect(
    Math.abs(restored.x - saved.x) < 0.01 &&
      Math.abs(restored.y - saved.y) < 0.01,
    "Saved position did not survive browser reload",
  );
  await evaluate(
    `document.querySelector('[data-affinity-node="${f.hero}"]').focus({preventScroll:true})`,
  );
  for (const type of ["keyDown", "keyUp"])
    await command("Input.dispatchKeyEvent", {
      type,
      key: "ArrowRight",
      code: "ArrowRight",
      windowsVirtualKeyCode: 39,
    });
  await pause(850);
  const moved = await evaluate(
    `fetch('/api/resources/${f.board}').then(r=>r.json()).then(e=>e.data.positions['${f.hero}'])`,
  );
  expect(
    Math.abs(moved.x - saved.x - 20) < 0.01,
    "Keyboard movement not saved",
  );
  await evaluate(
    "document.querySelector('.affinity-stage').scrollIntoView({block:'center'})",
  );
  await pause(80);
  await evaluate(
    "window.panLog=[];for(const type of ['pointerdown','pointermove','pointerup'])document.querySelector('.affinity-stage svg').addEventListener(type,e=>window.panLog.push({type:e.type,target:e.target.tagName,x:e.clientX,y:e.clientY,button:e.button,view:e.currentTarget.getAttribute('viewBox')}));",
  );
  const canvas = await evaluate(
    "(()=>{const el=document.querySelector('.affinity-stage svg'),r=el.getBoundingClientRect();return{x:Math.max(12,r.left+12),y:Math.max(110,r.top+12),view:el.getAttribute('viewBox')}})()",
  );
  await mouse("mousePressed", canvas.x, canvas.y, {
    button: "left",
    clickCount: 1,
  });
  await pause(80);
  await mouse("mouseMoved", canvas.x + 45, canvas.y + 35, {
    button: "left",
    buttons: 1,
  });
  await pause(120);
  await mouse("mouseReleased", canvas.x + 45, canvas.y + 35, {
    button: "left",
    clickCount: 1,
  });
  await pause(150);
  const panAfter = await evaluate(
    "document.querySelector('.affinity-stage svg').getAttribute('viewBox')",
  );
  if (panAfter === canvas.view)
    console.log(
      JSON.stringify({
        canvas,
        panAfter,
        log: await evaluate("window.panLog"),
      }),
    );
  expect(panAfter !== canvas.view, "Background pan did not move view");
  const before = await evaluate(
    "document.querySelector('.affinity-stage svg').viewBox.baseVal.width",
  );
  await evaluate(
    "document.querySelector('[aria-label=\"Zoom in affinity web\"]').click()",
  );
  await pause(100);
  expect(
    (await evaluate(
      "document.querySelector('.affinity-stage svg').viewBox.baseVal.width",
    )) < before,
    "Zoom did not change view",
  );
  const report = {
    realPointerDragSaved: true,
    layoutSurvivedReload: true,
    realKeyboardMoveSaved: true,
    backgroundPan: true,
    zoom: true,
    position: moved,
  };
  await fs.writeFile(
    ".preview/affinity-interactions-0.13.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  socket.close();
}
