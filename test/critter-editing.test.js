const { test } = require('node:test'), assert = require('node:assert/strict');
const YAML = require('yaml');
const C = require('../src/critter/public/core'), M = require('../src/critter/public/combat-model');
const { fieldsFor, editAbility } = require('../src/critter/ability-editor');
const { creature, bestiary } = require('./critter-fixture');
const fs = require('fs'), os = require('os'), path = require('path');
const { createService } = require('../src/critter/server');
test('source monster saves/checks use ms/mc and never the combat alias', () => {
  assert.equal(M.monsterRoll('Tewi Inaba', 'save', 'dex'), '!ms "Tewi Inaba" dex');
  assert.equal(M.monsterRoll('Tewi Inaba', 'check', 'dex'), '!mc "Tewi Inaba" dex');
  assert.equal(M.monsterRoll('Tewi Inaba', 'check', 'Sleight of Hand', 'adv'), '!mc "Tewi Inaba" "Sleight of Hand" adv');
  assert.throws(() => M.monsterRoll('Tewi', 'save', 'madeup'));
});
test('initiative drag assigns visible descending scores and preserves source data and row metadata', () => {
  const rows = [{ id: 'a', name: 'First', fixedInitiative: '18', initiativeBonus: '', extra: { keep: true } }, { id: 'b', name: 'Second', fixedInitiative: '10', initiativeBonus: '3' }];
  const moved = M.move(rows, 'b', 'a'); assert.deepEqual(moved.map(e => e.id), ['b', 'a']); assert.deepEqual(moved.map(e => e.fixedInitiative), ['20', '19']);
  assert.deepEqual(moved[1].extra, { keep: true }); assert.equal(rows[0].fixedInitiative, '18');
  assert.deepEqual(M.ordered([{ fixedInitiative: '' }, { fixedInitiative: '1' }, { fixedInitiative: '20' }]).map(e => e.fixedInitiative), ['20', '1', '']);
});
test('breath editing changes only selected scalar ranges, keeps shared damage and unknown YAML byte for byte', () => {
  const original = creature(); original.stats.actions[0].description = original.stats.actions[0].description.replace('_v: 2', '_v: 2\n# Preserve this comment\nunknown: {nested: [one, two]}');
  const fields = fieldsFor(original.stats.actions[0].description), by = label => fields.find(f => f.label === label);
  const edited = editAbility(original, [{ section: 'actions', index: 0, fields: [
    { id: fields.find(f => f.kind === 'dice').id, value: '16d8' }, { id: fields.find(f => f.kind === 'damageType').id, value: 'fire' },
    { id: by('Target save DC').id, value: '25' }, { id: by('Target saving throw ability').id, value: 'dex' },
  ] }]);
  const expected = original.stats.actions[0].description.replace('15d8[cold]', '16d8[fire]').replace('stat: con', 'stat: dex').replace('dc: "24"', 'dc: "25"');
  assert.equal(edited.stats.actions[0].description, expected);
  const unchanged = C.clone(edited); unchanged.stats.actions[0].description = original.stats.actions[0].description; assert.deepEqual(unchanged, original);
  const yaml = YAML.parse(C.splitDescription(edited.stats.actions[0].description).blocks[0].source);
  assert.equal(yaml.automation[1].effects[0].fail[0].damage, '{breathDamage}'); assert.equal(yaml.automation[1].effects[0].success[0].damage, '({breathDamage})/2');
  assert.deepEqual(editAbility(original, [{ section: 'actions', index: 0, fields: [] }]), original);
});
test('to-hit, damage type and dice edits preserve unknown attack effects', () => {
  const original = creature(); original.stats.actions[0].description = 'Rules\n<avrae hidden>\nname: Strike\nautomation:\n- type: attack\n  attackBonus: 11\n  keep: unchanged\n  hit:\n  - type: damage\n    damage: 2d6[cold]\n  miss: []\n</avrae>';
  const fields = fieldsFor(original.stats.actions[0].description);
  const edited = editAbility(original, [{ section: 'actions', index: 0, fields: fields.filter(f => ['To-hit bonus', 'Damage — dice', 'hit — damage — dice', 'hit — damage — type'].includes(f.label)).map(f => ({ id: f.id, value: f.label === 'To-hit bonus' ? '13' : f.kind === 'dice' ? '3d8' : 'lightning' })) }]);
  assert.match(edited.stats.actions[0].description, /attackBonus: 13/); assert.match(edited.stats.actions[0].description, /3d8\[lightning\]/); assert.match(edited.stats.actions[0].description, /keep: unchanged/);
});
test('editing the second identical automation block leaves the first unchanged', () => {
  const c = creature(), block = '<avrae hidden>\nname: Strike\nautomation:\n- type: damage\n  damage: 1d6[cold]\n</avrae>';
  c.stats.actions[0].description = 'Rules\n' + block + '\nBetween blocks\n' + block;
  const field = fieldsFor(c.stats.actions[0].description).find(f => f.block === 1 && f.kind === 'dice');
  const result = editAbility(c, [{ section: 'actions', index: 0, fields: [{ id: field.id, value: '2d6' }] }]);
  assert.equal(result.stats.actions[0].description, 'Rules\n' + block + '\nBetween blocks\n' + block.replace('1d6', '2d6'));
});
test('full bestiary export retains metadata and every unrelated creature; single creature stays separate', () => {
  const data = bestiary(), w = C.blankWorkspace(); w.documents.push({ id: 'doc', label: 'source', data, keys: ['first', 'second'] });
  w.documents[0].data.creatures[0].stats.armorClass = 24;
  assert.deepEqual(M.bestiary(w, 'first').futureCollectionField, data.futureCollectionField);
  assert.deepEqual(M.bestiary(w, 'first').creatures[1], data.creatures[1]);
  assert.equal(M.bestiary(w, 'first').creatures[0].stats.armorClass, 24);
});
test('2024 HTML rules expose independent damage components and target saves without generating automation', () => {
  const c = creature(); c.stats.actions = [{ name: 'Rend', description: '<i>Melee Attack Roll:</i> +17, reach 15 ft. <i>Hit:</i> 19 (2d8 + 10) Slashing damage plus 9 (2d8) Cold damage.' }, { name: 'Paralyzing Breath', description: '<i>Constitution Saving Throw:</i> DC 24. The target is Incapacitated until its next turn.' }];
  const hit = fieldsFor(c.stats.actions[0].description), save = fieldsFor(c.stats.actions[1].description);
  const edited = editAbility(c, [{ section: 'actions', index: 0, fields: [{ id: hit.find(f => f.label === 'To-hit bonus').id, value: '19' }, { id: hit.find(f => f.label === 'Damage 1 dice').id, value: '3d8 + 10' }] }, { section: 'actions', index: 1, fields: [{ id: save.find(f => f.label === 'Target saving throw ability').id, value: 'wis' }, { id: save.find(f => f.label === 'Target save DC').id, value: '26' }] }]);
  assert.equal(edited.stats.actions[0].description, c.stats.actions[0].description.replace('+17', '+19').replace('2d8 + 10', '3d8 + 10'));
  assert.equal(edited.stats.actions[1].description, c.stats.actions[1].description.replace('Constitution', 'Wisdom').replace('24', '26'));
  assert.equal(C.splitDescription(edited.stats.actions[0].description).blocks.length, 0);
});
test('local creature saves retain an original backup and reject stale edits and identity changes', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-edit-test-')), service = createService({ directory, port: 0 }); await service.start();
  t.after(async () => { await service.close(); assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'aina-edit-test-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const imported = service.importJSON(bestiary(), 'source.json'), key = imported.workspace.documents[0].keys[0], original = C.clone(imported.workspace.documents[0].data.creatures[0]);
  const request = body => fetch(service.url + '/api/creature', { method: 'PUT', headers: { 'X-Aina-Local': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const candidate = C.clone(original); candidate.stats.armorClass = 24;
  assert.equal((await request({ key, original, candidate })).status, 200);
  const files = fs.readdirSync(path.join(directory, 'creature-backups')); assert.equal(files.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'creature-backups', files[0]))).original, original);
  assert.equal((await request({ key, original, candidate })).status, 409);
  assert.equal((await request({ key, original: candidate, candidate: { ...candidate, _id: 'replacement' } })).status, 400);
  assert.deepEqual(service.store.value.documents[0].data.creatures[1], imported.workspace.documents[0].data.creatures[1]);
});
