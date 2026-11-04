const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createEmojiManager } = require('../src/utils/emojiManager');
const { commands, events, fetchAllMessages } = require('../src/cogs/emoji');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-emoji-test-'));
  const manager = createEmojiManager({ dataDir: directory });
  t.after(() => { manager.flushAll(); fs.rmSync(directory, { recursive: true, force: true }); });
  const guild = { id: '1', emojis: { cache: new Collection([['10', { id: '10', name: 'wave' }]]) }, stickers: { cache: new Collection([['20', { id: '20' }]]) } };
  const message = { id: '100', guild, author: { bot: false }, content: '<:wave:10> <:wave:10> <:outside:11>', createdAt: new Date('2026-01-02T03:00:00Z'), stickers: new Collection([['20', { id: '20', name: 'Hi', guildId: '1' }]]) };
  return { directory, manager, guild, message };
}

test('live messages and repeated history scans share deduplication, including repeated emoji occurrences', t => {
  const { manager, message, directory } = fixture(t);
  assert.deepEqual(manager.trackMessage(message), { emojis: 2, stickers: 1 });
  assert.deepEqual(manager.trackMessage(message), { emojis: 0, stickers: 0 });
  assert.equal(manager.load('1').emojis['10'].count, 2);
  assert.equal(manager.load('1').emojis['11'], undefined);
  manager.flushAll();
  const reloaded = createEmojiManager({ dataDir: directory });
  assert.deepEqual(reloaded.trackMessage(message), { emojis: 0, stickers: 0 });
  reloaded.flushAll();
  assert.equal(reloaded.load('1').stickers['20'].count, 1);
});

test('message edits reconcile counts and bots/external stickers are ignored', t => {
  const { manager, message } = fixture(t);
  manager.trackMessage(message);
  manager.trackMessage({ ...message, content: '<:wave:10>', stickers: new Collection() });
  assert.equal(manager.load('1').emojis['10'].count, 1);
  assert.equal(manager.load('1').stickers['20'].count, 0);
  manager.trackMessage({ ...message, id: '101', author: { bot: true } });
  assert.equal(manager.load('1').emojis['10'].count, 1);
});

test('reaction snapshots and add/remove events are idempotent without affecting message uses', t => {
  const { manager, message } = fixture(t);
  manager.trackMessage(message);
  const reaction = { message, emoji: { id: '10', name: 'wave' } };
  manager.trackReaction(reaction, { id: '200', bot: false });
  manager.trackReaction(reaction, { id: '200', bot: false });
  manager.trackReaction(reaction, { id: '201', bot: true });
  manager.setReactionUsers('1', '100', '10', 'wave', ['200', '202'], message.createdAt);
  manager.setReactionUsers('1', '100', '10', 'wave', ['200', '202'], message.createdAt);
  assert.equal(manager.load('1').emojis['10'].count, 4);
  manager.trackReaction(reaction, { id: '200', bot: false }, false);
  manager.trackReaction(reaction, { id: '200', bot: false }, false);
  assert.equal(manager.load('1').emojis['10'].count, 3);
});

test('legacy statistics and unknown metadata survive migration with an explicit legacy marker', t => {
  const { manager, directory, message } = fixture(t);
  fs.writeFileSync(path.join(directory, '1.json'), JSON.stringify({ emojis: { 10: { name: 'wave', count: 7, firstUsed: '2025-01-01T00:00:00.000Z', lastUsed: '2025-02-01T00:00:00.000Z' } }, stickers: {}, customMetadata: { retained: true } }));
  manager.trackMessage(message);
  manager.flushAll();
  const data = JSON.parse(fs.readFileSync(path.join(directory, '1.json')));
  assert.equal(data.emojis['10'].count, 9);
  assert.equal(data.legacyTotals, true);
  assert.equal(data.emojis['10'].firstUsed, '2025-01-01T00:00:00.000Z');
  assert.deepEqual(data.customMetadata, { retained: true });
});

test('corrupt files fail closed and unsafe server paths are rejected', t => {
  const { manager, directory } = fixture(t);
  const file = path.join(directory, '1.json');
  fs.writeFileSync(file, '{broken');
  assert.throws(() => manager.updateEmoji('1', '10', 'wave'));
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  assert.throws(() => manager.load('../outside'), /Invalid server ID/);
});

