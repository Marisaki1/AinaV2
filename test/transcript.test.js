const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Collection, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { parseDay, formatMessage, exportTranscript } = require('../src/utils/transcript');
const { commands, createCommand, permitted } = require('../src/cogs/transcript');
const OWNER = '113974200267571201';

function message(id, author = OWNER, content = 'hello') {
  return { id: String(id), createdTimestamp: Date.UTC(2026, 0, 1) + Number(id) * 1000, author: { id: author, username: 'Player' }, content, embeds: [], attachments: new Collection() };
}

test('D&D speaker identities, text-only mode, embedded text and image exclusion', () => {
  const ids = [OWNER, '1357545423430226121', '114555873187201028', '195509169955143681', '123'];
  const labels = ['DM', 'DM', 'Sanae', 'Shuu', 'Player'];
  ids.forEach((id, i) => assert.equal(formatMessage(message(1, id, 'Greetings')), labels[i] + ': Greetings'));
  const m = message(2, OWNER, 'The dragon awakens. https://example.org/map.png');
  m.attachments.set('1', { name: 'map.png', contentType: 'image/png', url: 'https://cdn.example/map.png' });
  m.attachments.set('2', { name: 'notes.pdf', contentType: 'application/pdf', url: 'https://cdn.example/notes.pdf' });
  m.embeds = [{ title: 'Narration', description: 'A distant roar', image: { url: 'https://cdn.example/dragon.png' } }];
  assert.equal(formatMessage(m, { labels: false }), 'The dragon awakens.\nNarration\nA distant roar');
  const detailed = formatMessage(m, { dates: true, attachments: true });
  assert.match(detailed, /^\[2026-01-01T00:00:02\.000Z\] DM:/);
  assert.match(detailed, /notes\.pdf/); assert.doesNotMatch(detailed, /map\.png|dragon\.png/);
  const withImages = formatMessage(m, { images: true });
  assert.match(withImages, /map\.png/); assert.match(withImages, /dragon\.png/); assert.doesNotMatch(withImages, /notes\.pdf/);
  assert.equal(formatMessage({ ...m, content: '', embeds: [], attachments: new Collection([['1', m.attachments.get('1')]]) }), '');
});

test('dates validate actual UTC calendar days with inclusive end', () => {
  assert.equal(parseDay('2026-01-01'), Date.UTC(2026, 0, 1));
  assert.equal(parseDay('2026-01-01', true), Date.UTC(2026, 0, 2));
  assert.throws(() => parseDay('2026-02-30'), /real date/);
  assert.throws(() => parseDay('2026/01/01'), /YYYY-MM-DD/);
});

test('entire multi-page history saves in chronological order with no truncation and correct ranges', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aina-transcript-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const records = Array.from({ length: 235 }, (_, i) => message(i + 1, i === 4 ? '114555873187201028' : OWNER, `Line ${i + 1}`));
  const calls = [];
  const channel = { id: '123', guild: { id: '456' }, messages: { async fetch(options) {
    calls.push(options);
    return new Collection(records.filter(m => !options.before || BigInt(m.id) < BigInt(options.before)).reverse().slice(0, 100).map(m => [m.id, m]));
  } } };
  const result = await exportTranscript(channel, { directory, beforeId: '999', format: { labels: true } });
  assert.equal(result.scanned, 235); assert.equal(result.included, 235); assert.equal(calls.length, 3);
  assert.equal(calls[0].before, '999'); assert.equal(calls[1].before, '136');
  const text = await fs.readFile(result.path, 'utf8');
  assert.ok(text.startsWith('DM: Line 1\n\n')); assert.ok(text.endsWith('DM: Line 235\n\n'));
  assert.match(text, /Sanae: Line 5/); assert.equal((await fs.readdir(directory)).length, 1);
  const range = await exportTranscript(channel, { directory, start: records[49].createdTimestamp, end: records[55].createdTimestamp, format: { labels: false } });
  assert.equal(range.included, 6); assert.equal(await fs.readFile(range.path, 'utf8'), Array.from({ length: 6 }, (_, i) => `Line ${i + 50}\n\n`).join(''));
});

