const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { ROOT } = require('../src/utils/jsonStore');
const { createVoiceCatalog } = require('../src/utils/speechCatalog');
const { synthesiseProvider } = require('../src/utils/speechProviders');
const { resolveSpeech } = require('../src/utils/speechVoices');
async function main() {
  const python = path.join(ROOT, '.tts/piper', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(python)) throw Error('Run npm run tts:setup -- piper first.');
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const models = path.join(ROOT, '.tts/piper-voices');
  const child = spawn(python, ['-m', 'piper.http_server', '--host', '127.0.0.1', '--port', String(port), '-m', 'en_US-lessac-medium', '--data-dir', models], { cwd: models, shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let exited = false; child.on('exit', () => { exited = true; }); child.stderr.resume();
  child.on('error', () => { exited = true; });
  const closed = new Promise(resolve => child.once('close', resolve));
  let audio;
  try {
    const url = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 120 && !exited; attempt++) {
      try { const response = await fetch(url + '/voices', { signal: AbortSignal.timeout(500) }); ready = response.ok; if (ready) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw Error('The temporary Piper server did not start.');
    const settings = { audioDir: 'assets/audio', synthesisTimeoutMs: 60000, backends: { piper: { url } } };
    const catalog = await createVoiceCatalog(settings)('piper');
    if (!catalog.configured || !catalog.voices.length) throw Error('Piper voice discovery failed.');
    const checked = [];
    for (const voice of catalog.voices.slice(0, 2)) {
      audio = await synthesiseProvider('The silver dragon awaits.', new AbortController().signal, resolveSpeech(settings, { provider: 'piper', voice: voice.id }));
      const resource = require('@discordjs/voice').createAudioResource(audio.file);
      let packets = 0; for await (const packet of resource.playStream) packets++;
      if (!packets) throw Error('Piper audio could not be decoded for Discord.');
      checked.push({ voice: voice.id, opusPackets: packets }); audio.cleanup(); audio = null;
    }
    console.log(JSON.stringify({ result: 'PASS', engine: 'piper', checked, voices: catalog.voices.length, discordConnection: false }));
  } finally { audio?.cleanup(); if (!exited) child.kill(); await closed; }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
