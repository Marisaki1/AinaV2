const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { providerRequest, synthesiseProvider } = require('../src/utils/speechProviders');
const { resolveSpeech, voiceChoices, PROVIDERS } = require('../src/utils/speechVoices');
const { requestSpeech, pcmWave } = require('../src/utils/speechHttp');
const { runSpeechProcess } = require('../src/utils/nativeSpeech');
const env = Object.fromEntries(PROVIDERS.filter(p => p.key).map(p => [p.key, p.id + '-private-test-key']));
env.LOCAL_TTS_API_KEY = 'private-local-key';
const settings = { synthesisTimeoutMs: 1000, backends: { azure: { region: 'eastus' }, ibm: { url: 'https://api.us-south.text-to-speech.watson.cloud.ibm.com/instances/test' }, cloudflare: { accountId: 'a'.repeat(32) } } };
const wave = pcmWave(Buffer.alloc(400));
const entries = [
  ['piper', 'en_US-lessac-medium#2', 'http://127.0.0.1:5000/synthesize', body => { assert.equal(body.speaker_id, 2); assert.equal(body.voice, 'en_US-lessac-medium'); }],
  ['kokoro', 'am_michael', 'http://127.0.0.1:8880/v1/audio/speech', body => { assert.equal(body.model, 'kokoro'); assert.equal(body.voice, 'am_michael'); }],
  ['local', 'character', 'http://127.0.0.1:8080/v1/audio/speech', (body, headers) => { assert.equal(body.voice, 'character'); assert.equal(headers.Authorization, 'Bearer private-local-key'); }],
  ['elevenlabs', 'test-voice', 'https://api.elevenlabs.io/v1/text-to-speech/test-voice?output_format=mp3_44100_128', (body, headers) => { assert.equal(body.model_id, 'eleven_flash_v2_5'); assert.equal(headers['xi-api-key'], env.ELEVENLABS_TTS_API_KEY); }],
  ['cartesia', 'test-uuid', 'https://api.cartesia.ai/tts/bytes', (body, headers) => { assert.equal(body.voice, 'test-uuid'); assert.equal(body.model_id, 'sonic-3.6'); assert.equal(headers['Cartesia-Version'], '2026-08-14'); }],
  ['azure', 'en-US-GuyNeural', 'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1', (body, headers) => { assert.match(body, /&lt;dragon&gt; &amp;/); assert.match(body, /name="en-US-GuyNeural"/); assert.equal(headers['Ocp-Apim-Subscription-Key'], env.AZURE_TTS_API_KEY); }],
  ['google', 'en-US-Standard-B', 'https://texttospeech.googleapis.com/v1/text:synthesize', body => { assert.deepEqual(body.voice, { name: 'en-US-Standard-B', languageCode: 'en-US' }); }],
  ['gemini', 'Charon', 'https://generativelanguage.googleapis.com/v1beta/interactions', body => { assert.equal(body.generation_config.speech_config[0].voice, 'Charon'); assert.equal(body.model, 'gemini-3.8-flash-lite-tts'); }],
  ['ibm', 'en-US_MichaelV3Voice', 'https://api.us-south.text-to-speech.watson.cloud.ibm.com/instances/test/v1/synthesize?voice=en-US_MichaelV3Voice', (body, headers) => { assert.equal(body.text, '<dragon> &'); assert.equal(headers.Accept, 'audio/wav'); }],
  ['cloudflare', 'aura-2-en/apollo', 'https://api.cloudflare.com/client/v4/accounts/' + 'a'.repeat(32) + '/ai/run/@cf/deepgram/aura-2-en', (body, headers) => { assert.equal(body.speaker, 'apollo'); assert.equal(body.container, 'wav'); assert.equal(headers.Authorization, 'Bearer ' + env.CLOUDFLARE_TTS_API_TOKEN); }],
];
for (const [provider, voice, endpoint, check] of entries) test(`${provider} synthesis uses its documented endpoint, selected voice and isolated audio cleanup`, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-provider-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let calls = 0;
  const audio = await synthesiseProvider('<dragon> &', new AbortController().signal, resolveSpeech({ ...settings, audioDir: directory }, { provider, voice }), {
    env, async fetch(url, options) {
      calls++; assert.equal(url, endpoint); assert.equal(options.redirect, 'error');
      const body = provider === 'azure' ? options.body : JSON.parse(options.body); check(body, options.headers);
      if (provider === 'google') return Response.json({ audioContent: wave.toString('base64') });
      if (provider === 'gemini') return Response.json({ steps: [{ type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/wav', data: wave.toString('base64') }] }] });
      return new Response(wave);
    },
  });
  assert.equal(calls, 1); assert.deepEqual(fs.readFileSync(audio.file), wave);
  audio.cleanup(); assert.deepEqual(fs.readdirSync(directory), []);
});

test('legacy Gemini generation responses wrap raw PCM with a playable WAV header', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-pcm-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const selected = resolveSpeech({ audioDir: directory, backends: { gemini: { model: 'gemini-3.1-flash-tts-preview' } } }, { provider: 'gemini', voice: 'Charon' });
  const result = await synthesiseProvider('Hello', new AbortController().signal, selected, { env, fetch: async (_url, options) => {
    assert.equal(JSON.parse(options.body).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Charon');
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(400).toString('base64') } }] } }] });
  } });
  assert.equal(fs.readFileSync(result.file).toString('ascii', 0, 4), 'RIFF'); result.cleanup();
});

