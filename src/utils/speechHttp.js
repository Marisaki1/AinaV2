const fs = require('node:fs');
const path = require('node:path');
const { resolvePath } = require('./jsonStore');

async function requestSpeech(url, { label = 'TTS', signal, timeoutMs = 30000, maxBytes = 20 * 1024 * 1024, json = false, fetch: request = globalThis.fetch, ...options } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Speech cancelled.'));
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error(`${label} request timed out.`)), timeoutMs);
  try {
    const response = await request(url, { ...options, redirect: 'error', signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel();
      const advice = [401, 403].includes(response.status) ? 'Check this provider\'s key, plan and model/voice access.' : response.status === 429 ? 'The provider quota or rate limit was reached. No automatic retry was made.' : 'Check the provider setup and service availability.';
      throw new Error(`${label} failed (HTTP ${response.status}). ${advice}`);
    }
    if (!response.body) throw new Error(`${label} returned an empty response.`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) { controller.abort(new Error(`${label} response exceeded the size limit.`)); throw controller.signal.reason; }
      chunks.push(chunk);
    }
    if (controller.signal.aborted) throw controller.signal.reason;
    const buffer = Buffer.concat(chunks);
    if (!json) return buffer;
    try { return JSON.parse(buffer.toString('utf8')); } catch { throw new Error(`${label} returned invalid JSON.`); }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error.message?.startsWith(label + ' ')) throw error;
    throw new Error(`${label} could not connect. Check network access or start the configured local TTS server.`);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

function audioFile(settings) {
  const root = resolvePath(settings.audioDir || 'assets/audio');
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'aina-tts-'));
  const cleanup = () => {
    if (path.dirname(directory) !== root || !path.basename(directory).startsWith('aina-tts-')) throw new Error('Invalid audio cleanup path.');
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 2 });
  };
  return { directory, file: path.join(directory, 'audio.wav'), cleanup };
}
function saveAudio(settings, audio) {
  const wav = audio.length >= 44 && audio.toString('ascii', 0, 4) === 'RIFF' && audio.toString('ascii', 8, 12) === 'WAVE';
  const mp3 = audio.length > 4 && (audio.toString('ascii', 0, 3) === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0));
  const ogg = audio.length > 4 && audio.toString('ascii', 0, 4) === 'OggS';
  if (!wav && !mp3 && !ogg) throw new Error('The TTS provider did not return recognizable WAV, MP3, or Ogg audio.');
  const output = audioFile(settings);
  output.file = path.join(output.directory, wav ? 'audio.wav' : mp3 ? 'audio.mp3' : 'audio.ogg');
  try { fs.writeFileSync(output.file, audio, { mode: 0o600 }); return output; }
  catch (error) { output.cleanup(); throw error; }
}
function pcmWave(pcm, rate = 24000) {
  if (!pcm.length || pcm.length % 2 || !Number.isInteger(rate) || rate < 8000 || rate > 96000) throw new Error('The TTS provider returned invalid PCM audio.');
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
module.exports = { requestSpeech, audioFile, saveAudio, pcmWave };
