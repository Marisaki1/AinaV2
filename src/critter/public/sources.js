(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CritterSources = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function parse(value) {
    let url;
    try { url = new URL(value); } catch { throw new Error('Paste a CritterDB creature or bestiary URL.'); }
    const match = url.hash.match(/^#\/(creature|bestiary|publishedbestiary)\/(?:view|edit)\/([a-f0-9]{24})\/?$/i);
    if (url.protocol !== 'https:' || !['critterdb.com', 'www.critterdb.com'].includes(url.hostname) || url.port || url.username || url.password || url.pathname !== '/' || url.search || !match) throw new Error('Use an HTTPS CritterDB creature or bestiary URL.');
    return { kind: match[1].toLowerCase(), id: match[2].toLowerCase() };
  }
  async function load(value, get) {
    const { kind, id } = parse(value);
    if (kind === 'creature') return get('/api/creatures/' + id);
    const base = '/api/' + (kind === 'bestiary' ? 'bestiaries' : 'publishedbestiaries') + '/' + id;
    const data = await get(base);
    const creatures = [];
    if (kind === 'bestiary') creatures.push(...await get(base + '/creatures'));
    else {
      for (let page = 1; ; page++) {
        const batch = await get(base + '/creatures/' + page);
        if (!Array.isArray(batch)) throw new Error('CritterDB did not return a creature list.');
        if (!batch.length) break;
        creatures.push(...batch);
        if (page >= 100 || creatures.length > 10000) throw new Error('This bestiary is too large. Import its JSON file instead.');
      }
    }
    return { ...data, creatures };
  }
  // Runs only when the user invokes their bookmark on CritterDB. Only creature data
  // is transferred to Aina; CritterDB's Auth service and tokens stay in that tab.
  function browserImport(destination, nonce) {
    if (location.protocol !== 'https:' || !['critterdb.com', 'www.critterdb.com'].includes(location.hostname)) { alert('Open your creature or bestiary on CritterDB, then use this bookmark.'); return; }
    const match = location.hash.match(/^#\/(creature|bestiary|publishedbestiary)\/(?:view|edit)\/([a-f0-9]{24})\/?$/i);
    if (!match) { alert('Open a creature or bestiary first.'); return; }
    const target = window.open(destination + '/?receive=' + encodeURIComponent(nonce), 'aina-critter-import');
    if (!target) { alert('Allow CritterDB to open the Aina import tab, then try again.'); return; }
    let payload, ready = false, sent = false;
    const send = () => { if (ready && payload && !sent) { sent = true; target.postMessage({ type: 'aina-critter-data', nonce, ...payload }, destination); } };
    const listener = event => {
      if (event.origin !== destination || event.source !== target || event.data?.nonce !== nonce) return;
      if (event.data.type === 'aina-critter-ready') { ready = true; send(); }
      if (event.data.type === 'aina-critter-received') { clearTimeout(timer); window.removeEventListener('message', listener); }
    };
    window.addEventListener('message', listener);
    const timer = setTimeout(() => window.removeEventListener('message', listener), 120000);
    (async () => {
      try {
        const http = window.angular.element(document.body).injector().get('$http');
        const get = url => http.get(url, { cache: false, timeout: 20000 }).then(r => r.data);
        const kind = match[1].toLowerCase(), id = match[2].toLowerCase();
        let data;
        if (kind === 'creature') data = await get('/api/creatures/' + id);
        else {
          const base = '/api/' + (kind === 'bestiary' ? 'bestiaries' : 'publishedbestiaries') + '/' + id;
          data = { ...await get(base), creatures: [] };
          if (kind === 'bestiary') data.creatures = await get(base + '/creatures');
          else for (let page = 1; ; page++) {
            const batch = await get(base + '/creatures/' + page);
            if (!Array.isArray(batch)) throw new Error();
            if (!batch.length) break;
            data.creatures.push(...batch);
            if (page >= 100 || data.creatures.length > 10000) throw new Error();
          }
        }
        payload = { data }; send();
      } catch { payload = { error: 'Could not read this CritterDB page. Sign in in this browser and make sure you can view the creature or bestiary, or import its JSON file.' }; send(); }
    })();
  }
  return { parse, load, browserImport };
});
