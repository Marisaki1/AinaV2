const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../src/critter/public/core'), A = require('../src/critter/public/authoring-model');
const F = require('../src/critter/public/ability-tools-model');
const { build } = require('../src/critter/authoring');
const YAML = require('yaml');
const effect = overrides => ({ name: 'Test effect', resistances: [], immunities: [], vulnerabilities: [], ...overrides });

test('Stand up removes only its own Prone effect and carries an explicit manual cost reminder', () => {
  const { automation, entry } = build({ name: 'Test control', kind: 'effect', target: 'each', effects: [
    effect({ name: 'Prone', condition: 'prone', attackRoll: 'dis', removeButton: { enabled: true, label: 'Stand up', cost: 'Resolve the stated movement cost manually.' } }),
    effect({ name: 'Bleeding', condition: 'bleeding', ongoingDamage: { enabled: true, timing: 'start', dice: '2d8', type: 'necrotic' }, repeatSave: { enabled: true, stat: 'con', dc: 15, timing: 'end', removeOnSuccess: true } }),
  ] });
  const [prone, bleed] = automation.automation[0].effects;
  assert.equal(prone.name, 'Prone'); assert.equal(prone.effects.attack_advantage, -1);
  assert.equal(prone.buttons[0].label, 'Stand up');
  assert.deepEqual(prone.buttons[0].automation, [{ type: 'text', text: 'Resolve the stated movement cost manually.' }, { type: 'remove_ieffect' }]);
  assert(!JSON.stringify(prone.buttons).includes('Bleeding')); assert(!JSON.stringify(prone.buttons).includes('removeParent'));
  assert.equal(bleed.name, 'Bleeding'); assert.equal(bleed.buttons[0].label, 'Start of turn: damage');
  assert.deepEqual(YAML.parse(C.splitDescription(entry.description).blocks[0].source), automation);
});

test('until-used DC penalty has a manual Mark used button and caster-based expiry', () => {
  const { automation } = build({ name: 'DC penalty', kind: 'effect', target: 'each', effects: [effect({ name: 'DC lowered', dc_bonus: -4, duration: 50, tickOnCaster: true, removeButton: { enabled: true, label: 'Mark used', cost: '' } })] });
  const e = automation.automation[0].effects[0];
  assert.equal(e.effects.dc_bonus, '-4'); assert.equal(e.duration, 50); assert.equal(e.tick_on_caster, true);
  assert.deepEqual(e.buttons[0], { label: 'Mark used', automation: [{ type: 'remove_ieffect' }] });
  assert.match(e.desc, /No action, reaction or movement cost is automatically spent/);
});

test('concentration on target debuffs is owned by a caster anchor, with only selected children linked', () => {
  const { automation } = build({ name: 'Concentration test', kind: 'effect', target: 'each', effects: [effect({ name: 'Concentration child', concentration: true }), effect({ name: 'Independent child' })] });
  const anchor = automation.automation[0], targets = automation.automation[1];
  assert.equal(anchor.target, 'self'); assert.equal(anchor.effects[0].conc, true); assert.equal(anchor.effects[0].save_as, 'ainaConcentration');
  assert.equal(targets.effects[0].conc, false); assert.equal(targets.effects[0].parent, 'ainaConcentration');
  assert.equal(targets.effects[1].parent, undefined);
});

test('Needle-style damage precedes the save and is not dealt again on failure', () => {
  const { automation } = build({ name: 'Needle test', kind: 'save', target: 'each', saveStat: 'con', dc: 15, damageTiming: 'beforeSave', damages: [{ dice: '4d8', type: 'piercing' }], effects: [effect({ name: 'Bleeding', condition: 'bleeding' })] });
  assert.equal(automation.automation[0].type, 'roll');
  const target = automation.automation[1]; assert.equal(target.effects[0].type, 'damage'); assert.equal(target.effects[1].type, 'save');
  assert.equal(target.effects[1].fail.length, 1); assert.equal(target.effects[1].fail[0].type, 'ieffect2'); assert.deepEqual(target.effects[1].success, []);
});

test('numeric scaling guards the choice before rolling and scales damage and DC explicitly', () => {
  const { automation, entry } = build({ name: 'Scaling test', kind: 'save', target: 'each', saveStat: 'str', dc: 16, damages: [{ dice: '4d8', type: 'bludgeoning' }], half: true, scaling: { enabled: true, maximum: 11, count: 2, sides: 8, dc: 1 } });
  assert.equal(automation.automation[0].type,'variable'); const guard = automation.automation[1]; assert.equal(guard.type, 'condition'); assert.match(guard.condition, /<= 11/);
  assert.equal(guard.onTrue[1].dice, '(4d8+{ainaExtraDice}d8)[bludgeoning]');
  assert.equal(guard.onTrue[2].effects[0].dc, '16+1*ainaSteps'); assert.match(entry.description, /-choice N/);
  assert.throws(() => build({ name: 'Ambiguous scaling', kind: 'attack', target: 'each', attackBonus: 8, damages: [{ dice: '1d8', type: 'choice' }], damageChoices: ['fire'], scaling: { enabled: true, maximum: 5 } }), /one choice mode/);
});

