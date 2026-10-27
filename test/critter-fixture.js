const Core = require('../src/critter/public/core');
function creature() {
  const value = Core.blankCreature('Ancient Silver Dragon');
  value._id = 'original-critter-id';
  value.bestiaryId = 'original-collection-id';
  value.extra = { untouched: [1, 'two', { futureField: true }] };
  value.flavor.description = '<p>Original flavor &amp; details.</p>';
  value.stats.numHitDie = 25; value.stats.hitDieSize = 20;
  value.stats.abilityScores.constitution = 29;
  value.stats.proficiencyBonus = 7;
  value.stats.skills = [{ name: 'Perception', proficient: false, value: 16, extra: 'keep' }];
  value.stats.savingThrows = [{ ability: 'constitution', proficient: false, value: 16 }];
  value.stats.actions = [{ name: 'Cold Breath (Recharge 5–6)', extra: 'action metadata', description: '<p>Constitution Saving Throw: DC 24, each creature in a 90-foot Cone.\nFailure: 67 (15d8) Cold damage. Success: Half damage.</p>\n\n<avrae hidden>\n_v: 2\nname: Cold Breath\nautomation:\n  - type: roll\n    dice: 15d8[cold]\n    name: breathDamage\n  - type: target\n    target: each\n    effects:\n      - type: save\n        stat: con\n        dc: "24"\n        fail:\n          - type: damage\n            damage: "{breathDamage}"\n        success:\n          - type: damage\n            damage: "({breathDamage})/2"\n</avrae>' }];
  return value;
}
function bestiary() { return { _id: 'collection-identity', name: 'Test collection', description: '<p>Keep collection metadata.</p>', futureCollectionField: { keep: true }, creatures: [creature(), Core.blankCreature('Tewi Inaba')] }; }
module.exports = { creature, bestiary };
