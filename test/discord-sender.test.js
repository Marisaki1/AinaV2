const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { randomUUID } = require('crypto');
const { WorkspaceStore } = require('../src/critter/store');
const { CommandSender } = require('../src/critter/command-sender');
const { DiscordBridge } = require('../src/critter/discord');
const { createService } = require('../src/critter/server');
const { ChannelType } = require('discord.js');
const CHANNEL = '222222222222222222', OWNER = '111111111111111111', GUILD = '333333333333333333';

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-bot-post-'));
  t.after(() => { assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'aina-bot-post-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const store = new WorkspaceStore(directory), posts = [];
  const bridge = { client: { isReady: () => true, user: { id: '444444444444444444', username: 'Aina' } },
    async post(channelId, commands, prefix, options) { posts.push({ channelId, commands, prefix, options }); return commands.map(command => ({ command, posted: true, messageId: String(posts.length), guildId: GUILD })); } };
  const sender = new CommandSender(store, bridge);
  t.after(() => sender.close());
  return { directory, store, bridge, posts, sender, submit: (text = '!r 1d20', rest = {}) => sender.submit({ requestId: randomUUID(), channelId: CHANNEL, text, ...rest }) };
}

test('official bot posting is confirmed separately from manual Avrae execution; no account credentials are used', async t => {
  const f = setup(t);
  const item = f.submit(); await f.sender.drain();
  assert.equal(f.posts.length, 1); assert.equal(item.delivery, 'sent');
  assert.equal(item.execution, 'manual'); assert.equal(f.sender.view().mode, 'bot-preview');
  assert.equal(f.posts[0].commands[0], '!r 1d20'); assert.equal(f.posts[0].options.nonce.length, 24);
  assert.equal(f.sender.view().identity.username, 'Aina');
  assert(!fs.existsSync(path.join(f.directory, 'sender-history.json')));
});

test('request IDs prevent duplicate posts across clicks and restarts, with changed payloads rejected', async t => {
  const f = setup(t), id = randomUUID();
  const first = f.submit('!r 1d20', { requestId: id });
  assert.equal(first, f.submit('!r 1d20', { requestId: id }));
  assert.throws(() => f.submit('!r 2d20', { requestId: id }), /different command/);
  await f.sender.drain(); assert.equal(f.posts.length, 1);
  const restored = new CommandSender(f.store, f.bridge);
  assert.equal(restored.submit({ requestId: id, channelId: CHANNEL, text: '!r 1d20' }).delivery, 'sent');
  await restored.drain(); assert.equal(f.posts.length, 1); await restored.close();
});

test('posts serialize; ambiguous delivery is never automatically retried', async t => {
  const f = setup(t); let inFlight = 0, max = 0, release;
  f.bridge.post = async () => { inFlight++; max = Math.max(max, inFlight); await new Promise(r => { release = r; }); inFlight--; return [{ posted: false, uncertain: true, error: 'Check Discord' }]; };
  const one = f.submit(); const work = f.sender.drain(); const two = f.submit('!r 1d6');
  assert.equal(one.delivery, 'sending'); release();
  await new Promise(r => setImmediate(r)); assert.equal(two.delivery, 'sending'); release(); await work;
  assert.equal(max, 1); assert.equal(one.delivery, 'uncertain'); assert.equal(two.delivery, 'uncertain');
  await f.sender.drain(); assert.equal(inFlight, 0);
});

test('cancel stops queued posts without mislabelling an in-flight confirmed post', async t => {
  const f = setup(t); let release;
  f.bridge.post = async () => { await new Promise(r => { release = r; }); return [{ posted: true, messageId: 'sent-id', guildId: GUILD }]; };
  const one = f.submit(); const work = f.sender.drain(); const two = f.submit('!r 1d6');
  f.sender.cancel(); assert.equal(two.delivery, 'cancelled');
  release(); await work; assert.equal(one.delivery, 'sent'); assert.equal(two.delivery, 'cancelled');
});

test('restart recovers interrupted posts without replay and keeps old user-account history separate', async t => {
  const f = setup(t);
  fs.writeFileSync(f.sender.file, JSON.stringify([{ requestId: randomUUID(), channelId: CHANNEL, text: '!r 1', delivery: 'sending' }, { delivery: 'queued' }]));
  fs.writeFileSync(path.join(f.directory, 'sender-history.json'), '[{"delivery":"sent","text":"old history"}]');
  const restored = new CommandSender(f.store, f.bridge);
  assert.equal(restored.history[0].delivery, 'uncertain'); assert.equal(restored.history[1].delivery, 'cancelled');
  await restored.drain(); assert.equal(f.posts.length, 0); await restored.close();
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory, 'sender-history.json')))[0].text, 'old history');
});

test('saved shortcuts survive; creature data and the shared destination remain unchanged', t => {
  const f = setup(t);
  f.store.value.preferences.channelId = CHANNEL;
  f.sender.configure({ buttons: [{ id: 'update', label: 'Update bestiary', text: '!bestiary update' }] });
  assert.equal(new WorkspaceStore(f.directory).value.sender.buttons[0].text, '!bestiary update');
  assert.equal(f.store.value.preferences.channelId, CHANNEL);
  assert.throws(() => f.submit('/roll 1d20'), /prefix/);
  assert.throws(() => f.submit('!r 1\n!r 2'), /one Avrae/);
  assert.throws(() => f.sender.configure({ buttons: [{ id: 'x', label: '', text: '!r 1' }] }));
});

