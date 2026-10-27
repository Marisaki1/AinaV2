const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Core = require('../src/critter/public/core');
const { inspectCreature } = require('../src/critter/automation');
const { WorkspaceStore } = require('../src/critter/store');
const { DiscordBridge } = require('../src/critter/discord');
const { createService } = require('../src/critter/server');
const { creature, bestiary } = require('./critter-fixture');
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-critter-test-'));
  t.after(() => {
    // Only files created in this test directory are removed, with no recursive operations.
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
    fs.rmdirSync(dir);
  });
  return dir;
}
function document(data, id = 'document') { return { id, label: 'test.json', data, keys: Core.list({ data }).map((_, i) => id + '-' + i) }; }

test('creature and bestiary round trips preserve unknown fields, HTML, and shared-roll automation', () => {
  for (const original of [creature(), bestiary()]) {
    const imported = Core.importData(JSON.parse(JSON.stringify(original)));
    assert.deepEqual(imported.data, original);
    const value = imported.data.creatures?.[0] || imported.data;
    value.stats.armorClass = 23;
    const exported = JSON.parse(JSON.stringify(imported.data));
    const after = exported.creatures?.[0] || exported;
    assert.deepEqual(after.extra, creature().extra);
    assert.deepEqual(after.stats.skills, creature().stats.skills);
    assert.equal(after.stats.actions[0].description, creature().stats.actions[0].description);
    assert.equal(after.flavor.description, creature().flavor.description);
    if (exported.creatures) { assert.deepEqual(exported.creatures[1], original.creatures[1]); assert.equal(exported._id, original._id); assert.deepEqual(exported.futureCollectionField, original.futureCollectionField); }
  }
});
test('unsupported imports are rejected and duplicate IDs are detached', () => {
  assert.throws(() => Core.importData({ name: 'No stats' }), /stats/);
  assert.throws(() => Core.importData({ creatures: [{ name: 'Bad' }] }), /stats/);
  assert.throws(() => Core.parseJSON('{bad'), /Invalid JSON/);
  const duplicate = Core.duplicateCreature(creature());
  assert.equal(duplicate._id, undefined); assert.equal(duplicate.bestiaryId, undefined);
  assert.equal(creature()._id, 'original-critter-id');
  assert.deepEqual(duplicate.stats, creature().stats);
  assert.throws(() => Core.importData({ name: 'Malformed', stats: { skills: 'wrong type' } }), /skills/);
  assert.throws(() => Core.importData({ name: 'Malformed', stats: { senses: {} } }), /senses/);
});
test('readable edits preserve exact automation, including one shared damage roll', () => {
  const original = creature().stats.actions[0].description;
  const edited = Core.replaceReadable(original, '<p>Edited readable text.</p>');
  assert.equal(Core.splitDescription(edited).blocks[0].raw, Core.splitDescription(original).blocks[0].raw);
  assert.equal((edited.match(/type: roll/g) || []).length, 1);
  assert.match(edited, /dc: "24"/); assert.match(edited, /15d8\[cold\]/);
});
test('automation inspection parses YAML, multiple blocks, shorthand, and all ability sections', () => {
  const value = creature();
  for (const section of Core.sections.slice(0, 4)) value.stats[section] = [{ name: 'Visible title', description: creature().stats.actions[0].description }];
  const report = inspectCreature(value);
  assert.equal(report.length, 4);
  for (const row of report) { assert.deepEqual(row.names, ['Cold Breath']); assert.equal(row.status, 'explicit'); }
  value.stats.actions[0].description = '<avrae hidden>Swing|+5|1d8[slashing]</avrae>';
  assert.deepEqual(inspectCreature(value).find(r => r.section === 'actions').names, ['Swing']);
  value.stats.actions[0].description = '<avrae hidden>name: [bad</avrae>';
  assert.match(inspectCreature(value).find(r => r.section === 'actions').warnings[0], /Invalid automation YAML/);
  value.stats.actions[0].description = 'Melee Attack Roll: +5. Paralyzed.';
  const warnings = inspectCreature(value).find(r => r.section === 'actions').warnings.join(' ');
  assert.match(warnings, /2024/); assert.match(warnings, /Descriptions alone/);
});
test('reminders do not become executable macros while individual attacks and activated effects remain available', () => {
  const c = Core.blankCreature('Reminder test');
  c.stats.actions = [
    { name: 'Multiattack', description: 'Makes three attacks.' },
    { name: 'Extra Attack', description: 'Attack twice.' },
    { name: 'Multiattack (old export)', description: '<avrae hidden>name: Multiattack\nautomation:\n- type: target\n  target: each\n  effects:\n  - type: attack\n    attackBonus: 5\n    hit: []\n    miss: []</avrae>' },
    { name: 'Pickaxe', description: '<avrae hidden>name: Pickaxe\nautomation:\n- type: target\n  target: each\n  effects:\n  - type: attack\n    attackBonus: 5\n    hit: []\n    miss: []</avrae>' },
  ];
  c.stats.additionalAbilities = [
    { name: 'Unarmored Defense', description: 'AC includes Constitution.' },
    { name: 'Rage', description: '<avrae hidden>name: Rage\nautomation:\n- type: target\n  target: self\n  effects:\n  - type: ieffect2\n    name: Rage\n    effects:\n      damage_bonus: 2</avrae>' },
  ];
  const rows = inspectCreature(c);
  for (const title of ['Multiattack', 'Extra Attack', 'Multiattack (old export)', 'Unarmored Defense']) assert.equal(rows.find(r => r.title === title).reminderOnly, true, title);
  for (const title of ['Pickaxe', 'Rage']) assert.equal(rows.find(r => r.title === title).reminderOnly, false, title);
});

