const { requestSpeech, saveAudio, pcmWave } = require('./speechHttp');
const { backend, configuration, providerDefinition } = require('./speechVoices');
const { synthesiseNative } = require('./nativeSpeech');

const xml = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const base = value => value.replace(/\/+$/, '');
function providerRequest(settings, text, env = process.env) {
  const provider = settings.provider, service = backend(settings, provider), voice = settings.speechVoice || settings.voice;
  const headers = { 'Content-Type': 'application/json' };
  let url, body, response = 'audio';
  if (['kokoro', 'local'].includes(provider)) {
    url = base(service.url) + '/audio/speech';
    body = { model: service.model, input: text, voice, response_format: 'wav' };
    if (provider === 'local' && env.LOCAL_TTS_API_KEY) headers.Authorization = 'Bearer ' + env.LOCAL_TTS_API_KEY.trim();
  } else if (provider === 'piper') {
    url = base(service.url) + '/synthesize';
    const [name, speaker] = voice.split('#');
    body = { text, voice: name, ...(speaker !== undefined ? { speaker_id: Number(speaker) } : {}) };
    if (speaker !== undefined && !/^\d+$/.test(speaker)) throw new Error('Choose a valid Piper speaker.');
  } else if (provider === 'elevenlabs') {
    url = 'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voice) + '?output_format=mp3_44100_128';
    headers['xi-api-key'] = env.ELEVENLABS_TTS_API_KEY.trim();
    body = { text, model_id: service.model };
  } else if (provider === 'cartesia') {
    url = 'https://api.cartesia.ai/tts/bytes';
    headers.Authorization = 'Bearer ' + env.CARTESIA_TTS_API_KEY.trim(); headers['Cartesia-Version'] = service.version;
    body = { model_id: service.model, transcript: text, voice, output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 24000 } };
  } else if (provider === 'azure') {
    url = `https://${service.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    headers['Ocp-Apim-Subscription-Key'] = env.AZURE_TTS_API_KEY.trim();
    headers['Content-Type'] = 'application/ssml+xml'; headers['X-Microsoft-OutputFormat'] = 'riff-24khz-16bit-mono-pcm';
    headers['User-Agent'] = 'Aina';
    body = `<speak version="1.0" xml:lang="${xml(voice.split('-').slice(0, 2).join('-'))}"><voice name="${xml(voice)}">${xml(text)}</voice></speak>`;
  } else if (provider === 'google') {
    url = 'https://texttospeech.googleapis.com/v1/text:synthesize'; headers['X-Goog-Api-Key'] = env.GOOGLE_TTS_API_KEY.trim();
    body = { input: { text }, voice: { name: voice, languageCode: voice.split('-').slice(0, 2).join('-') }, audioConfig: { audioEncoding: 'MP3' } }; response = 'google';
  } else if (provider === 'gemini') {
    if (!/^[a-zA-Z0-9._-]+$/.test(service.model)) throw new Error('Set a valid GEMINI_TTS_MODEL.');
    url = `https://generativelanguage.googleapis.com/v1beta/models/${service.model}:generateContent`;
    headers['X-Goog-Api-Key'] = env.GEMINI_TTS_API_KEY.trim();
    body = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }; response = 'gemini';
    if (/^gemini-3\.8-/.test(service.model)) {
      url = 'https://generativelanguage.googleapis.com/v1beta/interactions';
      body = { model: service.model, input: [{ type: 'user_input', content: [{ type: 'text', text }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] } };
      response = 'gemini-interactions';
    }
  } else if (provider === 'ibm') {
    url = base(service.url) + '/v1/synthesize?voice=' + encodeURIComponent(voice);
    headers.Authorization = 'Basic ' + Buffer.from('apikey:' + env.IBM_TTS_API_KEY.trim()).toString('base64');
    headers.Accept = 'audio/wav'; body = { text };
  } else if (provider === 'cloudflare') {
    const [variant, speaker] = voice.split('/');
    const model = variant === 'melotts' ? '@cf/myshell-ai/melotts' : '@cf/deepgram/' + variant;
    url = `https://api.cloudflare.com/client/v4/accounts/${service.accountId}/ai/run/${model}`;
    headers.Authorization = 'Bearer ' + env.CLOUDFLARE_TTS_API_TOKEN.trim();
    body = variant === 'melotts' ? { prompt: text, lang: speaker } : { text, speaker, encoding: 'linear16', container: 'wav', sample_rate: 24000 };
    response = 'cloudflare';
  } else throw new Error('This speech provider has no synthesis adapter.');
  return { url, headers, body: typeof body === 'string' ? body : JSON.stringify(body), response };
}

async function synthesiseProvider(text, signal, settings, { env = process.env, fetch } = {}) {
  const info = configuration(settings, env);
  if (info.error) throw new Error(info.error);
  if (['windows', 'espeak'].includes(settings.provider)) return synthesiseNative(text, signal, settings);
  const spec = providerRequest(settings, text, env);
  const result = await requestSpeech(spec.url, { method: 'POST', headers: spec.headers, body: spec.body,
    label: providerDefinition(settings.provider).name, signal, timeoutMs: settings.synthesisTimeoutMs ?? 60000,
    json: ['google', 'gemini', 'gemini-interactions'].includes(spec.response), ...(fetch ? { fetch } : {}) });
  let audio = result;
  if (spec.response === 'google') {
    if (typeof result.audioContent !== 'string') throw new Error('Google Cloud TTS returned no audio.');
    audio = Buffer.from(result.audioContent, 'base64');
  }
  if (spec.response === 'gemini') {
    const parts = result.candidates?.flatMap(candidate => candidate.content?.parts || []) || [];
    const inline = parts.find(part => part.inlineData?.data)?.inlineData;
    if (!inline || !/^audio\//.test(inline.mimeType || '')) throw new Error('Gemini TTS returned no audio. Check the model and any content restrictions.');
    audio = Buffer.from(inline.data, 'base64');
    if (/^audio\/(L16|pcm)/i.test(inline.mimeType)) audio = pcmWave(audio, Number(inline.mimeType.match(/rate=(\d+)/)?.[1] || 24000));
  }
  if (spec.response === 'gemini-interactions') {
    const audioPart = result.steps?.filter(step => step.type === 'model_output').flatMap(step => step.content || []).filter(part => part.type === 'audio').at(-1);
    if (!audioPart?.data) throw new Error('Gemini TTS returned no audio. Check the model and any content restrictions.');
    audio = Buffer.from(audioPart.data, 'base64');
    if (/^audio\/(l16|pcm)/i.test(audioPart.mime_type || '')) audio = pcmWave(audio, Number((audioPart.mime_type || '').match(/rate=(\d+)/)?.[1] || 24000));
  }
  if (spec.response === 'cloudflare' && result.toString('utf8', 0, 32).trimStart().startsWith('{')) {
    let data;
    try { data = JSON.parse(result.toString('utf8').replace(/^\uFEFF/, '').trim()); } catch { throw new Error('Cloudflare TTS returned invalid JSON.'); }
    const encoded = data.result?.audio || data.audio;
    if (typeof encoded !== 'string' || data.success === false) throw new Error('Cloudflare TTS returned no audio. Check model access and the daily quota.');
    audio = Buffer.from(encoded, 'base64');
  }
  return saveAudio(settings, audio);
}
module.exports = { synthesiseProvider, providerRequest };
