'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Roleplay } = require('../src/critter/roleplay');
const { WorkspaceStore } = require('../src/critter/store');
const { convert, defaultSettings, upgradeSettings, validateSettings } = require('../src/critter/languages');

test('built-in ciphers round-trip dialogue, protected names, case, and line breaks', () => {
  const settings = validateSettings(defaultSettings());
  const source = "The path is open, Shuu.\nDon't follow me. b Mi TEN mIx 42.";
  const names = ['Shuu', 'Mi'];
  const results = settings.presets.slice(0, 3).map(preset => {
    const encoded = convert(source, preset, names);
    assert.match(encoded, /Shuu/);
    assert.equal(convert(encoded, preset, names, true), source);
    return encoded;
  });
  assert.equal(new Set(results).size, 3);
  assert.match(results[2], /\p{S}/u);
});

test('language editing supports symbol glossary case and exact Japanese phrases', () => {
  const settings = defaultSettings();
  const symbols = settings.presets.find(preset => preset.id === 'unknown');
  const japanese = settings.presets.find(preset => preset.id === 'japanese');
  symbols.words = [['hello', '☉☼']];
  japanese.words = [['Good morning', 'おはようございます']];
  validateSettings(settings);
  const source = 'hello Hello HELLO hElLo';
  assert.equal(convert(convert(source, symbols), symbols, [], true), source);
  assert.equal(convert('Good morning', japanese), 'おはようございます');
  assert.equal(convert('おはようございます', japanese, [], true), 'Good morning');
  assert.throws(() => convert('Unknown line', japanese), /phrasebook/);
  symbols.units[0] = symbols.units[1];
  assert.throws(() => validateSettings(settings), /distinct symbols/);
});

test('Demon Language uses its own dialogue vocabulary and reverses unknown words locally', () => {
  const preset = validateSettings(defaultSettings()).presets.find(preset => preset.id === 'demon');
  const source = 'Tell me where the humans went, Shuu.';
  const spoken = convert(source, preset, ['Shuu']);
  assert.equal(spoken, 'Zhare niz khaven al vethan zoresh, Shuu.');
  assert.equal(convert(spoken, preset, ['Shuu'], true), source);
  const unknown = 'My quill is blue.';
  assert.equal(convert(convert(unknown, preset), preset, [], true), unknown);
  for (let start = 0; start < preset.words.length; start += 200) {
    const pairs = preset.words.slice(start, start + 200);
    assert.equal(convert(pairs.map(([word]) => word).join(' '), preset), pairs.map(([, coded]) => coded).join(' '));
    for (const format of [word => word, word => word.toUpperCase(), word => word[0].toUpperCase() + word.slice(1)]) {
      const dialogue = pairs.map(([word]) => format(word)).join(' ');
      assert.equal(convert(convert(dialogue, preset), preset, [], true), dialogue);
    }
  }
  const dialogue = 'Guard the gate, Shuu. The necromancer is here!';
  const encoded = convert(dialogue, preset, ['Shuu']);
  assert.equal(encoded, 'Kharven al asheth, Shuu. Al mavazhir esh eshar!');
  assert.equal(convert(encoded, preset, ['Shuu'], true), dialogue);
  const everyday = "I feel like these words are common. I'm using them now, and I don’t want to add more.";
  const glossary = new Map(preset.words);
  assert.ok(everyday.toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g).every(word => glossary.has(word)));
  assert.equal(convert(convert(everyday, preset), preset, [], true), everyday);
});

test('saved Demon Language settings gain new terms without overwriting edits', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-demon-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new WorkspaceStore(dir);
  const { workspace, revision } = store.read();
  const legacy = defaultSettings();
  delete legacy.demonVocabularyVersion;
  const demon = legacy.presets.find(preset => preset.id === 'demon');
  demon.words = demon.words.slice(0, 66);
  demon.words.push(['hello', 'ashzir'], ['realm', 'urvash']);
  legacy.names = ['Shuu', 'Eshar'];
  workspace.roleplay.languageSettings = legacy;
  store.save(workspace, revision);

  const roleplay = new Roleplay(store, {}, path.join(dir, 'assets'));
  const settings = validateSettings(roleplay.languageSettings());
  const upgraded = settings.presets.find(preset => preset.id === 'demon');
  const words = new Map(upgraded.words);
  assert.equal(words.get('hello'), 'ashzir');
  assert.equal(words.get('realm'), 'urvash');
  assert.equal(words.get('necromancer'), 'mavazhir');
  assert.equal(words.has('here'), false);
  assert.equal(words.has('other'), false);
  assert.ok(words.has('using'));
  assert.throws(() => roleplay.saveLanguages(legacy), /changed elsewhere/);

  upgraded.words = upgraded.words.filter(([word]) => word !== 'necromancer');
  roleplay.saveLanguages(settings);
  const reopened = new Roleplay(new WorkspaceStore(dir), {}, path.join(dir, 'assets'));
  assert.equal(reopened.languageSettings().presets.find(preset => preset.id === 'demon')
    .words.some(([word]) => word === 'necromancer'), false);
});

