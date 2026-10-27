// Archived: the encounter-export UI was removed in favor of manual roster selection.
// Use npm.cmd run test:critter:manual for the current workflow.
// Local browser + Discord-shaped fixtures only. No live Discord messages or encounter changes.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), os = require('os'), assert = require('node:assert/strict');
const { createService } = require('../src/critter/server'), { browserLaunchOptions } = require('../src/critter/remote-browser'), { AVRAE_ID } = require('../src/critter/mirror');
const C = require('../src/critter/public/core'), F = require('../test/mirror-fixture'), { creature } = require('../test/critter-fixture');
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-mirror-browser-')); let browser, expected;
  const service = createService({ directory, port: 0, ownerId: F.owner, client: { isReady: () => true }, mirrorVerifier: async () => ({ author_id: F.owner, channel_id: expected.channelId, guild_id: F.guild, message_id: expected.requestId, timestamp: Date.now()/1000, scope: 'PERSONAL_ALIAS' }) });
  service.bridge.channels = async () => [{ id: F.channel, guildId: F.guild, guildName: 'Fixture server', channelName: 'encounter-one', name: 'Fixture server / #encounter-one' }, { id: F.otherChannel, guildId: F.guild, guildName: 'Fixture server', channelName: 'encounter-two', name: 'Fixture server / #encounter-two' }];
  const ws = C.blankWorkspace(); ws.documents.push({ id: 'dragon-doc', label: 'Test dragon', data: creature(), keys: ['dragon'] }); service.store.save(ws, service.store.revision);
  try {
    await service.start(); browser = await chromium.launch({ ...browserLaunchOptions('brave'), headless: true });
    const context = await browser.newContext({ viewport: { width: 1680, height: 1150 }, acceptDownloads: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: service.url });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(service.url + '/#mirror'); await page.locator('#channel option[value="' + F.channel + '"]').waitFor({ state: 'attached' }); await page.locator('#channel').selectOption(F.channel);
    await page.locator('#mirror-configure').click(); await page.locator('#message').filter({ hasText: /Source configured/ }).waitFor();
    const key = F.guild + ':' + F.channel;
    const aliasEvent = page.waitForEvent('download'); await page.locator('#mirror-alias').click(); const alias = await aliasEvent;
    assert.match(fs.readFileSync(await alias.path(), 'utf8'), new RegExp(F.owner)); assert(!fs.readFileSync(await alias.path(), 'utf8').includes('__OWNER_ID__'));
    await page.locator('#mirror-refresh').click(); await page.locator('.mirror-export-command pre').waitFor();
    const request = service.mirror.location(key).request, snapshot = F.snapshot(); expected = snapshot;
    await service.mirror.onMessage({ id: snapshot.requestId, guildId: F.guild, channelId: F.channel, author: { id: F.owner, bot: false }, content: request.command });
    for (const part of F.fragments(snapshot, request.nonce)) await service.mirror.onMessage({ id: F.requestId(), guildId: F.guild, channelId: F.channel, author: { id: AVRAE_ID, bot: true }, content: '', embeds: [{ title: 'AINA-SNAPSHOT/1', description: JSON.stringify(part) }] });
    await page.locator('#mirror-review').waitFor(); assert(!service.mirror.location(key).snapshot); await page.locator('#mirror-review').click(); await page.locator('#mirror-accept').click();
    await page.locator('[data-mirror-actor="copy-one"]').waitFor(); assert.equal(await page.locator('.current-turn[data-mirror-actor]').count(), 2);
    await page.locator('[data-mirror-actor="copy-one"]').click(); await page.locator('#mirror-unit h2').getByText('Dragon One', { exact: true }).waitFor();
    assert.deepEqual(await page.locator('.mirror-stat-grid strong').allTextContents(), ['0', '100', '0', '20']); assert.match(await page.locator('#mirror-unit').textContent(), /0 rounds remaining/);
    await page.locator('#mirror-action').fill('Bite'); await page.locator('[data-mirror-target="copy-two"]').first().check(); await page.locator('#mirror-critical').selectOption('crit'); await page.locator('#mirror-attackBonus').fill('-2'); await page.locator('#mirror-damageBonus').fill('1d6[fire]');
    assert.equal(await page.locator('#mirror-preview pre').textContent(), '!i aoo "Dragon One" "Bite" -t "Dragon \\"Two\\"" crit -b "-2" -d "1d6[fire]" -rr 1');
    assert.notEqual(await page.locator('#mirror-scope option[value="current"]').getAttribute('disabled'), null, await page.locator('#mirror-scope').evaluate(n => n.outerHTML));
    const original = C.clone(service.mirror.location(key).snapshot); await page.locator('#mirror-copy').click(); await page.locator('#message').filter({ hasText: /Copied for/ }).waitFor();
    assert.deepEqual(service.mirror.location(key).snapshot, original); assert.equal(service.store.value.history[0].status, 'copied'); assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^!i aoo "Dragon One"/);
    await page.locator('#mirror-favorite').click(); await page.locator('#message').filter({ hasText: /Favorite saved/ }).waitFor(); assert.equal(service.store.value.favorites[0].mirrorKey, key);
    await page.locator('[data-mirror-actor="copy-two"]').click(); assert.deepEqual(await page.locator('.mirror-stat-grid strong').allTextContents(), ['Hidden', 'Hidden', 'Hidden', 'Hidden']);
    await page.locator('#mirror-kind').selectOption('source'); await page.locator('#mirror-action').fill('Bite'); assert.match(await page.locator('#mirror-preview').textContent(), /source creature name is hidden/);
    await page.locator('#mirror-filter').selectOption('zero'); assert.equal(await page.locator('[data-mirror-actor]').count(), 1); await page.locator('#mirror-filter').selectOption('');
    await page.locator('[data-mirror-actor="copy-one"]').click(); await page.locator('#mirror-kind').selectOption('hp'); await page.locator('#mirror-value').fill('-9');
    assert.equal(await page.locator('#mirror-preview pre').textContent(), '!i hp "Dragon One" -9'); assert.equal(service.mirror.location(key).snapshot.combatants[0].hp.value, 0);
    await page.locator('#mirror-kind').selectOption('save'); assert.equal(await page.locator('#mirror-preview pre').textContent(), '!i os "Dragon One" dex'); assert.equal(await page.locator('#mirror-critical').count(), 0);
    await page.locator('#mirror-kind').selectOption('end'); assert.match(await page.locator('#mirror-preview').textContent(), /Confirm ending/); await page.locator('#mirror-end-prepare').click(); await page.locator('#mirror-end-confirm').click(); assert.equal(await page.locator('#mirror-preview pre').textContent(), '!init end');
    await page.locator('#mirror-kind').selectOption('action'); await page.locator('#mirror-action').fill('Bite');
    await page.screenshot({ path: path.join(os.tmpdir(), 'aina-encounter-mirror.png'), fullPage: true });
    // Manual fallback in a second channel remains isolated and requires explicit review.
    await page.locator('#channel').selectOption(F.otherChannel); await page.locator('#mirror-configure').click(); await page.locator('#message').filter({ hasText: /Source configured/ }).waitFor();
    const other = F.snapshot(F.otherChannel); other.name = 'Other encounter'; other.combatants[0].name = 'Other channel actor';
    await page.locator('#mirror-import').setInputFiles({ name: 'snapshot.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(other)) }); await page.locator('#mirror-review').click(); assert.match(await page.locator('#mirror-review-root').textContent(), /Manual import/); await page.locator('#mirror-accept').click();
    await page.locator('[data-mirror-actor="copy-one"]').waitFor(); assert.match(await page.locator('[data-mirror-actor="copy-one"]').textContent(), /Other channel actor/);
    await page.locator('#mirror-location').selectOption(key); await page.locator('[data-mirror-actor="copy-one"]').filter({ hasText: 'Dragon One' }).waitFor(); assert.equal(service.mirror.location(key).snapshot.combatants[0].name, 'Dragon One');
    // Simulated fresh export after a hypothetical user command. No real Avrae execution is claimed.
    const newer = F.snapshot(); newer.combatants[0].name = 'Dragon Renamed'; newer.combatants[0].hp.value = 25; newer.combatants.pop(); newer.groups[0].members.pop();
    await page.locator('#mirror-import').setInputFiles({ name: 'refresh.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) }); await page.locator('#mirror-review').click(); assert.match(await page.locator('#mirror-review-root').textContent(), /previously Dragon One/); await page.locator('#mirror-accept').click();
    await page.locator('[data-mirror-actor="copy-one"]').filter({ hasText: 'Dragon Renamed' }).waitFor(); assert.equal(await page.locator('[data-mirror-actor]').count(), 1); assert.equal(await page.locator('.mirror-stat-grid strong').first().textContent(), '25'); assert.match(await page.locator('#mirror-preview').textContent(), /latest snapshot/); await page.locator('[data-mirror-target="copy-one"]').first().check(); assert.match(await page.locator('#mirror-preview pre').textContent(), /"Dragon Renamed"/);
    assert(service.store.value.history.every(h => h.status !== 'execution confirmed')); assert.deepEqual(service.store.value.documents[0].data, creature());
    await page.setViewportSize({ width: 540, height: 980 }); await page.screenshot({ path: path.join(os.tmpdir(), 'aina-encounter-mirror-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []); console.log('PASS browser alias download, requested multipart bridge/review, grouped turns, hidden/zero values, actor/target commands, crit and bonuses, copy without mutation, favorites/history, explicit end confirmation, channel separation, manual refresh/rename/removal and narrow layout.');
    console.log('Local browser and Discord-shaped fixtures only; actual user-issued Discord/Avrae refresh remains untested.');
  } finally { if (browser) await browser.close(); if (service.server.listening) await service.close(); const resolved = path.resolve(directory); assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'aina-mirror-browser-')); fs.rmSync(resolved, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
