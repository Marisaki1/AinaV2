const { VOICES, configuration: groqConfiguration } = require('./groqSpeech');

const EDGE_VOICES = [
  ['en-US-GuyNeural', 'Guy - US English, male'], ['en-US-ChristopherNeural', 'Christopher - US English, male'],
  ['en-US-EricNeural', 'Eric - US English, male'], ['en-GB-RyanNeural', 'Ryan - UK English, male'],
  ['en-IE-ConnorNeural', 'Connor - Irish English, male'], ['en-US-JennyNeural', 'Jenny - US English, female'],
  ['en-US-AriaNeural', 'Aria - US English, female'], ['en-GB-SoniaNeural', 'Sonia - UK English, female'],
  ['en-AU-NatashaNeural', 'Natasha - Australian English, female'],
].map(([id, name]) => ({ id, name }));
const GEMINI_VOICES = 'Zephyr Puck Charon Kore Fenrir Leda Orus Aoede Callirrhoe Autonoe Enceladus Iapetus Umbriel Algieba Despina Erinome Algenib Rasalgethi Laomedeia Achernar Alnilam Schedar Gacrux Pulcherrima Achird Zubenelgenubi Vindemiatrix Sadachbia Sadaltager Sulafat'.split(' ');
const CLOUDFLARE_VOICES = [
  ...'amalthea andromeda apollo arcas aries asteria athena atlas aurora callista cora cordelia delia draco electra harmonia helena hera hermes hyperion iris janus juno jupiter luna mars minerva neptune odysseus ophelia orion orpheus pandora phoebe pluto saturn thalia theia vesta zeus'.split(' ').map(id => ({ id: 'aura-2-en/' + id, name: 'Aura 2 English - ' + id })),
  ...'angus asteria arcas orion orpheus athena luna zeus perseus helios hera stella'.split(' ').map(id => ({ id: 'aura-1/' + id, name: 'Aura 1 English - ' + id })),
  ...'sirio nestor carina celeste alvaro diana aquila selena estrella javier'.split(' ').map(id => ({ id: 'aura-2-es/' + id, name: 'Aura 2 Spanish - ' + id })),
  ...['en', 'fr', 'es', 'zh', 'ja', 'ko'].map(id => ({ id: 'melotts/' + id, name: 'MeloTTS - ' + id })),
];
const PROVIDERS = [
  { id: 'groq', name: 'Groq Orpheus', cost: 'Free plan with usage limits; separate API key.', help: 'https://console.groq.com/docs/text-to-speech/orpheus', key: 'GROQ_TTS_API_KEY', defaultVoice: 'autumn' },
  { id: 'edge', name: 'Microsoft Edge', cost: 'Online, no personal API key. Community access to Read Aloud.', help: 'https://github.com/Migushthe2nd/MsEdgeTTS', defaultVoice: 'en-US-JennyNeural' },
  { id: 'windows', name: 'Windows installed voices', cost: 'Offline, no account or API quota. Uses installed SAPI voices.', help: 'https://learn.microsoft.com/dotnet/api/system.speech.synthesis.speechsynthesizer', defaultVoice: 'default' },
  { id: 'piper', name: 'Piper (local)', cost: 'Free local engine. Start the Piper HTTP server and download voice models.', help: 'https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_HTTP.md', defaultVoice: 'en_US-lessac-medium' },
  { id: 'kokoro', name: 'Kokoro (local)', cost: 'Free local neural voices. Start Kokoro-FastAPI first.', help: 'https://github.com/remsky/Kokoro-FastAPI', defaultVoice: 'af_heart' },
  { id: 'espeak', name: 'eSpeak NG (local)', cost: 'Free offline synthesis. Install eSpeak NG first.', help: 'https://github.com/espeak-ng/espeak-ng', defaultVoice: 'en-us' },
  { id: 'local', name: 'LocalAI / compatible TTS server', cost: 'Connect another local speech engine through an OpenAI-compatible speech endpoint.', help: 'https://localai.io/docs/features/text-to-audio/', defaultVoice: 'default' },
  { id: 'gemini', name: 'Google Gemini TTS', cost: 'Flash TTS free tier with quotas. Google AI Studio key required.', help: 'https://ai.google.dev/gemini-api/docs/speech-generation', key: 'GEMINI_TTS_API_KEY', defaultVoice: 'Charon' },
  { id: 'elevenlabs', name: 'ElevenLabs', cost: 'Free monthly credits; voice/API eligibility and attribution rules apply.', help: 'https://elevenlabs.io/docs/overview/intro', key: 'ELEVENLABS_TTS_API_KEY', defaultVoice: '' },
  { id: 'cartesia', name: 'Cartesia', cost: 'Free monthly credits; free-plan usage terms apply.', help: 'https://docs.cartesia.ai/api-reference/tts/bytes', key: 'CARTESIA_TTS_API_KEY', defaultVoice: '' },
  { id: 'azure', name: 'Azure Speech', cost: 'Choose an F0 resource for the free monthly allowance; paid resources may charge.', help: 'https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech', key: 'AZURE_TTS_API_KEY', defaultVoice: 'en-US-GuyNeural' },
  { id: 'google', name: 'Google Cloud TTS', cost: 'Monthly free allowance; billing is required and overages may charge.', help: 'https://cloud.google.com/text-to-speech/pricing', key: 'GOOGLE_TTS_API_KEY', defaultVoice: 'en-US-Standard-B' },
  { id: 'ibm', name: 'IBM Watson TTS', cost: 'Lite plan has a monthly free allowance; choose Lite when creating the service.', help: 'https://www.ibm.com/products/cloud/free', key: 'IBM_TTS_API_KEY', defaultVoice: 'en-US_MichaelV3Voice' },
  { id: 'cloudflare', name: 'Cloudflare Workers AI', cost: 'Workers Free has a daily free allocation. Account ID and Workers AI API token required.', help: 'https://developers.cloudflare.com/workers-ai/platform/pricing/', key: 'CLOUDFLARE_TTS_API_TOKEN', defaultVoice: 'aura-2-en/apollo' },
];
const DEFAULT_BACKENDS = {
  piper: { url: 'http://127.0.0.1:5000' }, kokoro: { url: 'http://127.0.0.1:8880/v1', model: 'kokoro' },
  local: { url: 'http://127.0.0.1:8080/v1', model: 'tts', voices: ['default'] }, espeak: { executable: 'espeak-ng' },
  gemini: { model: 'gemini-3.8-flash-lite-tts' }, elevenlabs: { model: 'eleven_flash_v2_5' },
  cartesia: { model: 'sonic-3.6', version: '2026-08-14' },
};
const providerDefinition = id => PROVIDERS.find(provider => provider.id === id);
const backend = (settings, provider) => ({ ...DEFAULT_BACKENDS[provider], ...settings.backends?.[provider] });
function defaultVoice(settings, provider) {
  return provider === 'groq' ? settings.groqVoice || 'autumn' : provider === 'edge' ? settings.voice || 'en-US-JennyNeural' : backend(settings, provider).voice || providerDefinition(provider)?.defaultVoice || '';
}
function configuration(settings, env = process.env) {
  const provider = settings.provider || 'edge', definition = providerDefinition(provider), service = backend(settings, provider);
  if (provider === 'groq') return groqConfiguration(settings, env);
  let error = '';
  if (!definition) error = 'Choose a TTS provider from the list.';
  else if (definition.key && !env[definition.key]?.trim()) error = `Set ${definition.key} in .env, then restart Aina.`;
  else if (provider === 'windows' && process.platform !== 'win32') error = 'Windows SAPI voices require Windows.';
  else if (provider === 'azure' && !/^[a-z0-9-]+$/.test(service.region || '')) error = 'Set AZURE_TTS_REGION to the region of your Speech resource.';
  else if (provider === 'cloudflare' && !/^[a-fA-F0-9]{32}$/.test(service.accountId || '')) error = 'Set CLOUDFLARE_TTS_ACCOUNT_ID to your Cloudflare account ID.';
  else if (['piper', 'kokoro', 'local', 'ibm'].includes(provider)) {
    try { const url = new URL(service.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (provider === 'ibm' && url.protocol !== 'https:')) throw Error(); }
    catch { error = `Set a valid ${provider === 'local' ? 'LOCAL' : provider.toUpperCase()}_TTS_URL in .env.`; }
  }
  return { provider, model: service.model || definition?.name || provider, voice: defaultVoice(settings, provider), configured: !error, error };
}
function resolveSpeech(settings, { provider, voice } = {}) {
  provider ??= settings.provider || 'edge';
  if (!providerDefinition(provider)) throw new Error('Choose a supported TTS provider from the list.');
  voice ??= defaultVoice(settings, provider);
  if (typeof voice !== 'string' || !voice.trim() || voice.length > 200 || /[\x00-\x1f<>]/.test(voice) ||
      (provider === 'groq' && !VOICES.includes(voice)) || (provider === 'gemini' && !GEMINI_VOICES.includes(voice)) ||
      (provider === 'cloudflare' && !CLOUDFLARE_VOICES.some(item => item.id === voice)) ||
      (provider === 'edge' && !/^[a-z]{2,3}-[A-Za-z0-9-]+Neural$/.test(voice)) ||
      (provider === 'piper' && (!/^[a-zA-Z0-9_-]+(?:#\d+)?$/.test(voice) || Number(voice.split('#')[1] || 0) >= 10000)) ||
      (provider === 'espeak' && !/^[a-zA-Z0-9][a-zA-Z0-9_+./-]*$/.test(voice))) throw new Error('Choose a valid voice for the selected TTS provider.');
  return { ...settings, provider, speechVoice: voice, ...(provider === 'groq' ? { groqVoice: voice } : { voice }) };
}
function voiceChoices(settings, env = process.env) {
  return PROVIDERS.map(definition => {
    const provider = definition.id;
    const info = configuration({ ...settings, provider, ...(provider === 'groq' ? { groqVoice: 'autumn' } : {}) }, env);
    let voices = [];
    if (provider === 'groq') voices = VOICES.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) + (['austin', 'daniel', 'troy'].includes(id) ? ' - male' : ' - female') }));
    if (provider === 'edge') voices = EDGE_VOICES.map(voice => ({ ...voice }));
    if (provider === 'gemini') voices = GEMINI_VOICES.map(id => ({ id, name: id }));
    if (provider === 'cloudflare') voices = CLOUDFLARE_VOICES.map(voice => ({ ...voice }));
    if (provider === 'local') voices = (backend(settings, provider).voices || []).map(id => ({ id, name: id }));
    const preferred = provider === 'groq' ? 'autumn' : info.voice;
    if (preferred && !voices.some(voice => voice.id === preferred)) voices.push({ id: preferred, name: preferred });
    return { ...info, name: definition.name, cost: definition.cost, help: definition.help, defaultVoice: preferred, voices, discovered: ['groq', 'gemini', 'cloudflare', 'local'].includes(provider) };
  });
}
module.exports = { resolveSpeech, voiceChoices, configuration, backend, providerDefinition, PROVIDERS, EDGE_VOICES, GEMINI_VOICES, CLOUDFLARE_VOICES };
