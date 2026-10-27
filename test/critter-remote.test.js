const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Core = require('../src/critter/public/core');
const Remote = require('../src/critter/public/remote-common');
const { RemoteEdits } = require('../src/critter/remote');
const { RemoteError, CritterBrowser } = require('../src/critter/remote-browser');
const { WorkspaceStore } = require('../src/critter/store');
const { creature } = require('./critter-fixture');
const ID = '111111111111111111111111', URL = `https://critterdb.com/#/creature/edit/${ID}`;
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-remote-unit-'));
  t.after(() => {
    const resolved = path.resolve(directory), prefix = path.resolve(os.tmpdir()) + path.sep + 'aina-remote-unit-';
    assert.ok(resolved.startsWith(prefix)); fs.rmSync(resolved, { recursive: true, force: true });
  });
  const original = { ...creature(), _id: ID, bestiaryId: '222222222222222222222222' };
  const transport = {
    value: Core.clone(original), writes: 0, failure: null, race: false,
    async read() { if (this.failure) throw new RemoteError(this.failure); return Core.clone(this.value); },
    async writeChecked(id, expected, candidate) {
      if (this.failure) throw new RemoteError(this.failure);
      if (this.race) this.value.stats.armorClass = 99;
      if (!Remote.equal(expected, this.value)) throw new RemoteError('conflict');
      this.writes++; this.value = Core.clone(candidate); return Core.clone(this.value);
    },
  };
  const store = new WorkspaceStore(directory), remote = new RemoteEdits(store, { transport });
  return { directory, original, store, remote, transport };
}

test('reloading a cached empty bestiary imports new creatures and retains document and creature keys', async t => {
  const f = setup(t), pack = { _id: f.original.bestiaryId, name: 'Floor 8', future: 'keep', creatures: [] };
  f.transport.loadSource = async () => Core.clone(pack);
  const url = 'https://critterdb.com/#/bestiary/view/' + pack._id;
  const empty = await f.remote.loadSource(url); assert.equal(empty.creatureCount, 0);
  pack.creatures.push(Core.clone(f.original));
  const first = await f.remote.loadSource(url);
  assert.equal(first.documentId, empty.documentId); assert.equal(first.creatureCount, 1); assert.equal(first.added, 1);
  const key = first.key;
  pack.creatures.push({ ...Core.clone(f.original), _id: '444444444444444444444444', name: 'Second creature' });
  const second = await f.remote.loadSource(url);
  assert.equal(second.creatureCount, 2); assert.equal(second.workspace.documents[0].keys[0], key);
  assert.equal(second.workspace.documents[0].data.future, 'keep'); assert.equal(f.transport.writes, 0);
});
test('bestiary refresh updates untouched creatures, preserves local edits, and reports conflicts without overwriting', async t => {
  const f = setup(t), pack = { _id: f.original.bestiaryId, name: 'Pack', creatures: [Core.clone(f.original)] };
  f.transport.loadSource = async () => Core.clone(pack);
  const url = 'https://critterdb.com/#/bestiary/view/' + pack._id;
  const first = await f.remote.loadSource(url), key = first.key;
  pack.creatures[0].flavor.description = 'Remote description';
  const refreshed = await f.remote.loadSource(url);
  assert.equal(refreshed.refreshed, 1); assert.equal(refreshed.workspace.documents[0].data.creatures[0].flavor.description, 'Remote description');
  const current = f.store.read(); current.workspace.documents[0].data.creatures[0].flavor.description = 'My local edit'; f.store.save(current.workspace, current.revision);
  pack.creatures[0].stats.armorClass = 42;
  const conflict = await f.remote.loadSource(url);
  assert.equal(conflict.state, 'conflict'); assert.equal(conflict.conflicts[0].key, key);
  assert.equal(conflict.workspace.documents[0].data.creatures[0].flavor.description, 'My local edit');
  assert.notEqual(conflict.workspace.documents[0].data.creatures[0].stats.armorClass, 42);
  assert.equal(f.transport.writes, 0);
});

