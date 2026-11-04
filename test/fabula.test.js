const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MessageFlags } = require('discord.js');
const manager = require('../src/cogs/fabula/utils/fabulaManager');
const { DEFAULT_CHARACTER } = require('../src/cogs/fabula/utils/constants');
const { buildMainSheet, buildSectionPages, buildSectionPage } = require('../src/cogs/fabula/utils/sheetBuilder');
const resources = require('../src/cogs/fabula/handlers/resourceHandler');
const equipment = require('../src/cogs/fabula/handlers/equipmentHandler');
const classes = require('../src/cogs/fabula/handlers/classHandler');
const spells = require('../src/cogs/fabula/handlers/spellHandler');
const bonds = require('../src/cogs/fabula/handlers/bondHandler');
const character = require('../src/cogs/fabula/handlers/characterHandler');
const { handleFabulaInteraction } = require('../src/cogs/fabula/handlers/interactionHandler');
const { commands } = require('../src/cogs/fabula');

function characterData(extra = {}) {
  return { ...structuredClone(DEFAULT_CHARACTER), name: 'Hero', hp: { current: 10, max: 20 }, ...extra };
}
function temporaryStore(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-fabula-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, store: manager.createStore(root) };
}
function useStore(t, data = {}) {
  const { root, store } = temporaryStore(t);
  store.create('123', '456', characterData(data));
  for (const [key, method] of Object.entries(store)) t.mock.method(manager, key, method);
  return { root, store };
}
function interaction(values = {}) {
  return {
    guild: { id: '123' }, user: { id: '456' },
    options: {
      data: [],
      getString: key => values[key] ?? null,
      getInteger: key => values[key] ?? null,
      getUser: () => null,
      getSubcommand: () => values.sub || 'view',
      getSubcommandGroup: () => values.group || 'character',
    },
    fields: { getTextInputValue: key => values[key] ?? '' },
    replies: [], updates: [], modals: [],
    async reply(payload) { this.replies.push(payload); this.replied = true; },
    async followUp(payload) { this.replies.push(payload); },
    async update(payload) { this.updates.push(payload); this.replied = true; },
    async showModal(payload) { this.modals.push(payload); },
    isButton: () => false, isModalSubmit: () => false, isFromMessage: () => true,
  };
}

// All tests use throwaway directories or mocked stores, never a Discord login.
test('reads do not create directories; storage paths cannot escape the Fabula directory', t => {
  const { root, store } = temporaryStore(t);
  assert.equal(store.load('123', '456'), null);
  assert.deepEqual(fs.readdirSync(root), []);
  assert.throws(() => store.load('../outside', '456'), /valid server and user IDs/);
  assert.throws(() => store.create('123', '../../outside', {}), /valid server and user IDs/);
});

test('default fields and extension fields survive nested updates without shared template mutation', t => {
  const { store } = temporaryStore(t);
  const one = store.create('123', '456', { name: 'First', extension: { setting: 42 }, equipment: { mainhand: { name: 'Sword', custom: true } } });
  one.spells.push({ name: 'Local mutation' });
  const second = store.create('123', '789', { name: 'Second' });
  assert.deepEqual(second.spells, []);
  const changed = store.update('123', '456', { hp: { current: 5 }, equipment: { armor: { name: 'Coat' } }, classes: [{ name: 'Mage', level: 1 }] });
  assert.equal(changed.hp.max, 0);
  assert.equal(changed.equipment.mainhand.custom, true);
  assert.equal(changed.extension.setting, 42);
  assert.deepEqual(changed.classes[0].skills, []);
  assert.deepEqual(store.load('123', '456').spells, []);
});

test('duplicate creation cannot overwrite an existing or corrupt character file', t => {
  const { root, store } = temporaryStore(t);
  store.create('123', '456', { name: 'Original' });
  assert.throws(() => store.create('123', '456', { name: 'Replacement' }), /already have a character/);
  assert.equal(store.load('123', '456').name, 'Original');
  const filename = path.join(root, '123', '456.json');
  fs.writeFileSync(filename, '{broken');
  assert.throws(() => store.load('123', '456'), /original file has been preserved/);
  assert.throws(() => store.create('123', '456', {}), /already have a character/);
  assert.equal(fs.readFileSync(filename, 'utf8'), '{broken');
});

