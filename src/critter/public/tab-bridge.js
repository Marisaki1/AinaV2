window.CritterTabBridge = (() => {
  const waiting = new Map();
  let channel = '', tabId = null, generation = 0;
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'aina-critter-response') return;
    const entry = waiting.get(event.data.nonce); if (!entry) return;
    clearTimeout(entry.timer); waiting.delete(event.data.nonce); entry.resolve(event.data.result);
  });
  const error = (code, message) => Object.assign(new Error(message), { code });
  function request(operation, extra = {}, timeout = 65000) {
    const nonce = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(nonce); reject(error('extension_required', 'Install the Aina connection extension in this Brave profile, then refresh this editor. The setup steps are below.')); }, timeout);
      waiting.set(nonce, { resolve, reject, timer });
      window.postMessage({ type: 'aina-critter-request', nonce, operation, ...extra }, location.origin);
    });
  }
  async function tabs() {
    const result = await request('tabs', {}, 3000);
    if (!result?.ok) throw error(result?.code || 'disconnected', 'The extension could not connect. Check its Aina address matches this page, then refresh.');
    if (!result.version || result.version === '1.0.0') throw error('extension_update_required', 'Reload the Aina CritterDB extension at brave://extensions, then refresh Aina and reconnect your existing tab. Connector 1.0.1 fixes the empty-bestiary bug.');
    return result.tabs;
  }
  async function runJob(job, key, selected, run) {
    let result;
    try { result = await request('execute', { tabId: selected, input: job.input }); }
    catch { result = { ok: false, code: 'disconnected' }; }
    if (run !== generation) return;
    try { await api('remote/browser/result', 'POST', { channel: key, id: job.id, result }); }
    catch { /* Save may have completed: use read-only verification before retrying. */ }
  }
  async function poll(key, selected, run) {
    while (run === generation) {
      try {
        const result = await api('remote/browser/jobs', 'POST', { channel: key });
        if (result.job && run === generation) void runJob(result.job, key, selected, run);
      } catch {
        if (run === generation) { channel = ''; tabId = null; }
        return;
      }
    }
  }
  async function connect(selected) {
    const available = await tabs();
    if (!available.some(t => t.id === selected)) throw error('disconnected', 'That CritterDB tab was closed. Open CritterDB yourself, then connect again.');
    const run = ++generation;
    const result = await api('remote/browser/attach', 'POST', {});
    channel = result.channel; tabId = selected;
    localStorage.setItem('aina-critterdb-tab', String(selected));
    void poll(channel, selected, run);
    return api('remote/status');
  }
  async function restore() {
    if (channel) return;
    const stored = Number(localStorage.getItem('aina-critterdb-tab'));
    if (!stored) return;
    try { const available = await tabs(); if (available.some(t => t.id === stored)) await connect(stored); }
    catch (e) { if (e.code === 'extension_update_required') throw e; /* Explicit Connect offers installation/reconnect instructions. */ }
  }
  return { tabs, connect, restore, get tabId() { return tabId; } };
})();
