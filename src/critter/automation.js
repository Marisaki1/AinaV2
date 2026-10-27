const YAML = require('yaml');
const { sections, splitDescription } = require('./public/core');
const { fieldsFor } = require('./ability-editor');
function containsAttack(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (value.type === 'attack') return true;
  if (value.type === 'ieffect2') return false; // granted buttons/attacks execute separately
  return Object.values(value).some(v => containsAttack(v, seen));
}
function scalingIn(value,seen=new WeakSet()){
  if(!value||typeof value!=='object'||seen.has(value))return null;seen.add(value);
  if(value.type==='ieffect2')return null;
  if(value.type==='condition'&&typeof value.condition==='string'){
    const m=value.condition.match(/^ainaSteps >= 0 and ainaSteps <= (\d+)$/);
    if(m)return {enabled:true,maximum:Number(m[1])};
    const old=value.condition.match(/^choice == '' or choice in (\[[^]*\])$/);
    if(old)try{const a=JSON.parse(old[1]);if(a.length>1&&a.every((v,i)=>v===String(i)))return {enabled:true,maximum:a.length-1};}catch{}
    if(/^choice == '' or choice == /.test(value.condition)){
      const entries=[...value.condition.matchAll(/choice == "(\d+)"/g)].map(m=>Number(m[1]));
      if(entries.length>1&&entries.every((v,i)=>v===i))return {enabled:true,maximum:entries.length-1};
    }
  }
  for(const v of Object.values(value)){const found=scalingIn(v,seen);if(found)return found;}return null;
}

function inspectCreature(creature) {
  return sections.flatMap(section => (creature.stats[section] || []).map((ability, index) => {
    const { readable, blocks } = splitDescription(ability.description);
    const names = [], warnings = [], scalingByName={}; let hasAttack = false;
    for (const block of blocks) {
      const simple = block.source.match(/^([^\n]*?)\|([+-]?\d*)\|([^\n]*)$/s);
      if (simple) { names.push(simple[1] || ability.name); hasAttack ||= Boolean(simple[2]); continue; }
      try {
        const parsed = YAML.parse(block.source, { maxAliasCount: 50, uniqueKeys: true });
        hasAttack ||= containsAttack(parsed);
        const actions = Array.isArray(parsed) ? parsed : [parsed];
        for (const action of actions) {
          if (!action || typeof action.name !== 'string' || !Array.isArray(action.automation)) warnings.push('YAML parsed, but this is not a recognized named automation action.');
          else { names.push(action.name); const scale=scalingIn(action.automation);if(scale)scalingByName[action.name]=scale; }
        }
      } catch (e) { warnings.push(`Invalid automation YAML: ${e.message.split('\n')[0]}`); }
    }
    if (/<avrae\b/i.test(readable)) warnings.push('Unclosed or unsupported Avrae tag; check the original source.');
    if (!blocks.length) warnings.push('No explicit Avrae automation. Conventional text parsing may work, but execution is unverified.');
    if (/Melee Attack Roll|Ranged Attack Roll/i.test(readable) && !blocks.length) warnings.push('2024 attack wording may not produce an executable action.');
    if (/recharge|legendary|paraly[sz]ed/i.test(ability.name + readable)) warnings.push('Descriptions alone do not enforce recharge, conditions, or limited uses.');
    const fields = fieldsFor(ability.description);
    hasAttack ||= !blocks.length && fields.some(f => f.label === 'To-hit bonus');
    const reminderOnly = /^(?:multiattack|extra attacks?)\b/i.test(ability.name.trim()) || (!blocks.length && !hasAttack && !fields.length);
    return { section, index, title: ability.name, readable, blocks, fields, names, warnings, hasAttack, scalingByName, reminderOnly, status: names.length ? 'explicit' : blocks.length ? 'unrecognized' : 'unverified' };
  }));
}
module.exports = { inspectCreature };
