const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const Core = require('./public/core');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function validText(text, prefix) {
  if (typeof text !== 'string' || text !== text.trim() || text.length <= prefix.length || text.length > 1700 || /[\r\n\x00-\x1f\x7f]/.test(text) || text.includes('```') || text.startsWith('/') || !text.startsWith(prefix)) {
    throw fail('Use one Avrae command with the configured prefix, up to 1700 characters.');
  }
  return text;
}

// Uses Aina's existing official bot connection only. No user credentials or login transport.
class CommandSender {
  constructor(store, bridge) {
    this.store = store; this.bridge = bridge;
    this.file = path.join(store.directory, 'bot-post-history.json');
    this.history = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
    if (!Array.isArray(this.history)) throw fail('Bot post history is invalid. Restore a local backup.', 503);
    for (const item of this.history) {
      if (item.delivery === 'sending') { item.delivery = 'uncertain'; item.error = 'Aina restarted during posting. Check Discord before posting again.'; }
      if (item.delivery === 'queued') { item.delivery = 'cancelled'; item.error = 'Cancelled on restart.'; }
    }
    this.queue = []; this.running = null; this.closed = false;
    this.persist();
  }
  persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.history, null, 2), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
  view() {
    return { mode: 'bot-preview', ready: Boolean(this.bridge.client?.isReady()), queued: this.queue.length,
      identity: this.bridge.client?.user ? { id: this.bridge.client.user.id, username: this.bridge.client.user.username } : null,
      prefix: this.store.value.preferences.prefix, config: this.store.value.sender,
      recent: this.history.slice(-80).reverse().map(item=>{const event=this.bridge.events?.find(e=>e.messageId===item.messageId);return event?{...item,previewResolution:event.kind,previewResolvedAt:event.createdAt}:item;}), execution: 'manual' };
  }
  submit({ requestId, channelId, text }) {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) throw fail('A unique request ID is required.');
    const old = this.history.find(h => h.requestId === requestId);
    if (old) {
      if (old.channelId !== channelId || old.text !== text) throw fail('This request ID belongs to a different command.', 409);
      return old;
    }
    if (this.closed || !this.bridge.client?.isReady()) throw fail('Aina is offline. Start the bot or copy the command.', 409);
    if (typeof channelId !== 'string' || !channelId) throw fail('Choose a channel above.');
    validText(text, this.store.value.preferences.prefix);
    if (this.queue.length >= 50 || this.history.length >= 10000) throw fail('The post queue or history is full. Finish waiting posts or archive history before continuing.', 429);
    const item = { requestId, channelId, text, prefix: this.store.value.preferences.prefix, nonce: randomUUID().replace(/-/g, '').slice(0, 24), delivery: 'queued', execution: 'manual', createdAt: Date.now() };
    this.history.push(item);
    try { this.persist(); } catch { this.history.pop(); throw fail('Could not retain the post request. Nothing was submitted.', 503); }
    this.queue.push(item);
    queueMicrotask(() => this.drain());
    return item;
  }
  async drain() {
    if (this.running) return this.running;
    this.running = (async () => {
      while (!this.closed && this.queue.length) {
        const item = this.queue.shift(); item.delivery = 'sending';
        try {
          this.persist();
          const result = (await this.bridge.post(item.channelId, [item.text], item.prefix, { nonce: item.nonce }))[0];
          if (result?.posted && result.messageId) {
            item.delivery = 'sent'; item.messageId = result.messageId; item.guildId = result.guildId || ''; item.deliveredAt = Date.now();
            if (result.warning) item.warning = result.warning;
          } else { item.delivery = result?.uncertain ? 'uncertain' : 'failed'; item.error = result?.error || 'Posting failed. Check Discord before trying again.'; }
        } catch { item.delivery = 'failed'; item.error = 'Posting could not start. Check channel permissions and Aina status.'; }
        try { this.persist(); } catch {
          item.warning = 'Local history could not be saved. Check Discord; do not repost automatically.';
          this.cancel(); break;
        }
      }
    })().finally(() => { this.running = null; });
    return this.running;
  }
  async postBatch({ requestId, channelId, commands }) {
    if (!Array.isArray(commands) || !commands.length || commands.length > 50) throw fail('Post between 1 and 50 command previews.');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,70}$/.test(requestId)) throw fail('A unique batch request ID is required.');
    commands.forEach(text => validText(text, this.store.value.preferences.prefix));
    const results = [];
    for (const [i, text] of commands.entries()) {
      const item = this.submit({ requestId: requestId + '_' + i, channelId, text });
      if (['queued', 'sending'].includes(item.delivery)) await this.drain();
      results.push({ command: text, posted: item.delivery === 'sent', messageId: item.messageId, delivery: item.delivery, error: item.error });
      if (item.delivery !== 'sent') break;
    }
    return results;
  }
  configure(data) {
    const current = this.store.read();
    const sender = { ...current.workspace.sender, buttons: data.buttons };
    if (!Array.isArray(sender.buttons)) throw fail('Saved commands must be a list.');
    for (const button of sender.buttons) validText(button?.text, current.workspace.preferences.prefix);
    current.workspace.sender = sender;
    const valid = Core.validateWorkspace(current.workspace);
    this.store.save(valid, current.revision);
    return this.store.value.sender;
  }
  cancel() {
    for (const item of this.queue) { item.delivery = 'cancelled'; item.error = 'Cancelled before posting.'; }
    this.queue = [];
    try { this.persist(); } catch { /* Nothing queued is dispatched after cancellation. */ }
    return this.view();
  }
  async close() { this.closed = true; this.cancel(); if (this.running) await this.running; }
}
module.exports = { CommandSender, validText };

