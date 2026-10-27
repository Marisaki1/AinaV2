const YAML = require('yaml');
const C = require('./public/core');
const T = require('./public/combat-traits');
const html = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function preview(creature, config, previous) {
  C.validateCreature(creature); T.validate(config);
  if (previous && previous.id !== config.id) throw new Error('Keep the existing generated effect identity.');
  const { action, effect } = T.names(config), marker = '<!-- AINA_COMBAT_TRAITS:v1:' + config.id + ' -->';
  const actions = creature.stats.actions || [], managed = actions.map((a, i) => a.description?.includes(marker) ? i : -1).filter(i => i >= 0);
  if (managed.length > 1) throw new Error('More than one matching generated action exists. Resolve the duplicate before generating.');
  if (actions.some((a, i) => a.name === action && i !== managed[0])) throw new Error('An unrelated action already uses this name. No automation was replaced.');
  if (!previous && actions.some(a => /<!-- AINA_COMBAT_TRAITS:/.test(a.description || ''))) throw new Error('This import already contains generated traits. Restore its Aina workspace backup to edit the original configuration; existing automation is preserved.');
  const manual = config.traits.filter(t => t.restriction.trim() || ['abilities', 'allChecks'].includes(t.scope));
  const instructions = ['Integration utility only; no in-game action or resource cost. Applies only the generated unconditional passives to this combatant. Repeating replaces the same named effect.', ...config.traits.map(t => t.rules + ' | ' + T.scopes[t.scope] + (t.selected.length ? ': ' + t.selected.map(T.label).join(', ') : '') + ' | ' + t.mode + (t.restriction.trim() ? ' | ONLY WHEN: ' + t.restriction : '') + ' | ' + T.coverage(t)), ...manual.map(t => 'MANUAL outside Aina: append ' + t.mode + ' to !i ' + (['saves', 'allSaves'].includes(t.scope) ? 'os' : 'oc') + ' "<actual combatant name>" <matching ability/skill>' + (t.restriction.trim() ? ' only when ' + t.restriction : '') + '. Do not apply to initiative or unrelated rolls.'), 'Use !i os / !i oc for live combatant effects. !ms / !mc are lookup rolls.', 'Remove only this utility effect with !i re "<actual combatant name>" "' + effect + '".'];
  const automation = { _v: 2, name: action, automation: [{ type: 'target', target: 'self', effects: [{ type: 'ieffect2', name: effect, effects: T.passive(config), stacking: false, conc: false, desc: 'Aina integration utility. Unconditional save/skill passives only. Conditional and base-check instructions are in the setup action description.' }] }, { type: 'text', text: 'Trait setup attempted for the acting combatant. Check its effects with !i status. Conditions and base ability checks require the roll-time instructions in this action description.' }] };
  // Always replace with an empty passive when all traits are removed, so old effects can be cleared safely.
  const generated = { name: action, description: marker + '\n<p>' + instructions.map(html).join('</p>\n<p>') + '</p>\n<avrae hidden>\n' + YAML.stringify(automation, { lineWidth: 0 }) + '</avrae>' };
  const candidate = C.clone(creature), index = managed[0]; candidate.stats.actions ||= [];
  if (index === undefined) candidate.stats.actions.push(generated); else candidate.stats.actions[index] = { ...candidate.stats.actions[index], ...generated };
  return { candidate, before: index === undefined ? null : C.clone(actions[index]), after: generated, automation, effect, action, manual: manual.map(t => ({ rules: t.rules, coverage: T.coverage(t) })) };
}
module.exports = { preview };
