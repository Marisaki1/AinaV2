(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core') : root.Critter);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CombatModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  const numeric = value => value !== '' && value != null && Number.isFinite(Number(value));
  function ordered(entries) {
    return entries.map((entry, index) => ({ entry, index })).sort((a, b) => numeric(a.entry.fixedInitiative) && numeric(b.entry.fixedInitiative) ? Number(b.entry.fixedInitiative) - Number(a.entry.fixedInitiative) || a.index - b.index : numeric(a.entry.fixedInitiative) ? -1 : numeric(b.entry.fixedInitiative) ? 1 : a.index - b.index).map(v => v.entry);
  }
  function expand(entries) {
    return entries.flatMap(e => /^\d+$/.test(e.quantity || '1') ? Array.from({ length: Math.min(Number(e.quantity || '1'), 100) }, (_, i) => ({ ...e, rosterKey: e.id + ':' + i, name: e.name.replace(/#/g, String(i + 1)) })) : [{ ...e, rosterKey: e.id + ':manual', unresolved: true }]);
  }
  function move(entries, id, destination) {
    const rows = C.clone(entries), from = rows.findIndex(e => e.id === id), to = rows.findIndex(e => e.id === destination);
    if (from < 0 || to < 0 || from === to) return rows;
    rows.splice(to, 0, rows.splice(from, 1)[0]);
    const highest = Math.max(20, rows.length, ...rows.filter(e => numeric(e.fixedInitiative)).map(e => Number(e.fixedInitiative)));
    rows.forEach((e, i) => { e.fixedInitiative = String(highest - i); e.initiativeBonus = ''; });
    return rows;
  }
  function monsterRoll(sourceName, type, stat, roll = 'normal', prefix = '!') {
    if (!['save', 'check'].includes(type)) throw new Error('Choose a save or check.');
    if (!['normal', 'adv', 'dis'].includes(roll)) throw new Error('Choose a roll mode.');
    if (type === 'save' && !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(stat)) throw new Error('Choose a saving throw ability.');
    const safe = C.quote(stat, 'Ability or check');
    return C.prefix(prefix) + (type === 'save' ? 'ms ' : 'mc ') + C.quote(sourceName, 'Source creature name') + ' ' + (/^[a-z]+$/i.test(stat) ? stat : safe) + (roll === 'normal' ? '' : ' ' + roll);
  }
  function bestiary(workspace, key) {
    const ref = C.creatures(workspace).find(c => c.key === key), doc = workspace.documents.find(d => d.id === ref?.documentId);
    if (doc?.data.creatures) return C.clone(doc.data);
    return { name: 'Aina Bestiary', description: '', creatures: C.creatures(workspace).map(c => C.clone(c.data)) };
  }
  return { numeric, ordered, expand, move, monsterRoll, bestiary };
});