test('portable recipes survive creature JSON round trips and reject stale or malformed metadata', () => {
  const input = { name: 'Custom --> label', rules: 'Keep my explicit rules.', kind: 'effect', target: 'each', effects: [effect({ name: 'Prone', removeButton: { enabled: true, label: 'Stand up' } })], followup: { enabled: true, operation: 'adjust', adjustment: -5, rules: 'After a success' }, usage: { enabled: true, name: 'Reaction uses', maximumFrom: 'intelligence', minimum: 1, cost: 1, reset: 'rest', shortRestoreMode: 'half' } };
  const { entry } = build(input), c = C.blankCreature('Test'); c.stats.actions.push({ ...entry, extra: 'keep' });
  const imported = C.importData(JSON.parse(JSON.stringify(c))).data, recipe = A.recipe(imported.stats.actions[0].description);
  assert.equal(recipe.name, input.name); assert.equal(recipe.effects[0].removeButton.label, 'Stand up'); assert.equal(recipe.usage.shortRestoreMode, 'half');
  assert.equal(imported.stats.actions[0].extra, 'keep');
  assert.equal(A.recipe(entry.description.replace('stacking: false', 'stacking: true')), null);
  assert.equal(A.recipe('<!-- AINA_ABILITY:v1:bad%URI -->'), null);
  assert(!entry.description.includes('<script>'));
});

test('effect names and button labels are validated before export', () => {
  assert.throws(() => build({ name: 'Unsafe names', kind: 'effect', target: 'self', effects: [effect(), effect()] }), /unique name/);
  assert.throws(() => build({ name: 'Long label', kind: 'effect', target: 'self', effects: [effect({ removeButton: { enabled: true, label: 'x'.repeat(81) } })] }), /80 characters/);
});

test('adjustment and reversal evaluate explicit records without pretending to undo consequences', () => {
  const adjusted = F.evaluate({ operation: 'adjust', total: 20, adjustment: -5, dc: 16 });
  assert.equal(adjusted.total, 15); assert.equal(adjusted.outcome, 'failure'); assert.equal(adjusted.manual, true);
  assert.equal(F.evaluate({ operation: 'adjust', total: 20, adjustment: -5, dc: 16, special: true }).outcome, 'DM decision required');
  assert.equal(F.evaluate({ operation: 'reverse', success: 'success' }).outcome, 'failure');
  assert.match(F.evaluate({ operation: 'reverse', success: 'failure' }).detail, /have not been undone/);
  assert.throws(() => F.evaluate({ operation: 'adjust', total: '', adjustment: 0, dc: 16 }));
});

test('attack follow-ups roll dice only; live saves/checks address exact combatants with explicit modifiers', () => {
  assert.deepEqual(F.commands({ operation: 'attack', roll: 'dis', bonus: 8, adjustment: 0 }), ['!r 2d20kl1+8']);
  assert.deepEqual(F.commands({ operation: 'save', actor: 'Creature Two', stat: 'con', roll: 'adv', adjustment: -5, dc: 16 }), ['!i os "Creature Two" con adv -b "-5" -dc 16']);
  assert.deepEqual(F.commands({ operation: 'check', actor: 'Creature Two', stat: 'stealth', roll: 'normal', adjustment: -5, dc: '' }), ['!i oc "Creature Two" stealth adv dis -b "-5"']);
  assert.deepEqual(F.commands({ operation: 'dice', dice: '1d8' }), ['!r 1d8']);
  assert.throws(() => F.commands({ operation: 'dice', dice: '1d0' }));
  assert.throws(() => F.commands({ operation: 'dice', dice: '1d8\n!i end' }));
});

test('initiative swap uses confirmed relative deltas and handles negative initiative correctly', () => {
  assert.deepEqual(F.commands({ operation: 'initiative', actor: 'First', other: 'Second', initiative: -3, otherInitiative: 19, confirmed: true }), ['!i opt "First" -p +22', '!i opt "Second" -p -22']);
  assert.throws(() => F.commands({ operation: 'initiative', actor: 'First', other: 'Second', initiative: 10, otherInitiative: 15, confirmed: false }), /confirm/);
});

test('local resources support PB/ability maxima, bounded spending and rest recovery without player counters', () => {
  const c = C.blankCreature('Test'); c.stats.abilityScores.intelligence = 20; c.stats.proficiencyBonus = 3;
  const cfg = { enabled: true, name: 'Mirror uses', maximumFrom: 'intelligence', minimum: 1, maximum: 0, cost: 1, reset: 'rest', shortRestoreMode: 'half' };
  const clean = F.validateUsage(cfg), max = F.maximum(clean, c); assert.equal(max, 5);
  assert.equal(F.changePool(5, max, 'spend', 1), 4); assert.equal(F.changePool(1, max, 'restore', Math.ceil(max / 2)), 4);
  assert.equal(F.changePool(4, max, 'restore', 3), 5); assert.throws(() => F.changePool(0, max, 'spend', 1), /Not enough/);
  assert.equal(F.maximum({ ...cfg, maximumFrom: 'pb' }, c), 3);
  assert.equal(F.changePool(0, max, 'reset', 0), max);
});
