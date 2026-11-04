const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ROOT } = require('../src/utils/jsonStore');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const localRoot = path.join(ROOT, '.tts');
const python = path.join(localRoot, 'piper', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
function run(command, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: 'inherit' });
    child.on('error', () => reject(new Error(`Could not start ${path.basename(command)}. Check the installation and PATH.`)));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with code ${code}.`)));
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const stop = () => child.kill(signal);
      process.once(signal, stop); child.once('close', () => process.removeListener(signal, stop));
    }
  });
}
async function main() {
  const [action, engine, requestedVoice] = process.argv.slice(2);
  if (!['setup', 'serve'].includes(action) || !['piper', 'kokoro'].includes(engine)) throw new Error('Usage: node scripts/tts-local.js setup|serve piper|kokoro [piper_voice]');
  if (engine === 'kokoro') {
    const image = 'ghcr.io/remsky/kokoro-fastapi-cpu:latest';
    if (action === 'setup') await run('docker', ['pull', image]);
    else await run('docker', ['run', '--rm', '-p', '127.0.0.1:8880:8880', image]);
    return;
  }
  const voice = requestedVoice || process.env.PIPER_TTS_VOICE || 'en_US-lessac-medium';
  if (!/^[a-zA-Z0-9_-]+$/.test(voice)) throw new Error('Use a Piper model ID such as en_US-lessac-medium.');
  const models = path.join(localRoot, 'piper-voices'); fs.mkdirSync(models, { recursive: true });
  if (action === 'setup') {
    if (!fs.existsSync(python)) await run(process.platform === 'win32' ? 'py' : 'python3', [ ...(process.platform === 'win32' ? ['-3'] : []), '-m', 'venv', path.join(localRoot, 'piper') ]);
    await run(python, ['-m', 'pip', 'install', 'piper-tts[http]']);
    await run(python, ['-m', 'piper.download_voices', voice], models);
    console.log(`Piper installed with ${voice}. Start it with npm run tts:serve -- piper ${voice}`);
  } else {
    if (!fs.existsSync(python)) throw new Error('Run npm run tts:setup -- piper first.');
    await run(python, ['-m', 'piper.http_server', '--host', '127.0.0.1', '--port', '5000', '-m', voice, '--data-dir', models], models);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
