const { test } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config/config');
const memory = require('../src/utils/memory');
function setting(t, name, value) {
  const before = config.groq[name];
  config.groq[name] = value;
  t.after(() => { config.groq[name] = before; });
}

test('channel and server conversations stay isolated and returned histories cannot mutate memory', async () => {
  const first = memory.conversationKey('same-user', 'server', 'one');
  const second = memory.conversationKey('same-user', 'server', 'two');
  await memory.converse(first, 'private context', async () => 'first reply');
  await memory.converse(second, 'different context', async messages => {
    assert.deepEqual(messages, [{ role: 'user', content: 'different context' }]);
    return 'second reply';
  });
  memory.getHistory(first)[0].content = 'mutated';
  assert.equal(memory.getHistory(first)[0].content, 'private context');
  memory.clearHistory(first);
  assert.equal(memory.getHistory(second).length, 2);
  memory.clearHistory(second);
});

test('overlapping requests cannot interleave and clearing pending chat prevents late memory restoration', async () => {
  let finish;
  const promise = memory.converse('pending', 'hello', () => new Promise(resolve => { finish = resolve; }));
  await assert.rejects(memory.converse('pending', 'second', async () => 'no'), { code: 'CHAT_BUSY' });
  memory.clearHistory('pending');
  finish('late response');
  assert.equal(await promise, 'late response');
  assert.deepEqual(memory.getHistory('pending'), []);
  await memory.converse('pending', 'new conversation', async messages => {
    assert.equal(messages.length, 1);
    return 'fresh reply';
  });
  memory.clearHistory('pending');
});

test('provider failures preserve history, free the request slot, and keep complete pairs within the limit', async t => {
  setting(t, 'memoryLimit', 5);
  for (let n = 0; n < 5; n++) await memory.converse('pairs', String(n), async () => 'answer');
  const before = memory.getHistory('pairs');
  assert.deepEqual(before.map(message => message.role), ['user', 'assistant', 'user', 'assistant']);
  await assert.rejects(memory.converse('pairs', 'bad', async () => { throw new Error('provider failed'); }));
  assert.deepEqual(memory.getHistory('pairs'), before);
  await memory.converse('pairs', 'recovered', async () => 'ok');
  memory.clearHistory('pairs');
});

test('idle conversations expire before reuse and least recently used sessions are bounded', async t => {
  const originalNow = Date.now();
  t.mock.method(Date, 'now', () => originalNow);
  setting(t, 'memoryTtlMs', 100);
  setting(t, 'maxSessions', 2);
  await memory.converse('expired', 'old', async () => 'reply');
  t.mock.method(Date, 'now', () => originalNow + 101);
  assert.deepEqual(memory.getHistory('expired'), []);
  await memory.converse('second', 'two', async () => 'reply');
  await memory.converse('third', 'three', async () => 'reply');
  assert.deepEqual(memory.getHistory('expired'), []);
  memory.clearHistory('second');
  memory.clearHistory('third');
});
