// Manual roster and real searchable controls in isolated headless Brave. No Discord or CritterDB writes.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), os = require('os'), assert = require('node:assert/strict');
const { createService } = require('../src/critter/server'), { browserLaunchOptions } = require('../src/critter/remote-browser');
const C = require('../src/critter/public/core'), { creature } = require('../test/critter-fixture');
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-search-selects-')), service = createService({ directory, port: 0, client: { isReady: () => true } });
  service.bridge.channels = async () => Array.from({ length: 75 }, (_, i) => ({ id: 'channel' + i, guildId: 'server', guildName: 'Fixture server', channelName: 'battle-room-' + i, name: 'Fixture server / #battle-room-' + i }));
  const ws = C.blankWorkspace(), dragon = creature();
  dragon.stats.reactions.push({ name: 'Tail Counter', description: 'Existing reaction.' }); dragon.stats.legendaryActions.push({ name: 'Wing Attack', description: 'Existing legendary action.' }); dragon.stats.additionalAbilities.push({ name: 'Magic Resistance', description: 'Existing trait.' });
  ws.documents.push({ id: 'pack', label: 'Dragon pack', keys: ['dragon', 'tewi'], data: { name: 'Dragon pack', creatures: [dragon, C.blankCreature('Tewi Inaba')] } });
  ws.documents.push({ id: 'other', label: 'Catálogo of creatures', keys: ['duplicate', ...Array.from({ length: 60 }, (_, i) => 'extra' + i)], data: { name: 'Other pack', creatures: [C.blankCreature(dragon.name), ...Array.from({ length: 60 }, (_, i) => C.blankCreature('Creature ' + i))] } });
  service.store.save(ws, service.store.revision); let browser;
  try {
    await service.start(); browser = await chromium.launch({ ...browserLaunchOptions('brave'), headless: true });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } }), page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(new URL(r.url()).pathname)); page.on('dialog', d => d.accept());
    await page.goto(service.url + '/#mirror'); await page.locator('#init-source').waitFor({ state: 'attached' });
    assert.equal(await page.locator('[data-tab]').count(), 4); assert.equal(new URL(page.url()).hash, '#initiative'); assert.equal(await page.locator('#retrieve-initiative').count(), 0);
    const trigger = id => page.locator('.ss-control').filter({ has: page.locator('#' + id) }).locator('.ss-trigger');
    await trigger('init-source').click(); await page.getByRole('searchbox', { name: 'Filter Source creature', exact: true }).fill('catalogo'); assert.equal(await page.locator('.ss-option').count(), 61);
    await page.getByRole('searchbox', { name: 'Filter Source creature', exact: true }).fill('silver'); assert.equal(await page.locator('.ss-option').count(), 2);
    await page.locator('.ss-option[data-value="dragon"]').click(); assert.equal(await page.locator('#init-source').inputValue(), 'dragon');
    await trigger('init-source').click(); await page.locator('.ss-query').fill('no such creature'); await page.getByText('No matches', { exact: true }).waitFor(); assert.equal(await page.locator('#init-source').inputValue(), 'dragon'); await page.locator('.ss-query').press('Escape'); assert.equal(await page.locator('.ss-popup').count(), 0);
    await page.locator('#init-name').fill('Manual Dragon'); await trigger('init-method').click(); await page.locator('.ss-query').fill('fixed'); await page.locator('.ss-query').press('Enter'); await page.locator('#init-value').fill('18'); await page.locator('#add-entry').click(); await page.locator('[data-row]').waitFor();
    await trigger('init-source').click(); await page.locator('.ss-query').fill('tewi'); await page.locator('.ss-query').press('Enter'); await page.locator('#init-name').fill('Manual Tewi'); await page.locator('#init-value').fill('12'); await page.locator('#add-entry').click(); await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 2);
    assert.equal(service.store.value.currentEncounter.entries[0].sourceKey, 'dragon'); assert.equal(service.store.value.currentEncounter.entries[1].sourceKey, 'tewi');
    await trigger('channel').click(); await page.locator('.ss-query').fill('room-64'); await page.locator('.ss-query').press('Enter'); assert.equal(await page.locator('#channel').inputValue(), 'channel64');
    await page.locator('[data-tab="combat"]').click(); await page.locator('.ability-title').first().click(); await page.locator('[data-combat-target][value="Manual Tewi"]').check(); assert.match(await page.locator('#command-lines pre').textContent(), /!i aoo "Manual Dragon" "Cold Breath" -t "Manual Tewi"/);
    for (const [category, title] of [['reactions', 'Tail Counter'], ['legendaryActions', 'Wing Attack'], ['additionalAbilities', 'Magic Resistance']]) { await page.locator('[data-category="' + category + '"]').click(); await page.locator('.ability-title').getByText(title, { exact: true }).waitFor(); }
    await page.locator('#edit-creature').click(); await page.locator('[data-editor-tab="race"]').click(); await trigger('creature-size').click(); await page.locator('.ss-query').fill('garg'); await page.locator('.ss-query').press('Escape'); assert(await page.locator('#editor-dialog').isVisible());
    await trigger('creature-size').click(); await page.locator('.ss-query').fill('garg'); await page.locator('.ss-query').press('Enter'); assert.equal(await page.locator('#creature-size').inputValue(), 'Gargantuan');
    await page.locator('[data-editor-tab="abilities"]').click(); await page.locator('[data-editor-section="actions"]').click(); await page.locator('#editor-ability-list button[data-editor-ability]').first().click();
    const typeSelect = page.locator('#editor-ability-detail select').filter({ has: page.locator('option[value="cold"]') }).first(), typeId = await typeSelect.evaluate(n => { n.id ||= 'test-damage-type'; return n.id; });
    await trigger(typeId).click(); await page.locator('.ss-query').fill('lightning'); await page.locator('.ss-query').press('Enter'); assert.equal(await typeSelect.inputValue(), 'lightning');
    await page.locator('#editor-close').click(); await page.locator('#save-state').filter({ hasText: 'Choices saved' }).waitFor(); await page.reload(); await page.locator('#channel option[value="channel64"]').waitFor({ state: 'attached' }); assert.equal(await page.locator('#channel').inputValue(), 'channel64');
    await page.evaluate(() => { const label = document.createElement('label'); label.textContent = 'Test selector'; label.innerHTML += '<select id="test-selector"><option value="a">Alpha</option><option value="blocked" disabled>Blocked</option><option value="b">Beta</option></select>'; document.querySelector('#content-panel').prepend(label); });
    await trigger('test-selector').click(); await page.locator('.ss-query').press('ArrowDown'); await page.locator('.ss-query').press('Enter'); assert.equal(await page.locator('#test-selector').inputValue(), 'b');
    await page.locator('#test-selector').evaluate(n => n.disabled = true); await page.waitForFunction(() => document.querySelector('#test-selector').parentElement.querySelector('.ss-trigger').disabled); await page.locator('#test-selector').evaluate(n => n.disabled = false);
    await trigger('test-selector').click(); await page.locator('.ss-query').fill('gamma'); await page.getByText('No matches', { exact: true }).waitFor(); await page.locator('#test-selector').evaluate(n => n.add(new Option('Gamma', 'g'))); await page.locator('.ss-option[data-value="g"]').click(); assert.equal(await page.locator('#test-selector').inputValue(), 'g');
    await page.locator('[data-tab="initiative"]').click(); await trigger('init-source').click(); await page.locator('.ss-query').fill('silver'); await page.screenshot({ path: path.join(os.tmpdir(), 'aina-searchable-roster.png'), fullPage: true }); await page.locator('.ss-query').press('Escape');
    await page.setViewportSize({ width: 390, height: 844 }); await trigger('init-source').click(); const bounds = await page.locator('.ss-popup').boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= 391 && bounds.y >= 0 && bounds.y + bounds.height <= 845); await page.screenshot({ path: path.join(os.tmpdir(), 'aina-searchable-roster-mobile.png'), fullPage: true });
    assert(!requests.some(p => p.startsWith('/api/mirror'))); assert.deepEqual(errors, []);
    console.log('PASS manual roster, full source abilities, filtered creature/bestiary/channel/damage choices, duplicate names, accent folding, no matches, keyboard/Escape, disabled/dynamic options, persistence, mobile popup and no encounter-export requests.');
  } finally { await browser?.close(); await service.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
