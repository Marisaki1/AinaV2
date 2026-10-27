const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/critter/public/core');
const R = require('../src/critter/public/remote-common');
const S = require('../src/critter/public/spellcasting-model');
const { adjust } = require('../scripts/adjust-reiko');
const exported = require('../exports/Reiko_CritterDB_Avrae.json');

test('Reiko updates preserve existing identity, membership, access and user-edited base data', () => {
  let original = C.clone(exported);
  original.id = original._id;
  original.publishedBestiaryId = '123456789012345678901234';
  original.__v = 17;
  original.unknownRoot = { preserve: true };
  original.stats.unknownStat = { preserve: true };
  original.stats.abilityScores.dexterity = 24;
  original.stats.armorClass = 26;
  const config = S.read(original);
  config.resources.push({ name: 'Existing pool', maximum: 4, shortMode: 'manual', shortRestore: 0, longReset: false });
  original = S.write(original, config);
  const snapshot = C.clone(original), candidate = adjust(original);
  assert.doesNotThrow(() => R.assertIdentity(original, candidate));
  for (const key of ['_id', 'id', 'bestiaryId', 'publishedBestiaryId', '__v', 'sharing', 'unknownRoot']) {
    assert.deepEqual(candidate[key], original[key], key);
  }
  assert.deepEqual(candidate.stats.abilityScores, original.stats.abilityScores);
  assert.equal(candidate.stats.armorClass, 26);
  assert.deepEqual(candidate.stats.unknownStat, original.stats.unknownStat);
  assert.deepEqual(S.read(candidate).resources, config.resources);
  assert.deepEqual(original, snapshot);
});

test('Reiko regeneration replaces existing blessings in place and is repeatable without duplicates', () => {
  const original = C.clone(exported);
  original.stats.additionalAbilities.find(e => e.name === 'Rend Blessing').unknownEntry = { keep: true };
  const once = adjust(original), twice = adjust(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(once.stats.additionalAbilities.map(e => e.name), original.stats.additionalAbilities.map(e => e.name));
  assert.deepEqual(once.stats.additionalAbilities.find(e => e.name === 'Rend Blessing').unknownEntry, { keep: true });
  const bad = C.clone(original);
  bad.stats.additionalAbilities.push(C.clone(bad.stats.additionalAbilities.find(e => e.name === 'Rend Blessing')));
  assert.throws(() => adjust(bad), /Duplicate Rend Blessing/);
});

test('stripping Reiko identity requires an explicit new-copy option', () => {
  const original = C.clone(exported);
  assert.equal(adjust(original)._id, original._id);
  const fresh = adjust(original, { asNew: true });
  for (const key of ['_id', 'id', 'bestiaryId', 'publishedBestiaryId', '__v']) assert(!Object.hasOwn(fresh, key));
  original.name = 'Ancient Silver Dragon';
  assert.throws(() => adjust(original), /explicitly use --new/);
  assert.equal(adjust(original, { asNew: true }).name, 'Reiko');
});

test('delivered Reiko JSON retains the latest supplied record and edited scores', () => {
  assert.equal(exported._id, '6ade1f5c75da40a67aee0fad');
  assert.equal(exported.bestiaryId, '6a9bd89315443bd5efcdd7d2');
  assert.equal(exported.__v, 0);
  assert.equal(exported.stats.abilityScores.dexterity, 20);
  assert.equal(exported.stats.armorClass, 22);
  assert.deepEqual(adjust(exported), exported);
});
