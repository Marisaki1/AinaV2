(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core') : root.Critter);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CombatTraits = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  // Verified against Avrae nightly utils/constants.py and initiative/utils.py, 2026-10-23.
  const skills = ['acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival'];
  const scopes = { allSaves: 'All six ability saves', saves: 'Selected saving throws', skills: 'Selected skills', abilities: 'Selected base ability checks', allChecks: 'All checks (six base abilities + 18 skills; excludes initiative)' };
  const ability = value => C.abilities.find(a => a === value || a.slice(0, 3) === value);
  const skill = value => skills.find(a => a.toLowerCase() === String(value).replace(/\s/g, '').toLowerCase());
  const label = value => value.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
  function validate(config) {
    if (!C.object(config) || !/^[a-f0-9]{32}$/.test(config.id) || !Array.isArray(config.traits) || config.traits.length > 40) throw new Error('Invalid combat trait configuration.');
    const ids = new Set();
    for (const t of config.traits) {
      if (!C.object(t) || typeof t.id !== 'string' || !t.id || ids.has(t.id) || !Object.hasOwn(scopes, t.scope) || !['adv', 'dis'].includes(t.mode) || typeof t.rules !== 'string' || !t.rules.trim() || t.rules.length > 2000 || typeof t.restriction !== 'string' || t.restriction.length > 500 || !Array.isArray(t.selected)) throw new Error('Each trait needs rules, a scope, and advantage or disadvantage.');
      ids.add(t.id);
      const accepted = t.scope === 'skills' ? skills : C.abilities;
      if (t.selected.some(s => !accepted.includes(s)) || new Set(t.selected).size !== t.selected.length || (['saves', 'skills', 'abilities'].includes(t.scope) && !t.selected.length)) throw new Error('Select valid abilities or skills for this trait.');
    }
    return C.clone(config);
  }
  function names(config) { validate(config); return { action: 'Aina Setup Traits ' + config.id, effect: 'Aina Combat Traits ' + config.id }; }
  function passive(config) {
    validate(config); const out = {};
    for (const t of config.traits) {
      if (t.restriction.trim() || t.scope === 'abilities') continue;
      const field = (['allSaves', 'saves'].includes(t.scope) ? 'save_' : 'check_') + t.mode;
      // Never use check_*: [all] or a base ability: both broaden scope, including initiative.
      const values = t.scope === 'allSaves' ? C.abilities : t.scope === 'allChecks' ? skills : t.selected;
      out[field] = [...new Set([...(out[field] || []), ...values])];
    }
    return out;
  }
  function matches(t, type, stat) {
    if (type === 'save') return t.scope === 'allSaves' || t.scope === 'saves' && t.selected.includes(ability(stat));
    const a = ability(stat), s = skill(stat);
    return t.scope === 'allChecks' && !!(a || s) || t.scope === 'abilities' && t.selected.includes(a) || t.scope === 'skills' && t.selected.includes(s);
  }
  function rollTraits(config, type, stat) { return config ? validate(config).traits.filter(t => matches(t, type, stat) && (t.restriction.trim() || t.scope === 'abilities' || t.scope === 'allChecks' && ability(stat))) : []; }
  function inherited(config, type, stat) {
    if (!config) return 'normal';
    const modes = new Set(validate(config).traits.filter(t => !t.restriction.trim() && matches(t, type, stat)).map(t => t.mode));
    return modes.size === 1 ? [...modes][0] : 'normal';
  }
  function flags(config, type, stat, selected = [], mode = 'normal') {
    const flags = new Set(mode === 'normal' ? [] : [mode]);
    for (const t of rollTraits(config, type, stat)) if (!t.restriction.trim() || selected.includes(t.id)) flags.add(t.mode);
    return [...flags].sort(); // Both are retained so Avrae cancels opposing sources, rather than last-write-wins.
  }
  function liveRoll(name, type, stat, rollFlags = [], prefix = '!') {
    const key = type === 'save' ? ability(stat)?.slice(0, 3) : ability(stat) || skill(stat);
    if (!key || !['save', 'check'].includes(type) || rollFlags.some(v => !['adv', 'dis'].includes(v))) throw new Error('Choose a supported save or check.');
    return C.prefix(prefix) + 'i ' + (type === 'save' ? 'os ' : 'oc ') + C.quote(name, 'Encounter combatant') + ' ' + key + (rollFlags.length ? ' ' + [...new Set(rollFlags)].join(' ') : '');
  }
  function setup(config, actor, prefix = '!') { return C.prefix(prefix) + 'i aoo ' + C.quote(actor) + ' ' + C.quote(names(config).action); }
  function remove(config, actor, prefix = '!') { return C.prefix(prefix) + 'i re ' + C.quote(actor) + ' ' + C.quote(names(config).effect); }
  function coverage(t) { return t.restriction.trim() ? 'Roll-time choice only; no unconditional effect' : t.scope === 'abilities' ? 'Automatic command flag for base checks in this editor; manual flag outside it' : t.scope === 'allChecks' ? 'Passive effect for 18 skills; command flag for six base checks; no initiative' : 'Passive effect generated; run Setup Traits to apply'; }
  return { skills, scopes, ability, skill, label, validate, names, passive, matches, rollTraits, inherited, flags, liveRoll, setup, remove, coverage };
});
