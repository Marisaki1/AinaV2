// Local, deterministic exports. Never contacts CritterDB, Discord, or a browser.
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const C = require('../src/critter/public/core');
const Remote = require('../src/critter/public/remote-common');
const Spellcasting = require('../src/critter/public/spellcasting-model');

const defaultInput = 'data/critter/creature-backups/level15-party/latest-library-inputs.json';
const names = ['Braxton', 'Tomkin', 'Collin', 'Glen'];
const target = (who, effects) => ({ type: 'target', target: who, effects });
const model = (name, activation_type, automation, extra = {}) => ({ _v: 2, name, activation_type, ...extra, automation });
const entry = (name, description, action) => ({ name, description: description + (action
  ? '\n\n<avrae hidden>\n' + YAML.stringify(action, { lineWidth: 0, aliasDuplicateObjects: false }) + '</avrae>' : '') });
const effect = (name, duration, effects, desc, button) => ({ type: 'ieffect2', name, duration,
  end: false, tick_on_caster: false, stacking: false, conc: false, effects, desc,
  ...(button ? { buttons: [{ label: button, automation: [{ type: 'remove_ieffect' }] }] } : {}) });
const strike = (name, text, hit, damage, criton) => entry(name, text, model(name, 1, [target('each', [
  { type: 'attack', attackBonus: String(hit), hit: [{ type: 'damage', damage }], miss: [] },
])], criton ? { criton } : {}));
const resource = (name, maximum, shortRestore = 0) => ({ name, maximum, shortMode: 'fixed', shortRestore, longReset: true });
const modifier = n => Math.floor((n - 10) / 2);

