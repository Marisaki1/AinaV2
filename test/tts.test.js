const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { Readable, PassThrough } = require('node:stream');
const { createTtsManager, escapeXml } = require('../src/utils/ttsManager');
const { commands } = require('../src/cogs/tts');
const tts = require('../src/utils/ttsManager');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');

const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, synthesis, settings = {}) {
  const connections = new Map(), players = [], spoken = [], cleaned = [];
  const voice = {
    VoiceConnectionStatus: { Ready: 'ready', Destroyed: 'destroyed', Disconnected: 'disconnected', Signalling: 'signalling', Connecting: 'connecting' },
    AudioPlayerStatus: { Idle: 'idle' },
    getVoiceConnection: id => connections.get(id),
    joinVoiceChannel(options) {
      const connection = new EventEmitter();
      connection.joinConfig = options;
      connection.state = { status: 'ready' };
      connection.subscribe = player => { connection.player = player; return {}; };
      connection.destroy = () => { connection.state.status = 'destroyed'; connections.delete(options.guildId); connection.emit('destroyed'); };
      connections.set(options.guildId, connection);
      return connection;
    },
    createAudioPlayer() {
      const player = new EventEmitter();
      player.play = resource => { player.state = { status: 'playing', resource }; spoken.push(resource.file); };
      player.stop = () => { player.state = { status: 'idle' }; player.emit('idle'); };
      players.push(player);
      return player;
    },
    createAudioResource: file => ({ file, playStream: { destroy() {} } }),
    entersState: async connection => connection,
  };
  const manager = createTtsManager({ voice, settings: { maxQueueSize: 3, playbackTimeoutMs: 1000, ...settings }, synthesise: synthesis ?? (async text => ({ file: text, cleanup: () => cleaned.push(text) })) });
  t.after(() => manager.shutdown());
  return { manager, voice, players, connections, spoken, cleaned, channel: { id: '10', guild: { id: '1', voiceAdapterCreator() {} } } };
}

test('voice modules can be loaded without optional native packages or a connection', () => {
  assert.equal(tts.isConnected('no-session'), false);
  assert.equal(commands[0].data.toJSON().name, 'ttv');
  assert.deepEqual(commands[0].data.toJSON().options.map(item => item.name), ['join', 'leave', 'say', 'stop', 'status']);
});

test('speech is FIFO, never interrupts playback, and cleans each completed request', async t => {
  const { manager, channel, players, spoken, cleaned } = fixture(t);
  await manager.join(channel);
  const first = manager.speak('1', 'first');
  const second = manager.speak('1', 'second');
  await tick();
  assert.deepEqual(spoken, ['first']);
  assert.equal(manager.getStatus('1').queued, 1);
  players[0].emit('idle');
  await first;
  await tick();
  assert.deepEqual(spoken, ['first', 'second']);
  players[0].emit('idle');
  await second;
  assert.deepEqual(cleaned, ['first', 'second']);
  assert.equal(players[0].listenerCount('idle'), 0);
  assert.equal(players[0].listenerCount('error'), 1);
});

test('stop rejects active and queued speech without disconnecting', async t => {
  const { manager, channel, players } = fixture(t);
  await manager.join(channel);
  const first = assert.rejects(manager.speak('1', 'first'), /cancelled/);
  const second = assert.rejects(manager.speak('1', 'second'), /cancelled/);
  await tick();
  manager.stop('1');
  await Promise.all([first, second]);
  assert.equal(manager.isConnected('1'), true);
  assert.equal(manager.getStatus('1').queued, 0);
  assert.equal(players[0].listenerCount('idle'), 0);
});

test('leave cancels in-flight synthesis and prevents late playback', async t => {
  const { manager, channel, spoken } = fixture(t, (_text, signal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Speech cancelled.')), { once: true });
  }));
  await manager.join(channel);
  const speech = assert.rejects(manager.speak('1', 'waiting'), /cancelled/);
  manager.leave('1');
  await speech;
  assert.equal(manager.getConnection('1'), null);
  assert.deepEqual(spoken, []);
});

test('a failed synthesis does not poison the queue', async t => {
  const { manager, channel, players, spoken } = fixture(t, async text => {
    if (text === 'fail') throw new Error('provider failed');
    return { file: text, cleanup() {} };
  });
  await manager.join(channel);
  const bad = assert.rejects(manager.speak('1', 'fail'), /provider failed/);
  const good = manager.speak('1', 'works');
  await bad;
  await tick();
  assert.deepEqual(spoken, ['works']);
  players[0].emit('idle');
  await good;
});

