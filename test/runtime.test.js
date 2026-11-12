const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { loadCogs, getAllCommands, guardedListener } = require('../src/handlers/cogHandler');
const { validateEnvironment, createShutdown } = require('../index');
let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-runtime-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });
function client() { return Object.assign(new EventEmitter(), { commands: new Map() }); }
function cog(folder, name = folder) {
  fs.mkdirSync(path.join(directory, folder));
  fs.writeFileSync(path.join(directory, folder, 'index.js'), `module.exports = { commands: [{ data: { name: '${name}', toJSON() { return { name: '${name}', description: 'Test' }; } }, execute() {} }], events: { messageCreate() {} } };`);
}

test('reload replaces owned listeners and commands without duplicating registration definitions', async () => {
  cog('first'); cog('second');
  const bot = client();
  await loadCogs(bot, { directory });
  await loadCogs(bot, { directory });
  assert.equal(bot.listenerCount('messageCreate'), 2);
  assert.deepEqual([...bot.commands.keys()], ['first', 'second']);
  assert.equal(getAllCommands().length, 2);
  getAllCommands()[0].name = 'changed';
  assert.equal(getAllCommands()[0].name, 'first');
});

test('a broken or duplicate cog cannot replace a working command registry with a partial list', async () => {
  cog('first');
  const bot = client();
  await loadCogs(bot, { directory });
  cog('duplicate', 'first');
  await assert.rejects(loadCogs(bot, { directory }), /Duplicate command/);
  assert.equal(bot.commands.size, 1);
  assert.equal(bot.listenerCount('messageCreate'), 1);
  assert.equal(getAllCommands().length, 1);
});

test('async and synchronous event failures are caught by the loader boundary', async t => {
  t.mock.method(console, 'error', () => {});
  // Keep the logger offline and isolated from the actual history files.
  t.mock.method(fs, 'appendFileSync', () => {});
  await assert.doesNotReject(guardedListener('test', async () => { throw new Error('async'); })());
  await assert.doesNotReject(guardedListener('test', () => { throw new Error('sync'); })());
});

test('guild registration never silently falls back to global and missing AI credentials are optional', () => {
  const env = { DISCORD_TOKEN: 'test-token', CLIENT_ID: '123456789012345678' };
  const settings = { dev: { guildOnly: true, guildId: 'placeholder' }, alarms: { timezone: 'Asia/Manila' } };
  assert.match(validateEnvironment(env, settings).join(' '), /requires GUILD_ID/);
  settings.dev.guildOnly = false;
  assert.deepEqual(validateEnvironment(env, settings), []);
  settings.alarms.timezone = 'not-a-timezone';
  assert.match(validateEnvironment(env, settings).join(' '), /IANA timezone/);
});

test('all real commands load without network calls and every help page fits Discord limits', async () => {
  const bot = client();
  await loadCogs(bot);
  assert.deepEqual([...bot.commands.keys()].sort(), ['alarm', 'chat', 'critter', 'dungeon', 'emoji', 'endchat', 'fab', 'help', 'ping', 'time', 'transcript', 'ttv']);
  const help = bot.commands.get('help');
  for (const category of [null, 'alarms', 'dungeon', 'emoji', 'ai', 'ttv', 'fabula', 'utility', 'critter', 'transcript']) {
    for (let page = 1; page <= 12; page++) {
      let payload;
      await help.execute({ client: bot, options: { getString: () => category, getInteger: () => page }, async reply(value) { payload = value; } });
      if (!payload.embeds) break;
      const result = payload.embeds[0];
      assert.ok(result.length <= 6000);
      assert.ok((result.data.fields || []).every(field => field.name.length <= 256 && field.value.length <= 1024));
      assert.doesNotThrow(() => result.toJSON());
      if (!category) break;
    }
  }
});

test('shutdown is idempotent, stops intake before final flush, and attempts every cleanup after a failure', async t => {
  const order = [];
  t.mock.method(console, 'log', () => {});
  t.mock.method(fs, 'appendFileSync', () => {});
  t.mock.method(require('../src/utils/alarmScheduler'), 'stopScheduler', async () => { order.push('alarms'); });
  t.mock.method(require('../src/utils/ttsManager'), 'shutdown', async () => { order.push('voice'); throw new Error('voice cleanup failed'); });
  t.mock.method(require('../src/utils/emojiManager'), 'shutdown', () => { order.push('emoji'); });
  t.mock.method(require('../src/utils/userRegistry'), 'flush', () => { order.push('users'); });
  const previousExitCode = process.exitCode;
  t.after(() => { process.exitCode = previousExitCode; });
  const bot = { async destroy() { assert.equal(this.isShuttingDown, true); order.push('discord'); }, critter: { async close() { order.push('critter'); } } };
  const shutdown = createShutdown(bot);
  const first = shutdown('test');
  assert.equal(shutdown('second'), first);
  await first;
  assert.deepEqual(order, ['alarms', 'voice', 'discord', 'emoji', 'users', 'critter']);
  assert.equal(process.exitCode, 1);
});
