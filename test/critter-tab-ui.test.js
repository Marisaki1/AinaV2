const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('fs');
const path = require('path');
const Core = require('../src/critter/public/core');
const Sources = require('../src/critter/public/sources');
const Remote = require('../src/critter/public/remote-common');

// Exercise the real account-dialog handlers without starting a browser.
function dialogFixture({ tabs = [{ id: 7, title: 'CritterDB', url: 'https://critterdb.com/#/about' }], extensionError = null } = {}) {
  const nodes = new Map(), calls = [], notices = [];
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const n = { id, value: '', textContent: '', disabled: false, hidden: false, open: false, inert: false,
      showModal() { this.open = true; }, close() { this.open = false; }, replaceChildren() { this.innerHTML = ''; },
      set innerHTML(html) {
        this.html = html;
        for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
          const child = node(match[1]), tag = match[0]; child.disabled = /\bdisabled\b/.test(tag);
          const value = tag.match(/\bvalue="([^"]*)"/); if (value) child.value = value[1];
        }
      }, get innerHTML() { return this.html || ''; },
    };
    nodes.set(id, n); return n;
  }
  node('direct-root'); node('direct-dialog');
  const pack = { _id: '222222222222222222222222', name: 'Floor 8', creatures: [] };
  let connected = false;
  const context = vm.createContext({ window: {}, location: { origin: 'http://127.0.0.1:4317' },
    $: selector => nodes.get(selector.slice(1)) || null, escape: value => String(value || ''),
    workspace: Core.blankWorkspace(), C: Core, CritterSources: Sources, CritterRemote: Remote,
    analysisCache: new Map(), EditorUI: { syncRemote() {}, async open() {} }, async renderWorkspace() {},
    ui: {}, remember() {}, copy() {}, download() {}, Feedback: { show(...args) { notices.push(args); } },
    CritterTabBridge: { async restore() {}, async tabs() { if (extensionError) throw Object.assign(new Error('Install extension'), { code: extensionError }); return tabs; }, async connect(id) { calls.push(['connect', id]); connected = true; } },
    async api(route, method, data) {
      calls.push([route, data]);
      if (route === 'remote/status') return { state: connected ? 'connected' : 'disconnected', message: 'Use existing tab' };
      if (route === 'remote/browser/setup') return { directory: 'test-extension-folder' };
      if (route === 'remote/source') { const ws = Core.blankWorkspace(); ws.documents.push({ id: 'pack', keys: [], label: pack.name, data: pack }); return { workspace: ws, revision: 'new', documentId: 'pack', state: 'loaded', message: '0 creatures loaded' }; }
      throw Error('Unexpected API call: ' + route);
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/critter/public/direct-ui.js'), 'utf8'), context);
  return { context, nodes, calls, notices, async open() { await context.window.DirectUI.open('', 'https://critterdb.com/#/bestiary/view/222222222222222222222222'); } };
}
test('account dialog connects an existing tab and accepts a bestiary URL, including an empty bestiary', async () => {
  const f = dialogFixture(); await f.open();
  assert.equal(f.nodes.has('direct-confirm-save'), false); assert.equal(f.nodes.get('direct-load').disabled, true);
  assert(f.nodes.get('direct-root').innerHTML.includes('Load creature or bestiary'));
  f.nodes.get('direct-url').oninput(); // Previously crashed in creature-only/load-only dialogs.
  await f.nodes.get('direct-tab-connect').onclick();
  assert(f.calls.some(([operation, value]) => operation === 'connect' && value === 7));
  assert.equal(f.nodes.get('direct-state').textContent, 'Connected to CritterDB');
  assert.equal(f.nodes.get('direct-load').disabled, false);
  await f.nodes.get('direct-load').onclick();
  assert.equal(f.context.workspace.documents[0].data.name, 'Floor 8');
  assert.equal(f.context.ui.tab, 'library'); assert.equal(f.nodes.get('direct-dialog').open, false);
  assert.equal(f.notices.at(-1)[0], 'CritterDB bestiary refreshed');
});
test('multiple existing CritterDB tabs require an explicit selection', async () => {
  const f = dialogFixture({ tabs: [{ id: 1, title: 'First', url: 'https://critterdb.com/#/about' }, { id: 2, title: 'Second', url: 'https://critterdb.com/#/login' }] });
  await f.open(); await f.nodes.get('direct-tab-connect').onclick();
  assert.equal(f.calls.some(([operation]) => operation === 'connect'), false);
  assert.equal(f.nodes.get('direct-tab-choice').hidden, false);
  f.nodes.get('direct-tab-select').value = '2'; await f.nodes.get('direct-tab-use').onclick();
  assert(f.calls.some(([operation, value]) => operation === 'connect' && value === 2));
});
test('missing connector opens inline setup and never enables saving or launches a browser', async () => {
  const f = dialogFixture({ extensionError: 'extension_required' }); await f.open();
  await f.nodes.get('direct-tab-connect').onclick();
  assert.equal(f.nodes.get('direct-setup').open, true); assert.equal(f.nodes.get('direct-load').disabled, true);
  assert.equal(f.calls.some(([operation]) => operation === 'connect'), false);
  assert.equal(f.nodes.get('direct-root').inert, false);
});
