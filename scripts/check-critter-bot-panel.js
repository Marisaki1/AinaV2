// Headless Edge against loopback fixtures only. No Brave window, user profile, or Discord traffic.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { createService } = require('../src/critter/server');
const C = require('../src/critter/public/core');
const { creature } = require('../test/critter-fixture');
const CHANNEL = '222222222222222222', THREAD = '333333333333333333';
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-bot-panel-'));
  const client = { isReady: () => true, user: { id: '444444444444444444', username: 'Aina' } };
  const service = createService({ directory, port: 0, client });
  const channels = [{ id: CHANNEL, guildId: 'server', guildName: 'Local fixture', channelName: 'combat', displayName: '#combat', name: 'Local fixture / #combat' },
    { id: THREAD, guildId: 'server', guildName: 'Local fixture', channelName: 'Sanae', displayName: '#combat / Sanae', name: 'Local fixture / #combat / Sanae', thread: true }];
  service.bridge.channels = async () => channels;
  const posts = [], errors = [], external = [];
  service.bridge.post = async (channelId, commands) => { posts.push({ channelId, commands }); return commands.map(command => ({ command, messageId: '555555555555555555', guildId: '666666666666666666', posted: true })); };
  const ws = C.blankWorkspace();
  ws.preferences.channelId = CHANNEL;
  ws.documents.push({ id: 'pack', label: 'Dragon pack', keys: ['dragon'], data: { name: 'Dragon pack', creatures: [creature()] } });
  ws.sender.buttons = [{ id: 'roll', label: 'Roll a d20', text: '!r 1d20' }, { id: 'book', label: 'Update bestiary', text: '!bestiary update' }];
  ws.currentEncounter.entries.push({ id: 'dragon-entry', name: 'Silver', sourceName: creature().name, sourceKey: 'dragon', quantity: '1', fixedInitiative: '19' });
  service.store.save(ws, service.store.revision);
  let browser;
  try {
    await service.start();
    browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === service.url) return route.continue(); external.push(url.origin); return route.abort(); });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(service.url + '/#sender');
    await page.locator('#channel option[value="' + CHANNEL + '"]').waitFor({ state: 'attached' });
    await page.locator('#sender-custom-send:not([disabled])').waitFor();
    assert.equal(await page.locator('#sender-connect,#sender-repair,#sender-password,[data-malow-send]').count(), 0);
    assert.equal(await page.locator('#selection-panel').isVisible(), false);
    await page.locator('#sender-search').fill('bestiary');
    assert.equal(await page.locator('[data-sender-button]').count(), 1);
    await page.locator('#sender-search').fill('');
    await page.locator('#sender-custom').fill('!r 1d20');
    await page.locator('#sender-custom-send').dblclick();
    await page.getByText('Posted as Aina', { exact: true }).waitFor();
    assert.equal(posts.length, 1); assert.equal(posts[0].channelId, CHANNEL);
    const trigger = page.locator('.ss-control').filter({ has: page.locator('#channel') }).locator('.ss-trigger');
    await trigger.click(); await page.locator('.ss-query').fill('sanae'); await page.locator('.ss-query').press('Enter');
    assert.equal(await page.locator('#channel').inputValue(), THREAD);
    await page.locator('#sender-destination').filter({ hasText: 'Sanae' }).waitFor();
    await page.locator('#sender-add').click(); await page.locator('#sender-label').fill('Show initiative');
    await page.locator('#sender-text').fill('!i list'); await page.locator('#sender-editor-save').click();
    await page.locator('[data-sender-button]').filter({ hasText: 'Post' }).nth(2).waitFor();
    assert.equal(posts.length, 1);
    await page.locator('#save-state').filter({ hasText: 'Choices saved' }).waitFor();
    await page.reload(); await page.locator('#sender-custom-send:not([disabled])').waitFor();
    assert.equal(await page.locator('#channel').inputValue(), THREAD);
    assert.equal(await page.locator('[data-sender-button]').count(), 3);
    await page.screenshot({ path: path.join(directory, 'commands-desktop.png'), fullPage: true });
    await page.locator('[data-tab="combat"]').click(); await page.locator('#combat-ability-board [data-pane-entry]').first().click();
    await page.locator('.bonus-disclosure>summary').click(); await page.locator('#damage-bonus').waitFor(); assert.equal(await page.locator('[data-malow-send]').count(), 0);
    await page.locator('#damage-bonus').fill('1d6[fire]');
    assert.match(await page.locator('#command-lines').textContent(), /1d6\[fire\]/);
    await page.screenshot({ path: path.join(directory, 'combat-desktop.png'), fullPage: true });
    await page.locator('[data-tab="sender"]').click();
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#sender-custom').waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(directory, 'commands-mobile.png'), fullPage: true });
    await page.locator('#theme').click(); await page.screenshot({ path: path.join(directory, 'commands-dark.png'), fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ result: 'PASS', checks: ['one bot post on double-click','shared searchable thread destination','saved shortcut persistence','combat modifiers','desktop/mobile/dark layouts','no account controls','no external requests'], screenshots: directory, posts: posts.length }));
  } finally {
    await browser?.close(); await service.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

