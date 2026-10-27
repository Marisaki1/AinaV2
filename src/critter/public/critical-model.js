(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CriticalRanges = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const marker = /<!-- AINA_CRITICAL:v1:([^]*?) -->/;
  function minimum(value) {
    if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 20) throw new Error('Critical minimum must be a whole number from 1 to 20.');
    return Number(value);
  }
  function config(creature) {
    const entries = (creature?.stats?.additionalAbilities || []).filter(e => marker.test(e.description));
    if (entries.length > 1) throw new Error('More than one Aina critical trait exists. Review the duplicate traits first.');
    const match = entries[0]?.description.match(marker);
    if (!match) return null;
    try { const c = JSON.parse(decodeURIComponent(match[1])); return { minimum: minimum(c.minimum) }; }
    catch { throw new Error('The critical trait configuration is damaged. Recover its original source before replacing it.'); }
  }
  const label = n => Number(n) === 20 ? '20 only' : n + '–20';
  return { minimum, config, label, marker };
});