test('a failed atomic save leaves the original intact and cleans up the temporary file', t => {
  const { root, store } = temporaryStore(t);
  store.create('123', '456', { name: 'Original' });
  t.mock.method(fs, 'renameSync', () => { throw new Error('disk failure'); });
  assert.throws(() => store.update('123', '456', { name: 'Changed' }), /disk failure/);
  assert.equal(store.load('123', '456').name, 'Original');
  assert.deepEqual(fs.readdirSync(path.join(root, '123')), ['456.json']);
});

test('older BOM-prefixed files load defaults without changing the original file', t => {
  const { root, store } = temporaryStore(t);
  fs.mkdirSync(path.join(root, '123'));
  const filename = path.join(root, '123', '456.json');
  const raw = '\uFEFF{"name":"Legacy","custom":{"retain":true}}';
  fs.writeFileSync(filename, raw);
  const loaded = store.load('123', '456');
  assert.equal(loaded.name, 'Legacy');
  assert.equal(loaded.custom.retain, true);
  assert.deepEqual(loaded.equipment.items, []);
  assert.equal(fs.readFileSync(filename, 'utf8'), raw);
});

test('quick vital input rejects partial numbers, decimals, double signs, and unsafe integers', () => {
  for (const invalid of ['12hp', '+-5', '--5', '1.5', '+1.5', '1e3', '', '+', '9007199254740992']) {
    assert.equal(resources.parseValueInput(invalid), null, invalid);
  }
  assert.deepEqual(resources.parseValueInput(' +12 '), { mode: 'add', amount: 12 });
  assert.deepEqual(resources.parseValueInput('-5'), { mode: 'sub', amount: 5 });
  assert.deepEqual(resources.parseValueInput('0'), { mode: 'set', amount: 0 });
  assert.equal(resources.applyValue(10, 20, { mode: 'add', amount: 50 }), 20);
  assert.equal(resources.applyValue(10, 20, { mode: 'sub', amount: 50 }), 0);
  assert.equal(resources.applyValue(Number.MAX_SAFE_INTEGER, null, { mode: 'add', amount: 50 }), Number.MAX_SAFE_INTEGER);
});

test('clearing an accessory preserves all other slot positions and extension data', async t => {
  const { store } = useStore(t, { equipment: { accessories: [{ name: 'A' }, { name: 'B' }, { name: 'C', custom: true }] } });
  await equipment.handleAccessoryRemove(interaction({ slot: 2 }));
  assert.deepEqual(store.load('123', '456').equipment.accessories, [{ name: 'A' }, null, { name: 'C', custom: true }]);
});

test('skills reject duplicates and missing edit/remove targets without altering character data', async t => {
  const { store } = useStore(t, { classes: [{ name: 'Mage', level: 1, skills: [{ name: 'Study', description: 'Original' }] }] });
  const duplicate = interaction({ class: 'mage', name: 'STUDY', description: 'Replacement' });
  await classes.handleSkillAdd(duplicate);
  assert.match(duplicate.replies[0].embeds[0].data.title, /Already Added/);
  for (const method of [classes.handleSkillEdit, classes.handleSkillRemove]) {
    const missing = interaction({ class: 'Mage', name: 'Absent', description: 'Nope' });
    await method(missing);
    assert.match(missing.replies[0].embeds[0].data.title, /Not Found/);
  }
  assert.deepEqual(store.load('123', '456').classes[0].skills, [{ name: 'Study', description: 'Original' }]);
});

test('ability editing reports missing targets', async t => {
  useStore(t);
  const input = interaction({ name: 'Missing', description: 'Nope' });
  await spells.handleAbilityEdit(input);
  assert.match(input.replies[0].embeds[0].data.title, /Not Found/);
});

test('bond feelings are case-insensitive, deduplicated, and invalid entries are rejected as a whole', async t => {
  const { store } = useStore(t);
  await bonds.handleBondAdd(interaction({ name: 'Friend', feelings: 'affection, Affection, loyalty' }));
  assert.deepEqual(store.load('123', '456').bonds[0].feelings, ['Affection', 'Loyalty']);
  const invalid = interaction({ name: 'Another', feelings: 'Affection, typo' });
  await bonds.handleBondAdd(invalid);
  assert.match(invalid.replies[0].embeds[0].data.title, /Invalid Feelings/);
  assert.equal(store.load('123', '456').bonds.length, 1);
});

