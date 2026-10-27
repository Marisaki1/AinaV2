// Isolated headless Brave, local fixtures only. No live Discord/CritterDB writes.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), os = require('os'), assert = require('node:assert/strict');
const { createService } = require('../src/critter/server'), { browserLaunchOptions } = require('../src/critter/remote-browser');
const C = require('../src/critter/public/core'), { bestiary } = require('../test/critter-fixture'), F = require('../test/mirror-fixture');
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-authoring-')), service = createService({ directory, port: 0, ownerId: F.owner, client: { isReady: () => true } });
  service.bridge.channels = async () => [{ id: F.channel, guildId: F.guild, guildName: 'Fixture server', channelName: 'combat', name: 'Fixture server / #combat' }];
  const ws = C.blankWorkspace(), original = bestiary(); ws.documents.push({ id: 'original', label: original.name, keys: ['dragon', 'tewi'], data: original }); service.store.save(ws, service.store.revision);
  let browser;
  try {
    await service.start(); browser = await chromium.launch({ ...browserLaunchOptions('brave'), headless: true });
    const context = await browser.newContext({ viewport: { width: 1560, height: 1050 }, acceptDownloads: true });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(service.url + '/#library'); await page.locator('#new-bestiary').click(); await page.locator('#create-name').fill('Created collection'); await page.locator('#create-description').fill('My collection'); await page.locator('#create-confirm').click(); await page.locator('#collection-name').waitFor();
    const doc = service.store.value.documents.find(d => d.data.name === 'Created collection'); assert.equal(doc.keys.length, 0);
    await page.locator('#collection-add').click(); assert.equal(await page.locator('#create-collection').inputValue(), doc.id);
    await page.locator('#create-name').fill('Created critter'); await page.locator('#create-confirm').click(); await page.locator('#editor-dialog[open]').waitFor();
    const key = service.store.value.documents.find(d => d.id === doc.id).keys[0];
    assert.equal(await page.locator('[data-editor-tab]').count(), 8);
    await page.locator('[data-editor-tab="race"]').click(); await page.locator('#creature-size').selectOption('Large'); await page.locator('[data-edit-path="stats.race"]').fill('Dragon');
    await page.locator('[data-editor-tab="defense"]').click(); await page.locator('[data-choice="base-damageResistances"][value="cold"]').check();
    await page.locator('[data-editor-tab="defaults"]').click(); await page.locator('#default-allSaves-all').selectOption('adv'); await page.locator('#default-abilities-strength').selectOption('dis');
    await page.locator('#editor-save').click(); await page.locator('#editor-error').filter({ hasText: /preview/ }).waitFor();
    await page.locator('#editor-traits-review').click(); await page.locator('#editor-traits-preview pre').waitFor(); await page.locator('#editor-save').click(); await page.locator('#editor-save-state').filter({ hasText: 'Saved in library' }).waitFor();
    assert.equal(service.store.value.combatTraits[key].traits.length, 2);
    let created = C.creatures(service.store.value).find(c => c.key === key).data; assert.deepEqual(created.stats.damageResistances, ['cold']); assert.equal(created.stats.size, 'Large');
    const hidden = created.stats.actions[0].description;
    await page.locator('[data-editor-tab="abilities"]').click(); await page.locator('[data-editor-section="actions"]').click(); await page.locator('#editor-add-ability').click();
    await page.locator('#build-name').fill('Test mixed strike'); await page.locator('#build-attackBonus').fill('8'); await page.locator('#damage-0-type').selectOption('fire');
    await page.locator('#build-damage-add').click(); await page.locator('#damage-1-count').fill('2'); await page.locator('#damage-1-sides').fill('17'); await page.locator('#damage-1-type').selectOption('cold');
    await page.locator('#build-preview').click(); await page.locator('#build-accept').click(); await page.locator('#editor-ability-name').waitFor();
    await page.locator('#editor-save').click(); await page.locator('#editor-save-state').filter({ hasText: 'Saved in library' }).waitFor();
    created = C.creatures(service.store.value).find(c => c.key === key).data; assert.equal(created.stats.actions[0].description, hidden); assert.match(created.stats.actions[1].description, /2d17/);
    await page.locator('#editor-add-ability').click(); await page.locator('#build-kind').selectOption('effect'); await page.locator('#build-name').fill('Test ward');
    await page.locator('[data-damage-remove]').click(); await page.locator('#build-target').selectOption('self'); await page.locator('#build-enabled').check(); await page.locator('#effect-duration').fill('3'); await page.locator('[data-choice="effect-resistances"][value="fire"]').check(); await page.locator('#effect-condition').selectOption('poisoned');
    await page.locator('#build-preview').click(); await page.locator('#build-accept').click(); await page.locator('#editor-save').click(); await page.locator('#editor-save-state').filter({ hasText: 'Saved in library' }).waitFor();
    created = C.creatures(service.store.value).find(c => c.key === key).data; assert.match(created.stats.actions[2].description, /duration: 3/); assert.match(created.stats.actions[2].description, /target: self/);
    await page.getByLabel('Effect duration in rounds', { exact: true }).fill('5');
    await page.locator('[data-choice^="mechanic-"][value="lightning"]').check();
    await page.locator('#editor-save').click(); await page.locator('#editor-save-state').filter({ hasText: 'Saved in library' }).waitFor();
    created = C.creatures(service.store.value).find(c => c.key === key).data; assert.match(created.stats.actions[2].description, /duration: 5/); assert.match(created.stats.actions[2].description, /lightning/);
    await page.locator('#editor-add-ability').click(); await page.locator('#build-name').fill('Test choice attack'); await page.locator('#damage-0-type').selectOption('choice'); await page.locator('[data-choice="damage-choices"][value="fire"]').check(); await page.locator('[data-choice="damage-choices"][value="cold"]').check();
    await page.locator('#build-preview').click(); await page.locator('#build-accept').click();
    await page.locator('#editor-add-ability').click(); await page.locator('#build-kind').selectOption('roll'); await page.locator('#build-name').fill('Test random roll'); await page.locator('#build-rollDice').fill('6d17'); await page.locator('#build-preview').click(); await page.locator('#build-accept').click();
    await page.locator('#editor-add-ability').click(); await page.locator('#build-kind').selectOption('effect'); await page.locator('#build-name').fill('Test ally ward'); await page.locator('[data-damage-remove]').click(); await page.locator('#build-enabled').check(); await page.locator('#effect-duration').fill('1'); await page.locator('#effect-durationUnit').selectOption('minutes'); await page.locator('[data-choice="effect-resistances"][value="cold"]').check(); await page.locator('#build-preview').click(); await page.locator('#build-accept').click();
    await page.locator('#editor-save').click(); await page.locator('#editor-save-state').filter({ hasText: 'Saved in library' }).waitFor();
    created = C.creatures(service.store.value).find(c => c.key === key).data; assert.match(created.stats.actions[5].description, /duration: 10/); assert.match(created.stats.actions[5].description, /target: each/);
    const event = page.waitForEvent('download'); await page.locator('#editor-export-bestiary').click(); const file = await event, exported = JSON.parse(fs.readFileSync(await file.path(), 'utf8')); assert.equal(exported.name, 'Created collection'); assert.equal(exported.creatures.length, 1); assert.deepEqual(exported.creatures[0], created);
    assert.deepEqual(service.store.value.documents[0].data, original);
    await page.screenshot({ path: path.join(os.tmpdir(), 'aina-critter-authoring.png'), fullPage: true });
    await page.locator('#editor-close').click(); await page.locator('#channel').selectOption(F.channel); await page.locator('[data-tab="initiative"]').click();
    for (const [sourceKey, name, score] of [['dragon', 'Dragon One', '18'], [key, 'Created Combatant', '12']]) {
      await page.locator('#init-source').selectOption(sourceKey); await page.locator('#init-name').fill(name); await page.locator('#init-method').selectOption('fixed'); await page.locator('#init-value').fill(score); await page.locator('#add-entry').click();
      await page.waitForFunction(n => document.querySelectorAll('[data-row]').length === n, sourceKey === 'dragon' ? 1 : 2);
    }
    await page.locator('[data-tab="combat"]').click(); await page.locator('[data-roster]').nth(1).click(); await page.locator('.ability-title').filter({ hasText: 'Test mixed strike' }).click(); await page.locator('[data-combat-target]').first().check(); assert.match(await page.locator('#command-lines pre').textContent(), / -t "Dragon One"/);
    await page.locator('.ability-title').filter({ hasText: 'Test choice attack' }).click(); await page.locator('#damage-choice').selectOption('cold'); assert.match(await page.locator('#command-lines pre').textContent(), /-choice "cold"/);
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#edit-creature').click(); await page.locator('[data-editor-tab="defense"]').click(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot({ path: path.join(os.tmpdir(), 'aina-critter-authoring-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS create/edit/export bestiary and creature, CritterDB sections, selected defenses, reviewed default modifiers, multiple damage dice/types, timed self effect, automation preservation, manual roster selection, initiative target checkboxes and mobile layout.');
    console.log('Local browser fixtures only; no live Discord commands or CritterDB writes.');
  } finally { await browser?.close(); await service.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
