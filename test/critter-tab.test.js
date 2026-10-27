const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Core = require('../src/critter/public/core');
const { creature } = require('./critter-fixture');
const { TabTransport } = require('../src/critter/tab-transport');
const { createService } = require('../src/critter/server');
const { critterOperation } = require('../extensions/aina-critterdb/page-operation');
const ID = '111111111111111111111111', PACK = '222222222222222222222222', USER = '333333333333333333333333';
const clone = Core.clone;
function fixture() {
  const original = creature(); original._id = ID; original.bestiaryId = PACK;
  const state = { creature: clone(original), auth: true, owner: USER, writes: 0, routes: [], listQueries: [] };
  const http = {
    async get(route, options = {}) {
      state.routes.push(route);
      if (route === '/api/authenticate/user') return { data: { _id: USER } };
      if (route === '/api/creatures/' + ID) return { data: clone(state.creature) };
      if (route === '/api/bestiaries/' + PACK) return { data: { _id: PACK, name: 'Private bestiary', ownerId: state.owner, future: { keep: true } } };
      if (route === '/api/bestiaries/' + PACK + '/creatures') {
        state.listQueries.push(options.params || {});
        // Match CritterDB's real behavior: query parameters become creature filters.
        return { data: [clone(state.creature)].filter(c => Object.entries(options.params || {}).every(([k, v]) => c[k] === v)) };
      }
      throw { status: 400, data: 'Creature not found' };
    },
    async put(route, value) { assert.equal(route, '/api/creatures/' + ID); state.writes++; state.creature = clone(value); return { data: clone(value) }; },
  };
  const context = vm.createContext({ location: new URL('https://critterdb.com/#/bestiary/view/' + PACK), document: { body: {} }, setTimeout, clearTimeout,
    window: { angular: { element: () => ({ injector: () => ({ has: name => name === 'Auth', get: name => name === '$http' ? http : { executeOnLogin: fn => fn(), isLoggedIn: () => state.auth, privateToken: 'must-stay-in-browser' } }) }) } } });
  const operation = vm.runInContext('(' + critterOperation.toString() + ')', context);
  return { state, original, async run(args) { return clone(await operation(clone(args))); } };
}
test('existing-tab operations load owned creatures and bestiaries and keep authentication in the tab', async () => {
  const f = fixture();
  assert.deepEqual(await f.run({ operation: 'probe' }), { ok: true });
  const read = await f.run({ operation: 'read', id: ID });
  assert.deepEqual(read.creature, f.original);
  const pack = await f.run({ operation: 'source', kind: 'bestiary', id: PACK });
  assert.equal(pack.data.creatures.length, 1); assert.equal(pack.data.future.keep, true);
  assert.deepEqual(f.state.listQueries, [{}]);
  assert(!JSON.stringify(pack).includes('must-stay-in-browser')); assert.equal(f.state.writes, 0);
  f.state.auth = false; assert.equal((await f.run({ operation: 'read', id: ID })).code, 'sign_in_required');
  f.state.auth = true; f.state.owner = 'someone-else';
  assert.equal((await f.run({ operation: 'read', id: ID })).code, 'permission_denied');
  assert.equal((await f.run({ operation: 'source', kind: 'bestiary', id: PACK })).code, 'permission_denied');
  assert.equal((await f.run({ operation: 'read', id: '444444444444444444444444' })).code, 'inaccessible');
});
test('existing-tab checked saves preserve hidden YAML and fields, reload, reject conflicts and identity changes', async () => {
  const f = fixture(), edited = clone(f.original); edited.flavor.description = '<p>Edited description</p>';
  const result = await f.run({ operation: 'save', id: ID, original: f.original, candidate: edited });
  assert.equal(result.ok, true); assert.deepEqual(result.creature, edited); assert.equal(f.state.writes, 1);
  assert.deepEqual(result.creature.stats, f.original.stats); assert.deepEqual(result.creature.extra, f.original.extra);
  assert.equal(result.creature.stats.actions[0].description, f.original.stats.actions[0].description);
  assert.equal(f.state.routes.at(-1), '/api/creatures/' + ID);
  const stale = await f.run({ operation: 'save', id: ID, original: f.original, candidate: edited });
  assert.equal(stale.code, 'conflict'); assert.equal(f.state.writes, 1);
  for (const key of ['_id', 'bestiaryId', 'extra']) {
    const bad = clone(edited); bad[key] = 'changed';
    assert.equal((await f.run({ operation: 'save', id: ID, original: edited, candidate: bad })).ok, false);
    assert.equal(f.state.writes, 1);
  }
});
test('tab transport rejects wrong/replayed replies, disconnects pending work, and never starts a browser', async () => {
  const transport = new TabTransport({ timeout: 100, lease: 10000 });
  assert.equal((await transport.probe()).state, 'disconnected');
  const { channel } = transport.attach(), read = transport.read(ID), next = await transport.next(channel);
  assert.equal(next.job.input.id, ID);
  assert.throws(() => transport.complete('wrong', next.job.id, { ok: true }), /disconnected/i);
  transport.complete(channel, next.job.id, { ok: true, creature: { _id: ID } }); assert.deepEqual(await read, { _id: ID });
  assert.throws(() => transport.complete(channel, next.job.id, { ok: true }), /expired/);
  const pending = assert.rejects(transport.read(ID), e => e.code === 'disconnected'); transport.disconnect(); await pending;
  const expired = transport.attach();
  await assert.rejects(transport.read(ID), e => e.code === 'disconnected');
  assert.deepEqual(transport.queue, []); assert(expired.channel);
  await transport.close();
});
test('full HTTP tab relay loads a private bestiary, saves one member, detects conflicts and recovers after reconnect', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-tab-tests-')), f = fixture(), service = createService({ directory, port: 0 });
  let stopped = false, channel = '';
  t.after(async () => { stopped = true; await service.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  await service.start();
  const headers = { 'X-Aina-Local': '1', 'Content-Type': 'application/json' };
  async function api(route, data) {
    const response = await fetch(service.url + '/api/' + route, { headers, ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}) });
    const value = await response.json(); if (!response.ok) throw Object.assign(new Error(value.error), value); return value;
  }
  async function relay(key) {
    while (!stopped && channel === key) {
      try {
        const { job } = await api('remote/browser/jobs', { channel: key });
        if (job) await api('remote/browser/result', { channel: key, id: job.id, result: await f.run(job.input) });
      } catch { return; }
    }
  }
  async function connect() { channel = (await api('remote/browser/attach', {})).channel; void relay(channel); }
  await connect(); assert.equal((await api('remote/status')).state, 'connected');
  const loaded = await api('remote/source', { url: 'https://critterdb.com/#/bestiary/view/' + PACK });
  const document = loaded.workspace.documents[0], key = document.keys[0];
  assert.equal(document.data.creatures.length, 1); assert.equal(document.data.future.keep, true);
  const candidate = clone(document.data.creatures[0]); candidate.flavor.description = '<p>A revised description</p>';
  const linked = await api('remote/attach', { key, url: 'https://critterdb.com/#/creature/edit/' + ID, original: document.data.creatures[0] });
  const review = await api('remote/review', { documentId: linked.documentId, creature: candidate });
  const saved = await api('remote/save', { documentId: linked.documentId, creature: candidate, reviewToken: review.reviewToken });
  assert.equal(saved.state, 'saved'); assert.equal(f.state.writes, 1); assert.deepEqual(saved.workspace.documents[0].data.creatures[0], candidate);
  const editAgain = clone(candidate); editAgain.flavor.description = 'Recover this draft';
  const nextReview = await api('remote/review', { documentId: linked.documentId, creature: editAgain });
  f.state.creature.stats.armorClass = 44;
  await assert.rejects(api('remote/save', { documentId: linked.documentId, creature: editAgain, reviewToken: nextReview.reviewToken }), e => e.code === 'conflict');
  assert.equal(f.state.writes, 1);
  f.state.auth = false;
  await assert.rejects(api('remote/review', { documentId: linked.documentId, creature: editAgain }), e => e.code === 'sign_in_required');
  assert.equal((await api('workspace')).workspace.documents[0].data.creatures[0].flavor.description, 'Recover this draft');
  service.remote.transport.disconnect(); await connect(); f.state.auth = true;
  assert.equal((await api('remote/status')).state, 'connected');
  assert.equal((await api('workspace')).workspace.documents[0].data.creatures[0].flavor.description, 'Recover this draft');
  const reloaded = await api('remote/source', { url: 'https://critterdb.com/#/bestiary/view/' + PACK });
  assert.equal(reloaded.workspace.documents.length, 1); assert.equal(reloaded.workspace.documents[0].data.creatures[0].flavor.description, 'Recover this draft');
  assert(fs.readdirSync(path.join(directory, 'remote/backups')).length > 0);
  assert(!JSON.stringify(await api('workspace')).includes('must-stay-in-browser'));
});
test('extension only accepts configured local editor and existing CritterDB tabs; it never creates or navigates tabs', async () => {
  let listener, executions = 0;
  const chrome = {
    storage: { local: { get: async () => ({}) } },
    runtime: { getManifest: () => ({ version: '1.0.1' }), onMessage: { addListener(fn) { listener = fn; } } },
    tabs: { query: async () => [{ id: 7, url: 'https://critterdb.com/#/about', title: 'CritterDB' }], get: async () => ({ id: 7, url: 'https://critterdb.com/#/about' }) },
    scripting: { async executeScript(args) { executions++; assert.equal(args.target.tabId, 7); assert.equal(args.world, 'MAIN'); return [{ result: { ok: true } }]; } },
  };
  const context = vm.createContext({ chrome, URL, importScripts() {}, critterOperation });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extensions/aina-critterdb/background.js'), 'utf8'), context);
  const send = (msg, url) => new Promise(resolve => listener(msg, { tab: { id: 2 }, frameId: 0, url }, resolve));
  assert.equal((await send({ operation: 'tabs' }, 'https://evil.test')).code, 'permission_denied');
  assert.equal((await send({ operation: 'tabs' }, 'http://127.0.0.1:9999')).code, 'permission_denied');
  assert.equal((await send({ operation: 'tabs' }, 'http://127.0.0.1:4317')).tabs.length, 1);
  assert.equal((await send({ operation: 'execute', tabId: 7, input: { operation: 'probe' } }, 'http://127.0.0.1:4317')).ok, true);
  assert.equal(executions, 1);
});