test('the second dictionary update preserves deletions from the first update', () => {
  const settings = defaultSettings();
  settings.demonVocabularyVersion = 1;
  const demon = settings.presets.find(preset => preset.id === 'demon');
  demon.words = demon.words.slice(0, 474).filter(([word]) => word !== 'necromancer');
  const upgraded = validateSettings(upgradeSettings(settings)).presets.find(preset => preset.id === 'demon');
  const words = new Map(upgraded.words);
  assert.equal(words.has('necromancer'), false);
  assert.ok(words.has('using'));
});

test('Demon-God Tongue textbook entries work offline in both directions', () => {
  const presets = validateSettings(defaultSettings()).presets;
  const preset = presets.find(preset => preset.id === 'demon-god-tongue');
  assert.deepEqual(preset.words.find(([english]) => english === 'This is a sword.'), [
    'This is a sword.', 'Inxeyqa wena.',
  ]);
  for (const [english, romanized] of preset.words) {
    assert.equal(convert(english, preset), romanized);
    assert.equal(convert(romanized, preset, [], true), english);
  }
  assert.throws(() => convert('Unpublished phrase', preset), /phrasebook/);
});

test('Roleplay persists selections and logs, sends converted text only, and keeps original rules for edits', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-language-test-'));
  const sent = [], edited = [];
  const hook = {
    id: 'webhook-fixture', token: 'fixture-only',
    send: async options => { sent.push(options); return { id: 'message-fixture' }; },
    editMessage: async (id, options) => { edited.push(options); return { id }; },
  };
  const bridge = {
    client: { isReady: () => true },
    messageDestination: async () => ({ id: '123', createWebhook: async () => hook }),
  };
  const open = () => {
    const roleplay = new Roleplay(new WorkspaceStore(dir), bridge, path.join(dir, 'assets'));
    roleplay.makeWebhook = () => hook;
    return roleplay;
  };
  let roleplay = open();
  const npc = roleplay.save({ name: 'Rikka', channelId: '123' });
  assert.equal(npc.languageId ?? '', '');
  const initial = roleplay.languageSettings();
  roleplay.saveLanguages({ ...initial, names: ['Shuu'] });
  assert.throws(() => roleplay.saveLanguages(initial), /changed elsewhere/);
  roleplay.setLanguage(npc.id, 'youkai');
  roleplay = open();
  assert.equal(roleplay.view().npcs[0].languageId, 'youkai');
  const request = { id: npc.id, requestId: 'fixture-request-one', text: 'Follow the path, Shuu.', voice: 'whisper', languageId: 'youkai' };
  const result = await roleplay.send(request);
  const expected = roleplay.previewLanguage({ id: 'youkai', text: request.text, decode: false }).text;
  assert.equal(sent[0].content, '-# > Rikka: ' + expected);
  assert.equal(result.delivery, 'sent');
  await roleplay.send(request);
  assert.equal(sent.length, 1);
  assert.equal(roleplay.languageLog()[0].text, request.text);
  assert.equal(roleplay.languageLog()[0].convertedText, expected);
  const active = roleplay.languageSettings();
  roleplay.saveLanguages({ ...active, presets: active.presets.filter(preset => preset.id !== 'youkai') });
  assert.equal(roleplay.view().npcs[0].languageId, '');
  await roleplay.editMessage({ requestId: request.requestId, originalText: request.text, text: 'The path.' });
  assert.equal(edited[0].content, '-# > Rikka: Ei heshima.');
  assert.equal(roleplay.languageLog()[0].text, 'The path.');
  roleplay.setLanguage(npc.id, 'japanese');
  await assert.rejects(roleplay.send({ ...request, requestId: 'fixture-request-two', languageId: 'japanese' }), /phrasebook/);
  assert.equal(sent.length, 1);
});
