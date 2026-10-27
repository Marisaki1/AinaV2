window.MirrorUI = (() => {
  'use strict';
  const Model = window.MirrorModel;
  let rollChoices = [];
  let view = { revision: -1, locations: {} }, renderGeneration = 0, endConfirmed = null, endPending = null, timer, filter = '', search = '', built = null;
  const kinds = { begin: 'Start combat', action: 'Action', cast: 'Cast spell', source: 'Source creature action', save: 'Saving throw', check: 'Ability / skill check', hp: 'Adjust HP', hpSet: 'Set current HP', thp: 'Temporary HP', opt: 'Initiative / AC', effectAdd: 'Add descriptive effect', effectRemove: 'Remove named effect', status: 'Inspect combatant', next: 'Next turn', remove: 'Remove combatant', add: 'Add imported creatures', end: 'End combat' };
  const field = f => !f || f.status === 'unavailable' ? 'Unavailable' : f.status === 'hidden' ? 'Hidden' : String(f.value);
  const data = f => f?.status === 'known' ? f.value : null;
  function commandSpec() { const l = location(); return { ...spec(), traitChoices: rollChoices.slice(), confirmEnd: !!l && endConfirmed === l.key + ':' + l.snapshot?.requestId }; }
  function location() { return view.locations[ui.mirrorKey] || null; }
  function selected() { return location()?.snapshot?.combatants.find(u => u.id === spec().actorId); }
  function spec() {
    ui.mirrorSpecs ||= {}; const key = ui.mirrorKey || 'unconfigured';
    return ui.mirrorSpecs[key] ||= { kind: 'action', actorId: '', targetIds: [], scope: 'named', action: '', roll: 'normal', critical: 'normal', attackBonus: '', damageBonus: '', repeat: '1', stat: 'dex', value: '', initiative: '', ac: '', effect: '', description: '', duration: '', level: '', confirmEnd: false, sourceKey: '', addName: '', quantity: '1', initiativeRoll: 'normal', fixedInitiative: '', initiativeBonus: '', controller: '', presetName: '' };
  }
  function currentCommands() {
    const l = location(); if (!l?.snapshot) throw new Error('Load and review a snapshot first.');
    return spec().kind === 'add' ? Model.addCommands(l.snapshot, spec(), workspace, l.prefix) : [Model.command(l.snapshot, commandSpec(), l.prefix, workspace)];
  }
  function saveChoice() { built = null; remember(); preview(); }
  function downloadText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reloadWorkspace() { const fresh = await api('workspace'); workspace = fresh.workspace; revision = fresh.revision; }
  async function fetchView() { view = await api('mirror'); }
  function stateText() {
    const l = location(); if (!l) return 'Select a channel and configure its mirror source.';
    if (l.error) return l.error;
    if (l.candidate) return 'New snapshot received — review it before updating the mirror.';
    if (l.request) return Date.now() > l.request.expiresAt ? 'Export request expired. Prepare a fresh refresh command.' : `Waiting for your export${l.request.total ? ': ' + l.request.received + ' / ' + l.request.total + ' parts' : ''}. Send the command to Avrae yourself.`;
    return l.snapshot ? 'Displaying an owner-reviewed snapshot. It may be stale.' : 'No snapshot received yet.';
  }
  function renderSelection() {
    const l = location(), snap = l?.snapshot, d = spec();
    const rows = (snap?.combatants || []).filter(u => (u.name + ' ' + (snap.groups.find(g => g.id === u.groupId)?.name || '')).toLowerCase().includes(search.toLowerCase()) && (filter === '' || filter === 'current' && Model.isCurrent(snap, u) || filter === 'hidden' && u.hidden || filter === 'zero' && data(u.hp) === 0));
    $('#selection-panel').innerHTML = `<h2>Encounter mirror</h2><label>Discord location<select id="mirror-location"><option value="">Choose a configured channel</option>${Object.values(view.locations).map(v => `<option value="${escape(v.key)}" ${v.key === ui.mirrorKey ? 'selected' : ''}>${escape(v.label)}</option>`).join('')}</select></label><button id="mirror-configure" class="full">Use selected channel above</button><details><summary>Offline source / bot settings</summary><div class="stack"><label>Server ID<input id="mirror-guild" value="${escape(l?.guildId || ui.guildId || '')}"></label><label>Channel ID<input id="mirror-channel" value="${escape(l?.channelId || ui.channelId || '')}"></label><label>Avrae bot ID<input id="mirror-bot" value="${escape(l?.avraeId || '261302296103747584')}"></label><button id="mirror-configure-manual">Save source</button></div></details><hr><label>Find combatants<input id="mirror-search" type="search" value="${escape(search)}" placeholder="Name or initiative group"></label><label>Show<select id="mirror-filter"><option value="">All combatants</option><option value="current">Current turn / group</option><option value="hidden">Hidden stats</option><option value="zero">Zero HP</option></select></label><p class="hint">Click a name to act. Tick Target to select one or more targets.</p><div class="roster-list mirror-roster">${rows.map(u => `<div class="initiative-target-row"><label class="check-row target-toggle"><input type="checkbox" data-mirror-target="${escape(u.id)}" ${(d.targetIds || []).includes(u.id) ? 'checked' : ''} aria-label="Target ${escape(u.name)}">Target</label><button data-mirror-actor="${escape(u.id)}" class="roster-button ${u.id === d.actorId ? 'selected' : ''} ${Model.isCurrent(snap, u) ? 'current-turn' : ''}"><span class="initiative-chip">${u.initiative}</span><span><strong>${escape(u.name)}</strong><small>${u.groupId ? escape(snap.groups.find(g => g.id === u.groupId)?.name || '') + ' · ' : ''}${Model.isCurrent(snap, u) ? 'Current turn · ' : ''}HP ${escape(field(u.hp))}</small></span></button></div>`).join('') || '<p class="empty">No combatants in this view.</p>'}</div>`;
    $('#mirror-filter').value = filter;
    bind('mirror-location', async e => {
      ui.mirrorKey = e.target.value; const l = location(); if (l) { ui.guildId = l.guildId; ui.channelId = l.channelId; renderDestination(); } built = null; remember(); await render();
    }, 'change');
    async function configure(manual) {
      const channel = channels.find(c => c.id === ui.channelId);
      const guildId = manual ? $('#mirror-guild').value.trim() : channel?.guildId, channelId = manual ? $('#mirror-channel').value.trim() : channel?.id;
      if (!guildId || !channelId) throw new Error('Choose a Discord server and channel above, or enter their IDs in Offline source settings.');
      view = await api('mirror/configure', 'POST', { guildId, channelId, avraeId: $('#mirror-bot').value.trim(), prefix: ui.prefix, label: channel?.name || guildId + ' / ' + channelId });
      ui.mirrorKey = Model.key(guildId, channelId); remember(); await render(); message('Source configured. Download the alias once, then prepare a refresh command.');
    }
    bind('mirror-configure', () => configure(false)); bind('mirror-configure-manual', () => configure(true));
    bind('mirror-filter', e => { filter = e.target.value; renderSelection(); }, 'change');
    bind('mirror-search', e => { const at = e.target.selectionStart; search = e.target.value; renderSelection(); $('#mirror-search').focus(); $('#mirror-search').setSelectionRange(at, at); }, 'input');
    bindTargets();
    document.querySelectorAll('[data-mirror-actor]').forEach(b => b.onclick = () => { rollChoices = []; const d = spec(); d.actorId = b.dataset.mirrorActor; d.action = ''; d.scope = 'named'; d.confirmEnd = false; built = null; remember(); renderSelection(); renderContent(); renderCommand(); });
  }
  function bindTargets() {
    document.querySelectorAll('[data-mirror-target]').forEach(n => n.onchange = () => {
      const d = spec(), id = n.dataset.mirrorTarget; d.targetIds = [...new Set(n.checked ? [...(d.targetIds || []), id] : (d.targetIds || []).filter(t => t !== id))].filter(t => location().snapshot.combatants.some(u => u.id === t));
      saveChoice(); renderSelection(); renderCommand();
    });
  }
  async function retrieve() {
    if (!ui.channelId || !ui.guildId) throw new Error('Choose the Discord server and encounter channel in the top bar first.');
    await fetchView(); const key = Model.key(ui.guildId, ui.channelId);
    if (!view.locations[key]) {
      const ch = channels.find(c => c.id === ui.channelId);
      view = await api('mirror/configure', 'POST', { guildId: ui.guildId, channelId: ui.channelId, avraeId: '261302296103747584', prefix: ui.prefix, label: ch?.name || ui.channelId });
    }
    ui.mirrorKey = key; ui.tab = 'mirror'; history.pushState(null, '', '#mirror'); remember(); await renderWorkspace(); await refresh();
  }
  async function addRoster() {
    const l = location(), snap = l?.snapshot; if (!snap?.active) throw new Error('Load and review an active encounter first.');
    let result;
    await mutate(w => { result = Authoring.roster(snap, l.key, C.creatures(w), w.currentEncounter.entries); w.currentEncounter.entries = M.ordered(result.rows); });
    ui.tab = 'combat'; ui.rosterKey = ''; remember(); await renderWorkspace();
    message('Reviewed initiative copied to your prepared roster. This is a snapshot, not live combat state.' + (result.unresolved.length ? ' Link library sources in Initiative for: ' + result.unresolved.join(', ') : ''));
  }
  function renderInbox() {
    if (!$('#mirror-inbox')) return;
    const l = location(), pending = l?.candidate;
    $('#mirror-live-state').textContent = stateText();
    $('#mirror-inbox').innerHTML = `${l?.request ? `<div class="mirror-export-command"><p>Send this yourself in <strong>${escape(l.label)}</strong>:</p><pre>${escape(l.request.command)}</pre><button id="mirror-copy-export" class="small">Copy export command</button></div>` : ''}${pending ? `<div class="mirror-pending"><strong>${pending.provenance.kind === 'manual-owner-import' ? 'Manual import — Discord origin unverified' : 'Owner export context verified'}</strong><p>${pending.snapshot.active ? pending.snapshot.combatants.length + ' combatants · round ' + (pending.snapshot.round ?? 'unavailable') : 'No active encounter'} · exported ${escape(new Date(pending.snapshot.exportedAt).toLocaleString())}</p><button id="mirror-review" class="primary">Review incoming snapshot</button></div>` : ''}`;
    bind('mirror-copy-export', () => copy(l.request.command)); bind('mirror-review', review);
  }
  function renderContent() {
    const l = location(), snap = l?.snapshot, u = selected();
    $('#content-panel').innerHTML = `<div class="panel-heading"><div><div class="eyebrow">AVRAE IS AUTHORITATIVE</div><h1>${escape(snap?.name || 'Discord encounter')}</h1><p class="muted">${escape(l?.label || 'No configured channel')}${l ? `<br>Server ${escape(l.guildId)} · channel ${escape(l.channelId)}` : ''}</p></div>${snap ? `<span class="badge">${snap.active ? 'Round ' + (snap.round ?? 'unavailable') : 'No active encounter'}</span>` : ''}</div><div class="mirror-toolbar toolbar"><button id="mirror-refresh" class="primary" ${!l ? 'disabled' : ''}>Refresh from Avrae…</button><button id="mirror-to-roster" ${!snap?.active ? 'disabled' : ''}>Use initiative in Combat controls</button><button id="mirror-alias" ${!l ? 'disabled' : ''}>Download export alias</button><button id="mirror-import-button" ${!l ? 'disabled' : ''}>Import snapshot JSON</button></div><section class="bridge-setup"><h3>First-time setup</h3><ol><li>Download the export alias above.</li><li>Attach <code>ainaexport.txt</code> to this Discord message: <pre>${escape((l?.prefix || '!') + 'alias ainaexport')}</pre><button id="mirror-copy-install" ${!l ? 'disabled' : ''}>Copy installation command</button> Wait for Avrae to confirm installation.</li><li>Click Retrieve initiative, copy the fresh export command below, and send it yourself in this channel.</li></ol><button id="mirror-diagnose" ${!l ? 'disabled' : ''}>Check why encounter is not loading</button><div id="mirror-diagnostics" role="status"></div></section><input id="mirror-import" type="file" accept=".json,.txt,application/json,text/plain" hidden><details ${!l ? 'hidden' : ''}><summary>Paste export messages instead</summary><label>Paste every AINA-SNAPSHOT/1 message from one export<textarea id="mirror-paste" rows="5"></textarea></label><button id="mirror-paste-import">Import for review</button></details><p id="mirror-live-state" class="trait-state" role="status"></p><div id="mirror-inbox"></div>${snap ? `<p class="hint">Snapshot: ${escape(new Date(snap.exportedAt).toLocaleString())} · <span id="mirror-age"></span> · ${l.provenance?.kind === 'manual-owner-import' ? 'manual owner import; source unverified' : 'owner-reviewed Avrae export'}. Aina does not change it when you generate or copy a command.</p>` : '<p class="empty">Install the read-only export alias, run the refresh command in the encounter channel, then review the returned snapshot. You can also import an exported JSON file.</p>'}<div id="mirror-unit">${u ? unitHTML(u, snap) : snap?.combatants.length ? '<p class="empty">Select a combatant from the initiative list.</p>' : ''}</div><details><summary>Bridge setup & field limits</summary><p>Download <code>ainaexport.txt</code>. In Discord attach it to a message containing <code>${escape(l?.prefix || '!')}alias ainaexport</code>. This installs your personal alias; no character is required. Use the exact Refresh command shown here, in this channel. Avrae emits up to 20 small parts over about 20 seconds. Aina collects only its configured Avrae source and your requested owner export. You must review the snapshot before use.</p><p>Private HP/AC/resistances/source names/actions/spells are withheld. Effect names and public timing are available; descriptions and passive dictionaries are omitted. No slots, counters, automatic conditions, or execution confirmation are inferred. Alias output is public-channel data. Manual imports are explicitly unverified.</p><p>Refresh cannot send the alias for you. After executing an Avrae command, run a new export. If Aina reconnects mid-export, prepare a fresh request. Large exports over 30,000 characters fail instead of truncating.</p><div class="toolbar"><button id="mirror-download-snapshot" ${!snap ? 'disabled' : ''}>Export displayed snapshot</button></div></details>`;
    bind('mirror-copy-install', () => copy(l.prefix + 'alias ainaexport'));
    bind('mirror-diagnose', async () => { $('#mirror-diagnostics').textContent = 'Checking recent installation commands and Avrae replies...'; const result = await api('mirror/diagnose', 'POST', { key: l.key }); $('#mirror-diagnostics').innerHTML = '<p>' + escape(result.message) + '</p>' + (result.reply ? '<pre>' + escape(result.reply) + '</pre>' : ''); Feedback.show('Encounter connection check', result.message, 'info'); });
    bind('mirror-refresh', refresh); bind('mirror-to-roster', addRoster);
    bind('mirror-alias', async () => { const result = await api('mirror/alias'); downloadText('ainaexport.txt', result.code); message('Attach ainaexport.txt to your Discord message: ' + l.prefix + 'alias ainaexport'); });
    bind('mirror-import-button', () => $('#mirror-import').click());
    bind('mirror-import', async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 1024 * 1024) throw new Error('Snapshot exceeds 1 MB.'); view = await api('mirror/import', 'POST', { key: l.key, text: await f.text() }); e.target.value = ''; renderInbox(); }, 'change');
    bind('mirror-paste-import', async () => { view = await api('mirror/import', 'POST', { key: l.key, text: $('#mirror-paste').value }); renderInbox(); });
    bind('mirror-download-snapshot', () => download('Avrae_Encounter_Snapshot.json', snap));
    document.querySelectorAll('[data-mirror-action]').forEach(b => b.onclick = () => { spec().kind = 'action'; spec().action = b.dataset.mirrorAction; saveChoice(); renderCommand(); });
    renderInbox(); age();
  }
  function unitHTML(u, snap) {
    const effects = data(u.effects), actions = data(u.actions);
    return `<article class="mirror-combatant"><div class="panel-heading"><div><h2>${escape(u.name)}</h2><p class="hint">${Model.isCurrent(snap, u) ? 'Current turn · ' : ''}Initiative ${u.initiative}${u.groupId ? ' · ' + escape(snap.groups.find(g => g.id === u.groupId)?.name || '') : ''}<br>Source: ${escape(field(u.sourceName))}<br>Combatant ID: ${escape(u.id)}</p></div></div><div class="mirror-stat-grid"><div><span>Current HP</span><strong>${escape(field(u.hp))}</strong></div><div><span>Maximum HP</span><strong>${escape(field(u.maxHp))}</strong></div><div><span>Temporary HP</span><strong>${escape(field(u.tempHp))}</strong></div><div><span>AC</span><strong>${escape(field(u.ac))}</strong></div></div><p class="hint">Controller: ${escape(u.controllerId || 'Unavailable')}</p><div class="mirror-resists">${['resistances', 'immunities', 'vulnerabilities'].map(k => `<p><strong>${k[0].toUpperCase() + k.slice(1)}:</strong> ${escape(data(u[k])?.join(', ') || (u[k].status === 'known' ? 'None' : field(u[k])))}</p>`).join('')}</div><h3>Effects from snapshot</h3>${effects ? effects.map(e => `<div class="mirror-effect"><strong>${escape(e.name)}</strong><span>${e.remaining == null ? 'Duration unavailable' : e.remaining < 0 ? 'Indefinite' : e.remaining + ' rounds remaining'}${e.duration == null ? '' : ' · original duration ' + e.duration}${e.concentration ? ' · concentration' : ''}${e.ticksOnEnd ? ' · ticks at turn end' : ''}</span></div>`).join('') || '<p class="hint">No effects reported.</p>' : `<p class="hint">${escape(field(u.effects))}</p>`}<h3>Available action names</h3><div class="mirror-action-list">${actions ? actions.map(name => `<button data-mirror-action="${escape(name)}">${escape(name)}</button>`).join('') || '<p class="hint">No action names reported.</p>' : `<p class="hint">${escape(field(u.actions))}. You can type an action you know in the command panel.</p>`}</div></article>`;
  }
  function review() {
    const l = location(), candidate = l?.candidate; if (!candidate) throw new Error('No pending snapshot.');
    const old = l.snapshot, snap = candidate.snapshot;
    const added = snap.combatants.filter(u => !old?.combatants.some(o => o.id === u.id)), removed = (old?.combatants || []).filter(o => !snap.combatants.some(u => u.id === o.id));
    $('#mirror-review-root').innerHTML = `<div class="dialog-heading"><h2>Review encounter snapshot</h2><button id="mirror-review-close" aria-label="Close">×</button></div><p>${escape(l.label)} · ${escape(new Date(snap.exportedAt).toLocaleString())}</p><p class="trait-state">${candidate.provenance.kind === 'manual-owner-import' ? 'Manual import: Discord provenance has not been verified. Review the data before accepting.' : 'Collected from the configured Avrae bot with verified owner invocation context. The signature does not sign the JSON content; review the data before accepting.'}</p><p>${snap.active ? 'Round ' + (snap.round ?? 'unavailable') + ' · ' + snap.combatants.length + ' combatants' : 'This export reports no active encounter. Accepting clears only this channel’s displayed mirror.'}<br>Added: ${escape(added.map(u => u.name).join(', ') || 'None')}<br>Removed: ${escape(removed.map(u => u.name).join(', ') || 'None')}</p><div class="mirror-review-list">${snap.combatants.map(u => { const before = old?.combatants.find(o => o.id === u.id); return `<article><strong>${escape(u.name)}</strong><small>ID ${escape(u.id)}${before && before.name !== u.name ? ' · previously ' + escape(before.name) : ''}</small><p>HP ${before ? escape(field(before.hp)) + ' → ' : ''}${escape(field(u.hp))} · THP ${escape(field(u.tempHp))} · AC ${escape(field(u.ac))}<br>Effects: ${escape(data(u.effects)?.map(e => e.name).join(', ') || (u.effects.status === 'known' ? 'None' : field(u.effects)))}</p></article>`; }).join('')}</div><div class="toolbar"><button id="mirror-accept" class="primary">Use this snapshot</button><button id="mirror-export-pending">Export pending snapshot</button></div><p class="hint">This updates the mirror only. It does not execute any command or confirm an earlier command.</p>`;
    $('#mirror-review-dialog').showModal(); bind('mirror-review-close', () => $('#mirror-review-dialog').close());
    bind('mirror-export-pending', () => download('Avrae_Pending_Snapshot.json', snap));
    bind('mirror-accept', async () => { view = await api('mirror/accept', 'POST', { key: l.key, candidateId: candidate.id }); $('#mirror-review-dialog').close(); built = null; spec().confirmEnd = false; await render(); message('Mirror updated from the reviewed snapshot. Avrae remains authoritative.'); });
  }
  function rollTraitHTML(snap, u, d) {
    if (!snap || !u || !['save', 'check'].includes(d.kind)) return '';
    return CombatTraits.rollTraits(Model.rollConfig(snap, u, workspace), d.kind, d.stat).map(t => t.restriction.trim() ? `<label class="check-row"><input type="checkbox" data-mirror-trait="${escape(t.id)}" ${rollChoices.includes(t.id) ? 'checked' : ''}><span>${escape(t.mode)} only for this roll: ${escape(t.restriction)}</span></label>` : `<p class="hint">${escape(t.rules)}: ${escape(t.mode)} flag included for this base check.</p>`).join('');
  }
  function input(id, label, value, placeholder = '', type = 'text') { return `<label>${label}<input id="mirror-${id}" type="${type}" value="${escape(value ?? '')}" placeholder="${escape(placeholder)}"></label>`; }
  function renderCommand() {
    if (ui?.tab !== 'mirror') return;
    const l = location(), snap = l?.snapshot, d = spec(), u = selected(), actionKind = ['action', 'cast', 'source'].includes(d.kind);
    $('#command-panel').innerHTML = `<div><div class="eyebrow">COMMANDS FOR THIS CHANNEL</div><h2>Prepare & copy</h2><p class="hint">${escape(l?.label || 'Choose a source channel')}</p><div class="stack"><label>Command<select id="mirror-kind">${Object.entries(kinds).map(([k, label]) => `<option value="${k}" ${k === d.kind ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${!['add', 'begin', 'next', 'end'].includes(d.kind) ? `<p class="hint">Actor: <strong>${escape(u?.name || 'Select from the initiative list')}</strong></p>` : ''}${actionKind ? `${d.kind !== 'source' ? `<details><summary>Actor mode</summary><label>Use<select id="mirror-scope"><option value="named">Named combatant (safe off turn)</option><option value="current" ${snap?.currentId !== u?.id ? 'disabled' : ''}>Current turn</option>${d.kind === 'cast' ? `<option value="source" ${u?.sourceName.status !== 'known' ? 'disabled' : ''}>Source creature (ignores encounter state)</option>` : ''}</select></label></details>` : '<p class="hint">Source lookup uses the original creature, ignoring live encounter effects.</p>'}${input('action', d.kind === 'cast' ? 'Spell name' : 'Action name', d.action)}${AuthoringUI.select('mirror-damageChoice', 'Ability damage choice (optional)', [['', 'No choice argument'], ...Authoring.damageTypes], d.damageChoice || '')}<datalist id="mirror-action-names">${(data(d.kind === 'cast' ? u?.spells : u?.actions) || []).map(a => `<option value="${escape(a)}"></option>`).join('')}</datalist><fieldset id="mirror-targets"><legend>Targets ? initiative order</legend><div class="target-list">${(snap?.combatants || []).map(t => `<label class="check-row"><input type="checkbox" data-mirror-target="${escape(t.id)}" ${(d.targetIds || []).includes(t.id) ? 'checked' : ''}>${escape(t.name)}</label>`).join('')}</div></fieldset>` : ''}${['save', 'check'].includes(d.kind) ? `<label>${d.kind === 'save' ? 'Saving throw ability' : 'Ability or skill'}<select id="mirror-stat">${(d.kind === 'save' ? C.abilities : [...C.abilities, ...CombatTraits.skills]).map(s => `<option value="${s}" ${s === (CombatTraits.ability(d.stat) || CombatTraits.skill(d.stat)) ? 'selected' : ''}>${escape(CombatTraits.label(s))}</option>`).join('')}</select></label>` : ''}${rollTraitHTML(snap, u, d)}${actionKind ? '<div class="field-grid">' : ''}${actionKind || ['save', 'check'].includes(d.kind) ? `<label>Roll<select id="mirror-roll"><option value="normal">Normal</option><option value="adv">Advantage</option><option value="dis">Disadvantage</option></select></label>` : ''}${actionKind ? `<label>Critical damage<select id="mirror-critical"><option value="normal">Normal</option><option value="crit">Crit</option><option value="nocrit">No crit</option></select></label></div><div class="field-grid">${input('attackBonus', 'To-hit bonus', d.attackBonus, '+2 or 1d4')}${input('damageBonus', 'Bonus damage', d.damageBonus, '1d6')}</div>${AuthoringUI.select('mirror-bonusDamageType', 'Bonus damage type', [['', 'Keep expression types'], ...Authoring.damageTypes], d.bonusDamageType || '')}<details><summary>Repetitions & spell options</summary>${input('repeat', 'Repetitions', d.repeat, '', 'number')}${d.kind === 'cast' ? input('level', 'Spell level (optional)', d.level, '', 'number') : ''}</details><button id="mirror-reset" class="small">Reset roll modifiers</button>` : ''}${['hp', 'hpSet', 'thp'].includes(d.kind) ? input('value', d.kind === 'hp' ? 'HP adjustment (+ heal / − damage)' : d.kind === 'thp' ? 'Temporary HP (negative removes)' : 'Set current HP', d.value, '', 'number') : ''}${d.kind === 'opt' ? input('initiative', 'Fixed initiative (nonnegative)', d.initiative, '', 'number') + input('ac', 'Set AC (optional)', d.ac, '', 'number') : ''}${['effectAdd', 'effectRemove'].includes(d.kind) ? input('effect', 'Exact effect name', d.effect) + `<datalist id="mirror-effect-names">${(data(u?.effects) || []).map(e => `<option value="${escape(e.name)}"></option>`).join('')}</datalist>` : ''}${d.kind === 'effectAdd' ? input('duration', 'Duration in rounds (blank = indefinite)', d.duration, '', 'number') + input('description', 'Rules reminder / description', d.description) + '<p class="hint">Adds a descriptive effect only. A condition name does not automatically enforce its mechanics.</p>' : ''}${d.kind === 'end' ? `<p class="hint">Ending combat requires your confirmation here, then Avrae’s confirmation in Discord.</p><button id="mirror-end-prepare" class="danger" ${!snap?.active ? 'disabled' : ''}>Confirm preparing End combat…</button>` : ''}${d.kind === 'add' ? addForm() : ''}</div><div id="mirror-preview" class="mirror-preview"></div></div><div><button id="mirror-copy" class="primary full">Copy command</button><button id="mirror-favorite" class="full">Save favorite</button><p class="hint">You send the copied command to Avrae in this channel. Then request a fresh snapshot. Copying is never execution confirmation.</p><details><summary>History & favorites</summary><div id="mirror-records"></div></details><details><summary>Avrae prefix for this channel</summary>${input('prefix', 'Command prefix', l?.prefix || ui.prefix)}<button id="mirror-save-prefix" ${!l ? 'disabled' : ''}>Save channel prefix</button></details></div>`;
    if ($('#mirror-scope')) $('#mirror-scope').value = d.scope; if ($('#mirror-roll')) $('#mirror-roll').value = d.roll; if ($('#mirror-critical')) $('#mirror-critical').value = d.critical;
    if ($('#mirror-stat')) $('#mirror-stat').value = CombatTraits.ability(d.stat) || CombatTraits.skill(d.stat) || 'dexterity';
    if ($('#mirror-action')) $('#mirror-action').setAttribute('list', 'mirror-action-names'); if ($('#mirror-effect')) $('#mirror-effect').setAttribute('list', 'mirror-effect-names');
    document.querySelectorAll('[data-mirror-trait]').forEach(n => n.onchange = () => { rollChoices = [...document.querySelectorAll('[data-mirror-trait]:checked')].map(n => n.dataset.mirrorTrait); preview(); });
    bind('mirror-kind', e => { rollChoices = []; d.kind = e.target.value; d.confirmEnd = false; endConfirmed = null; built = null; remember(); renderCommand(); }, 'change');
    bind('mirror-actor', e => { d.actorId = e.target.value; d.action = ''; d.scope = 'named'; built = null; remember(); renderSelection(); renderContent(); renderCommand(); }, 'change');
    for (const k of ['scope', 'roll', 'critical', 'damageChoice', 'stat', 'sourceKey', 'presetName', 'initiativeRoll']) bind('mirror-' + k, e => { d[k] = e.target.value; if (k === 'stat') { rollChoices = []; saveChoice(); renderCommand(); } else saveChoice(); }, 'change');
    for (const k of ['action', 'attackBonus', 'damageBonus', 'repeat', 'level', 'value', 'initiative', 'ac', 'effect', 'duration', 'description', 'addName', 'quantity', 'fixedInitiative', 'initiativeBonus', 'controller']) bind('mirror-' + k, e => { d[k] = e.target.value; if (k === 'damageBonus' && d.bonusDamageType && d[k] && !d[k].includes('[')) d[k] += '[' + d.bonusDamageType + ']'; saveChoice(); }, 'input');
    bindTargets();
    bind('mirror-bonusDamageType', e => { d.bonusDamageType = e.target.value; if (d.bonusDamageType && d.damageBonus) d.damageBonus = d.damageBonus.replace(/\[[a-z]+\]$/i, '') + '[' + d.bonusDamageType + ']'; saveChoice(); renderCommand(); }, 'change');
    bind('mirror-reset', () => { Object.assign(d, { critical: 'normal', roll: 'normal', attackBonus: '', damageBonus: '', bonusDamageType: '' }); saveChoice(); renderCommand(); });
    bind('mirror-copy', () => generate(true)); bind('mirror-favorite', () => generate(false));
    bind('mirror-end-prepare', () => { endPending = l.key + ':' + l.snapshot.requestId; $('#mirror-end-location').textContent = l.label; $('#mirror-end-dialog').showModal(); }); $('#mirror-end-confirm').onclick = () => run(() => { $('#mirror-end-dialog').close(); const latest = location(); if (!latest?.snapshot || endPending !== latest.key + ':' + latest.snapshot.requestId) throw new Error('The encounter changed. Review it and confirm again.'); endConfirmed = endPending; endPending = null; saveChoice(); });
    bind('mirror-save-prefix', async () => { view = await api('mirror/configure', 'POST', { ...l, prefix: $('#mirror-prefix').value }); await render(); });
    if ($('#mirror-repeat')) { $('#mirror-repeat').min = '1'; $('#mirror-repeat').max = '25'; }
    preview(); records();
  }
  function addForm() {
    const d = spec(), refs = C.creatures(workspace);
    return `<label>Saved encounter preset<select id="mirror-presetName"><option value="">Add a single source</option>${workspace.encounters.map(e => `<option value="${escape(e.name)}" ${d.presetName === e.name ? 'selected' : ''}>${escape(e.name)}</option>`).join('')}</select></label><label>Imported creature<select id="mirror-sourceKey"><option value="">Choose creature</option>${refs.map(r => `<option value="${escape(r.key)}" ${r.key === d.sourceKey ? 'selected' : ''}>${escape(r.data.name)}</option>`).join('')}</select></label>${input('addName', 'Encounter name (# for copies)', d.addName, 'Dragon#')}${input('quantity', 'Number of copies (1–20)', d.quantity, '', 'number')}<label>Initial initiative<select id="mirror-initiativeRoll"><option value="normal" ${d.initiativeRoll === 'normal' ? 'selected' : ''}>Normal</option><option value="adv" ${d.initiativeRoll === 'adv' ? 'selected' : ''}>Advantage</option><option value="dis" ${d.initiativeRoll === 'dis' ? 'selected' : ''}>Disadvantage</option></select></label>${input('fixedInitiative', 'Fixed initiative (optional)', d.fixedInitiative, '', 'number')}${input('initiativeBonus', 'Initiative bonus (optional)', d.initiativeBonus, '', 'number')}${input('controller', 'Controller ID / mention (optional)', d.controller)}<datalist id="mirror-controller-presets">${workspace.controllers.map(c => `<option value="${escape(c.value)}">${escape(c.name)}</option>`).join('')}</datalist><p class="hint">Presets use their saved source/alias settings. Generated trait setup follows all add commands. This does not add anything to the mirror.</p>`;
  }
  function preview() {
    if (!$('#mirror-preview')) return;
    let lines = [], error = '';
    try { lines = currentCommands(); } catch (e) { error = e.message; }
    $('#mirror-preview').innerHTML = lines.length ? (lines.length > 1 ? '<p class="hint">Send each line separately, in order.</p>' : '') + lines.map(line => `<pre>${escape(line)}</pre>`).join('') : `<p class="empty">${escape(error)}</p>`;
    $('#mirror-copy').disabled = !lines.length; $('#mirror-favorite').disabled = !lines.length;
    if ($('#mirror-controller')) $('#mirror-controller').setAttribute('list', 'mirror-controller-presets');
  }
  async function generate(toClipboard) {
    const l = location(); currentCommands(); clearTimeout(prefTimer); if (pending) await persist();
    const result = await api('mirror/command', 'POST', { key: l.key, snapshotId: l.snapshot.requestId, spec: C.clone(commandSpec()) }); built = result;
    if (toClipboard) {
      let copied = false;
      try { await navigator.clipboard.writeText(result.commands.join('\n')); copied = true; }
      catch { await copy(result.commands.join('\n')); message('Command generated. Clipboard access was unavailable; history remains generated.'); }
      if (copied) {
        try { await api('mirror/copied', 'POST', { key: l.key, historyId: result.historyId }); message('Copied for ' + l.label + '. Execution is not confirmed; refresh after sending it to Avrae.'); }
        catch { message('Copied, but history could not be updated. The clipboard still contains your command.', true); }
      }
    } else { await api('mirror/favorite', 'POST', { key: l.key, historyId: result.historyId }); message('Favorite saved for this channel. Actor and targets will be resolved from the current snapshot when reused.'); }
    rollChoices = []; endConfirmed = null; try { await reloadWorkspace(); records(); } catch {} renderCommand();
  }
  function records() {
    if (!$('#mirror-records')) return;
    const key = location()?.key, history = workspace.history.filter(h => h.mirrorKey === key).slice(0, 12), favorites = workspace.favorites.filter(h => h.mirrorKey === key);
    $('#mirror-records').innerHTML = `<h3>Favorites</h3>${favorites.map((r, i) => `<button data-mirror-favorite="${i}" class="full small">${escape(r.commands[0])}</button>`).join('') || '<p class="hint">No favorites for this channel.</p>'}<h3>History</h3>${history.map(r => `<div class="mirror-history"><span>${escape(r.status)} · ${escape(new Date(r.createdAt).toLocaleTimeString())}</span><pre>${escape(r.commands.join('\n'))}</pre></div>`).join('') || '<p class="hint">No generated commands yet.</p>'}`;
    document.querySelectorAll('[data-mirror-favorite]').forEach(b => b.onclick = () => { const favorite = favorites[Number(b.dataset.mirrorFavorite)]; Object.assign(spec(), C.clone(favorite.spec), { confirmEnd: false }); built = null; remember(); renderSelection(); renderContent(); renderCommand(); });
  }
  function age() { if ($('#mirror-age') && location()?.snapshot) $('#mirror-age').textContent = Math.max(0, Math.floor((Date.now() - location().snapshot.exportedAt) / 1000)) + ' seconds old; may be stale'; }
  async function refresh() {
    const l = location(); if (!l) throw new Error('Configure a channel first.');
    await api('mirror/refresh', 'POST', { key: l.key }); await fetchView(); renderInbox(); message('Copy and send the export command yourself in ' + l.label + '. The displayed snapshot stays unchanged until you review the new one.');
  }
  async function poll() {
    if (ui?.tab !== 'mirror') { timer = null; return; }
    try {
      const previous = location()?.snapshot?.requestId; await fetchView(); if (ui.tab !== 'mirror') { timer = null; return; }
      if (previous !== location()?.snapshot?.requestId) { rollChoices = []; built = null; renderSelection(); renderContent(); renderCommand(); }
      else { renderInbox(); age(); }
    } catch (e) { if ($('#mirror-live-state')) $('#mirror-live-state').textContent = e.message; }
    timer = setTimeout(poll, 4000);
  }
  async function render() {
    rollChoices = []; endConfirmed = null; const ticket = ++renderGeneration, incoming = await api('mirror'); if (ui.tab !== 'mirror' || ticket !== renderGeneration) return; view = incoming;
    if (ui.mirrorKey !== '' && !view.locations[ui.mirrorKey]) ui.mirrorKey = Object.values(view.locations).find(l => l.channelId === ui.channelId && l.guildId === ui.guildId)?.key || Object.keys(view.locations)[0] || '';
    renderSelection(); renderContent(); renderCommand(); if (!timer) timer = setTimeout(poll, 4000);
  }
  function channelChanged() { rollChoices = []; ui.mirrorKey = Object.values(view.locations).find(l => l.channelId === ui.channelId && l.guildId === ui.guildId)?.key || ''; if (ui.tab === 'mirror') run(render); }
  return { render, renderCommand, refresh, channelChanged, retrieve };
})();
