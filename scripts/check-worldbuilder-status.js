'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const python = path.join(root, 'src', 'critter', 'WorldBuilder', 'WorldBuilder', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!fs.existsSync(python)) {
  console.error('WorldBuilder Python environment is missing. Run its Setup launcher first.');
  process.exit(1);
}
const mode = process.argv[2];
const args = mode === '--test'
  ? ['-m', 'unittest', 'discover', '-s', 'test', '-p', 'test_worldbuilder_status.py']
  : ['scripts/audit-worldbuilder-status.py', ...(mode === '--generate' ? [] : ['--check'])];
const result = spawnSync(python, args, { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
