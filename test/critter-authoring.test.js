const test = require('node:test'), assert = require('node:assert/strict');
const { build } = require('../src/critter/authoring');
const A = require('../src/critter/public/authoring-model'), C = require('../src/critter/public/core'), T = require('../src/critter/public/combat-traits');
const { snapshot } = require('./mirror-fixture');
const YAML = require('yaml');
const { fieldsFor, editAbility } = require('../src/critter/ability-editor');
test('editing an existing effect changes only selected passives and preserves unrelated YAML and creature fields', () => {
  const creature = C.blankCreature('Existing');
  creature.extra = { keep: true };
  const entry = build({ name: 'Ward', kind: 'effect', target: 'self', effect: { duration: 3, resistances: ['cold'], immunities: [], vulnerabilities: [] } }).entry;
  entry.extra = 'keep'; entry.description = entry.description.replace('stacking: false', 'stacking: false # keep this comment\n        unknownProperty: keep');
  creature.stats.actions.push(entry);
  const fields = fieldsFor(entry.description), resist = fields.find(f => f.label === 'Effect resistances'), duration = fields.find(f => f.label === 'Effect duration in rounds');
  const candidate = editAbility(creature, [{ section: 'actions', index: 0, fields: [{ id: resist.id, value: '["fire","lightning"]' }, { id: duration.id, value: '5' }] }]);
  const parsed = YAML.parse(C.splitDescription(candidate.stats.actions[0].description).blocks[0].source);
  assert.deepEqual(parsed.automation[0].effects[0].effects.resistances, ['fire', 'lightning']);
  assert.equal(parsed.automation[0].effects[0].duration, 5); assert.equal(candidate.stats.actions[0].extra, 'keep');
  assert.deepEqual(candidate.extra, creature.extra); assert.match(candidate.stats.actions[0].description, /# keep this comment/); assert.match(candidate.stats.actions[0].description, /unknownProperty: keep/);
});
test('multi-component attacks keep damage types separate and explicit attack advantage', () => {
  const input = { name: 'Test attack', kind: 'attack', target: 'each', attackBonus: 7, attackRoll: 'adv', damages: [{ dice: '2d6+3', type: 'fire' }, { dice: '1d2', type: 'cold' }], rules: 'Original authored rule.' };
  const { entry, automation } = build(input), attack = automation.automation[0].effects[0];
  assert.equal(attack.attackBonus, '7'); assert.equal(attack.adv, 1);
  assert.equal(attack.hit[0].damage, '(2d6+3)[fire]+(1d2)[cold]');
  assert.deepEqual(YAML.parse(C.splitDescription(entry.description).blocks[0].source), automation);
  assert.match(entry.description, /Original authored rule/); assert.equal(input.damages.length, 2);
  const creature = C.blankCreature('Test'); creature.stats.actions.push(entry);
  const fields = fieldsFor(entry.description), type = fields.find(f => f.label.endsWith('component 1 type')), dice = fields.find(f => f.label.endsWith('component 2 dice'));
  const edited = editAbility(creature, [{ section: 'actions', index: 0, fields: [{ id: type.id, value: 'lightning' }, { id: dice.id, value: '6d17' }] }]);
  const tree = YAML.parse(C.splitDescription(edited.stats.actions[0].description).blocks[0].source);
  assert.equal(tree.automation[0].effects[0].hit[0].damage, '(2d6+3)[lightning]+6d17[cold]');
});
test('save damage uses one shared roll for full/half, effects only on failure, and no doubled bonuses', () => {
  const effect = { name: 'Test vulnerability', duration: 3, condition: 'restrained', resistances: ['cold'], immunities: [], vulnerabilities: ['fire'], save_adv: ['dexterity'], check_dis: ['perception'], attackRoll: 'dis', ac_bonus: 2 };
  const { automation } = build({ name: 'Test breath', rules: 'Test only', kind: 'save', target: 'each', dc: 18, saveStat: 'con', half: true, damages: [{ dice: '6d12', type: 'cold' }], effect });
  assert.equal(automation.automation[0].name, 'damage');
  assert.equal(automation.automation[0].displayName, 'Damage');
  const save = automation.automation[1].effects[0];
  assert.deepEqual(save.success, [{ type: 'damage', damage: '({damage})/2', fixedValue: true }]);
  assert.equal(save.fail[0].fixedValue, true);
  assert.equal(save.fail[1].duration, 3); assert.equal(save.fail[1].stacking, false);
  assert.deepEqual(save.fail[1].effects, { resistances: ['cold'], vulnerabilities: ['fire'], save_adv: ['dexterity'], check_dis: ['perception'], ac_bonus: '2', attack_advantage: -1 });
  assert.match(save.fail[1].desc, /other condition mechanics manually/);
});
test('condition labels alone do not invent mechanics; timed self effects are explicit', () => {
  const { automation } = build({ name: 'Test ward', kind: 'effect', target: 'self', effect: { duration: 10, condition: 'poisoned', resistances: [], immunities: [], vulnerabilities: [] } });
  const target = automation.automation[0]; assert.equal(target.target, 'self');
  assert.deepEqual(target.effects[0].effects, {}); assert.equal(target.effects[0].duration, 10);
});

test('Bleeding and other debuffs have explicit start/end damage and repeat-save buttons without unattended triggers', () => {
  for (const condition of ['bleeding', 'poisoned']) {
    const { entry, automation } = build({ name: 'Test debuff', kind: 'effect', target: 'each', effect: {
      condition, duration: 4, end: true, resistances: [], immunities: [], vulnerabilities: [], ending: 'Successful repeat save or healing.',
      ongoingDamage: { enabled: true, dice: '1d2+1', type: 'necrotic', timing: 'start' },
      repeatSave: { enabled: true, stat: 'con', dc: 15, timing: 'end', removeOnSuccess: true },
    } });
    const effect = automation.automation[0].effects[0];
    assert.equal(effect.end, true); assert.equal(effect.duration, 4); assert.equal(effect.buttons.length, 3);
    assert.equal(effect.buttons[0].label, 'Start of turn: damage'); assert.equal(effect.buttons[1].label, 'End of turn: save');
    assert.equal(effect.buttons[0].automation[0].target, 'self');
    assert.deepEqual(effect.buttons[0].automation[0].effects[0], { type: 'damage', damage: '(1d2+1)[necrotic]', fixedValue: true });
    const save = effect.buttons[1].automation[0].effects[0]; assert.equal(save.stat, 'con'); assert.equal(save.dc, '15');
    assert.deepEqual(save.success, [{ type: 'remove_ieffect' }]); assert.equal(save.fail[0].type, 'text');
    assert.deepEqual(effect.buttons[2].automation, [{ type: 'remove_ieffect' }]);
    assert.match(effect.desc, /do not run automatically|does not run automatically/);
    assert.deepEqual(YAML.parse(C.splitDescription(entry.description).blocks[0].source), automation);
    assert.deepEqual(effect.effects, {});
  }
  assert.throws(() => build({ name: 'No DC', kind: 'effect', target: 'self', effect: { resistances: [], immunities: [], vulnerabilities: [], repeatSave: { enabled: true, stat: 'dex', dc: '', timing: 'end' } } }), /Repeat save DC/);
});
test('alternative damage uses an explicit choice guard and does not generate extra spell mechanics', () => {
  const { entry, automation } = build({ name: 'Test burst', kind: 'attack', target: 'each', attackBonus: 4, damages: [{ dice: '1d8', type: 'choice' }], damageChoices: ['fire', 'cold'] });
  const branch = automation.automation[0].effects[0];
  assert.equal(branch.type, 'condition'); assert.equal(branch.condition, 'choice == "fire" or choice == "cold"');
  assert.equal(branch.onFalse[0].type, 'text'); assert.equal(branch.onTrue[0].hit[0].damage, '(1d8)[{choice}]');
  assert.match(entry.description, /AINA_DAMAGE_CHOICES:v1:fire,cold/);
  assert(!entry.description.includes('explode'));
});
test('standalone arbitrary dice rolls ignore combat damage bonuses', () => {
  for (const dice of ['1d2', '1d17', '2d31', '6d100+2']) {
    const { automation } = build({ name: 'Test die', kind: 'roll', rollDice: dice });
    assert.equal(automation.automation[0].dice, dice); assert.equal(automation.automation[0].fixedValue, true);
  }
  assert.throws(() => build({ name: 'Bad', kind: 'roll', rollDice: '6d0' }));
  assert.throws(() => build({ name: 'Bad', kind: 'damage', target: 'each', damages: [{ dice: '1d6', type: 'madeUp' }] }));
});
test('default controls retain conditional traits and distinguish initiative from all checks', () => {
  const conditional = { id: 'conditional', rules: 'Original', scope: 'saves', selected: ['wisdom'], mode: 'adv', restriction: 'against spells' };
  const config = { id: 'a'.repeat(32), traits: [conditional] };
  A.defaultTrait(config, 'allSaves', '', 'adv'); A.defaultTrait(config, 'allChecks', '', 'dis');
  assert.deepEqual(T.passive(config), { save_adv: C.abilities, check_dis: T.skills });
  assert.deepEqual(T.flags(config, 'check', 'strength'), ['dis']); assert.equal(config.traits[0], conditional);
  A.defaultTrait(config, 'allSaves', '', 'normal'); assert(!T.passive(config).save_adv);
});
test('mirror live rolls use linked base-check defaults and require a fresh choice for conditional traits', () => {
  const M = require('../src/critter/public/mirror-model'), snap = M.validate(snapshot());
  const ws = C.blankWorkspace(); ws.documents.push({ id: 'doc', label: 'Test', keys: ['source'], data: C.blankCreature(snap.combatants[0].sourceName.value) });
  const config = { id: 'a'.repeat(32), traits: [{ id: 'restricted', rules: 'Existing rule', restriction: 'while raging', scope: 'abilities', selected: ['strength'], mode: 'adv' }] };
  A.defaultTrait(config, 'abilities', 'dexterity', 'dis'); ws.combatTraits.source = config;
  const spec = { kind: 'check', actorId: snap.combatants[0].id, stat: 'dexterity', roll: 'normal' };
  assert.equal(M.command(snap, spec, '!', ws), '!i oc "Dragon One" dexterity dis');
  assert.equal(M.command(snap, { ...spec, stat: 'strength' }, '!', ws), '!i oc "Dragon One" strength');
  assert.equal(M.command(snap, { ...spec, stat: 'strength', traitChoices: ['restricted'] }, '!', ws), '!i oc "Dragon One" strength adv');
  assert.equal(M.rollConfig(snap, snap.combatants[1], ws), null);
});
test('reviewed initiative import keeps stable copy IDs and requires explicit source mapping for hidden units', () => {
  const snap = snapshot(), refs = [{ key: 'source', data: { name: snap.combatants[0].sourceName.value } }];
  const first = A.roster(snap, 'channel', refs, []);
  assert.equal(first.rows.length, 2); assert.equal(first.rows[0].sourceKey, 'source'); assert.equal(first.rows[1].sourceKey, '');
  assert.deepEqual(first.unresolved, [snap.combatants[1].name]);
  snap.combatants[0].name = 'Renamed'; const next = A.roster(snap, 'channel', refs, first.rows);
  assert.equal(next.rows.length, 2); assert.equal(next.rows[0].name, 'Renamed'); assert.equal(next.rows[0].id, first.rows[0].id);
  assert.throws(() => A.roster(snap, 'elsewhere', refs, next.rows), /already uses/);
});
