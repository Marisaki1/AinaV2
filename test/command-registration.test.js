const { test } = require('node:test');
const assert = require('node:assert/strict');
const { definitionsMatch, syncCommands } = require('../src/utils/commandRegistration');

const commands = [
  { name: 'ping', description: 'Current ping', type: 1, options: [] },
  { name: 'ttv', description: 'Voice', dm_permission: false, options: [
    { type: 1, name: 'say', description: 'Speak', options: [{ type: 3, name: 'text', description: 'Text', required: true, max_length: 2000 }] },
    { type: 1, name: 'join', description: 'Join', options: [{ type: 7, name: 'channel', description: 'Destination', required: false }] },
  ] },
];
function discordResults() {
  const result = structuredClone(commands).reverse();
  for (const command of result) {
    command.id = '123'; command.version = '456'; command.application_id = '789'; command.type ??= 1;
    command.default_member_permissions = null; command.nsfw = false; command.dm_permission ??= true;
    command.contexts = null; command.integration_types = [0, 1];
    if (!command.options?.length) delete command.options;
    for (const sub of command.options || []) for (const option of sub.options || []) if (!option.required) delete option.required;
  }
  return result;
}

test('Discord defaults and metadata do not cause unchanged commands to be rewritten', async () => {
  let writes = 0;
  const result = await syncCommands({ rest: { get: async () => discordResults(), put: async () => writes++ }, applicationId: '123', commands });
  assert.equal(result.changed, false);
  assert.equal(writes, 0);
});

test('missing commands, outdated limits, and changed permissions require publication', () => {
  assert.equal(definitionsMatch(discordResults().slice(1), commands), false);
  const outdated = discordResults();
  outdated.find(c => c.name === 'ttv').options[0].options[0].max_length = 500;
  assert.equal(definitionsMatch(outdated, commands), false);
  const restricted = discordResults();
  restricted[0].default_member_permissions = '8';
  assert.equal(definitionsMatch(restricted, commands), false);
});

test('Discord may reorder channel type sets without changing command behavior', () => {
  const desired = [{ name: 'test', description: 'Channel test', options: [{ type: 7, name: 'channel', description: 'Channel', channel_types: [0, 5, 11, 12, 10] }] }];
  const actual = structuredClone(desired);
  actual[0].options[0].channel_types.sort((a, b) => a - b);
  assert.equal(definitionsMatch(actual, desired), true);
  actual[0].options[0].channel_types.pop();
  assert.equal(definitionsMatch(actual, desired), false);
});

test('guild publication uses only the requested server and verifies Discord readback', async () => {
  const calls = [];
  let published = false;
  const rest = {
    async get(route) { calls.push(['get', route]); return published ? discordResults().map(({ dm_permission, ...command }) => command) : []; },
    async put(route, { body }) { calls.push(['put', route]); assert.deepEqual(body, commands); published = true; },
  };
  const result = await syncCommands({ rest, applicationId: '123', guildId: '456', commands });
  assert.equal(result.changed, true);
  assert.deepEqual(calls, ['get', 'put', 'get'].map(method => [method, '/applications/123/guilds/456/commands']));
  assert.equal(definitionsMatch([], commands), false);
});

test('empty or unconfirmed registrations cannot report success', async () => {
  const rest = { get: async () => [], put: async () => {} };
  await assert.rejects(syncCommands({ rest, applicationId: '123', commands: [] }), /empty command list/);
  await assert.rejects(syncCommands({ rest, applicationId: '123', commands }), /verification failed/);
});