test('account loading repairs a prior empty copy by selecting the populated link import without deleting either copy', async t => {
  const f = setup(t), pack = { _id: f.original.bestiaryId, name: 'Floor 8', creatures: [Core.clone(f.original)] };
  const w = Core.blankWorkspace();
  w.documents.push({ id: 'old-empty', label: 'Floor 8', data: { ...pack, creatures: [] }, keys: [] });
  const edited = Core.clone(pack); edited.creatures[0].flavor.description = 'Local edit retained';
  w.documents.push({ id: 'working-link', label: 'Floor 8', data: edited, keys: ['stable-key'] });
  f.store.save(w, 0); f.transport.loadSource = async () => Core.clone(pack);
  const result = await f.remote.loadSource('https://critterdb.com/#/bestiary/view/' + pack._id);
  assert.equal(result.documentId, 'working-link'); assert.equal(result.creatureCount, 1); assert.equal(result.key, 'stable-key');
  assert.equal(result.workspace.documents.length, 2); assert.equal(result.workspace.documents[0].keys.length, 0);
  assert.equal(Core.creatures(result.workspace)[0].data.flavor.description, 'Local edit retained'); assert.equal(f.transport.writes, 0);
});
test('main editor links a bestiary member without duplicating it and preserves collection metadata and remote unknown fields', async t => {
  const { store, remote, transport, original } = setup(t), ws = Core.blankWorkspace();
  const edited = Core.clone(original); edited.flavor.description = 'My local edit';
  ws.documents.push({ id: 'pack', keys: ['dragon', 'other'], label: 'Pack', data: { name: 'Pack', future: { keep: true }, creatures: [edited, Core.blankCreature('Other')] } }); store.save(ws, store.revision);
  transport.value.stats.futureRemoteField = { keep: true };
  const linked = await remote.attach('dragon', URL, edited);
  assert.equal(remote.links()[0].key, 'dragon'); assert.equal(linked.workspace.documents.length, 1);
  const candidate = linked.workspace.documents[0].data.creatures[0];
  assert.deepEqual(candidate.stats.futureRemoteField, { keep: true }); assert.equal(candidate.flavor.description, 'My local edit');
  const review = await remote.review(linked.documentId, candidate); const saved = await remote.save(linked.documentId, candidate, review.reviewToken);
  assert.equal(transport.writes, 1); assert.equal(saved.workspace.documents[0].data.creatures.length, 2);
  assert.deepEqual(saved.workspace.documents[0].data.future, { keep: true }); assert.deepEqual(saved.workspace.documents[0].data.creatures[1], Core.blankCreature('Other'));
  assert.deepEqual(saved.workspace.documents[0].data.creatures[0].stats.actions, original.stats.actions);
  const next = Core.clone(candidate); next.name += ' changed'; const current = store.read(); current.workspace.documents[0].data.creatures[0] = next; remote.captureWorkspace(current.workspace); store.save(current.workspace, current.revision);
  transport.failure = 'sign_in_required'; await assert.rejects(remote.review(linked.documentId, next), e => e.code === 'sign_in_required');
  const reloaded = new RemoteEdits(store, { transport }); assert.equal(reloaded.view().workspace.documents[0].data.creatures[0].name, next.name);
  transport.failure = null; transport.value.stats.armorClass = 99; await assert.rejects(reloaded.review(linked.documentId, next), e => e.code === 'conflict'); assert.equal(transport.writes, 1);
});
test('CritterDB URLs are restricted to exact HTTPS creature routes and identities', () => {
  assert.deepEqual(Remote.parseCreatureURL(URL), { id: ID, url: URL });
  assert.equal(Remote.parseCreatureURL(`https://www.critterdb.com/#/creature/view/${ID}`).id, ID);
  for (const value of ['http://critterdb.com/#/creature/edit/' + ID, 'https://critterdb.com.evil.test/#/creature/edit/' + ID, 'https://user:pass@critterdb.com/#/creature/edit/' + ID, 'https://critterdb.com/?token=secret#/creature/edit/' + ID, 'https://critterdb.com/#/creature/edit/invalid', 'https://127.0.0.1/#/creature/edit/' + ID]) assert.throws(() => Remote.parseCreatureURL(value));
});
test('remote load and reviewed description save retain identity, membership, unknown fields, and automation', async t => {
  const { remote, original, transport, directory } = setup(t);
  const loaded = await remote.load(URL), edited = Core.clone(original);
  edited.flavor.description = '<p>Test description only.</p>';
  const review = await remote.review(loaded.documentId, edited);
  assert.deepEqual(review.changes.map(c => c.path), ['flavor.description']);
  const result = await remote.save(loaded.documentId, edited, review.reviewToken);
  assert.equal(result.state, 'saved'); assert.equal(result.avraeCommand, '!bestiary update');
  assert.deepEqual(transport.value, edited); assert.equal(transport.writes, 1);
  assert.deepEqual(result.workspace.documents[0].data.stats, original.stats);
  const backups = fs.readdirSync(path.join(directory, 'remote/backups'));
  const backup = JSON.parse(fs.readFileSync(path.join(directory, 'remote/backups', backups[0]), 'utf8'));
  assert.deepEqual(backup.original, original); assert.deepEqual(backup.localEdits, edited);
});
test('review and immediate pre-write checks detect edits made elsewhere without overwriting', async t => {
  const { remote, original, transport } = setup(t);
  const loaded = await remote.load(URL), edited = Core.clone(original); edited.name += ' test';
  transport.value.stats.armorClass = 88;
  await assert.rejects(remote.review(loaded.documentId, edited), e => e.code === 'conflict' && e.details.changes[0].path === 'stats.armorClass');
  assert.equal(transport.writes, 0);
  transport.value = Core.clone(original);
  const reviewed = await remote.review(loaded.documentId, edited); transport.race = true;
  await assert.rejects(remote.save(loaded.documentId, edited, reviewed.reviewToken), e => e.code === 'conflict');
  assert.equal(transport.writes, 0); assert.deepEqual(remote.view().workspace.documents[0].data, edited);
});
test('editing identity or collection membership is rejected before network writes', async t => {
  const { remote, original, transport } = setup(t), loaded = await remote.load(URL);
  for (const property of ['_id', 'bestiaryId', 'publishedBestiaryId', 'sharing']) {
    const changed = Core.clone(original); changed[property] = 'changed';
    await assert.rejects(remote.review(loaded.documentId, changed), /cannot change/);
  }
  assert.equal(transport.writes, 0);
});
test('expired authentication and failed saves retain drafts across service restart', async t => {
  const { remote, original, transport, store } = setup(t), loaded = await remote.load(URL);
  const changed = Core.clone(original); changed.flavor.description = 'Recover this exact local text';
  remote.stage(loaded.documentId, changed); transport.failure = 'sign_in_required';
  await assert.rejects(remote.review(loaded.documentId, changed), e => e.code === 'sign_in_required');
  const restarted = new RemoteEdits(new WorkspaceStore(store.directory), { transport });
  assert.deepEqual(restarted.view().workspace.documents[0].data, changed);
  transport.failure = null;
  const result = await restarted.load(URL); assert.equal(result.state, 'unsaved');
  assert.deepEqual(result.workspace.documents[0].data, changed);
  const reviewed = await restarted.review(loaded.documentId, changed); transport.failure = 'failed';
  await assert.rejects(restarted.save(loaded.documentId, changed, reviewed.reviewToken), e => e.code === 'failed');
  assert.deepEqual(restarted.view().workspace.documents[0].data, changed);
});
test('unrelated workspace saves do not discard newer form recovery drafts', async t => {
  const { remote, original, store } = setup(t), loaded = await remote.load(URL);
  const changed = Core.clone(original); changed.flavor.description = 'New form draft'; remote.stage(loaded.documentId, changed);
  const local = store.read(); local.workspace.preferences.prefix = '?';
  remote.captureWorkspace(local.workspace); store.save(local.workspace, local.revision);
  assert.equal(remote.view().workspace.documents[0].data.flavor.description, 'New form draft');
});
test('save review is tied to exact content, expires, and cannot be reused', async t => {
  const { remote, original, transport } = setup(t), loaded = await remote.load(URL), changed = Core.clone(original);
  changed.name += ' test';
  const review = await remote.review(loaded.documentId, changed);
  const unreviewed = Core.clone(changed); unreviewed.name += ' another change';
  await assert.rejects(remote.save(loaded.documentId, unreviewed, review.reviewToken), /Review/);
  assert.equal(transport.writes, 0);
  await remote.save(loaded.documentId, changed, review.reviewToken);
  await assert.rejects(remote.save(loaded.documentId, changed, review.reviewToken), /Review/);
});
test('verification detects server data loss and never labels mismatched persistence as saved', async t => {
  const { remote, original, transport } = setup(t), loaded = await remote.load(URL), changed = Core.clone(original);
  changed.flavor.description = 'Edited';
  transport.writeChecked = async function (_, __, candidate) { this.writes++; this.value = Core.clone(candidate); delete this.value.extra; return this.value; };
  const review = await remote.review(loaded.documentId, changed);
  await assert.rejects(remote.save(loaded.documentId, changed, review.reviewToken), e => e.code === 'failed' && /does not match/.test(e.details.verification));
  assert.deepEqual(remote.view().workspace.documents[0].data, changed);
  await assert.rejects(remote.verify(loaded.documentId, changed), e => e.code === 'conflict');
  transport.value = Core.clone(changed); const result = await remote.verify(loaded.documentId, changed);
  assert.equal(result.state, 'saved'); assert.equal(transport.writes, 1);
});
test('inaccessible creature cannot establish a remote editing link', async t => {
  const { remote, transport, store } = setup(t); transport.failure = 'permission_denied';
  await assert.rejects(remote.load(URL), e => e.code === 'permission_denied');
  assert.equal(store.value.documents.length, 0);
});
test('browser write guard rejects native autosaves and forwards only an exact single-use reviewed PUT', async () => {
  const browser = new CritterBrowser({ profileDirectory: 'unused' });
  let aborted = 0, forwarded = 0, outgoing;
  const route = (method, marker, payload) => ({
    request: () => ({ url: () => 'https://critterdb.com/api/creatures/' + ID, method: () => method, headers: () => ({ 'x-access-token': 'browser-only-test-session', ...(marker ? { 'x-aina-critter-save': marker } : {}) }), postData: () => payload }),
    async abort() { aborted++; }, async continue(options) { forwarded++; outgoing = options?.headers; },
  });
  await browser.guard(route('PUT', null, '{}')); assert.equal(aborted, 1);
  browser.permits.set('one-use', { id: ID, payload: '{"exact":true}' });
  await browser.guard(route('PUT', 'one-use', '{}')); assert.equal(aborted, 2);
  await browser.guard(route('PUT', 'one-use', '{"exact":true}')); assert.equal(forwarded, 1);
  assert.equal(outgoing['x-aina-critter-save'], undefined);
  await browser.guard(route('PUT', 'one-use', '{"exact":true}')); assert.equal(aborted, 3);
});

