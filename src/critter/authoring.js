const YAML = require('yaml');
const C = require('./public/core');
const A = require('./public/authoring-model');
const { buildEffect } = require('./effect-builder');
const Tools = require('./public/ability-tools-model');
const {choiceGuard}=require('./automation-compat');
const text = (v, label) => { C.quote(v, label); return String(v).trim(); };
const integer = (v, label, min, max) => { if (!/^[+-]?\d+$/.test(String(v)) || Number(v) < min || Number(v) > max) throw new Error(label + ' must be an integer from ' + min + ' to ' + max + '.'); return String(Number(v)); };
const html = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function build(input) {
  if (!C.object(input)) throw new Error('Choose ability settings.');
  const name = text(input.name, 'Ability name'), rules = String(input.rules || '');
  if (name.length > 200 || rules.length > 10000) throw new Error('Ability name or rules are too long.');
  if (!['description', 'attack', 'save', 'damage', 'effect', 'roll'].includes(input.kind)) throw new Error('Choose an ability type.');
  if (input.damageTiming !== undefined && !['beforeSave', 'afterSave'].includes(input.damageTiming)) throw new Error('Choose damage before or after the save.');
  if (input.scaling?.enabled && !['attack', 'save', 'damage'].includes(input.kind)) throw new Error('Damage/DC scaling is available for attacks, damage and saving-throw abilities.');
  const followup = Tools.validateFollowup(input.followup), usage = Tools.validateUsage(input.usage);
  const finish = (entry, automation) => {
    const notes = [followup.enabled ? 'Follow-up: ' + followup.operation + '. ' + followup.rules + ' Resolve after the triggering roll; no interception or automatic rollback.' : '', usage.enabled ? 'Resource: ' + usage.name + ', base cost ' + usage.cost + '. Track remaining uses manually.' : ''].filter(Boolean).join('\n');
    if (notes) entry.description += '<p>' + html(notes).replace(/\n/g, '<br>') + '</p>';
    const definition = {};
    for (const key of ['name', 'kind', 'rules', 'criton', 'target', 'attackBonus', 'reach', 'range', 'attackRoll', 'saveStat', 'dc', 'half', 'rollDice', 'damages', 'damageChoices', 'effect', 'effects', 'damageTiming', 'scaling', 'resolutionTiming']) if (input[key] !== undefined) definition[key] = C.clone(input[key]);
    definition.followup = followup; definition.usage = usage;
    const body = entry.description.trim(), metadata = encodeURIComponent(JSON.stringify({ definition, fingerprint: A.fingerprint(body) }));
    if (metadata.length > 150000) throw new Error('Ability recipe is too large. Reduce the configuration.');
    entry.description = '<!-- AINA_ABILITY:v1:' + metadata + ' -->\n' + body;
    return { entry, automation, capabilities: { effectButtons: 'manual click', followup: followup.enabled ? 'manual' : 'none', resourceTracking: usage.enabled ? 'local/manual' : 'none' } };
  };

  if (input.kind === 'description') return finish({ name, description: '<p>' + html(rules).replace(/\n/g, '<br>') + '</p>' }, null);
  if (input.kind !== 'roll' && !['each', 'self'].includes(input.target)) throw new Error('Choose self or selected targets.');
  const outcomes = [], automation = [];
  if (input.kind === 'roll') {
    const dice = String(input.rollDice || '').trim();
    if (!/^(?:\d*d\d+|\d+)(?:\s*[+-]\s*(?:\d*d\d+|\d+))*$/i.test(dice) || dice.length > 100 || /d0(?:\D|$)/i.test(dice)) throw new Error('Enter dice such as 1d2, 2d12, 6d20 or 1d100+3.');
    const tree = { _v: 2, name, automation: [{ type: 'roll', dice, name: 'abilityRoll', displayName: name, fixedValue: true }, { type: 'text', text: rules || 'Roll: {abilityRoll}' }] };
    return finish({ name, description: '<p>' + html(rules) + '</p>\n<avrae hidden>\n' + YAML.stringify(tree, { lineWidth: 0 }) + '</avrae>' }, tree);
  }
  const parts = input.damages || (input.damage ? [{ dice: input.damage, type: input.damageType }] : []);
  if (!Array.isArray(parts) || parts.length > 12) throw new Error('Use up to 12 damage components.');
  const choices = input.damageChoices || [];
  if (!Array.isArray(choices) || choices.some(t => !A.damageTypes.includes(t)) || new Set(choices).size !== choices.length) throw new Error('Select valid alternative damage types.');
  const choosing = parts.some(p => p.type === 'choice');
  if (choosing && !choices.length) throw new Error('Select the damage types available at command time.');
  const scaling = input.scaling?.enabled ? {
    maximum: Number(integer(input.scaling.maximum, 'Maximum extra steps', 1, 100)),
    count: Number(integer(input.scaling.count || 0, 'Extra damage dice per step', 0, 100)),
    sides: Number(integer(input.scaling.sides || 8, 'Scaling damage die size', 1, 1000000)),
    dc: Number(integer(input.scaling.dc || 0, 'DC increase per step', -100, 100)),
  } : null;
  if (scaling && !['points','levels'].includes(input.scaling.mode || 'points')) throw new Error('Choose extra points or spell-level scaling.');
  if (scaling && input.scaling.mode === 'levels') { const base=Number(integer(input.scaling.baseLevel, 'Base spell level', 0, 9)); if(base+scaling.maximum>9) throw new Error('Upcast spell levels cannot exceed 9.'); }
  if (scaling && choosing) throw new Error('Numeric scaling and damage-type choices currently use the same Avrae choice argument. Configure one choice mode per ability.');
  if (scaling && scaling.count && parts.length !== 1) throw new Error('Scaling damage needs one explicit damage component so its type is unambiguous.');
  const expression = parts.map(p => {
    const dice = String(p.dice || '').trim();
    if (!/^(?:\d*d\d+|\d+)(?:\s*[+-]\s*(?:\d*d\d+|\d+))*$/i.test(dice) || dice.length > 100 || /d0(?:\D|$)/i.test(dice) || ![...A.damageTypes, 'choice'].includes(p.type)) throw new Error('Enter damage dice and select a damage type.');
    return '(' + dice + (scaling?.count ? '+{ainaExtraDice}d' + scaling.sides : '') + ')[' + (p.type === 'choice' ? '{choice}' : p.type) + ']';
  }).join('+');
  if (expression) {
    if (input.kind === 'save') {
      automation.push({ type: 'roll', dice: expression, name: 'damage', displayName: 'Damage' });
      outcomes.push({ type: 'damage', damage: '{damage}', fixedValue: true });
    } else outcomes.push({ type: 'damage', damage: expression });
  }
  const configs = input.effects || (input.effect ? [input.effect] : []);
  if (!Array.isArray(configs) || configs.length > 6) throw new Error('Use at most six separate effects per ability.');
  const builtEffects = configs.map(e => buildEffect(e, name, rules));
  const effectNames = builtEffects.map(e => e.name.toLowerCase());
  if (new Set(effectNames).size !== effectNames.length) throw new Error('Give each separate effect a unique name so one button cannot remove another effect.');
  outcomes.push(...builtEffects);
  if (!outcomes.length) throw new Error('Enter damage or enable an effect. Use Rules only for a description without automation.');
  let effects = outcomes;
  if (input.kind === 'attack') effects = [{ type: 'attack', attackBonus: integer(input.attackBonus, 'To-hit bonus', -100, 100), adv: input.attackRoll === 'adv' ? 1 : input.attackRoll === 'dis' ? -1 : 0, hit: outcomes, miss: [] }];
  if (input.kind === 'save') {
    if (!['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(input.saveStat)) throw new Error('Select a target saving throw ability.');
    const baseDC = integer(input.dc, 'Save DC', 1, 100);
    if (scaling && (Number(baseDC) + scaling.maximum * scaling.dc < 1 || Number(baseDC) + scaling.maximum * scaling.dc > 100)) throw new Error('Scaled DC must remain between 1 and 100.');
    effects = [{ type: 'save', stat: input.saveStat, dc: scaling?.dc ? baseDC + '+' + scaling.dc + '*ainaSteps' : baseDC, fail: input.damageTiming === 'beforeSave' ? builtEffects : outcomes, success: input.damageTiming !== 'beforeSave' && expression && input.half ? [{ type: 'damage', damage: '({damage})/2', fixedValue: true }] : [] }];
  }
  if (input.kind === 'save' && input.damageTiming === 'beforeSave' && expression) effects.unshift({ type: 'damage', damage: '{damage}', fixedValue: true });
  if (builtEffects.some(e => e.conc) && (input.target === 'each' || builtEffects.filter(e => e.conc).length > 1)) {
    const anchor = { type: 'ieffect2', name: name + ' (concentration)', effects: {}, conc: true, stacking: false, save_as: 'ainaConcentration', buttons: [{ label: 'End concentration', automation: [{ type: 'remove_ieffect' }] }] };
    automation.unshift({ type: 'target', target: 'self', effects: [anchor] });
    for (const effect of builtEffects) if (effect.conc) { effect.conc = false; effect.parent = 'ainaConcentration'; }
  }
  if (choosing) effects = [{ type: 'condition', condition: choices.map(t => 'choice == ' + JSON.stringify(t)).join(' or '), onTrue: effects, onFalse: [{ type: 'text', text: 'Choose a damage type with -choice: ' + choices.join(', ') }], errorBehaviour: 'raise' }];
  automation.push({ type: 'target', target: input.target, effects });
  const generated = scaling ? choiceGuard(scaling.maximum, [...(scaling.count ? [{type:'variable',name:'ainaExtraDice',value:scaling.count+'*ainaSteps'}] : []), ...automation]) : automation;
  const tree = { _v: 2, name, automation: generated };
  if (input.kind === 'attack' && input.criton !== undefined && input.criton !== '') tree.criton = Number(integer(input.criton, 'Critical minimum', 1, 20));
  const summary = [
    input.kind === 'attack' ? 'Attack bonus: ' + input.attackBonus : input.kind === 'save' ? 'Target ' + input.saveStat.toUpperCase() + ' save DC ' + input.dc + (input.damageTiming === 'beforeSave' ? '; damage happens before the save; the save controls effects only.' : input.half ? '; half damage on success.' : '; no damage on success.') : '',
    expression ? 'Damage: ' + parts.map(p => p.dice + ' ' + (p.type === 'choice' ? 'chosen type' : p.type)).join(' + ') + (scaling?.count ? '; +' + scaling.count + 'd' + scaling.sides + ' per extra step.' : '') : '',
    ...builtEffects.map(e => 'Effect: ' + e.name + '; ' + (e.duration ? e.duration + ' rounds' : 'indefinite') + '. ' + e.desc),
    scaling ? 'Upcast: 0 to ' + scaling.maximum + ' extra steps; track the resource cost manually.' : '',
  ].filter(Boolean).join('\n');
  return finish({ name, description: (choosing ? '<!-- AINA_DAMAGE_CHOICES:v1:' + choices.join(',') + ' -->\n' : '') + '<p>' + html(rules).replace(/\n/g, '<br>') + '</p><p>' + html(summary).replace(/\n/g, '<br>') + '</p>\n<avrae hidden>\n' + YAML.stringify(tree, { lineWidth: 0 }) + '</avrae>' }, tree);
}
module.exports = { build };
