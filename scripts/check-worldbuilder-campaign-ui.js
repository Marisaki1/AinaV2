// Isolated disposable account/database and headless browser. No Discord calls.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net'), assert = require('node:assert/strict');
const { createService } = require('../src/critter/server');
async function freePort() { const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r)); return port; }
(async () => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-campaign-ui-'));
 const service = createService({ directory: path.join(directory, 'aina'), port: 0, worldbuilderOptions: { enabled: true, data: path.join(directory, 'world'), port: await freePort() } });
 let browser;
 try {
  await service.start(); browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.worldbuilder.url + '/#/home'); await page.getByRole('button', { name: 'Switch to create account', exact: true }).click();
  for (const [label, value] of [['Username', 'campaign_ui_test'], ['Display name', 'Campaign tester'], ['Your first world', 'UI test world'], ['Password', 'isolated-ui-test-only'], ['Confirm password', 'isolated-ui-test-only']]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Create account', exact: true }).click(); await page.getByLabel('Account menu', { exact: true }).waitFor();
  const fixture = await page.evaluate(async () => {
   const boot = await (await fetch('/api/bootstrap')).json(), world = boot.worlds[0].id;
   const cookie = document.cookie.split('; ').find(v => v.startsWith(boot.csrf_cookie + '='));
   const send = async (url, data) => { const r = await fetch('/api/' + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(cookie.split('=').slice(1).join('=')) }, body: JSON.stringify(data) }); const value = await r.json(); if (!r.ok) throw Error(JSON.stringify(value)); return value; };
   const hub = await send('worlds/' + world + '/resources', { kind: 'character', template: 'character', title: 'Sanae Kochiya' });
   for (let i = 0; i < 18; i++) { const other = await send('worlds/' + world + '/resources', { kind: 'character', template: 'character', title: 'Campaign character ' + i }); await send('worlds/' + world + '/connections', { source: hub.id, target: other.id, kind: i % 2 ? 'friend' : 'recorded-team-member', label: 'Historical companion', notes: 'Source-specific chapter evidence ' + i }); }
   const note = await send('worlds/' + world + '/resources', { title: 'Team test', template: 'organization', summary: '', data: { unknown: { keep: true } }, document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original campaign notes' }] }] } });
   const campaign = await send('worlds/' + world + '/resources', { kind: 'campaign', title: 'Tower fixture', data: { tower_campaign: true } });
   const floor = await send('worlds/' + world + '/resources', { kind: 'note', title: 'Floor 8 Human Village', parent: campaign.id, data: { campaign_id: campaign.id, record_type: 'campaign-floor', floor_number: 8, floor_status: 'Current', floor_entries: [note.id] }, document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Recorded village developments' }] }] } });
   return { world, hub: hub.id, note: note.id, campaign: campaign.id, floor: floor.id };
  });
  await page.reload(); await page.getByLabel('Account menu', { exact: true }).waitFor(); await page.evaluate(() => { location.hash = '/relationships'; });
  await page.locator('.relationship-neighborhood svg').waitFor(); assert.equal(await page.locator('[data-card-id]').count(), 9);
  assert.ok(await page.locator('.relationship-node text').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 12));
  const card = page.locator('[data-card-id]').nth(1), id = await card.getAttribute('data-card-id'), beforeX = Number(await card.getAttribute('data-card-x')), box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 25, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(({ id, x }) => Number(document.querySelector(`[data-card-id="${id}"]`)?.getAttribute('data-card-x')) > x + 20, { id, x: beforeX });
  const svg = page.locator('.relationship-neighborhood svg'), viewBefore = await svg.getAttribute('viewBox'), canvas = await svg.boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + 20); await page.mouse.down(); await page.mouse.move(canvas.x + canvas.width / 2 + 35, canvas.y + 55, { steps: 5 }); await page.mouse.up(); assert.notEqual(await svg.getAttribute('viewBox'), viewBefore);
  await page.getByRole('button', { name: 'Zoom relationships in', exact: true }).click(); const savedView = await svg.getAttribute('viewBox');
  await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(150);
  await page.reload(); await page.locator('.relationship-neighborhood svg').waitFor(); assert.equal(await page.locator('.relationship-neighborhood svg').getAttribute('viewBox'), savedView); assert.ok(Number(await page.locator(`[data-card-id="${id}"]`).getAttribute('data-card-x')) > beforeX + 20);
  await page.waitForFunction(() => window.scrollY > 100);
  await page.getByRole('button', { name: 'Next connections', exact: true }).click(); assert.equal(await page.locator('[data-card-id]').count(), 9);
  await page.getByLabel('Find a connected entry', { exact: true }).fill('character 17'); await page.locator('.relationship-entry-list button').click(); await page.locator('.relationship-focus-heading h2').filter({ hasText: 'Campaign character 17' }).waitFor();
  await page.reload(); await page.locator('.relationship-focus-heading h2').filter({ hasText: 'Campaign character 17' }).waitFor(); assert.equal(await page.getByLabel('Find a connected entry', { exact: true }).inputValue(), 'character 17');
  await page.screenshot({ path: path.join(directory, 'relationship-board.png') });
  for (const width of [390, 1024, 1500]) {
   await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(100);
   await page.screenshot({ path: path.join(directory, 'board-' + width + '.png') });
   const layout = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].filter(el => { const box = el.getBoundingClientRect(); return !el.closest('.relationship-neighborhood') && box.width && box.right > innerWidth + 2; }).slice(0, 15).map(el => ({ tag: el.tagName, cls: String(el.className), right: el.getBoundingClientRect().right, text: el.textContent.slice(0, 60) })) }));
   assert.ok(layout.actual <= width + 2, 'Page overflow at ' + width + ': ' + JSON.stringify(layout));
  }
  await page.evaluate(id => { location.hash = '/entry/' + id; }, fixture.note); await page.locator('[contenteditable="true"]').waitFor();
  const editor = page.locator('[contenteditable="true"]'); assert.equal(await editor.innerText(), 'Original campaign notes'); assert.equal(await page.getByLabel('Short description', { exact: true }).isVisible(), false);
  assert.ok((await editor.boundingBox()).y < 550, 'Notes editor should follow the title');
  await editor.fill('Edited campaign notes'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(async id => { const value = await (await fetch('/api/resources/' + id)).json(); return JSON.stringify(value.document).includes('Edited campaign notes') && value.data.unknown.keep === true; }, fixture.note);
  await page.getByText('Details & short description', { exact: true }).click(); assert.equal(await page.getByLabel('Short description', { exact: true }).isVisible(), true);
  await page.reload(); await page.locator('[contenteditable="true"]').waitFor(); assert.equal(await page.getByLabel('Short description', { exact: true }).isVisible(), true);
  await page.getByRole('button', { name: 'Read linked notes', exact: true }).click(); await page.locator('.linked-reading-view').waitFor(); await page.reload(); await page.locator('.linked-reading-view').waitFor();
  await page.screenshot({ path: path.join(directory, 'notes-first.png') });
  // Follow-ups are original private tasks linked back to their source entry.
  await page.getByRole('button', { name: 'Add a follow-up', exact: true }).click();
  await page.getByLabel('Follow-up title', { exact: true }).fill('Find the missing classmate');
  await page.getByLabel('Follow-up notes', { exact: true }).fill('Ask about the lost notebook.');
  await page.getByRole('button', { name: 'Create follow-up', exact: true }).click();
  await page.getByLabel('Complete follow-up Find the missing classmate', { exact: true }).waitFor();
  const followup = await page.evaluate(async world => { const row = (await (await fetch('/api/worlds/' + world + '/resources')).json()).resources.find(e => e.title === 'Find the missing classmate'); return (await fetch('/api/resources/' + row.id)).json(); }, fixture.world);
  assert.equal(followup.data.source_note_id, fixture.note); assert.equal(followup.visibility, 'private'); assert.ok(JSON.stringify(followup.document).includes(fixture.note));
  await page.getByLabel('Complete follow-up Find the missing classmate', { exact: true }).click();
  await page.getByLabel('Show completed', { exact: true }).check();
  await page.waitForFunction(async id => (await (await fetch('/api/resources/' + id)).json()).data.progress === 'done', followup.id);
  // Edit a real connection in place, then prove a stale edit cannot overwrite it.
  await page.evaluate(() => { location.hash = '/relationships'; }); await page.getByRole('button', { name: 'Edit relationship with Sanae Kochiya', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit relationship with Sanae Kochiya', exact: true }).click();
  await page.getByLabel('Label (optional)', { exact: true }).fill('Trusted ally'); await page.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await page.getByText('Trusted ally', { exact: true }).waitFor(); await page.reload(); await page.getByText('Trusted ally', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit relationship with Sanae Kochiya', exact: true }).click(); await page.getByLabel('Label (optional)', { exact: true }).fill('Draft from this tab');
  await page.evaluate(async world => {
   const boot = await (await fetch('/api/bootstrap')).json(), cookie = document.cookie.split('; ').find(v => v.startsWith(boot.csrf_cookie + '='));
   const edge = (await (await fetch('/api/worlds/' + world + '/connections')).json()).connections.find(e => e.label === 'Trusted ally');
   const response = await fetch('/api/connections/' + edge.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(cookie.split('=').slice(1).join('=')) }, body: JSON.stringify({ expected_revision: edge.revision, label: 'Concurrent update' }) }); if (!response.ok) throw Error('Concurrent fixture update failed');
  }, fixture.world);
  await page.getByRole('button', { name: 'Save relationship', exact: true }).click(); await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Label (optional)', { exact: true }).inputValue(), 'Draft from this tab'); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload(); await page.getByText('Concurrent update', { exact: true }).waitFor();
  // Configure references through the real overview, then restore after refresh.
  await page.evaluate(() => { location.hash = '/home'; }); await page.getByRole('button', { name: 'Set up briefing', exact: true }).click();
  for (const label of ['Campaign overview', 'Current situation', 'Open leads', 'Day & reference']) {
   await page.getByRole('combobox', { name: label, exact: true }).click(); await page.getByRole('option', { name: 'Team test', exact: true }).click();
  }
  await page.getByRole('combobox', { name: 'Add a cast entry', exact: true }).click(); await page.getByRole('option', { name: 'Sanae Kochiya', exact: true }).click();
  await page.getByRole('button', { name: 'Save briefing', exact: true }).click(); await page.locator('.campaign-brief-card').first().waitFor(); await page.reload(); await page.locator('.campaign-brief-card').first().waitFor();
  assert.equal(await page.locator('.campaign-brief-card').count(), 3); assert.equal(await page.locator('.campaign-brief-cast button').innerText(), 'Sanae Kochiya');
  await page.waitForFunction(() => [...document.querySelectorAll('.campaign-brief-card p')].every(p => p.textContent.includes('Edited campaign notes')));
  for (const width of [390, 1024, 1500]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Briefing overflow at ' + width); }
  await page.screenshot({ path: path.join(directory, 'campaign-briefing.png') });
  await page.locator('.campaign-brief-cast button').click(); await page.getByLabel('Entry title', { exact: true }).waitFor(); assert.equal(await page.getByLabel('Entry title', { exact: true }).inputValue(), 'Sanae Kochiya');
  await page.evaluate(id => { location.hash = '/campaigns/' + id; }, fixture.campaign);
  await page.getByText('Recorded village developments', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add floor', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add campaign floor' });
  await add.getByLabel('Floor name').fill('Floor 9 Bamboo Forest');
  await add.getByLabel('Floor number').fill('9');
  await add.getByRole('button', { name: 'Save floor' }).click();
  await page.getByRole('heading', { name: 'Floor 9 Bamboo Forest' }).waitFor();
  await page.getByRole('combobox', { name: 'Tower floor' }).click();
  await page.getByRole('option', { name: 'Floor 8 Human Village' }).click();
  await page.getByRole('button', { name: 'Floor relationships', exact: true }).click();
  await page.getByText('No recorded connections are assigned to this floor.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Manage floor connections' }).click();
  await page.getByRole('combobox', { name: 'Add a recorded connection' }).click();
  await page.getByRole('option', { name: /Campaign character 10$/ }).click();
  await page.locator('.relationship-neighborhood').waitFor();
  await page.reload();
  await page.locator('.relationship-neighborhood').waitFor();
  assert.equal(await page.locator('.relationship-card-summary').count(), 1);
  await page.getByRole('combobox', { name: 'Relationship floor' }).click();
  await page.getByRole('option', { name: 'Floor 9 Bamboo Forest' }).click();
  await page.getByText('No recorded connections are assigned to this floor.', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Relationship floor' }).click();
  await page.getByRole('option', { name: 'Floor 8 Human Village' }).click();
  await page.getByRole('button', { name: 'Manage floor connections' }).click();
  await page.getByRole('button', { name: 'Remove from floor' }).click();
  await page.getByText('No recorded connections are assigned to this floor.', { exact: true }).waitFor();
  assert.deepEqual(errors, []); console.log('PASS: campaign floor creation, floor-specific relationship assignment/removal and reload isolation; relationship board drag/pan/zoom and restoration; notes-first editing; follow-ups; stale-write rejection; briefing navigation and responsive layouts.'); console.log('QA artifacts: ' + directory);
 } finally { if (browser) await browser.close(); await service.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
