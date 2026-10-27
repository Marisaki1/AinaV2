// Real browser integration check, with a temporary workspace and simulated Discord transport.
// An optional JSON path is read as a reference; all edits use a temporary copy.
// No user workspace, Discord credentials, or live channels are accessed.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createService } = require('../src/critter/server');
const { creature, bestiary } = require('../test/critter-fixture');

(async () => {
  const referenceFile = process.argv[2];
  const reference = referenceFile ? JSON.parse(fs.readFileSync(referenceFile, 'utf8')) : null;
  const expectedDocuments = reference ? 3 : 2;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-critter-browser-'));
  const posted = [], deleted = [], messages = new Map();
  const channel = {
    async send(payload) {
      posted.push(payload); const id = 'preview-' + posted.length;
      const message = { id, author: { id: 'bot' }, async react() {}, async delete() { deleted.push(id); } };
      messages.set(id, message); return message;
    },
    messages: { async fetch(id) { return messages.get(id); } },
  };
  const client = { isReady: () => true, user: { id: 'bot' }, channels: { async fetch() { return channel; } } };
  const service = createService({ client, ownerId: 'owner', directory, port: 0 });
  service.bridge.channels = async () => [{ id: 'test-channel', name: 'Test server / #battle' }];
  let browser;
  try {
    await service.start();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1512, height: 1050 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? dialog.defaultValue() : undefined));
    await page.goto(service.url + '/advanced');
    await page.getByText('Your bestiary starts here').waitFor();
    console.log('PASS empty workspace');
    await page.locator('#import-files').setInputFiles([
      { name: 'dragons.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bestiary())) },
      { name: 'single.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(creature())) },
      ...(reference ? [{ name: path.basename(referenceFile), mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(reference)) }] : []),
    ]);
    await page.locator('#creature-form').waitFor();
    assert.equal(service.store.value.documents.length, expectedDocuments);
    assert.equal(service.store.value.documents[0].data.creatures.length, 2);
    await page.locator('#automation-report').getByText('Cold Breath', { exact: true }).waitFor();
    console.log('PASS creature + bestiary uploads, automation title detection');
    const original = creature();
    await page.locator('[data-path="stats.armorClass"]').fill('23');
    await page.locator('#save-creature').click();
    await page.waitForFunction(() => document.querySelector('[data-path="stats.armorClass"]').dataset.initial === '23');
    assert.deepEqual(service.store.value.documents[0].data.creatures[0].stats.actions, original.stats.actions);
    assert.deepEqual(service.store.value.documents[0].data.creatures[0].stats.skills, original.stats.skills);
    assert.equal(service.store.value.documents[0].data.creatures[0].stats.armorClass, 23);
    console.log('PASS form save retains unknown fields, exact automation, custom Perception total');
    await page.locator('#ability-rules').fill('<p>Changed visible text.</p>');
    await page.locator('#save-creature').click();
    await page.waitForFunction(() => !document.querySelector('#dirty-state').textContent.includes('Unsaved'));
    assert.match(service.store.value.documents[0].data.creatures[0].stats.actions[0].description, /15d8\[cold\]/);
    const sourceBlock = text => text.match(/<avrae hidden>[\s\S]*?<\/avrae>/)[0];
    assert.equal(sourceBlock(service.store.value.documents[0].data.creatures[0].stats.actions[0].description), sourceBlock(original.stats.actions[0].description));
    await page.locator('#raw-open').click();
    await page.locator('#raw-json').fill('{invalid');
    await page.locator('#apply-raw').click();
    await page.locator('#raw-error').getByText(/Invalid JSON/).waitFor();
    await page.locator('#raw-dialog button[value="cancel"]').click();
    console.log('PASS visible-rule edit preserves shared-roll source; invalid raw JSON rejected');
    for (const [button, filename] of [['#export-creature', 'creature-export.json'], ['#export-bestiary', 'bestiary-export.json']]) {
      const exportWait = page.waitForEvent('download');
      await page.locator(button).click();
      const exported = await exportWait; const output = path.join(directory, filename); await exported.saveAs(output);
      const data = JSON.parse(fs.readFileSync(output, 'utf8'));
      assert.deepEqual(data, button === '#export-creature' ? service.store.value.documents[0].data.creatures[0] : service.store.value.documents[0].data);
    }
    console.log('PASS individual creature and full bestiary exports');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: service.url });
    await page.locator('#copy-creature-json').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('CritterDB JSON copied.'));
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), service.store.value.documents[0].data.creatures[0]);
    await page.locator('#copy-source-json').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('CritterDB JSON copied.'));
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), service.store.value.documents[0].data);
    console.log('PASS clipboard JSON for both a creature and a whole bestiary');
    await page.locator('[data-page="encounter"]').click();
    const key = service.store.value.documents[0].keys[0];
    await page.locator('#entry-source').selectOption(key);
    await page.locator('#entry-name').fill('DragonTest');
    await page.locator('#entry-bonus').fill('14');
    await page.locator('#entry-ac').fill('23');
    await page.locator('#add-entry').click();
    await page.getByText('DragonTest', { exact: true }).waitFor();
    await page.locator('#entry-source').selectOption(service.store.value.documents[0].keys[1]);
    await page.locator('#entry-name').fill('Tewi');
    await page.locator('#entry-fixed').fill('23');
    await page.locator('#add-entry').click();
    await page.getByText('Tewi', { exact: true }).waitFor();
    await page.locator('#setup-preview').click();
    await page.locator('#command-previews').getByText(/-b 14 -ac 23/).waitFor();
    assert.match(await page.locator('#command-previews').innerText(), /!i madd "Tewi Inaba" -name "Tewi" -p 23/);
    console.log('PASS encounter setup uses separate source names, aliases, and initiative modes');
    await page.locator('#command-source').selectOption(key);
    await page.locator('#command-actor').fill('DragonTest');
    await page.locator('#command-action').fill('Cold Breath');
    await page.locator('[data-target-index="1"]').check();
    await page.locator('#manual-target').fill('Seija');
    await page.locator('#add-target').click();
    await page.locator('#command-roll').selectOption('adv');
    await page.locator('#build-command').click();
    await page.locator('#command-previews').getByText(/!i aoo "DragonTest" "Cold Breath" -t "Tewi" -t "Seija" adv/).waitFor();
    await page.locator('#post-channel').selectOption('test-channel');
    await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Saved to this computer.');
    await page.locator('#post-commands').click();
    await page.locator('#post-result').getByText(/1 preview\(s\) posted/).waitFor();
    assert.equal(posted.length, 1);
    assert.match(posted[0].content, /!i aoo "DragonTest" "Cold Breath"/);
    await service.bridge.onMessage({ author: { id: 'owner', bot: false }, channelId: 'test-channel', content: service.bridge.pending.values().next().value.command });
    assert.deepEqual(deleted, ['preview-1']);
    console.log('PASS multi-target action GUI, selected-channel post, and sent-command cleanup');
    await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Saved to this computer.');
    await page.locator('#favorite-command').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Favorite saved.');
    await page.locator('#queue-command').click();
    await page.locator('#queue-items').getByText('Cold Breath · 1 line(s)', { exact: true }).waitFor();
    assert.equal(service.store.value.favorites.length, 1);
    assert.equal(service.store.value.queue.length, 1);
    await page.locator('[data-page="archive"]').click();
    await page.locator('[data-reuse="favorites:0"]').click();
    assert.equal(await page.locator('#command-actor').inputValue(), 'DragonTest');
    assert.deepEqual(await page.locator('#selected-targets').innerText(), 'Tewi\n×\nSeija\n×');
    console.log('PASS favorites, queue, and editable command reuse');
    await page.locator('[data-page="settings"]').click();
    const downloadWait = page.waitForEvent('download');
    await page.locator('#export-workspace').click();
    const download = await downloadWait;
    const backupPath = path.join(directory, 'export.json'); await download.saveAs(backupPath);
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    assert.equal(backup.format, 'aina-critter-workspace'); assert.equal(backup.documents.length, expectedDocuments);
    await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('Clipboard unavailable for test'); } }); });
    await page.locator('[data-copy-doc="0"]').click();
    await page.locator('#fallback-dialog').waitFor();
    assert.equal(await page.locator('#fallback-title').textContent(), 'Copy bestiary JSON');
    assert.deepEqual(JSON.parse(await page.locator('#fallback-copy').inputValue()), service.store.value.documents[0].data);
    await page.locator('#fallback-dialog button').click();
    console.log('PASS selectable JSON fallback when clipboard permission is unavailable');
    await page.reload(); await page.locator('#creature-form').waitFor();
    assert.equal(await page.locator('[data-path="stats.armorClass"]').inputValue(), '23');
    const screenshot = path.join(os.tmpdir(), 'aina-critter-workshop.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS backup download, reload persistence, mobile width, and no browser script errors');
    console.log('Screenshot:', screenshot);
    if (reference) {
      await page.setViewportSize({ width: 1512, height: 1050 });
      const referenceDocument = service.store.value.documents[2];
      await page.locator(`[data-creature="${referenceDocument.keys[0]}"]`).click();
      await page.locator('summary').filter({ hasText: /^Saving throws/ }).click();
      const row = page.locator('[data-modifier="savingThrows"][data-index="0"]');
      assert.equal(await row.locator('.mod-name').inputValue(), 'dexterity');
      await row.locator('.mod-mode').selectOption('custom');
      await row.locator('.mod-value').fill('8');
      await page.locator('#save-creature').click();
      await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Saved to this computer.');
      const expected = JSON.parse(JSON.stringify(reference));
      expected.stats.savingThrows[0].proficient = false; expected.stats.savingThrows[0].value = 8;
      assert.deepEqual(service.store.value.documents[2].data, expected);
      const saveExport = page.waitForEvent('download'); await page.locator('#export-creature').click();
      const output = path.join(directory, 'reference-edited-export.json'); await (await saveExport).saveAs(output);
      assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), expected);
      await page.locator('#copy-creature-json').click();
      await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('CritterDB JSON copied.'));
      assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), expected);
      assert.deepEqual(JSON.parse(fs.readFileSync(referenceFile, 'utf8')), reference);
      console.log('PASS supplied dragon: edit a save modifier, export/copy exact JSON, preserve Perception +16 and Cold Breath source; original unchanged');
    }
  } finally {
    if (browser) await browser.close();
    if (service.server.listening) await service.close();
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
