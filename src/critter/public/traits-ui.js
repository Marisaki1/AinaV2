/* Shares the existing desk's source selection, revision handling, and local-only API. */
window.TraitsUI = (() => {
  const drafts = new Map();
  let conditions = [];
  function config(key) { return workspace.combatTraits?.[key] || null; }
  function resetConditions() { conditions = []; }
  function choices() { return conditions; }
  function conditionalHTML(ref, opts) {
    if (!['saves', 'checks'].includes(opts.category) || !opts.check || ui.tab !== 'combat') return '';
    const rows = CombatTraits.rollTraits(config(ref.key), opts.category === 'saves' ? 'save' : 'check', opts.check);
    return rows.map(t => t.restriction.trim() ? `<label class="check-row"><input type="checkbox" data-trait-condition="${escape(t.id)}" ${conditions.includes(t.id) ? 'checked' : ''}><span>${escape(t.mode === 'adv' ? 'Advantage' : 'Disadvantage')} only for this roll: ${escape(t.restriction)}<small>${escape(t.rules)}</small></span></label>` : `<p class="hint">${escape(t.rules)}: ${escape(t.mode)} flag included for this base ability check.</p>`).join('');
  }
  function bindConditions() { document.querySelectorAll('[data-trait-condition]').forEach(n => n.onchange = () => { conditions = [...document.querySelectorAll('[data-trait-condition]:checked')].map(n => n.dataset.traitCondition); updatePreviewOnly(); }); }
  function draft(ref) {
    if (drafts.has(ref.key) && !drafts.get(ref.key).dirty && JSON.stringify(drafts.get(ref.key).previous) !== JSON.stringify(config(ref.key))) drafts.delete(ref.key);
    if (!drafts.has(ref.key)) {
      const previous = C.clone(config(ref.key)), state = { previous, config: previous || { id: uid().replace(/-/g, ''), traits: [] }, dirty: false, preview: null, open: null };
      try { const recovered = JSON.parse(localStorage.getItem('aina-traits-draft:' + ref.key) || 'null'); if (recovered) Object.assign(state, recovered, { dirty: true, preview: null }); } catch {}
      drafts.set(ref.key, state);
    }
    return drafts.get(ref.key);
  }
  function retain(ref, state) { state.dirty = true; state.preview = null; try { localStorage.setItem('aina-traits-draft:' + ref.key, JSON.stringify({ previous: state.previous, config: state.config })); } catch { message('Browser draft storage is unavailable. Export the trait draft before closing this page.', true); } }
  function dirty() { return [...drafts.values()].some(s => s.dirty); }
  function render(ref) {
    const T = CombatTraits, state = draft(ref), actor = ui.tab === 'combat' ? selectedRoster() : null;
    $('#ability-list').innerHTML = `<div class="panel-heading"><div><h2>Avrae Combat Traits</h2><p class="hint">Temporary effects are separate from base stats. Configured for source ${escape(ref.data.name)}; each combatant needs its own setup.</p></div><button id="trait-add">Add trait</button></div><p class="trait-state">Application status unknown — no verified connection to Avrae combat state.</p><div class="trait-cards">${state.config.traits.map((t, i) => `<article class="ability-card"><div class="trait-overview"><strong>${escape(t.rules || 'New trait')}</strong><span>${escape(T.scopes[t.scope])}${t.selected.length ? ': ' + t.selected.map(T.label).map(escape).join(', ') : ''} &middot; ${t.mode === 'adv' ? 'Advantage' : 'Disadvantage'}</span><span>${t.restriction.trim() ? 'Only when: ' + escape(t.restriction) : 'Unconditional'}</span><small>${state.dirty ? 'Pending preview; saved automation unchanged. ' : ''}${escape(T.coverage(t))}. Application status unknown.</small></div><details data-trait-editor="${i}" ${state.open === i ? 'open' : ''}><summary>Edit settings</summary><div class="stack"><div class="panel-heading"><h3>Trait ${i + 1}</h3><button class="small danger" data-trait-delete="${i}">Delete configuration</button></div><label>Rules description<textarea data-trait-field="rules" data-trait-index="${i}" rows="2">${escape(t.rules)}</textarea></label><div class="trait-grid"><label>Scope<select data-trait-field="scope" data-trait-index="${i}">${Object.entries(T.scopes).map(([v, label]) => `<option value="${v}" ${v === t.scope ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label><label>Roll modifier<select data-trait-field="mode" data-trait-index="${i}"><option value="adv" ${t.mode === 'adv' ? 'selected' : ''}>Advantage</option><option value="dis" ${t.mode === 'dis' ? 'selected' : ''}>Disadvantage</option></select></label></div>${['saves', 'skills', 'abilities'].includes(t.scope) ? `<fieldset><legend>${t.scope === 'skills' ? 'Skills' : 'Abilities'}</legend><div class="trait-grid">${(t.scope === 'skills' ? T.skills : C.abilities).map(v => `<label class="check-row"><input type="checkbox" data-trait-select="${i}" value="${v}" ${t.selected.includes(v) ? 'checked' : ''}>${escape(T.label(v))}</label>`).join('')}</div></fieldset>` : ''}<label>Condition or restriction (blank = unconditional)<input data-trait-field="restriction" data-trait-index="${i}" value="${escape(t.restriction)}" placeholder="e.g. Saves against spells"></label></div></details></article>`).join('') || '<p class="empty">No configured modifiers. Add only traits your creature already has.</p>'}</div><div class="toolbar"><button id="trait-review" class="primary">Preview generated automation</button><button id="trait-backup">Export workspace backup</button><button id="trait-draft-backup">Export trait draft</button><button id="trait-update">Prepare !bestiary update</button><button id="trait-discard">Reload saved configuration</button></div><p id="trait-draft-state" class="hint">${state.dirty ? 'Unsaved draft retained in this browser.' : 'Configuration saved locally with the workspace.'}</p><div id="trait-review-panel"></div><details><summary>Activation & coverage</summary><p>Export the creature or bestiary, update CritterDB and its publication, then run !bestiary update yourself. Existing combatants may retain old actions; test with newly added copies. Importing does not activate effects.</p><p>Saving throws and selected skills get passive effects. Base ability effects in Avrae also affect related skills, including initiative for Dexterity. To keep your chosen scope exact, base checks use explicit command flags here. All checks covers six base checks plus 18 skills, with initiative excluded. Conditional traits always require a choice for each roll. Exported setup instructions explain the manual flags outside this editor.</p><p>Setup Traits is an integration utility with no in-game power, action cost, concentration, or resource cost. Reapplying replaces only the stable named Aina effect. Never attach unrelated child effects to it. Avrae may prompt for ambiguous combatant names; choose the exact copy.</p></details>${actor ? `<div class="toolbar"><button id="trait-setup">Prepare setup / replace</button><button id="trait-remove">Prepare effect removal</button><button id="trait-status">Inspect combatant effects</button></div>` : '<p class="hint">Select an encounter combatant in Combat for setup, removal and inspection commands. Setup Commands in Initiative adds all creatures first, then prepares each copy’s trait setup.</p>'}`;
    document.querySelectorAll('[data-trait-editor]').forEach(n => n.ontoggle = () => { if (!n.isConnected) return; if (n.open) state.open = Number(n.dataset.traitEditor); else if (state.open === Number(n.dataset.traitEditor)) state.open = null; });
    const changed = () => { retain(ref, state); $('#trait-draft-state').textContent = 'Unsaved draft retained in this browser.'; $('#trait-review-panel').replaceChildren(); };
    document.querySelectorAll('[data-trait-field]').forEach(n => n.addEventListener(n.tagName === 'SELECT' ? 'change' : 'input', () => { const t = state.config.traits[Number(n.dataset.traitIndex)]; t[n.dataset.traitField] = n.value; if (n.dataset.traitField === 'scope') { t.selected = []; changed(); render(ref); } else changed(); }));
    document.querySelectorAll('[data-trait-select]').forEach(n => n.onchange = () => { const i = Number(n.dataset.traitSelect); state.config.traits[i].selected = [...document.querySelectorAll(`[data-trait-select="${i}"]:checked`)].map(n => n.value); changed(); });
    document.querySelectorAll('[data-trait-delete]').forEach(n => n.onclick = () => { state.config.traits.splice(Number(n.dataset.traitDelete), 1); changed(); render(ref); });
    bind('trait-add', () => { state.open = state.config.traits.length; state.config.traits.push({ id: uid(), rules: '', scope: 'saves', selected: [], mode: 'adv', restriction: '' }); changed(); render(ref); });
    bind('trait-draft-backup', () => download('Aina_Trait_Draft.json', { key: ref.key, previous: state.previous, config: state.config }));
    bind('trait-update', () => { if (!config(ref.key)) throw new Error('Review and save the configuration first.'); options().traitIntent = 'update'; renderCommand(); });
    bind('trait-backup', () => download('Aina_Workspace_Backup.json', workspace));
    bind('trait-discard', () => { try { localStorage.removeItem('aina-traits-draft:' + ref.key); } catch {} drafts.delete(ref.key); render(ref); });
    bind('trait-review', async () => {
      T.validate(state.config); const snapshot = C.clone(state.config);
      const reviewed = await api('combat-traits/preview', 'POST', { key: ref.key, config: snapshot });
      if (JSON.stringify(reviewed.previous) !== JSON.stringify(state.previous)) throw new Error('Traits changed elsewhere. Export your draft before reloading the saved configuration.');
      if (JSON.stringify(snapshot) !== JSON.stringify(state.config)) throw new Error('Draft changed while preparing preview. Review again.');
      state.preview = reviewed;
      $('#trait-review-panel').innerHTML = `<h3>${reviewed.before ? 'Replace this generated utility only' : 'Append one integration utility'}</h3><p>All other actions, descriptions, hidden automation and stats are preserved. This saves locally; export / CritterDB save remains explicit.</p><details><summary>Previous generated action</summary><pre>${escape(reviewed.before ? JSON.stringify(reviewed.before, null, 2) : 'None')}</pre></details><h3>Proposed action and hidden YAML</h3><pre class="trait-code">${escape(reviewed.after.description)}</pre><button id="trait-confirm" class="primary">Save reviewed traits locally</button><button id="trait-export-draft">Export trait draft backup</button>`;
      bind('trait-export-draft', () => download('Aina_Trait_Draft.json', { key: ref.key, ...state }));
      bind('trait-confirm', async () => {
        if (!state.preview || JSON.stringify(snapshot) !== JSON.stringify(state.config)) throw new Error('Review the latest changes first.');
        const button = $('#trait-confirm'), panel = $('#ability-list'); button.disabled = true; panel.inert = true;
        try {
          await serial.catch(() => {});
          const result = await api('combat-traits', 'PUT', { key: ref.key, config: snapshot, original: reviewed.original, previous: reviewed.previous });
          workspace = result.workspace; revision = result.revision; localStorage.removeItem('aina-traits-draft:' + ref.key); drafts.delete(ref.key); analysisCache.delete(ref.key); await renderWorkspace(); message('Traits saved locally. Export and update your bestiary before preparing new combatants. Application status unknown.');
        } finally { panel.inert = false; if (button.isConnected) button.disabled = false; }
      });
    });
    for (const [id, intent] of [['trait-setup', 'setup'], ['trait-remove', 'remove'], ['trait-status', 'status']]) bind(id, () => { if (!config(ref.key)) throw new Error('Review and save the configuration first.'); options().traitIntent = intent; renderCommand(); });
    renderCommand();
  }
  return { render, config, dirty, forget: keys => keys.forEach(key => drafts.delete(key)), resetConditions, choices, conditionalHTML, bindConditions };
})();
