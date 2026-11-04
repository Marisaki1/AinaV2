const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../src/utils/jsonStore');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const { validateEnvironment } = require('../index');
const { loadCogs, getAllCommands } = require('../src/handlers/cogHandler');

async function main() {
  console.log('Aina local diagnostics (no login, command registration, or messages).');
  let failures = 0;
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) { console.error('FAIL: Node 22.12.0 or newer is required by the locked voice package.'); failures++; }
  else console.log(`OK: Node ${process.versions.node}`);
  for (const problem of validateEnvironment()) { console.error(`FAIL: ${problem}`); failures++; }
  console.log(`AI key: ${process.env.GROQ_API_KEY ? 'configured (not verified)' : 'missing; chat will be unavailable'}`);
  const speech = require('../src/utils/ttsManager').configuration();
  console.log(`TTS: ${speech.provider} / ${speech.voice} — ${speech.configured ? 'configured (not verified)' : speech.error}`);
  for (const provider of require('../src/utils/ttsManager').voiceChoices()) {
    console.log(`TTS ${provider.provider}: ${provider.configured ? 'configuration present (service/installation not verified)' : provider.error}`);
  }
  const client = new EventEmitter();
  client.commands = new Map();
  try {
    await loadCogs(client);
    console.log(`OK: ${getAllCommands().length} slash command definitions loaded and serialized.`);
  } catch (error) { console.error(`FAIL: ${error.message}`); failures++; }
  for (const name of ['@discordjs/voice', 'opusscript', 'msedge-tts', 'yaml']) {
    try { require(name); console.log(`OK: ${name} loads`); }
    catch (error) { console.warn(`WARN: ${name} is unavailable: ${error.code || error.message.split('\n')[0]}`); }
  }
  let bundled;
  try { bundled = require('ffmpeg-static'); } catch {}
  const ffmpeg = [bundled, 'ffmpeg'].filter(Boolean).some(binary =>
    spawnSync(binary, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).status === 0);
  console.log(ffmpeg ? 'OK: FFmpeg is available for voice playback.' : 'WARN: FFmpeg is unavailable; install the bundled dependency or FFmpeg on PATH.');
  console.log('Discord permissions, credentials, Groq access, and speech playback require a separate live check.');
  process.exitCode = failures ? 1 : 0;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
