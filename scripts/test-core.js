const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'test'))
  .filter(file => /^(chat|command-registration|memory|runtime|speech-voices|storage|alarm|dungeon|emoji|tts|fabula|transcript).*\.test\.js$/.test(file))
  .map(file => path.join('test', file));
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
