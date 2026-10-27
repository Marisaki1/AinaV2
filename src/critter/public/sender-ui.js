window.SenderUI = (() => {
  let status = null, timer, busy = false, draft = '', filter = '', lastRecent = '';
  const pending = new Map();
  const active = () => typeof ui !== 'undefined' && ui?.tab === 'sender';
  const call = (route, method = 'GET', data) => api('sender/' + route, method, data);
  const destinationName = () => channels.find(c => c.id === ui.channelId)?.name || 'Choose a channel above';
  async function operation(task) {
    if (busy) return;
    busy = true;
    try { await task(); } catch (e) { Feedback.show('Aina command panel', e.message, 'error'); }
    finally { busy = false; if (active()) await render(); }
  }
  function observePending() {
    for (const [key, local] of pending) {
      const item = status?.recent.find(r => r.requestId === local.requestId);
      if (item && !['queued', 'sending'].includes(item.delivery) && Date.now() - local.at > 1000) pending.delete(key);
    }
  }
  async function refresh() {
    status = await call('status'); observePending();
    if (active()) { paintRecent(); paintState(); }
    return status;
  }
  function paintState() {
    if ($('#sender-state')) { $('#sender-state').textContent = status?.ready ? 'Aina online' : 'Aina offline'; $('#sender-state').dataset.ready = String(Boolean(status?.ready)); }
    if ($('#sender-custom-send')) $('#sender-custom-send').disabled = !status?.ready || !channels.some(c => c.id === ui.channelId) || busy;
    document.querySelectorAll('[data-sender-button]').forEach(b => { b.disabled = !status?.ready || !channels.some(c => c.id === ui.channelId) || busy; });
    if ($('#sender-destination')) $('#sender-destination').textContent = destinationName();
    if ($('#sender-cancel')) $('#sender-cancel').hidden = !status?.queued;
  }
  async function send(text) {
    if (!connected || !channels.some(c => c.id === ui.channelId)) { Feedback.show('Choose a destination', connected ? 'Select a channel or thread in the bar above.' : 'Start Aina first. You can still copy commands.', 'error'); return; }
    const channelId = ui.channelId, key = channelId + '\n' + text;
    observePending();
    if (pending.has(key)) { Feedback.show('Already submitted', 'Check Recent posts. No duplicate was submitted.'); return; }
    const requestId = crypto.randomUUID(); pending.set(key, { requestId, at: Date.now() });
    try {
      await call('send', 'POST', { requestId, channelId, text });
      Feedback.show('Submitted to Aina', 'Check Recent posts for Discord delivery. Copy the posted command to run it in Avrae.');
      await refresh();
    } catch (e) {
      if (e.status) pending.delete(key);
      Feedback.show(e.status ? 'Could not post' : 'Delivery not confirmed', e.status ? e.message : 'Check Discord and Recent posts before trying again. This request will not be resent automatically.', 'error');
    }
  }
  async function saveConfig(buttons) {
    const result = await call('config', 'POST', { buttons });
    status.config = result.config; workspace.sender = C.clone(result.config); revision = result.revision;
  }
  function paintRecent() {
    if (!$('#sender-recent')) return;
    const names = { queued: 'Queued', sending: 'Posting…', sent: 'Posted as Aina', uncertain: 'Check Discord · delivery uncertain', failed: 'Failed', cancelled: 'Cancelled' };
    const html = (status?.recent || []).slice(0, 10).map(item => '<details class="sender-record"><summary><span class="sender-delivery" data-state="' + escape(item.delivery) + '">' + escape((names[item.delivery] || item.delivery)+(item.previewResolution==='confirmed-by-owner'?' ? Used (owner confirmed)':item.previewResolution==='cancelled'?' ? Preview cancelled':'')) + '</span><time>' + escape(new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '</time><code>' + escape(item.text) + '</code></summary><pre>' + escape(item.text) + '</pre>' + (item.error ? '<p class="error">' + escape(item.error) + '</p>' : '') + (item.warning ? '<p class="hint">' + escape(item.warning) + '</p>' : '') + (item.messageId && item.guildId && !item.previewResolution ? '<a href="https://discord.com/channels/' + escape(item.guildId) + '/' + escape(item.channelId) + '/' + escape(item.messageId) + '" target="_blank" rel="noopener noreferrer">Open in Discord ↗</a>' : '') + '</details>').join('') || '<div class="sender-empty"><strong>No posts yet</strong><p>Commands you post as Aina will appear here.</p></div>';
    if (html === lastRecent && $('#sender-recent').innerHTML === html) return;
    // Keep expanded records open while polling.
    const open = [...document.querySelectorAll('#sender-recent details[open]')].map(n => n.querySelector('code')?.textContent);
    $('#sender-recent').innerHTML = html; lastRecent = html;
    document.querySelectorAll('#sender-recent details').forEach(n => { if (open.includes(n.querySelector('code')?.textContent)) n.open = true; });
  }
  function paintButtons() {
    if (!$('#sender-buttons')) return;
    const query = filter.toLocaleLowerCase().trim();
    const rows = (status?.config.buttons || []).filter(b => (b.label + ' ' + b.text).toLocaleLowerCase().includes(query));
    $('#sender-buttons').innerHTML = rows.map(b => '<article class="saved-command"><div class="saved-command-text"><strong>' + escape(b.label) + '</strong><code title="' + escape(b.text) + '">' + escape(b.text) + '</code></div><button class="small primary" data-sender-button="' + escape(b.id) + '">Post</button><details class="command-menu"><summary aria-label="Options for ' + escape(b.label) + '">⋯</summary><div><button data-sender-edit="' + escape(b.id) + '">Edit</button><button class="danger" data-sender-remove="' + escape(b.id) + '">Remove</button></div></details></article>').join('') || '<div class="sender-empty"><strong>' + (query ? 'No matching commands' : 'Your shortcuts go here') + '</strong><p>' + (query ? 'Try another name or command.' : 'Add commands you use often. Saving a shortcut sends nothing.') + '</p></div>';
    document.querySelectorAll('[data-sender-button]').forEach(b => b.onclick = () => send(status.config.buttons.find(i => i.id === b.dataset.senderButton).text));
    document.querySelectorAll('[data-sender-edit]').forEach(b => b.onclick = () => editor(status.config.buttons.find(i => i.id === b.dataset.senderEdit)));
    document.querySelectorAll('[data-sender-remove]').forEach(b => b.onclick = () => operation(async () => {
      const removed = status.config.buttons.find(i => i.id === b.dataset.senderRemove);
      await saveConfig(status.config.buttons.filter(i => i.id !== b.dataset.senderRemove));
      Feedback.show('Shortcut removed', removed.label);
    }));
    paintState();
  }
  function editor(button = null) {
    const editing = button ? C.clone(button) : { id: crypto.randomUUID(), label: '', text: '' };
    $('#sender-editor-root').innerHTML = '<div class="dialog-heading"><h2>' + (button ? 'Edit shortcut' : 'New shortcut') + '</h2><button id="sender-editor-close">Cancel</button></div><label>Label<input id="sender-label" maxlength="80" value="' + escape(editing.label) + '" placeholder="e.g. Update bestiary"></label><label>Command<input id="sender-text" maxlength="1700" value="' + escape(editing.text) + '" placeholder="' + escape(status.prefix) + 'bestiary update"></label><p class="hint">Save a shortcut for posting as Aina. Nothing is sent now.</p><button id="sender-editor-save" class="primary">Save shortcut</button>';
    $('#sender-editor-dialog').showModal();
    $('#sender-editor-close').onclick = () => $('#sender-editor-dialog').close();
    $('#sender-editor-save').onclick = () => operation(async () => {
      const item = { ...editing, label: $('#sender-label').value.trim(), text: $('#sender-text').value.trim() };
      const buttons = status.config.buttons.slice(), index = buttons.findIndex(b => b.id === item.id);
      if (index < 0) buttons.push(item); else buttons[index] = item;
      await saveConfig(buttons); $('#sender-editor-dialog').close(); Feedback.show('Shortcut saved', item.label);
    });
  }
  async function render() {
    if (!active()) return;
    if ($('#sender-custom')) draft = $('#sender-custom').value;
    if (!status) await refresh();
    $('#selection-panel').innerHTML = '';
    $('#content-panel').innerHTML = '<div class="sender-page-heading"><div><div class="eyebrow">DISCORD COMMANDS</div><h1>Post as Aina</h1><p id="sender-destination" class="muted"></p></div><span id="sender-state" class="sender-state" role="status"></span></div><form id="sender-compose-form" class="sender-compose-card"><label for="sender-custom">Custom command</label><div class="sender-compose"><input id="sender-custom" maxlength="1700" autocomplete="off" placeholder="' + escape(status.prefix) + 'bestiary update"><button id="sender-custom-send" class="primary">Post as Aina</button></div><p class="hint">Posts a copyable command. Paste it yourself in Discord to run it with Avrae.</p></form><div class="section-heading sender-saved-heading"><h2>Saved commands <span class="count">' + status.config.buttons.length + '</span></h2><button id="sender-add" class="small">+ Add shortcut</button></div><input id="sender-search" type="search" placeholder="Filter saved commands" aria-label="Filter saved commands"><div id="sender-buttons"></div>';
    $('#sender-custom').value = draft;
    $('#sender-compose-form').onsubmit = e => { e.preventDefault(); void send($('#sender-custom').value.trim()); };
    $('#sender-search').value = filter;
    $('#sender-search').oninput = e => { filter = e.target.value; paintButtons(); };
    $('#sender-add').onclick = () => editor();
    $('#command-panel').innerHTML = '<div class="section-heading"><h2>Recent posts</h2><button id="sender-refresh" class="small quiet">Refresh</button></div><p class="hint">Posted means Discord confirmed delivery. Avrae execution is manual.</p><div id="sender-recent" aria-live="polite"></div><button id="sender-cancel" class="small" hidden>Cancel waiting posts</button>';
    $('#sender-refresh').onclick = () => operation(refresh);
    $('#sender-cancel').onclick = () => operation(async () => { await call('cancel', 'POST', {}); await refresh(); });
    paintButtons(); lastRecent = ''; paintRecent(); paintState();
  }
  function decorate() {
    if (active()) { paintState(); return; }
    // Combat and initiative use the same destination and official bot post button.
    if ($('#send')) $('#send').textContent = sending ? 'Posting…' : commands.length > 1 ? 'Post ' + commands.length + ' commands as Aina' : 'Post as Aina';
  }
  async function start() {
    try { await refresh(); } catch { /* Offline creature editing remains available. */ }
    clearInterval(timer); timer = setInterval(() => { if (active() || pending.size) void refresh().catch(() => {}); }, 2000);
  }
  return { start, render, refresh, decorate, send };
})();

