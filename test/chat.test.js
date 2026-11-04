const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Groq = require('groq-sdk');
const { MessageFlags } = require('discord.js');

// Tests never load .env or contact Groq/Discord.
process.env.GROQ_API_KEY = 'test-key';
const config = require('../config/config');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-chat-test-'));
config.users.dataDir = dataDir;
after(() => {
  require('../src/utils/userRegistry').flush();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
const { commands } = require('../src/cogs/ai');
const messageEvent = require('../src/events/messageCreate');
const { getChatErrorMessage } = require('../src/utils/groqClient');
const { clearHistory, getHistory } = require('../src/utils/memory');
const chatCommand = commands.find(c => c.data.name === 'chat');
const endchatCommand = commands.find(c => c.data.name === 'endchat');
const userId = 'chat-test-user';
const client = { user: { displayAvatarURL: () => 'https://example.com/aina.png' } };

beforeEach(() => clearHistory(userId));

function interaction(message) {
  return {
    user: { id: userId }, client,
    options: { getString: () => message },
    replies: [], edits: [],
    async reply(payload) { this.replies.push(payload); },
    async editReply(payload) { this.edits.push(payload); },
  };
}

function mockGroq(t) {
  const requests = [];
  t.mock.method(Groq.Chat.Completions.prototype, 'create', async payload => {
    requests.push(payload);
    return { choices: [{ message: { content: 'Hello from Aina!' } }] };
  });
  return requests;
}

test('/chat sends each user message once and retains prior conversation', async t => {
  const requests = mockGroq(t);
  const first = interaction('Hello');
  await chatCommand.execute(first);
  await chatCommand.execute(interaction('How are you?'));

  assert.equal(requests[0].model, config.groq.model);
  assert.deepEqual(requests[0].messages.map(m => m.role), ['system', 'user']);
  assert.deepEqual(requests[1].messages.slice(1), [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hello from Aina!' },
    { role: 'user', content: 'How are you?' },
  ]);
  assert.equal(getHistory(userId).length, 4);
  assert.equal(first.edits[0].embeds[0].data.description, 'Hello from Aina!');
  assert.equal('ephemeral' in first.replies[0], false);
});

test('mentions use the same chat path without duplicated history', async t => {
  const requests = mockGroq(t);
  const replies = [];
  const message = {
    author: { id: userId, bot: false }, guild: null,
    content: '<@123> Hello', mentions: { has: () => true },
    channel: { async sendTyping() {} },
    async reply(payload) { replies.push(payload); },
  };
  await messageEvent.execute(message, client);
  message.content = '<@123> Again';
  await messageEvent.execute(message, client);
  assert.deepEqual(requests[1].messages.slice(1).map(m => m.content), [
    'Hello', 'Hello from Aina!', 'Again',
  ]);
  assert.equal(getHistory(userId).length, 4);
  assert.equal(replies.length, 2);
});

test('unavailable model gives useful feedback and leaves valid history intact', async t => {
  mockGroq(t);
  await chatCommand.execute(interaction('Successful message'));
  const previous = [...getHistory(userId)];
  t.mock.method(console, 'error', () => {});
  t.mock.method(Groq.Chat.Completions.prototype, 'create', async () => {
    throw Object.assign(new Error('model_not_found'), { status: 404 });
  });
  const failed = interaction('Failed message');
  await chatCommand.execute(failed);
  assert.deepEqual(getHistory(userId), previous);
  assert.match(failed.edits[0].embeds[0].data.description, /GROQ_MODEL.*restart/);
});

test('failed mention does not add an unanswered message to history', async t => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(Groq.Chat.Completions.prototype, 'create', async () => {
    throw Object.assign(new Error('rate limit'), { status: 429 });
  });
  const replies = [];
  await messageEvent.execute({
    author: { id: userId, bot: false }, guild: null,
    content: '<@123> Hello', mentions: { has: () => true },
    channel: { async sendTyping() {} },
    async reply(payload) { replies.push(payload); },
  }, client);
  assert.deepEqual(getHistory(userId), []);
  assert.match(replies[0].embeds[0].data.description, /rate or usage limit/);
});

test('/endchat privately handles empty memory and clears existing memory', async t => {
  const empty = interaction();
  await endchatCommand.execute(empty);
  assert.equal(empty.replies[0].flags, MessageFlags.Ephemeral);
  mockGroq(t);
  await chatCommand.execute(interaction('Hello'));
  await endchatCommand.execute(interaction());
  assert.deepEqual(getHistory(userId), []);
});

test('provider failures give actionable feedback without exposing raw errors', () => {
  assert.match(getChatErrorMessage({ status: 401 }), /GROQ_API_KEY/);
  assert.match(getChatErrorMessage({ status: 403 }), /permissions/);
  assert.match(getChatErrorMessage({ status: 429 }), /limits/);
  assert.doesNotMatch(getChatErrorMessage(new Error('secret')), /secret/);
});

test('direct mentions preserve other users as context and role mentions do not trigger chat', async t => {
  const requests = mockGroq(t);
  t.mock.method(require('../src/utils/emojiManager'), 'trackMessage', () => ({}));
  const replies = [];
  const actualClient = { user: { id: '123', displayAvatarURL: client.user.displayAvatarURL } };
  const message = {
    author: { id: userId, bot: false }, guild: { id: '123456789012345678' }, channelId: 'one',
    content: '<@123> Please greet <@456>', channel: { async sendTyping() {} },
    async reply(payload) { replies.push(payload); },
  };
  await messageEvent.execute(message, actualClient);
  assert.equal(requests[0].messages.at(-1).content, 'Please greet <@456>');
  assert.deepEqual(replies[0].allowedMentions, { parse: [], repliedUser: false });
  message.content = '<@&123> everyone';
  await messageEvent.execute(message, actualClient);
  assert.equal(requests.length, 1);
});

test('slash and mention chat share one channel but do not leak context to another', async t => {
  const requests = mockGroq(t);
  t.mock.method(require('../src/utils/emojiManager'), 'trackMessage', () => ({}));
  const slash = interaction('Channel secret');
  slash.guild = { id: '123456789012345679' };
  slash.channelId = 'first';
  await chatCommand.execute(slash);
  await messageEvent.execute({
    author: { id: userId, bot: false }, guild: slash.guild, channelId: 'first',
    content: '<@123> Continue', mentions: { has: () => true },
    channel: { async sendTyping() {} }, async reply() {},
  }, client);
  assert.equal(requests[1].messages[1].content, 'Channel secret');
  const other = interaction('New channel');
  other.guild = slash.guild;
  other.channelId = 'second';
  await chatCommand.execute(other);
  assert.equal(requests[2].messages.length, 2);
});

test('oversized provider output fits a valid Discord embed and whitespace input never reaches Groq', async t => {
  let calls = 0;
  t.mock.method(console, 'error', () => {});
  t.mock.method(Groq.Chat.Completions.prototype, 'create', async () => {
    calls++;
    return { choices: [{ message: { content: '💜'.repeat(5000) } }] };
  });
  const long = interaction('Long response');
  await chatCommand.execute(long);
  assert.ok(long.edits[0].embeds[0].data.description.length <= 4096);
  assert.doesNotThrow(() => long.edits[0].embeds[0].toJSON());
  await chatCommand.execute(interaction('   '));
  assert.equal(calls, 1);
});
