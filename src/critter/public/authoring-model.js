(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core') : root.Critter);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Authoring = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  const damageTypes = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
  const conditions = ['bleeding', 'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
  function defaultTrait(config, scope, stat, mode) {
    const id = 'default-' + scope + '-' + (stat || 'all');
    config.traits = config.traits.filter(t => t.id !== id);
    if (mode !== 'normal') config.traits.push({ id, rules: 'Default ' + (mode === 'adv' ? 'advantage' : 'disadvantage') + ': ' + scope + (stat ? ' / ' + stat : ''), scope, selected: stat ? [stat] : [], mode, restriction: '' });
    return config;
  }
  function fingerprint(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16);
  }
  function recipe(description) {
    const match = String(description).match(/<!-- AINA_ABILITY:v1:([^\s]+) -->/);
    if (!match || match[1].length > 150000) return null;
    try {
      const data = JSON.parse(decodeURIComponent(match[1]));
      const body = description.replace(match[0], '').trim();
      return data.fingerprint === fingerprint(body) && C.object(data.definition) ? data.definition : null;
    } catch { return null; }
  }
  // Names and IDs from a reviewed snapshot; never infer source data for a hidden unit.
  function roster(snapshot, locationKey, refs, existing) {
    const rows = C.clone(existing), unresolved = [];
    for (const u of snapshot.combatants) {
      const prior = rows.find(e => e.mirrorLocation === locationKey && e.mirrorId === u.id);
      const matches = !u.hidden && u.sourceName.status === 'known' ? refs.filter(r => r.data.name === u.sourceName.value) : [];
      const key = prior?.sourceKey || (matches.length === 1 ? matches[0].key : '');
      const row = { ...(prior || {}), id: prior?.id || 'mirror-' + u.id, mirrorLocation: locationKey, mirrorId: u.id, sourceKey: key, sourceName: !u.hidden && u.sourceName.status === 'known' ? u.sourceName.value : prior?.sourceName || 'Source unavailable', name: u.name, quantity: '1', fixedInitiative: String(u.initiative), initiativeBonus: '', initiativeRoll: 'normal' };
      if (!key) unresolved.push(u.name);
      if (prior) rows[rows.indexOf(prior)] = row; else {
        if (rows.some(e => e.name.toLowerCase() === row.name.toLowerCase())) throw new Error('A prepared combatant already uses ' + row.name + '. Rename or remove that local entry before importing.');
        rows.push(row);
      }
    }
    C.validateEncounter(rows);
    return { rows, unresolved };
  }
  return { damageTypes, conditions, defaultTrait, roster, recipe, fingerprint };
});
