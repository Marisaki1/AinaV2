// Local export generation only. Never connects to CritterDB or Discord.
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const C = require('../src/critter/public/core');
const S = require('../src/critter/public/spellcasting-model');
const { build } = require('../src/critter/authoring');
const { damageTypes } = require('../src/critter/public/authoring-model');

const text = value => ({ type: 'text', text: value });
const target = (who, effects) => ({ type: 'target', target: who, effects });
const action = (name, automation) => ({ _v: 2, name, automation });
const html = value => String(value).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
function entry(name, rules, payload) {
  return { name, description: '<p>' + html(rules).replace(/\n/g, '<br>') + '</p>' +
    (payload ? '\n\n<avrae hidden>\n' + YAML.stringify(payload, { lineWidth: 0 }) + '</avrae>' : '') };
}
function timed(name, desc, additions = {}) {
  return {
    type: 'ieffect2', name: name + ' ({caster.name})',
    duration: 1, end: false, tick_on_caster: true,
    stacking: false, conc: false, effects: {}, desc,
    buttons: [{ label: 'End effect', automation: [{ type: 'remove_ieffect' }] }],
    ...additions,
  };
}
function rend(blessed = false) {
  return action(blessed ? 'Blessed Rend' : 'Rend', [target('each', [{
    type: 'attack', attackBonus: '17', hit: [{
      type: 'damage', damage: '(2d8+10)[slashing]' + (blessed ? '+(2d8)[cold]' : ''),
    }], miss: [],
  }])]);
}
function adjust(source, { asNew = false } = {}) {
  C.validateCreature(source);
  const c = C.clone(source);
  if (asNew) {
    c.name = 'Reiko';
    for (const key of ['_id', 'id', 'bestiaryId', 'publishedBestiaryId', '__v']) delete c[key];
  } else if (source.name !== 'Reiko') {
    throw new Error('For a different creature/template, explicitly use --new. Existing Reiko updates preserve identity and collection membership.');
  }
  const normalRend = c.stats.actions.find(e => e.name === 'Rend');
  const breath = c.stats.actions.find(e => /^Cold Breath/.test(e.name));
  const paralyzing = c.stats.actions.find(e => e.name === 'Paralyzing Breath');
  if (!normalRend || !breath || !paralyzing) throw new Error('Expected the supplied Rend and breath entries.');
  normalRend.description = entry('Rend',
    'Melee Attack Roll: +17, reach 15 ft. Hit: 19 (2d8 + 10) slashing damage.',
    rend()).description;
  // Preserve the source heading, prose and unknown entry fields. Correct the
  // hidden DC 24 mismatch and prevent stored-roll damage bonuses applying twice.
  const originalBlocks = C.splitDescription(breath.description);
  if (originalBlocks.blocks.length !== 1) throw new Error('Review unexpected Cold Breath automation before editing.');
  const cold = build({ name: 'Cold Breath', kind: 'save', target: 'each', saveStat: 'con',
    dc: 23, half: true, damages: [{ dice: '15d8', type: 'cold' }] }).automation;
  breath.description = originalBlocks.readable.trim() + '\n\n<avrae hidden>\n' +
    YAML.stringify(cold, { lineWidth: 0 }) + '</avrae>';

  const expiry = 'Until the start of Reiko\'s next turn.';
  const rendEffect = timed('Rend Blessing', 'Rend deals an additional 2d8 cold damage. ' + expiry,
    { attacks: [{ attack: rend(true) }] });

  // All 13 native damage types, with no changes to permanent defenses.
  const ward = () => timed('Resistance Blessing', 'Resistance to all damage types. ' + expiry,
    { effects: { resistances: [...damageTypes] } });
  const auraEntry = action('Aura Entry', [
    target('each', [ward()]),
  ]);
  const auraSelf = ward();
  auraSelf.attacks = [{ attack: auraEntry }];
  auraSelf.desc += ' Emits a 30-foot aura.';

  // Standard condition names; no renamed/custom condition or universal debuff.
  // These native initiative records do not invent unsupported condition passives.
  const charmEffect = { type: 'ieffect2', name: 'Charmed', effects: {}, duration: 1,
    end: false, tick_on_caster: true, stacking: false, conc: false,
    desc: 'Charmed by {caster.name} until the start of their next turn.' };
  const charm = action('Charm Blessing', [target('each', [{
    type: 'save', stat: 'wis', dc: '23',
    fail: [charmEffect], success: [text('Charm resisted.')],
  }])]);
  const paralyzed = { type: 'ieffect2', name: 'Paralyzed', effects: {}, duration: 1,
    end: true, tick_on_caster: false, stacking: false, conc: false,
    desc: 'Paralyzed until the end of your next turn.' };
  paralyzing.description = entry('Paralyzing Breath',
    'Constitution Saving Throw: DC 23, each creature in a 90-foot cone. Failure: The target has the Paralyzed condition until the end of its next turn. Success: No effect.',
    action('Paralyzing Breath', [target('each', [{ type: 'save', stat: 'con', dc: '23',
      fail: [paralyzed], success: [] }])])).description;

  const meadowHeal = action('Meadow Healing', [target('each', [{
    type: 'damage', damage: '-20', fixedValue: true, overheal: false,
  }])]);
  const terrains = [
    ['Difficult Terrain', 'All ground movement costs an extra 5 feet of movement.'],
    ['Body of Water', 'Before moving, make a DC 23 Athletics check, then move at half speed.'],
    ['Gentle Meadow', 'At the start of a creature\'s turn in the meadow, it regains 20 HP.'],
    ['Rocky Terrain', 'Rocky ground and pillars. The DM handles the layout and all terrain consequences.'],
  ];
  const terrainActions = terrains.map(([name, rules]) => {
    const e = timed('Alter Terrain', name + '. ' + rules + ' ' + expiry);
    if (name === 'Gentle Meadow') e.attacks = [{ attack: meadowHeal }];
    return action('Alter Terrain - ' + name, [target('self', [e])]);
  });

  const blessings = [
    entry('Four Blessings',
      'Reiko has four blessings: Rend, Resistance Aura, Charm and Alter Terrain. These blessings last until the start of Reiko\'s next turn. Her ability DC is 23.'),
    entry('Rend Blessing', 'Until the start of Reiko\'s next turn, her Rend deals an additional 9 (2d8) cold damage.',
      action('Rend Blessing', [target('self', [rendEffect])])),
    entry('Resistance Aura', 'Reiko emits a 30-foot aura that grants herself and other creatures in it resistance to all damage types. Creatures entering the active aura also receive this benefit. ' +
      expiry,
      action('Resistance Aura', [target('self', [auraSelf]),
        target('each', [{ type: 'condition', condition: 'target.name != caster.name',
          onTrue: [ward()], onFalse: [], errorBehaviour: 'raise' }])])),
    entry('Charm Blessing', 'Each creature within 30 feet of Reiko makes a DC 23 Wisdom saving throw. On a failure, it has the Charmed condition until the start of Reiko\'s next turn.', charm),
    entry('Alter Terrain', 'Reiko alters the land until the start of her next turn. The DM handles the terrain.\n' +
      terrains.map(([name, rules]) => name + ': ' + rules).join('\n'), terrainActions),
  ];
  c.stats.additionalAbilities ||= [];
  for (const blessing of blessings) {
    const matches = c.stats.additionalAbilities.filter(e => e.name === blessing.name);
    if (matches.length > 1) throw new Error('Duplicate ' + blessing.name + ' entries require review; no export was written.');
    if (matches.length) matches[0].description = blessing.description;
    else c.stats.additionalAbilities.push(blessing);
  }
  const profile = S.read(c) || { enabled: true, dc: 23, applyAttack: false, attackBonus: 15, resources: [] };
  return C.validateCreature(S.write(c, { ...profile, enabled: true, dc: 23 }));
}
if (require.main === module) {
  const args = process.argv.slice(2), asNew = args.includes('--new'), positional = args.filter(a => a !== '--new');
  const input = positional[0], output = positional[1] || 'exports/Reiko_CritterDB_Avrae.json';
  if (!input) throw new Error('Usage: node scripts/adjust-reiko.js <original-creature.json> [output.json] [--new]');
  const result = adjust(JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '')), { asNew });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2), 'utf8');
  console.log('Created ' + output + '. ' + (asNew ? 'Explicit new copy: original IDs omitted.' : 'Original identity and collection membership preserved.') + ' No live account writes or Discord messages.');
}
module.exports = { adjust };
