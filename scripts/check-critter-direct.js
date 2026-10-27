// Main-editor UI with an authenticated-transport fixture. No live CritterDB writes.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), os = require('os'), assert = require('node:assert/strict');
const { createService } = require('../src/critter/server'), { browserLaunchOptions, RemoteError } = require('../src/critter/remote-browser');
const C = require('../src/critter/public/core'), R = require('../src/critter/public/remote-common'), { bestiary } = require('../test/critter-fixture');
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-direct-ui-')), pack = bestiary(); pack.creatures[0]._id = '111111111111111111111111';
  const original = C.clone(pack), transport = { value: C.clone(pack.creatures[0]), writes: 0, auth: true,
    async probe() { return { state: this.auth ? 'connected' : 'sign_in_required', message: 'Fixture account connection' }; },
    async connect() { this.auth = true; return this.probe(); },
    async read() { if (!this.auth) throw new RemoteError('sign_in_required'); return C.clone(this.value); },
    async writeChecked(id, expected, candidate) { if (!this.auth) throw new RemoteError('sign_in_required'); if (!R.equal(this.value, expected)) throw new RemoteError('conflict'); this.writes++; this.value = C.clone(candidate); return C.clone(this.value); }
  };
  const service = createService({ directory, port: 0, remoteTransport: transport }), ws = C.blankWorkspace(); ws.documents.push({ id: 'pack', keys: ['dragon', 'other'], label: pack.name, data: pack }); service.store.save(ws, service.store.revision);
  let browser;
  try {
    await service.start(); browser = await chromium.launch({ ...browserLaunchOptions('brave'), headless: true });
    const context = await browser.newContext({ viewport: { width: 1560, height: 1050 } }), page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(service.url + '/#library'); await page.locator('[data-edit-ability]').first().click(); await page.locator('#editor-ability-name').fill('Edited breath'); await page.locator('#editor-save-action').click();
    await page.locator('#editor-save-state').filter({ hasText: 'Saved in library' }).waitFor(); assert(await page.locator('#editor-dialog .toast').filter({ hasText: 'saved locally' }).isVisible()); assert.equal(transport.writes, 0);
    await page.locator('#editor-remote-save').click(); await page.locator('#direct-review').click(); await page.locator('#direct-confirm-save:enabled').waitFor();
    assert.equal(service.store.value.documents.length, 1); await page.locator('#direct-confirm-save').click(); await page.locator('#direct-state').filter({ hasText: 'Saved to CritterDB and verified' }).waitFor();
    assert.equal(transport.writes, 1); assert.equal(transport.value.stats.actions[0].name, 'Edited breath'); assert.equal(C.splitDescription(transport.value.stats.actions[0].description).blocks[0].raw, C.splitDescription(original.creatures[0].stats.actions[0].description).blocks[0].raw);
    assert(await page.locator('#direct-dialog .toast').filter({ hasText: 'Saved to CritterDB' }).isVisible());
    await page.locator('#direct-close').click(); await page.locator('#editor-ability-name').fill('Second local edit'); await page.locator('#editor-remote-save').click(); await page.locator('#direct-review').click(); await page.locator('#direct-confirm-save:enabled').waitFor();
    transport.value.stats.armorClass = 99; await page.locator('#direct-confirm-save').click(); await page.locator('#direct-state').filter({ hasText: 'Conflict' }).waitFor(); assert.equal(transport.writes, 1); assert(await page.locator('#direct-dialog .toast-error').isVisible());
    transport.auth = false; await page.locator('#direct-review').click(); await page.locator('#direct-state').filter({ hasText: 'Sign-in required' }).waitFor(); assert.equal(service.remote.view().workspace.documents[0].data.creatures[0].stats.actions[0].name, 'Second local edit');
    assert.equal(await page.locator('#direct-connect').count(), 0);
    transport.auth = true; await page.locator('#direct-check').click(); await page.locator('#direct-state').filter({ hasText: 'Connected to CritterDB', exact: true }).waitFor();
    await page.locator('#direct-close').click(); await page.locator('#editor-close').click(); await page.locator('#clear-library').click(); await page.locator('#clear-confirm').click(); await page.waitForFunction(() => document.querySelectorAll('[data-source]').length === 1);
    assert.equal(service.store.value.documents[0].data.creatures[0].name, 'Tewi Inaba'); assert.equal(transport.writes, 1); assert(fs.readdirSync(path.join(directory, 'library-backups')).length === 1);
    await page.locator('#clear-library').click(); await page.locator('#clear-scope').selectOption('all'); await page.locator('#clear-confirm').click(); await page.waitForFunction(() => document.querySelectorAll('[data-source]').length === 0);
    assert.equal(service.store.value.documents.length, 0); assert.equal(service.remote.links().length, 0); assert.equal(transport.writes, 1); assert(fs.readdirSync(path.join(directory, 'library-backups')).length === 2);
    assert.deepEqual(errors, []); console.log('PASS main-editor local action popup, same-entry remote review/save/verification popup, hidden YAML preservation, conflict/auth recovery, selected/all clear and automatic recovery backups. Local fixtures only.');
  } finally { await browser?.close(); await service.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
