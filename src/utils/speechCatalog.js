const { requestSpeech } = require('./speechHttp');
const { voiceChoices, backend, providerDefinition } = require('./speechVoices');
const { nativeVoices } = require('./nativeSpeech');

const clean = voices => [...new Map(voices.filter(voice => typeof voice.id === 'string' && voice.id.trim() && voice.id.length <= 200 && !/[\x00-\x1f<>]/.test(voice.id))
  .map(voice => [voice.id, { id: voice.id, name: String(voice.name || voice.id).slice(0, 250) }])).values()].sort((a, b) => a.name.localeCompare(b.name));

async function discoverVoices(provider, settings, { env = process.env, fetch, native = nativeVoices } = {}) {
  const initial = voiceChoices(settings, env).find(item => item.provider === provider);
  if (!initial) throw new Error('Unknown TTS provider.');
  if (!initial.configured || initial.discovered) return initial;
  const service = backend(settings, provider), definition = providerDefinition(provider);
  const get = (url, headers = {}) => requestSpeech(url, { label: definition.name, json: true, maxBytes: 8 * 1024 * 1024, timeoutMs: 10000, headers, ...(fetch ? { fetch } : {}) });
  let voices;
  if (provider === 'edge') {
    const { MsEdgeTTS } = require('msedge-tts');
    const data = await get(MsEdgeTTS.VOICES_URL);
    voices = data.map(voice => ({ id: voice.ShortName, name: `${voice.FriendlyName || voice.ShortName} - ${voice.Locale}, ${voice.Gender}` }));
  } else if (['windows', 'espeak'].includes(provider)) voices = await native(provider, settings);
  else if (provider === 'piper') {
    const data = await get(service.url.replace(/\/+$/, '') + '/voices');
    voices = Object.entries(data).flatMap(([id, info]) => {
      const speakers = Object.fromEntries(Object.entries(info.speaker_id_map || {}).map(([name, number]) => [number, name]));
      const count = Number(info.num_speakers || 1);
      if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('Piper returned an invalid speaker count.');
      if (count > 1) return Array.from({ length: count }, (_, number) => ({ id: `${id}#${number}`, name: `${id} / ${speakers[number] || 'Speaker ' + number} - ${info.language?.name_english || info.language?.code || ''}` }));
      return [{ id, name: `${id} - ${info.language?.name_english || info.language?.code || ''}` }];
    });
  } else if (provider === 'kokoro') {
    const data = await get(service.url.replace(/\/+$/, '') + '/audio/voices');
    voices = data.voices.map(voice => typeof voice === 'string' ? { id: voice, name: voice } : { id: voice.id, name: voice.name || voice.id });
  } else if (provider === 'elevenlabs') {
    voices = []; let token = '', more = true;
    const seen = new Set();
    for (let page = 0; more && page < 100; page++) {
      const url = new URL('https://api.elevenlabs.io/v2/voices'); url.searchParams.set('page_size', '100');
      if (token) url.searchParams.set('next_page_token', token);
      const data = await get(url.href, { 'xi-api-key': env.ELEVENLABS_TTS_API_KEY.trim() });
      voices.push(...data.voices.filter(voice => voice.category !== 'professional' || voice.available_for_tiers?.includes('free')).map(voice => ({ id: voice.voice_id, name: `${voice.name} - ${Object.values(voice.labels || {}).join(', ')}` })));
      more = !!data.has_more; token = data.next_page_token || '';
      if (more && (!token || seen.has(token))) throw new Error('ElevenLabs voice pagination did not complete.');
      seen.add(token);
    }
    if (more) throw new Error('ElevenLabs voice list exceeds 100 pages.');
  } else if (provider === 'cartesia') {
    voices = []; let after = '', more = true;
    const seen = new Set();
    for (let page = 0; more && page < 100; page++) {
      const url = new URL('https://api.cartesia.ai/voices'); url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('starting_after', after);
      const data = await get(url.href, { Authorization: 'Bearer ' + env.CARTESIA_TTS_API_KEY.trim(), 'Cartesia-Version': service.version });
      voices.push(...(Array.isArray(data) ? data : data.data).map(voice => ({ id: voice.id, name: `${voice.name} - ${voice.language || ''}${voice.gender ? ', ' + voice.gender : ''}` })));
      more = !!data.has_more; after = data.next_page || '';
      if (more && (!after || seen.has(after))) throw new Error('Cartesia voice pagination did not complete.');
      seen.add(after);
    }
    if (more) throw new Error('Cartesia voice list exceeds 100 pages.');
  } else if (provider === 'azure') {
    const data = await get(`https://${service.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { 'Ocp-Apim-Subscription-Key': env.AZURE_TTS_API_KEY.trim() });
    voices = data.map(voice => ({ id: voice.ShortName, name: `${voice.DisplayName || voice.ShortName} - ${voice.Locale}, ${voice.Gender}` }));
  } else if (provider === 'google') {
    const data = await get('https://texttospeech.googleapis.com/v1/voices', { 'X-Goog-Api-Key': env.GOOGLE_TTS_API_KEY.trim() });
    voices = data.voices.map(voice => ({ id: voice.name, name: `${voice.name} - ${voice.ssmlGender || ''}` }));
  } else if (provider === 'ibm') {
    const data = await get(service.url.replace(/\/+$/, '') + '/v1/voices', { Authorization: 'Basic ' + Buffer.from('apikey:' + env.IBM_TTS_API_KEY.trim()).toString('base64') });
    voices = data.voices.map(voice => ({ id: voice.name, name: `${voice.description || voice.name} - ${voice.language}, ${voice.gender}` }));
  } else throw new Error('Voice discovery is unavailable for this provider.');
  voices = clean(voices);
  if (!voices.length) throw new Error(`${definition.name} returned no available voices. Check the account or install a voice model.`);
  return { ...initial, voices, discovered: true, defaultVoice: voices.some(voice => voice.id === initial.defaultVoice) ? initial.defaultVoice : voices[0].id };
}

function createVoiceCatalog(settings, dependencies = {}) {
  const cache = new Map(), pending = new Map();
  return async function get(provider, { refresh = false } = {}) {
    const existing = cache.get(provider);
    if (!refresh && existing && Date.now() < existing.expires) return structuredClone(existing.value);
    if (!pending.has(provider)) {
      const task = discoverVoices(provider, settings, dependencies).then(value => {
        cache.set(provider, { value, expires: Date.now() + 15 * 60 * 1000 }); return value;
      }).catch(() => {
        const initial = voiceChoices(settings, dependencies.env).find(value => value.provider === provider);
        if (!initial) throw new Error('Unknown TTS provider.');
        // Discovery errors from native/remote services must never expose headers,
        // provider bodies or account details. Keep a short failure cache.
        const value = { ...initial, configured: false, error: `${initial.name} voices could not load. Check its setup, credentials or local server, then press Reload voices.`, discoveryFailed: true };
        cache.set(provider, { value, expires: Date.now() + 30000 }); return value;
      }).finally(() => pending.delete(provider));
      pending.set(provider, task);
    }
    return structuredClone(await pending.get(provider));
  };
}
module.exports = { discoverVoices, createVoiceCatalog };
