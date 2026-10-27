const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { createService } = require('../src/critter/server');
const { WorkspaceStore } = require('../src/critter/store');
const { creature } = require('./critter-fixture');

test('remembering choices merges into the latest library and persists across a new store instance', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-choice-test-'));
  const service = createService({ directory, port: 0 }); await service.start();
  t.after(async () => { await service.close(); for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file)); fs.rmdirSync(directory); });
  const first = service.importJSON(creature(), 'first.json');
  const key = first.workspace.documents[0].keys[0];
  const stale = service.store.read();
  service.importJSON({ ...creature(), name: 'Imported in another tab' }, 'second.json');
  async function patch(value) { return fetch(service.url + '/api/preferences', { method: 'PATCH', headers: { 'X-Aina-Local': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); }
  assert.equal((await patch({ channelId: 'chosen-channel', desk: { selectedKey: key, perCreature: { [key]: { actor: 'DragonTest', targets: 'Tewi', action: 'actions:0:0' } } } })).status, 200);
  assert.equal(service.store.value.documents.length, 2);
  assert.deepEqual(service.store.value.documents[0].data, stale.workspace.documents[0].data);
  assert.equal((await patch({ desk: { perCreature: { anotherCreature: { actor: 'Second dragon' } } } })).status, 200);
  const reopened = new WorkspaceStore(directory).read().workspace;
  assert.equal(reopened.preferences.channelId, 'chosen-channel');
  assert.equal(reopened.preferences.desk.perCreature[key].actor, 'DragonTest');
  assert.equal(reopened.preferences.desk.perCreature.anotherCreature.actor, 'Second dragon');
  assert.equal(reopened.documents.length, 2);
  const before = service.store.read();
  assert.equal((await patch({ prefix: 'bad prefix' })).status, 400);
  assert.deepEqual(service.store.read(), before);
});