test('real account transport never launches, navigates, or activates a separate browser', async () => {
  let launches = 0, activations = 0, navigations = 0;
  for (const headless of [false, true]) {
    const browser = new CritterBrowser({ profileDirectory: 'unused', headless, launcher: {
      async launchPersistentContext() { launches++; throw Error('Browser must never be launched'); }
    } });
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(browser.connect(), e => e.code === 'browser_launch_disabled');
      assert.equal((await browser.probe()).state, 'browser_launch_disabled');
    }
    // A stale managed context cannot bypass the guard or steal focus either.
    browser.context = {};
    browser.page = { isClosed: () => false, async bringToFront() { activations++; }, async goto() { navigations++; } };
    await assert.rejects(browser.connect(), e => e.code === 'browser_launch_disabled');
    await assert.rejects(browser.read(ID), e => e.code === 'browser_launch_disabled');
    await assert.rejects(browser.writeChecked(ID, {}, {}), e => e.code === 'browser_launch_disabled');
  }
  assert.equal(launches, 0); assert.equal(activations, 0); assert.equal(navigations, 0);
});

test('cached connect requests are blocked and workspace edits survive without launching a browser', async t => {
  const { createService } = require('../src/critter/server');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-no-browser-'));
  let launches = 0;
  const transport = new CritterBrowser({ profileDirectory: path.join(directory, 'unused-profile'), launcher: {
    async launchPersistentContext() { launches++; throw Error('Must not launch'); }
  } });
  const service = createService({ directory, port: 0, remoteTransport: transport });
  t.after(async () => { await service.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const local = Core.blankWorkspace(); local.documents.push({ id: 'local', keys: ['dragon'], label: 'Unsaved work', data: creature() });
  service.store.save(local, service.store.revision);
  await service.start();
  const headers = { 'X-Aina-Local': '1', 'Content-Type': 'application/json' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(service.url + '/api/remote/connect', { method: 'POST', headers, body: '{}' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'browser_launch_disabled');
  }
  const state = await (await fetch(service.url + '/api/remote/status', { headers })).json();
  assert.equal(state.state, 'browser_launch_disabled');
  const retained = await (await fetch(service.url + '/api/workspace', { headers })).json();
  assert.deepEqual(retained.workspace.documents, local.documents);
  assert.equal(launches, 0); assert.equal(fs.existsSync(path.join(directory, 'unused-profile')), false);
  for (const file of ['direct-ui.js', 'remote-ui.js']) {
    const content = await (await fetch(service.url + '/' + file)).text();
    assert(!content.includes('id="direct-connect"')); assert(!content.includes('id="remote-connect"'));
    assert(!content.includes("api('remote/connect'"));
  }
});
