const fs = require('node:fs');
const path = require('node:path');
const { resolvePath } = require('./jsonStore');

const VOICES = ['autumn', 'diana', 'hannah', 'austin', 'daniel', 'troy'];
function configuration(settings, env = process.env) {
  const provider = settings.provider || 'edge';
  const model = settings.groqModel || 'canopylabs/orpheus-v1-english';
  const voice = settings.groqVoice || 'autumn';
  let error = '';
  if (!['groq', 'edge'].includes(provider)) error = 'TTS_PROVIDER must be groq or edge.';
  else if (provider === 'groq') {
    if (!env.GROQ_TTS_API_KEY?.trim()) error = 'Set GROQ_TTS_API_KEY in .env, then restart Aina. The chat key is not used for speech.';
    else if (model !== 'canopylabs/orpheus-v1-english') error = 'Set GROQ_TTS_MODEL=canopylabs/orpheus-v1-english.';
    else if (!VOICES.includes(voice)) error = `GROQ_TTS_VOICE must be one of: ${VOICES.join(', ')}.`;
  }
  return { provider, model: provider === 'groq' ? model : 'Microsoft Edge TTS', voice: provider === 'groq' ? voice : settings.voice, configured: !error, error };
}

async function synthesiseGroq(text, signal, settings, { fetch: request = globalThis.fetch, env = process.env } = {}) {
  const info = configuration({ ...settings, provider: 'groq' }, env);
  if (info.error) throw new Error(info.error);
  if (!text.trim() || text.length > 200) throw new Error('Each Groq speech segment must contain 1–200 characters.');
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Speech cancelled.'));
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error('Groq speech timed out.')), settings.synthesisTimeoutMs ?? 30000);
  let root, directory;
  const cleanup = () => {
    if (!directory) return;
    if (path.dirname(directory) !== root || !path.basename(directory).startsWith('aina-tts-')) throw new Error('Invalid audio cleanup path.');
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 2 });
  };
  try {
    const response = await request('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${env.GROQ_TTS_API_KEY.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: info.model, voice: info.voice, input: text, response_format: 'wav' }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const detail = [401, 403].includes(response.status) ? 'Check GROQ_TTS_API_KEY and model access/terms in your Groq project.'
        : response.status === 429 ? 'The speech project reached its rate or usage limit. Try later.' : 'Check the speech model, voice, and Groq availability.';
      throw new Error(`Groq speech failed (${response.status}). ${detail}`);
    }
    const chunks = []; let size = 0;
    if (!response.body) throw new Error('Groq returned no speech audio.');
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) { controller.abort(new Error('Groq speech audio exceeded the size limit.')); throw controller.signal.reason; }
      chunks.push(chunk);
    }
    if (controller.signal.aborted) throw controller.signal.reason;
    const audio = Buffer.concat(chunks);
    if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Groq did not return valid WAV audio.');
    root = resolvePath(settings.audioDir);
    fs.mkdirSync(root, { recursive: true });
    directory = fs.mkdtempSync(path.join(root, 'aina-tts-'));
    const file = path.join(directory, 'audio.wav');
    fs.writeFileSync(file, audio, { mode: 0o600 });
    return { file, cleanup };
  } catch (error) {
    cleanup();
    if (controller.signal.aborted) throw controller.signal.reason;
    // Provider response bodies and request headers never reach user-visible errors.
    if (/^Groq /.test(error.message)) throw error;
    throw new Error('Could not contact Groq speech. Check network access and try again.');
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

module.exports = { configuration, synthesiseGroq, VOICES };