test('batch posts stop after failure and repeat IDs do not replay confirmed commands', async t => {
  const f = setup(t); let calls = 0;
  f.bridge.post = async (channelId, commands) => { calls++; return calls === 1 ? [{ posted: true, messageId: 'one', guildId: GUILD }] : [{ posted: false, uncertain: true, error: 'Check Discord' }]; };
  const data = { requestId: randomUUID(), channelId: CHANNEL, commands: ['!i begin', '!i madd Dragon', '!i list'] };
  const result = await f.sender.postBatch(data); assert.equal(result.length, 2); assert.equal(result[0].posted, true); assert.equal(result[1].delivery, 'uncertain');
  await f.sender.postBatch(data); assert.equal(calls, 2);
});

function discordFixture(t) {
  const f = setup(t), sent = [], permissions = [];
  const member = { id: OWNER }, guild = { id: GUILD, name: 'Test server', members: { fetch: async id => id === OWNER ? member : null } };
  const bot = { id: '444444444444444444', username: 'Aina' };
  let next = 0;
  const channel = { id: CHANNEL, guild, type: ChannelType.PublicThread, name: 'Sanae', parent: { name: 'combat' },
    permissionsFor: who => ({ has: needed => { permissions.push({ who, needed }); return true; } }),
    async send(data) { sent.push(data); return { id: 'message-' + ++next, react: async () => {} }; }, isThread: () => true };
  guild.channels = { cache: new Map([[channel.id, channel]]) };
  const client = { user: bot, isReady: () => true, guilds: { cache: new Map([[GUILD, guild]]) }, channels: { fetch: async id => id === CHANNEL ? channel : null } };
  return { ...f, bridge: new DiscordBridge(client, f.directory, OWNER), client, channel, guild, sent, permissions };
}

test('bridge posts as Aina in accessible threads with mentions disabled and a dismiss control', async t => {
  const f = discordFixture(t);
  const choices = await f.bridge.channels(); assert.equal(choices[0].thread, true); assert.match(choices[0].name, /combat.*Sanae/);
  const result = await f.bridge.post(CHANNEL, ['!r 1d20'], '!', { nonce: '012345678901234567890123' });
  assert.equal(result[0].posted, true); assert.equal(result[0].guildId, GUILD); assert.equal(f.sent.length, 1);
  assert.deepEqual(f.sent[0].allowedMentions, { parse: [], repliedUser: false }); assert.equal(f.sent[0].enforceNonce, true);
  assert.match(f.sent[0].content, /copy and send/); assert.match(f.sent[0].content, /!r 1d20/); assert(f.sent[0].components.length);
  assert.equal(f.bridge.pending.size, 1);
  f.channel.archived = true; assert.equal((await f.bridge.channels()).length, 0);
  await assert.rejects(f.bridge.post(CHANNEL, ['!r 1d20'], '!'), /active thread/);
  assert.equal(f.sent.length, 1);
});

test('inaccessible destinations are rejected and ambiguous sends remain uncertain', async t => {
  const f = discordFixture(t);
  f.channel.permissionsFor = () => ({ has: () => false });
  await assert.rejects(f.bridge.post(CHANNEL, ['!r 1'], '!'), /both you and Aina/); assert.equal(f.sent.length, 0);
  f.channel.permissionsFor = () => ({ has: () => true }); f.channel.send = async () => { throw new Error('connection interrupted'); };
  const result = await f.bridge.post(CHANNEL, ['!r 1'], '!'); assert.equal(result[0].uncertain, true); assert.equal(result[0].posted, false);
});

test('private threads require actual membership for the owner as well as parent-channel permissions', async t => {
  const f = discordFixture(t); f.channel.type = ChannelType.PrivateThread;
  f.channel.permissionsFor = () => ({ has: needed => Array.isArray(needed) });
  f.channel.members = { fetch: async id => id === f.client.user.id ? { id } : null };
  assert.equal((await f.bridge.channels()).length, 0);
  await assert.rejects(f.bridge.post(CHANNEL, ['!r 1'], '!'), /both you and Aina/);
  assert.equal(f.sent.length, 0);
  f.channel.members.fetch = async id => ({ id });
  assert.equal((await f.bridge.channels()).length, 1);
  assert.equal((await f.bridge.post(CHANNEL, ['!r 1'], '!'))[0].posted, true);
});

test('sent status survives a local dismissal-tracking failure', async t => {
  const f = discordFixture(t); f.bridge.persist = () => { throw new Error('fixture disk failure'); };
  const result = await f.bridge.post(CHANNEL, ['!r 1'], '!');
  assert.equal(result[0].posted, true); assert.match(result[0].warning, /tracking/); assert.equal(f.sent.length, 1);
});

test('local routes enforce origin/header guards and retire all user-account connection endpoints', async t => {
  const f = setup(t), service = createService({ directory: f.directory, port: 0, client: f.bridge.client });
  service.bridge.post = f.bridge.post; await service.start(); t.after(() => service.close());
  const req = (route, data, headers = {}) => fetch(service.url + '/api/' + route, { method: data ? 'POST' : 'GET', headers: { 'X-Aina-Local': '1', ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
  assert.equal((await fetch(service.url + '/api/sender/status')).status, 403);
  assert.equal((await req('sender/status', null, { Origin: 'https://other.example' })).status, 403);
  for (const route of ['connect', 'repair', 'unlock', 'session']) assert.equal((await req('sender/' + route, {})).status, 410);
  const status = await (await req('sender/status')).json(); assert.equal(status.mode, 'bot-preview');
  const response = await req('sender/send', { requestId: randomUUID(), channelId: CHANNEL, text: '!r 1d20' }); assert.equal(response.status, 202);
  await service.sender.drain(); assert.equal(f.posts.length, 1);
  assert.equal((await req('post', { requestId: randomUUID(), channelId: CHANNEL, commands: ['!i list'] })).status, 200);
  assert.equal(f.posts.length, 2);
});

