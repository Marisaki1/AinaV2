const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const C = require('../src/critter/public/core'), X = require('../src/critter/public/creature-math');
const T = require('../src/critter/public/combat-traits'), { calculate } = require('../src/critter/creature-calculations');
const { fieldsFor } = require('../src/critter/ability-editor');
const { createService } = require('../src/critter/server');
const { creature } = require('./critter-fixture');

test('base + DEX is the default; imported AC is preserved until DEX changes', () => {
  const c = creature(); c.stats.armorClass = 22; c.stats.abilityScores.dexterity = 20;
  const cfg = X.infer(c); assert.equal(cfg.ac.mode, 'dex'); assert.equal(cfg.ac.base, 17);
  assert.equal(X.apply(c, cfg).stats.armorClass, 22);
  c.stats.abilityScores.dexterity = 21; assert.equal(X.apply(c, cfg).stats.armorClass, 22);
  c.stats.abilityScores.dexterity = 22; assert.equal(X.apply(c, cfg).stats.armorClass, 23);
  cfg.ac.mode = 'capped'; cfg.ac.cap = 2; assert.equal(X.apply(c, cfg).stats.armorClass, 19);
  cfg.ac.mode = 'fixed'; cfg.ac.base = 22; assert.equal(X.apply(c, cfg).stats.armorClass, 22);
  cfg.ac.mode = 'two'; cfg.ac.base = 10; cfg.ac.other = 'constitution'; assert.equal(X.apply(c, cfg).stats.armorClass, 25);
});

test('full, half, expertise, custom totals and negative ability modifiers are consistent', () => {
  const c = C.blankCreature('Test'); c.stats.proficiencyBonus = 7; c.stats.abilityScores.dexterity = 20; c.stats.abilityScores.wisdom = 8;
  c.stats.savingThrows = [{ ability: 'dexterity', proficient: true, value: 7, unknown: 'keep' }, { ability: 'wisdom', proficient: false, value: 20 }];
  c.stats.skills = [{ name: 'Stealth', proficient: false, value: 0 }, { name: 'Perception', proficient: true }];
  const cfg = X.infer(c); cfg.skills.stealth = 'half'; cfg.skills.perception = 'expert';
  let next = X.apply(c, cfg);
  assert.equal(next.stats.savingThrows[0].value, 12); assert.equal(next.stats.savingThrows[0].unknown, 'keep');
  assert.equal(next.stats.savingThrows[1].value, 20); assert.equal(next.stats.skills[0].value, 8); assert.equal(next.stats.skills[0].proficient, false);
  assert.equal(next.stats.skills[1].value, 13);
  c.stats.abilityScores.dexterity = 22; c.stats.proficiencyBonus = 8; next = X.apply(c, cfg);
  assert.equal(next.stats.savingThrows[0].value, 14); assert.equal(next.stats.skills[0].value, 10);
  cfg.saves.dexterity = 'half'; assert.equal(X.apply(c, cfg).stats.savingThrows[0].value, 10);
  assert.equal(c.stats.savingThrows[0].value, 7); // no input mutation
  assert.equal(X.mod(9), -1);
});

test('PB from CR is opt-in; HP responds to CON and hit dice', () => {
  const c = creature(), cfg = X.infer(c); c.stats.numHitDie = 24; c.stats.abilityScores.constitution = 31; c.stats.challengeRating = 28;
  assert.equal(C.averageHP(X.apply(c, cfg)), 492); assert.equal(X.apply(c, cfg).stats.proficiencyBonus, 7);
  cfg.pb = 'cr'; assert.equal(X.apply(c, cfg).stats.proficiencyBonus, 8);
  assert.equal(X.pbForCR(0.125), 2); assert.equal(X.pbForCR(5), 3); assert.equal(X.pbForCR(17), 6);
});