test('all provider credentials stay out of public configuration and missing keys block synthesis', async () => {
  const publicData = JSON.stringify(voiceChoices(settings, env));
  for (const value of Object.values(env)) assert.ok(!publicData.includes(value));
  for (const [provider, voice] of entries.filter(([provider]) => PROVIDERS.find(p => p.id === provider).key)) {
    let calls = 0;
    await assert.rejects(synthesiseProvider('hello', new AbortController().signal, resolveSpeech(settings, { provider, voice }), { env: {}, fetch: async () => { calls++; } }), /_TTS_API_(KEY|TOKEN)/);
    assert.equal(calls, 0);
  }
});

test('Cloudflare MeloTTS handles its language schema and JSON audio envelopes', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-cloudflare-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const result = await synthesiseProvider('Bonjour', new AbortController().signal, resolveSpeech({ ...settings, audioDir: directory }, { provider: 'cloudflare', voice: 'melotts/fr' }), { env, fetch: async (url, options) => {
    assert.ok(url.endsWith('/@cf/myshell-ai/melotts')); assert.deepEqual(JSON.parse(options.body), { prompt: 'Bonjour', lang: 'fr' });
    return new Response(' \n' + JSON.stringify({ success: true, result: { audio: wave.toString('base64') } }));
  } });
  assert.deepEqual(fs.readFileSync(result.file), wave); result.cleanup();
});

test('failed HTTP requests do not retry or expose provider error bodies and reject oversized/non-audio responses', async () => {
  let calls = 0;
  await assert.rejects(requestSpeech('https://example.test', { label: 'Provider', fetch: async () => { calls++; return new Response('private account details', { status: 403 }); } }), error => /HTTP 403/.test(error.message) && !error.message.includes('private'));
  assert.equal(calls, 1);
  await assert.rejects(requestSpeech('https://example.test', { maxBytes: 10, fetch: async () => new Response(Buffer.alloc(11)) }), /size limit/);
  const selected = resolveSpeech(settings, { provider: 'kokoro', voice: 'af_heart' });
  await assert.rejects(synthesiseProvider('hello', new AbortController().signal, selected, { fetch: async () => new Response('<html>Error</html>') }), /recognizable/);
});

test('HTTP cancellation and deadlines interrupt stalled synthesis', async () => {
  const fetch = (_url, options) => new Promise((_, reject) => {
    if (options.signal.aborted) reject(options.signal.reason);
    else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  const controller = new AbortController();
  const request = requestSpeech('https://example.test', { fetch, signal: controller.signal }); controller.abort();
  await assert.rejects(request, /cancelled/);
  await assert.rejects(requestSpeech('https://example.test', { fetch, timeoutMs: 5 }), /timed out/);
});

test('local subprocesses use literal arguments and stop on cancellation or timeout', async () => {
  const literal = 'a "voice"; $(unsafe)';
  assert.equal(await runSpeechProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal]), literal);
  await assert.rejects(runSpeechProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 25 }), /timed out/);
  const controller = new AbortController();
  const running = runSpeechProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal }); controller.abort();
  await assert.rejects(running, /cancelled/);
});
