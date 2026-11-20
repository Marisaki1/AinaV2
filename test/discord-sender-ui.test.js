const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('node:vm');
const { webcrypto } = require('crypto');
const Core = require('../src/critter/public/core');
const { voiceChoices } = require('../src/utils/speechVoices');
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
  const providers = voiceChoices({ provider: 'groq', groqVoice: 'autumn', voice: 'en-US-JennyNeural' });
  providers[0].configured = true; providers[0].error = '';
  providers[1].discovered = true;
  const context = vm.createContext({ window: { LanguageUI: { render() {} } }, crypto: webcrypto, Date,
    $: selector => nodes.get(selector.slice(1)) || null, escape: s => String(s ?? '').replace(/</g, '&lt;'),
    ui: { tab: 'sender', channelId: CHANNEL }, workspace: Core.blankWorkspace(), revision: 0, C: Core,
    connected: true, channels: [{ id: CHANNEL, name: 'Server / #combat' }], commands: [], sending: false,
    document: { querySelectorAll: () => [] }, setInterval: () => 1, clearInterval() {},
    Feedback: { show(...args) { notices.push(args); } },
    async api(route, method, data) {
      calls.push({ route, method, data });
      if (route === 'sender/status') return state;
      if (route.startsWith('sender/voice?')) return { channels: [{ id: '555555555555555555', name: 'Mountain' }], memberChannelId: '555555555555555555', providers, current: null };
      if (route === 'sender/send' || route === 'sender/message') { const command = { ...data, delivery: 'queued', createdAt: Date.now() }; state.recent.unshift(command); return { command }; }
      if (route === 'sender/config') { state.config = data; return { config: data, revision: 3 }; }
      if (route === 'sender/cancel') return state;
      throw Error('Unexpected route ' + route);
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/critter/public/sender-ui.js'), 'utf8'), context);
  return { nodes, calls, notices, state, context, providers, api: context.window.SenderUI,
    async start() { await this.api.start(); await this.api.render(); } };
}
test('command panel uses Aina and the shared destination without account connection controls', async () => {
  const f = fixture(); await f.start();
  const html = f.nodes.get('content-panel').innerHTML;
  assert(html.includes('Post as Aina')); assert(html.includes('Saved commands')); assert(html.includes('Filter saved commands'));
  assert(html.includes('language-converter')); assert(!html.includes('sender-custom'));
  assert.equal(f.nodes.get('selection-panel').innerHTML, '');
  assert.equal(f.nodes.get('sender-destination').textContent, 'Server / #combat');
  assert(!/Malow|Dummy|Reauthorize|password/.test(html));
  assert(f.calls.every(c => c.route === 'sender/status'));
});

test('rapid clicks send one request; drafts survive rendering; delivery does not imply execution', async () => {
  const f = fixture(); await f.start();
  await Promise.all([f.api.send('!r 1d20'), f.api.send('!r 1d20')]);
  assert.equal(f.calls.filter(c => c.route === 'sender/send').length, 1);
  assert.equal(f.calls.find(c => c.route === 'sender/send').data.channelId, CHANNEL);
  await f.api.render(); assert(!f.nodes.has('sender-custom'));
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

test('plain message field is below saved commands and submits exact multiline text only once', async () => {
  const f = fixture(); await f.start();
  const html = f.nodes.get('content-panel').innerHTML;
  assert(html.indexOf('sender-message-form') > html.indexOf('id="sender-buttons"'));
  const text = '  **Hello**\n```\n!i list\n``` 😈  ';
  const input = f.nodes.get('sender-message'); input.value = text;
  input.oninput({ target: input });
  const form = f.nodes.get('sender-message-form');
  form.onsubmit({ preventDefault() {} }); form.onsubmit({ preventDefault() {} });
  const calls = f.calls.filter(c => c.route === 'sender/message');
  assert.equal(calls.length, 1); assert.equal(calls[0].data.text, text);
  assert.equal(calls[0].data.channelId, CHANNEL);
  assert(!f.calls.some(c => c.route === 'sender/send'));
  await f.api.render(); assert.equal(f.nodes.get('sender-message').value, text);
  f.context.connected = false;
  await f.api.send('Another message', 'message');
  assert.equal(f.calls.filter(c => c.route === 'sender/message').length, 1);
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

test('TTS starts unchecked, opt-in sends its voice destination, and reload resets opt-in', async () => {
  const f = fixture(); await f.start();
  assert.equal(f.nodes.get('sender-tts').checked, false);
  assert.equal(f.nodes.get('sender-voice-panel').hidden, true);
  const checkbox = f.nodes.get('sender-tts'); checkbox.checked = true;
  await checkbox.onchange({ target: checkbox });
  await f.api.refresh();
  assert.equal(f.nodes.get('sender-voice-panel').hidden, false);
  await f.api.send('> Reiko waits.', 'message');
  const request = f.calls.find(call => call.route === 'sender/message');
  assert.equal(request.data.tts, true);
  assert.equal(request.data.ttsProvider, 'groq');
  assert.equal(request.data.ttsVoice, 'autumn');
  assert.equal(request.data.voiceChannelId, '555555555555555555');
  assert.equal(request.data.text, '> Reiko waits.');
  await f.api.send('!i list');
  assert.equal(f.calls.find(call => call.route === 'sender/send').data.tts, undefined);
  await f.api.render(); assert.equal(f.nodes.get('sender-tts').checked, true);
  const fresh = fixture(); await fresh.start(); assert.equal(fresh.nodes.get('sender-tts').checked, false);
});

test('plain message clears only after confirmed delivery and Clear never posts', async () => {
  const f = fixture(); await f.start();
  const input = f.nodes.get('sender-message'); input.value = 'A narration'; input.oninput({ target: input });
  await f.api.send(input.value, 'message');
  assert.equal(input.value, 'A narration'); // Acceptance by the local queue is not delivery.
  f.state.recent[0].delivery = 'sent';
  await f.api.refresh();
  assert.equal(input.value, '');
  await f.api.render(); assert.equal(f.nodes.get('sender-message').value, '');
  const next = f.nodes.get('sender-message'); next.value = 'Clear me'; next.oninput({ target: next });
  f.nodes.get('sender-message-clear').onclick();
  assert.equal(next.value, '');
  assert.equal(f.calls.filter(call => call.route === 'sender/message').length, 1);
});

test('delivery failures keep drafts and delayed confirmation never clears a newer draft', async () => {
  const f = fixture(); await f.start();
  const input = f.nodes.get('sender-message'); input.value = 'Keep me'; input.oninput({ target: input });
  await f.api.send(input.value, 'message');
  for (const delivery of ['failed', 'uncertain', 'cancelled']) {
    f.state.recent[0].delivery = delivery; await f.api.refresh(); assert.equal(input.value, 'Keep me');
  }
  input.value = 'My next scene'; input.oninput({ target: input });
  f.state.recent[0].delivery = 'sent'; await f.api.refresh();
  assert.equal(input.value, 'My next scene');
  await f.api.render(); assert.equal(f.nodes.get('sender-message').value, 'My next scene');
});

test('voice and provider selections survive polling and Edge needs no Groq key', async () => {
  const f = fixture(); f.providers[0].configured = false; f.providers[0].error = 'Set GROQ_TTS_API_KEY';
  await f.start();
  const checkbox = f.nodes.get('sender-tts'); checkbox.checked = true; await checkbox.onchange({ target: checkbox }); await f.api.refresh();
  assert.equal(f.nodes.get('sender-speech-voice').value, 'autumn');
  await f.api.send('Cannot speak yet', 'message');
  assert.equal(f.calls.filter(call => call.route === 'sender/message').length, 0);
  const provider = f.nodes.get('sender-speech-provider'); provider.value = 'edge'; provider.onchange({ target: provider });
  const voice = f.nodes.get('sender-speech-voice'); voice.value = 'en-US-GuyNeural'; voice.onchange({ target: voice });
  await f.api.refresh(); await f.api.render();
  assert.equal(f.nodes.get('sender-speech-voice').value, 'en-US-GuyNeural');
  await f.api.send('The dragon speaks.', 'message');
  const sent = f.calls.find(call => call.route === 'sender/message').data;
  assert.equal(sent.ttsProvider, 'edge'); assert.equal(sent.ttsVoice, 'en-US-GuyNeural');
  provider.value = 'groq'; provider.onchange({ target: provider });
  assert.equal(f.nodes.get('sender-speech-voice').value, 'autumn');
});

test('a delayed voice list cannot replace the newly selected provider or voice', async () => {
  const f = fixture();
  const gemini = f.providers.find(provider => provider.provider === 'gemini'); gemini.configured = true; gemini.error = '';
  await f.start();
  const checkbox = f.nodes.get('sender-tts'); checkbox.checked = true; await checkbox.onchange({ target: checkbox }); await f.api.refresh();
  const original = f.context.api; let release;
  f.context.api = async (route, ...args) => {
    if (route.includes('provider=edge')) return new Promise(resolve => { release = async () => resolve(await original(route, ...args)); });
    return original(route, ...args);
  };
  const provider = f.nodes.get('sender-speech-provider'); provider.value = 'edge'; provider.onchange({ target: provider });
  provider.value = 'gemini'; provider.onchange({ target: provider });
  await release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.nodes.get('sender-speech-provider').value, 'gemini');
  assert.equal(f.nodes.get('sender-speech-voice').value, 'Charon');
});

