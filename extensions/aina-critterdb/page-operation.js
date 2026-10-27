// Serialized by chrome.scripting into the selected CritterDB tab's MAIN world.
// Only creature data and fixed status codes return. Auth/token/cookies stay in that tab.
async function critterOperation(args) {
  const fail = (code, current) => ({ ok: false, code, ...(current ? { current } : {}) });
  const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
  const idOK = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
  const classify = error => {
    const text = typeof error?.data === 'string' ? error.data : '';
    if (error?.status === 401 || /authenticate token|No token provided|authentication failed/i.test(text)) return 'sign_in_required';
    if (error?.status === 403 || /not authorized|access denied/i.test(text)) return 'permission_denied';
    if (error?.status === 404 || /not found/i.test(text)) return 'inaccessible';
    return 'failed';
  };
  try {
    if (location.protocol !== 'https:' || !['critterdb.com', 'www.critterdb.com'].includes(location.hostname) || location.port) return fail('unsupported');
    if (!['probe', 'read', 'source', 'save'].includes(args?.operation)) return fail('unsupported');
    if (args.operation !== 'probe' && !idOK(args.id)) return fail('inaccessible');
    const injector = window.angular?.element(document.body).injector();
    if (!injector?.has('Auth')) return fail('unsupported');
    const auth = injector.get('Auth'), http = injector.get('$http');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 10000);
      auth.executeOnLogin(() => { clearTimeout(timer); resolve(); });
    });
    if (!auth.isLoggedIn()) return fail('sign_in_required');
    // CritterDB treats every query parameter on a bestiary creature list as a
    // Mongo filter. A cache-busting query silently filters out every creature.
    const get = url => http.get(url, { cache: false, timeout: 12000, headers: { 'Cache-Control': 'no-cache' } }).then(r => r.data);
    let user;
    try { user = await get('/api/authenticate/user'); } catch (error) { return fail(classify(error)); }
    if (!user?._id) return fail('sign_in_required');
    if (args.operation === 'probe') return { ok: true };
    const owned = collection => (typeof collection === 'object' ? collection?._id : collection) === user._id;
    if (args.operation === 'source') {
      if (!['creature', 'bestiary', 'publishedbestiary'].includes(args.kind)) return fail('unsupported');
      if (args.kind !== 'creature') {
        const base = '/api/' + (args.kind === 'bestiary' ? 'bestiaries' : 'publishedbestiaries') + '/' + args.id;
        const collection = await get(base);
        if (collection?._id !== args.id) return fail('inaccessible');
        if (!owned(args.kind === 'bestiary' ? collection.ownerId : collection.owner)) return fail('permission_denied');
        const creatures = [];
        if (args.kind === 'bestiary') creatures.push(...await get(base + '/creatures'));
        else for (let page = 1; ; page++) {
          const batch = await get(base + '/creatures/' + page);
          if (!Array.isArray(batch)) return fail('failed');
          if (!batch.length) break;
          creatures.push(...batch);
          if (page >= 100 || creatures.length > 10000) return fail('failed');
        }
        if (creatures.some(c => !idOK(c?._id) || (args.kind === 'bestiary' ? c.bestiaryId : c.publishedBestiaryId) !== args.id)) return fail('failed');
        return { ok: true, data: { ...collection, creatures } };
      }
    }
    const current = await get('/api/creatures/' + args.id);
    if (current?._id !== args.id) return fail('inaccessible');
    if (current.bestiaryId && !current.publishedBestiaryId) {
      if (!owned((await get('/api/bestiaries/' + current.bestiaryId)).ownerId)) return fail('permission_denied');
    } else if (current.publishedBestiaryId && !current.bestiaryId) {
      if (!owned((await get('/api/publishedbestiaries/' + current.publishedBestiaryId)).owner)) return fail('permission_denied');
    } else return fail('permission_denied');
    if (args.operation === 'source') return { ok: true, data: current };
    if (args.operation === 'read') return { ok: true, creature: current };
    if (canonical(current) !== canonical(args.original)) return fail('conflict', current);
    // Defense in depth: the connection can update content only, on this same record.
    const candidate = args.candidate;
    if (!candidate || candidate._id !== args.id) return fail('failed');
    for (const key of new Set([...Object.keys(current), ...Object.keys(candidate)])) {
      if (!['name', 'stats', 'flavor'].includes(key) && canonical(current[key]) !== canonical(candidate[key])) return fail('failed');
    }
    const options = { timeout: 12000 };
    await http.put('/api/creatures/' + args.id, candidate, options);
    return { ok: true, creature: await get('/api/creatures/' + args.id) };
  } catch (error) { return fail(classify(error)); }
}
if (typeof module !== 'undefined') module.exports = { critterOperation };
