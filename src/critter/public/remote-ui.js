(function () {
  'use strict';
  const R = window.CritterRemote;
  let connection = { state: 'disconnected', message: 'Connect the CritterDB tab you already opened in this Brave profile. Your login stays there.' };
  let creatureURL = '', draftTimer, draftChain = Promise.resolve(), busy = false, sequence = 0;
  const records = new Map(), originals = new Map();
  const labels = { browser_launch_disabled: 'Direct connection unavailable', disconnected: 'Disconnected', connecting: 'Connecting', connected: 'Connected', sign_in_required: 'Sign-in required', loading: 'Loading', loaded: 'Loaded', permission_denied: 'Permission denied', inaccessible: 'Inaccessible creature', unsaved: 'Unsaved changes', saving: 'Saving', saved: 'Saved & verified', conflict: 'Remote conflict', failed: 'Failed' };
  function linked() {
    if (!workspace || page !== 'library') return null;
    const ref = current();
    return ref && workspace.documents.find(d => d.id === ref.documentId && d.remote);
  }
  function record(document) {
    if (!records.has(document.id)) records.set(document.id, { state: 'loaded', changes: [], message: '', reviewToken: null });
    return records.get(document.id);
  }
  function diffHTML(changes) {
    const show = value => value === undefined ? '(not present)' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return changes.map(change => `<details class="remote-change"><summary>${escape(change.path)}</summary><div class="remote-diff"><div><span class="muted">Original</span><pre>${escape(show(change.before))}</pre></div><div><span class="muted">Pending</span><pre>${escape(show(change.after))}</pre></div></div></details>`).join('');
  }
  function statBlock(creature) {
    const s = creature.stats;
    return `<details><summary>Readable stat block</summary><h3>${escape(creature.name)}</h3><p>${escape([s.size, s.race, s.alignment].filter(Boolean).join(' · '))}</p><p>AC ${escape(s.armorClass)} · HP ${C.averageHP(creature) ?? '—'} · Speed ${escape(s.speed)}</p><p>${C.abilities.map(a => a.slice(0, 3).toUpperCase() + ' ' + escape(s.abilityScores?.[a] ?? '—')).join(' · ')}</p><p>Saves: ${(s.savingThrows || []).map(v => escape(v.ability) + ' ' + escape(v.proficient ? Math.floor(((s.abilityScores?.[v.ability] ?? 10) - 10) / 2) + (s.proficiencyBonus || 0) : v.value ?? '—')).join(', ') || '—'}</p><p>${escape(htmlText(creature.flavor?.description || ''))}</p>${C.sections.map(section => (s[section] || []).map(a => `<p><strong>${escape(a.name)}</strong><br>${escape(htmlText(C.splitDescription(a.description).readable)).replace(/\n/g, '<br>')}</p>`).join('')).join('')}</details>`;
  }
  window.remoteConnectionHTML = function () {
    return `<section class="card remote-connect"><div class="section-title"><div><h2>CritterDB connection</h2><p class="muted">Sign in with your own CritterDB account. An edit URL or Discord identity does not grant permission.</p></div><span id="remote-connection-state" class="badge">${labels[connection.state] || 'Failed'}</span></div><div class="row"><input id="remote-url" aria-label="CritterDB creature URL" placeholder="https://critterdb.com/#/creature/edit/…" value="${escape(creatureURL)}"><button id="remote-load" class="primary">Load creature</button></div><div class="toolbar"><button id="remote-tab-connect">Connect existing tab</button><button id="remote-check">Check connection</button><a href="/#library">Connection setup in the main editor</a></div><p id="remote-connection-message" class="muted">${escape(connection.message)}</p></section>`;
  };
  function panelContent(document) {
    const item = record(document);
    let creature = document.data;
    try { if ($('#creature-form')) creature = collectCreature(); } catch {}
    return `<div class="section-title"><div><h3>Linked CritterDB creature</h3><a href="${escape(document.remote.url)}" target="_blank" rel="noopener noreferrer">${escape(document.remote.creatureId)} ↗</a></div><span id="remote-creature-state" class="badge ${item.state === 'saved' ? 'good' : 'warn'}">${labels[item.state] || 'Failed'}</span></div><p id="remote-creature-message" class="muted">${escape(item.message || 'Local save/export and direct CritterDB save are separate actions.')}</p><div class="toolbar"><button id="remote-review">Review pending changes</button><button id="remote-save" class="primary" ${!item.reviewToken || !item.changes.length ? 'disabled' : ''}>Save to CritterDB</button><button id="remote-verify">Verify saved data</button><button id="remote-latest" class="quiet">Load latest remote</button></div><p class="section-note">${item.changes.length} changed field(s). A recoverable original and local edits are kept before saving. No remote save occurs until you click Save to CritterDB.</p><p class="section-note">Avoid simultaneous edits in other windows during a save: CritterDB does not provide an atomic conditional-update contract.</p><div id="remote-changes">${diffHTML(item.changes)}</div>${item.conflicts?.length ? `<div class="warning">The remote data changed elsewhere. Your local edits are retained; no overwrite was sent.</div><details><summary>Changes made elsewhere</summary>${diffHTML(item.conflicts)}</details>` : ''}${item.state === 'saved' ? `<div class="notice">Saved data was reloaded and verified. Published collections may need their publication updated. Existing Avrae encounter creatures may retain old data.<pre class="command-preview">!bestiary update</pre><button id="remote-copy-avrae">Copy !bestiary update</button><p class="small">You send this command to Avrae; Aina posting it does not execute it.</p></div>` : ''}${statBlock(creature)}`;
  }
  window.remoteCreatureHTML = function () {
    const document = linked();
    return document ? `<section id="remote-creature-panel" class="remote-panel">${panelContent(document)}</section>` : '';
  };
  function updateConnection() {
    if ($('#remote-connection-state')) $('#remote-connection-state').textContent = labels[connection.state] || 'Failed';
    if ($('#remote-connection-message')) $('#remote-connection-message').textContent = connection.message;
  }
  function repaint() {
    const document = linked(), panel = $('#remote-creature-panel');
    if (document && panel) { panel.innerHTML = panelContent(document); bindPanel(document); }
    updateConnection();
  }
  function setBusy(value) {
    busy = value;
    $('.shell').inert = value;
    $('#refresh-status').disabled = value;
  }
  function fail(error, document) {
    if (document) {
      const item = record(document); item.state = error.code || 'failed'; item.message = error.details?.verification || error.message;
      item.reviewToken = null; item.conflicts = error.details?.changes || [];
    }
    if (['browser_launch_disabled', 'sign_in_required', 'permission_denied', 'disconnected', 'failed'].includes(error.code)) connection = { state: error.code, message: error.message };
    repaint(); notify(error.message, true);
  }
  async function stageNow(document, creature) {
    draftChain = draftChain.catch(() => {}).then(() => api('remote/draft', 'POST', { documentId: document.id, creature }));
    return draftChain;
  }
  window.remoteCreatureChanged = function () {
    const document = linked(); if (!document) return;
    sequence++;
    const item = record(document); item.state = 'unsaved'; item.reviewToken = null; item.message = 'Unsaved changes. Retaining a local recovery draft…'; item.conflicts = [];
    let creature;
    try { creature = collectCreature(); if (originals.has(document.id)) item.changes = R.diff(originals.get(document.id), creature); }
    catch { item.message = 'Some fields are invalid. Fix them to retain a new recovery draft; the last valid draft is kept.'; repaint(); return; }
    repaint(); clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      stageNow(document, creature).then(() => {
        if (record(document).state === 'unsaved') { record(document).message = 'Unsaved changes retained on this computer. Reconnecting does not discard them.'; repaint(); }
      }).catch(e => fail(e, document));
    }, 650);
  };
  async function flush(document, creature) { clearTimeout(draftTimer); await draftChain.catch(() => {}); await stageNow(document, creature); }
  async function adopt(result) {
    workspace = result.workspace; revision = result.revision; selectedKey = workspace.documents.find(d => d.id === result.documentId).keys[0];
    dirty = false; draft = null; docFilter = ''; page = 'library';
    render();
  }
  async function load(discardLocal = false) {
    if (busy || !canLeave()) return;
    const existing = linked();
    if (existing && dirty) await flush(existing, collectCreature());
    if ($('#remote-url')) creatureURL = $('#remote-url').value.trim();
    const target = R.parseCreatureURL(creatureURL);
    if (discardLocal && !confirm('Keep a recovery backup of your edits and replace the editor with the latest remote creature?')) return;
    connection = { state: 'loading', message: 'Loading the current creature and verifying edit permission…' }; updateConnection(); setBusy(true);
    try {
      const result = await api('remote/load', 'POST', { url: target.url, discardLocal });
      connection = { state: 'connected', message: 'Authenticated CritterDB connection.' };
      records.set(result.documentId, { state: result.state, message: result.message, changes: [], reviewToken: null, conflicts: result.conflict || [] });
      originals.delete(result.documentId); await adopt(result);
      return true;
    } catch (e) { connection = { state: e.code || 'failed', message: e.message }; updateConnection(); notify(e.message, true); }
    finally { setBusy(false); }
  }
  window.bindRemoteConnection = function () {
    bind('remote-url', () => { creatureURL = $('#remote-url').value; }, 'input');
    bind('remote-load', () => load());
    bind('remote-tab-connect', async () => {
      try {
        const tabs = await CritterTabBridge.tabs();
        if (tabs.length !== 1) { notify(tabs.length ? 'Choose your CritterDB tab in the main editor account dialog.' : 'Open CritterDB yourself in this browser, then connect again.', true); return; }
        connection = await CritterTabBridge.connect(tabs[0].id); updateConnection();
      } catch(e) { connection = { state: e.code || 'failed', message: e.message }; updateConnection(); notify(e.message, true); }
    });
    bind('remote-check', async () => {
      try { connection = await api('remote/status'); }
      catch (e) { connection = { state: e.code || 'failed', message: e.message }; }
      updateConnection();
    });
  };
  function bindPanel(document) {
    bind('remote-review', async () => {
      if (busy) return;
      const creature = collectCreature();
      await flush(document, creature); setBusy(true);
      try {
        const result = await api('remote/review', 'POST', { documentId: document.id, creature });
        Object.assign(record(document), result, { message: result.changes.length ? 'Review the changes below, then click Save to CritterDB.' : 'No pending remote changes.', conflicts: [] }); repaint();
      } catch (e) { fail(e, document); } finally { setBusy(false); }
    });
    for (const [id, endpoint] of [['remote-save', 'save'], ['remote-verify', 'verify']]) bind(id, async () => {
      if (busy) return;
      const creature = collectCreature(), item = record(document), reviewToken = item.reviewToken;
      clearTimeout(draftTimer); await draftChain.catch(() => {}); setBusy(true);
      item.state = endpoint === 'save' ? 'saving' : 'loading'; item.message = endpoint === 'save' ? 'Checking for conflicts, saving the same creature, and reloading to verify…' : 'Reloading remote data to check whether your edits persisted…'; repaint();
      try {
        const result = await api('remote/' + endpoint, 'POST', { documentId: document.id, creature, reviewToken });
        records.set(document.id, { state: 'saved', message: result.message, changes: [], reviewToken: null });
        originals.set(document.id, C.clone(result.workspace.documents.find(d => d.id === document.id).data));
        await adopt(result);
      } catch (e) { fail(e, document); } finally { setBusy(false); }
    });
    bind('remote-latest', async () => {
      const creature = collectCreature(); await flush(document, creature);
      creatureURL = document.remote.url; if ($('#remote-url')) $('#remote-url').value = creatureURL;
      // The explicit confirmation in load() applies to replacing local work.
      const wasDirty = dirty; dirty = false;
      try { if (!await load(true)) dirty = wasDirty; } catch (e) { dirty = wasDirty; throw e; }
    });
    bind('remote-copy-avrae', () => copy('!bestiary update'));
  }
  window.bindRemoteEditor = function () {
    const document = linked(); if (!document) return;
    bindPanel(document);
    const generation = sequence;
    let creature; try { creature = collectCreature(); } catch { return; }
    if (originals.has(document.id)) { record(document).changes = R.diff(originals.get(document.id), creature); repaint(); return; }
    api('remote/pending', 'POST', { documentId: document.id, creature }).then(result => {
      originals.set(document.id, result.original);
      if (generation !== sequence || linked()?.id !== document.id) return;
      const item = record(document); item.changes = result.changes;
      if (item.changes.length && !['conflict', 'saved'].includes(item.state)) item.state = 'unsaved';
      repaint();
    }).catch(e => fail(e, document));
  };
  window.startRemoteUI = async function () {
    await CritterTabBridge.restore(); connection = await api('remote/status'); updateConnection();
    const query = new URL(location.href).searchParams.get('critter');
    if (query) {
      try { creatureURL = R.parseCreatureURL(query).url; if ($('#remote-url')) $('#remote-url').value = creatureURL; }
      catch (e) { notify(e.message, true); }
    }
  };
})();