// Replace only named, approved entries in place. Unknown properties and unrelated
// entries survive. Old names are explicitly listed for this authorized revision.
function mergeEntries(original, updates, aliases = {}) {
  const pending = new Map(updates.map(e => [e.name, e]));
  const result = (original || []).map(old => {
    const name = aliases[old.name] || old.name;
    if (!pending.has(name)) return C.clone(old);
    const update = pending.get(name); pending.delete(name);
    return { ...C.clone(old), ...update };
  });
  return [...result, ...pending.values()];
}
function base(name, original, scores, die, ac, armor, speed, cr, saves, skills) {
  const c = original ? C.clone(original) : C.blankCreature(name), s = c.stats;
  if (c.name !== name) throw new Error('Refusing to assign another creature identity to ' + name + '.');
  c.flavor ||= {};
  if (!original) Object.assign(c.flavor, { faction: '', environment: '', nameIsProper: true });
  Object.assign(s, { size: original?.stats.size || 'Medium', race: original?.stats.race || 'Humanoid (Any Race)', alignment: original?.stats.alignment || 'Any Alignment',
    armorClass: ac, armorType: armor, speed, numHitDie: 15, hitDieSize: die,
    proficiencyBonus: 5, challengeRating: cr, experiencePoints: { 8: 3900, 9: 5000, 10: 5900 }[cr] });
  s.abilityScores = { ...s.abilityScores, ...Object.fromEntries(C.abilities.map((a, i) => [a, scores[i]])) };
  const previousSaves = s.savingThrows || [], previousSkills = s.skills || [];
  s.savingThrows = saves.map(ability => ({ ...previousSaves.find(r => r.ability === ability), ability,
    proficient: true, value: modifier(s.abilityScores[ability]) + 5 }));
  const skillAbility = { Athletics: 'strength', Intimidation: 'charisma', Perception: 'wisdom',
    Arcana: 'intelligence', Religion: 'intelligence', Insight: 'wisdom', Persuasion: 'charisma' };
  s.skills = skills.map(name => ({ ...previousSkills.find(r => r.name === name), name,
    proficient: true, value: modifier(s.abilityScores[skillAbility[name]]) + 5 }));
  if (!original) s.languages = ['Common'];
  return c;
}
function resources(c, list, dc = 16, hit = 0, enabled = false) {
  // Existing supported hidden editor metadata; native automation is independent.
  const previous = Spellcasting.read(c);
  const managed = new Set(list.map(r => r.name));
  const others = (previous?.resources || []).filter(r => !managed.has(r.name));
  return Spellcasting.write(c, { enabled, dc, attackBonus: hit, applyAttack: enabled, resources: [...list, ...others] });
}
function choiceGuard(values, automation, message, oneTarget = true) {
  const failure = [{ type: 'text', text: message }];
  const choices = ["choice == ''", ...values.map(v => 'choice == "' + v + '"')];
  // Native IntExpression is capped at 255 characters. Split long whitelists;
  // malformed/fractional/arithmetic inputs never reach a variable or effect.
  const groups = [];
  for (let i = 0; i < choices.length; i += 10) groups.push(choices.slice(i, i + 10).join(' or '));
  let branch = failure;
  for (const condition of groups.reverse()) branch = [{ type: 'condition', condition,
    onTrue: automation, onFalse: branch, errorBehaviour: 'raise' }];
  return oneTarget ? [{ type: 'condition', condition: 'len(targets) == 1', onTrue: branch,
    onFalse: failure, errorBehaviour: 'raise' }] : branch;
}
function healing(name, description, activation, maximum, dice) {
  return entry(name, description, model(name, activation, choiceGuard(
    Array.from({ length: maximum }, (_, i) => i + 1), [
      { type: 'variable', name: 'amount', value: "choice or 1" },
      target('each', [{ type: 'damage', damage: dice, fixedValue: true }]),
    ], 'Select one creature and a whole number from 1 to ' + maximum + '.')));
}
// Verified DDB 2024 spell entity IDs. Native CastSpell does not spend monster slots.
const spells = { 'Guiding Bolt': 2619136, 'Cure Wounds': 2619079, Counterspell: 2619072, 'Divine Smite': 2618833 };
function spellNode(name, level, dc, hit, mod) {
  return { type: 'spell', id: spells[name], level, dc: String(dc), attackBonus: String(hit), castingMod: String(mod) };
}
function nativeSpell(name, text, activation, level, dc, hit, mod) {
  return entry(name, text, model(name, activation, [spellNode(name, level, dc, hit, mod)]));
}
function leveledSpell(name, text, activation, maximum, dc, hit, mod) {
  let branch = [spellNode(name, 1, dc, hit, mod)];
  for (let level = 2; level <= maximum; level++) branch = [{ type: 'condition', condition: 'choice == "' + level + '"',
    onTrue: [spellNode(name, level, dc, hit, mod)], onFalse: branch, errorBehaviour: 'raise' }];
  return entry(name, text, model(name, activation, choiceGuard(
    Array.from({ length: maximum }, (_, i) => i + 1), branch,
    'Select one creature and a spell level from 1 to ' + maximum + '.')));
}