test('repeated and concurrent joins reuse one session and moving cancels the previous queue', async t => {
  const { manager, channel, players } = fixture(t);
  const [first, second] = await Promise.all([manager.join(channel), manager.join(channel)]);
  assert.equal(first, second);
  assert.equal(players.length, 1);
  const speech = assert.rejects(manager.speak('1', 'cancel me'), /cancelled/);
  await tick();
  await manager.join({ ...channel, id: '11' });
  await speech;
  assert.equal(manager.getStatus('1').channelId, '11');
  assert.equal(first.state.status, 'destroyed');
});

test('blank/oversize speech and queue overflow fail without dropping accepted requests', async t => {
  const { manager, channel, players } = fixture(t);
  await manager.join(channel);
  await assert.rejects(manager.speak('1', ' '), /between 1 and 2000/);
  await assert.rejects(manager.speak('1', 'x'.repeat(2001)), /between 1 and 2000/);
  const jobs = ['one', 'two', 'three'].map(text => assert.rejects(manager.speak('1', text), /cancelled/));
  await assert.rejects(manager.speak('1', 'four'), /queue is full/);
  manager.stop('1');
  await Promise.all(jobs);
  assert.equal(players[0].listenerCount('idle'), 0);
});

test('playback errors clean files and leave only one persistent error handler', async t => {
  t.mock.method(console, 'error', () => {});
  const { manager, channel, players, cleaned } = fixture(t);
  await manager.join(channel);
  const speech = assert.rejects(manager.speak('1', 'broken'), /playback failed/);
  await tick();
  players[0].emit('error', new Error('decoder failure'));
  await speech;
  assert.deepEqual(cleaned, ['broken']);
  assert.equal(players[0].listenerCount('error'), 1);
  assert.equal(players[0].listenerCount('idle'), 0);
});

test('plain text cannot inject SSML markup', () => {
  assert.equal(escapeXml('A & B <break time="2s"/>'), 'A &amp; B &lt;break time=&quot;2s&quot;/&gt;');
});

test('Groq narration segments remain one FIFO job and quote markers are never synthesised', async t => {
  const { manager, channel, players, spoken } = fixture(t, undefined, { provider: 'groq' });
  await manager.join(channel);
  const text = '> ' + 'The dragon is waiting on the mountain. '.repeat(12);
  const narration = manager.speak('1', text);
  const next = manager.speak('1', 'Next message.');
  const chunks = require('../src/utils/speechText').speechChunks(text);
  for (let i = 0; i < chunks.length; i++) {
    await tick();
    assert.equal(spoken.at(-1), chunks[i]);
    players[0].emit('idle');
  }
  await narration;
  await tick();
  assert.equal(spoken.at(-1), 'Next message.');
  players[0].emit('idle'); await next;
  assert.equal(spoken.join(' ').includes('>'), false);
});

test('speech pinned to a selected voice channel cannot play after Aina moves', async t => {
  const { manager, channel, spoken } = fixture(t);
  await manager.join(channel);
  await assert.rejects(manager.speak('1', 'Do not play elsewhere', { channelId: 'other' }), /destination changed/);
  assert.deepEqual(spoken, []);
});

test('each queued narration retains its own provider and voice through all segments', async t => {
  const requests = [];
  const { manager, channel, players } = fixture(t, async (text, _signal, settings) => {
    requests.push({ text, provider: settings.provider, voice: settings.provider === 'groq' ? settings.groqVoice : settings.voice });
    return { file: text, cleanup() {} };
  });
  await manager.join(channel);
  const text = 'The silver dragon opens its wings. '.repeat(8);
  const first = manager.speak('1', text, { provider: 'groq', voice: 'troy' });
  const second = manager.speak('1', 'The wizard replies.', { provider: 'edge', voice: 'en-US-GuyNeural' });
  const chunks = require('../src/utils/speechText').speechChunks(text);
  for (let i = 0; i < chunks.length; i++) { await tick(); assert.equal(requests[i].voice, 'troy'); players[0].emit('idle'); }
  await first; await tick();
  assert.deepEqual(requests.at(-1), { text: 'The wizard replies.', provider: 'edge', voice: 'en-US-GuyNeural' });
  players[0].emit('idle'); await second;
  await assert.rejects(manager.speak('1', 'bad voice', { provider: 'groq', voice: 'en-US-GuyNeural' }), /valid voice/);
  assert.equal(requests.length, chunks.length + 1);
});