test('fetch failures, nonadvancing pages and cancellation never leave a completed or partial transcript', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aina-transcript-failure-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const channel = { id: '123', guild: { id: '456' }, messages: { fetch: async () => { throw Error('network failed'); } } };
  await assert.rejects(exportTranscript(channel, { directory }), /network failed/);
  channel.messages.fetch = async () => new Collection([['3', message(3)]]);
  await assert.rejects(exportTranscript(channel, { directory, beforeId: '3' }), /non-advancing/);
  await assert.rejects(exportTranscript(channel, { directory, isCancelled: () => true }), /interrupted/);
  assert.deepEqual(await fs.readdir(directory), []);
});

test('private threads require each actor to be a member or have Manage Threads', async () => {
  const member = { id: OWNER }, bot = { id: '2' }, access = new Set([OWNER]);
  const channel = { type: ChannelType.PrivateThread, permissionsFor: () => ({ has: permission => permission !== PermissionFlagsBits.ManageThreads }), members: { fetch: async id => { if (!access.has(id)) throw Error('not a member'); return { id }; } } };
  assert.equal(await permitted(channel, member, bot), false);
  access.add('2'); assert.equal(await permitted(channel, member, bot), true);
  channel.permissionsFor = () => ({ has: permission => permission === PermissionFlagsBits.ManageThreads });
  assert.equal(await permitted(channel, member, bot), false);
});

test('command rejects everyone except Marisaki before reading channel history', async () => {
  let result, fetched = false;
  await commands[0].execute({ user: { id: '195509169955143681' }, guild: {}, channel: { messages: { fetch: () => { fetched = true; } } }, reply: async payload => { result = payload; } });
  assert.equal(result.flags, MessageFlags.Ephemeral); assert.match(result.content, /Only Marisaki/); assert.equal(fetched, false);
  const options = commands[0].data.toJSON().options;
  assert.deepEqual(options.map(option => option.name), ['channel', 'text_only', 'speakers', 'dates', 'attachments', 'embed_text', 'images', 'from_date', 'through_date']);
});

test('owner command checks permissions, saves locally and applies text-only precedence', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aina-transcript-command-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let response, deferred, historyReads = 0;
  const member = { id: OWNER }, bot = { id: '2' };
  const guild = { id: '456', members: { fetch: async () => member, me: bot } };
  const channel = { id: '123', type: ChannelType.GuildText, guild, permissionsFor: () => ({ has: () => true }), messages: { fetch: async () => { historyReads++; const m = message(1, OWNER, 'Campaign begins'); return new Collection([[m.id, m]]); } } };
  const options = { getChannel: () => channel, getString: () => null, getBoolean: name => name === 'text_only' ? true : ['speakers', 'dates', 'attachments', 'images'].includes(name) ? true : null };
  const interaction = { id: '999', user: { id: OWNER }, guild, channel, client: {}, options, async deferReply(payload) { deferred = payload; }, async editReply(payload) { response = payload; } };
  const command = createCommand({ exporter: (c, opts) => exportTranscript(c, { ...opts, directory }) });
  await command.execute(interaction);
  assert.equal(deferred.flags, MessageFlags.Ephemeral); assert.equal(historyReads, 1);
  assert.equal(response.files.length, 1); assert.match(response.content, /1 text-bearing messages exported/);
  const files = await fs.readdir(directory); assert.equal(files.length, 1);
  assert.equal(await fs.readFile(path.join(directory, files[0]), 'utf8'), 'Campaign begins\n\n');
  channel.permissionsFor = () => ({ has: () => false });
  await command.execute(interaction);
  assert.match(response, /both you and Aina/i); assert.equal(historyReads, 1);
});
