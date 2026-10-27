const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { chromium } = require('playwright');
const { canonical } = require('./public/remote-common');

const messages = {
  browser_launch_disabled: 'Aina will not open a separate browser. Connecting to your existing CritterDB tab is not implemented. Direct account loading and saving are unavailable; local editing and JSON import/export still work. Your edits are retained.',
  disconnected: 'The CritterDB browser is disconnected. Connect or reconnect to continue. Your local edits are retained.',
  sign_in_required: 'Sign in to CritterDB in the integration browser, then check the connection. Your local edits are retained.',
  permission_denied: 'The signed-in CritterDB account cannot edit this creature or its collection.',
  inaccessible: 'This creature is missing or inaccessible to the signed-in account.',
  conflict: 'The remote creature changed since loading. No update was sent. Review the conflict and keep or export your local edits.',
  failed: 'The CritterDB operation failed. Local edits are retained. Reconnect or verify the remote creature before retrying.',
  unsupported: 'CritterDB’s browser application has changed or did not finish loading. No creature write was permitted.',
  browser_unavailable: 'Brave could not be found. Install Brave or set CRITTER_BROWSER_EXECUTABLE_PATH to its executable on the integration host.',
  browser_in_use: 'Another Aina editor or sign-in diagnostic is using the CritterDB browser profile. Close that integration first, then reconnect. Your local edits are retained.',
};
class RemoteError extends Error {
  constructor(code, details = {}) { super(messages[code] || messages.failed); this.code = code; this.status = ({ sign_in_required: 401, permission_denied: 403, inaccessible: 404, conflict: 409 })[code] || 503; this.details = details; }
}

function browserLaunchOptions(channel, executablePath) {
  if (executablePath) return { executablePath };
  if (channel !== 'brave') return channel === 'chromium' ? {} : { channel };
  const candidates = process.platform === 'win32' ? [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'BraveSoftware/Brave-Browser/Application/brave.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'BraveSoftware/Brave-Browser/Application/brave.exe'),
    ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'BraveSoftware/Brave-Browser/Application/brave.exe')] : []),
  ] : process.platform === 'darwin' ? ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']
    : ['/usr/bin/brave-browser', '/usr/bin/brave', '/opt/brave.com/brave/brave'];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new RemoteError('browser_unavailable');
  return { executablePath: found };
}

