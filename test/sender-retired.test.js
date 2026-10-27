const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

test('old setup commands no longer prompt, read credentials, open windows or contact Discord', () => {
  for (const script of ['configure-discord-sender.js', 'finish-sender-setup.js']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts', script)], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    assert.equal(result.status, 0); assert.match(result.stdout, /removed/); assert.match(result.stdout, /Post as Aina/);
    assert(!/fetch\(|readFile|spawn\(|Read-Host|Authorization/.test(fs.readFileSync(path.join(__dirname, '../scripts', script), 'utf8')));
  }
  const ps = fs.readFileSync(path.join(__dirname, '../scripts/finish-sender-setup.ps1'), 'utf8');
  assert(!/Read-Host|Start-Process|Invoke-WebRequest/.test(ps));
});
