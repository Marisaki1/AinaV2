window.SenderUI = (() => {
  let status = null, timer, busy = false, messageDraft = '', filter = '', lastRecent = '';
  let ttsEnabled = false, voiceId = '', voiceInfo = null, voiceFor = '', voiceLoading = false, voiceRequest = 0;
  let speechProvider = 'groq', speechVoice = 'autumn', messageVersion = 0, voiceProvider = '';
  const pending = new Map();
  const active = () => typeof ui !== 'undefined' && ui?.tab === 'sender';
  const call = (route, method = 'GET', data) => api('sender/' + route, method, data);
  const destinationName = () => channels.find(c => c.id === ui.channelId)?.name || 'Choose a channel above';
  const selectedSpeech = () => voiceInfo?.providers?.find(provider => provider.provider === speechProvider);
  const speechReady = () => Boolean(selectedSpeech()?.configured && selectedSpeech()?.discovered && selectedSpeech()?.voices.some(voice => voice.id === speechVoice));
  function clearMessage() {
    messageDraft = ''; messageVersion++;
    if ($('#sender-message')) { $('#sender-message').value = ''; $('#sender-message').focus(); }
    paintState();
  }
  async function operation(task) {
    if (busy) return;
    busy = true;
    try { await task(); } catch (e) { Feedback.show('Aina command panel', e.message, 'error'); }
    finally { busy = false; if (active()) await render(); }
  }
  function observePending() {
    for (const [key, local] of pending) {
      const item = status?.recent.find(r => r.requestId === local.requestId);
      if (item?.delivery === 'sent' && local.kind === 'message' && !local.handled) {
        local.handled = true;
        if (local.version === messageVersion && messageDraft === local.text) clearMessage();
      }
      if (item && !['queued', 'sending'].includes(item.delivery) && Date.now() - local.at > 1000) pending.delete(key);
    }
  }
  async function refresh() {
    status = await call('status'); observePending();
    if (ttsEnabled && active()) await refreshVoice();
    if (active()) { paintRecent(); paintState(); }
    return status;
  }
  function paintState() {
    if ($('#sender-state')) { $('#sender-state').textContent = status?.ready ? 'Aina online' : 'Aina offline'; $('#sender-state').dataset.ready = String(Boolean(status?.ready)); }
    if ($('#sender-message-send')) $('#sender-message-send').disabled = !messageDraft.trim() || !status?.ready || !channels.some(c => c.id === ui.channelId) || busy || (ttsEnabled && (voiceLoading || voiceFor !== ui.channelId || !speechReady() || !voiceInfo?.channels?.some(c => c.id === voiceId)));
    if ($('#sender-message-clear')) $('#sender-message-clear').disabled = !messageDraft;
    document.querySelectorAll('[data-sender-button]').forEach(b => { b.disabled = !status?.ready || !channels.some(c => c.id === ui.channelId) || busy; });
    if ($('#sender-destination')) $('#sender-destination').textContent = destinationName();
    if ($('#sender-cancel')) $('#sender-cancel').hidden = !status?.queued;
    if (ttsEnabled && (voiceFor !== ui.channelId || voiceProvider !== speechProvider) && !voiceLoading) void refreshVoice();
  }
  function paintVoice() {
    if (!$('#sender-voice-panel')) return;
    $('#sender-voice-panel').hidden = !ttsEnabled;
    $('#sender-tts').checked = ttsEnabled;
    const options = '<option value="">Choose a voice channel</option>' + (voiceInfo?.channels || []).map(channel => '<option value="' + escape(channel.id) + '">' + escape(channel.name) + '</option>').join('');
    if ($('#sender-voice-channel').innerHTML !== options) $('#sender-voice-channel').innerHTML = options;
    $('#sender-voice-channel').value = voiceId;
    $('#sender-voice-channel').disabled = voiceLoading || busy;
    const providers = voiceInfo?.providers || [];
    const providerOptions = providers.map(provider => '<option value="' + escape(provider.provider) + '">' + escape(provider.name) + '</option>').join('');
    if ($('#sender-speech-provider').innerHTML !== providerOptions) $('#sender-speech-provider').innerHTML = providerOptions;
    $('#sender-speech-provider').value = speechProvider;
    $('#sender-speech-provider').disabled = voiceLoading || busy || !providers.length;
    const speech = selectedSpeech();
    const voiceOptions = (speech?.voices || []).map(voice => '<option value="' + escape(voice.id) + '">' + escape(voice.name) + '</option>').join('');
    if ($('#sender-speech-voice').innerHTML !== voiceOptions) $('#sender-speech-voice').innerHTML = voiceOptions;
    $('#sender-speech-voice').value = speechVoice;
    $('#sender-speech-voice').disabled = voiceLoading || busy || !speech;
    $('#sender-speech-details').textContent = speech ? speech.cost + (speech.discovered ? ' ' + speech.voices.length + ' voices available.' : '') : '';
    $('#sender-speech-help').hidden = !speech?.help;
    if (speech?.help) $('#sender-speech-help').href = speech.help;
    $('#sender-voice-reload').disabled = voiceLoading || busy || !status?.ready;
    const current = voiceInfo?.current;
    $('#sender-voice-status').textContent = voiceLoading ? 'Loading voice channels…' : voiceInfo?.discoveryError || speech?.error || (voiceInfo ? speechProvider + ' · ' + speechVoice + ' · ' + (current ? current.status + (current.speaking ? ' · speaking' : '') + ' · ' + current.queued + ' waiting' : 'Not connected. Send message will join the selected channel.') : 'Select a text channel above first.');
    $('#sender-voice-join').disabled = busy || voiceLoading || !voiceId;
    $('#sender-voice-stop').disabled = busy || !current;
    $('#sender-voice-leave').disabled = busy || !current;
  }
  async function refreshVoice(force = false) {
    const channelId = ui.channelId, provider = speechProvider;
    if (!ttsEnabled || !channelId || !status?.ready || voiceLoading) return;
    const request = ++voiceRequest;
    if (voiceFor !== channelId) { voiceId = ''; voiceInfo = null; }
    voiceFor = channelId; voiceProvider = provider; voiceLoading = true; paintVoice();
    try {
      const result = await call('voice?channelId=' + encodeURIComponent(channelId) + '&provider=' + encodeURIComponent(provider) + (force ? '&refresh=1' : ''));
      if (request !== voiceRequest || ui.channelId !== channelId || provider !== speechProvider) return;
      voiceInfo = result;
      const speech = selectedSpeech();
      if (speech && !speech.voices.some(voice => voice.id === speechVoice)) speechVoice = speech.defaultVoice;
      if (!result.channels.some(c => c.id === voiceId)) voiceId = [result.memberChannelId, result.current?.channelId].find(id => result.channels.some(c => c.id === id)) || '';
    } catch (error) { if (ui.channelId === channelId && provider === speechProvider) voiceInfo = { discoveryError: error.message, channels: [], configured: false }; }
    finally { voiceLoading = false; paintVoice(); paintState(); }
  }
  async function controlVoice(action) {
    await operation(async () => {
      voiceInfo = await call('voice', 'POST', { channelId: ui.channelId, voiceChannelId: voiceId, action, ttsProvider: speechProvider });
      paintVoice();
    });
  }
  async function send(text, kind = 'command') {
    if (!connected || !channels.some(c => c.id === ui.channelId)) { Feedback.show('Choose a destination', connected ? 'Select a channel or thread in the bar above.' : 'Start Aina first. You can still copy commands.', 'error'); return; }
    const withSpeech = kind === 'message' && ttsEnabled;
    if (kind === 'message' && !text.trim()) return;
    if (withSpeech && (voiceFor !== ui.channelId || !speechReady() || !voiceInfo?.channels?.some(c => c.id === voiceId))) { Feedback.show('TTS not ready', voiceInfo?.discoveryError || selectedSpeech()?.error || 'Choose a voice and voice channel for this server first.', 'error'); return; }
    const channelId = ui.channelId, key = kind + '\n' + channelId + '\n' + text + '\n' + (withSpeech ? [voiceId, speechProvider, speechVoice].join(':') : '');
    observePending();
    if (pending.has(key)) { Feedback.show('Already submitted', 'Check Recent posts. No duplicate was submitted.'); return; }
    const requestId = crypto.randomUUID(); pending.set(key, { requestId, at: Date.now(), kind, text, version: messageVersion });
    try {
      await call(kind === 'message' ? 'message' : 'send', 'POST', { requestId, channelId, text, ...(withSpeech ? { tts: true, voiceChannelId: voiceId, ttsProvider: speechProvider, ttsVoice: speechVoice } : {}) });
      Feedback.show('Submitted to Aina', withSpeech ? 'Check Recent posts for message delivery and speech completion.' : kind === 'message' ? 'Check Recent posts for Discord delivery.' : 'Check Recent posts for Discord delivery. Copy the posted command to run it in Avrae.');
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
    const html = (status?.recent || []).slice(0, 10).map(item => '<details class="sender-record"><summary><span class="sender-delivery" data-state="' + escape(item.delivery) + '">' + escape((names[item.delivery] || item.delivery)+(item.previewResolution==='confirmed-by-owner'?' ? Used (owner confirmed)':item.previewResolution==='cancelled'?' ? Preview cancelled':'')) + '</span><time>' + escape(new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '</time><code>' + escape(item.text) + '</code></summary><pre>' + escape(item.text) + '</pre>' + (item.speech ? '<p class="hint">TTS: ' + escape(item.speech.state) + (item.ttsVoice ? ' / ' + escape(item.ttsProvider) + ' / ' + escape(item.ttsVoice) : '') + (item.speech.error ? ' ? ' + escape(item.speech.error) : '') + '</p>' : '') + (item.error ? '<p class="error">' + escape(item.error) + '</p>' : '') + (item.warning ? '<p class="hint">' + escape(item.warning) + '</p>' : '') + (item.messageId && item.guildId && !item.previewResolution ? '<a href="https://discord.com/channels/' + escape(item.guildId) + '/' + escape(item.channelId) + '/' + escape(item.messageId) + '" target="_blank" rel="noopener noreferrer">Open in Discord ↗</a>' : '') + '</details>').join('') || '<div class="sender-empty"><strong>No posts yet</strong><p>Commands you post as Aina will appear here.</p></div>';
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
    if ($('#sender-message')) messageDraft = $('#sender-message').value;
    if (!status) await refresh();
    $('#selection-panel').innerHTML = '';
    $('#content-panel').innerHTML = '<div class="sender-page-heading"><div><div class="eyebrow">DISCORD COMMANDS</div><h1>Post as Aina</h1><p id="sender-destination" class="muted"></p></div><span id="sender-state" class="sender-state" role="status"></span></div><div id="language-converter"></div><div class="section-heading sender-saved-heading"><h2>Saved commands <span class="count">' + status.config.buttons.length + '</span></h2><button id="sender-add" class="small">+ Add shortcut</button></div><input id="sender-search" type="search" placeholder="Filter saved commands" aria-label="Filter saved commands"><div id="sender-buttons"></div>';
    $('#content-panel').innerHTML += '<form id="sender-message-form" class="sender-compose-card sender-message-card"><div class="sender-message-heading"><label for="sender-message">Plain message</label><label class="sender-tts-toggle"><input id="sender-tts" type="checkbox"> Enable TTS</label></div><textarea id="sender-message" rows="3" maxlength="2000" placeholder="Type your message" spellcheck="false"></textarea><div id="sender-voice-panel" hidden><div class="sender-speech-options"><label for="sender-speech-provider">Speech provider<select id="sender-speech-provider"></select></label><label for="sender-speech-voice">Voice<select id="sender-speech-voice"></select></label></div><label for="sender-voice-channel">Voice channel (same server)</label><select id="sender-voice-channel"></select><p id="sender-speech-details" class="hint"></p><a id="sender-speech-help" class="hint" target="_blank" rel="noopener noreferrer">Provider setup documentation</a><div class="sender-voice-actions"><button type="button" id="sender-voice-reload">Reload voices</button><button type="button" id="sender-voice-join">Join voice</button><button type="button" id="sender-voice-stop">Stop speech</button><button type="button" id="sender-voice-leave">Leave voice</button></div><p id="sender-voice-status" class="hint" role="status"></p><p class="hint">Send message joins the selected voice channel automatically. Join it yourself first, or use Move Members permission. Quote markers (&gt;) are skipped in speech; posted text stays unchanged.</p></div><div class="sender-message-footer"><span class="hint">Sends exact text; clears after Discord confirms delivery.</span><div class="sender-message-actions"><button type="button" id="sender-message-clear">Clear</button><button id="sender-message-send" class="primary">Send message</button></div></div></form>';
    $('#sender-tts').checked = ttsEnabled;
    $('#sender-tts').onchange = async e => { ttsEnabled = e.target.checked; paintVoice(); paintState(); if (ttsEnabled) await refreshVoice(); };
    $('#sender-voice-channel').onchange = e => { voiceId = e.target.value; paintState(); };
    $('#sender-voice-reload').onclick = () => { void refreshVoice(true); };
    $('#sender-speech-provider').onchange = e => { speechProvider = e.target.value; speechVoice = selectedSpeech()?.defaultVoice || ''; paintVoice(); paintState(); };
    $('#sender-speech-voice').onchange = e => { speechVoice = e.target.value; paintVoice(); paintState(); };
    $('#sender-voice-join').onclick = () => controlVoice('join');
    $('#sender-voice-stop').onclick = () => controlVoice('stop');
    $('#sender-voice-leave').onclick = () => controlVoice('leave');
    paintVoice();
    $('#sender-message').value = messageDraft;
    $('#sender-message').oninput = e => { messageDraft = e.target.value; messageVersion++; paintState(); };
    $('#sender-message-clear').onclick = clearMessage;
    $('#sender-message-form').onsubmit = e => { e.preventDefault(); void send($('#sender-message').value, 'message'); };
    $('#sender-search').value = filter;
    $('#sender-search').oninput = e => { filter = e.target.value; paintButtons(); };
    $('#sender-add').onclick = () => editor();
    $('#command-panel').innerHTML = '<div class="section-heading"><h2>Recent posts</h2><button id="sender-refresh" class="small quiet">Refresh</button></div><p class="hint">Posted means Discord confirmed delivery. Avrae execution is manual.</p><div id="sender-recent" aria-live="polite"></div><button id="sender-cancel" class="small" hidden>Cancel waiting posts</button>';
    $('#sender-refresh').onclick = () => operation(refresh);
    $('#sender-cancel').onclick = () => operation(async () => { await call('cancel', 'POST', {}); await refresh(); });
    paintButtons(); lastRecent = ''; paintRecent(); paintState();
    void window.LanguageUI.render($('#language-converter'));
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