test('encounter commands distinguish source name, alias, initiative bonus, and fixed placement', () => {
  const e = { sourceName: 'Tewi Inaba', name: 'Tewi', controller: '123456789012345678', fixedInitiative: 23, ac: 20, hp: 30, thp: 5, group: 'Team One', notes: 'Keep original rules' };
  const command = Core.encounterCommand(e);
  assert.equal(command, '!i madd "Tewi Inaba" -name "Tewi" -controller "<@123456789012345678>" -p 23 -ac 20 -hp 30 -thp 5 -group "Team One" -note "Keep original rules"');
  assert.equal(Core.encounterCommand({ sourceName: 'Ancient Silver Dragon', name: 'Dragon', initiativeBonus: 14 }), '!i madd "Ancient Silver Dragon" -name "Dragon" -b 14');
  assert.throws(() => Core.encounterCommand({ ...e, initiativeBonus: 14 }), /OR/);
  assert.throws(() => Core.encounterCommand({ ...e, controller: '@shuunou' }), /placeholders/);
  assert.equal(Core.encounterCommand({ sourceName: 'Cultist', name: 'Cult#', quantity: '1d4' }), '!i madd "Cultist" -name "Cult#" -n 1d4');
});
test('encounter names detect direct and numbered collisions; dice quantities are accepted', () => {
  assert.throws(() => Core.validateEncounter([{ name: 'Cult#', quantity: 4 }, { name: 'Cult2' }]), /Conflicting|overlaps/);
  assert.throws(() => Core.validateEncounter([{ name: 'Tewi' }, { name: 'tewi' }]), /Duplicate/);
  assert.throws(() => Core.validateEncounter([{ name: 'Cult', quantity: 4 }]), /Use #/);
  assert.doesNotThrow(() => Core.validateEncounter([{ name: 'Cult#', quantity: '1d4' }]));
  assert.throws(() => Core.quantity('0'), /Quantity/);
});
test('command modes quote embedded quotes, select multiple targets, and use the correct actor scope', () => {
  const command = Core.command({ mode: 'aoo', actor: 'Dragon "One"', action: 'Cold Breath', targets: ['Tewi Inaba', 'Seija'], roll: 'adv', attackBonus: -3, damageBonus: '1d4[cold]', repeat: 2 });
  assert.equal(command, '!i aoo "Dragon \\"One\\"" "Cold Breath" -t "Tewi Inaba" -t "Seija" adv -b "-3" -d "1d4[cold]" -rr 2');
  assert.deepEqual(Core.tokenize(Core.quote('A "B" \\ C')), ['A "B" \\ C']);
  assert.equal(Core.command({ mode: 'ma', sourceName: 'Ancient Silver Dragon', actor: 'Dragon', action: 'Cold Breath', targets: [] }), '!ma "Ancient Silver Dragon" "Cold Breath"');
  assert.equal(Core.command({ mode: 'action', actor: 'Ignored', action: 'Bite' }), '!i a "Bite"');
  assert.equal(Core.command({ mode: 'rc', actor: 'Cult 4', action: 'Healing Word', level: 2 }), '!i rc "Cult 4" "Healing Word" -l 2');
  assert.equal(Core.command({ mode: 'moncast', sourceName: 'Cult Female', action: 'Healing Word' }), '!moncast "Cult Female" "Healing Word"');
});
test('HP, saves, opt, and combat controls use documented command syntax', () => {
  assert.equal(Core.command({ mode: 'hp', actor: 'Target', value: '-7' }), '!i hp "Target" -7');
  assert.equal(Core.command({ mode: 'hp', actor: 'Target', value: '8' }), '!i hp "Target" +8');
  assert.equal(Core.command({ mode: 'hpSet', actor: 'Target', value: 30 }), '!i hp set "Target" 30');
  assert.equal(Core.command({ mode: 'thp', actor: 'Target', value: 20 }), '!i thp "Target" 20');
  assert.equal(Core.command({ mode: 'save', actor: 'Target', save: 'con' }), '!i os "Target" con');
  assert.equal(Core.command({ mode: 'opt', actor: 'Target', fixedInitiative: 17, ac: 20 }), '!i opt "Target" -p 17 -ac 20');
  assert.equal(Core.command({ mode: 'begin' }, '?'), '?init begin');
  assert.equal(Core.command({ mode: 'dm' }), '!i add 100 "DungeonMaster"');
  assert.equal(Core.command({ mode: 'next' }), '!i next');
  assert.equal(Core.command({ mode: 'end' }), '!init end');
});

test('action modifiers generate exclusive critical flags and additive quoted hit/damage bonuses', () => {
  const action = { mode: 'aoo', actor: 'Dragon2', action: 'Bite', targets: ['Hero'], roll: 'adv', critical: 'crit', attackBonus: '-2', damageBonus: '1d6[fire]+3' };
  assert.equal(Core.command(action), '!i aoo "Dragon2" "Bite" -t "Hero" adv crit -b "-2" -d "1d6[fire]+3"');
  assert.equal(Core.command({ ...action, critical: 'nocrit' }), '!i aoo "Dragon2" "Bite" -t "Hero" adv nocrit -b "-2" -d "1d6[fire]+3"');
  assert.equal(Core.command({ mode: 'ma', sourceName: 'Dragon', action: 'Bite', critical: 'normal', attackBonus: '1d4' }), '!ma "Dragon" "Bite" -b "1d4"');
  assert.throws(() => Core.command({ ...action, critical: 'crit nocrit' }), /Choose normal, crit/);
  for (const advanced of ['crit', 'nocrit', 'crit1', 'nocrit1']) assert.throws(() => Core.command({ ...action, advanced }), /controls/);
  assert.throws(() => Core.command({ ...action, damageBonus: '1d6\n!init end' }), /control/);
  assert.equal(Core.command({ mode: 'action', action: 'Bite', advanced: 'crit' }), '!i a "Bite" crit'); // Existing advanced-editor input remains compatible.
});
test('command validation rejects unsafe names and contradictory roll modifiers', () => {
  assert.throws(() => Core.command({ mode: 'aoo', actor: 'A\n!init end', action: 'Hit' }), /control/);
  assert.throws(() => Core.command({ mode: 'action', action: 'Hit', roll: 'adv dis' }), /Choose/);
  for (const advanced of ['adv', 'dis', 'adv1', '-rr 2', '--t Other']) assert.throws(() => Core.command({ mode: 'action', action: 'Hit', advanced }), /controls/);
  assert.throws(() => Core.command({ mode: 'action', action: 'Hit', advanced: '-phrase "unclosed' }), /Unclosed/);
  assert.throws(() => Core.command({ mode: 'hp', actor: 'A', value: '+-3' }), /integer/);
});
test('workspace persistence survives reload, protects concurrent saves, and excludes app credentials', t => {
  const directory = temporary(t), store = new WorkspaceStore(directory), w = Core.blankWorkspace();
  w.documents.push(document(bestiary())); w.DISCORD_TOKEN = 'not-a-backup-field';
  const result = store.save(w, 0);
  assert.equal(result.workspace.DISCORD_TOKEN, undefined);
  assert.deepEqual(new WorkspaceStore(directory).read().workspace.documents[0].data, bestiary());
  assert.throws(() => store.save(w, 0), /another window/);
  const invalid = Core.clone(w); invalid.documents[0].data.creatures[0].stats = null;
  assert.throws(() => store.save(invalid, 1));
  assert.deepEqual(store.read(), result);
  assert.equal(Core.averageHP(creature()), 487);
});

function mockDiscord(directory) {
  const deleted = [], sent = [];
  const messages = new Map();
  const channel = { id: 'channel', type: 0, guild: { id: 'server', members: { fetch: async () => ({ id: 'owner' }) } }, permissionsFor: () => ({ has: () => true }), async send(payload) {
    const id = 'message-' + (sent.length + 1);
    const msg = { id, author: { id: 'bot' }, async react() {}, async delete() { deleted.push(id); } };
    messages.set(id, msg); sent.push(payload); return msg;
  }, messages: { async fetch(id) { return messages.get(id); } } };
  const client = { user: { id: 'bot' }, isReady: () => true, channels: { async fetch() { return channel; } } };
  const bridge = new DiscordBridge(client, directory, 'owner');
  bridge.channels = async () => [{ id: 'channel', name: 'Test channel' }];
  return { bridge, client, deleted, sent };
}
test('Discord posts one copyable preview and restricts deletion to its owner and matching channel', async t => {
  const directory = temporary(t), { bridge, deleted, sent } = mockDiscord(directory);
  await bridge.post('channel', ['!i next', '!i next'], '!');
  assert.deepEqual(sent[0].allowedMentions, { parse: [], repliedUser: false });
  assert.match(sent[0].content, /```text\n!i next/);
  assert.deepEqual(sent[0].components[0].components.map(b=>b.data.label), ['Confirm','Reaction','Cancel']);
  await bridge.onMessage({ author: { id: 'other', bot: false }, channelId: 'channel', content: '!i next' });
  await bridge.onMessage({ author: { id: 'owner', bot: false }, channelId: 'other', content: '!i next' });
  assert.equal(deleted.length, 0);
  await bridge.onMessage({ author: { id: 'owner', bot: false }, channelId: 'channel', content: '!i next' });
  assert.deepEqual(deleted, []); assert.equal(bridge.pending.size, 2);
  bridge.pending.get('message-1').controlsVersion = 1; bridge.pending.get('message-2').controlsVersion = 1;
  await bridge.onMessage({author:{id:'owner',bot:false},channelId:'channel',content:'!i next'});
  assert.deepEqual(deleted, ['message-1']); assert.equal(bridge.pending.size, 1);
  bridge.persist();
  const restarted = new DiscordBridge(bridge.client, directory, 'owner');
  await restarted.onReaction({ emoji: { name: '✅' }, message: { id: 'message-2' } }, { id: 'owner', bot: false });
  assert.deepEqual(deleted, ['message-1', 'message-2']); assert.equal(restarted.pending.size, 0);
});
test('✅ button acknowledges first and then deletes the bot preview', async t => {
  const { bridge, deleted } = mockDiscord(temporary(t));
  await bridge.post('channel', ['!i list'], '!');
  let denied;
  await bridge.onButton({ isButton: () => true, customId: 'critter:copied', message: { id: 'message-1' }, user: { id: 'other' }, async reply(payload) { denied = payload; } });
  assert.equal(denied.flags, 64); assert.equal(deleted.length, 0);
  let acknowledged = false;
  await bridge.onButton({ isButton: () => true, customId: 'critter:copied', message: { id: 'message-1' }, user: { id: 'owner' }, async deferUpdate() { acknowledged = true; assert.equal(deleted.length, 0); } });
  assert.equal(acknowledged, true); assert.deepEqual(deleted, ['message-1']);
});
test('local API serves offline, imports safely, rejects cross-origin access, and posts only when connected', async t => {
  const service = createService({ directory: temporary(t), port: 0 });
  await service.start(); t.after(() => service.close());
  const request = (url, method = 'GET', data, headers = {}) => fetch(service.url + url, { method, headers: { 'X-Aina-Local': '1', 'Content-Type': 'application/json', ...headers }, body: data ? JSON.stringify(data) : undefined });
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/api/workspace', 'GET', null, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await fetch(service.url + '/api/workspace')).status, 403);
  const imported = service.importJSON(bestiary(), 'dragons.json');
  assert.deepEqual(imported.workspace.documents[0].data, bestiary());
  const exported = await (await request('/api/workspace')).json();
  assert.deepEqual(exported.workspace.documents[0].data, bestiary());
  const invalid = await request('/api/workspace', 'PUT', { workspace: { wrong: true }, revision: exported.revision });
  assert.equal(invalid.status, 400);
  assert.equal((await request('/api/post', 'POST', { channelId: 'channel', commands: ['!i next'] })).status, 400);
  assert.equal((await (await request('/api/status')).json()).connected, false);
  const analyzed = await (await request('/api/analyze', 'POST', { creature: creature() })).json();
  assert.deepEqual(analyzed.abilities[0].names, ['Cold Breath']);
});
