const { test } = require('node:test');
const assert = require('node:assert/strict');
const { discoverVoices, createVoiceCatalog } = require('../src/utils/speechCatalog');
const { voiceChoices, configuration, resolveSpeech } = require('../src/utils/speechVoices');

test('all 14 providers have setup guidance and missing cloud keys stay isolated from local providers', () => {
  const choices = voiceChoices({}, {});
  assert.equal(choices.length, 14);
  assert.ok(choices.every(provider => provider.help.startsWith('https://') && provider.cost));
  for (const id of ['groq', 'gemini', 'elevenlabs', 'cartesia', 'azure', 'google', 'ibm', 'cloudflare']) assert.equal(choices.find(p => p.provider === id).configured, false);
  for (const id of ['piper', 'kokoro', 'local', 'edge', 'espeak']) assert.equal(choices.find(p => p.provider === id).configured, true);
  assert.equal(configuration({ provider: 'ibm', backends: { ibm: { url: 'http://unsafe.test' } } }, { IBM_TTS_API_KEY: 'key' }).configured, false);
  assert.equal(resolveSpeech({ provider: 'windows' }).speechVoice, 'default');
  assert.throws(() => resolveSpeech({}, { provider: 'piper', voice: '../outside#1' }), /valid voice/);
  assert.throws(() => resolveSpeech({}, { provider: 'espeak', voice: '--help' }), /valid voice/);
});

test('Edge discovery includes the complete returned multilingual list instead of a curated subset', async () => {
  const source = Array.from({ length: 140 }, (_, i) => ({ ShortName: `en-US-Voice${i}Neural`, FriendlyName: `Voice ${i}`, Gender: 'Male', Locale: 'en-US' }));
  source.push({ ShortName: 'ja-JP-NanamiNeural', Gender: 'Female', Locale: 'ja-JP' });
  const result = await discoverVoices('edge', {}, { fetch: async () => Response.json(source) });
  assert.equal(result.voices.length, 141); assert.equal(result.discovered, true);
  assert.ok(result.voices.some(v => v.id === 'ja-JP-NanamiNeural'));
});

test('Piper lists installed models and every named or unnamed speaker', async () => {
  const result = await discoverVoices('piper', {}, { fetch: async url => {
    assert.equal(url, 'http://127.0.0.1:5000/voices');
    return Response.json({ first: { num_speakers: 1 }, second: { num_speakers: 3, speaker_id_map: { Dragon: 1 } } });
  } });
  assert.deepEqual(result.voices.map(v => v.id).sort(), ['first', 'second#0', 'second#1', 'second#2']);
  assert.match(result.voices.find(v => v.id === 'second#1').name, /Dragon/);
});

test('Kokoro and installed OS voices are discovered without a cloud key', async () => {
  const kokoro = await discoverVoices('kokoro', {}, { fetch: async () => Response.json({ voices: ['am_michael', { id: 'bf_emma', name: 'Emma' }] }) });
  assert.equal(kokoro.voices.length, 2);
  const espeak = await discoverVoices('espeak', {}, { native: async id => { assert.equal(id, 'espeak'); return [{ id: 'en-us', name: 'US English' }]; } });
  assert.equal(espeak.voices[0].id, 'en-us');
});

test('Cartesia and ElevenLabs voice discovery follows pagination and preserves voice eligibility', async () => {
  let requests = 0;
  const cartesia = await discoverVoices('cartesia', {}, { env: { CARTESIA_TTS_API_KEY: 'private-key' }, fetch: async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer private-key'); requests++;
    if (requests === 1) return Response.json({ data: [{ id: 'first', name: 'First' }], has_more: true, next_page: 'cursor' });
    assert.equal(new URL(url).searchParams.get('starting_after'), 'cursor');
    return Response.json({ data: [{ id: 'second', name: 'Second' }], has_more: false });
  } });
  assert.equal(requests, 2); assert.equal(cartesia.voices.length, 2);
  requests = 0;
  const eleven = await discoverVoices('elevenlabs', {}, { env: { ELEVENLABS_TTS_API_KEY: 'private-key' }, fetch: async url => {
    requests++;
    if (requests === 1) return Response.json({ voices: [{ voice_id: 'builtin', name: 'Built in', category: 'premade' }], has_more: true, next_page_token: 'more' });
    assert.equal(new URL(url).searchParams.get('next_page_token'), 'more');
    return Response.json({ voices: [{ voice_id: 'professional', name: 'Paid voice', category: 'professional' }, { voice_id: 'designed', name: 'Designed', category: 'generated' }], has_more: false });
  } });
  assert.equal(eleven.voices.length, 2); assert.ok(!eleven.voices.some(voice => voice.id === 'professional'));
});

test('Google, Azure and IBM voice lists normalize their own response schemas', async () => {
  const google = await discoverVoices('google', {}, { env: { GOOGLE_TTS_API_KEY: 'key' }, fetch: async () => Response.json({ voices: [{ name: 'en-US-Standard-B', ssmlGender: 'MALE' }] }) });
  assert.equal(google.voices[0].id, 'en-US-Standard-B');
  const azure = await discoverVoices('azure', { backends: { azure: { region: 'eastus' } } }, { env: { AZURE_TTS_API_KEY: 'key' }, fetch: async () => Response.json([{ ShortName: 'en-US-GuyNeural', Locale: 'en-US', Gender: 'Male' }]) });
  assert.equal(azure.voices[0].id, 'en-US-GuyNeural');
  const ibm = await discoverVoices('ibm', { backends: { ibm: { url: 'https://example.ibm.test' } } }, { env: { IBM_TTS_API_KEY: 'key' }, fetch: async () => Response.json({ voices: [{ name: 'Michael', language: 'en-US', gender: 'male' }] }) });
  assert.equal(ibm.voices[0].id, 'Michael');
});

test('voice discovery caches and shares requests, allows explicit refresh, and sanitizes failures', async () => {
  let calls = 0;
  const catalog = createVoiceCatalog({}, { fetch: async () => { calls++; return Response.json({ voices: ['af_heart'] }); } });
  const [a, b] = await Promise.all([catalog('kokoro'), catalog('kokoro')]);
  assert.equal(calls, 1); a.voices[0].name = 'Changed'; assert.notEqual(b.voices[0].name, 'Changed');
  await catalog('kokoro'); assert.equal(calls, 1);
  await catalog('kokoro', { refresh: true }); assert.equal(calls, 2);
  const failed = createVoiceCatalog({}, { fetch: async () => { calls++; throw Error('secret-credential'); } });
  const result = await failed('kokoro'); assert.equal(result.configured, false); assert.equal(result.discoveryFailed, true);
  assert.ok(!JSON.stringify(result).includes('secret-credential'));
  await failed('kokoro'); assert.equal(calls, 3);
});