test('clear removes deduplication state and totals together', t => {
  const { manager, message } = fixture(t);
  manager.trackMessage(message);
  manager.clearStats('1');
  assert.deepEqual(manager.load('1').messages, {});
  assert.deepEqual(manager.load('1').emojis, {});
  assert.equal(manager.trackMessage(message).emojis, 2);
});

test('history snapshots cannot overwrite newer live content or reaction changes', t => {
  const { manager, message } = fixture(t);
  manager.trackMessage(message);
  const observedBefore = manager.getRevision();
  manager.trackMessage({ ...message, content: '<:wave:10>' }, { edited: true });
  assert.equal(manager.trackMessage(message, { observedBefore }).skipped, true);
  const reaction = { message, emoji: { id: '10', name: 'wave' } };
  manager.trackReaction(reaction, { id: '200', bot: false });
  assert.equal(manager.setReactionUsers('1', message.id, '10', 'wave', [], message.createdAt, { observedBefore }), null);
  assert.equal(manager.load('1').emojis['10'].count, 2);
  manager.reconcileReactions('1', message.id, [], observedBefore);
  assert.equal(manager.load('1').emojis['10'].count, 2);
});

test('live clear events protect even unseen reaction lists from delayed scan snapshots', t => {
  const { manager, message } = fixture(t);
  const observedBefore = manager.getRevision();
  manager.reconcileReactions('1', message.id, []);
  assert.equal(manager.setReactionUsers('1', message.id, '10', 'wave', ['200'], message.createdAt, { observedBefore }), null);
  manager.removeReaction('1', '101', '10');
  assert.equal(manager.setReactionUsers('1', '101', '10', 'wave', ['200'], message.createdAt, { observedBefore }), null);
  manager.trackMessage({ ...message, content: '', stickers: new Collection() }, { edited: true });
  assert.equal(manager.trackMessage(message, { observedBefore }).skipped, true);
});

test('scans reconcile reactions removed while offline, keeping message uses', t => {
  const { manager, message } = fixture(t);
  manager.trackMessage(message);
  manager.setReactionUsers('1', message.id, '10', 'wave', ['200'], message.createdAt);
  manager.reconcileReactions('1', message.id, [], manager.getRevision());
  assert.equal(manager.load('1').emojis['10'].count, 2);
});

test('shutdown flushes accepted updates and ignores late event or scan mutations', t => {
  const { manager, message, directory } = fixture(t);
  manager.trackMessage(message);
  manager.shutdown();
  manager.trackMessage({ ...message, id: '101' });
  manager.setReactionUsers('1', message.id, '10', 'wave', ['200'], message.createdAt);
  manager.updateEmoji('1', '10', 'wave');
  manager.flushAll();
  const saved = JSON.parse(fs.readFileSync(path.join(directory, '1.json')));
  assert.equal(saved.emojis['10'].count, 2);
  assert.equal(saved.messages['101'], undefined);
});

test('reaction events are exported on the cog and administrator commands reject ordinary members', async () => {
  assert.equal(typeof events.messageReactionAdd, 'function');
  assert.equal(typeof events.messageReactionRemove, 'function');
  let response;
  await commands[0].execute({ guild: { id: '1' }, options: { getSubcommand: () => 'clear' }, memberPermissions: { has: permission => permission !== PermissionFlagsBits.Administrator }, reply: payload => { response = payload; } });
  assert.equal(response.flags, MessageFlags.Ephemeral);
  assert.match(response.embeds[0].data.description, /administrators/);
});

test('history paginator respects the cutoff and sorts Discord collections', async () => {
  const rows = [
    { id: '2', createdAt: new Date('2026-01-02'), createdTimestamp: Date.parse('2026-01-02') },
    { id: '1', createdAt: new Date('2026-01-01'), createdTimestamp: Date.parse('2026-01-01') },
    { id: '3', createdAt: new Date('2026-01-03'), createdTimestamp: Date.parse('2026-01-03') },
  ];
  const channel = { messages: { fetch: async () => new Collection(rows.map(item => [item.id, item])) } };
  const received = [];
  for await (const row of fetchAllMessages(channel, new Date('2026-01-02'))) received.push(row.id);
  assert.deepEqual(received, ['3', '2']);
});
