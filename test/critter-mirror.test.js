const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const C = require('../src/critter/public/core'), M = require('../src/critter/public/mirror-model');
const { EncounterMirror, AVRAE_ID, verifySignature } = require('../src/critter/mirror'), { WorkspaceStore } = require('../src/critter/store'), { createService } = require('../src/critter/server');
const F = require('./mirror-fixture'), { creature } = require('./critter-fixture');
function directory(t) { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-mirror-test-')); t.after(() => { assert(path.resolve(p).startsWith(path.resolve(os.tmpdir()) + path.sep + 'aina-mirror-test-')); fs.rmSync(p, { recursive: true, force: true }); }); return p; }
async function fixture(t) {
  const dir = directory(t), store = new WorkspaceStore(dir), bridge = { ownerId: F.owner, resolveOwner: async () => F.owner };
  let expected;
  const mirror = new EncounterMirror(store, bridge, { verifier: async () => ({ author_id: F.owner, channel_id: expected.channelId, guild_id: F.guild, message_id: expected.requestId, timestamp: Date.now() / 1000, scope: 'PERSONAL_ALIAS' }) });
  const key = M.key(F.guild, F.channel); await mirror.configure({ guildId: F.guild, channelId: F.channel });
  return { dir, store, bridge, mirror, key, setExpected: value => { expected = value; } };
}
test('connection diagnosis distinguishes attaching an export file from installing the alias and respects channel access', async t => {
  const { mirror, bridge, key } = await fixture(t);
  const messages = [{ id: 'export', author: { id: F.owner }, content: '!ainaexport nonce', attachments: [{ name: 'ainaexport.txt' }] }, { id: 'avrae', author: { id: AVRAE_ID }, content: 'Existing combat output', embeds: [] }];
  bridge.client = { isReady: () => true, channels: { fetch: async () => ({ messages: { fetch: async () => new Map(messages.map(m => [m.id, m])) } }) } };
  bridge.channels = async () => [{ id: F.channel, guildId: F.guild }];
  let result = await mirror.diagnose(key); assert(result.avraeSeen); assert(!result.installSeen); assert.match(result.message, /does not install/); assert.equal(result.installCommand, '!alias ainaexport');
  messages.push({ id: 'install', author: { id: F.owner }, content: '!alias ainaexport' }); result = await mirror.diagnose(key); assert(result.installSeen);
  bridge.channels = async () => []; await assert.rejects(mirror.diagnose(key), /access/);
});
test('snapshot normalization preserves zero and missing states and strips hidden stats and private effect payloads', () => {
  const raw = F.snapshot(); raw.combatants[0].effects.value[0].secret = 'not exported'; raw.combatants[0].maxHp = null;
  const s = M.validate(raw); assert.equal(s.combatants[0].hp.value, 0); assert.equal(s.combatants[0].tempHp.value, 0); assert.equal(s.combatants[0].maxHp.status, 'unavailable');
  for (const name of ['hp', 'ac', 'actions', 'sourceName']) assert.deepEqual(s.combatants[1][name], { status: 'hidden', value: null });
  assert(!JSON.stringify(s).includes('not exported')); assert.equal(s.combatants[0].effects.value[0].remaining, 0);
  assert(M.isCurrent(s, s.combatants[0])); s.currentId = null; assert(!M.isCurrent(s, s.combatants[0]));
});
test('manual fallback assembles copied export messages and rejects incomplete or mixed batches', () => {
  const s = F.snapshot(), parts = F.fragments(s, s.nonce), text = parts.map(p => 'Owner: AINA-SNAPSHOT/1 ' + JSON.stringify(p)).join('\n');
  assert.deepEqual(M.parseImport(text), M.validate(s)); assert.deepEqual(M.parseImport(parts), M.validate(s));
  assert.throws(() => M.parseImport(parts.slice(1)), /Incomplete export/);
  assert.throws(() => M.parseImport([...parts, parts[0]]), /duplicate/);
  assert.throws(() => M.parseImport(parts.map((p, i) => i ? p : { ...p, nonce: 'foreign' })), /Mixed/);
});
test('actual Avrae legacy backslash escaping is reversible and new encoded fragments preserve quotes, slashes and percent signs', () => {
  const s = F.snapshot(); s.combatants[0].name = 'Dragon "quoted" \\ path %20';
  const legacy = F.fragments(s, s.nonce), descriptions = legacy.map(p => JSON.stringify(p).replace(/\\/g, '\\\\'));
  assert.deepEqual(M.parseImport(descriptions.join('\n')), M.validate(s));
  const payload = JSON.stringify(s).replace(/%/g, '%25').replace(/\\/g, '%5C').replace(/"/g, '%22').replace(/'/g, '%27');
  const chunks = payload.match(/.{1,1500}/gs), encoded = chunks.map((chunk, i) => ({ ...legacy[0], encoding: 'percent-json-v1', chunk, part: i, total: chunks.length }));
  assert.deepEqual(M.parseImport(encoded), M.validate(s));
  assert.throws(() => M.parseImport(encoded.map((p, i) => i ? p : { ...p, encoding: undefined })), /invalid export parts/);
});
test('complete manual recovery candidates remain reviewable after restarting without applying them', async t => {
  const { mirror, key, dir, bridge } = await fixture(t); mirror.import(key, F.snapshot());
  const id = mirror.location(key).candidate.id, reloaded = new EncounterMirror(new WorkspaceStore(dir), bridge);
  assert.equal(reloaded.location(key).candidate.id, id); assert.equal(reloaded.location(key).snapshot, undefined);
});
test('commands resolve stable IDs to the latest names, quote real targets and block unsafe current/group selection', () => {
  const s = M.validate(F.snapshot()), spec = { kind: 'action', actorId: 'copy-one', action: 'Bite', targetIds: ['copy-two'], roll: 'adv', critical: 'nocrit', attackBonus: '2', damageBonus: '1d6[fire]' };
  assert.equal(M.command(s, spec), '!i aoo "Dragon One" "Bite" -t "Dragon \\"Two\\"" adv nocrit -b "2" -d "1d6[fire]" -rr 1');
  assert.throws(() => M.command(s, { ...spec, scope: 'current' }), /Current-turn/);
  s.currentId = 'copy-one'; assert.match(M.command(s, { ...spec, scope: 'current' }), /^!i a "Bite"/);
  s.combatants[0].name = 'Renamed Dragon'; assert.match(M.command(s, spec), /^!i aoo "Renamed Dragon"/);
  assert.throws(() => M.command(s, { ...spec, targetIds: ['removed'] }), /latest snapshot/);
  s.combatants[1].name = s.combatants[0].name; assert.throws(() => M.command(s, spec), /duplicate combatant/);
});
test('casting, source commands, saves/checks, effects, HP, options and explicit end preparation use verified syntax', () => {
  const s = M.validate(F.snapshot()), base = { actorId: 'copy-one' };
  assert.equal(M.command(s, { ...base, kind: 'cast', action: 'Fog Cloud', level: 2 }), '!i rc "Dragon One" "Fog Cloud" -rr 1 -l 2');
  assert.equal(M.command(s, { ...base, kind: 'cast', scope: 'source', action: 'Fog Cloud', level: 2 }), '!moncast "Ancient Silver Dragon" "Fog Cloud" -rr 1 -l 2');
  assert.equal(M.command(s, { ...base, kind: 'source', action: 'Bite' }), '!ma "Ancient Silver Dragon" "Bite" -rr 1');
  assert.throws(() => M.command(s, { kind: 'source', actorId: 'copy-two', action: 'Bite' }), /source creature name is hidden/);
  assert.equal(M.command(s, { ...base, kind: 'save', stat: 'dex', roll: 'adv' }), '!i os "Dragon One" dex adv');
  assert.equal(M.command(s, { ...base, kind: 'check', stat: 'Sleight of Hand' }), '!i oc "Dragon One" sleightOfHand');
  assert.equal(M.command(s, { ...base, kind: 'hp', value: '-7' }), '!i hp "Dragon One" -7');
  assert.equal(M.command(s, { ...base, kind: 'hpSet', value: '0' }), '!i hp set "Dragon One" 0');
  assert.equal(M.command(s, { ...base, kind: 'thp', value: '0' }), '!i thp "Dragon One" 0');
  assert.equal(M.command(s, { ...base, kind: 'opt', initiative: '0', ac: '22' }), '!i opt "Dragon One" -p 0 -ac 22');
  assert.equal(M.command(s, { ...base, kind: 'effectAdd', effect: 'Rules reminder', duration: '2', description: 'No mechanics inferred' }), '!i effect "Dragon One" "Rules reminder" -dur 2 -desc "No mechanics inferred"');
  assert.equal(M.command(s, { ...base, kind: 'effectRemove', effect: 'Bless' }), '!i re "Dragon One" "Bless"');
  assert.throws(() => M.command(s, { ...base, kind: 'effectAdd', effect: 'Bless' }), /replace its mechanics/);
  assert.throws(() => M.command(s, { ...base, kind: 'action', action: 'Bite', repeat: '26' }), /1 to 25/);
  assert.throws(() => M.command(s, { kind: 'end' }), /Confirm ending/); assert.equal(M.command(s, { kind: 'end', confirmEnd: true }), '!init end');
});
test('channel-specific snapshots remain separate, newer snapshots reconcile removed/renamed units, older snapshots are rejected', async t => {
  const { mirror, key } = await fixture(t), first = F.snapshot(); mirror.stage(key, first, { kind: 'manual-owner-import' }); mirror.accept(key, mirror.location(key).candidate.id);
  const secondKey = M.key(F.guild, F.otherChannel); await mirror.configure({ guildId: F.guild, channelId: F.otherChannel }); const second = F.snapshot(F.otherChannel); second.combatants[0].name = 'Other channel'; mirror.stage(secondKey, second, { kind: 'manual-owner-import' }); mirror.accept(secondKey, mirror.location(secondKey).candidate.id);
  assert.equal(mirror.location(key).snapshot.combatants[0].name, 'Dragon One'); assert.equal(mirror.location(secondKey).snapshot.combatants[0].name, 'Other channel');
  assert.throws(() => mirror.stage(key, second, {}), /does not match/); assert.throws(() => mirror.stage(key, first, {}), /older than or equal/);
  const newer = F.snapshot(); newer.combatants.pop(); newer.groups[0].members.pop(); newer.combatants[0].name = 'Renamed'; mirror.stage(key, newer, {}); assert.equal(mirror.location(key).snapshot.combatants.length, 2); mirror.accept(key, mirror.location(key).candidate.id); assert.equal(mirror.location(key).snapshot.combatants.length, 1);
  assert.equal(mirror.location(secondKey).snapshot.combatants.length, 2);
});
test('bridge requires the configured bot/location, refresh nonce, owner signature context and explicit review', async t => {
  const { mirror, key, setExpected } = await fixture(t), request = mirror.prepare(key), snapshot = F.snapshot(); setExpected(snapshot);
  const parts = F.fragments(snapshot, request.nonce), message = part => ({ id: F.requestId(), guildId: F.guild, channelId: F.channel, author: { id: AVRAE_ID, bot: true }, content: 'Owner: AINA-SNAPSHOT/1 ' + JSON.stringify(part) });
  for (const p of parts) await mirror.onMessage({ ...message(p), author: { id: F.owner, bot: false } }); assert(!mirror.location(key).candidate);
  for (const p of parts) await mirror.onMessage({ ...message(p), author: { id: '999456789012345678', bot: true } }); assert(!mirror.location(key).candidate);
  for (const p of parts) await mirror.onMessage(message({ ...p, nonce: 'b'.repeat(32) })); assert(!mirror.location(key).candidate);
  await mirror.onMessage({ id: snapshot.requestId, guildId: F.guild, channelId: F.channel, author: { id: F.owner, bot: false }, content: request.command });
  for (const p of [...parts].reverse()) await mirror.onMessage(message(p));
  assert(mirror.location(key).candidate); assert(!mirror.location(key).snapshot); assert.equal(mirror.location(key).candidate.provenance.contextVerified, true); assert.equal(mirror.location(key).candidate.provenance.payloadSigned, false);
  mirror.accept(key, mirror.location(key).candidate.id); assert.equal(mirror.location(key).snapshot.requestId, snapshot.requestId);
});
test('foreign invocation contexts cannot update the mirror and reconnects discard unfinished exports', async t => {
  const { mirror, key, dir, store, bridge } = await fixture(t); mirror.verifier = async () => ({ author_id: '999456789012345678', channel_id: F.channel, message_id: snapshot.requestId, timestamp: Date.now()/1000, scope: 'PERSONAL_ALIAS' });
  const request = mirror.prepare(key), snapshot = F.snapshot();
  await mirror.onMessage({ id: F.requestId(), guildId: F.guild, channelId: F.channel, author: { id: AVRAE_ID, bot: true }, content: 'Owner: AINA-SNAPSHOT/1 ' + JSON.stringify(F.fragments(snapshot, request.nonce)[0]) });
  assert.match(mirror.location(key).error, /signature context/); assert(!mirror.location(key).candidate);
  const reloaded = new EncounterMirror(new WorkspaceStore(dir), bridge); assert.equal(reloaded.location(key).request, null); assert.equal(reloaded.location(key).candidate, null); assert.equal(store.value.history.length, 0);
});
test('generation/copy history never mutates combat state or claims execution; stale command drafts are rejected', async t => {
  const { mirror, key, store } = await fixture(t), s = F.snapshot(); mirror.stage(key, s, {}); mirror.accept(key, mirror.location(key).candidate.id); const original = C.clone(mirror.location(key).snapshot);
  const built = mirror.generate(key, s.requestId, { kind: 'hp', actorId: 'copy-one', value: '-10' }); assert.equal(store.value.history[0].status, 'generated'); mirror.history(key, null, null, 'copied', built.historyId); assert.equal(store.value.history[0].status, 'copied'); assert.deepEqual(mirror.location(key).snapshot, original);
  mirror.favorite(key, built.historyId); assert.equal(store.value.favorites[0].mirrorKey, key);
  assert.throws(() => mirror.generate(key, '000000000000000000', { kind: 'next' }), /snapshot changed/);
});
test('accepted snapshots survive reconnect and reviewed no-encounter exports clear only their own location', async t => {
  const { mirror, key, dir, bridge } = await fixture(t), initial = F.snapshot(); mirror.stage(key, initial, { kind: 'manual-owner-import' }); mirror.accept(key, mirror.location(key).candidate.id);
  const pending = F.snapshot(); mirror.stage(key, pending, { kind: 'manual-owner-import' });
  const reloaded = new EncounterMirror(new WorkspaceStore(dir), bridge); assert.equal(reloaded.location(key).snapshot.requestId, initial.requestId); assert.equal(reloaded.location(key).candidate.snapshot.requestId, pending.requestId);
  const ended = { ...F.snapshot(), active: false, name: null, round: null, turn: null, currentId: null, groups: [], combatants: [] };
  reloaded.stage(key, ended, { kind: 'manual-owner-import' }); assert.equal(reloaded.location(key).snapshot.active, true);
  reloaded.accept(key, reloaded.location(key).candidate.id); assert.equal(reloaded.location(key).snapshot.active, false); assert.equal(reloaded.location(key).snapshot.combatants.length, 0);
});
test('library/preset additions keep canonical source names separate and append trait setup for individual copies', () => {
  const ws = C.blankWorkspace(), c = creature(); ws.documents.push({ id: 'doc', label: 'Dragon', data: c, keys: ['dragon'] }); ws.combatTraits.dragon = { id: '0123456789abcdef0123456789abcdef', traits: [] };
  const commands = M.addCommands(M.validate(F.snapshot()), { sourceKey: 'dragon', addName: 'Fresh#', quantity: '2', initiativeRoll: 'adv' }, ws);
  assert.equal(commands.length, 4); assert.equal(commands[0], '!i madd "Ancient Silver Dragon" -name "Fresh1" adv'); assert.equal(commands[1], '!i madd "Ancient Silver Dragon" -name "Fresh2" adv'); assert.match(commands[2], /^!i aoo "Fresh1" "Aina Setup Traits/); assert.match(commands[3], /^!i aoo "Fresh2" "Aina Setup Traits/);
  assert.throws(() => M.addCommands(M.validate(F.snapshot()), { sourceKey: 'dragon', addName: 'Dragon One' }, ws), /already in this snapshot/);
});
test('signature API parsing preserves exact numeric Discord snowflakes without credentials', async t => {
  const oldFetch = global.fetch; t.after(() => { global.fetch = oldFetch; });
  global.fetch = async (url, options) => { assert.equal(url, 'https://api.avrae.io/bot/signature/verify'); assert.deepEqual(JSON.parse(options.body), { signature: 'fixture' }); return { ok: true, text: async () => '{"data":{"message_id":123456789012345679,"author_id":123456789012345678,"channel_id":323456789012345678,"guild_id":223456789012345678}}' }; };
  const result = await verifySignature('fixture'); assert.equal(result.message_id, '123456789012345679'); assert.equal(result.author_id, F.owner);
});
test('mirror HTTP routes preserve existing workspace features and require local headers', async t => {
  const service = createService({ directory: directory(t), ownerId: F.owner, port: 0 }); await service.start(); t.after(() => service.close());
  const req = async (route, body) => { const r = await fetch(service.url + '/api/mirror/' + route, { method: 'POST', headers: { 'X-Aina-Local': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };
  const key = M.key(F.guild, F.channel); assert.equal((await req('configure', { guildId: F.guild, channelId: F.channel })).status, 200);
  assert.equal((await fetch(service.url + '/api/mirror')).status, 403);
  const result = await req('import', { key, snapshot: F.snapshot() }); assert.equal(result.status, 200); assert.equal(result.data.locations[key].candidate.provenance.contextVerified, false);
  assert.equal((await req('accept', { key, candidateId: result.data.locations[key].candidate.id })).status, 200);
  assert.equal(service.store.value.documents.length, 0); assert.equal(service.store.value.currentEncounter.entries.length, 0);
});
