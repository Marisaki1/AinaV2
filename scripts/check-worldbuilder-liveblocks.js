// Native live-block acceptance in a disposable database and headless Edge only.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net'), assert = require('node:assert/strict');
const { createService } = require('../src/critter/server');
async function freePort() { const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
(async () => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-liveblocks-ui-'));
 const service = createService({ directory: path.join(directory, 'aina'), port: 0, worldbuilderOptions: { enabled: true, data: path.join(directory, 'world'), port: await freePort() } }); let browser;
 try {
  await service.start(); browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(service.worldbuilder.url + '/#/home'); await page.getByRole('button', { name: 'Switch to create account', exact: true }).click();
  for (const [label, value] of [['Username', 'live_ui_test'], ['Display name', 'Live tester'], ['Your first world', 'Interactive world'], ['Password', 'isolated-ui-test-only'], ['Confirm password', 'isolated-ui-test-only']]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Create account', exact: true }).click(); await page.getByLabel('Account menu', { exact: true }).waitFor();
  const fixture = await page.evaluate(async () => {
   const boot = await (await fetch('/api/bootstrap')).json(), world = boot.worlds[0].id, cookie = document.cookie.split('; ').find(v => v.startsWith(boot.csrf_cookie + '=')), csrf = decodeURIComponent(cookie.split('=').slice(1).join('='));
   const send = async (url, data) => { const response = await fetch('/api/' + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf }, body: JSON.stringify(data) }); const value = await response.json(); if (!response.ok) throw Error(JSON.stringify(value)); return value; };
   const add = value => send('worlds/' + world + '/resources', value);
   const child = await add({ kind: 'table', title: 'Scene details', data: { columns: [{ id: 'detail', label: 'Detail', type: 'text' }], rows: [{ id: 'x', cells: { detail: 'A lantern is still burning' } }] } });
   const table = await add({ kind: 'generator', title: 'Campaign prompts', data: { columns: [{ id: 'prompt', label: 'Prompt', type: 'text' }, { id: 'dice', label: 'Distance', type: 'dice' }], rows: Array.from({ length: 25 }, (_, i) => ({ id: 'row' + i, weight: i === 0 ? 1 : 0, cells: { prompt: 'Explore location ' + i, dice: '2d6+1' } })), generator_steps: [{ id: 'detail', label: 'Clue', resource_id: child.id }] } });
   const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600; const drawing = canvas.getContext('2d'); drawing.fillStyle = '#dce8d1'; drawing.fillRect(0, 0, 900, 600); drawing.fillStyle = '#587e68'; drawing.fillRect(200, 100, 300, 300);
   const body = new FormData(); body.append('file', await new Promise(r => canvas.toBlob(r)), 'test-map.png'); const assetResponse = await fetch('/api/worlds/' + world + '/assets', { method: 'POST', headers: { 'X-CSRFToken': csrf }, body }); const asset = await assetResponse.json(); if (!assetResponse.ok) throw Error(JSON.stringify(asset));
   const map = await add({ kind: 'map', title: 'Fortress map', data: { asset_id: asset.id, markers: [{ id: 'watch', label: 'Watchtower', type: 'pin', x: 0.45, y: 0.5 }] } });
   const event = await add({ kind: 'event', title: 'Arrival at the fortress', data: { year: 1, month: 1, day: 1 } });
   const timeline = await add({ kind: 'timeline', title: 'Campaign timeline', data: { selection: 'selected', event_ids: [event.id] } });
   const a = await add({ kind: 'character', title: 'Companion A' }), b = await add({ kind: 'character', title: 'Companion B' });
   await send('worlds/' + world + '/connections', { source: a.id, target: b.id, kind: 'friend', label: 'Climbing companions' });
   const graph = await add({ kind: 'relationship', title: 'Campaign relationships', data: { mode: 'all', layout: 'affinity', include_isolated: false } });
   const note = await add({ kind: 'note', title: 'Session preparation', data: { unknown: { keep: true } }, document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Existing campaign notes must survive.' }] }] } });
   return { world, child: child.id, table: table.id, map: map.id, timeline: timeline.id, event: event.id, graph: graph.id, a: a.id, b: b.id, note: note.id };
  });
  await page.reload(); await page.getByLabel('Account menu', { exact: true }).waitFor(); await page.evaluate(id => { location.hash = '/entry/' + id; }, fixture.note);
  await page.locator('.tiptap').waitFor();

  const insertSource = async name => {
   await page.locator('.tiptap>p').last().click(); await page.keyboard.press('End');
   await page.getByRole('button', { name: 'Insert live source', exact: true }).click(); await page.getByRole('combobox', { name: 'Source entry', exact: true }).click(); await page.getByRole('option', { name, exact: true }).click(); await page.getByRole('button', { name: 'Insert source', exact: true }).click();
  };
  await insertSource('Campaign prompts');
  const block = page.locator('.source-node').filter({ hasText: 'Campaign prompts' }); await block.getByLabel('Filter embedded table', { exact: true }).waitFor(); assert.equal(await block.locator('tbody tr').count(), 10);
  await block.getByRole('button', { name: 'Next rows', exact: true }).click(); assert.equal(await block.locator('tbody tr').count(), 10);
  await block.getByLabel('Filter embedded table', { exact: true }).fill('location 24'); assert.equal(await block.locator('tbody tr').count(), 1); await block.getByLabel('Filter embedded table', { exact: true }).fill('');
  await block.getByRole('button', { name: 'Generate', exact: true }).scrollIntoViewIfNeeded();
  await block.getByRole('button', { name: 'Generate', exact: true }).evaluate(el=>el.addEventListener('pointerdown',()=>{window.__liveClickScroll={window:window.scrollY,main:document.querySelector('#main-content').scrollTop};},{capture:true,once:true}));
  await block.getByRole('button', { name: 'Generate', exact: true }).click(); await block.getByLabel('Embedded generated result', { exact: true }).waitFor(); assert.ok((await block.locator('.live-generation pre').innerText()).includes('lantern'));
  const {before:scrollBefore,after:scrollAfter}=await page.evaluate(()=>({before:window.__liveClickScroll,after:{window:window.scrollY,main:document.querySelector('#main-content').scrollTop}})); assert.ok(scrollBefore,'Expected a real pointer interaction'); assert.ok(Math.abs(scrollAfter.window-scrollBefore.window)<200 && Math.abs(scrollAfter.main-scrollBefore.main)<200, 'Generating must not jump to the top of the note: '+JSON.stringify({before:scrollBefore,after:scrollAfter}));
  await block.getByRole('button', { name: 'Insert result below', exact: true }).click(); assert.ok((await page.locator('.tiptap').innerText()).includes('Clue: Detail: A lantern is still burning'));
  await page.getByRole('button', { name: 'Insert dice button', exact: true }).click(); await page.getByLabel('Roll label', { exact: true }).fill('Travel'); await page.getByLabel('Dice formula', { exact: true }).fill('1d1'); await page.getByRole('button', { name: 'Insert roll', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'valid keep count' }).waitFor();
  await page.getByLabel('Dice formula', { exact: true }).fill('4d6kh3+2'); await page.getByRole('button', { name: 'Insert roll', exact: true }).click();
  await page.locator('.dice-node').getByRole('button', { name: 'Travel 4d6kh3+2', exact: true }).click(); await page.locator('.dice-node output').waitFor();
  await insertSource('Fortress map'); const map = page.locator('.source-node').filter({ hasText: 'Fortress map' }); await map.locator('.leaflet-image-layer').waitFor(); await map.locator('.leaflet-image-layer').evaluate(img => img.complete || new Promise(r => img.addEventListener('load', r, { once: true })));
  const width = (await map.locator('.leaflet-image-layer').boundingBox()).width; await map.locator('.leaflet-control-zoom-in').click(); await page.waitForTimeout(350); assert.ok((await map.locator('.leaflet-image-layer').boundingBox()).width > width);
  await map.locator('[title="Watchtower"]').click(); await map.locator('.leaflet-popup-content').filter({ hasText: 'Watchtower' }).waitFor();
  await insertSource('Campaign timeline'); await page.locator('.source-node .timeline-embed').waitFor(); assert.ok((await page.locator('.source-node .timeline-embed').innerText()).includes('Arrival at the fortress'));
  await insertSource('Campaign relationships'); const graph = page.locator('.source-node').filter({ hasText: 'Campaign relationships' }); await graph.getByRole('button', { name: 'Graph list', exact: true }).click(); assert.ok((await graph.innerText()).includes('Companion A'));
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForFunction(async id => { const e = await (await fetch('/api/resources/' + id)).json(); return JSON.stringify(e.document).includes('diceButton') && (JSON.stringify(e.document).match(/sourceBlock/g) || []).length === 4 && e.data.unknown.keep; }, fixture.note);
  await page.reload(); await page.locator('.source-node').filter({ hasText: 'Campaign prompts' }).getByRole('button', { name: 'Generate', exact: true }).waitFor();
  assert.ok((await page.locator('.tiptap').innerText()).includes('Existing campaign notes must survive.'));
  // A failed original save preserves native block IDs and local prose after refresh.
  const savePath = '**/api/resources/' + fixture.note;
  const failSave = route => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated save interruption' }) }) : route.continue();
  await page.route(savePath, failSave); await page.locator('.tiptap>p').last().click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Recover this local draft.'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'Simulated save interruption' }).waitFor();
  await page.reload(); await page.locator('.tiptap').waitFor(); assert.ok((await page.locator('.tiptap').innerText()).includes('Recover this local draft.')); assert.equal(await page.locator('.source-node').count(), 4); await page.unroute(savePath, failSave); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(async id => JSON.stringify((await (await fetch('/api/resources/' + id)).json()).document).includes('Recover this local draft.'), fixture.note);
  await page.getByRole('button', { name: 'Read linked notes', exact: true }).click(); await page.locator('.linked-reading-view .live-source').first().waitFor(); assert.equal(await page.locator('.linked-reading-view .live-source').count(), 4);
  const readingTable = page.locator('.linked-reading-view .live-source').filter({ hasText: 'Campaign prompts' }); await readingTable.getByRole('button', { name: 'Generate', exact: true }).waitFor();
  const sourcePath = '**/api/resources/' + fixture.table + '/live-source'; await page.route(sourcePath, route => route.abort()); await readingTable.getByRole('button', { name: 'Refresh live source', exact: true }).click(); await readingTable.getByRole('alert').waitFor(); assert.ok((await page.locator('.linked-reading-view').innerText()).includes('Recover this local draft.')); await page.unroute(sourcePath); await readingTable.getByRole('button', { name: 'Refresh live source', exact: true }).click(); await readingTable.getByRole('button', { name: 'Generate', exact: true }).waitFor();
  await readingTable.getByRole('button', { name: 'Expand live source', exact: true }).click(); await page.getByRole('dialog', { name: 'Campaign prompts', exact: true }).getByLabel('Filter embedded table', { exact: true }).waitFor(); await page.keyboard.press('Escape');
  await readingTable.getByRole('button', { name: 'Campaign prompts', exact: true }).click(); await page.reload(); await page.locator('.linked-reading-view .live-source-title').filter({ hasText: 'Campaign prompts' }).waitFor(); assert.equal(await page.locator('.linked-reading-view .live-source-title').filter({ hasText: 'Campaign prompts' }).getAttribute('aria-expanded'), 'false');
  await page.locator('.linked-reading-view .live-source-title').filter({ hasText: 'Campaign prompts' }).click();
  await page.locator('.linked-reading-view .live-source').filter({ hasText: 'Campaign prompts' }).getByRole('button', { name: 'Generate', exact: true }).waitFor();
  const savedScroll = await page.evaluate(() => { const main = document.querySelector('#main-content'); main.scrollTop = 600; window.scrollTo(0,600); return { main: main.scrollTop, window: window.scrollY }; }); assert.ok(savedScroll.main + savedScroll.window > 200);
  await page.waitForFunction(({id,value}) => Object.keys(localStorage).some(key => { if(!key.startsWith('worldbuilder.reading-position:') || !key.endsWith(id))return false;const saved=JSON.parse(localStorage.getItem(key));return Math.abs(saved.main-value.main)<1 && Math.abs(saved.window-value.window)<1; }), {id:fixture.note,value:savedScroll});
  await page.reload(); await page.locator('.linked-reading-view').waitFor(); await page.waitForFunction(value => Math.abs(document.querySelector('#main-content').scrollTop - value.main) < 80 && Math.abs(window.scrollY - value.window) < 80, savedScroll);
  for (const width of [390, 1024, 1500]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Live block page overflow at ' + width); assert.ok(await page.evaluate(() => { const a = document.querySelector('.global-search').getBoundingClientRect(), b = document.querySelector('.topbar-create').getBoundingClientRect(); return a.right <= b.left + 1; }), 'Search/create controls overlap at ' + width); await page.screenshot({ path: path.join(directory, 'live-' + width + '.png') }); }
  // Publishing sources does not expose their later drafts in reader blocks.
  await page.evaluate(async fixture => {
   const boot = await (await fetch('/api/bootstrap')).json(), cookie = document.cookie.split('; ').find(v => v.startsWith(boot.csrf_cookie + '=')), csrf = decodeURIComponent(cookie.split('=').slice(1).join('='));
   const send = async (id, method, data, suffix = '') => { const response = await fetch('/api/resources/' + id + suffix, { method, headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf }, body: JSON.stringify(data) }); const value = await response.json(); if (!response.ok) throw Error(JSON.stringify(value)); return value; };
   for (const id of [fixture.table, fixture.child, fixture.map, fixture.timeline, fixture.event, fixture.graph, fixture.a, fixture.b, fixture.note]) { let e = await (await fetch('/api/resources/' + id)).json(); e = await send(id, 'PATCH', { visibility: 'public', expected_revision: e.revision }); await send(id, 'POST', { expected_revision: e.revision }, '/publish'); }
   const e = await (await fetch('/api/resources/' + fixture.table)).json(); await send(e.id, 'PATCH', { title: 'PRIVATE DRAFT TITLE', expected_revision: e.revision, data: { ...e.data, rows: [{ id: 'draft', cells: { prompt: 'PRIVATE DRAFT BODY' } }] } });
  }, fixture);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click(); const reader = page.getByRole('dialog').filter({ hasText: 'saved reader version' }); await reader.locator('.live-source').first().waitFor(); await reader.getByLabel('Filter embedded table', { exact: true }).waitFor(); assert.ok(!(await reader.innerText()).includes('PRIVATE DRAFT')); assert.equal(await reader.getByRole('button', { name: 'Generate', exact: true }).count(), 0); assert.equal(await reader.getByRole('button', { name: 'Travel 4d6kh3+2', exact: true }).isDisabled(), true); await page.keyboard.press('Escape');
  assert.deepEqual(errors, []); console.log('PASS native live-block insertion, paginated/filterable tables, composed generation and result insertion, validated dice buttons, inline map zoom/popups, timeline/relationship interaction, source failure/reconnect, failed-save draft recovery, refresh/collapse restoration, read mode, safe published previews and 390/1024/1500 non-overlapping layouts.'); console.log('QA artifacts: ' + directory);
 } finally { if (browser) await browser.close(); await service.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
