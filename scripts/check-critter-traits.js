// Local fixture only. No Discord posts and no CritterDB writes.
const { chromium } = require('playwright'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { createService } = require('../src/critter/server'), { browserLaunchOptions } = require('../src/critter/remote-browser');
const { creature } = require('../test/critter-fixture'), T = require('../src/critter/public/combat-traits'), C = require('../src/critter/public/core');
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-traits-ui-')), service = createService({ directory, port: 0 }); let browser;
  try {
    await service.start(); browser = await chromium.launch({ ...browserLaunchOptions('brave'), headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true }), page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(service.url); await page.locator('#load-files').waitFor();
    await page.locator('#import-files').setInputFiles({ name: 'TestDragon.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(creature())) });
    await page.locator('[data-source]').waitFor(); await page.locator('[data-category="combatTraits"]').click();
    async function add(rules, scope, selected, mode = 'adv', restriction = '') {
      await page.locator('#trait-add').click(); const index = await page.locator('[data-trait-field="rules"]').count() - 1;
      await page.locator(`[data-trait-field="rules"][data-trait-index="${index}"]`).fill(rules);
      await page.locator(`[data-trait-field="scope"][data-trait-index="${index}"]`).selectOption(scope);
      await page.locator(`[data-trait-field="mode"][data-trait-index="${index}"]`).selectOption(mode);
      for (const value of selected) await page.locator(`[data-trait-select="${index}"][value="${value}"]`).check();
      if (restriction) await page.locator(`[data-trait-field="restriction"][data-trait-index="${index}"]`).fill(restriction);
    }
    await add('Dexterity save advantage', 'saves', ['dexterity']);
    await add('Perception disadvantage', 'skills', ['perception'], 'dis');
    await add('Saves against spells only', 'allSaves', [], 'adv', 'Against spells');
    await add('Base Strength check advantage', 'abilities', ['strength']);
    await page.locator('#trait-review').click(); await page.locator('#trait-confirm').waitFor();
    assert.match(await page.locator('.trait-code').textContent(), /save_adv:\s+- dexterity/); assert(!/save_adv:[\s\S]*?strength/.test((await page.locator('.trait-code').textContent()).split('</avrae>')[0].split('<avrae hidden>')[1]));
    await page.route('**/api/combat-traits', route => route.abort()); await page.locator('#trait-confirm').click(); await page.locator('#message').filter({ hasText: /Cannot reach Aina/ }).waitFor();
    await page.reload(); await page.locator('[data-trait-field="rules"]').first().waitFor({ state: 'attached' }); assert.equal(await page.locator('[data-trait-field="rules"]').count(), 4);
    await page.unroute('**/api/combat-traits'); await page.locator('#trait-review').click(); await page.locator('#trait-confirm').click(); await page.locator('#message').filter({ hasText: /Traits saved locally/ }).waitFor();
    await page.locator('#trait-update').click(); assert.equal(await page.locator('#command-lines pre').textContent(), '!bestiary update');
    const key = service.store.value.documents[0].keys[0], cfg = service.store.value.combatTraits[key], stored = service.store.value.documents[0].data;
    assert.deepEqual(stored.stats.actions[0], creature().stats.actions[0]); assert.deepEqual(stored.extra, creature().extra);
    await page.screenshot({ path: path.join(os.tmpdir(), 'aina-combat-traits.png'), fullPage: true });
    await page.locator('[data-tab="initiative"]').click(); await page.locator('#init-source').selectOption(key); await page.locator('#init-name').fill('TestDragon#'); await page.locator('#init-quantity').fill('2'); await page.locator('#init-roll').selectOption('adv'); await page.locator('#add-entry').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 2);
    const setup = await page.locator('#command-lines pre').allTextContents(); assert.equal(setup.length, 4); assert.match(setup[0], /-name "TestDragon1" adv$/); assert.match(setup[1], /-name "TestDragon2" adv$/); assert.equal(setup[2], T.setup(cfg, 'TestDragon1')); assert.equal(setup[3], T.setup(cfg, 'TestDragon2'));
    await page.locator('[data-tab="combat"]').click(); await page.locator('[data-category="combatTraits"]').click(); await page.locator('#trait-remove').click(); assert.equal(await page.locator('#command-lines pre').textContent(), T.remove(cfg, 'TestDragon1'));
    await page.locator('#trait-setup').click(); assert.equal(await page.locator('#command-lines pre').textContent(), T.setup(cfg, 'TestDragon1')); assert.match(await page.locator('#content-panel .trait-state').textContent(), /Application status unknown/);
    await page.locator('[data-category="saves"]').click(); await page.locator('[data-roll-stat="dex"]').click(); assert.equal(await page.locator('#command-lines pre').textContent(), '!i os "TestDragon1" dex');
    assert.equal(await page.locator('[data-trait-condition]').count(), 1); await page.locator('[data-trait-condition]').check(); assert.equal(await page.locator('#command-lines pre').textContent(), '!i os "TestDragon1" dex adv');
    await page.locator('[data-roll-stat="con"]').click(); assert(!(await page.locator('[data-trait-condition]').isChecked())); assert.equal(await page.locator('#command-lines pre').textContent(), '!i os "TestDragon1" con');
    await page.locator('[data-category="checks"]').click(); await page.locator('[data-roll-stat="str"]').click(); assert.equal(await page.locator('#command-lines pre').textContent(), '!i oc "TestDragon1" strength adv');
    await page.locator('[data-roll-stat="Perception"]').click(); assert.equal(await page.locator('#command-lines pre').textContent(), '!i oc "TestDragon1" perception'); // Disadvantage comes from live effect, never duplicated into base stats.
    await page.locator('#roll-context').selectOption('lookup'); assert.equal(await page.locator('#command-lines pre').textContent(), '!mc "Ancient Silver Dragon" Perception');
    await page.locator('[data-tab="library"]').click(); const event = page.waitForEvent('download'); await page.locator('#export-creature').click(); const download = await event;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8')); assert.deepEqual(exported, stored); assert.deepEqual(C.importData(exported).data, stored);
    const output = path.join(os.tmpdir(), 'aina-traits-generated-actions.json'); const { preview } = require('../src/critter/combat-traits');
    fs.writeFileSync(output, JSON.stringify([preview(creature(), cfg, null).automation, preview(creature(), { ...cfg, traits: [] }, null).automation], null, 2));
    assert.deepEqual(errors, []); console.log('PASS trait form/review, failed-save recovery, preservation/export, copies/setup order, initial initiative advantage, conditional live rolls, base-only scope, removal/reapplication previews, and unknown status.'); console.log('Generated action fixtures: ' + output); console.log('Local browser tests only; no live Discord execution or CritterDB save.');
  } finally { if (browser) await browser.close(); if (service.server.listening) await service.close(); const resolved = path.resolve(directory); assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'aina-traits-ui-')); fs.rmSync(resolved, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
