(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CreatureMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  const skillAbilities = { acrobatics: 'dexterity', animalhandling: 'wisdom', arcana: 'intelligence', athletics: 'strength', deception: 'charisma', history: 'intelligence', insight: 'wisdom', intimidation: 'charisma', investigation: 'intelligence', medicine: 'wisdom', nature: 'intelligence', perception: 'wisdom', performance: 'charisma', persuasion: 'charisma', religion: 'intelligence', sleightofhand: 'dexterity', stealth: 'dexterity', survival: 'wisdom' };
  const key = name => String(name).replace(/\s/g, '').toLowerCase();
  const mod = score => Math.floor(((Number.isFinite(score) ? score : 10) - 10) / 2);
  const signed = n => (n >= 0 ? '+' : '') + n;
  const abilityFor = name => abilities.find(a => a === key(name) || a.slice(0, 3) === key(name)) || (Object.hasOwn(skillAbilities, key(name)) ? skillAbilities[key(name)] : undefined);
  const pbForCR = cr => Math.max(2, Math.ceil(Number(cr || 0) / 4) + 1);
  function infer(creature) {
    return { ac: { mode: 'dex', base: (creature.stats.armorClass ?? 10) - mod(creature.stats.abilityScores?.dexterity), cap: 2, other: 'constitution' }, pb: 'custom', saves: {}, skills: {}, links: [] };
  }
  function validate(config) {
    if (!config || typeof config !== 'object' || !config.ac || !['dex', 'capped', 'fixed', 'two'].includes(config.ac.mode) || !Number.isFinite(config.ac.base) || !Number.isFinite(config.ac.cap) || !abilities.includes(config.ac.other) || !['custom', 'cr'].includes(config.pb)) throw new Error('Invalid automatic AC or proficiency formula.');
    for (const type of ['saves', 'skills']) {
      if (!config[type] || typeof config[type] !== 'object' || Array.isArray(config[type])) throw new Error('Invalid proficiency calculation settings.');
      for (const [name, mode] of Object.entries(config[type])) if (!abilityFor(name) || !['none', 'half', 'full', 'expert', 'fixed'].includes(mode)) throw new Error('Invalid proficiency mode.');
    }
    if (config.links !== undefined && (!Array.isArray(config.links) || config.links.length > 200 || config.links.some(l => !l || !['actions', 'reactions', 'legendaryActions', 'additionalAbilities'].includes(l.section) || !Number.isInteger(l.index) || typeof l.field !== 'string' || !['attack', 'dc', 'modifier'].includes(l.kind) || !abilities.includes(l.ability) || !Number.isFinite(l.bonus)))) throw new Error('Invalid linked action formula.');
    return JSON.parse(JSON.stringify(config));
  }
  function modeFor(row, kind, config) { return config?.[kind]?.[key(kind === 'saves' ? row.ability : row.name)] || (row.proficient ? 'full' : Number.isFinite(row.value) ? 'fixed' : 'none'); }
  function total(creature, name, mode, custom) {
    if (mode === 'fixed') return Number.isFinite(custom) ? custom : 0;
    const pb = creature.stats.proficiencyBonus || 0;
    return mod(creature.stats.abilityScores?.[abilityFor(name)]) + (mode === 'full' ? pb : mode === 'half' ? Math.floor(pb / 2) : mode === 'expert' ? pb * 2 : 0);
  }
  function armor(creature, config) {
    const a = config.ac, dex = mod(creature.stats.abilityScores?.dexterity);
    return a.base + (a.mode === 'fixed' ? 0 : a.mode === 'capped' ? Math.min(dex, a.cap) : dex) + (a.mode === 'two' ? mod(creature.stats.abilityScores?.[a.other]) : 0);
  }
  function apply(value, raw) {
    const creature = JSON.parse(JSON.stringify(value)), config = validate(raw), s = creature.stats;
    if (config.pb === 'cr') s.proficiencyBonus = pbForCR(s.challengeRating);
    s.armorClass = armor(creature, config);
    for (const [field, kind, nameKey] of [['savingThrows', 'saves', 'ability'], ['skills', 'skills', 'name']]) for (const row of s[field] || []) {
      const mode = modeFor(row, kind, config);
      // Unedited custom rows remain byte-for-byte. Half/expertise export as real
      // numeric CritterDB totals, not unsupported custom proficiency fields.
      if (mode === 'fixed') continue;
      row.proficient = mode === 'full'; row.value = total(creature, row[nameKey], mode, row.value);
    }
    return creature;
  }
  function rowTotal(creature, row, kind, config) { return total(creature, kind === 'saves' ? row.ability : row.name, modeFor(row, kind, config), row.value); }
  function formula(creature, link) { return mod(creature.stats.abilityScores?.[link.ability]) + (link.kind === 'modifier' ? 0 : creature.stats.proficiencyBonus || 0) + (link.kind === 'dc' ? 8 : 0) + link.bonus; }
  function reconcile(raw, remote, previous) {
    const config = validate(raw);
    if (remote.stats.armorClass !== previous.stats.armorClass && Number.isFinite(remote.stats.armorClass)) config.ac.base += remote.stats.armorClass - armor(remote, config);
    if (remote.stats.proficiencyBonus !== previous.stats.proficiencyBonus && remote.stats.proficiencyBonus !== pbForCR(remote.stats.challengeRating)) config.pb = 'custom';
    for (const [field, kind, nameKey] of [['savingThrows', 'saves', 'ability'], ['skills', 'skills', 'name']]) for (const row of remote.stats[field] || []) {
      const name = row[nameKey], old = previous.stats[field]?.find(v => key(v[nameKey]) === key(name));
      if (!old || row.proficient !== old.proficient) config[kind][key(name)] = row.proficient ? 'full' : Number.isFinite(row.value) ? 'fixed' : 'none';
      else if (!row.proficient && row.value !== old.value && row.value !== total(remote, name, modeFor(row, kind, config), row.value)) config[kind][key(name)] = 'fixed';
    }
    return config;
  }
  return { abilities, skillAbilities, key, mod, signed, abilityFor, pbForCR, infer, validate, modeFor, total, armor, apply, rowTotal, formula, reconcile };
});
