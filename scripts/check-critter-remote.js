// Local browser integration test. The CritterDB host below is a fixture, not the live site.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const assert = require('node:assert/strict');
const { createService } = require('../src/critter/server');
const { CritterBrowser, browserLaunchOptions } = require('../src/critter/remote-browser');
const testChannel = process.env.CRITTER_TEST_BROWSER_CHANNEL || 'msedge';
const { creature } = require('../test/critter-fixture');
const ID = '111111111111111111111111', OTHER = '333333333333333333333333', COLLECTION = '222222222222222222222222';
const URL = `https://critterdb.com/#/creature/edit/${ID}`;
const copy = v => JSON.parse(JSON.stringify(v));

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-remote-browser-'));
  const original = { ...creature(), _id: ID, bestiaryId: COLLECTION, __v: 0 };
  const fixture = { value: copy(original), writes: 0, reads: 0, failAfterWrite: false };
  const loginHTML = `<!doctype html><html><body><h1>Local CritterDB test fixture</h1><button id="test-sign-in">Test sign in</button><script>
    document.querySelector('#test-sign-in').onclick=()=>document.cookie='fixture-auth=yes; path=/; max-age=86400';
    const auth={isLoggedIn:()=>document.cookie.includes('fixture-auth=yes'),executeOnLogin:fn=>setTimeout(fn,0)};
    const request=async(method,url,data,options={})=>{const params=new URLSearchParams(options.params||{});const response=await fetch(url+(params.size?'?'+params:''),{method,headers:{'Content-Type':'application/json','x-access-token':'fixture-browser-only-session',...(options.headers||{})},body:data?JSON.stringify(data):undefined});const raw=await response.text();let body;try{body=JSON.parse(raw);}catch{body=raw;}if(!response.ok)throw {status:response.status,data:body};return {data:body};};
    const http={get:(url,options)=>request('GET',url,null,options),put:(url,data,options)=>request('PUT',url,data,options)};
    const injector={has:n=>n==='Auth'||n==='$http',get:n=>n==='Auth'?auth:http};
    window.angular={element:()=>({injector:()=>injector})};
  </script></body></html>`;
  const server = http.createServer(async (request, response) => {
    const url = new global.URL(request.url, 'http://fixture');
    const reply = (code, value) => { response.writeHead(code, { 'Content-Type': typeof value === 'string' ? 'text/html' : 'application/json' }); response.end(typeof value === 'string' ? value : JSON.stringify(value)); };
    if (url.pathname === '/') return reply(200, loginHTML);
    if (url.pathname === '/api/revokeauthentication') { response.setHeader('Set-Cookie', 'fixture-auth=; Path=/; Max-Age=0'); return reply(200, {}); }
    if (!request.headers.cookie?.includes('fixture-auth=yes')) return reply(400, 'No token provided.');
    if (url.pathname === '/api/authenticate/user') return reply(200, { _id: 'fixture-owner' });
    if (url.pathname === '/api/bestiaries/' + COLLECTION) return reply(200, { ownerId: 'fixture-owner' });
    if (url.pathname === '/api/bestiaries/other') return reply(200, { ownerId: 'someone-else' });
    if (url.pathname === '/api/creatures/' + OTHER) return reply(200, { ...original, _id: OTHER, bestiaryId: 'other', sharing: { linkSharingEnabled: true } });
    if (url.pathname === '/api/creatures/' + ID && request.method === 'GET') { fixture.reads++; return reply(200, fixture.value); }
    if (url.pathname === '/api/creatures/' + ID && request.method === 'PUT') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      fixture.value = JSON.parse(Buffer.concat(chunks).toString('utf8')); fixture.value.__v++;
      fixture.writes++;
      if (fixture.failAfterWrite) { fixture.failAfterWrite = false; return reply(500, 'Simulated response failure after persistence'); }
      return reply(200, fixture.value);
    }
    return reply(404, 'Creature not found');
  });
  let browser, service, transport;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    transport = new CritterBrowser({ profileDirectory: path.join(root, 'profile'), channel: testChannel, headless: true, origin });
    let windowRequests = 0;
    const showWindow = transport.showWindow.bind(transport);
    transport.showWindow = async () => { windowRequests++; await showWindow(); };
    service = createService({ directory: path.join(root, 'workspace'), port: 0, remoteTransport: transport });
    await service.start();
    browser = await chromium.launch({ ...browserLaunchOptions(testChannel), headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto(service.url + '/advanced?critter=' + encodeURIComponent(URL));
    await page.locator('#remote-url').waitFor();
    await page.waitForFunction(() => document.querySelector('#remote-url').value.includes('111111111111111111111111'));
    assert.equal(await page.locator('#remote-connect').count(), 0);
    await transport.connect(); // Headless loopback fixture only; the interface cannot launch it.
    await page.locator('#remote-check').click();
    await page.locator('#remote-connection-state').getByText('Sign-in required', { exact: true }).waitFor();
    await transport.page.locator('#test-sign-in').click();
    await page.locator('#remote-check').click();
    await page.locator('#remote-connection-state').getByText('Connected', { exact: true }).waitFor();
    assert.equal(windowRequests, 1);
    await page.route('**/api/remote/status', route => route.abort());
    await page.locator('#remote-check').click();
    await page.locator('#remote-connection-state').getByText('Failed', { exact: true }).waitFor();
    await page.unroute('**/api/remote/status');
    await page.locator('#remote-check').click();
    await page.locator('#remote-connection-state').getByText('Connected', { exact: true }).waitFor();
    assert.equal(windowRequests, 1);
    console.log('PASS connection checks never launch or activate a browser; headless local fixture only');
    await page.locator('#remote-load').click();
    await page.locator('#remote-creature-state').getByText('Loaded', { exact: true }).waitFor();
    assert.equal(service.store.value.documents[0].data._id, ID);
    assert.equal(fixture.writes, 0);
    await page.locator('[data-path="stats.armorClass"]').fill('');
    await page.locator('#remote-check').click();
    await page.locator('#remote-connection-state').getByText('Connected', { exact: true }).waitFor();
    assert.equal(await page.locator('#remote-connection-state').textContent(), 'Connected');
    assert.equal(await page.locator('[data-path="stats.armorClass"]').inputValue(), '');
    await page.locator('[data-path="stats.armorClass"]').fill(String(original.stats.armorClass));
    console.log('PASS invalid local fields do not block sign-in or discard the current form');
    const guarded = await transport.page.evaluate(async id => {
      try { await window.angular.element(document.body).injector().get('$http').put('/api/creatures/' + id, { name: 'Unreviewed native autosave' }); return false; }
      catch { return true; }
    }, ID);
    assert.equal(guarded, true); assert.equal(fixture.writes, 0);
    console.log('PASS owned-creature load and native/unreviewed autosave blocked');
    await page.locator('summary').filter({ hasText: /^Challenge, flavor/ }).click();
    await page.locator('[data-path="flavor.description"]').fill('<p>Reviewed description edit.</p>');
    await page.locator('#remote-creature-message').getByText(/retained on this computer/).waitFor();
    await page.locator('#remote-review').click();
    await page.waitForFunction(() => !document.querySelector('#remote-save').disabled);
    await page.locator('#remote-changes').getByText('flavor.description', { exact: true }).waitFor();
    await page.locator('#remote-save').click();
    await page.locator('#remote-creature-state').getByText('Saved & verified', { exact: true }).waitFor();
    assert.equal(fixture.writes, 1); assert.equal(fixture.value.flavor.description, '<p>Reviewed description edit.</p>');
    assert.deepEqual(fixture.value.stats, original.stats); assert.deepEqual(fixture.value.extra, original.extra);
    assert.equal(fixture.value._id, original._id); assert.equal(fixture.value.bestiaryId, original.bestiaryId);
    await page.locator('#remote-copy-avrae').waitFor();
    console.log('PASS description save, immediate remote reload, unknown fields/identity/membership/YAML preserved, and Avrae follow-up');
    await page.locator('summary').filter({ hasText: /^Challenge, flavor/ }).click();
    await page.locator('[data-path="flavor.description"]').fill('Recover after session expiry');
    await page.locator('#remote-creature-message').getByText(/retained on this computer/).waitFor();
    await transport.page.evaluate(() => { document.cookie = 'fixture-auth=; path=/; max-age=0'; });
    await page.locator('#remote-review').click();
    await page.locator('#remote-creature-state').getByText('Sign-in required', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-path="flavor.description"]').inputValue(), 'Recover after session expiry');
    await page.reload();
    await page.locator('#creature-form').waitFor();
    assert.equal(await page.locator('[data-path="flavor.description"]').inputValue(), 'Recover after session expiry');
    await page.locator('#remote-check').click();
    await page.locator('#remote-connection-state').getByText('Sign-in required', { exact: true }).waitFor();
    await transport.page.locator('#test-sign-in').click();
    await page.locator('#remote-check').click();
    await page.locator('#remote-connection-state').getByText('Connected', { exact: true }).waitFor();
    console.log('PASS expired-session recovery, editor reload, and reconnect retain exact local edits');
    fixture.value.stats.armorClass = 30;
    await page.locator('#remote-review').click();
    await page.locator('#remote-creature-state').getByText('Remote conflict', { exact: true }).waitFor();
    assert.equal(fixture.writes, 1); assert.equal(await page.locator('#remote-save').isDisabled(), true);
    await page.getByText('Changes made elsewhere', { exact: true }).click();
    await page.getByText('stats.armorClass', { exact: true }).waitFor();
    console.log('PASS external-change conflict blocks the save without discarding the draft');
    await page.locator('#remote-latest').click();
    await page.locator('#remote-creature-state').getByText('Loaded', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-path="stats.armorClass"]').inputValue(), '30');
    await page.locator('summary').filter({ hasText: /^Challenge, flavor/ }).click();
    await page.locator('[data-path="flavor.description"]').fill('Verify an uncertain save result');
    await page.locator('#remote-creature-message').getByText(/retained on this computer/).waitFor();
    await page.locator('#remote-review').click(); await page.waitForFunction(() => !document.querySelector('#remote-save').disabled);
    fixture.failAfterWrite = true;
    await page.locator('#remote-save').click();
    await page.locator('#remote-creature-state').getByText('Failed', { exact: true }).waitFor();
    assert.equal(fixture.writes, 2);
    await page.locator('#remote-verify').click();
    await page.locator('#remote-creature-state').getByText('Saved & verified', { exact: true }).waitFor();
    assert.equal(fixture.writes, 2);
    console.log('PASS uncertain response retains local recovery and read-only verification confirms persistence without retrying a write');
    await page.locator('#remote-url').fill(`https://critterdb.com/#/creature/edit/${OTHER}`);
    await page.locator('#remote-load').click();
    await page.locator('#remote-connection-state').getByText('Permission denied', { exact: true }).waitFor();
    assert.equal(service.store.value.documents.length, 1); assert.equal(fixture.writes, 2);
    assert.doesNotMatch(JSON.stringify(service.store.value), /fixture-browser-only-session|fixture-auth|x-access-token/);
    assert.deepEqual(errors, []);
    console.log('PASS public/viewable but unowned creature denied, no credentials in workspace, no browser script errors');
    await transport.close();
    const restored = new CritterBrowser({ profileDirectory: path.join(root, 'profile'), channel: testChannel, headless: true, origin });
    try {
      assert.equal((await restored.connect()).state, 'connected');
      await restored.page.evaluate(() => fetch('/api/revokeauthentication', { method: 'POST' }));
      assert.equal(fs.existsSync(restored.sessionFile), false);
    } finally { await restored.close(); }
    console.log('PASS remembered authentication reuses only the isolated persistent profile');
    const loggedOut = new CritterBrowser({ profileDirectory: path.join(root, 'profile'), channel: testChannel, headless: true, origin });
    try { assert.equal((await loggedOut.connect()).state, 'sign_in_required'); } finally { await loggedOut.close(); }
    console.log('PASS native sign-out is respected on the next browser connection');
    console.log('All remote checks used a LOCAL FIXTURE. No live authenticated CritterDB save was tested.');
  } finally {
    if (browser) await browser.close();
    if (service?.server.listening) await service.close();
    else if (transport) await transport.close();
    await new Promise(resolve => server.close(resolve));
    const resolved = path.resolve(root), prefix = path.resolve(os.tmpdir()) + path.sep + 'aina-remote-browser-';
    assert.ok(resolved.startsWith(prefix)); fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