test('creation rejects malformed numbers and out-of-range levels before persistence', async t => {
  const create = t.mock.method(manager, 'create', () => { throw new Error('must not create'); });
  for (const values of [{ maxHp: '20abc' }, { maxIp: '-1' }, { level: '51' }, { level: '2.5' }]) {
    const input = interaction({ name: 'Hero', maxHp: '20', maxMp: '0', maxIp: '0', level: '1', ...values });
    await character.handleCreateSubmit(input);
    assert.match(input.replies[0].embeds[0].data.title, /Invalid/);
  }
  assert.equal(create.mock.callCount(), 0);
});

test('identity editing rejects whitespace names and invalid image schemes without saving', async t => {
  const update = t.mock.method(manager, 'update', () => { throw new Error('must not save'); });
  for (const values of [{ name: '   ' }, { imageUrl: 'javascript:alert(1)' }, { imageUrl: 'https://name:secret@example.com/image.png' }]) {
    const input = interaction({ name: 'Hero', ...values });
    await character.handleEditIdentitySubmit(input);
    assert.match(input.replies[0].embeds[0].data.title, /Invalid Identity/);
  }
  assert.equal(update.mock.callCount(), 0);
});

test('view is private and share is public, with non-pinging sheet content', async t => {
  useStore(t);
  const view = interaction();
  await character.handleView(view);
  assert.equal(view.replies[0].flags, MessageFlags.Ephemeral);
  const share = interaction();
  await character.handleShare(share);
  assert.equal(share.replies[0].flags, undefined);
  assert.deepEqual(share.replies[0].allowedMentions, { parse: [] });
});

test('old delete confirmations cannot remove a newly created character', async t => {
  const { store } = useStore(t);
  const token = manager.characterToken(store.load('123', '456'));
  store.remove('123', '456');
  store.create('123', '456', { name: 'Replacement' });
  const stale = interaction();
  stale.customId = `fab_del_confirm_456_${token}`;
  stale.isButton = () => true;
  await handleFabulaInteraction(stale);
  assert.match(stale.updates[0].content, /expired/);
  assert.equal(store.load('123', '456').name, 'Replacement');
  const current = interaction();
  current.customId = `fab_del_confirm_456_${manager.characterToken(store.load('123', '456'))}`;
  current.isButton = () => true;
  await handleFabulaInteraction(current);
  assert.equal(store.load('123', '456'), null);
});

test('quick resource controls enforce ownership and reject unknown resources', async t => {
  useStore(t);
  const input = interaction();
  await resources.handleQuickModal(input, 'hp', '789');
  assert.equal(input.modals.length, 0);
  assert.match(input.replies[0].embeds[0].data.title, /Not Your Sheet/);
  const unknown = interaction();
  await resources.handleQuickModalSubmit(unknown, 'unknown');
  assert.match(unknown.replies[0].content, /no longer valid/);
});

test('long sheets paginate without dropping entry text or exceeding Discord limits', () => {
  const char = characterData({
    spells: Array.from({ length: 40 }, (_, i) => ({ name: `Spell ${i}`, mpCost: i, target: 'One target', description: `MARKER-${i}:` + 'x'.repeat(2200) })),
    classes: Array.from({ length: 40 }, (_, i) => ({ name: `Class ${i}`, level: 1, skills: [{ name: 'Skill', description: 'y'.repeat(3000) }] })),
  });
  for (const section of ['spells', 'skills']) {
    const pages = buildSectionPages(char, section);
    assert.ok(pages.length > 1);
    for (const embed of pages) {
      const data = embed.toJSON();
      assert.ok(data.fields.length <= 25);
      for (const field of data.fields) assert.ok(field.value.length <= 1024 && field.name.length <= 256);
      const total = data.title.length + (data.description?.length || 0) + data.footer.text.length + data.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
      assert.ok(total <= 6000);
    }
  }
  const spellText = buildSectionPages(char, 'spells').flatMap(page => page.data.fields.map(field => field.value)).join('');
  for (let i = 0; i < 40; i++) assert.ok(spellText.includes(`MARKER-${i}:` + 'x'.repeat(2200)));
  buildMainSheet(char, '456').embeds[0].toJSON();
  const controls = buildSectionPage(char, 'spells', '456').components[0].toJSON().components;
  assert.equal(controls[1].disabled, true);
  assert.equal(controls[2].disabled, false);
});

