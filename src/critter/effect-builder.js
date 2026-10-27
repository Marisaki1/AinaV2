const C = require('./public/core');
const A = require('./public/authoring-model');
const T = require('./public/combat-traits');
const text = (v, label) => { C.quote(v, label); return String(v).trim(); };
const integer = (v, label, min, max) => { if (!/^[+-]?\d+$/.test(String(v)) || Number(v) < min || Number(v) > max) throw new Error(label + ' must be an integer from ' + min + ' to ' + max + '.'); return String(Number(v)); };
function buildEffect(e, name, rules) {
  const passive = {};
    for (const key of ['resistances', 'immunities', 'vulnerabilities']) {
      if (!Array.isArray(e[key]) || e[key].some(t => !A.damageTypes.includes(t))) throw new Error('Select valid damage types for ' + key + '.');
      if (e[key].length) passive[key] = [...new Set(e[key])];
    }
    if (e.condition && !A.conditions.includes(e.condition)) throw new Error('Select a supported condition label.');
    for (const key of ['save_adv', 'save_dis', 'check_adv', 'check_dis']) {
      const accepted = key.startsWith('save') ? C.abilities : T.skills;
      if (e[key] !== undefined && (!Array.isArray(e[key]) || e[key].some(s => !accepted.includes(s)))) throw new Error('Choose valid save or skill identifiers.');
      if (e[key]?.length) passive[key] = [...new Set(e[key])];
    }
    for (const key of ['to_hit_bonus', 'damage_bonus', 'save_bonus', 'check_bonus']) if (e[key]) { const value = text(e[key], key); if (value.length > 200) throw new Error('Bonus expression too long.'); passive[key] = value; }
    for (const key of ['ac_bonus', 'max_hp_bonus', 'dc_bonus']) if (e[key] !== '' && e[key] != null) passive[key] = integer(e[key], key, -10000, 10000);
    if (!['normal', 'adv', 'dis'].includes(e.attackRoll || 'normal')) throw new Error('Invalid attack modifier.');
    if (e.attackRoll === 'adv' || e.attackRoll === 'dis') passive.attack_advantage = e.attackRoll === 'adv' ? 1 : -1;
    const concise = String(e.description || '').trim();
    if(concise.length>500)throw new Error('Effect reminders must be at most 500 characters.');
    const effect = { type: 'ieffect2', name: text(e.name || name, 'Effect name'), effects: passive, stacking: false, conc: Boolean(e.concentration), end: Boolean(e.end), desc: concise || rules + (e.condition ? '\nCondition reminder: ' + e.condition + '. Only the explicitly configured passive fields are automated; resolve other condition mechanics manually.' : '') };
    if (e.tickOnCaster) effect.tick_on_caster = true;
    if (e.ending) effect.desc += '\nEnds: ' + text(e.ending, 'Effect ending rule');
    const buttons = [];
    const timing = value => { if (!['start', 'end'].includes(value)) throw new Error('Choose start or end of turn for each ongoing effect.'); return value === 'start' ? 'Start of turn' : 'End of turn'; };
    if (e.ongoingDamage?.enabled) {
      const d = e.ongoingDamage, when = timing(d.timing), dice = String(d.dice || '').trim();
      if (!/^(?:\d*d[1-9]\d*|\d+)(?:\s*[+-]\s*(?:\d*d[1-9]\d*|\d+))*$/i.test(dice) || dice.length > 100 || !A.damageTypes.includes(d.type)) throw new Error('Configure ongoing damage dice and select its damage type.');
      buttons.push({ label: when + ': damage', automation: [{ type: 'target', target: 'self', effects: [{ type: 'damage', damage: '(' + dice + ')[' + d.type + ']', fixedValue: true }] }] });
      effect.desc += '\n' + when + ': ' + dice + ' ' + d.type + ' damage. Click the effect damage button at this time; damage does not run automatically.';
    }
    if (e.repeatSave?.enabled) {
      const s = e.repeatSave, when = timing(s.timing);
      if (!['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(s.stat)) throw new Error('Select a repeat saving throw ability.');
      const dc = integer(s.dc, 'Repeat save DC', 1, 100);
      buttons.push({ label: when + ': save', automation: [{ type: 'target', target: 'self', effects: [{ type: 'save', stat: s.stat, dc, success: s.removeOnSuccess ? [{ type: 'remove_ieffect' }] : [{ type: 'text', text: 'Saving throw succeeded. Resolve the configured ending rule.' }], fail: [{ type: 'text', text: 'Saving throw failed. This effect remains.' }] }] }] });
      effect.desc += '\n' + when + ': DC ' + dc + ' ' + s.stat.toUpperCase() + ' save' + (s.removeOnSuccess ? '; success ends this effect.' : '; see the ending rule.') + ' Click the effect save button at this time; saves do not run automatically.';
    }
    if (buttons.length || e.removeButton?.enabled) {
      const label = text(e.removeButton?.label || 'End this effect', 'Ending button label');
      if (label.length > 80) throw new Error('Ending button labels must be at most 80 characters.');
      const cost = String(e.removeButton?.cost || '').trim();
      if (cost.length > 500) throw new Error('Ending button rules are too long.');
      buttons.push({ label, automation: [...(cost ? [{ type: 'text', text: cost }] : []), { type: 'remove_ieffect' }] });
      if(!concise) effect.desc += '\nClick ' + label + ' to end only this named effect.' + (cost ? ' Required cost/rule (resolve manually): ' + cost : ' No action, reaction or movement cost is automatically spent.');
      effect.buttons = buttons;
    }
    if (e.duration !== '' && e.duration != null) effect.duration = Number(integer(e.duration, 'Duration', 1, 1000000));
  return effect;
}
module.exports = { buildEffect };