test('commands reject DMs and users outside the current voice channel', async t => {
  let result;
  const interaction = { guild: null, reply: payload => { result = payload; } };
  await commands[0].execute(interaction);
  assert.equal(result.flags, MessageFlags.Ephemeral);
  t.mock.method(tts, 'getStatus', () => ({ channelId: '10', queued: 0, speaking: false }));
  await commands[0].execute({ ...interaction, guild: { id: '1' }, member: { voice: { channelId: '11' } }, memberPermissions: { has: permission => permission !== PermissionFlagsBits.MoveMembers }, options: { getSubcommand: () => 'stop' } });
  assert.match(result.embeds[0].data.description, /Join Aina/);
});

test('production synthesis isolates simultaneous guild files, escapes text, closes sockets, and removes audio', { timeout: 2000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-tts-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const originalLoad = Module._load;
  const inputs = [], outputs = [];
  let closed = 0;
  class FakeTTS {
    async setMetadata() {}
    toStream(text) {
      inputs.push(text);
      return { audioStream: Readable.from([text]), metadataStream: null };
    }
    close() { closed++; }
  }
  t.mock.method(Module, '_load', function (request, ...args) {
    if (request === 'msedge-tts') return { MsEdgeTTS: FakeTTS, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'mp3' } };
    return originalLoad.call(this, request, ...args);
  });
  const { voice, players, channel } = fixture(t);
  const manager = createTtsManager({ voice, settings: { audioDir: directory, voice: 'en-US-JennyNeural', playbackTimeoutMs: 1000 } });
  t.after(() => manager.shutdown());
  await manager.join(channel);
  await manager.join({ id: '20', guild: { id: '2' } });
  const first = manager.speak('1', '<speak>one & two</speak>');
  const second = manager.speak('2', 'second');
  while (players.some(player => player.state?.status !== 'playing')) await tick();
  outputs.push(...players.map(player => player.state.resource.file));
  assert.equal(new Set(outputs.map(file => path.dirname(file))).size, 2);
  assert.equal(inputs[0], '&lt;speak&gt;one &amp; two&lt;/speak&gt;');
  assert.equal(closed, 2);
  assert.ok(outputs.every(file => fs.existsSync(file)));
  for (const player of players) player.emit('idle');
  await Promise.all([first, second]);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('shutdown cancels a pending join and prevents reconnecting afterward', t => {
  const { manager, channel, voice } = fixture(t);
  let ready;
  voice.entersState = () => new Promise(resolve => { ready = resolve; });
  const joining = assert.rejects(manager.join(channel), /Could not establish voice/);
  return tick().then(async () => {
    const shutdown = manager.shutdown();
    ready();
    await Promise.all([joining, shutdown]);
    assert.equal(manager.getConnection('1'), null);
    await assert.rejects(manager.join(channel), /shutting down/);
  });
});

test('cancelling production synthesis destroys its stream before deleting temporary files', { timeout: 2000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-tts-cancel-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const originalLoad = Module._load;
  let audioStream;
  class FakeTTS {
    async setMetadata() {}
    toStream() { audioStream = new PassThrough(); audioStream.write('partial audio'); return { audioStream }; }
    close() { audioStream?.end(); }
  }
  t.mock.method(Module, '_load', function (request, ...args) {
    if (request === 'msedge-tts') return { MsEdgeTTS: FakeTTS, OUTPUT_FORMAT: {} };
    return originalLoad.call(this, request, ...args);
  });
  const { voice, channel, spoken } = fixture(t);
  const manager = createTtsManager({ voice, settings: { audioDir: directory, voice: 'en-US-JennyNeural' } });
  t.after(() => manager.shutdown());
  await manager.join(channel);
  const speech = assert.rejects(manager.speak('1', 'cancel during stream'), /cancelled/);
  while (!audioStream) await tick();
  manager.stop('1');
  await speech;
  assert.equal(audioStream.destroyed, true);
  assert.deepEqual(fs.readdirSync(directory), []);
  assert.deepEqual(spoken, []);
});

test('production synthesis timeout closes the provider and removes its request directory', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-tts-timeout-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const originalLoad = Module._load;
  let closed = false;
  class FakeTTS {
    setMetadata() { return new Promise(() => {}); }
    close() { closed = true; }
  }
  t.mock.method(Module, '_load', function (request, ...args) {
    if (request === 'msedge-tts') return { MsEdgeTTS: FakeTTS, OUTPUT_FORMAT: {} };
    return originalLoad.call(this, request, ...args);
  });
  const { voice, channel } = fixture(t);
  const manager = createTtsManager({ voice, settings: { audioDir: directory, voice: 'en-US-JennyNeural', synthesisTimeoutMs: 10 } });
  t.after(() => manager.shutdown());
  await manager.join(channel);
  await assert.rejects(manager.speak('1', 'timeout'), /timed out/);
  assert.equal(closed, true);
  assert.deepEqual(fs.readdirSync(directory), []);
});
