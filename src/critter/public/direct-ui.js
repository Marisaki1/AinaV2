window.DirectUI = (() => {
  let busy = false, targetKey = '', reviewed = null;
  const state = (label, detail) => { if ($('#direct-state')) $('#direct-state').textContent = label; if ($('#direct-message')) $('#direct-message').textContent = detail || ''; };
  async function perform(fn) {
    if (busy) return; busy = true; $('#direct-root').inert = true;
    try { await fn(); }
    catch (e) { reviewed = null; if ($('#direct-confirm-save')) $('#direct-confirm-save').disabled = true; state(e.code === 'conflict' ? 'Conflict: local edits retained' : e.code === 'sign_in_required' ? 'Sign-in required' : e.code === 'permission_denied' ? 'Permission denied' : 'Operation failed', e.message); if (e.details?.changes) diff(e.details.changes); Feedback.show('CritterDB operation failed', e.details?.verification || e.message, 'error'); }
    finally { busy = false; $('#direct-root').inert = false; }
  }
  function diff(changes) {
    $('#direct-changes').innerHTML = changes.map(c => `<details><summary>${escape(c.path)}</summary><div class="field-grid"><div><strong>CritterDB</strong><pre>${escape(JSON.stringify(c.before, null, 2) ?? '(absent)')}</pre></div><div><strong>Your version</strong><pre>${escape(JSON.stringify(c.after, null, 2) ?? '(absent)')}</pre></div></div></details>`).join('');
  }
  async function adopt(result) {
    workspace = result.workspace; revision = result.revision; analysisCache.delete(targetKey);
    EditorUI.syncRemote(targetKey, result); await renderWorkspace();
  }
  async function review() {
    reviewed = null; $('#direct-confirm-save').disabled = true;
    if (!targetKey) throw new Error('Load a CritterDB creature first.');
    const ref = C.creatures(workspace).find(c => c.key === targetKey); if (!ref) throw new Error('This library creature was removed.');
    const url = $('#direct-url').value.trim(), target = CritterRemote.parseCreatureURL(url);
    if (ref.data._id !== target.id) throw new Error('Use the URL for this same creature. New creatures must first be created/imported in CritterDB.');
    state('Connecting', 'Checking your account and creature permission. Your local edits stay on this computer.');
    const attached = await api('remote/attach', 'POST', { key: targetKey, url, original: ref.data }); await adopt(attached);
    const creature = C.clone(C.creatures(workspace).find(c => c.key === targetKey).data);
    state('Reviewing pending changes', 'Loading the current remote creature and checking for changes made elsewhere.');
    const result = await api('remote/review', 'POST', { documentId: attached.documentId, creature });
    reviewed = { documentId: attached.documentId, creature, reviewToken: result.reviewToken };
    diff(result.changes); $('#direct-confirm-save').disabled = !result.changes.length;
    state(result.changes.length ? 'Unsaved CritterDB changes' : 'No pending CritterDB changes', result.changes.length ? result.changes.length + ' fields differ. Review below, then click Save to CritterDB. This updates the same creature.' : 'This local creature matches your CritterDB creature.');
  }
  async function open(key = '', initialURL = '') {
    targetKey = key; reviewed = null;
    const ref = C.creatures(workspace).find(c => c.key === key);
    $('#direct-root').innerHTML = `<div class="dialog-heading"><h2>${ref ? 'Save ' + escape(ref.data.name) + ' to CritterDB' : 'CritterDB account'}</h2><button id="direct-close">Close</button></div><p id="direct-state" class="trait-state" role="status">Checking connection...</p><p id="direct-message" class="hint"></p><div class="toolbar"><button id="direct-tab-connect" class="primary">Connect existing tab</button><button id="direct-check">Check connection</button></div><div id="direct-tab-choice" hidden><label>CritterDB tab<select id="direct-tab-select"></select></label><button id="direct-tab-use">Use selected tab</button></div><details id="direct-setup"><summary>One-time Brave connection setup</summary><ol><li>In this same Brave profile, open <strong>brave://extensions</strong> yourself and enable <strong>Developer mode</strong>.</li><li>Click <strong>Load unpacked</strong> and select this folder:<pre id="direct-extension-folder"></pre><button id="direct-copy-folder">Copy folder path</button></li><li>Refresh Aina. Open CritterDB yourself and sign in in your usual tab.</li><li>Return here and click <strong>Connect existing tab</strong>.</li></ol><p class="hint">The extension only connects this local editor to your selected CritterDB tab. It never opens or navigates tabs. Login credentials stay on CritterDB. For a custom Aina port, set this address in the extension popup: ${escape(location.origin)}.</p></details><label>CritterDB ${ref ? 'creature' : 'creature or bestiary'} URL<input id="direct-url" placeholder="https://critterdb.com/#/bestiary/view/..." value="${escape(initialURL || (ref?.data._id ? 'https://critterdb.com/#/creature/edit/' + ref.data._id : ''))}"></label><div class="toolbar">${ref ? '<button id="direct-review" class="primary">Review changes for CritterDB</button><button id="direct-confirm-save" class="primary" disabled>Save to CritterDB</button><button id="direct-verify">Verify last save</button><button id="direct-export">Export creature backup</button>' : '<button id="direct-load" class="primary">Load creature or bestiary</button>'}</div><p class="hint">Saving updates the same creature after review, retains a backup, checks for remote changes, then reloads to verify. Bestiary loading includes all its creatures. Creating new account creatures and publishing collections still takes place in CritterDB; JSON import/export remains available.</p><div id="direct-changes"></div><div id="direct-saved"></div>`;
    $('#direct-dialog').showModal();
    $('#direct-close').onclick = () => $('#direct-dialog').close();
    $('#direct-url').oninput = () => { reviewed = null; if ($('#direct-confirm-save')) $('#direct-confirm-save').disabled = true; };
    const check = async () => {
      await CritterTabBridge.restore();
      const result = await api('remote/status');
      state(result.state === 'connected' ? 'Connected to CritterDB' : result.state === 'sign_in_required' ? 'Sign-in required' : 'Connect your existing CritterDB tab', result.message);
      for (const id of ['direct-review', 'direct-load', 'direct-verify']) if ($('#' + id)) $('#' + id).disabled = result.state !== 'connected';
      if (result.state !== 'connected' && $('#direct-confirm-save')) $('#direct-confirm-save').disabled = true;
    };
    const connectTab = async selected => { state('Connecting', 'Checking your selected CritterDB tab.'); await CritterTabBridge.connect(selected); await check(); };
    $('#direct-tab-connect').onclick = () => perform(async () => {
      try {
        const tabs = await CritterTabBridge.tabs();
        if (!tabs.length) { state('Open CritterDB in this browser', 'Open CritterDB yourself and sign in, then click Connect existing tab again.'); return; }
        if (tabs.length === 1) { await connectTab(tabs[0].id); return; }
        $('#direct-tab-select').innerHTML = tabs.map(t => '<option value="' + t.id + '">' + escape(t.title + ' - ' + t.url) + '</option>').join('');
        const exact = tabs.find(t => t.url === $('#direct-url').value.trim()); if (exact) $('#direct-tab-select').value = exact.id;
        $('#direct-tab-choice').hidden = false; state('Choose your CritterDB tab', 'Select the signed-in tab to use.');
      } catch(e) { if (['extension_required', 'extension_update_required'].includes(e.code)) $('#direct-setup').open = true; throw e; }
    });
    $('#direct-tab-use').onclick = () => perform(() => connectTab(Number($('#direct-tab-select').value)));
    let folder = '';
    api('remote/browser/setup').then(r => { folder = r.directory; if ($('#direct-extension-folder')) $('#direct-extension-folder').textContent = folder; }).catch(() => {});
    $('#direct-copy-folder').onclick = () => copy(folder);
    $('#direct-check').onclick = () => perform(check);
    if ($('#direct-review')) $('#direct-review').onclick = () => perform(review);
    if ($('#direct-export')) $('#direct-export').onclick = () => download(ref.data.name + '_CritterDB_backup.json', C.creatures(workspace).find(c => c.key === key).data);
    if ($('#direct-load')) $('#direct-load').onclick = () => perform(async () => {
      const target = CritterSources.parse($('#direct-url').value.trim());
      state('Loading', 'Checking account permission and loading the creature.');
      const result = await api('remote/source', 'POST', { url: $('#direct-url').value.trim() });
      targetKey = result.key || result.workspace.documents.find(d => d.id === result.documentId)?.keys[0] || ''; await adopt(result);
      $('#direct-dialog').close(); ui.tab = 'library'; ui.libraryDocumentId = result.documentId; ui.selectedKey = targetKey; search = ''; remember(); await renderWorkspace();
      if (target.kind === 'creature' && targetKey) await EditorUI.open(targetKey, 'flavor');
      Feedback.show(target.kind === 'creature' ? 'CritterDB creature loaded' : result.conflicts?.length ? 'Bestiary refreshed with conflicts' : 'CritterDB bestiary refreshed', result.message || 'Loaded through your current browser account. Your local edits are retained.', result.conflicts?.length ? 'error' : 'success');
    });
    if ($('#direct-verify')) $('#direct-verify').onclick = () => perform(async () => {
      const links = await api('remote/links'), link = links.links.find(l => l.key === targetKey);
      if (!link) throw new Error('Review this creature first to link its CritterDB record.');
      state('Verifying', 'Read-only reload of the saved creature. No update will be sent.');
      const local = C.clone(C.creatures(workspace).find(c => c.key === targetKey).data);
      const result = await api('remote/verify', 'POST', { documentId: link.documentId, creature: local }); await adopt(result);
      state('Saved to CritterDB and verified', result.message); Feedback.show('CritterDB save verified', 'Read-only reload matches your local edits.');
    });
    if ($('#direct-confirm-save')) $('#direct-confirm-save').onclick = () => perform(async () => {
      if (!reviewed) throw new Error('Review the latest changes first.');
      const intent = reviewed; reviewed = null; $('#direct-confirm-save').disabled = true;
      state('Saving to CritterDB', 'Checking for conflicts, saving, and reloading to verify.');
      const result = await api('remote/save', 'POST', intent); await adopt(result);
      state('Saved to CritterDB and verified', result.message); $('#direct-changes').replaceChildren();
      $('#direct-saved').innerHTML = '<p class="trait-state">Saved and reloaded successfully. Published collections may need their publication updated. Existing encounter copies may retain old data.</p><pre>!bestiary update</pre><button id="direct-copy-update">Copy !bestiary update</button>';
      $('#direct-copy-update').onclick = () => copy('!bestiary update'); Feedback.show('Saved to CritterDB', 'The same creature was reloaded and its changes were verified.');
    });
    try { await CritterTabBridge.restore(); await check(); } catch (e) { state('Connection unavailable', e.message); }
  }
  async function clear() {
    clearTimeout(prefTimer); if (pending) await persist(); await serial.catch(() => {});
    const current = await api('workspace'), snapshot = current.workspace, ref = C.creatures(snapshot).find(c => c.key === ui.selectedKey);
    $('#direct-root').innerHTML = `<div class="dialog-heading"><h2>Clear library</h2><button id="clear-close">Cancel</button></div><p>This removes local library data. It does not delete anything from your CritterDB account or Discord. Prepared rosters are kept and may need their library sources linked again. A recoverable workspace backup is saved before clearing.</p><label>Remove<select id="clear-scope">${ref ? '<option value="creature">Selected creature only</option>' : ''}<option value="document">One loaded file / bestiary</option><option value="all">Entire creature library</option></select></label><label>File / bestiary<select id="clear-document">${snapshot.documents.map(d => `<option value="${escape(d.id)}" ${d.id === ref?.documentId ? 'selected' : ''}>${escape(d.label)}</option>`).join('')}</select></label><div class="toolbar"><button id="clear-backup">Download workspace backup</button><button id="clear-confirm" class="danger">Confirm clear</button></div><p id="clear-error" class="editor-error" role="status"></p>`;
    $('#direct-dialog').showModal(); $('#clear-close').onclick = () => $('#direct-dialog').close();
    $('#clear-backup').onclick = () => download('Aina_before_library_clear.json', snapshot);
    $('#clear-confirm').onclick = async () => {
      const b = $('#clear-confirm'); b.disabled = true;
      try { const result = await api('library/clear', 'POST', { scope: $('#clear-scope').value, documentId: $('#clear-document').value, key: ref?.key, revision: current.revision }); const removedKeys = C.creatures(snapshot).filter(c => $('#clear-scope').value === 'all' || ($('#clear-scope').value === 'document' ? c.documentId === $('#clear-document').value : c.key === ref?.key)).map(c => c.key); EditorUI.forget(removedKeys); TraitsUI.forget(removedKeys); workspace = result.workspace; revision = result.revision; ui.selectedKey = ''; search = ''; for (const key of removedKeys) delete ui.perCreature[key]; if (removedKeys.includes(ui.init.form.sourceKey)) ui.init.form.sourceKey = ''; analysisCache.clear(); $('#direct-dialog').close(); await renderWorkspace(); message(result.removed + ' creatures removed locally. Recovery backup: ' + result.backup); }
      catch (e) { $('#clear-error').textContent = e.message; b.disabled = false; }
    };
  }
  async function refreshLibrary(documentId) {
    const doc = workspace.documents.find(d => d.id === documentId); if (!doc || !/^[a-f0-9]{24}$/.test(doc.data._id || '')) throw new Error('Choose a CritterDB source to refresh.');
    const kind = doc.data.creatures ? doc.source?.kind || (doc.data.owner && !doc.data.ownerId ? 'publishedbestiary' : 'bestiary') : 'creature';
    const url = doc.source?.url || 'https://critterdb.com/#/' + kind + '/view/' + doc.data._id;
    await CritterTabBridge.restore();
    const connection = await api('remote/status');
    if (connection.state !== 'connected') { await open('', url); return; }
    const previousKey = ui.selectedKey;
    const button = $('#library-sync'); if (button) { button.disabled = true; button.textContent = 'Refreshing...'; }
    try {
      const result = await api('remote/source', 'POST', { url }); workspace = result.workspace; revision = result.revision;
      ui.libraryDocumentId = result.documentId; ui.selectedKey = C.creatures(workspace).some(c => c.key === previousKey) ? previousKey : result.key || '';
      search = ''; analysisCache.clear(); remember(); await renderWorkspace();
      Feedback.show(result.conflicts?.length ? 'Source refreshed with conflicts' : 'Source refreshed', result.message, result.conflicts?.length ? 'error' : 'success');
    } finally { if (button?.isConnected) { button.disabled = false; button.textContent = 'Refresh source'; } }
  }
  return { open, clear, refreshLibrary };
})();
