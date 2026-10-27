'use strict';
const C = window.Critter, M = window.CombatModel, Sources = window.CritterSources;
const $ = selector => document.querySelector(selector), uid = () => crypto.randomUUID();
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
let addingEntries = false;
let workspace, revision, ui, connected = false, channels = [], commands = [], sending = false, pending = false, generation = 0, prefTimer, serial = Promise.resolve(), renderToken = 0, search = '';
const analysisCache = new Map(), recoveryKey = 'aina-combat-controls-v3', tabId = uid();
const categories = { actions: 'Actions', reactions: 'Reactions', legendaryActions: 'Legendary', additionalAbilities: 'Traits', saves: 'Saves', checks: 'Checks', combatTraits: 'Combat traits' };
function message(text, error = false) { $('#message').textContent = text; $('#message').classList.toggle('error', error); $('#message').hidden = !text; if (text) Feedback.show(error ? 'Could not complete the operation' : 'Aina', text, error ? 'error' : 'info'); }
function run(task) { return Promise.resolve().then(task).catch(e => message(e.message, true)); }
function bind(id, fn, event = 'click') { const node = $('#' + id); if (node) node.addEventListener(event, e => run(() => fn(e))); }
async function api(route, method = 'GET', data) {
  let response;
  try { response = await fetch('/api/' + route, { method, headers: { 'X-Aina-Local': '1', ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }); }
  catch { throw new Error('Cannot reach Aina. Keep this page open, start Aina, then press Refresh.'); }
  const result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed.'), { status: response.status, code: result.code, details: result.details }); return result;
}
function selectedRoster() { return M.expand(M.ordered(workspace.currentEncounter.entries)).find(e => e.rosterKey === ui.rosterKey); }
function source() { const key = ui.tab === 'combat' ? selectedRoster()?.sourceKey : ui.selectedKey; return C.creatures(workspace).find(c => c.key === key); }
function options() {
  const map = ui.tab === 'combat' ? ui.perRoster : ui.perCreature, key = ui.tab === 'combat' ? ui.rosterKey : ui.selectedKey;
  const defaults = { category: 'actions', ability: '', targets: '', roll: 'normal', repeat: '1', check: '', critical: 'normal', attackBonus: '', damageBonus: '' };
  map[key] ||= {}; for (const [field, value] of Object.entries(defaults)) if (map[key][field] === undefined) map[key][field] = value;
  return map[key];
}
function plain(html) { const area = document.createElement('textarea'); area.innerHTML = String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, '\n').replace(/<[^>]*>/g, ''); return area.value.trim(); }
function remember() {
  generation++; pending = true; clearTimeout(prefTimer); $('#save-state').textContent = 'Saving choices…';
  try { localStorage.setItem(recoveryKey, JSON.stringify({ tabId, generation, ui })); } catch {}
  prefTimer = setTimeout(() => persist().catch(e => message(e.message, true)), 300);
}
function persist() {
  const snapshot = C.clone(ui), version = generation;
  serial = serial.catch(() => {}).then(async () => {
    const result = await api('preferences', 'PATCH', { prefix: snapshot.prefix, channelId: snapshot.channelId, desk: snapshot }); revision = result.revision;
    workspace.preferences = result.preferences;
    if (version === generation) { pending = false; $('#save-state').textContent = 'Choices saved'; try { const local = JSON.parse(localStorage.getItem(recoveryKey) || 'null'); if (local?.tabId === tabId && local.generation <= version) localStorage.removeItem(recoveryKey); } catch {} }
  });
  return serial.catch(e => { pending = true; $('#save-state').textContent = 'Choices retained in this browser'; throw e; });
}
function mutate(change) {
  serial = serial.catch(() => {}).then(async () => {
    for (let attempt = 0; ; attempt++) {
      const latest = await api('workspace'); change(latest.workspace); C.validateWorkspace(latest.workspace);
      try { const result = await api('workspace', 'PUT', { workspace: latest.workspace, revision: latest.revision }); workspace = result.workspace; revision = result.revision; return; }
      catch (e) { if (e.status !== 409 || attempt) throw e; }
    }
  }); return serial;
}
function download(name, data) { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = name.replace(/[<>:"/\\|?*]/g, '_'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function copy(value) { try { await navigator.clipboard.writeText(value); message('Copied.'); } catch { $('#copy-text').value = value; $('#copy-dialog').showModal(); $('#copy-text').select(); } }
async function exportSource(full, clipboard = false) { const ref = source(); if (!ref) throw new Error('Choose a creature.'); const value = full ? M.bestiary(workspace, ref.key) : C.clone(ref.data); if (clipboard) await copy(JSON.stringify(value, null, 2)); else download(value.name + (full ? '_Bestiary_CritterDB.json' : '_CritterDB.json'), value); }
function setTab(tab, persistChoice = true) {
  TraitsUI.resetConditions();
  ui.tab = ['combat', 'initiative', 'library', 'sender'].includes(tab) ? tab : tab === 'mirror' ? 'initiative' : tab === 'actions' ? 'library' : 'combat';
  if (persistChoice) { history.pushState(null, '', '#' + ui.tab); remember(); }
  renderWorkspace().catch(e => message(e.message, true));
}
function renderSelection() {
  if (ui.tab === 'initiative') { renderAddForm(); return; }
  if (ui.tab === 'combat') {
    const rows = M.expand(M.ordered(workspace.currentEncounter.entries));
    if (!rows.some(e => e.rosterKey === ui.rosterKey)) ui.rosterKey = rows[0]?.rosterKey || '';
    $('#selection-panel').innerHTML = `<div class="panel-heading"><div><h2>Combat roster</h2><button id="go-initiative" class="small">Add combatants</button><span class="hint">Initiative order · ${rows.length} combatants</span></div></div><div class="roster-list">${rows.map(e => `<button class="roster-button ${e.rosterKey === ui.rosterKey ? 'selected' : ''}" data-roster="${escape(e.rosterKey)}"><span class="initiative-chip">${M.numeric(e.fixedInitiative) ? escape(e.fixedInitiative) : '—'}</span><span><strong>${escape(e.name)}</strong><small>${escape(C.creatures(workspace).find(c => c.key === e.sourceKey)?.data.name || (e.kind === 'player' ? 'Player' : e.sourceName))}${e.unresolved ? ' · enter the rolled names in Initiative' : ''}</small></span></button>`).join('') || '<div class="empty">Choose Add combatants to select creatures from your library.</div>'}</div>`;
    document.querySelectorAll('[data-roster]').forEach(b => b.onclick = () => { ui.rosterKey = b.dataset.roster; TraitsUI.resetConditions(); remember(); renderWorkspace().catch(e => message(e.message, true)); });
    bind('go-initiative', () => { setTab('initiative'); requestAnimationFrame(() => document.querySelector('#init-source')?.parentElement.querySelector('.ss-trigger')?.click()); }); return;
  }
  if (ui.tab === 'sender') return;
  const allRows = C.creatures(workspace);
  if (!workspace.documents.some(d => d.id === ui.libraryDocumentId)) ui.libraryDocumentId = '';
  const selectedDocument = workspace.documents.find(d => d.id === ui.libraryDocumentId);
  const rows = allRows.filter(c => !selectedDocument || c.documentId === selectedDocument.id);
  const filtered = rows.filter(c => (c.data.name + ' ' + c.label).toLowerCase().includes(search.toLowerCase()));
  if (!rows.some(c => c.key === ui.selectedKey)) ui.selectedKey = rows[0]?.key || '';
  $('#selection-panel').innerHTML = `<div class="library-heading"><h2>Library</h2><button id="clear-library" class="small quiet">Clear...</button></div><div class="library-actions"><details class="library-menu"><summary>Load</summary><div class="library-menu-items"><button id="load-files">JSON files</button><button id="critterdb-account">From CritterDB</button></div></details><details class="library-menu"><summary>New</summary><div class="library-menu-items"><button id="new-creature">Creature</button><button id="new-bestiary">Bestiary</button></div></details></div><label class="compact-label">Source<select id="library-document"><option value="">All sources (${allRows.length})</option>${workspace.documents.map(d => '<option value="' + escape(d.id) + '"' + (d.id === ui.libraryDocumentId ? ' selected' : '') + '>' + escape(d.data.name || d.label) + ' (' + d.keys.length + ')</option>').join('')}</select></label><div class="library-source-status"><span>${rows.length} creature${rows.length === 1 ? '' : 's'}</span>${selectedDocument && /^[a-f0-9]{24}$/.test(selectedDocument.data._id || '') ? '<button id="library-sync" class="small">Refresh source</button>' : ''}</div><input id="library-search" type="search" placeholder="Find a creature" aria-label="Find a creature" value="${escape(search)}"><div class="roster-list library-list">${filtered.map(c => '<button class="source-button ' + (c.key === ui.selectedKey ? 'selected' : '') + '" data-source="' + escape(c.key) + '"><strong>' + escape(c.data.name) + '</strong><small>' + escape(c.label) + '</small></button>').join('') || '<p class="empty">' + (rows.length ? 'No creatures match this search.' : selectedDocument ? escape(selectedDocument.data.name || selectedDocument.label) + ' has no local creatures. Use Refresh source to check CritterDB.' : workspace.documents.length ? 'Your loaded sources contain no creatures yet. Choose a source above to refresh it.' : 'Load a creature or bestiary to begin.') + '</p>'}</div><details><summary>Bestiary tools & backups</summary><div class="stack"><button id="manage-bestiaries">Edit / export bestiaries</button><button id="backup-workspace">Workspace backup</button><button id="restore-workspace">Restore backup</button></div></details><details><summary>Load a CritterDB link or paste JSON</summary><div class="stack"><label>Creature or bestiary URL<input id="source-url" placeholder="https://critterdb.com/#/…"></label><button id="load-link">Load link</button><label>CritterDB JSON<textarea id="paste-json" rows="5"></textarea></label><button id="load-paste">Load pasted JSON</button><p class="hint">For a private source, drag <a id="browser-bookmark">Send to Aina</a> to your bookmarks bar, then click it on your signed-in CritterDB page.</p></div></details>`;
  bind('library-document', e => { ui.libraryDocumentId = e.target.value; search = ''; ui.selectedKey = C.creatures(workspace).find(c => !ui.libraryDocumentId || c.documentId === ui.libraryDocumentId)?.key || ''; remember(); renderWorkspace().catch(e => message(e.message, true)); }, 'change');
  bind('library-sync', () => DirectUI.refreshLibrary(ui.libraryDocumentId));
  bind('clear-library', () => DirectUI.clear()); bind('critterdb-account', () => DirectUI.open());
  bind('new-creature', () => AuthoringUI.create('creature')); bind('new-bestiary', () => AuthoringUI.create('bestiary')); bind('manage-bestiaries', () => AuthoringUI.manage()); bind('backup-workspace', () => download('Aina_Workspace_Backup.json', workspace)); bind('restore-workspace', () => $('#workspace-backup').click());
  bind('load-files', () => $('#import-files').click()); bind('library-search', e => { const focus = e.target.selectionStart; search = e.target.value; renderSelection(); $('#library-search').focus(); $('#library-search').setSelectionRange(focus, focus); }, 'input');
  document.querySelectorAll('[data-source]').forEach(b => b.onclick = () => { ui.selectedKey = b.dataset.source; TraitsUI.resetConditions(); remember(); renderWorkspace().catch(e => message(e.message, true)); });
  bind('load-link', async () => { const result = await api('source', 'POST', { url: $('#source-url').value.trim() }); await importValues([{ label: result.data.name || 'CritterDB', data: result.data }]); });
  bind('load-paste', async () => { const data = C.parseJSON($('#paste-json').value); await importValues([{ label: data.name || 'Pasted JSON', data }]); });
  bookmarkLink();
}
function statModifier(creature, stat, save = false) {
  const entry = save ? creature.stats.savingThrows?.find(e => CreatureMath.abilityFor(e.ability) === CreatureMath.abilityFor(stat)) : creature.stats.skills?.find(e => CreatureMath.key(e.name) === CreatureMath.key(stat));
  return CreatureMath.signed(entry ? CreatureMath.rowTotal(creature, entry, save ? 'saves' : 'skills', workspace.creatureCalculations?.[source()?.key]) : CreatureMath.mod(creature.stats.abilityScores?.[CreatureMath.abilityFor(stat)]));
}
async function renderCreature(token) {
  const ref = source(), roster = selectedRoster();
  if (ui.tab === 'combat' && roster?.kind === 'player') { PartyRoster.renderSelected(roster); renderCommand(); return; }
  if (!ref) { $('#content-panel').innerHTML = `<div class="empty"><h1>${ui.tab === 'combat' ? 'Choose a combatant' : 'Your creature library'}</h1><p>${ui.tab === 'combat' ? 'Add creatures in Initiative, then select one from the ordered roster.' : 'Load a CritterDB creature or bestiary to browse and edit its data.'}</p><button id="empty-load" class="primary">${ui.tab === 'combat' ? 'Open Initiative' : 'Load JSON files'}</button></div>`; bind('empty-load', () => ui.tab === 'combat' ? setTab('initiative') : $('#import-files').click()); renderCommand(); return; }
  const opts = options(), s = ref.data.stats;
  $('#content-panel').innerHTML = `<div class="panel-heading"><div><div class="eyebrow">${ui.tab === 'combat' ? 'SELECTED COMBATANT' : 'CREATURE DATA'}</div><h1>${escape(ui.tab === 'combat' ? roster.name : ref.data.name)}</h1><p class="muted">${ui.tab === 'combat' ? 'Source: ' + escape(ref.data.name) : escape(ref.label)}</p></div><div class="toolbar"><button id="edit-creature">Edit creature</button>${ui.tab === 'combat' && Spellcasting.read(ref.data)?.resources.length ? '<button id="combat-resources" class="small">Resources</button>' : ''}</div></div><div class="stat-chips"><span class="stat-chip">AC ${escape(s.armorClass ?? '—')}</span><span class="stat-chip">Base HP ${C.averageHP(ref.data) ?? '—'}</span><span class="stat-chip">${escape(s.size || '')} ${escape(s.race || '')}</span></div>${ui.tab === 'library' ? '<div class="export-row toolbar"><button id="export-creature">Export creature JSON</button><button id="export-bestiary">Export full bestiary JSON</button><button id="copy-creature">Copy creature JSON</button><button id="copy-bestiary">Copy bestiary JSON</button></div>' : ''}<nav class="section-tabs" aria-label="Creature abilities">${Object.entries({ actions: 'Abilities', saves: 'Saves', checks: 'Checks', combatTraits: 'Combat traits' }).map(([key, label]) => `<button data-category="${key}" class="${(opts.category === key || key === 'actions' && C.sections.includes(opts.category)) ? 'active' : ''}">${label}</button>`).join('')}</nav><div id="ability-list">Loading abilities…</div>`;
  bind('edit-creature', () => EditorUI.open(ref.key)); bind('combat-resources',()=>ResourceUI.open());
  bind('export-creature', () => exportSource(false)); bind('export-bestiary', () => exportSource(true)); bind('copy-creature', () => exportSource(false, true)); bind('copy-bestiary', () => exportSource(true, true));
  document.querySelectorAll('[data-category]').forEach(b => b.onclick = () => { opts.category = b.dataset.category; opts.check = ''; TraitsUI.resetConditions(); remember(); renderWorkspace().catch(e => message(e.message, true)); });
  if (opts.category === 'combatTraits') { TraitsUI.render(ref); return; }
  if (opts.category === 'saves' || opts.category === 'checks') {
    const save = opts.category === 'saves';
    $('#ability-list').innerHTML = `<h2>${save ? 'Saving throws' : 'Ability checks'}</h2><p class="hint">${ui.tab === 'combat' ? 'Live rolls use the selected encounter combatant and its effects. Source lookup is also available in the command panel.' : 'Source lookup uses ' + escape(ref.data.name) + '; it does not read encounter effects.'}</p><div class="roll-grid">${C.abilities.map(a => `<button data-roll-stat="${a.slice(0, 3)}"><strong>${a.slice(0, 3).toUpperCase()} ${statModifier(ref.data, a.slice(0, 3), save)}</strong><small>${a[0].toUpperCase() + a.slice(1)}</small></button>`).join('')}</div>${!save ? `<h3>Skill checks</h3><div class="check-list">${C.skills.map(a => `<button data-roll-stat="${escape(a)}">${escape(a)} <strong>${statModifier(ref.data, a, false)}</strong></button>`).join('')}</div>` : ''}`;
    document.querySelectorAll('[data-roll-stat]').forEach(b => b.onclick = () => { opts.check = b.dataset.rollStat; TraitsUI.resetConditions(); remember(); renderCommand(); }); renderCommand(); return;
  }
  const cached = analysisCache.get(ref.key), signature = JSON.stringify(ref.data);
  const analysis = cached?.signature === signature ? cached.analysis : (await api('analyze', 'POST', { creature: ref.data })).abilities;
  if (token !== renderToken) return;
  analysisCache.set(ref.key, { signature, analysis });
  const board = analysis.filter(a => !ref.data.stats[a.section]?.[a.index]?.description?.includes('<!-- AINA_COMBAT_TRAITS:')).flatMap(a => (a.names.length ? a.names : [a.title]).map((name, i) => ({ ...a, name, key: a.section + ':' + a.index + ':' + i })));
  $('#ability-list').innerHTML = '<div id="combat-ability-board"></div><div id="selected-ability-detail"></div>';
  const sectionNames = { actions: 'Actions', reactions: 'Reactions', legendaryActions: 'Legendary actions', additionalAbilities: 'Traits' };
  CreaturePanels.render($('#combat-ability-board'), Object.entries(sectionNames).map(([key, label]) => ({ key, label, rows: board.filter(a => a.section === key).map(a => ({ id: a.key, title: a.title + (a.names.length > 1 ? ' / ' + a.name : ''), summary: plain(a.readable) })) })), opts.ability, id => {
    const row = board.find(a => a.key === id); opts.category = row.section; opts.ability = id; opts.damageChoice = ''; opts.scalingSteps = '0'; remember(); renderWorkspace().catch(e => message(e.message, true));
  });
  const selected = board.find(a => a.key === opts.ability && a.section === opts.category);
  $('#selected-ability-detail').innerHTML = selected ? '<article class="selected-ability"><div class="section-heading"><h3>' + escape(selected.title) + '</h3><div class="toolbar"><button id="selected-ability-tools" class="small">Follow-up / uses</button><button id="selected-ability-edit" class="small">Edit</button></div></div><div class="ability-body">' + escape(plain(selected.readable)) + '</div>' + (selected.name !== selected.title ? '<p class="hint">Command: ' + escape(selected.name) + '</p>' : '') + '</article>' : '<p class="hint">Choose an entry above to read it and prepare its command.</p>';
  bind('selected-ability-tools', () => AbilityToolsUI.open(ref.key, selected.section, selected.index));
  bind('selected-ability-edit', () => EditorUI.open(ref.key, selected.section, selected.index)); renderCommand();
}

function makeCommands() {
  if (ui.tab === 'initiative') {
    const rows = M.ordered(workspace.currentEncounter.entries), resolved = rows.map(e => ({ ...e, sourceName: C.creatures(workspace).find(c => c.key === e.sourceKey)?.data.name || e.sourceName }));
    if (ui.init.intent === 'begin') return [C.command({ mode: 'begin' }, ui.prefix)];
    if (ui.init.intent === 'remove') return M.expand(rows).map(e => { if (e.unresolved) throw new Error('Enter actual names for dice-quantity combatants before removing them.'); return C.command({ mode: 'remove', actor: e.name }, ui.prefix); });
    if (ui.init.intent === 'order') return M.expand(rows).filter(e => M.numeric(e.fixedInitiative)).map(e => C.command({ mode: 'opt', actor: e.name, fixedInitiative: e.fixedInitiative }, ui.prefix));
    C.validateEncounter(resolved); const setups = M.expand(resolved).filter(e => TraitsUI.config(e.sourceKey)).map(e => { if (e.unresolved) throw new Error('Resolve dice-quantity names before per-combatant trait setup.'); return CombatTraits.setup(TraitsUI.config(e.sourceKey), e.name, ui.prefix); }); return [...(ui.init.includeBegin && rows.length ? [C.command({ mode: 'begin' }, ui.prefix)] : []), ...resolved.filter(e => e.kind !== 'player').map(e => C.encounterCommand(e, ui.prefix)), ...setups];
  }
  const ref = source(), player = ui.tab === 'combat' && selectedRoster()?.kind === 'player';
  if (!ref && !player) return [];
  const opts = options();
  if (player) return ['saves','checks'].includes(opts.category) && opts.check ? [CombatTraits.liveRoll(selectedRoster().name, opts.category === 'saves' ? 'save' : 'check', opts.check, CombatControls.choice(opts) === 'normal' ? (CombatControls.normalOverride(opts) ? ['adv','dis'] : []) : [CombatControls.choice(opts)], ui.prefix)] : [];
  if (opts.category === 'combatTraits') {
    const config = TraitsUI.config(ref.key), actor = selectedRoster();
    if (config && opts.traitIntent === 'update') return [ui.prefix + 'bestiary update'];
    if (ui.tab !== 'combat' || !config || !opts.traitIntent) return [];
    if (actor?.unresolved) throw new Error('Resolve the actual combatant name first.');
    return [opts.traitIntent === 'remove' ? CombatTraits.remove(config, actor.name, ui.prefix) : opts.traitIntent === 'status' ? ui.prefix + 'i status ' + C.quote(actor.name) : CombatTraits.setup(config, actor.name, ui.prefix)];
  }
  if (['saves', 'checks'].includes(opts.category)) {
    if (!opts.check) return []; const type = opts.category === 'saves' ? 'save' : 'check';
    if (ui.tab !== 'combat' || opts.rollContext === 'lookup') return [M.monsterRoll(ref.data.name, type, opts.check, CombatControls.choice(opts), ui.prefix)];
    if (selectedRoster()?.unresolved) throw new Error('Resolve the actual combatant name first.');
    return [CombatTraits.liveRoll(selectedRoster().name, type, opts.check, CombatControls.flags(opts, TraitsUI.config(ref.key), type, opts.check, TraitsUI.choices()), ui.prefix)];
  }
  const row = analysisCache.get(ref.key)?.analysis?.flatMap(a => (a.names.length ? a.names : [a.title]).map((name, i) => ({ ...a, name, key: a.section + ':' + a.index + ':' + i }))).find(a => a.key === opts.ability && a.section === opts.category);
  if (!row || isReminderRow(row)) return [];
  if (CriticalRanges.marker.test(ref.data.stats[row.section][row.index].description)) return [];
  const recipe = Authoring.recipe(ref.data.stats[row.section][row.index].description);
  if (recipe?.kind === 'description' && recipe.followup?.enabled) return [];
  const scaling = abilityScaling();
  const steps = scaling ? AbilityToolsModel.number(opts.scalingSteps || 0, 'Extra scaling steps', 0, Number(scaling.maximum)) : null;
  if (damageChoices().length && !damageChoices().includes(opts.damageChoice)) throw new Error('Choose the damage type for this ability in the command panel.');
  const actor = selectedRoster(); if (ui.tab === 'combat' && actor?.unresolved) throw new Error('Give this combatant its actual rolled name in Initiative.');
  if (selectedTargets(opts).some(n => !M.expand(workspace.currentEncounter.entries).some(e => !e.unresolved && e.name === n))) throw new Error('A selected target is no longer in the prepared roster. Select targets again.');
  return [C.command({ mode: ui.tab === 'combat' ? 'aoo' : 'ma', sourceName: ref.data.name, actor: actor?.name, action: row.name, targets: selectedTargets(opts), roll: CombatControls.choice(opts), normalOverride: CombatControls.normalOverride(opts), critical: AttackModifiers.eligible() ? opts.critical || 'normal' : 'normal', ...((AttackModifiers.eligible() && (opts.criton || CriticalRanges.config(ref.data))) ? { criton: AttackModifiers.threshold(opts) } : {}), attackBonus: AttackModifiers.eligible() ? opts.attackBonus || '' : '', damageBonus: AttackModifiers.typed(opts.damageBonus, opts.bonusDamageType), repeat: opts.repeat, ...(steps !== null ? { advanced: '-choice ' + C.quote(steps) } : damageChoices().includes(opts.damageChoice) ? { advanced: '-choice ' + C.quote(opts.damageChoice) } : {}) }, ui.prefix)];
}
function commandExplanation(line) {
  if (line.includes('i madd ')) return 'Add this combatant first; initiative modifiers apply to this initial roll.';
  if (line.includes('Aina Setup Traits ')) return 'Apply / replace the named combatant’s unconditional Aina effect. Requires the updated bestiary action. Application status unknown.';
  if (line.includes('i re ') && line.includes('Aina Combat Traits ')) return 'Remove only this named Aina effect. If Avrae suggests a different effect, cancel.';
  if (line.includes('i os ') || line.includes('i oc ')) return 'Live combatant roll: Avrae reads its encounter effects. Actual application is unverified.';
  if (/^\S*(ms|mc) /.test(line)) return 'Source lookup roll; does not use the selected encounter combatant\u2019s effects.';
  return '';
}
function selectedTargets(opts) { return Array.isArray(opts.targetNames) ? opts.targetNames : (opts.targets || '').split(/[,\n]/).map(v => v.trim()).filter(Boolean); }
function abilityRecipe() { const ref = source(), part = options().ability?.split(':'); return ref && part ? Authoring.recipe(ref.data.stats[part[0]]?.[Number(part[1])]?.description || '') : null; }
function isReminderRow(row) { return Boolean(row&&(row.reminderOnly||/^(?:multiattack|extra attacks?)\b/i.test(row.title?.trim()||'')||(!row.blocks?.length&&!row.hasAttack&&!row.fields?.length))); }
function reminderOnly() { const opts=options();if(['saves','checks','combatTraits'].includes(opts.category))return false;const ref=source(),parts=opts.ability?.split(':');return Boolean(parts&&isReminderRow(analysisCache.get(ref?.key)?.analysis?.find(a=>a.section===parts[0]&&a.index===Number(parts[1])))); }
function abilityScaling() { const recipe=abilityRecipe(); if(recipe?.scaling?.enabled) return recipe.scaling; const ref=source(),parts=options().ability?.split(':'); const row=analysisCache.get(ref?.key)?.analysis.find(a=>a.section===parts?.[0]&&a.index===Number(parts?.[1])); const name=row?.names?.[Number(parts?.[2]||0)]; return row?.scalingByName?.[name] || null; }
function criticalPassive() { const ref = source(), part = options().ability?.split(':'); return ref && part && CriticalRanges.marker.test(ref.data.stats[part[0]]?.[Number(part[1])]?.description || ''); }
function damageChoices() { const ref = source(), o = options(), part = o.ability?.split(':'), entry = ref?.data.stats[part?.[0]]?.[Number(part?.[1])]; return entry?.description.match(/<!-- AINA_DAMAGE_CHOICES:v1:([a-z,]+) -->/)?.[1].split(',') || []; }
function targetHTML(opts) {
  const names = [...new Set(M.expand(M.ordered(workspace.currentEncounter.entries)).filter(e => !e.unresolved).map(e => e.name))];
  const selected = selectedTargets(opts);
  return '<fieldset id="targets"><legend>Targets - initiative order</legend><div class="target-list">' + names.map(n => '<label class="check-row"><input data-combat-target type="checkbox" value="' + escape(n) + '" ' + (selected.includes(n) ? 'checked' : '') + '>' + escape(n) + '</label>').join('') + '</div>' + (!names.length ? '<p class="hint">Add creatures or select players in Initiative to target them here.</p><button id="add-targets">Add combatants</button>' : '') + (selected.some(n => !names.includes(n)) ? '<p class="hint">Previously selected targets are absent from this roster. Select targets again.</p>' : '') + '</fieldset>';
}
function commandLinesHTML(lines, empty = '') {
  const notes=[...new Set(lines.map(commandExplanation).filter(Boolean))];
  return (notes.length?'<small class="batch-note">'+escape(notes.join(' '))+'</small>':'') + lines.map((line,i)=>'<div class="command-line"><pre>'+escape(line)+'</pre>'+(lines.length>1?'<button class="small quiet" data-copy-command="'+i+'" aria-label="Copy command '+(i+1)+'">Copy</button>':'')+'</div>').join('') + (!lines.length?'<p class="empty">'+escape(empty)+'</p>':'');
}
function bindCommandCopies(){document.querySelectorAll('[data-copy-command]').forEach(b=>b.onclick=()=>run(()=>copy(commands[Number(b.dataset.copyCommand)])));}
function renderCommand() {
  if (ui.tab === 'sender') return;
  commands=[];let problem='';try{commands=makeCommands();if(commands.length>50)throw new Error('This batch exceeds 50 commands.');}catch(e){commands=[];problem=e.message;}
  const ref=source(),opts=ui.tab!=='initiative'&&(ref||selectedRoster()?.kind==='player')?options():null,scaling=opts?abilityScaling():null;
  const empty=problem||(opts&&reminderOnly()?'Reminder only. Use the individual attack or ability.':opts&&criticalPassive()?'Passive critical range applies to attack commands.':opts&&abilityRecipe()?.kind==='description'&&abilityRecipe()?.followup?.enabled?'Use Follow-up / uses for this ability.':ui.tab==='initiative'?'Add combatants or choose a setup command.':'Select an action, save or check.');
  const controls=opts&&opts.category!=='combatTraits'&&!criticalPassive()&&!reminderOnly()?`<div class="command-options">${['saves','checks'].includes(opts.category)&&ui.tab==='combat'&&ref?'<label>Roll as<select id="roll-context"><option value="live">Live combatant</option><option value="lookup">Source lookup</option></select></label>':''}${!['saves','checks'].includes(opts.category)?targetHTML(opts):''}${CombatControls.radios(opts)}${ref&&opts.rollContext!=='lookup'?TraitsUI.conditionalHTML(ref,opts):''}${!['saves','checks'].includes(opts.category)?`${scaling?`<div class="upcast-control">${scaling.mode==='levels'?AuthoringUI.select('scaling-level','Upcast &middot; spell level',Array.from({length:Number(scaling.maximum)+1},(_,i)=>[String(Number(scaling.baseLevel||1)+i),'Level '+(Number(scaling.baseLevel||1)+i)]),String(Number(scaling.baseLevel||1)+Number(opts.scalingSteps||0))):`<label>Upcast &middot; extra points<input id="scaling-steps" type="number" min="0" max="${escape(scaling.maximum)}" value="${escape(opts.scalingSteps||0)}"></label>`}<span>${scaling.mode==='levels'?'Slots: manual':'0&ndash;'+escape(scaling.maximum)+' extra'}</span></div>`:''}${damageChoices().length?AuthoringUI.select('damage-choice','Damage type',[['','Choose a type'],...damageChoices()],opts.damageChoice):''}${AttackModifiers.html(opts)}<details class="compact-repetitions"><summary>Repeat &times;${escape(opts.repeat)}</summary><input id="repeat" aria-label="Repetitions" type="number" min="1" max="100" value="${escape(opts.repeat)}"></details>`:''}</div>`:'';
  $('#command-panel').innerHTML=`<div class="command-main"><div class="eyebrow">REVIEW & SEND</div><h2>${commands.length>1?commands.length+' commands':'Command preview'}</h2><div id="command-lines" class="${commands.length>1?'batch-commands':''}">${commandLinesHTML(commands,empty)}</div>${controls}</div><div class="command-actions"><button id="send" class="primary full" ${!commands.length||!connected||!channels.some(c=>c.id===ui.channelId)||sending?'disabled':''}>${sending?'Sending?':'Post as Aina'}</button><button id="copy-command" class="full" ${!commands.length?'disabled':''}>${commands.length>1?'Copy all':'Copy command'}</button><p id="send-result" class="hint" role="status"></p><small>Send the copied command to Avrae. Confirm / Reaction / Cancel in Discord.</small><details><summary>Prefix</summary><input id="prefix" aria-label="Avrae prefix" value="${escape(ui.prefix)}"></details></div>`;
  document.querySelectorAll('[data-combat-target]').forEach(n=>n.onchange=()=>{opts.targetNames=[...document.querySelectorAll('[data-combat-target]:checked')].map(n=>n.value);opts.targets=opts.targetNames.join(',');remember();updatePreviewOnly();});
  if(opts){CombatControls.bindRoll(opts);bind('repeat',e=>{opts.repeat=e.target.value;remember();updatePreviewOnly();},'input');}
  bind('scaling-level',e=>{opts.scalingSteps=String(Number(e.target.value)-Number(scaling.baseLevel||1));remember();updatePreviewOnly();},'change');
  bind('scaling-steps',e=>{opts.scalingSteps=e.target.value;remember();updatePreviewOnly();},'input');bind('damage-choice',e=>{opts.damageChoice=e.target.value;remember();updatePreviewOnly();},'change');
  if($('#attack-bonus'))AttackModifiers.bind(opts);
  if($('#roll-context')){$('#roll-context').value=opts.rollContext||'live';bind('roll-context',e=>{opts.rollContext=e.target.value;TraitsUI.resetConditions();remember();renderCommand();},'change');}TraitsUI.bindConditions();
  bind('prefix',e=>{ui.prefix=e.target.value;remember();updatePreviewOnly();},'input');bind('add-targets',()=>setTab('initiative'));SenderUI.decorate();
  bind('send',sendCommands);bind('copy-command',async()=>{await copy(commands.join('\n'));TraitsUI.resetConditions();renderCommand();});bindCommandCopies();
}
function updatePreviewOnly(){
 if(ui.tab==='sender')return;try{commands=makeCommands();$('#command-lines').innerHTML=commandLinesHTML(commands);}catch(e){commands=[];$('#command-lines').textContent=e.message;}
 $('#send').disabled=!commands.length||!connected||!channels.some(c=>c.id===ui.channelId)||sending;$('#copy-command').disabled=!commands.length;bindCommandCopies();SenderUI.decorate();
}
async function sendCommands() {
  if (sending || !commands.length) return; const outgoing = commands.slice(), channelId = ui.channelId; sending = true; $('#workspace').inert = true; $('#send').disabled = true; message('');
  try {
    clearTimeout(prefTimer); await persist();
    const result = await api('post', 'POST', { requestId: uid(), channelId, commands: outgoing }), posted = result.results.filter(r => r.posted), failure = result.results.find(r => !r.posted);
    if (!posted.length) throw new Error(failure?.error || 'No message was posted.');
    message(posted.length + ' command' + (posted.length === 1 ? '' : 's') + ' posted to ' + (channels.find(c => c.id === channelId)?.name || 'Discord') + '.');
    try { await mutate(w => { w.history.unshift({ id: uid(), commands: posted.map(p => p.command), status: 'posted', createdAt: new Date().toISOString() }); w.history = w.history.slice(0, 200); }); } catch { message('The messages were posted, but local history was not saved. Do not resend them.', true); }
    if (failure || posted.length !== outgoing.length) message(`${posted.length} of ${outgoing.length} commands posted. Check Discord before retrying. ${failure?.error || ''}`, true);
  } catch (e) { message('Posting failed. Check Discord before retrying. ' + e.message, true); }
  finally { TraitsUI.resetConditions(); sending = false; $('#workspace').inert = false; renderCommand(); }
}
async function renderWorkspace() {
  if (!['combat', 'initiative', 'library', 'sender'].includes(ui.tab)) ui.tab = 'initiative';
  const token = ++renderToken; $('#workspace').dataset.view = ui.tab; document.documentElement.dataset.theme = ui.theme; $('#theme').textContent = ui.theme === 'dark' ? 'Light mode' : 'Dark mode';
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab)); renderSelection();
  if (ui.tab === 'sender') { await SenderUI.render(); return; }
  if (ui.tab === 'initiative') renderInitiative(); else await renderCreature(token); renderCommand();
}
function renderAddForm() {
  const f = ui.init.form;
  $('#selection-panel').innerHTML = PartyRoster.html() + `<h2>Add creatures</h2><p class="hint">Search your library, choose a creature, then enter its combat name and initiative.</p><div class="stack"><label>Source creature<select id="init-source"><option value="">Choose a creature</option>${C.creatures(workspace).map(c => `<option value="${escape(c.key)}" data-description="${escape(c.label)}">${escape(c.data.name)}</option>`).join('')}</select></label><label>Combat name<input id="init-name" value="${escape(f.name)}" placeholder="e.g. DragonTest"></label><label>Quantity<input id="init-quantity" value="${escape(f.quantity)}" placeholder="1"></label><label>Initiative<select id="init-method"><option value="roll">Let Avrae roll</option><option value="fixed">Fixed initiative</option></select></label><label>${f.method === 'fixed' ? 'Initiative value' : 'Roll bonus (optional)'}<input id="init-value" type="number" value="${escape(f.method === 'fixed' ? f.fixed : f.bonus)}"></label>${f.method === 'roll' ? `<label>Initial initiative roll<select id="init-roll"><option value="normal">Normal</option><option value="adv">Advantage</option><option value="dis">Disadvantage</option></select></label><p class="hint">Initiative only. Applied when adding this combatant, before trait setup.</p>` : ''}<details><summary>HP, AC & controller</summary><div class="stack">${['hp', 'ac', 'controller'].map(k => `<label>${k === 'controller' ? 'Controller Discord ID' : k.toUpperCase() + ' override'}<input id="init-${k}" value="${escape(f[k])}"></label>`).join('')}</div></details><button id="add-entry" class="primary full">Add to roster</button><button id="load-from-init" class="full">Load creature files</button></div>`;
  PartyRoster.bind();
  $('#init-source').value = f.sourceKey; $('#init-method').value = f.method; if ($('#init-roll')) { $('#init-roll').value = f.roll || 'normal'; bind('init-roll', e => { f.roll = e.target.value; remember(); }, 'change'); }
  bind('init-source', e => { f.sourceKey = e.target.value; f.name = C.creatures(workspace).find(c => c.key === f.sourceKey)?.data.name || ''; remember(); renderSelection(); }, 'change');
  bind('init-method', e => { f.method = e.target.value; remember(); renderSelection(); }, 'change');
  for (const k of ['name', 'quantity', 'hp', 'ac', 'controller']) bind('init-' + k, e => { f[k] = e.target.value; remember(); }, 'input');
  bind('init-value', e => { f[f.method === 'fixed' ? 'fixed' : 'bonus'] = e.target.value; remember(); }, 'input'); bind('add-entry', addEntries); bind('load-from-init', () => $('#import-files').click());
}
async function addEntries() {
  if (addingEntries) return; addingEntries = true; $('#selection-panel').inert = true;
  try {
  const f = ui.init.form, ref = C.creatures(workspace).find(c => c.key === f.sourceKey); if (!ref) throw new Error('Choose a source creature.');
  const qty = C.quantity(f.quantity), count = /^\d+$/.test(qty) ? Number(qty) : 1; if (f.method === 'fixed' && f.fixed === '') throw new Error('Enter the initiative value.');
  const rows = Array.from({ length: count }, (_, i) => ({ id: uid(), sourceKey: ref.key, sourceName: ref.data.name, name: count > 1 ? (f.name.includes('#') ? f.name.replace(/#/g, String(i + 1)) : f.name + (i + 1)) : f.name, quantity: /^\d+$/.test(qty) ? '1' : qty, fixedInitiative: f.method === 'fixed' ? f.fixed : '', initiativeBonus: f.method === 'roll' ? f.bonus : '', initiativeRoll: f.method === 'roll' ? f.roll || 'normal' : 'normal', hp: f.hp, ac: f.ac, controller: f.controller }));
  rows.forEach(r => C.encounterCommand(r, ui.prefix)); await mutate(w => { const entries = [...w.currentEncounter.entries, ...rows]; C.validateEncounter(entries); w.currentEncounter.entries = M.ordered(entries); });
  ui.init.intent = 'setup'; remember(); await renderWorkspace(); message('Added ' + rows.length + ' combatant' + (rows.length === 1 ? '' : 's') + '.');
  } finally { addingEntries = false; $('#selection-panel').inert = false; }
}
async function updateRoster(transform) { const expected = JSON.stringify(workspace.currentEncounter.entries); await mutate(w => { if (JSON.stringify(w.currentEncounter.entries) !== expected) throw new Error('The roster changed elsewhere. Refresh before arranging it.'); w.currentEncounter.entries = transform(C.clone(w.currentEncounter.entries)); C.validateEncounter(w.currentEncounter.entries); }); await renderWorkspace(); }
function renderInitiative() {
  const rows = M.ordered(workspace.currentEncounter.entries);
  $('#content-panel').innerHTML = `<div class="panel-heading"><div><div class="eyebrow">ENCOUNTER PREPARATION</div><h1>Initiative</h1><p class="muted">${rows.length} combatants · your ordered roster</p></div></div><div class="toolbar"><button id="start-combat">Start Combat</button><button id="setup-commands" class="primary">Setup Commands</button><button id="arrange-initiative">Arrange initiative</button><button id="remove-all" class="danger">Remove All</button></div><p class="hint">Drag the handle to set the order, or edit initiative values. Dragging assigns descending fixed values so Avrae can use the same order. Blank values let Avrae roll.</p><div class="table-wrap"><table id="initiative-table"><thead><tr><th>Order</th><th>Combatant</th><th>Initiative</th><th></th></tr></thead><tbody>${rows.map((e, i) => `<tr data-row="${escape(e.id)}"><td class="order-cell"><button class="drag-handle" draggable="true" data-drag="${escape(e.id)}" aria-label="Drag ${escape(e.name)}">⠿</button><span class="hint"> ${i + 1}</span></td><td><input class="name-input" data-entry-name="${escape(e.id)}" value="${escape(e.name)}" aria-label="Combat name ${escape(e.name)}"><small>${e.kind === 'player' ? 'Player - sheet stays in Avrae' : escape(e.sourceName)}</small><select ${e.kind === 'player' ? 'hidden disabled' : ''} data-entry-source="${escape(e.id)}" aria-label="Source for ${escape(e.name)}"><option value="">Link a library creature for actions</option>${C.creatures(workspace).map(c => `<option value="${escape(c.key)}" data-description="${escape(c.label)}" ${c.key === e.sourceKey ? 'selected' : ''}>${escape(c.data.name)}</option>`).join('')}</select></td><td><input class="init-value" data-init="${escape(e.id)}" type="number" value="${escape(e.fixedInitiative ?? '')}" placeholder="Roll" aria-label="Initiative for ${escape(e.name)}"></td><td><div class="toolbar compact"><button class="small" data-unit-manage="${escape(e.id)}">Manage</button><button class="small" data-up="${escape(e.id)}" ${!i ? 'disabled' : ''} aria-label="Move ${escape(e.name)} up">↑</button><button class="small" data-down="${escape(e.id)}" ${i === rows.length - 1 ? 'disabled' : ''} aria-label="Move ${escape(e.name)} down">↓</button><button class="small danger" data-remove="${escape(e.id)}" aria-label="Remove ${escape(e.name)}">×</button></div></td></tr>`).join('') || '<tr><td colspan="4"><p class="empty">Choose a creature on the left and add it to the roster.</p></td></tr>'}</tbody></table></div><details><summary>Saved encounters & setup options</summary><div class="stack"><label>Encounter name<input id="preset-name" value="${escape(ui.init.presetName || workspace.currentEncounter.name)}"></label><button id="save-preset">Save encounter</button><label>Load encounter<select id="preset"><option value="">Choose a preset</option>${workspace.encounters.map(e => `<option value="${escape(e.name)}">${escape(e.name)}</option>`).join('')}</select></label><button id="load-preset">Load encounter</button><label class="check-row"><input id="include-begin" type="checkbox" ${ui.init.includeBegin ? 'checked' : ''}> Include Start Combat in Setup Commands</label></div></details>`;
  for (const [id, intent] of [['start-combat', 'begin'], ['setup-commands', 'setup'], ['arrange-initiative', 'order']]) bind(id, async () => { ui.init.intent = intent; if (intent === 'order') await updateRoster(M.ordered); remember(); renderCommand(); });
  bind('remove-all', () => { if (!rows.length) throw new Error('The roster is already empty.'); $('#remove-dialog').showModal(); });
  document.querySelectorAll('[data-entry-source]').forEach(n => n.onchange = () => run(() => updateRoster(entries => entries.map(e => e.id === n.dataset.entrySource ? { ...e, sourceKey: n.value, sourceName: C.creatures(workspace).find(c => c.key === n.value)?.data.name || e.sourceName } : e))));
  document.querySelectorAll('[data-init]').forEach(input => input.onchange = () => run(async () => { const value = input.value; if (value !== '' && !/^[+-]?\d+$/.test(value)) throw new Error('Use an integer initiative value.'); ui.init.intent = 'order'; await updateRoster(entries => M.ordered(entries.map(e => e.id === input.dataset.init ? { ...e, fixedInitiative: value, initiativeBonus: '' } : e))); remember(); }));
  document.querySelectorAll('[data-entry-name]').forEach(input => input.onchange = () => run(() => updateRoster(entries => entries.map(e => e.id === input.dataset.entryName ? { ...e, name: input.value.trim() } : e))));
  document.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => run(() => updateRoster(entries => entries.filter(e => e.id !== b.dataset.remove))));
  for (const [attr, step] of [['up', -1], ['down', 1]]) document.querySelectorAll('[data-' + attr + ']').forEach(b => b.onclick = () => run(async () => { const id = b.dataset[attr], at = rows.findIndex(e => e.id === id), target = rows[at + step]; if (target) { ui.init.intent = 'order'; await updateRoster(entries => M.move(M.ordered(entries), id, target.id)); remember(); } }));
  document.querySelectorAll('[data-drag]').forEach(b => b.ondragstart = e => { e.dataTransfer.setData('text/plain', b.dataset.drag); e.dataTransfer.effectAllowed = 'move'; });
  document.querySelectorAll('[data-row]').forEach(row => { row.ondragover = e => { e.preventDefault(); row.classList.add('reorder-target'); }; row.ondragleave = () => row.classList.remove('reorder-target'); row.ondrop = e => { e.preventDefault(); row.classList.remove('reorder-target'); const id = e.dataTransfer.getData('text/plain'); if (id && id !== row.dataset.row) run(async () => { ui.init.intent = 'order'; await updateRoster(entries => M.move(M.ordered(entries), id, row.dataset.row)); remember(); }); }; });
  document.querySelectorAll('[data-unit-manage]').forEach(b => b.onclick = () => run(() => CombatControls.open(b.dataset.unitManage)));
  bind('include-begin', e => { ui.init.includeBegin = e.target.checked; remember(); renderCommand(); }, 'change'); bind('preset-name', e => { ui.init.presetName = e.target.value; remember(); }, 'input');
  bind('save-preset', async () => { const name = $('#preset-name').value.trim(); if (!name) throw new Error('Name the encounter.'); await mutate(w => { w.currentEncounter.name = name; const preset = C.clone(w.currentEncounter), index = w.encounters.findIndex(e => e.name === name); if (index < 0) w.encounters.push(preset); else w.encounters[index] = preset; }); await renderWorkspace(); message('Encounter saved.'); });
  bind('load-preset', async () => { const name = $('#preset').value; if (!name) throw new Error('Choose an encounter.'); await mutate(w => { const preset = w.encounters.find(e => e.name === name); if (!preset) throw new Error('Preset unavailable.'); w.currentEncounter = C.clone(preset); }); ui.init.intent = 'setup'; await renderWorkspace(); remember(); });
}
async function importValues(values) {
  const documents = values.map(v => { const parsed = C.importData(v.data); return { id: uid(), label: v.label, data: parsed.data, keys: C.list(parsed).map(() => uid()) }; });
  await mutate(w => w.documents.push(...documents)); ui.selectedKey = documents[0]?.keys[0] || ui.selectedKey; ui.init.form.sourceKey ||= ui.selectedKey; ui.tab = 'library'; history.replaceState(null, '', '#library'); remember(); await renderWorkspace(); message('Loaded ' + documents.reduce((n, d) => n + d.keys.length, 0) + ' creatures.');
}
function renderDestination() {
  const guilds = [...new Map(channels.map(c => [c.guildId, c.guildName])).entries()];
  ui.guildId = channels.find(c => c.id === ui.channelId)?.guildId || '';
  $('#channel').innerHTML = '<option value="">Choose a channel or thread</option>' + guilds.map(([id, name]) => '<optgroup label="' + escape(name) + '">' + channels.filter(c => c.guildId === id).map(c => '<option value="' + escape(c.id) + '" data-description="' + escape(c.guildName + (c.thread ? ' / Thread' : '')) + '">' + escape(c.displayName || '#' + c.channelName) + '</option>').join('') + '</optgroup>').join('');
  if (ui.channelId && !channels.some(c => c.id === ui.channelId)) $('#channel').innerHTML += '<option value="' + escape(ui.channelId) + '" disabled>Saved destination unavailable</option>';
  $('#channel').value = ui.channelId;
  SenderUI.decorate();
}
async function refreshStatus() { const status = await api('status'); connected = status.connected; channels = (status.channels || []).map(c => ({ ...c, guildId: c.guildId || c.name.split(' / #')[0], guildName: c.guildName || c.name.split(' / #')[0], channelName: c.channelName || c.name.split(' / #').at(-1) })); $('#online-state').textContent = connected ? 'Aina online' : 'Aina offline'; renderDestination(); renderCommand(); if (ui.tab === 'sender') SenderUI.decorate(); if (status.error) message(status.error, true); }
let importNonce;
function bookmarkLink() { if (!$('#browser-bookmark') || !importNonce) return; $('#browser-bookmark').href = 'javascript:' + encodeURIComponent(`(${Sources.browserImport.toString()})(${JSON.stringify(location.origin)},${JSON.stringify(importNonce)});void(0)`); $('#browser-bookmark').onclick = e => { e.preventDefault(); message('Drag this link to your bookmarks bar, then use it on your signed-in CritterDB page.'); }; }
function setupBrowserImport() {
  try { importNonce = localStorage.getItem('aina-critter-import') || uid(); localStorage.setItem('aina-critter-import', importNonce); } catch { return; } bookmarkLink();
  if (new URL(location.href).searchParams.get('receive') !== importNonce || !window.opener) return;
  let receiving = false;
  const listener = async e => { if (receiving || e.source !== window.opener || !['https://critterdb.com', 'https://www.critterdb.com'].includes(e.origin) || e.data?.type !== 'aina-critter-data' || e.data.nonce !== importNonce) return; receiving = true; clearInterval(timer); clearTimeout(timeout); window.removeEventListener('message', listener); try { if (e.data.error) throw new Error(e.data.error); await importValues([{ label: e.data.data.name || 'CritterDB', data: e.data.data }]); e.source.postMessage({ type: 'aina-critter-received', nonce: importNonce }, e.origin); } catch (err) { message(err.message, true); } };
  window.addEventListener('message', listener); const timer = setInterval(() => { for (const origin of ['https://critterdb.com', 'https://www.critterdb.com']) window.opener.postMessage({ type: 'aina-critter-ready', nonce: importNonce }, origin); }, 300); const timeout = setTimeout(() => { clearInterval(timer); window.removeEventListener('message', listener); if (!receiving) message('Import timed out. Try the bookmark again or load JSON.', true); }, 120000);
}
async function start() {
  const result = await api('workspace'); workspace = result.workspace; revision = result.revision; const previous = workspace.preferences.desk || {};
  ui = { ...previous, version: 3, tab: previous.version === 3 ? previous.tab : workspace.currentEncounter.entries.length ? 'combat' : 'library', selectedKey: previous.selectedKey || C.creatures(workspace)[0]?.key || '', rosterKey: previous.rosterKey || '', prefix: workspace.preferences.prefix, channelId: workspace.preferences.channelId || workspace.sender?.channelId || '', guildId: previous.guildId || '', theme: previous.theme || 'light', perCreature: previous.version === 3 ? previous.perCreature || {} : {}, perRoster: previous.perRoster || {}, init: { intent: 'setup', includeBegin: false, presetName: '', ...(previous.init || {}), form: { sourceKey: previous.selectedKey || C.creatures(workspace)[0]?.key || '', name: '', quantity: '1', method: 'roll', bonus: '', fixed: '', hp: '', ac: '', controller: '', ...(previous.init?.form || {}) } } };
  try { const recovery = JSON.parse(localStorage.getItem(recoveryKey) || 'null'); if (recovery?.ui?.version === 3) { ui = recovery.ui; pending = true; message('Recovered your recent controls from this browser.'); } } catch {}
  ui.tab = ['combat', 'initiative', 'library', 'sender'].includes(location.hash.slice(1)) ? location.hash.slice(1) : location.hash === '#mirror' || ui.tab === 'mirror' ? 'initiative' : ui.tab; if (location.hash === '#mirror') history.replaceState(null, '', '#initiative');
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab)); window.addEventListener('popstate', () => setTab(location.hash.slice(1), false));
  bind('theme', () => { ui.theme = ui.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = ui.theme; $('#theme').textContent = ui.theme === 'dark' ? 'Light mode' : 'Dark mode'; remember(); });
  bind('channel', e => { ui.channelId = e.target.value; ui.guildId = channels.find(c => c.id === ui.channelId)?.guildId || ''; remember(); renderCommand(); SenderUI.decorate(); }, 'change');
  bind('refresh', async () => { clearTimeout(prefTimer); if (pending) await persist(); const fresh = await api('workspace'); workspace = fresh.workspace; revision = fresh.revision; analysisCache.clear(); await renderWorkspace(); await refreshStatus(); });
  bind('workspace-backup', async e => { const f = e.target.files[0]; if (!f) return; const restored = C.validateWorkspace(C.parseJSON(await f.text())); await mutate(w => { for (const key of Object.keys(w)) delete w[key]; Object.assign(w, restored); }); e.target.value = ''; analysisCache.clear(); await renderWorkspace(); message('Workspace backup restored locally.'); }, 'change');
  bind('import-files', async e => { const values = []; for (const file of [...e.target.files]) { if (file.size > 20 * 1024 * 1024) throw new Error('File exceeds 20 MB.'); values.push({ label: file.name, data: C.parseJSON(await file.text()) }); } e.target.value = ''; if (values.length) await importValues(values); }, 'change');
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $('#' + b.dataset.close).close());
  bind('remove-avrae', () => { ui.init.intent = 'remove'; $('#remove-dialog').close(); remember(); renderCommand(); });
  bind('remove-local', async () => { await mutate(w => { w.currentEncounter.entries = []; }); $('#remove-dialog').close(); ui.rosterKey = ''; ui.init.intent = 'setup'; remember(); await renderWorkspace(); });
  window.addEventListener('beforeunload', e => { if (pending || sending || EditorUI.dirty() || TraitsUI.dirty()) { e.preventDefault(); e.returnValue = ''; } });
  setupBrowserImport(); await SenderUI.start(); await renderWorkspace(); await refreshStatus(); if (pending) remember(); const creatureURL = new URL(location.href).searchParams.get('critter'); if (creatureURL) await DirectUI.open('', creatureURL);
}
$('#refresh').onclick = () => { if (!workspace) location.reload(); };
start().catch(e => { $('#online-state').textContent = 'Connection unavailable'; message(e.message, true); });
