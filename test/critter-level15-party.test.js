const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');
const C = require('../src/critter/public/core');
const Remote = require('../src/critter/public/remote-common');
const S = require('../src/critter/public/spellcasting-model');
const { inspectCreature } = require('../src/critter/automation');
const { createParty, writeExports, names } = require('../scripts/create-level15-party');

test('level-15 exports preserve identity, unknown data, unrelated automation and entry order', () => {
  const source = C.blankCreature('Braxton');
  Object.assign(source, { _id: '111111111111111111111111', bestiaryId: '222222222222222222222222', __v: 7,
    sharing: { linkSharingEnabled: false }, futureRoot: { value: 'retained' } });
  source.flavor.imageUrl = 'https://example.com/portrait.png';
  source.stats.futureStat = { retain: true };
  source.stats.reactions = [{ name: 'Unrelated reaction', description: '<avrae hidden>\n_v: 2\nname: Unrelated reaction\nautomation:\n- type: text\n  text: Preserved\n</avrae>', future: 2 }];
  source.stats.actions = [{ name: 'Multiattack', description: 'Old count.', future: 3 }, { name: 'Pickaxe', description: 'Old attack.', future: 4 }];
  source.stats.additionalAbilities = [{ name: 'Rage (3/Day)', description: 'Old rage.', future: 5 }];
  const before = C.clone(source), result = createParty({ Braxton: source });
  const c = result[0];
  assert.deepEqual(source, before, 'does not mutate input');
  Remote.assertIdentity(source, c);
  assert.deepEqual(c.flavor, source.flavor);
  assert.deepEqual(c.stats.reactions, source.stats.reactions);
  assert.deepEqual(c.stats.futureStat, source.stats.futureStat);
  assert.deepEqual(c.stats.actions.slice(0, 2).map(a => [a.name, a.future]), [['Multiattack', 3], ['Pickaxe', 4]]);
  assert.equal(c.stats.additionalAbilities[0].name, 'Rage (5 Uses)');
  assert.equal(c.stats.additionalAbilities[0].future, 5);
  assert.deepEqual(createParty(Object.fromEntries(result.map(c => [c.name, c]))), result, 'rerun does not append duplicates');
  for (const newCreature of result.slice(1)) for (const id of ['_id', 'id', '__v', 'bestiaryId']) assert.equal(newCreature[id], undefined);
});

test('four level-15 NPCs have consistent numerical totals and readable-only passives', () => {
  const party = createParty();
  assert.deepEqual(party.map(c => c.name), names);
  assert.deepEqual(party.map(C.averageHP), [157, 142, 112, 142]);
  for (const c of party) {
    C.importData(c);
    assert.equal(c.stats.proficiencyBonus, 5);
    assert.equal(c.stats.numHitDie, 15);
    assert.notEqual(c.stats.challengeRating, 15);
    for (const save of c.stats.savingThrows) assert.equal(save.value, Math.floor((c.stats.abilityScores[save.ability] - 10) / 2) + 5);
    const rows = inspectCreature(c);
    for (const row of rows.filter(r => r.reminderOnly)) assert.equal(row.blocks.length, 0, row.title);
    if (c.name !== 'Collin') {
      const reminder = rows.find(r => r.title === 'Multiattack');
      assert.equal(reminder.reminderOnly, true);
      assert.match(reminder.readable, new RegExp(c.name === 'Tomkin' ? 'three' : 'two'));
    }
    const actions = rows.flatMap(r => r.blocks.map(b => YAML.parse(b.source)));
    assert.equal(new Set(actions.map(a => a.name)).size, actions.length);
    assert.ok(actions.every(a => a._v === 2));
    const config = S.read(c);
    assert.ok(config.resources.length > 0);
    for (const r of config.resources) assert.ok(r.shortRestore <= r.maximum);
    assert.doesNotMatch(rows.map(r => r.readable).join('\n'), /aina|integration utility|Hellfire|Hellborn/i);
  }
  for (const row of inspectCreature(party[1]).filter(r => r.hasAttack)) assert.equal(YAML.parse(row.blocks[0].source).criton, 18);
  // Aura is temporary, not an extra +4 baked into the paladin's base saves.
  assert.deepEqual(party[3].stats.savingThrows.map(r => r.value), [6, 9]);
});

test('legacy generator accepts current JSON and rejects retired Markdown conversion', () => {
  const { create } = require('../scripts/create-braxton');
  const source = C.blankCreature('Braxton'); source._id = '111111111111111111111111';
  assert.equal(create(JSON.stringify(source))._id, source._id);
  assert.equal(C.averageHP(create({ Braxton: source })), 157);
  assert.throws(() => create('# Old Markdown'), /retired/);
  assert.throws(() => create({}), /latest Braxton/);
});

test('export preflight refuses identity loss before writing any file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-party-'));
  try {
    const original = C.blankCreature('Braxton'); original._id = '111111111111111111111111';
    const file = path.join(directory, 'Braxton_CritterDB_Avrae.json');
    fs.writeFileSync(file, JSON.stringify(original));
    assert.throws(() => writeExports({}, directory), /identity|_id/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), original);
    assert.deepEqual(fs.readdirSync(directory), ['Braxton_CritterDB_Avrae.json']);
  } finally {
    // Exact files only; no recursive deletion of computed paths.
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  }
});
