const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection, PermissionFlagsBits } = require('discord.js');
const config = require('../config/config');
const manager = require('../src/utils/alarmManager');
const { runDueAlarms, stopScheduler } = require('../src/utils/alarmScheduler');
const { commands } = require('../src/cogs/alarm');
const command = commands.find(c => c.data.name === 'alarm');
const original = { ...config.alarms };
let directory;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-alarm-test-'));
  config.alarms.dataDir = path.join(directory, 'alarms');
  config.alarms.imagesDir = path.join(directory, 'images');
  config.alarms.timezone = 'Asia/Manila';
});
afterEach(() => {
  Object.assign(config.alarms, original);
  assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
  fs.rmSync(directory, { recursive: true, force: true });
});
function alarm(extra = {}) {
  return { time: '08:00', message: 'Remember @everyone', repeat: 'once', channels: ['200'], members: [], image: null, createdBy: '300', ...extra };
}
function due(extra = {}) {
  manager.add('100', alarm(extra));
  const entries = manager.list('100');
  entries.at(-1).nextRunAt = '2026-10-27T00:00:00.000Z';
  manager.save('100', entries);
  return entries.at(-1);
}
function client(send = async () => {}, dm = async () => {}) {
  const channel = { id: '200', name: 'general', isTextBased: () => true, send };
  const guild = { channels: { cache: new Collection([['200', channel]]) }, members: { fetch: async () => ({ createDM: async () => ({ send: dm }) }) } };
  return { guilds: { cache: new Collection([['100', guild]]) } };
}
function interaction(subcommand, options = {}, user = '300', manage = false) {
  return {
    user: { id: user }, guild: { id: '100' }, channel: { id: '200' }, replies: [],
    memberPermissions: { has: permission => manage && permission === PermissionFlagsBits.ManageGuild },
    options: { getSubcommand: () => subcommand, getString: key => options[key] ?? null, getInteger: key => options[key] ?? null },
    async deferReply() { this.deferred = true; },
    async reply(payload) { this.replies.push(payload); },
    async editReply(payload) { this.replies.push(payload); },
  };
}
test('weekly alarms advance seven days and do not fire daily', async () => {
  let sends = 0;
  due({ repeat: 'weekly', weekday: 2 });
  const bot = client(async () => { sends++; });
  await runDueAlarms(bot, '2026-10-27T00:00:01Z');
  assert.equal(manager.list('100')[0].nextRunAt, '2026-11-03T00:00:00.000Z');
  await runDueAlarms(bot, '2026-10-28T00:00:01Z');
  assert.equal(sends, 1);
  await runDueAlarms(bot, '2026-11-03T00:00:01Z');
  assert.equal(sends, 2);
});
test('overdue one-time alarms catch up once, with only explicit user mentions enabled', async () => {
  const payloads = [];
  due();
  const bot = client(async payload => payloads.push(payload));
  await runDueAlarms(bot, '2026-10-29T11:00:00Z');
  await runDueAlarms(bot, '2026-10-29T11:01:00Z');
  assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0].allowedMentions, { parse: [], users: [] });
  assert.equal(manager.list('100').length, 0);
});
test('partial delivery retries only failed destinations and retains the alarm', async t => {
  t.mock.method(console, 'error', () => {});
  let channels = 0;
  let dmAttempts = 0;
  due({ members: ['300'] });
  const bot = client(async () => { channels++; }, async () => { if (++dmAttempts === 1) throw new Error('DM disabled'); });
  await runDueAlarms(bot, '2026-10-27T00:00:00Z');
  assert.match(manager.list('100')[0].lastError, /Retrying/);
  await runDueAlarms(bot, '2026-10-27T00:00:20Z');
  assert.equal(dmAttempts, 1);
  await runDueAlarms(bot, '2026-10-27T00:01:00Z');
  assert.equal(channels, 1);
  assert.equal(dmAttempts, 2);
  assert.equal(manager.list('100').length, 0);
});
test('overlapping scheduler ticks do not send the same occurrence twice', async () => {
  due();
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let sends = 0;
  const bot = client(async () => { sends++; entered(); await pending; });
  const first = runDueAlarms(bot, '2026-10-27T00:00:00Z');
  await started;
  await runDueAlarms(bot, '2026-10-27T00:01:00Z');
  release();
  await first;
  assert.equal(sends, 1);
});
test('failed recurring destinations do not suppress the next daily channel reminder', async t => {
  t.mock.method(console, 'error', () => {});
  let sends = 0;
  due({ repeat: 'daily', members: ['300'] });
  const bot = client(async () => { sends++; }, async () => { throw new Error('DM disabled'); });
  await runDueAlarms(bot, '2026-10-27T00:00:00Z');
  await runDueAlarms(bot, '2026-10-27T00:01:00Z');
  assert.equal(sends, 1);
  await runDueAlarms(bot, '2026-10-28T00:00:00Z');
  assert.equal(sends, 2);
  assert.equal(manager.list('100')[0].nextRunAt, '2026-10-28T00:00:00.000Z');
});
test('scheduler shutdown drains the in-flight send and starts no further destinations', async () => {
  due({ members: ['300'] });
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let dmCalls = 0;
  const bot = client(async () => { entered(); await pending; }, async () => { dmCalls++; });
  const active = runDueAlarms(bot, '2026-10-27T00:00:00Z');
  await started;
  bot.isShuttingDown = true;
  let drained = false;
  const stopping = stopScheduler().then(() => { drained = true; });
  await Promise.resolve();
  assert.equal(drained, false);
  release();
  await Promise.all([active, stopping]);
  assert.equal(drained, true);
  assert.equal(dmCalls, 0);
  assert.deepEqual(manager.list('100')[0].deliveredTargets, ['channel:200']);
});
test('editing an alarm while it sends survives scheduler completion', async () => {
  const before = due();
  const bot = client(async () => {
    const current = manager.list('100')[0];
    manager.update('100', 0, { ...current, message: 'Edited while sending' });
  });
  await runDueAlarms(bot, '2026-10-27T00:00:00Z');
  const remaining = manager.list('100');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, before.id);
  assert.equal(remaining[0].message, 'Edited while sending');
  assert.equal(remaining[0].revision, 1);
});
test('removing a sending alarm cannot remove the next alarm by shifted index', async () => {
  due();
  manager.add('100', alarm({ message: 'Keep this alarm' }));
  const second = manager.list('100')[1];
  second.nextRunAt = '2030-01-01T00:00:00Z';
  manager.save('100', [manager.list('100')[0], second]);
  await runDueAlarms(client(async () => manager.remove('100', 0)), '2026-10-27T00:00:00Z');
  assert.deepEqual(manager.list('100').map(a => a.id), [second.id]);
});
test('corrupt alarm JSON is not silently overwritten and does not block other servers', async t => {
  t.mock.method(console, 'error', () => {});
  due();
  const file = path.join(config.alarms.dataDir, '999.json');
  fs.writeFileSync(file, '{ broken');
  assert.throws(() => manager.add('999', alarm()), /Cannot read JSON/);
  await runDueAlarms(client(), '2026-10-27T00:00:00Z');
  assert.equal(fs.readFileSync(file, 'utf8'), '{ broken');
  assert.equal(manager.list('100').length, 0);
});
test('alarm limits, identifiers, message limits and image traversal are validated', () => {
  config.alarms.maxAlarmsPerGuild = 1;
  manager.add('100', alarm());
  assert.throws(() => manager.add('100', alarm()), /limit of 1/);
  assert.throws(() => manager.load('../outside'), /Invalid server/);
  assert.throws(() => manager.add('101', alarm({ message: 'x'.repeat(1001) })), /1000/);
  assert.throws(() => manager.add('101', alarm({ channels: [] })), /at least one/);
  fs.mkdirSync(config.alarms.imagesDir);
  fs.writeFileSync(path.join(config.alarms.imagesDir, 'clock.png'), 'test');
  fs.writeFileSync(path.join(directory, 'secret.png'), 'test');
  assert.equal(manager.imagePath('clock.png'), path.join(config.alarms.imagesDir, 'clock.png'));
  assert.equal(manager.imagePath('../secret.png'), null);
  assert.equal(manager.imagePath('..\\secret.png'), null);
  assert.equal(manager.imagePath('clock.txt'), null);
});
test('legacy alarms acquire stable identities and preserve unknown data', () => {
  manager.save('100', [alarm({ customMetadata: { keep: true } })]);
  const first = manager.load('100')[0];
  assert.equal(first.id, manager.load('100')[0].id);
  manager.update('100', 0, { ...first, message: 'Updated' });
  assert.deepEqual(manager.load('100')[0].customMetadata, { keep: true });
});
test('a stale edit cannot overwrite a newer edit to the same alarm', () => {
  manager.add('100', alarm());
  const originalAlarm = manager.load('100')[0];
  assert.equal(manager.update('100', 0, { ...originalAlarm, message: 'Newer change' }), true);
  assert.equal(manager.update('100', 0, { ...originalAlarm, message: 'Stale change' }), false);
  assert.equal(manager.load('100')[0].message, 'Newer change');
});
test('only the creator or Manage Server may remove an alarm', async () => {
  manager.add('100', alarm());
  const denied = interaction('remove', { number: 1 }, '400');
  await command.execute(denied);
  assert.match(denied.replies[0].embeds[0].data.title, /Not Authorised/);
  assert.equal(manager.list('100').length, 1);
  await command.execute(interaction('remove', { number: 1 }, '400', true));
  assert.equal(manager.list('100').length, 0);
});
test('alarm list paginates all 50 entries within Discord embed limits', async () => {
  for (let i = 0; i < 50; i++) manager.add('100', alarm({ message: 'x'.repeat(1000) }));
  const request = interaction('list', { page: 10 });
  await command.execute(request);
  const output = request.replies[0].embeds[0].toJSON();
  assert.equal(output.fields.length, 5);
  assert.match(output.fields[0].name, /^46\./);
  assert.ok(output.fields.every(field => field.value.length <= 1024));
  assert.ok(JSON.stringify(output).length < 6000);
  assert.equal(command.data.toJSON().dm_permission, false);
});
