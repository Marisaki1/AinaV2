const { randomUUID } = require('crypto');
const { RemoteError } = require('./remote-browser');
const Remote = require('./public/remote-common');

// No browser automation/launching. The existing editor tab relays fixed operations
// through its installed extension to a user-selected, already-open CritterDB tab.
class TabTransport {
  constructor({ timeout = 65000, lease = 30000 } = {}) {
    this.timeout = timeout; this.lease = lease; this.channel = ''; this.touched = 0;
    this.state = 'disconnected'; this.pending = new Map(); this.queue = []; this.waiter = null;
  }
  status() {
    const messages = {
      disconnected: 'Open CritterDB and sign in in your existing Brave browser, then choose Connect existing tab.',
      connecting: 'Checking the selected CritterDB tab.',
      connected: 'Connected through your existing CritterDB tab. Your login stays in that tab.',
      sign_in_required: 'Sign in on your selected CritterDB tab, then check the connection. Your edits are retained.',
      unsupported: 'The selected CritterDB tab is not ready or its application has changed. Reload that tab, then reconnect.',
    };
    return { state: this.state, message: messages[this.state] || new RemoteError(this.state).message, connection: 'existing-tab' };
  }
  attach() {
    this.disconnect(); this.channel = randomUUID(); this.touched = Date.now(); this.state = 'connecting';
    return { channel: this.channel };
  }
  valid(channel) {
    if (!this.channel || channel !== this.channel || Date.now() - this.touched > this.lease) throw new RemoteError('disconnected');
  }
  async next(channel) {
    this.valid(channel); this.touched = Date.now();
    if (this.waiter) throw Object.assign(new Error('This editor tab already has an active connection poll.'), { status: 409 });
    if (!this.queue.length) await new Promise(resolve => {
      const timer = setTimeout(() => { this.waiter = null; resolve(); }, 18000);
      this.waiter = () => { clearTimeout(timer); this.waiter = null; resolve(); };
    });
    this.valid(channel); this.touched = Date.now();
    const job = this.queue.shift();
    return { job: job || null };
  }
  complete(channel, id, result) {
    this.valid(channel); this.touched = Date.now();
    const entry = this.pending.get(id);
    if (!entry || entry.channel !== channel) throw Object.assign(new Error('This operation expired or was already answered.'), { status: 409 });
    clearTimeout(entry.timer); this.pending.delete(id);
    if (!result || typeof result.ok !== 'boolean') { entry.reject(new RemoteError('failed')); return; }
    if (!result.ok) {
      const codes = ['sign_in_required', 'permission_denied', 'inaccessible', 'conflict', 'unsupported', 'disconnected', 'failed'];
      const code = codes.includes(result.code) ? result.code : 'failed';
      this.state = code === 'conflict' ? 'connected' : code;
      entry.reject(new RemoteError(code, result.current ? { current: result.current } : {}));
    } else { this.state = 'connected'; entry.resolve(result); }
  }
  async execute(input) {
    try { this.valid(this.channel); } catch { this.state = 'disconnected'; throw new RemoteError('disconnected'); }
    const id = randomUUID(), channel = this.channel;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); this.queue = this.queue.filter(j => j.id !== id);
        this.state = 'disconnected'; reject(new RemoteError('disconnected'));
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer, channel }); this.queue.push({ id, input });
      this.waiter?.();
    });
  }
  async connect() { return this.probe(); }
  async probe() {
    try { await this.execute({ operation: 'probe' }); }
    catch (error) { this.state = error.code || 'failed'; }
    return this.status();
  }
  async read(id) { return (await this.execute({ operation: 'read', id })).creature; }
  async loadSource(kind, id) { return (await this.execute({ operation: 'source', kind, id })).data; }
  async writeChecked(id, original, candidate) {
    Remote.assertIdentity(original, candidate);
    return (await this.execute({ operation: 'save', id, original, candidate })).creature;
  }
  disconnect() {
    this.channel = ''; this.touched = 0; this.state = 'disconnected'; this.queue = [];
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new RemoteError('disconnected')); }
    this.pending.clear(); this.waiter?.();
  }
  async close() { this.disconnect(); }
}
module.exports = { TabTransport };
