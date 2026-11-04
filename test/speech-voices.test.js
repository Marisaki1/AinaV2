const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveSpeech, voiceChoices } = require('../src/utils/speechVoices');
const { configuration } = require('../src/utils/groqSpeech');

test('Autumn is the default Groq voice and Edge works independently of the Groq key', () => {
  assert.equal(resolveSpeech({}, { provider: 'groq' }).groqVoice, 'autumn');
  const settings = { provider: 'groq', groqVoice: 'troy' };
  const edge = resolveSpeech(settings, { provider: 'edge', voice: 'en-US-GuyNeural' });
  assert.equal(configuration(edge, {}).configured, true);
  assert.equal(edge.voice, 'en-US-GuyNeural');
  assert.equal(settings.provider, 'groq');
  const choices = voiceChoices(settings);
  assert.equal(choices[0].defaultVoice, 'autumn');
  assert.equal(choices[0].voices.length, 6);
  assert.equal(choices[1].voices.filter(voice => /male$/.test(voice.name) && !/female$/.test(voice.name)).length, 5);
  assert.equal(choices[1].configured, true);
  assert.equal(voiceChoices({})[1].defaultVoice, 'en-US-JennyNeural');
});

test('provider and voice validation prevents crossing catalogs or passing SSML through a voice ID', () => {
  assert.throws(() => resolveSpeech({}, { provider: 'other' }), /supported TTS provider/);
  assert.throws(() => resolveSpeech({}, { provider: 'groq', voice: 'en-US-GuyNeural' }), /valid voice/);
  assert.throws(() => resolveSpeech({}, { provider: 'edge', voice: 'troy' }), /valid voice/);
  assert.throws(() => resolveSpeech({}, { provider: 'edge', voice: '\"><speak>' }), /valid voice/);
  const first = voiceChoices({}); first[1].voices[0].name = 'Changed';
  assert.notEqual(voiceChoices({})[1].voices[0].name, 'Changed');
});