function braxton(original) {
  let c = base('Braxton', original, [20, 16, 18, 8, 12, 13], 12, 17, 'Unarmored Defense', '40 ft.', 9,
    ['strength', 'constitution'], ['Athletics', 'Intimidation', 'Perception']);
  const s = c.stats;
  s.additionalAbilities = mergeEntries(s.additionalAbilities, [
    entry('Rage (5 Uses)', 'Bonus Action. Braxton rages for 10 minutes, gaining resistance to bludgeoning, piercing, and slashing damage, advantage on Strength checks and saves, and +3 damage on Strength-based weapon attacks. He cannot cast spells or maintain Concentration. Rage ends early if he becomes Unconscious, dons Heavy armor, or ends it as a Bonus Action. He regains one use after a Short Rest and all uses after a Long Rest.',
      model('Rage', 3, [target('self', [effect('Rage', 100, {
        resistances: ['bludgeoning', 'piercing', 'slashing'], save_adv: ['strength'], check_adv: ['strength'], damage_bonus: '3[piercing]',
      }, 'Strength checks and saves have advantage; Pickaxe damage +3; physical damage resistance.', 'End Rage')])])),
    entry('Reckless', 'When making his first attack roll on his turn, Braxton can attack recklessly. His Strength-based attack rolls and attack rolls against him have advantage until the start of his next turn.',
      model('Reckless', 2, [target('self', [effect('Reckless', 1, { attack_advantage: 1 },
        'Strength-based attacks and attacks against Braxton have advantage until his next turn starts.')])])),
    entry('Unarmored Defense', 'While unarmored, Braxton has AC 17 (10 + Dexterity modifier + Constitution modifier).'),
    entry('Frenzy', 'While raging and using Reckless, the first target Braxton hits on his turn with a Strength-based attack takes an extra 3d6 damage of the weapon\'s type.'),
    entry('Mindless Rage', 'While raging, Braxton is immune to Charmed and Frightened. Entering Rage ends those conditions on him.'),
    entry('Danger Sense', 'Braxton has advantage on Dexterity saves unless he is Incapacitated.'),
    entry('Persistent Rage', 'Rage lasts its full duration without needing to be extended. Once per Long Rest, Braxton can regain all expended Rage uses when he rolls Initiative.'),
  ], { 'Rage (3/Day)': 'Rage (5 Uses)' });
  s.actions = mergeEntries(s.actions, [entry('Multiattack', 'Braxton makes two Pickaxe attacks.'),
    strike('Pickaxe', 'Melee Weapon Attack: +10 to hit, reach 5 ft., one target. Hit: 12 (2d6 + 5) piercing damage, or 15 (2d6 + 8) piercing damage while raging.', 10, '(2d6+5)[piercing]')]);
  return resources(c, [resource('Rage', 5, 1)]);
}
function tomkin(original) {
  let c = base('Tomkin', original, [20, 16, 18, 10, 12, 12], 10, 19, 'Plate, Defense', '30 ft.', 9,
    ['strength', 'constitution'], ['Athletics', 'Perception', 'Intimidation']);
  const s = c.stats;
  if (!original) c.flavor.description = 'Equipment: Plate armor, greatsword, glaive, longbow, handaxes.';
  s.additionalAbilities = mergeEntries(s.additionalAbilities, [
    entry('Superior Critical', 'Tomkin\'s weapon attacks score a critical hit on a natural 18–20.'),
    entry('Remarkable Athlete', 'Tomkin has advantage on Initiative and Strength (Athletics) checks. After a critical hit, he can move up to half his Speed without provoking Opportunity Attacks.'),
    entry('Action Surge (1/Short Rest)', 'On his turn, Tomkin can take one additional action, except the Magic action.'),
    entry('Indomitable (2/Long Rest)', 'After failing a saving throw, Tomkin can reroll it with a +15 bonus and must use the new result.'),
    entry('Second Wind (4 Uses)', 'Bonus Action. Tomkin regains 1d10 + 15 HP. He regains one use after a Short Rest and all uses after a Long Rest.',
      model('Second Wind', 3, [target('self', [{ type: 'damage', damage: '-(1d10+15)', fixedValue: true }])])),
  ]);
  s.actions = mergeEntries(s.actions, [
    entry('Multiattack', 'Tomkin makes three attacks, choosing from his weapons.'),
    strike('Greatsword', 'Melee Weapon Attack: +10 to hit, reach 5 ft., one target. Hit: 12 (2d6 + 5) slashing damage. Critical hit on a natural 18–20.', 10, '(2d6+5)[slashing]', 18),
    strike('Glaive', 'Melee Weapon Attack: +10 to hit, reach 10 ft., one target. Hit: 10 (1d10 + 5) slashing damage. Critical hit on a natural 18–20.', 10, '(1d10+5)[slashing]', 18),
    strike('Longbow', 'Ranged Weapon Attack: +10 to hit, range 150/600 ft., one target. Hit: 7 (1d8 + 3) piercing damage. Critical hit on a natural 18–20.', 10, '(1d8+3)[piercing]', 18),
    strike('Handaxe', 'Melee or Ranged Weapon Attack: +10 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 8 (1d6 + 5) slashing damage. Critical hit on a natural 18–20.', 10, '(1d6+5)[slashing]', 18),
  ]);
  return resources(c, [resource('Second Wind', 4, 1), resource('Action Surge', 1, 1), resource('Indomitable', 2)]);
}
function collin(original) {
  let c = base('Collin', original, [10, 16, 16, 12, 14, 20], 8, 15, 'Studded leather', '30 ft.', 8,
    ['wisdom', 'charisma'], ['Arcana', 'Religion', 'Insight']);
  const s = c.stats;
  if (!original) c.flavor.description = 'Equipment: Studded leather armor, arcane focus.';
  if (!s.damageResistances.some(v => v.toLowerCase() === 'radiant')) s.damageResistances.push('Radiant');
  s.additionalAbilities = mergeEntries(s.additionalAbilities, [
    entry('Pact Magic', 'Charisma spellcasting: save DC 18, +10 to hit. Collin has three 5th-level Pact Magic slots, regained after a Short or Long Rest. His selected spells are Guiding Bolt, Cure Wounds, and Counterspell.'),
    entry('Radiant Soul', 'Collin has resistance to radiant damage. Once on each of his turns, when a spell deals fire or radiant damage, he can add +5 to one damage roll against one target.'),
    healing('Healing Light', 'Bonus Action. Collin heals himself or one creature he can see within 60 ft., spending 1–5 dice from his pool of 16d6. The target regains HP equal to the roll. The pool refills after a Long Rest.', 3, 5, '-({amount}d6)'),
  ]);
  s.actions = mergeEntries(s.actions, [
    strike('Eldritch Blast', 'Ranged Spell Attack: +10 to hit, range 120 ft., one target per beam. Hit: 10 (1d10 + 5) force damage. Collin produces three beams with one Magic action; each beam is a separate attack roll.', 10, '(1d10+5)[force]'),
    nativeSpell('Guiding Bolt', 'Action. 5th-level spell, range 120 ft. Ranged spell attack +10; on a hit, 28 (8d6) radiant damage. The next attack against the target before the end of Collin\'s next turn has advantage.', 1, 5, 18, 10, 5),
    nativeSpell('Cure Wounds', 'Action. 5th-level spell, touch. One creature regains 10d8 + 5 HP.', 1, 5, 18, 10, 5),
  ]);
  s.reactions = mergeEntries(s.reactions, [nativeSpell('Counterspell', 'Reaction when a creature Collin sees within 60 ft. casts a spell with Verbal, Somatic, or Material components. The caster makes a DC 18 Constitution save. On failure, the spell fails and the action is wasted; an expended spell slot is not spent. Uses a 5th-level Pact Magic slot.', 4, 5, 18, 10, 5)]);
  return resources(c, [resource('Pact Magic slots (5th)', 3, 3), resource('Healing Light dice', 16)], 18, 10, true);
}
function glen(original) {
  let c = base('Glen', original, [20, 10, 18, 10, 12, 18], 10, 20, 'Plate, shield', '30 ft.', 10,
    ['wisdom', 'charisma'], ['Athletics', 'Insight', 'Persuasion']);
  const s = c.stats;
  if (!original) c.flavor.description = 'Equipment: Plate armor, shield, longsword, holy symbol.';
  s.additionalAbilities = mergeEntries(s.additionalAbilities, [
    entry('Aura of Protection', 'While Glen is not Incapacitated, he and allies within 10 ft. add +4 to saving throws. Benefits from multiple Auras of Protection do not stack.'),
    entry('Auras of Devotion and Courage', 'While within Glen\'s Aura of Protection, Glen and his allies are immune to Charmed and Frightened.'),
    entry('Spellcasting', 'Charisma spellcasting: save DC 17, +9 to hit. Spell slots: four 1st-level, three 2nd-level, three 3rd-level, two 4th-level. Selected spells: Cure Wounds and Divine Smite. Expended slots return after a Long Rest.'),
    entry('Sacred Weapon', 'As part of the Attack action, Glen can spend one Channel Divinity use to imbue his longsword for 10 minutes, adding +4 to its attack rolls. Each hit can deal its normal damage type or radiant damage. The weapon emits Bright Light for 20 ft. and Dim Light for 20 ft. farther. Glen has three Channel Divinity uses, regaining one after a Short Rest and all after a Long Rest.',
      model('Sacred Weapon', 2, [target('self', [effect('Sacred Weapon', 100, { to_hit_bonus: '4' },
        'Longsword attacks +4 to hit; each hit may use its normal damage type or radiant.', 'End Sacred Weapon')])])),
    healing('Lay on Hands', 'Bonus Action, touch. Glen restores up to 75 HP from a pool, choosing how much to spend on one creature. The pool refills after a Long Rest.', 3, 75, '-({amount})'),
  ]);
  s.actions = mergeEntries(s.actions, [
    entry('Multiattack', 'Glen makes two Longsword attacks.'),
    strike('Longsword', 'Melee Weapon Attack: +10 to hit, reach 5 ft., one target. Hit: 11 (1d8 + 7) slashing damage plus 4 (1d8) radiant damage (Radiant Strikes).', 10, '(1d8+7)[slashing]+(1d8)[radiant]'),
    leveledSpell('Divine Smite', 'Bonus Action immediately after a melee weapon or Unarmed Strike hits. The target takes an extra 2d8 radiant damage with a 1st-level slot, +1d8 per slot level above 1st (maximum 4th). Add 1d8 against a Fiend or Undead. Glen can cast it at 1st level once per Long Rest without a slot.', 3, 4, 17, 9, 4),
    leveledSpell('Cure Wounds', 'Action, touch. One creature regains 2d8 + 4 HP with a 1st-level slot, plus 2d8 per slot level above 1st (maximum 4th).', 1, 4, 17, 9, 4),
  ]);
  return resources(c, [resource('Channel Divinity', 3, 1), resource('Lay on Hands HP', 75), resource('Free Divine Smite', 1),
    resource('Spell slots (1st)', 4), resource('Spell slots (2nd)', 3), resource('Spell slots (3rd)', 3), resource('Spell slots (4th)', 2)], 17, 9, true);
}
function createParty(inputs = {}) {
  const builders = { Braxton: braxton, Tomkin: tomkin, Collin: collin, Glen: glen };
  return names.map(name => {
    const creature = C.validateCreature(builders[name](inputs[name]));
    if (inputs[name]) Remote.assertIdentity(inputs[name], creature);
    return creature;
  });
}
function writeExports(inputs, directory = 'exports') {
  const creatures = createParty(inputs);
  // Validate every destination before writing. Missing inputs must not strip IDs.
  for (const c of creatures) {
    const output = path.join(directory, c.name + '_CritterDB_Avrae.json');
    if (fs.existsSync(output)) {
      const existing = JSON.parse(fs.readFileSync(output, 'utf8'));
      if (existing._id) Remote.assertIdentity(existing, c);
    }
  }
  fs.mkdirSync(directory, { recursive: true });
  const backupDirectory = path.join('data', 'critter', 'creature-backups', 'level15-party', new Date().toISOString().replace(/[:.]/g, '-'));
  for (const c of creatures) {
    const output = path.join(directory, c.name + '_CritterDB_Avrae.json');
    if (fs.existsSync(output)) { fs.mkdirSync(backupDirectory, { recursive: true }); fs.copyFileSync(output, path.join(backupDirectory, path.basename(output))); }
    fs.writeFileSync(output, JSON.stringify(c, null, 2) + '\n', 'utf8');
  }
  return creatures;
}
if (require.main === module) {
  const source = process.argv[2] || defaultInput;
  if (!fs.existsSync(source)) throw new Error('Provide the latest creature dictionary JSON. Do not regenerate an existing creature without its identity.');
  const party = writeExports(JSON.parse(fs.readFileSync(source, 'utf8')), process.argv[3] || 'exports');
  console.log(JSON.stringify({ localOnly: true, creatures: party.map(c => ({ name: c.name, hp: C.averageHP(c), ac: c.stats.armorClass, idPreserved: Boolean(c._id) })) }));
}
module.exports = { createParty, writeExports, defaultInput, names, spells };