test('weapon details retain category/type and do not double positive accuracy signs', () => {
  const char = characterData();
  char.equipment.mainhand = { name: 'Sword', category: 'Sword', damageType: 'Physical', accuracy: '+1', damage: 'd8+6' };
  const text = buildSectionPages(char, 'equipment')[0].data.fields[0].value;
  assert.match(text, /Sword • Physical/);
  assert.match(text, /\+1 Acc/);
  assert.doesNotMatch(text, /\+\+1/);
});

test('Fabula command serialization succeeds, rejects DMs and catches async failures', async t => {
  const command = commands[0];
  const json = command.data.toJSON();
  assert.equal(json.dm_permission, false);
  assert.equal(json.options.length, 16);
  const dm = interaction(); dm.guild = null;
  await command.execute(dm);
  assert.match(dm.replies[0].content, /server/);
  t.mock.method(console, 'error', () => {});
  t.mock.method(character, 'handleView', async () => { throw new Error('sensitive-file-path'); });
  const failed = interaction();
  await command.execute(failed);
  assert.match(failed.replies[0].content, /Unable to update/);
  assert.doesNotMatch(failed.replies[0].content, /sensitive-file-path/);
});

test('missing-character failures are acknowledged through command and component routers', async t => {
  t.mock.method(manager, 'load', () => null);
  t.mock.method(console, 'error', () => {});
  const slash = interaction({ group: 'hp', sub: 'add', value: 1 });
  await commands[0].execute(slash);
  assert.match(slash.replies[0].content, /create/);
  const modal = interaction({ value: '+1' });
  modal.customId = 'fab_qkm_hp'; modal.isModalSubmit = () => true;
  await handleFabulaInteraction(modal);
  assert.match(modal.replies[0].content, /create/);
});

test('blank slash inputs and no-op edits are rejected before writing', async t => {
  const { store } = useStore(t, { spells: [{ name: 'Light', mpCost: 1, target: 'Self', description: '' }] });
  const original = store.load('123', '456').updatedAt;
  const input = interaction({ group: 'class', sub: 'add', name: '   ' });
  input.options.data = [{ name: 'class', options: [{ name: 'add', options: [{ name: 'name', value: '   ' }] }] }];
  t.mock.method(console, 'error', () => {});
  await commands[0].execute(input);
  assert.match(input.replies[0].content, /cannot be blank/);
  const spell = interaction({ name: 'Light' });
  await spells.handleSpellEdit(spell);
  assert.match(spell.replies[0].content, /at least one field/);
  const stats = interaction();
  await equipment.handleStats(stats);
  assert.match(stats.replies[0].content, /at least one total/);
  assert.equal(store.load('123', '456').updatedAt, original);
});

test('two quick adjustments apply to the latest stored value and a pool maximum clamps current', async t => {
  const { store } = useStore(t);
  await Promise.all([
    resources.handleQuickModalSubmit(interaction({ value: '-3' }), 'hp'),
    resources.handleQuickModalSubmit(interaction({ value: '-2' }), 'hp'),
  ]);
  assert.equal(store.load('123', '456').hp.current, 5);
  await resources.handleHp(interaction({ sub: 'max', value: 2 }));
  assert.deepEqual(store.load('123', '456').hp, { current: 2, max: 2 });
});

test('page controls fetch current data and update their private message', async t => {
  useStore(t, { abilities: Array.from({ length: 30 }, (_, i) => ({ name: `Ability ${i}`, description: 'x'.repeat(600) })) });
  const input = interaction();
  input.customId = 'fab_page_spells_456_1'; input.isButton = () => true;
  await handleFabulaInteraction(input);
  assert.equal(input.replies.length, 0);
  assert.match(input.updates[0].embeds[0].data.footer.text, /Page 2/);
});

test('malformed persisted resources produce a recoverable error rather than overwriting data', t => {
  const { root, store } = temporaryStore(t);
  store.create('123', '456', { name: 'Hero' });
  const filename = path.join(root, '123', '456.json');
  const raw = '{"name":"Hero","hp":{"current":"NaN","max":20}}';
  fs.writeFileSync(filename, raw);
  assert.throws(() => store.update('123', '456', { name: 'Changed' }), /original file has been preserved/);
  assert.equal(fs.readFileSync(filename, 'utf8'), raw);
});
