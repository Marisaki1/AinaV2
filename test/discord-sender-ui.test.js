const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('node:vm');
const { webcrypto } = require('crypto');
const Core = require('../src/critter/public/core');
const CHANNEL = '222222222222222222';
function fixture() {
  const nodes = new Map(), calls = [], notices = [];
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const n = { id, value: '', textContent: '', disabled: false, dataset: {}, html: '',
      set innerHTML(html) { this.html = html; for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) node(match[1]); }, get innerHTML() { return this.html; },
      showModal() { this.open = true; }, close() { this.open = false; }, focus() {},
    };
    nodes.set(id, n); return n;
  }
  for (const id of ['selection-panel', 'content-panel', 'command-panel', 'sender-editor-dialog', 'sender-editor-root']) node(id);
  const state = { ready: true, mode: 'bot-preview', config: { buttons: [] }, recent: [], prefix: '!', queued: 0 };
  const context = vm.createContext({ window: {}, crypto: webcrypto, Date,
    $: selector => nodes.get(selector.slice(1)) || null, escape: s => String(s ?? '').replace(/</g, '&lt;'),
    ui: { tab: 'sender', channelId: CHANNEL }, workspace: Core.blankWorkspace(), revision: 0, C: Core,
    connected: true, channels: [{ id: CHANNEL, name: 'Server / #combat' }], commands: [], sending: false,
    document: { querySelectorAll: () => [] }, setInterval: () => 1, clearInterval() {},
    Feedback: { show(...args) { notices.push(args); } },
    async api(route, method, data) {
      calls.push({ route, method, data });
      if (route === 'sender/status') return state;
      if (route === 'sender/send') { const command = { ...data, delivery: 'queued', createdAt: Date.now() }; state.recent.unshift(command); return { command }; }
      if (route === 'sender/config') { state.config = data; return { config: data, revision: 3 }; }
      if (route === 'sender/cancel') return state;
      throw Error('Unexpected route ' + route);
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/critter/public/sender-ui.js'), 'utf8'), context);
  return { nodes, calls, notices, state, context, api: context.window.SenderUI,
    async start() { await this.api.start(); await this.api.render(); } };
}
test('command panel uses Aina and the shared destination without account connection controls', async () => {
  const f = fixture(); await f.start();
  const html = f.nodes.get('content-panel').innerHTML;
  assert(html.includes('Post as Aina')); assert(html.includes('Saved commands')); assert(html.includes('Filter saved commands'));
  assert(html.includes('Paste it yourself')); assert.equal(f.nodes.get('selection-panel').innerHTML, '');
  assert.equal(f.nodes.get('sender-destination').textContent, 'Server / #combat');
  assert(!/Malow|Dummy|Reauthorize|password/.test(html));
  assert(f.calls.every(c => c.route === 'sender/status'));
});

test('rapid clicks send one request; drafts survive rendering; delivery does not imply execution', async () => {
  const f = fixture(); await f.start();
  await Promise.all([f.api.send('!r 1d20'), f.api.send('!r 1d20')]);
  assert.equal(f.calls.filter(c => c.route === 'sender/send').length, 1);
  assert.equal(f.calls.find(c => c.route === 'sender/send').data.channelId, CHANNEL);
  f.nodes.get('sender-custom').value = '!i aoo Dragon Claw';
  await f.api.render(); assert.equal(f.nodes.get('sender-custom').value, '!i aoo Dragon Claw');
  f.state.recent[0].delivery = 'uncertain'; f.state.recent[0].error = 'Check Discord';
  await f.api.refresh(); assert(f.nodes.get('sender-recent').innerHTML.includes('delivery uncertain'));
  assert.equal(f.calls.filter(c => c.route === 'sender/send').length, 1);
});

test('offline or inaccessible destinations prevent posting and leave local commands intact', async () => {
  const f = fixture(); await f.start(); f.context.connected = false;
  await f.api.send('!r 1d20'); assert(!f.calls.some(c => c.route === 'sender/send'));
  f.context.connected = true; f.context.ui.channelId = 'inaccessible';
  await f.api.send('!r 1d20'); assert(!f.calls.some(c => c.route === 'sender/send'));
  assert(f.notices.some(n => n[0] === 'Choose a destination'));
});

test('saved command filtering matches labels and command text without posting anything', async () => {
  const f = fixture();
  f.state.config.buttons = [{ id: 'roll', label: 'Roll', text: '!r 1d20' }, { id: 'update', label: 'Refresh book', text: '!bestiary update' }];
  await f.start();
  const input = f.nodes.get('sender-search'); input.value = 'bestiary'; input.oninput({ target: input });
  const html = f.nodes.get('sender-buttons').innerHTML;
  assert(html.includes('Refresh book')); assert(!html.includes('data-sender-button="roll"'));
  assert(!f.calls.some(c => c.route === 'sender/send'));
});