test('refreshing a remote edit preserves explicit external AC and custom totals without losing formulas', () => {
  const old = creature(); old.stats.abilityScores.dexterity = 20; old.stats.armorClass = 22;
  const cfg = X.infer(old); cfg.skills.perception = 'half'; old.stats.skills[0].value = 3;
  const remote = C.clone(old); remote.stats.armorClass = 30; remote.stats.skills[0].value = 21;
  const next = X.reconcile(cfg, remote, old);
  assert.equal(next.ac.mode, 'dex'); assert.equal(X.apply(remote, next).stats.armorClass, 30);
  assert.equal(next.skills.perception, 'fixed'); assert.equal(X.apply(remote, next).stats.skills[0].value, 21);
});

test('explicit action links update only chosen fields and preserve unknown automation and metadata', () => {
  const c = creature(), cfg = X.infer(c), dc = fieldsFor(c.stats.actions[0].description).find(f => f.label === 'Target save DC');
  cfg.links.push({ section: 'actions', index: 0, entryName: c.stats.actions[0].name, field: dc.id, kind: 'dc', ability: 'constitution', bonus: 0 });
  c.stats.abilityScores.constitution = 31;
  const next = calculate(c, cfg);
  assert.match(next.stats.actions[0].description, /dc: "25"/); assert.deepEqual(next.extra, c.extra);
  assert.equal(next.stats.actions[0].extra, c.stats.actions[0].extra);
  assert(next.stats.actions[0].description.includes('dice: 15d8[cold]'));
  cfg.links[0].entryName = 'Different action'; assert.throws(() => calculate(c, cfg), /moved or changed/);
});

test('row roll inheritance separates saves, skills, base checks and conditional restrictions', () => {
  const cfg = { id: 'a'.repeat(32), traits: [
    { id: 'cha-save', scope: 'saves', selected: ['charisma'], mode: 'adv', rules: 'Original', restriction: '' },
    { id: 'stealth', scope: 'skills', selected: ['stealth'], mode: 'dis', rules: 'Original', restriction: '' },
    { id: 'conditional', scope: 'saves', selected: ['strength'], mode: 'adv', rules: 'Original', restriction: 'while raging' },
  ] };
  assert.equal(T.inherited(cfg, 'save', 'cha'), 'adv'); assert.equal(T.inherited(cfg, 'check', 'Stealth'), 'dis');
  assert.equal(T.inherited(cfg, 'check', 'charisma'), 'normal'); assert.equal(T.inherited(cfg, 'save', 'str'), 'normal');
  cfg.traits.push({ ...cfg.traits[0], id: 'opposing', mode: 'dis' }); assert.equal(T.inherited(cfg, 'save', 'cha'), 'normal');
});

test('calculation configuration persists in workspace backups, exports real totals, and detects concurrent edits', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-creature-math-'));
  const service = createService({ directory, port: 0 }); await service.start();
  t.after(async () => { await service.close(); assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'aina-creature-math-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const imported = service.importJSON(creature(), 'test.json'), key = imported.workspace.documents[0].keys[0], original = imported.workspace.documents[0].data;
  const cfg = X.infer(original); cfg.saves.constitution = 'half';
  const candidate = C.clone(original); candidate.stats.abilityScores.constitution = 31;
  const req = data => fetch(service.url + '/api/creature', { method: 'PUT', headers: { 'X-Aina-Local': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const response = await req({ key, original, candidate, calculations: cfg, previousCalculations: null }); assert.equal(response.status, 200);
  const view = await response.json(), saved = C.creatures(view.workspace)[0].data;
  assert.equal(saved.stats.savingThrows[0].value, 13); assert.equal(saved.stats.savingThrows[0].proficient, false);
  assert.deepEqual(view.workspace.creatureCalculations[key], cfg); assert.equal(saved.creatureCalculations, undefined);
  const roundtrip = C.validateWorkspace(C.clone(view.workspace)); assert.deepEqual(roundtrip.creatureCalculations[key], cfg);
  assert.equal((await req({ key, original: saved, candidate: saved, calculations: cfg, previousCalculations: null })).status, 409);
  assert.deepEqual(saved.extra, original.extra); assert.equal(saved.stats.actions[0].description, original.stats.actions[0].description);
  const files = fs.readdirSync(path.join(directory, 'creature-backups')); const backup = JSON.parse(fs.readFileSync(path.join(directory, 'creature-backups', files[0])));
  assert.deepEqual(backup.calculations, cfg);
});
