const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const Core = require('./public/core');
const { inspectCreature } = require('./automation');
const { WorkspaceStore } = require('./store');
const { DiscordBridge } = require('./discord');
const { RemoteEdits } = require('./remote');
const { loadPublicSource } = require('./sources');
const { editAbility } = require('./ability-editor');
const { equal } = require('./public/remote-common');
const Traits = require('./combat-traits');
const Authoring = require('./authoring');
const CriticalTraits = require('./critical-traits');
const { calculate } = require('./creature-calculations');
const { EncounterMirror } = require('./mirror');
const { CommandSender } = require('./command-sender');

function createService({ client = null, directory, ownerId, port = Number(process.env.CRITTER_PORT || 4317), remoteTransport, mirrorVerifier } = {}) {
  const store = new WorkspaceStore(directory);
  const bridge = new DiscordBridge(client, store.directory, ownerId);
  const mirror = new EncounterMirror(store, bridge, { verifier: mirrorVerifier });
  const remote = new RemoteEdits(store, { transport: remoteTransport });
  const sender = new CommandSender(store, bridge);
  let origin = '';
  function json(response, status, data) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  }
  async function body(request) {
    if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Expected application/json.');
    const chunks = []; let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) throw new Error('Upload exceeds the 20 MB workspace limit.');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const assets = { '/spellcasting-model.js': ['spellcasting-model.js','text/javascript'], '/spellcasting-ui.js': ['spellcasting-ui.js','text/javascript'], '/resource-ui.js': ['resource-ui.js','text/javascript'], '/critical-model.js': ['critical-model.js', 'text/javascript'], '/critical-editor.js': ['critical-editor.js', 'text/javascript'], '/attack-modifiers.js': ['attack-modifiers.js', 'text/javascript'], '/party-roster.js': ['party-roster.js', 'text/javascript'], '/ability-tools-model.js': ['ability-tools-model.js', 'text/javascript'], '/ability-extras-ui.js': ['ability-extras-ui.js', 'text/javascript'], '/ability-tools-ui.js': ['ability-tools-ui.js', 'text/javascript'], '/action-formulas.js': ['action-formulas.js', 'text/javascript'], '/combat-controls.js': ['combat-controls.js', 'text/javascript'], '/creature-fields.js': ['creature-fields.js', 'text/javascript'], '/creature-math.js': ['creature-math.js', 'text/javascript'], '/creature-panels.js': ['creature-panels.js', 'text/javascript'], '/workshop.css': ['workshop.css', 'text/css'], '/sender-ui.js': ['sender-ui.js', 'text/javascript'], '/sender.css': ['sender.css', 'text/css'], '/tab-bridge.js': ['tab-bridge.js', 'text/javascript'], '/search-select.js': ['search-select.js', 'text/javascript'], '/search-select.css': ['search-select.css', 'text/css'], '/direct-ui.js': ['direct-ui.js', 'text/javascript'], '/feedback.js': ['feedback.js', 'text/javascript'], '/authoring-model.js': ['authoring-model.js', 'text/javascript'], '/authoring-ui.js': ['authoring-ui.js', 'text/javascript'], '/mirror-model.js': ['mirror-model.js', 'text/javascript'], '/mirror-ui.js': ['mirror-ui.js', 'text/javascript'], '/combat-traits.js': ['combat-traits.js', 'text/javascript'], '/traits-ui.js': ['traits-ui.js', 'text/javascript'], '/combat-model.js': ['combat-model.js', 'text/javascript'], '/editor-ui.js': ['editor-ui.js', 'text/javascript'], '/': ['index.html', 'text/html'], '/advanced': ['advanced.html', 'text/html'], '/desk.js': ['desk.js', 'text/javascript'], '/desk.css': ['desk.css', 'text/css'], '/sources.js': ['sources.js', 'text/javascript'], '/app.js': ['app.js', 'text/javascript'], '/core.js': ['core.js', 'text/javascript'], '/remote-common.js': ['remote-common.js', 'text/javascript'], '/remote-ui.js': ['remote-ui.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      // Loopback binding + exact Host check prevent LAN access and DNS rebinding.
      if (request.headers.host !== new URL(origin).host) return json(response, 403, { error: `Open ${origin} on this computer.` });
      if (request.headers.origin && request.headers.origin !== origin) return json(response, 403, { error: 'Cross-origin requests are not allowed.' });
      const url = new URL(request.url, origin);
      if (request.method === 'GET' && assets[url.pathname]) {
        const [file, mime] = assets[url.pathname];
        response.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store' });
        return response.end(fs.readFileSync(path.join(__dirname, 'public', file)));
      }
      if (request.headers['x-aina-local'] !== '1' || request.headers['sec-fetch-site'] === 'cross-site') return json(response, 403, { error: 'Use the local workspace interface.' });
      if (url.pathname.startsWith('/api/sender/')) {
        const route = url.pathname.slice('/api/sender/'.length);
        // Same trusted-local-machine boundary as /api/post. User-account login is retired.
        if (['connect', 'repair', 'unlock', 'lock', 'disconnect', 'session'].includes(route)) return json(response, 410, { error: 'User-account sending was removed. Aina uses its existing bot connection.' });
        if (route === 'status' && request.method === 'GET') return json(response, 200, sender.view());
        const data = await body(request);
        if (route === 'cancel' && request.method === 'POST') return json(response, 200, sender.cancel());
        if (route === 'send' && request.method === 'POST') return json(response, 202, { command: sender.submit(data) });
        if (route === 'config' && request.method === 'POST') return json(response, 200, { config: sender.configure(data), revision: store.revision });
        return json(response, 404, { error: 'Unknown sender endpoint.' });
      }
      if (request.method === 'GET' && url.pathname === '/api/workspace') return json(response, 200, remote.view());
      if (request.method === 'GET' && url.pathname === '/api/mirror') return json(response, 200, mirror.view());
      if (request.method === 'GET' && url.pathname === '/api/mirror/alias') return json(response, 200, { code: mirror.alias() });
      if (request.method === 'GET' && url.pathname === '/api/remote/links') return json(response, 200, { links: remote.links() });
      if (request.method === 'GET' && url.pathname === '/api/remote/status') return json(response, 200, await remote.transport.probe());
      if (request.method === 'GET' && url.pathname === '/api/remote/browser/setup') return json(response, 200, { directory: path.resolve(__dirname, '../../extensions/aina-critterdb') });
      if (request.method === 'GET' && url.pathname === '/api/status') {
        let channels = [], error = '';
        try { channels = await bridge.channels(); } catch (e) { error = e.message; }
        return json(response, 200, { connected: Boolean(client?.isReady()), ownerConfigured: Boolean(bridge.ownerId), channels, error, pending: bridge.pending.size });
      }
      const data = await body(request);
      if (request.method === 'POST' && url.pathname === '/api/remote/browser/attach') {
        if (!remote.transport.attach) throw new Error('This test transport does not support a tab connection.');
        return json(response, 200, remote.transport.attach());
      }
      if (request.method === 'POST' && url.pathname === '/api/remote/browser/jobs') return json(response, 200, await remote.transport.next(data.channel));
      if (request.method === 'POST' && url.pathname === '/api/remote/browser/result') {
        remote.transport.complete(data.channel, data.id, data.result); return json(response, 200, { ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/remote/source') return json(response, 200, await remote.loadSource(data.url));
      if (request.method === 'POST' && url.pathname === '/api/mirror/diagnose') return json(response, 200, await mirror.diagnose(data.key));
      if (request.method === 'POST' && url.pathname === '/api/remote/attach') return json(response, 200, await remote.attach(data.key, data.url, data.original));
      if (request.method === 'POST' && url.pathname === '/api/library/clear') {
        if (remote.busy) throw Object.assign(new Error('Wait for the CritterDB save to finish before clearing the library.'), { status: 409 });
        const current = store.read();
        if (data.revision !== current.revision) throw Object.assign(new Error('Library changed. Reopen Clear library before confirming.'), { status: 409 });
        const refs = Core.creatures(current.workspace), removed = data.scope === 'all' ? refs : data.scope === 'document' ? refs.filter(c => c.documentId === data.documentId) : data.scope === 'creature' ? refs.filter(c => c.key === data.key) : null;
        if (!removed) throw new Error('Choose a library clear scope.');
        if (data.scope !== 'all' && !removed.length && !(data.scope === 'document' && current.workspace.documents.some(d => d.id === data.documentId))) throw new Error('The selected library item no longer exists.');
        const directory = path.join(store.directory, 'library-backups'); fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const filename = Date.now() + '-' + randomUUID() + '.json'; fs.writeFileSync(path.join(directory, filename), JSON.stringify(remote.view().workspace, null, 2), { mode: 0o600, flag: 'wx' });
        const keys = new Set(removed.map(c => c.key));
        if (data.scope === 'all') current.workspace.documents = [];
        else if (data.scope === 'document') current.workspace.documents = current.workspace.documents.filter(d => d.id !== data.documentId);
        else { const ref = removed[0], doc = current.workspace.documents.find(d => d.id === ref.documentId); if (doc.data.creatures) { doc.data.creatures.splice(ref.index, 1); doc.keys.splice(ref.index, 1); } else current.workspace.documents = current.workspace.documents.filter(d => d.id !== ref.documentId); }
        for (const key of keys) { delete current.workspace.combatTraits?.[key]; delete current.workspace.creatureCalculations?.[key]; }
        store.save(current.workspace, current.revision);
        for (const [id, b] of Object.entries(remote.data.bindings)) if (keys.has(b.creatureKey) || !b.creatureKey && !current.workspace.documents.some(d => d.id === id)) { delete remote.data.bindings[id]; delete remote.data.drafts[id]; remote.reviews.delete(id); }
        remote.persist(); return json(response, 200, { ...remote.view(), removed: removed.length, backup: 'data/critter/library-backups/' + filename });
      }
      if (request.method === 'POST' && url.pathname === '/api/mirror/configure') return json(response, 200, await mirror.configure(data));
      if (request.method === 'POST' && url.pathname === '/api/mirror/refresh') return json(response, 200, mirror.prepare(data.key));
      if (request.method === 'POST' && url.pathname === '/api/mirror/import') return json(response, 200, mirror.import(data.key, data.text ?? data.snapshot));
      if (request.method === 'POST' && url.pathname === '/api/mirror/accept') return json(response, 200, mirror.accept(data.key, data.candidateId));
      if (request.method === 'POST' && url.pathname === '/api/mirror/command') return json(response, 200, mirror.generate(data.key, data.snapshotId, data.spec));
      if (request.method === 'POST' && url.pathname === '/api/mirror/favorite') return json(response, 200, mirror.favorite(data.key, data.historyId));
      if (request.method === 'POST' && url.pathname === '/api/mirror/copied') {
        mirror.history(data.key, null, null, 'copied', data.historyId); return json(response, 200, { status: 'copied' });
      }
      if (request.method === 'POST' && url.pathname === '/api/combat-traits/preview') {
        const view = remote.view().workspace, ref = Core.creatures(view).find(c => c.key === data.key);
        if (!ref) throw new Error('Choose an existing creature.');
        const previous = view.combatTraits?.[data.key] || null;
        return json(response, 200, { ...Traits.preview(ref.data, data.config, previous), original: ref.data, previous });
      }
      if (request.method === 'PUT' && url.pathname === '/api/combat-traits') {
        if (remote.busy) throw Object.assign(new Error('Wait for the current CritterDB operation to finish.'), { status: 409 });
        const view = remote.view().workspace, ref = Core.creatures(view).find(c => c.key === data.key), previous = view.combatTraits?.[data.key] || null;
        if (!ref || !equal(ref.data, data.original) || !equal(previous, data.previous || null)) throw Object.assign(new Error('Creature or traits changed elsewhere. Your draft is retained; refresh and review again.'), { status: 409 });
        const result = Traits.preview(ref.data, data.config, previous), current = store.read();
        const stored = Core.creatures(current.workspace).find(c => c.key === data.key), doc = current.workspace.documents.find(d => d.id === stored.documentId);
        const backups = path.join(store.directory, 'creature-backups'); fs.mkdirSync(backups, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(backups, Date.now() + '-' + randomUUID() + '.json'), JSON.stringify({ key: data.key, original: ref.data, candidate: result.candidate, previousTraits: previous, traits: data.config }, null, 2), { mode: 0o600, flag: 'wx' });
        if (doc.data.creatures) doc.data.creatures[stored.index] = result.candidate; else doc.data = result.candidate;
        current.workspace.combatTraits ||= {}; current.workspace.combatTraits[data.key] = data.config;
        remote.captureWorkspace(current.workspace); store.save(current.workspace, current.revision);
        return json(response, 200, remote.view());
      }
      if (request.method === 'POST' && url.pathname === '/api/creature-calculate') return json(response, 200, { creature: calculate(Core.validateCreature(data.creature), data.calculations) });
      if (request.method === 'POST' && url.pathname === '/api/creature-critical-preview') return json(response, 200, CriticalTraits.preview(Core.validateCreature(data.creature), data.config));
      if (request.method === 'POST' && url.pathname === '/api/ability-build') return json(response, 200, Authoring.build(data));
      if (request.method === 'POST' && url.pathname === '/api/creature-traits-preview') return json(response, 200, Traits.preview(Core.validateCreature(data.creature), data.config, data.previous));
      if (request.method === 'POST' && url.pathname === '/api/ability-edit') return json(response, 200, { creature: editAbility(Core.validateCreature(data.creature), data.edits) });
      if (request.method === 'PUT' && url.pathname === '/api/creature') {
        if (remote.busy) throw Object.assign(new Error('Wait for the current CritterDB operation to finish.'), { status: 409 });
        const visible = Core.creatures(remote.view().workspace).find(c => c.key === data.key);
        if (!visible || !equal(visible.data, data.original)) throw Object.assign(new Error('This creature changed in another window. Your edits are retained; reload before replacing it.'), { status: 409 });
        let candidate = Core.validateCreature(data.candidate); const current = store.read();
        const previousTraits = current.workspace.combatTraits?.[data.key] || null;
        const previousCalculations = current.workspace.creatureCalculations?.[data.key] || null;
        if (data.calculations !== undefined) {
          if (!equal(previousCalculations, data.previousCalculations || null)) throw Object.assign(new Error('Calculation settings changed elsewhere. Your draft is retained; reopen before replacing them.'), { status: 409 });
          candidate = calculate(candidate, data.calculations);
          current.workspace.creatureCalculations ||= {}; current.workspace.creatureCalculations[data.key] = data.calculations;
        }
        if (data.traits !== undefined) {
          if (!equal(previousTraits, data.previousTraits || null)) throw Object.assign(new Error('Traits changed elsewhere. Your draft is retained; reload before replacing them.'), { status: 409 });
          candidate = Traits.preview(candidate, data.traits, previousTraits).candidate;
          current.workspace.combatTraits ||= {}; current.workspace.combatTraits[data.key] = data.traits;
        }
        for (const property of ['_id', 'id', 'bestiaryId', 'publishedBestiaryId']) if (!equal(data.original[property], candidate[property])) throw new Error('Keep the existing creature ID and collection membership.');
        const ref = Core.creatures(current.workspace).find(c => c.key === data.key), doc = current.workspace.documents.find(d => d.id === ref.documentId);
        const backups = path.join(store.directory, 'creature-backups');
        fs.mkdirSync(backups, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(backups, Date.now() + '-' + randomUUID() + '.json'), JSON.stringify({ key: data.key, createdAt: new Date().toISOString(), original: visible.data, candidate, previousTraits, traits: data.traits, previousCalculations, calculations: data.calculations }, null, 2), { mode: 0o600, flag: 'wx' });
        if (doc.data.creatures) doc.data.creatures[ref.index] = candidate; else doc.data = candidate;
        remote.captureWorkspace(current.workspace); store.save(current.workspace, current.revision);
        return json(response, 200, remote.view());
      }
      if (request.method === 'PATCH' && url.pathname === '/api/preferences') {
        const current = store.read(), preferences = current.workspace.preferences;
        if (data.prefix !== undefined) {
          if (typeof data.prefix !== 'string') throw new Error('Invalid command prefix.');
          preferences.prefix = Core.prefix(data.prefix);
        }
        if (data.channelId !== undefined) {
          if (typeof data.channelId !== 'string') throw new Error('Invalid destination channel.');
          preferences.channelId = data.channelId;
        }
        if (data.desk !== undefined) {
          if (!Core.object(data.desk) || (data.desk.perCreature !== undefined && !Core.object(data.desk.perCreature))) throw new Error('Invalid combat choices.');
          const previous = Core.object(preferences.desk) ? preferences.desk : {};
          preferences.desk = { ...previous, ...data.desk, perCreature: { ...(Core.object(previous.perCreature) ? previous.perCreature : {}), ...data.desk.perCreature }, perRoster: { ...(Core.object(previous.perRoster) ? previous.perRoster : {}), ...(Core.object(data.desk.perRoster) ? data.desk.perRoster : {}) } };
        }
        store.save(current.workspace, current.revision);
        return json(response, 200, { preferences: store.read().workspace.preferences, revision: store.revision });
      }
      if (request.method === 'POST' && url.pathname === '/api/source') return json(response, 200, { data: await loadPublicSource(data.url) });
      if (request.method === 'PUT' && url.pathname === '/api/workspace') {
        if (data.revision !== store.revision) throw Object.assign(new Error('Workspace changed in another window. Reload before saving.'), { status: 409 });
        if (remote.busy) throw Object.assign(new Error('Wait for the CritterDB operation to finish before saving local changes.'), { status: 409 });
        const valid = Core.validateWorkspace(data.workspace);
        remote.captureWorkspace(valid);
        return json(response, 200, store.save(valid, data.revision));
      }
      if (request.method === 'POST' && url.pathname === '/api/remote/connect') return json(response, 200, await remote.transport.connect());
      if (request.method === 'POST' && url.pathname === '/api/remote/load') return json(response, 200, await remote.load(data.url, data.discardLocal === true));
      if (request.method === 'POST' && url.pathname === '/api/remote/draft') {
        if (remote.busy) throw Object.assign(new Error('Wait for the remote operation to finish. Your edits remain in the editor.'), { status: 409 });
        return json(response, 200, remote.stage(data.documentId, data.creature));
      }
      if (request.method === 'POST' && url.pathname === '/api/remote/review') return json(response, 200, await remote.review(data.documentId, data.creature));
      if (request.method === 'POST' && url.pathname === '/api/remote/pending') {
        const { binding } = remote.binding(data.documentId);
        return json(response, 200, { original: binding.original, changes: remote.changes(data.documentId, data.creature), verifiedAt: binding.verifiedAt || null });
      }
      if (request.method === 'POST' && url.pathname === '/api/remote/save') return json(response, 200, await remote.save(data.documentId, data.creature, data.reviewToken));
      if (request.method === 'POST' && url.pathname === '/api/remote/verify') return json(response, 200, await remote.verify(data.documentId, data.creature));
      if (request.method === 'POST' && url.pathname === '/api/analyze') {
        Core.validateCreature(data.creature);
        return json(response, 200, { abilities: inspectCreature(data.creature) });
      }
      if (request.method === 'POST' && url.pathname === '/api/post') {
        const results = await sender.postBatch(data);
        return json(response, 200, { results });
      }
      json(response, 404, { error: 'Unknown endpoint.' });
    } catch (e) { json(response, e.status || 400, { error: e.message, ...(e.code ? { code: e.code } : {}), ...(e.details ? { details: e.details } : {}) }); }
  });
  const service = { server, store, bridge, remote, mirror, sender, get url() { return origin; },
    async start() {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
      origin = `http://127.0.0.1:${server.address().port}`;
      return origin;
    },
    async close() { await sender.close(); await remote.close(); await new Promise(resolve => server.close(resolve)); },
    importJSON(value, label) {
      const imported = Core.importData(value), current = store.read();
      current.workspace.documents.push({ id: randomUUID(), label, data: imported.data, keys: Core.list(imported).map(() => randomUUID()) });
      return store.save(current.workspace, current.revision);
    },
  };
  return service;
}
module.exports = { createService };

if (require.main === module) {
  // Standalone editor is deliberately independent of Discord credentials and AI services.
  require('dotenv').config();
  const service = createService();
  service.start().then(url => console.log(`Critter workspace (offline editor): ${url}`)).catch(e => { console.error(e.message); process.exitCode = 1; });
  const stop = () => service.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
