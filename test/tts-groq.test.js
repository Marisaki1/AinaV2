const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { configuration, synthesiseGroq } = require('../src/utils/groqSpeech');
const { spokenText, speechChunks } = require('../src/utils/speechText');
const settings = { provider: 'groq', groqModel: 'canopylabs/orpheus-v1-english', groqVoice: 'hannah', synthesisTimeoutMs: 1000 };

test('narration strips blockquote prefixes, preserves inline comparisons, and segments all text safely', () => {
  assert.equal(spokenText('> The mountain awaits.\n>> Reiko speaks.\n>>> Welcome!\n2 > 1'), 'The mountain awaits.\nReiko speaks.\nWelcome!\n2 > 1');
  const text = ('A long sentence about the dragon. ').repeat(40);
  const chunks = speechChunks(text);
  assert.ok(chunks.every(chunk => chunk.length <= 200 && chunk.length > 0));
  assert.equal(chunks.join(' '), text.trim());
  assert.equal(speechChunks('💜'.repeat(201)).join(''), '💜'.repeat(201));
  assert.ok(speechChunks('💜'.repeat(201)).every(chunk => chunk.length <= 200 && !/[\uD800-\uDBFF]$/.test(chunk)));
});

test('Groq speech requires its own key and validates the model and voice without exposing secrets', async () => {
  const env = { GROQ_API_KEY: 'chat-key-only' };
  assert.equal(configuration(settings, env).configured, false);
  await assert.rejects(synthesiseGroq('hello', new AbortController().signal, settings, { env, fetch() { throw new Error('must not call'); } }), /GROQ_TTS_API_KEY/);
  assert.match(configuration({ ...settings, groqVoice: 'unknown' }, { GROQ_TTS_API_KEY: 'secret' }).error, /GROQ_TTS_VOICE/);
  assert.ok(!JSON.stringify(configuration(settings, { GROQ_TTS_API_KEY: 'secret' })).includes('secret'));
});

test('Groq synthesis uses the separate key, supported WAV payload, bounded file, and cleanup', async t => {
  const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-groq-'));
  t.after(() => fs.rmSync(audioDir, { recursive: true, force: true }));
  const audio = Buffer.alloc(80); audio.write('RIFF'); audio.write('WAVE', 8);
  let calls = 0;
  const result = await synthesiseGroq('The dragon awaits.', new AbortController().signal, { ...settings, audioDir }, {
    env: { GROQ_TTS_API_KEY: 'speech-key', GROQ_API_KEY: 'different-chat-key' },
    async fetch(url, options) {
      calls++;
      assert.equal(url, 'https://api.groq.com/openai/v1/audio/speech');
      assert.equal(options.headers.Authorization, 'Bearer speech-key');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), { model: settings.groqModel, voice: 'hannah', input: 'The dragon awaits.', response_format: 'wav' });
      return new Response(audio);
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(fs.readFileSync(result.file), audio);
  result.cleanup();
  assert.deepEqual(fs.readdirSync(audioDir), []);
});

test('provider errors do not leak response bodies, auto-retry, or accept non-audio output', async () => {
  const env = { GROQ_TTS_API_KEY: 'speech-key' };
  let calls = 0;
  await assert.rejects(synthesiseGroq('hello', new AbortController().signal, settings, { env, fetch: async () => { calls++; return new Response('secret provider detail', { status: 429 }); } }), error => /429/.test(error.message) && !/secret/.test(error.message));
  assert.equal(calls, 1);
  await assert.rejects(synthesiseGroq('hello', new AbortController().signal, settings, { env, fetch: async () => new Response('not audio') }), /valid WAV/);
});

test('Groq requests abort on cancellation and timeout', async () => {
  const env = { GROQ_TTS_API_KEY: 'speech-key' };
  const request = (_url, options) => new Promise((_, reject) => {
    if (options.signal.aborted) reject(options.signal.reason);
    else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  const controller = new AbortController();
  const pending = synthesiseGroq('hello', controller.signal, settings, { env, fetch: request });
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  await assert.rejects(synthesiseGroq('hello', new AbortController().signal, { ...settings, synthesisTimeoutMs: 5 }, { env, fetch: request }), /timed out/);
});