class CritterBrowser {
  constructor({ profileDirectory, channel = process.env.CRITTER_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium'), executablePath = process.env.CRITTER_BROWSER_EXECUTABLE_PATH?.trim(), headless = false, origin = 'https://critterdb.com', launcher = chromium } = {}) {
    // Never open an Edge user-data directory with Brave or touch the user's normal browser profile.
    this.profileDirectory = channel === 'brave' ? path.join(profileDirectory || '.', 'brave') : profileDirectory;
    this.sessionFile = path.join(this.profileDirectory || '.', 'aina-remembered-session.json');
    this.executablePath = executablePath;
    this.channel = channel; this.headless = headless; this.origin = origin;
    // Browser launches are permitted only for headless, loopback test fixtures.
    // A real account connection must never start another browser/profile.
    const fixtureURL = new URL(origin);
    this.fixtureLaunch = headless === true && fixtureURL.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(fixtureURL.hostname);
    this.launcher = launcher; this.context = null; this.page = null; this.launching = null;
    this.state = 'disconnected'; this.permits = new Map();
  }
  async connect() {
    if (this.launching) return this.launching;
    this.launching = this.open().finally(() => { this.launching = null; });
    return this.launching;
  }
  async open() {
    if (!this.fixtureLaunch) {
      this.state = 'browser_launch_disabled';
      throw new RemoteError(this.state);
    }
    this.state = 'connecting';
    try {
      if (!this.context) {
        this.context = await this.launcher.launchPersistentContext(this.profileDirectory, {
          ...browserLaunchOptions(this.channel, this.executablePath), headless: this.headless,
          viewport: null, acceptDownloads: false, serviceWorkers: 'block', timeout: 30000,
        });
        this.context.on('close', () => { this.context = null; this.page = null; this.state = 'disconnected'; this.permits.clear(); });
        await this.context.route('**/*', route => this.guard(route));
        // CritterDB's Remember Me cookies can be session cookies. Restore them only inside
        // the isolated profile; never put browser storage in the app workspace or exports.
        if (fs.existsSync(this.sessionFile)) {
          try {
            const stored = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
            if (stored.origin === this.origin && Array.isArray(stored.cookies)) await this.context.addCookies(stored.cookies);
          } catch { /* A corrupt/expired remembered session falls back to interactive sign-in. */ }
        }
        this.page = this.context.pages()[0] || await this.context.newPage();
        await this.page.goto(this.origin + '/#/about', { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
      if (!this.page || this.page.isClosed()) {
        this.page = await this.context.newPage();
        await this.page.goto(this.origin + '/#/about', { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
      await this.ready();
      const status = await this.probe();
      if (status.state !== 'connected') {
        // Stay in the same Angular application: in-memory authentication never leaves this browser.
        await this.page.evaluate(() => { window.location.hash = '/login'; });
      }
      await this.showWindow();
      return this.status();
    } catch (error) {
      this.state = 'failed';
      if (error instanceof RemoteError) throw error;
      if (/ProcessSingleton|SingletonLock|user data directory is already in use|Opening in existing browser session/i.test(error.message || '')) throw new RemoteError('browser_in_use');
      throw new RemoteError('disconnected');
    }
  }
  async showWindow() {
    // Activating a tab alone does not restore a minimized Chromium window.
    if (!this.headless) {
      let session;
      try {
        session = await this.context.newCDPSession(this.page);
        const { windowId, bounds } = await session.send('Browser.getWindowForTarget');
        if (bounds.windowState === 'minimized') await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      } catch { /* Some Chromium builds cannot control window bounds; still activate the tab. */ }
      finally { await session?.detach().catch(() => {}); }
    }
    await this.page.bringToFront();
  }
  async guard(route) {
    const request = route.request(), url = new URL(request.url()), headers = request.headers();
    const marker = headers['x-aina-critter-save'];
    if (url.origin === this.origin && url.pathname === '/api/revokeauthentication' && request.method() === 'POST') {
      try { if (fs.existsSync(this.sessionFile)) fs.unlinkSync(this.sessionFile); } catch { /* Do not log private profile data. */ }
    }
    if (url.origin !== this.origin && (headers['x-access-token'] || marker)) return route.abort();
    const mutation = url.origin === this.origin && /^\/api\/(?:creatures|bestiaries|publishedbestiaries)(?:\/|$)/.test(url.pathname) && !['GET', 'HEAD', 'OPTIONS'].includes(request.method());
    if (mutation) {
      const permit = this.permits.get(marker);
      if (!permit || request.method() !== 'PUT' || url.pathname !== '/api/creatures/' + permit.id || request.postData() !== permit.payload) return route.abort();
      this.permits.delete(marker);
      delete headers['x-aina-critter-save'];
      return route.continue({ headers });
    }
    if (marker) { delete headers['x-aina-critter-save']; return route.continue({ headers }); }
    return route.continue();
  }
  async ready() {
    if (!this.fixtureLaunch) throw new RemoteError('browser_launch_disabled');
    if (!this.page || this.page.isClosed()) throw new RemoteError('disconnected');
    if (new URL(this.page.url()).origin !== this.origin) throw new RemoteError('unsupported');
    try {
      await this.page.waitForFunction(() => Boolean(window.angular?.element(document.body).injector()?.has('Auth')), null, { timeout: 20000 });
    } catch { throw new RemoteError('unsupported'); }
  }
  status() { return { state: this.state, message: messages[this.state] || (this.state === 'connected' ? 'Authenticated CritterDB browser connected.' : 'Connecting to the local CritterDB browser…') }; }
  async probe() {
    if (!this.fixtureLaunch) { this.state = 'browser_launch_disabled'; return this.status(); }
    if (!this.context || !this.page || this.page.isClosed()) { this.state = 'disconnected'; return this.status(); }
    try { await this.execute({ operation: 'probe' }); this.state = 'connected'; await this.remember(); }
    catch (e) { this.state = e.code || 'failed'; }
    return this.status();
  }
  async read(id) { return this.execute({ operation: 'read', id }); }
  async writeChecked(id, original, candidate) {
    const nonce = randomUUID(), payload = JSON.stringify(candidate);
    this.permits.set(nonce, { id, payload });
    try { return await this.execute({ operation: 'save', id, original: canonical(original), candidate, nonce }); }
    finally { this.permits.delete(nonce); }
  }
  async execute(input) {
    if (input.id && !/^[a-f0-9]{24}$/.test(input.id)) throw new RemoteError('inaccessible');
    await this.ready();
    let result;
    try {
      result = await this.page.evaluate(async args => {
        const injector = window.angular.element(document.body).injector();
        const auth = injector.get('Auth'), http = injector.get('$http');
        const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
        const fail = (code, current) => ({ ok: false, code, ...(current ? { current } : {}) });
        const classify = error => {
          const detail = typeof error.data === 'string' ? error.data : '';
          if (error.status === 401 || /authenticate token|No token provided|authentication failed/i.test(detail)) return 'sign_in_required';
          if (error.status === 403 || /not authorized|access denied/i.test(detail)) return 'permission_denied';
          if (error.status === 404 || /not found/i.test(detail)) return 'inaccessible';
          return 'failed';
        };
        const get = url => http.get(url, { cache: false, timeout: 20000, headers: { 'Cache-Control': 'no-cache' } }).then(r => r.data);
        // Let CritterDB finish restoring its own remembered session before using its HTTP interceptor.
        await new Promise(resolve => auth.executeOnLogin(resolve));
        if (!auth.isLoggedIn()) return fail('sign_in_required');
        let user;
        try { user = await get('/api/authenticate/user'); }
        catch (error) { return fail(classify(error) === 'failed' ? 'failed' : 'sign_in_required'); }
        if (!user?._id) return fail('sign_in_required');
        if (args.operation === 'probe') return { ok: true };
        try {
          const current = await get('/api/creatures/' + args.id);
          if (!current || current._id !== args.id) return fail('inaccessible');
          // A public/viewable link is not edit permission. Mirror the verified collection ownership checks.
          let owner;
          if (current.bestiaryId && !current.publishedBestiaryId) owner = (await get('/api/bestiaries/' + current.bestiaryId)).ownerId;
          else if (current.publishedBestiaryId && !current.bestiaryId) owner = (await get('/api/publishedbestiaries/' + current.publishedBestiaryId)).owner;
          else return fail('permission_denied');
          if ((typeof owner === 'object' ? owner?._id : owner) !== user._id) return fail('permission_denied');
          if (args.operation === 'read') return { ok: true, creature: current };
          if (canonical(current) !== args.original) return fail('conflict', current);
          // The route guard allows exactly this one reviewed PUT, with this exact identity and body.
          await http.put('/api/creatures/' + args.id, args.candidate, { timeout: 20000, headers: { 'X-Aina-Critter-Save': args.nonce } });
          const persisted = await get('/api/creatures/' + args.id);
          return { ok: true, creature: persisted };
        } catch (error) { return fail(classify(error)); }
      }, input);
    } catch { throw new RemoteError('disconnected'); }
    if (!result.ok) { this.state = result.code === 'conflict' ? 'connected' : result.code; throw new RemoteError(result.code, result.current ? { current: result.current } : {}); }
    this.state = 'connected';
    return result.creature || null;
  }
  async remember() {
    if (!this.context) return;
    const cookies = await this.context.cookies(this.origin);
    fs.mkdirSync(this.profileDirectory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.sessionFile + '.tmp', JSON.stringify({ origin: this.origin, cookies }), { mode: 0o600 });
    fs.renameSync(this.sessionFile + '.tmp', this.sessionFile);
  }
  async close() {
    if (this.context) { await this.remember().catch(() => {}); await this.context.close(); }
  }
}
module.exports = { CritterBrowser, RemoteError, browserLaunchOptions };
