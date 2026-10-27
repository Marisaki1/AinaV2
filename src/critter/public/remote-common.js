(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CritterRemote = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function parseCreatureURL(input) {
    let url;
    try { url = new URL(String(input).trim()); } catch { throw new Error('Paste a full HTTPS CritterDB creature URL.'); }
    if (url.protocol !== 'https:' || !['critterdb.com', 'www.critterdb.com'].includes(url.hostname) || url.port || url.username || url.password || url.pathname !== '/' || url.search) throw new Error('Use an HTTPS creature URL on critterdb.com.');
    const match = url.hash.match(/^#\/?creature\/(?:edit|view)\/([a-f0-9]{24})\/?$/i);
    if (!match) throw new Error('Expected a CritterDB creature edit/view URL with a 24-character creature ID.');
    const id = match[1].toLowerCase();
    return { id, url: `https://critterdb.com/#/creature/edit/${id}` };
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  const equal = (a, b) => canonical(a) === canonical(b);
  function diff(before, after, path = '') {
    if (equal(before, after)) return [];
    if (before && after && !Array.isArray(before) && !Array.isArray(after) && typeof before === 'object' && typeof after === 'object') {
      return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => diff(before[key], after[key], path ? path + '.' + key : key));
    }
    return [{ path, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) }];
  }
  function assertIdentity(original, candidate) {
    for (const key of ['_id', 'id', 'bestiaryId', 'publishedBestiaryId', 'sharing', '__v']) {
      if (!equal(original[key], candidate[key])) throw new Error(`Remote edits cannot change ${key}. The creature identity, collection membership, and access settings must stay intact.`);
    }
    // All original properties are passed through; the editor may only change creature content.
    for (const change of diff(original, candidate)) if (!['name', 'stats', 'flavor'].includes(change.path.split('.')[0])) throw new Error(`Remote edits cannot change ${change.path}. Use CritterDB to change ownership or metadata.`);
  }
  function persistedEqual(expected, actual) {
    const clean = value => { const copy = JSON.parse(JSON.stringify(value)); delete copy.__v; return copy; };
    return equal(clean(expected), clean(actual));
  }
  return { parseCreatureURL, canonical, equal, diff, assertIdentity, persistedEqual };
});
