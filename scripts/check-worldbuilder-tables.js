// Disposable local account/database; headless Edge. No real campaign or Discord writes.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net'), assert = require('node:assert/strict');
const { createService } = require('../src/critter/server');
async function freePort() { const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r)); return port; }
(async () => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-table-ui-'));
 const service = createService({ directory: path.join(directory, 'aina'), port: 0, worldbuilderOptions: { enabled: true, data: path.join(directory, 'world'), port: await freePort() } });
 let browser;
 try {
  await service.start(); browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.worldbuilder.url + '/#/home'); await page.getByRole('button', { name: 'Switch to create account', exact: true }).click();
  for (const [label, value] of [['Username', 'table_ui_test'], ['Display name', 'Table tester'], ['Your first world', 'Table world'], ['Password', 'isolated-ui-test-only'], ['Confirm password', 'isolated-ui-test-only']]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Create account', exact: true }).click(); await page.getByLabel('Account menu', { exact: true }).waitFor();
  const fixture = await page.evaluate(async () => {
   const boot = await (await fetch('/api/bootstrap')).json(), world = boot.worlds[0].id;
   const cookie = document.cookie.split('; ').find(v => v.startsWith(boot.csrf_cookie + '='));
   const send = async data => { const response = await fetch('/api/worlds/' + world + '/resources', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(cookie.split('=').slice(1).join('=')) }, body: JSON.stringify(data) }); const value = await response.json(); if (!response.ok) throw Error(JSON.stringify(value)); return value; };
   const child = await send({ kind: 'table', title: 'Place details', data: { columns: [{ id: 'detail', type: 'text', label: 'Detail' }], rows: [{ id: 'x', weight: 1, cells: { detail: 'An abandoned watchtower' } }] } });
   const root = await send({ kind: 'generator', title: 'Campaign prompts', data: { columns: [{ id: 'result', type: 'text', label: 'Prompt' }, { id: 'dice', type: 'dice', label: 'Distance' }], rows: [{ id: 'one', weight: 0, cells: { result: 'Excluded', dice: '1d6' } }, { id: 'two', weight: 1, cells: { result: 'Explore', dice: '2d6+1' } }], unknown: { keep: true } } });
   return { root: root.id, child: child.id, world };
  });
  await page.reload(); await page.getByLabel('Account menu', { exact: true }).waitFor();
  await page.evaluate(id => { location.hash = '/entry/' + id; }, fixture.root); await page.getByRole('button', { name: 'Roll', exact: true }).waitFor();
  await page.getByLabel('Repeatable seed (optional)', { exact: true }).fill('repeat-ui');
  await page.getByRole('button', { name: 'Roll', exact: true }).click(); await page.getByLabel('Generated result', { exact: true }).waitFor();
  const first = await page.locator('.rolltable-result pre').innerText(); assert.ok(first.includes('Explore')); assert.ok(!first.includes('Excluded'));
  await page.getByRole('button', { name: 'Roll', exact: true }).click(); assert.equal(await page.locator('.rolltable-result pre').innerText(), first);
  await page.locator('.rolltable-composition summary').click(); await page.getByRole('button', { name: 'Add linked step', exact: true }).click();
  await page.getByLabel('Step 1 label', { exact: true }).fill('Location'); await page.getByRole('combobox', { name: 'Step 1 source', exact: true }).click(); await page.getByRole('option', { name: 'Place details', exact: true }).click();
  await page.getByRole('combobox', { name: 'Step 1 condition', exact: true }).click(); await page.getByRole('option', { name: 'Prompt equals', exact: true }).click(); await page.getByLabel('Step 1 exact match', { exact: true }).fill('Explore');
  await page.getByRole('button', { name: 'Roll', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.rolltable-result pre')?.textContent.includes('watchtower'));
  await page.reload(); await page.getByLabel('Step 1 label', { exact: true }).waitFor(); assert.equal(await page.getByLabel('Step 1 label', { exact: true }).inputValue(), 'Location');
  const jsonDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Table JSON', exact: true }).click(); const exported = await jsonDownload; const jsonPath = path.join(directory, 'table.json'); await exported.saveAs(jsonPath);
  const saved = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); assert.equal(saved.data.unknown.keep, true); assert.equal(saved.data.generator_steps[0].resource_id, fixture.child);
  // Import is reviewed, and typed mapping errors leave the original intact.
  const csv = path.join(directory, 'typed.csv'); fs.writeFileSync(csv, 'Name,Count,Known\n"A, B",0,false\n');
  await page.locator('.rolltable-workspace input[type=file]').setInputFiles(csv); await page.getByRole('dialog', { name: 'Review table import', exact: true }).waitFor();
  for (const [name, type] of [['Count', 'Number'], ['Known', 'Checkbox']]) { await page.getByRole('combobox', { name: 'Import type ' + name, exact: true }).click(); await page.getByRole('option', { name: type, exact: true }).click(); }
  assert.equal(await page.getByRole('button', { name: 'Use this table', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Validate column types', exact: true }).click(); await page.getByRole('button', { name: 'Use this table', exact: true }).click(); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(async id => { const value = await (await fetch('/api/resources/' + id)).json(); const cols = value.data.columns, row = value.data.rows[0]; return cols.length === 3 && row.cells[cols[1].id] === 0 && row.cells[cols[2].id] === false && value.data.unknown.keep === true; }, fixture.root);
  await page.getByLabel('Filter table rows', { exact: true }).fill('A, B'); assert.equal(await page.locator('.rolltable-grid tbody tr').count(), 1);
  await page.getByLabel('Filter table rows', { exact: true }).fill('missing'); assert.equal(await page.locator('.rolltable-grid tbody tr').count(), 0); await page.getByLabel('Filter table rows', { exact: true }).fill('');
  // JSON restores original configuration and ranges remain interactive after refresh.
  await page.locator('.rolltable-workspace input[type=file]').setInputFiles(jsonPath); await page.getByRole('dialog', { name: 'Review table import', exact: true }).waitFor(); await page.getByRole('button', { name: 'Use this table', exact: true }).click();
  await page.getByRole('radio', { name: 'Dice ranges', exact: true }).check(); await page.getByLabel('Range roll', { exact: true }).fill('1d2');
  await page.getByRole('button', { name: 'Roll', exact: true }).click(); await page.getByLabel('Generated result', { exact: true }).waitFor();
  assert.ok((await page.locator('.rolltable-result').innerText()).includes('1d2:'));
  for (const width of [390, 1024, 1500]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Table page overflow at ' + width); await page.screenshot({ path: path.join(directory, 'table-' + width + '.png') }); }
  await page.getByRole('button', { name: 'Keep as article', exact: true }).click(); await page.waitForFunction(id => location.hash !== '#/entry/' + id, fixture.root);
  const kept = await page.locator('.tiptap').innerText(); assert.ok(kept.includes('Prompt:')); assert.ok(kept.includes('Distance:'));
  // Invalid CSV reports the actual row without changing the saved source.
  await page.evaluate(id => { location.hash = '/entry/' + id; }, fixture.root); await page.getByRole('button', { name: 'Roll', exact: true }).waitFor();
  const bad = path.join(directory, 'bad.csv'); fs.writeFileSync(bad, 'A,B\nonly-one'); await page.locator('.rolltable-workspace input[type=file]').setInputFiles(bad); await page.getByRole('alert').filter({ hasText: 'CSV row 2' }).waitFor();
  const bulk = path.join(directory, 'bulk.csv'); fs.writeFileSync(bulk, 'Name\n' + Array.from({ length: 205 }, (_, i) => 'Entry ' + i).join('\n'));
  await page.locator('.rolltable-workspace input[type=file]').setInputFiles(bulk); await page.getByRole('dialog', { name: 'Review table import', exact: true }).waitFor(); await page.getByRole('button', { name: 'Use this table', exact: true }).click();
  assert.equal(await page.locator('.rolltable-grid tbody tr').count(), 50); await page.getByRole('button', { name: 'Next rows', exact: true }).click(); assert.equal(await page.getByLabel('Name row 51', { exact: true }).inputValue(), 'Entry 50');
  await page.getByLabel('Filter table rows', { exact: true }).fill('Entry 204'); assert.equal(await page.locator('.rolltable-grid tbody tr').count(), 1); assert.equal(await page.getByLabel('Name row 205', { exact: true }).inputValue(), 'Entry 204');
  assert.deepEqual(errors, []);
  console.log('PASS table weighted/range rolls, seed replay, linked conditional generation, persisted config, typed reviewed CSV/JSON interchange, preserved unknown data, frozen article output, import errors, paginated 205-row editing and 390/1024/1500 layouts.');
  console.log('QA artifacts: ' + directory);
 } finally { if (browser) await browser.close(); await service.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
