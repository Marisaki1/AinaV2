const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../src/utils/jsonStore');
require('dotenv').config({ path: path.join(ROOT, '.env') });
async function main() {
  const [action, provider = 'groq', requestedVoice] = process.argv.slice(2);
  const tts = require('../src/utils/ttsManager');
  if (!['voices', 'check'].includes(action)) throw new Error('Usage: node scripts/tts-tools.js voices|check PROVIDER [VOICE]');
  const catalog = await tts.discoverVoices(provider, { refresh: true });
  if (!catalog.configured) throw new Error(catalog.error);
  if (action === 'voices') { console.log(JSON.stringify({ provider, voices: catalog.voices }, null, 2)); return; }
  const voice = requestedVoice || catalog.defaultVoice;
  if (!catalog.voices.some(item => item.id === voice)) throw new Error('Choose a voice from npm run tts:voices -- ' + provider);
  let audio;
  try {
    audio = await tts.synthesiseAudio('Aina voice check. The silver dragon awaits.', { provider, voice });
    const resource = require('@discordjs/voice').createAudioResource(audio.file);
    let packets = 0; for await (const packet of resource.playStream) packets++;
    if (!packets) throw new Error('No playable Opus audio was produced.');
    const directory = path.join(ROOT, '.tts', 'checks'); fs.mkdirSync(directory, { recursive: true });
    const target = path.join(directory, provider + '-' + Date.now() + path.extname(audio.file)); fs.copyFileSync(audio.file, target);
    console.log(`PASS: ${provider} / ${voice}, ${packets} Opus packets. No Discord connection or message was made.`);
    console.log('Audio saved for local playback: ' + target);
  } finally { audio?.cleanup(); }
}
main().catch(error => { console.error(require('../src/handlers/historyHandler').redact(error.message)); process.exitCode = 1; });
