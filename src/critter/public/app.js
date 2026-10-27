'use strict';
const C = window.Critter;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => crypto.randomUUID();
let workspace, revision, page = 'library', selectedKey = '', docFilter = '', search = '', draft = null;
let dirty = false, saving = false, undo = [], selectedSection = 'actions', selectedAbility = 0;
let encounterEdit = -1, commandDraft = { mode: 'aoo', roll: 'normal', targets: [], repeat: '1' };
let previewCommands = [], previewSpec = null, abilities = [], connected = false, channels = [], toastTimer;

async function api(url, method = 'GET', data) {
  let response;
  try { response = await fetch('/api/' + url, { method, headers: { 'X-Aina-Local': '1', ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined }); }
  catch { throw Object.assign(new Error('Cannot reach Aina’s local editor. Start or restart Aina with npm.cmd start, keep it running, then reload this page. Your unsaved fields remain in this window.'), { code: 'local_unavailable' }); }
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || `Request failed (${response.status}).`), { code: result.code, details: result.details, status: response.status });
  return result;
}
function notify(message, failure = false) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.toggle('failure', failure); toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, failure ? 12000 : 5500);
}
function bind(id, fn, event = 'click') {
  const element = $('#' + id);
  if (element) element.addEventListener(event, e => Promise.resolve().then(() => fn(e)).catch(error => notify(error.message, true)));
}
function canLeave() { return !dirty || confirm('Discard unsaved creature edits?'); }
async function commit(change, rerender = true, recordUndo = true) {
  if (saving) throw new Error('A save is in progress. Please try again in a moment.');
  const previous = C.clone(workspace), next = C.clone(workspace);
  change(next); C.validateWorkspace(next);
  saving = true; $('#save-state').textContent = 'Saving…';
  try {
    const result = await api('workspace', 'PUT', { workspace: next, revision });
    workspace = result.workspace; revision = result.revision;
    if (recordUndo) { undo.push(previous); if (undo.length > 30) undo.shift(); }
    $('#save-state').textContent = 'Saved to this computer.';
    if (rerender) { dirty = false; draft = null; render(); } else renderSidebar();
  } catch (e) { $('#save-state').textContent = 'Save failed — changes not written.'; throw e; }
  finally { saving = false; }
}
function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename.replace(/[<>:"/\\|?*]/g, '_'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy(text, { message = 'Copied. Paste and send it in Discord.', title = 'Copy your command', label = 'Command to copy' } = {}) {
  try { await navigator.clipboard.writeText(text); notify(message); }
  catch {
    $('#fallback-title').textContent = title;
    $('#fallback-copy').setAttribute('aria-label', label);
    $('#fallback-copy').value = text; $('#fallback-dialog').showModal(); $('#fallback-copy').focus(); $('#fallback-copy').select();
  }
}
function copyJSON(data) {
  return copy(JSON.stringify(data, null, 2), {
    title: data.creatures ? 'Copy bestiary JSON' : 'Copy creature JSON', label: 'CritterDB JSON to copy',
    message: 'CritterDB JSON copied. You can use it to update your original creature or bestiary manually.',
  });
}
function current() { return C.creatures(workspace).find(c => c.key === selectedKey); }
function getPath(value, path) { return path.split('.').reduce((v, key) => v?.[key], value); }
function setPath(value, path, data) {
  const keys = path.split('.'); let cursor = value;
  for (const key of keys.slice(0, -1)) { if (!C.object(cursor[key])) cursor[key] = {}; cursor = cursor[key]; }
  cursor[keys.at(-1)] = data;
}
function field(path, label, type = 'text', wide = '') {
  let value = getPath(draft, path), shown = type === 'list' ? (Array.isArray(value) ? value.join('\n') : value || '') : value ?? '';
  const attrs = `data-path="${path}" data-type="${type}" data-initial="${escape(shown)}"`;
  return `<label class="${wide}"><span>${escape(label)}</span>${['textarea', 'list'].includes(type) ? `<textarea ${attrs}>\n${escape(shown)}</textarea>` : `<input ${attrs} type="${type === 'number' ? 'number' : 'text'}" value="${escape(shown)}" step="any">`}</label>`;
}
function readFields(value) {
  for (const input of $$('[data-path]')) {
    if (input.value === input.dataset.initial) continue;
    let parsed = input.value;
    if (input.dataset.type === 'number') {
      if (parsed === '' || !Number.isFinite(Number(parsed))) throw new Error('Numeric creature fields must contain a number.');
      parsed = Number(parsed);
    }
    if (input.dataset.type === 'list') parsed = parsed.split('\n').map(s => s.trim()).filter(Boolean);
    setPath(value, input.dataset.path, parsed);
  }
}
function htmlText(source) {
  const safeText = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, '');
  const textarea = document.createElement('textarea'); textarea.innerHTML = safeText;
  return textarea.value;
}
function renderSidebar() {
  $('#library-count').textContent = C.creatures(workspace).length;
  $('#documents').innerHTML = workspace.documents.map(d => `<button class="document" data-document="${escape(d.id)}">▧ &nbsp;${escape(d.label)} · ${C.list(d).length}</button>`).join('') || '<p class="muted">No imported files yet.</p>';
  $$('[data-document]').forEach(b => b.onclick = () => { if (!canLeave()) return; page = 'library'; docFilter = b.dataset.document; selectedKey = ''; draft = null; dirty = false; render(); });
  $$('.nav').forEach(b => b.classList.toggle('active', b.dataset.page === page));
}
function render() {
  renderSidebar();
  ({ library: renderLibrary, encounter: renderEncounter, commands: renderCommands, archive: renderArchive, settings: renderSettings })[page]();
}
function title(eyebrow, name, subtitle, actions = '') {
  return `<div class="page-title"><div><div class="eyebrow">${eyebrow}</div><h1>${name}</h1><p class="muted">${subtitle}</p></div><div class="toolbar">${actions}</div></div>`;
}
async function importFiles(files) {
  if (!files.length || !canLeave()) return;
  const imported = [];
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: file exceeds 20 MB.`);
    try { const result = C.importData(C.parseJSON(await file.text())); imported.push({ id: uid(), label: file.name, data: result.data, keys: C.list(result).map(uid) }); }
    catch (e) { throw new Error(`${file.name}: ${e.message} No files from this import were saved.`); }
  }
  await commit(w => w.documents.push(...imported));
  docFilter = ''; selectedKey = imported[0].keys[0] || ''; page = 'library'; draft = null; render();
  notify(`Imported ${imported.length} file(s). Original fields and automation are retained.`);
}
function renderLibrary() {
  let items = C.creatures(workspace).filter(c => !docFilter || c.documentId === docFilter);
  if (!items.some(c => c.key === selectedKey)) selectedKey = items[0]?.key || '';
  if (!draft || draftKey !== selectedKey) { draft = current() ? C.clone(current().data) : null; draftKey = selectedKey; }
  $('#main').innerHTML = title('THE BESTIARY', 'Creature library', 'A place for every creature in your next story.', '<button id="undo" class="quiet">↶ Undo</button><button id="new-creature">＋ New creature</button>') +
    window.remoteConnectionHTML() + `<div class="library-layout"><section class="card"><div class="search"><input id="creature-search" placeholder="Search creatures…" aria-label="Search creatures" value="${escape(search)}"></div><div id="creature-list" class="creature-list"></div><div class="file-footer"><button id="show-all" class="quiet">All imported files</button>${docFilter ? '<br>Filtering one source file' : ''}</div></section><section id="editor">${draft ? editorHTML() : `<div class="card empty"><div class="emblem">✧</div><h2>Your bestiary starts here</h2><p>Import a CritterDB creature or a whole bestiary. Keep their descriptions, automation, and original fields together.</p><button id="empty-import" class="primary">Import CritterDB JSON</button><p class="small">Multiple files welcome · Everything stays local</p></div>`}</section></div>`;
  renderCreatureList(); bindEditor(); window.bindRemoteConnection();
  bind('new-creature', async () => {
    if (!canLeave()) return;
    const name = prompt('Creature name', 'New creature'); if (!name?.trim()) return;
    const id = uid(), key = uid();
    await commit(w => w.documents.push({ id, label: name + '.json', data: C.blankCreature(name), keys: [key] }));
    selectedKey = key; docFilter = ''; draft = null; render();
  });
  bind('undo', undoChange);
  bind('creature-search', () => { search = $('#creature-search').value; renderCreatureList(); }, 'input');
  bind('show-all', () => { docFilter = ''; renderCreatureList(); });
  bind('empty-import', () => $('#import-files').click());
  if (draft) analyzeDraft();
}
let draftKey = '';
function renderCreatureList() {
  const items = C.creatures(workspace).filter(c => (!docFilter || c.documentId === docFilter) && (c.data.name + ' ' + c.label).toLowerCase().includes(search.toLowerCase()));
  $('#creature-list').innerHTML = items.map(c => `<button class="creature-button ${c.key === selectedKey ? 'selected' : ''}" data-creature="${escape(c.key)}"><strong>${escape(c.data.name)}</strong><small>${escape(c.data.stats.size || '—')} · ${escape(c.data.stats.race || 'Unspecified type')} <span> / CR ${escape(c.data.stats.challengeRating ?? '—')}</span></small><small>${escape(c.label)}</small></button>`).join('') || '<div class="empty small">No matching creatures.</div>';
  $$('[data-creature]').forEach(b => b.onclick = () => { if (!canLeave()) return; selectedKey = b.dataset.creature; draft = null; dirty = false; selectedAbility = 0; renderLibrary(); });
}
function modifierHTML(key, label) {
  const list = draft.stats[key] || [], isSave = key === 'savingThrows';
  return `<details><summary>${label} <span class="badge">${list.length}</span></summary><p class="section-note">Proficient = ability modifier + proficiency. Custom total = explicit modifier with proficient: false.</p><table class="modifier-table"><thead><tr><th>${isSave ? 'Ability' : 'Skill'}</th><th>Mode</th><th>Total</th><th></th></tr></thead><tbody>${list.map((item, i) => `<tr data-modifier="${key}" data-index="${i}"><td><select class="mod-name" aria-label="${label} name">${(isSave ? C.abilities : C.skills).map(n => `<option ${n === item[isSave ? 'ability' : 'name'] ? 'selected' : ''}>${escape(n)}</option>`).join('')}</select></td><td><select class="mod-mode" aria-label="Modifier mode"><option value="custom" ${!item.proficient ? 'selected' : ''}>Custom total</option><option value="proficient" ${item.proficient ? 'selected' : ''}>Proficient</option></select></td><td><input class="mod-value" type="number" aria-label="Custom total" value="${escape(item.value ?? '')}" ${item.proficient ? 'disabled' : ''}></td><td><button type="button" data-remove-mod="${key}:${i}" aria-label="Remove modifier">×</button></td></tr>`).join('')}</tbody></table><button data-add-mod="${key}" class="quiet">＋ Add ${isSave ? 'save' : 'skill'}</button></details>`;
}
function editorHTML() {
  const s = draft.stats, hp = C.averageHP(draft);
  return `<div class="card"><div class="card-header"><div><h2>${escape(draft.name)}</h2><span class="muted">${escape(current()?.label || '')}</span></div><div class="toolbar tight"><button id="raw-open">{ } JSON</button><button id="duplicate-creature">Duplicate</button><button id="delete-creature" class="danger">Delete</button></div></div>${window.remoteCreatureHTML()}<div class="card-pad" id="creature-form"><div class="metrics"><div class="metric"><span>Armor class</span><strong>${escape(s.armorClass ?? '—')}</strong></div><div class="metric"><span>Average HP</span><strong id="hp-average">${hp ?? '—'}</strong></div><div class="metric"><span>Challenge</span><strong>${escape(s.challengeRating ?? '—')}</strong></div><div class="metric"><span>Proficiency</span><strong>${Number(s.proficiencyBonus) >= 0 ? '+' : ''}${escape(s.proficiencyBonus ?? '—')}</strong></div></div>
    <h3>Identity & defenses</h3><div class="form-grid">${field('name', 'Creature name', 'text', 'wide')}${field('stats.size', 'Size')}${field('stats.race', 'Creature type')}${field('stats.alignment', 'Alignment')}${field('stats.armorClass', 'Armor class', 'number')}${field('stats.armorType', 'Armor description')}${field('stats.speed', 'Speed')}${field('stats.numHitDie', 'Hit dice count', 'number')}${field('stats.hitDieSize', 'Hit die size', 'number')}${field('stats.proficiencyBonus', 'Proficiency bonus', 'number')}</div>
    <div class="form-section"><h3>Ability scores</h3><div class="ability-grid">${C.abilities.map(a => field('stats.abilityScores.' + a, a.slice(0, 3).toUpperCase(), 'number')).join('')}</div><div class="section-note">Average HP is calculated from hit dice and Constitution, as in Avrae’s CritterDB importer.</div>${modifierHTML('savingThrows', 'Saving throws')}${modifierHTML('skills', 'Skills')}</div>
    <details><summary>Resistances, senses & languages</summary><p class="section-note">One entry per line. Existing entries stay intact until you edit a field.</p><div class="form-grid">${field('stats.damageVulnerabilities', 'Damage vulnerabilities', 'list')}${field('stats.damageResistances', 'Damage resistances', 'list')}${field('stats.damageImmunities', 'Damage immunities', 'list')}${field('stats.conditionImmunities', 'Condition immunities', 'list')}${field('stats.senses', 'Senses', 'list')}${field('stats.languages', 'Languages', 'list')}</div></details>
    <details><summary>Challenge, flavor & legendary resources</summary><div class="form-grid">${field('stats.challengeRating', 'Challenge rating (numeric, e.g. 0.125)', 'number')}${field('stats.experiencePoints', 'Experience points', 'number')}${field('stats.legendaryActionsPerRound', 'Legendary actions per round', 'number')}${field('stats.legendaryActionsDescription', 'Legendary actions description', 'textarea', 'wide')}${field('flavor.imageUrl', 'Image URL', 'text', 'wide')}${field('flavor.description', 'Flavor text / HTML source', 'textarea', 'wide')}</div></details>
    <div class="form-section"><div class="section-title"><h3>Abilities & automation</h3><button id="add-ability" class="quiet">＋ Add</button></div><div class="tabs">${C.sections.map(k => `<button data-section="${k}" class="${selectedSection === k ? 'active' : ''}">${({ additionalAbilities: 'Traits', actions: 'Actions', reactions: 'Reactions', legendaryActions: 'Legendary' })[k]} · ${(s[k] || []).length}</button>`).join('')}</div>${abilityHTML()}<div id="automation-report"></div></div>
    </div></div><div class="floating-actions"><span id="dirty-state">All creature fields and unknown properties are retained.</span><div class="toolbar"><button id="copy-creature-json">Copy creature JSON</button><button id="export-creature">Export creature</button><button id="copy-source-json">Copy source JSON</button><button id="export-bestiary">Export source file</button><button id="save-creature" class="primary">Save creature</button></div></div>`;
}
function abilityHTML() {
  const list = draft.stats[selectedSection] || [];
  if (!list.length) return '<p class="muted">No entries in this section. Add one or switch sections.</p>';
  selectedAbility = Math.min(selectedAbility, list.length - 1);
  const a = list[selectedAbility], parts = C.splitDescription(a.description);
  return `<div class="row"><select id="ability-select" aria-label="Select ability">${list.map((a, i) => `<option value="${i}" ${i === selectedAbility ? 'selected' : ''}>${escape(a.name)}</option>`).join('')}</select><button id="remove-ability" class="quiet danger">Remove</button></div><label><span>Visible ability title</span><input id="ability-name" value="${escape(a.name)}"></label><div class="rules-layout"><label><span>Readable rules / original HTML source</span><textarea id="ability-rules" rows="8">\n${escape(parts.readable)}</textarea></label><div><label><span>Rules preview · text only</span></label><div id="rules-preview" class="readable-preview">${escape(htmlText(parts.readable))}</div></div></div><p class="section-note">Editing the rules preserves every hidden Avrae block. Imported HTML is displayed as text; it cannot run scripts.</p>${parts.blocks.map((b, i) => `<label><span>Hidden automation ${i + 1} · existing YAML / shorthand source</span><textarea class="code" data-block="${i}" rows="7" spellcheck="false">\n${escape(b.source)}</textarea></label>`).join('')}<button id="add-block" class="quiet">＋ Add an empty automation block</button><p class="section-note">Target saving throws (ability, DC, success/failure effects) are edited in this automation source. Creature saving throw modifiers are edited in Saving throws above. No mechanics are generated automatically. Automation source is preserved exactly unless you edit it. YAML validation does not prove execution in Avrae.</p>`;
}
function collectCreature() {
  const value = C.clone(draft); readFields(value);
  for (const row of $$('[data-modifier]')) {
    const key = row.dataset.modifier, item = value.stats[key][Number(row.dataset.index)];
    const mode = $('.mod-mode', row).value, name = $('.mod-name', row).value, total = $('.mod-value', row).value;
    if (mode === 'custom' && item.proficient && total === '') throw new Error('Enter a custom total when switching away from proficiency.');
    const nameKey = key === 'savingThrows' ? 'ability' : 'name';
    if (item[nameKey] !== name) item[nameKey] = name;
    if (Boolean(item.proficient) !== (mode === 'proficient')) item.proficient = mode === 'proficient';
    if (total !== String(item.value ?? '')) { if (total === '' || !Number.isFinite(Number(total))) throw new Error('Custom skill/save total must be numeric.'); item.value = Number(total); }
  }
  const a = value.stats[selectedSection]?.[selectedAbility];
  if (a && $('#ability-name')) {
    a.name = $('#ability-name').value;
    const original = C.splitDescription(a.description), rules = $('#ability-rules').value;
    let blockIndex = 0;
    let description = a.description.replace(/<avrae\s+hidden>([\s\S]*?)<\/avrae>/gi, raw => {
      const input = $(`[data-block="${blockIndex}"]`), before = original.blocks[blockIndex++];
      return input.value === before.source.replace(/\r\n?/g, '\n') ? raw : '<avrae hidden>' + input.value + '</avrae>';
    });
    if (rules !== original.readable.replace(/\r\n?/g, '\n')) description = C.replaceReadable(description, rules);
    a.description = description;
  }
  C.validateCreature(value); return value;
}
function refreshDraft(change) {
  draft = collectCreature(); change(draft); dirty = true;
  $('#editor').innerHTML = editorHTML(); bindEditor(); analyzeDraft();
  $('#dirty-state').textContent = 'Unsaved creature changes';
  window.remoteCreatureChanged?.();
}
async function saveCreature() {
  const value = collectCreature(), ref = current();
  await commit(w => {
    const doc = w.documents.find(d => d.id === ref.documentId);
    if (doc.data.creatures) doc.data.creatures[ref.index] = value; else doc.data = value;
  });
  notify('Creature saved. Existing automation and unedited fields retained.');
}
function bindEditor() {
  const form = $('#creature-form');
  if (form) form.oninput = () => {
    dirty = true; $('#dirty-state').textContent = 'Unsaved creature changes';
    try { const value = collectCreature(); $('#hp-average').textContent = C.averageHP(value) ?? '—'; } catch {}
    window.remoteCreatureChanged?.();
  };
  $$('[data-modifier] .mod-mode').forEach(select => select.onchange = () => {
    $('.mod-value', select.closest('tr')).disabled = select.value === 'proficient';
  });
  bind('save-creature', saveCreature);
  bind('raw-open', () => { $('#raw-json').value = JSON.stringify(collectCreature(), null, 2); $('#raw-error').textContent = ''; $('#raw-dialog').showModal(); });
  bind('duplicate-creature', async () => {
    const value = C.duplicateCreature(collectCreature()), key = uid();
    await commit(w => w.documents.push({ id: uid(), label: value.name + '.json', data: value, keys: [key] }));
    selectedKey = key; docFilter = ''; draft = null; renderLibrary();
    notify('Duplicated as a new creature. CritterDB identity and collection-link IDs were removed.');
  });
  bind('delete-creature', async () => {
    const ref = current(); if (!confirm(`Delete ${ref.data.name} from this workspace? Undo is available.`)) return;
    await commit(w => {
      const doc = w.documents.find(d => d.id === ref.documentId);
      if (doc.data.creatures) { doc.data.creatures.splice(ref.index, 1); doc.keys.splice(ref.index, 1); }
      else w.documents = w.documents.filter(d => d.id !== doc.id);
    });
  });
  bind('export-creature', () => { if (dirty) throw new Error('Save your creature edits before exporting.'); download(current().data.name + '.creature.json', current().data); });
  bind('export-bestiary', () => { if (dirty) throw new Error('Save your creature edits before exporting.'); const d = workspace.documents.find(d => d.id === current().documentId); download(d.label, d.data); notify(d.data.creatures ? 'Exported the whole bestiary, including collection metadata.' : 'Exported an individual creature.'); });
  bind('copy-creature-json', () => { if (dirty) throw new Error('Save your creature edits before copying JSON.'); return copyJSON(current().data); });
  bind('copy-source-json', () => { if (dirty) throw new Error('Save your creature edits before copying JSON.'); return copyJSON(workspace.documents.find(d => d.id === current().documentId).data); });
  $$('[data-section]').forEach(b => b.onclick = () => {
    try { draft = collectCreature(); selectedSection = b.dataset.section; selectedAbility = 0; $('#editor').innerHTML = editorHTML(); bindEditor(); analyzeDraft(); } catch (e) { notify(e.message, true); }
  });
  bind('ability-select', () => { const index = Number($('#ability-select').value); draft = collectCreature(); selectedAbility = index; $('#editor').innerHTML = editorHTML(); bindEditor(); analyzeDraft(); }, 'change');
  bind('add-ability', () => refreshDraft(d => { if (!d.stats[selectedSection]) d.stats[selectedSection] = []; d.stats[selectedSection].push({ name: 'New ability', description: '' }); selectedAbility = d.stats[selectedSection].length - 1; }));
  bind('remove-ability', () => { if (confirm('Remove this ability?')) refreshDraft(d => { d.stats[selectedSection].splice(selectedAbility, 1); selectedAbility = 0; }); });
  bind('add-block', () => refreshDraft(d => { d.stats[selectedSection][selectedAbility].description += '\n\n<avrae hidden>\n\n</avrae>'; }));
  bind('ability-rules', () => { $('#rules-preview').textContent = htmlText($('#ability-rules').value); }, 'input');
  $$('[data-add-mod]').forEach(b => b.onclick = () => { try { refreshDraft(d => { const key = b.dataset.addMod; if (!d.stats[key]) d.stats[key] = []; d.stats[key].push(key === 'savingThrows' ? { ability: 'strength', proficient: false, value: 0 } : { name: 'Perception', proficient: false, value: 0 }); }); } catch (e) { notify(e.message, true); } });
  $$('[data-remove-mod]').forEach(b => b.onclick = () => { try { const [key, i] = b.dataset.removeMod.split(':'); refreshDraft(d => d.stats[key].splice(Number(i), 1)); } catch (e) { notify(e.message, true); } });
  window.bindRemoteEditor?.();
}
async function analyzeDraft() {
  const targetKey = selectedKey, targetSection = selectedSection, targetIndex = selectedAbility;
  try {
    const report = await api('analyze', 'POST', { creature: draft });
    if (page !== 'library' || selectedKey !== targetKey || selectedSection !== targetSection || selectedAbility !== targetIndex || !$('#automation-report')) return;
    const a = report.abilities.find(a => a.section === selectedSection && a.index === selectedAbility);
    $('#automation-report').innerHTML = a ? `<p><span class="badge ${a.status === 'explicit' ? 'good' : 'warn'}">${a.status === 'explicit' ? 'Automation source present' : 'Execution unverified'}</span></p>${a.names.length ? `<p class="small">Executable name(s): <strong>${a.names.map(escape).join(', ')}</strong></p>` : ''}${a.warnings.map(w => `<div class="warning">${escape(w)}</div>`).join('')}` : '';
  } catch (e) { notify(e.message, true); }
}
async function undoChange() {
  if (!undo.length) { notify('Nothing to undo in this session.'); return; }
  if (!canLeave()) return;
  const previous = undo.at(-1);
  await commit(w => { for (const key of Object.keys(w)) delete w[key]; Object.assign(w, C.clone(previous)); }, true, false);
  undo.pop(); notify('Undid the last workspace change.');
}

function input(id, label, value = '', type = 'text', extra = '') {
  return `<label><span>${label}</span><input id="${id}" type="${type}" value="${escape(value)}" ${extra}></label>`;
}
function creatureOptions(value = '') {
  return '<option value="">Choose a source creature…</option>' + C.creatures(workspace).map(c => `<option value="${escape(c.key)}" ${c.key === value ? 'selected' : ''}>${escape(c.data.name)} · ${escape(c.label)}</option>`).join('');
}
function encounterEntries() {
  return workspace.currentEncounter.entries.map(entry => {
    const source = C.creatures(workspace).find(c => c.key === entry.sourceKey);
    if (entry.sourceKey && !source) throw new Error(`The source creature for ${entry.name} was deleted. Edit the encounter entry to choose a source.`);
    return { ...entry, sourceName: source?.data.name || entry.sourceName };
  });
}
function roster() {
  return workspace.currentEncounter.entries.flatMap(e => {
    const quantity = /^\d+$/.test(e.quantity || '1') ? Number(e.quantity || '1') : 0;
    return quantity ? Array.from({ length: Math.min(quantity, 100) }, (_, i) => ({ ...e, name: e.name.replace(/#/g, String(i + 1)) })) : [];
  });
}
function renderEncounter() {
  const entries = workspace.currentEncounter.entries, edit = entries[encounterEdit] || {};
  $('#main').innerHTML = title('PREPARE THE SCENE', 'Encounter builder', 'Keep source stat blocks, encounter names, and controllers in order.', '<button id="encounter-undo" class="quiet">↶ Undo</button><button id="setup-preview" class="primary">Build setup commands →</button>') +
    `<div class="notice">This is your prepared roster. Avrae owns the live encounter, HP, turns, and rolls. Dice quantities resolve in Avrae; add their actual resulting names as manual targets afterward.</div><div class="split"><div class="stack"><section class="card card-pad"><div class="form-grid">${input('encounter-name', 'Encounter preset name', workspace.currentEncounter.name)}<label><span>Saved encounters</span><select id="encounter-preset"><option value="">Choose a preset…</option>${workspace.encounters.map((e, i) => `<option value="${i}">${escape(e.name)}</option>`).join('')}</select></label><div class="toolbar"><button id="save-encounter">Save preset</button><button id="load-encounter">Load</button><button id="duplicate-encounter">Duplicate</button><button id="delete-preset" class="danger">Delete preset</button></div></div></section><section class="card"><div class="card-header"><h2>Prepared combatants</h2><span class="badge">${entries.length} entries</span></div>${entries.map((e, i) => `<div class="encounter-row"><div><strong>${escape(e.name)}</strong><p>Source: ${escape(C.creatures(workspace).find(c => c.key === e.sourceKey)?.data.name || e.sourceName)} · quantity ${escape(e.quantity || 1)}</p><p>${e.controller ? 'Controller ' + escape(e.controller) + ' · ' : ''}${e.fixedInitiative !== '' && e.fixedInitiative != null ? 'Fixed initiative ' + escape(e.fixedInitiative) : e.initiativeBonus !== '' && e.initiativeBonus != null ? 'Initiative bonus ' + escape(e.initiativeBonus) : 'Roll initiative'}${e.group ? ' · ' + escape(e.group) : ''}</p>${e.notes ? `<p>${escape(e.notes)}</p>` : ''}</div><div class="toolbar tight"><button data-edit-entry="${i}">Edit</button><button data-clone-entry="${i}">Duplicate</button><button data-delete-entry="${i}" class="danger">×</button></div></div>`).join('') || '<div class="empty"><div class="emblem">⚑</div><h2>Set the scene</h2><p>Choose an imported creature and give it a name in this encounter.</p></div>'}</section></div><section class="card card-pad"><div class="section-title"><h2>${encounterEdit >= 0 ? 'Edit combatant' : 'Add a combatant'}</h2><button id="cancel-entry" class="quiet">Reset</button></div><div class="form-grid"><label class="wide"><span>Source creature / bestiary</span><select id="entry-source">${creatureOptions(edit.sourceKey)}</select></label>${input('entry-name', 'Encounter / display name', edit.name || '')}${input('entry-quantity', 'Quantity or dice expression', edit.quantity || '1')}<label><span>Controller preset</span><select id="entry-controller-preset"><option value="">Choose…</option>${workspace.controllers.map((c, i) => `<option value="${i}">${escape(c.name)}</option>`).join('')}</select></label>${input('entry-controller', 'Controller ID or Discord mention', edit.controller || '')}${input('entry-fixed', 'Fixed initiative (−p)', edit.fixedInitiative ?? '', 'number')}${input('entry-bonus', 'Initiative bonus (−b)', edit.initiativeBonus ?? '', 'number')}${input('entry-ac', 'AC override', edit.ac ?? '', 'number')}${input('entry-hp', 'HP override', edit.hp ?? '', 'number')}${input('entry-thp', 'Temporary HP', edit.thp ?? '', 'number')}${input('entry-group', 'Group', edit.group || '')}<label class="wide"><span>Notes</span><textarea id="entry-notes">\n${escape(edit.notes || '')}</textarea></label></div><p class="section-note">Use # for numbered names, e.g. Cultist#. A fixed initiative is the final placement; a bonus is added to the initiative roll.</p><button id="add-entry" class="primary">${encounterEdit >= 0 ? 'Save changes' : 'Add to encounter'}</button></section></div>`;
  bind('encounter-undo', undoChange);
  bind('entry-source', () => { const creature = C.creatures(workspace).find(c => c.key === $('#entry-source').value); if (creature && !$('#entry-name').value) $('#entry-name').value = creature.data.name; }, 'change');
  bind('entry-controller-preset', () => { const c = workspace.controllers[$('#entry-controller-preset').value]; if (c) $('#entry-controller').value = c.value; }, 'change');
  bind('cancel-entry', () => { encounterEdit = -1; renderEncounter(); });
  bind('add-entry', async () => {
    const source = C.creatures(workspace).find(c => c.key === $('#entry-source').value);
    if (!source) throw new Error('Choose an imported source creature.');
    const entry = { ...edit, id: edit.id || uid(), sourceKey: source.key, sourceName: source.data.name,
      name: $('#entry-name').value.trim(), quantity: C.quantity($('#entry-quantity').value), controller: $('#entry-controller').value.trim(),
      fixedInitiative: $('#entry-fixed').value, initiativeBonus: $('#entry-bonus').value, ac: $('#entry-ac').value,
      hp: $('#entry-hp').value, thp: $('#entry-thp').value, group: $('#entry-group').value.trim(), notes: $('#entry-notes').value.trim() };
    if (entry.quantity !== '1' && !entry.name.includes('#')) entry.name += '#';
    C.encounterCommand(entry, workspace.preferences.prefix);
    const next = C.clone(entries); if (encounterEdit >= 0) next[encounterEdit] = entry; else next.push(entry);
    C.validateEncounter(next);
    await commit(w => { w.currentEncounter.entries = next; }); encounterEdit = -1; renderEncounter();
  });
  $$('[data-edit-entry]').forEach(b => b.onclick = () => { encounterEdit = Number(b.dataset.editEntry); renderEncounter(); });
  $$('[data-clone-entry]').forEach(b => b.onclick = async () => {
    const e = C.clone(entries[Number(b.dataset.cloneEntry)]); e.id = uid();
    let n = 2, base = e.name.replace(/#/g, '');
    while (entries.some(row => row.name === base + ' copy ' + n + (e.quantity !== '1' ? '#' : ''))) n++;
    e.name = base + ' copy ' + n + (e.quantity !== '1' ? '#' : '');
    try { await commit(w => { w.currentEncounter.entries.push(e); C.validateEncounter(w.currentEncounter.entries); }); } catch (error) { notify(error.message, true); }
  });
  $$('[data-delete-entry]').forEach(b => b.onclick = async () => {
    if (!confirm('Remove this prepared combatant?')) return;
    try { await commit(w => w.currentEncounter.entries.splice(Number(b.dataset.deleteEntry), 1)); encounterEdit = -1; } catch (e) { notify(e.message, true); }
  });
  bind('save-encounter', async () => {
    const name = $('#encounter-name').value.trim(); if (!name) throw new Error('Name the encounter preset.');
    const existing = workspace.encounters.findIndex(e => e.name === name);
    if (existing >= 0 && !confirm('Replace the saved preset with this encounter?')) return;
    await commit(w => { w.currentEncounter.name = name; const saved = C.clone(w.currentEncounter); if (existing >= 0) w.encounters[existing] = saved; else w.encounters.push(saved); }); notify('Encounter preset saved.');
  });
  bind('load-encounter', async () => { const index = $('#encounter-preset').value; if (index === '') throw new Error('Choose a saved encounter.'); if (!confirm('Replace the current prepared roster with this preset?')) return; await commit(w => { w.currentEncounter = C.clone(w.encounters[Number(index)]); }); encounterEdit = -1; });
  bind('duplicate-encounter', async () => { const name = prompt('Name for the copied preset', workspace.currentEncounter.name + ' copy'); if (!name?.trim()) return; if (workspace.encounters.some(e => e.name === name)) throw new Error('That preset name is already in use.'); await commit(w => { const e = C.clone(w.currentEncounter); e.name = name; w.encounters.push(e); w.currentEncounter = e; }); });
  bind('delete-preset', async () => { const index = $('#encounter-preset').value; if (index === '') throw new Error('Choose a saved preset.'); if (confirm('Delete this saved preset?')) await commit(w => w.encounters.splice(Number(index), 1)); });
  bind('setup-preview', () => {
    const rows = encounterEntries(); C.validateEncounter(rows);
    previewCommands = [workspace.preferences.prefix + 'init begin', ...rows.map(e => C.encounterCommand(e, workspace.preferences.prefix))];
    previewSpec = { kind: 'setup', entries: C.clone(rows) }; page = 'commands'; render();
  });
}

function renderCommands() {
  const d = commandDraft, actorList = roster();
  const actionModes = ['ma', 'action', 'aoo', 'cast', 'rc', 'moncast', 'pcCast'];
  const isAction = actionModes.includes(d.mode), isSpell = ['cast', 'rc', 'moncast', 'pcCast'].includes(d.mode);
  const needsActor = !['ma', 'moncast', 'action', 'cast', 'pcCast', 'begin', 'list', 'next', 'end'].includes(d.mode);
  $('#main').innerHTML = title('LESS TYPING. MORE STORY.', 'Command desk', 'Choose the move. Check the command. Let Aina put it within reach.') +
    `<div class="split"><section class="card card-pad"><h2>Build an Avrae command</h2><p class="section-note">Names, targets, and advanced arguments are always yours to choose.</p><div class="form-grid"><label class="wide"><span>Command mode</span><select id="command-mode">${Object.entries({ aoo: 'Action · named combatant, off turn', action: 'Action · current turn', ma: 'Action · source bestiary creature', rc: 'Spell · named combatant, off turn', cast: 'Spell · current turn', moncast: 'Spell · source bestiary creature', pcCast: 'Spell · active player character', begin: 'Start combat', dm: 'Add DungeonMaster', list: 'List combatants', status: 'Combatant status', next: 'Next turn', end: 'End combat', remove: 'Remove combatant', opt: 'Initiative / AC options', hp: 'HP query / adjustment', hpSet: 'Set current HP', thp: 'Temporary HP', save: 'Named combatant saving throw' }).map(([key, name]) => `<option value="${key}" ${key === d.mode ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      ${isAction ? `<label class="wide"><span>Imported source for action choices</span><select id="command-source">${creatureOptions(d.sourceKey)}</select></label>${input('command-source-name', 'Source creature name', d.sourceName || '')}` : ''}
      ${needsActor ? `${input('command-actor', 'Encounter combatant name', d.actor || '', 'text', 'list="actor-names"')}<datalist id="actor-names">${actorList.map(e => `<option value="${escape(e.name)}"></option>`).join('')}</datalist>` : ''}
      ${isAction ? `${input('command-action', isSpell ? 'Spell name' : 'Executable action name', d.action || '', 'text', 'list="action-names"')}<datalist id="action-names"></datalist><p id="action-info" class="section-note wide"></p><label class="wide"><span>Search imported actions</span><input id="action-search" placeholder="Filter action names…" value=""><select id="action-choice" aria-label="Imported action choices"><option value="">Choose or type an action name…</option></select></label><label><span>Roll mode</span><select id="command-roll"><option value="normal" ${d.roll === 'normal' ? 'selected' : ''}>Normal</option><option value="adv" ${d.roll === 'adv' ? 'selected' : ''}>Advantage</option><option value="dis" ${d.roll === 'dis' ? 'selected' : ''}>Disadvantage</option></select></label>${input('command-attackBonus', 'Attack bonus (adds to existing)', d.attackBonus || '')}${input('command-damageBonus', 'Damage bonus', d.damageBonus || '')}${input('command-repeat', 'Repetitions', d.repeat || '1', 'number', 'min="1" max="100"')}${isSpell ? input('command-level', 'Spell level (optional)', d.level ?? '', 'number', 'min="0" max="9"') : ''}` : ''}
      ${['hp', 'hpSet', 'thp'].includes(d.mode) ? input('command-value', d.mode === 'hp' ? 'HP adjustment (+heal / −damage); blank = query' : 'HP value', d.value ?? '', 'number') : ''}
      ${d.mode === 'opt' ? input('command-fixedInitiative', 'Fixed initiative', d.fixedInitiative ?? '', 'number') + input('command-ac', 'AC override', d.ac ?? '', 'number') : ''}
      ${d.mode === 'save' ? `<label><span>Saving throw</span><select id="command-save">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(a => `<option ${d.save === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>` : ''}
      </div><div class="notice">${escape(C.modeInfo[d.mode][1])}</div>
      ${isAction ? `<div class="form-section"><h3>Targets</h3><div id="selected-targets" class="target-grid">${(d.targets || []).map((t, i) => `<span class="selected-target">${escape(t)}<button data-remove-target="${i}" aria-label="Remove ${escape(t)}">×</button></span>`).join('')}</div><div class="target-grid">${actorList.map((a, i) => `<label class="target-choice"><input type="checkbox" data-target-index="${i}" ${(d.targets || []).includes(a.name) ? 'checked' : ''}>${escape(a.name)}</label>`).join('')}</div><div class="row"><input id="manual-target" aria-label="Manual target name" placeholder="Add any target name…"><button id="add-target">Add</button></div><p class="section-note">Targets are selected manually. No distance or live-state inference is made.</p></div>` : ''}
      <details><summary>Advanced arguments</summary><textarea id="command-advanced" class="code" placeholder="e.g. -phrase &quot;For the party!&quot;">\n${escape(d.advanced || '')}</textarea><p class="section-note">Use the controls for targets and common modifiers. Advanced arguments are passed through for your review.</p></details><button id="build-command" class="primary">Preview command →</button></section>
      <div class="stack"><section class="card card-pad"><div class="section-title"><h2>Ready to send</h2><span class="badge">PREVIEW</span></div><label><span>Destination Discord channel</span><select id="post-channel">${channelOptions()}</select></label><p class="section-note">Aina posts a copyable preview. You send the command to Avrae. ✅ dismisses the preview after copying.</p><div id="command-previews"></div><div class="toolbar"><button id="post-commands" class="primary" ${!connected ? 'disabled' : ''}>Post ${previewCommands.length > 1 ? 'all previews' : 'to channel'}</button><button id="queue-command">＋ Queue</button><button id="favorite-command">☆ Favorite</button></div><p id="post-result" class="section-note"></p></section><section class="card"><div class="card-header"><h2>Command queue</h2><span class="badge">${workspace.queue.length}</span></div><div id="queue-items">${queueHTML()}</div></section><div class="notice">Local previews do not validate Avrae permissions or execute automation. Import or update your edited bestiary in CritterDB and Avrae before using changed actions.</div></div></div>`;
  renderPreviews(); bindCommandOutput();
  bind('command-mode', () => { captureCommand(); commandDraft.mode = $('#command-mode').value; commandDraft.advanced = ''; if (!['cast', 'rc', 'moncast', 'pcCast'].includes(commandDraft.mode)) delete commandDraft.level; renderCommands(); }, 'change');
  bind('command-source', () => {
    captureCommand(); const source = C.creatures(workspace).find(c => c.key === $('#command-source').value);
    commandDraft.sourceKey = source?.key || '';
    if (source) { commandDraft.sourceName = source.data.name; $('#command-source-name').value = source.data.name; }
    loadCommandActions();
  }, 'change');
  bind('command-actor', () => {
    captureCommand(); const actor = actorList.find(a => a.name === commandDraft.actor);
    const source = C.creatures(workspace).find(c => c.key === actor?.sourceKey);
    if (source && $('#command-source')) {
      commandDraft.sourceKey = source.key; commandDraft.sourceName = source.data.name;
      $('#command-source').value = source.key; $('#command-source-name').value = source.data.name; loadCommandActions();
    }
  }, 'change');
  bind('add-target', () => { const target = $('#manual-target').value.trim(); captureCommand(); if (target && !commandDraft.targets.includes(target)) commandDraft.targets.push(target); renderCommands(); });
  $$('[data-remove-target]').forEach(b => b.onclick = () => { captureCommand(); commandDraft.targets.splice(Number(b.dataset.removeTarget), 1); renderCommands(); });
  $$('[data-target-index]').forEach(b => b.onchange = () => { captureCommand(); const target = actorList[Number(b.dataset.targetIndex)].name; commandDraft.targets = commandDraft.targets.filter(t => t !== target); if (b.checked) commandDraft.targets.push(target); renderCommands(); });
  bind('build-command', async () => {
    captureCommand(); const command = C.command(commandDraft, workspace.preferences.prefix);
    previewCommands = [command]; previewSpec = { kind: 'command', draft: C.clone(commandDraft) };
    renderPreviews();
    await recordHistory(previewCommands, previewSpec, 'generated');
    notify('Command preview updated. Review it before posting.');
  });
  bind('command-action', () => updateActionNotice(), 'input');
  bind('action-search', renderActionChoices, 'input');
  bind('action-choice', () => { if ($('#action-choice').value) { $('#command-action').value = $('#action-choice').value; updateActionNotice(); } }, 'change');
  if (isAction) loadCommandActions();
}
function captureCommand() {
  for (const key of ['sourceName', 'actor', 'action', 'roll', 'attackBonus', 'damageBonus', 'repeat', 'level', 'value', 'fixedInitiative', 'ac', 'save', 'advanced']) {
    const input = $('#command-' + key.replace('sourceName', 'source-name'));
    if (input) commandDraft[key] = input.value;
  }
}
async function loadCommandActions() {
  const sourceKey = commandDraft.sourceKey, creature = C.creatures(workspace).find(c => c.key === sourceKey);
  abilities = [];
  if (creature) {
    try { const result = await api('analyze', 'POST', { creature: creature.data }); if (page !== 'commands' || commandDraft.sourceKey !== sourceKey) return; abilities = result.abilities; }
    catch (e) { notify(e.message, true); }
  }
  if (page === 'commands' && $('#action-choice')) { renderActionChoices(); updateActionNotice(); }
}
function renderActionChoices() {
  const filter = ($('#action-search')?.value || '').toLowerCase();
  const rows = abilities.flatMap(a => (a.names.length ? a.names : [a.title]).map(name => ({ name, ability: a })));
  $('#action-names').innerHTML = rows.map(a => `<option value="${escape(a.name)}"></option>`).join('');
  $('#action-choice').innerHTML = '<option value="">Choose or type an action name…</option>' + rows.filter(a => (a.name + ' ' + a.ability.title).toLowerCase().includes(filter)).map(a => `<option value="${escape(a.name)}">${escape(a.name)} · ${escape(a.ability.section)}${a.ability.status === 'explicit' ? ' · source present' : ' · unverified'}</option>`).join('');
}
function updateActionNotice() {
  const action = $('#command-action')?.value, a = abilities.find(a => a.names.includes(action) || a.title === action);
  if (!$('#action-info')) return;
  $('#action-info').textContent = a ? `Visible title: ${a.title}. ${a.names.length ? 'Executable name(s): ' + a.names.join(', ') + '.' : 'No explicit automation found; Avrae text parsing is unverified.'} ${a.warnings.join(' ')}` : 'Choose an imported action or type the exact executable action / spell name.';
}
function channelOptions() {
  return `<option value="">${connected ? 'Select a channel…' : 'Discord offline · local copy available'}</option>` + channels.map(c => `<option value="${escape(c.id)}" ${workspace.preferences.channelId === c.id ? 'selected' : ''}>${escape(c.name)}</option>`).join('');
}
function renderPreviews() {
  $('#command-previews').innerHTML = previewCommands.map((command, i) => `<div><pre class="command-preview">${escape(command)}</pre><button data-copy-preview="${i}" class="quiet">⧉ Copy ${previewCommands.length > 1 ? 'line ' + (i + 1) : 'command'}</button></div>`).join('') || '<div class="empty small">Your next move will appear here.<br>Build a command to preview it.</div>';
  if (previewCommands.length > 1) $('#command-previews').insertAdjacentHTML('beforeend', '<p class="warning">Send each command as a separate Discord message, in this order. Posting previews does not execute the sequence.</p>');
  $$('[data-copy-preview]').forEach(b => b.onclick = () => copy(previewCommands[Number(b.dataset.copyPreview)]));
  if ($('#post-commands')) $('#post-commands').textContent = previewCommands.length > 1 ? 'Post all previews' : 'Post to channel';
}
function queueHTML() {
  return workspace.queue.map((q, i) => `<div class="record"><strong class="small">${escape(q.name || 'Queued command')} · ${q.commands.length} line(s)</strong><pre>${escape(q.commands[0])}</pre><div class="toolbar tight"><button data-use-queue="${i}">Load preview</button><button data-remove-queue="${i}" class="quiet">Remove</button></div></div>`).join('') || '<p class="history-empty">Collect your next moves here.</p>';
}
async function recordHistory(commands, spec, status) {
  await commit(w => { w.history.unshift({ id: uid(), commands: C.clone(commands), spec: C.clone(spec), status, createdAt: new Date().toISOString() }); w.history = w.history.slice(0, 200); }, false, false);
}
function bindCommandOutput() {
  bind('post-channel', async () => { const id = $('#post-channel').value; await commit(w => { w.preferences.channelId = id; }, false); }, 'change');
  bind('post-commands', async () => {
    if (!previewCommands.length) throw new Error('Build or load a command preview first.');
    const channelId = $('#post-channel').value; if (!channelId) throw new Error('Select a destination channel.');
    if (previewCommands.length > 1 && !confirm(`Post ${previewCommands.length} separate command previews to the selected channel?`)) return;
    $('#post-commands').disabled = true;
    try {
      const result = await api('post', 'POST', { channelId, commands: previewCommands });
      const posted = result.results.filter(r => r.posted), failed = result.results.find(r => !r.posted);
      $('#post-result').textContent = `${posted.length} preview(s) posted.${failed ? ' Stopped: ' + failed.error : ' Copy and send each command, or dismiss with ✅.'}`;
      if (posted.length) await recordHistory(posted.map(r => r.command), previewSpec, 'posted');
      if (failed) notify('Some previews could not be posted. Successful previews were kept; check the result before retrying.', true);
    } finally { if ($('#post-commands')) $('#post-commands').disabled = !connected; }
  });
  for (const [id, key] of [['queue-command', 'queue'], ['favorite-command', 'favorites']]) bind(id, async () => {
    if (!previewCommands.length) throw new Error('Build a command preview first.');
    const name = prompt(key === 'queue' ? 'Queue label' : 'Favorite name', commandDraft.action || 'Encounter commands'); if (!name?.trim()) return;
    await commit(w => { w[key].push({ id: uid(), name, commands: C.clone(previewCommands), spec: C.clone(previewSpec), createdAt: new Date().toISOString() }); }, false);
    if (key === 'queue') { $('#queue-items').innerHTML = queueHTML(); bindQueue(); }
    notify(key === 'queue' ? 'Added to command queue.' : 'Favorite saved.');
  });
  bindQueue();
}
function bindQueue() {
  $$('[data-use-queue]').forEach(b => b.onclick = () => { const item = workspace.queue[Number(b.dataset.useQueue)]; previewCommands = C.clone(item.commands); previewSpec = C.clone(item.spec); if (item.spec?.draft) commandDraft = C.clone(item.spec.draft); renderCommands(); });
  $$('[data-remove-queue]').forEach(b => b.onclick = async () => { try { await commit(w => w.queue.splice(Number(b.dataset.removeQueue), 1)); } catch (e) { notify(e.message, true); } });
}

function renderArchive() {
  function records(rows, kind) {
    return rows.map((item, i) => `<div class="record"><div class="section-title"><strong>${escape(item.name || (item.status === 'posted' ? 'Posted to Discord' : 'Generated preview'))}</strong><span class="muted">${escape(new Date(item.createdAt).toLocaleString())}</span></div><pre>${item.commands.map(escape).join('\n')}</pre><div class="toolbar tight"><button data-reuse="${kind}:${i}">Reuse & edit actor / targets</button><button data-copy-record="${kind}:${i}">Copy${item.commands.length > 1 ? ' lines' : ''}</button><button data-delete-record="${kind}:${i}" class="quiet danger">Remove</button></div></div>`).join('') || '<p class="history-empty">Nothing here yet.</p>';
  }
  $('#main').innerHTML = title('KEEP THE GOOD MOVES', 'History & favorites', 'Reuse a command, then change its actor, targets, or modifiers.') + `<div class="split"><section class="card"><div class="card-header"><h2>Command history</h2><span class="badge">Last 200</span></div>${records(workspace.history, 'history')}</section><section class="card"><div class="card-header"><h2>Favorites</h2><span class="badge">${workspace.favorites.length}</span></div>${records(workspace.favorites, 'favorites')}</section></div>`;
  $$('[data-reuse]').forEach(b => b.onclick = () => { const [kind, i] = b.dataset.reuse.split(':'), item = workspace[kind][Number(i)]; if (item.spec?.draft) commandDraft = C.clone(item.spec.draft); previewCommands = C.clone(item.commands); previewSpec = C.clone(item.spec); page = 'commands'; render(); });
  $$('[data-copy-record]').forEach(b => b.onclick = () => { const [kind, i] = b.dataset.copyRecord.split(':'); copy(workspace[kind][Number(i)].commands.join('\n')); });
  $$('[data-delete-record]').forEach(b => b.onclick = async () => { const [kind, i] = b.dataset.deleteRecord.split(':'); try { await commit(w => w[kind].splice(Number(i), 1)); } catch (e) { notify(e.message, true); } });
}

function renderSettings() {
  $('#main').innerHTML = title('MAKE IT YOURS', 'Settings & backups', 'Local files, familiar defaults, and a way to take everything with you.') +
    `<div class="split"><div class="stack"><section class="card card-pad"><h2>Command preferences</h2><p class="section-note">Match the command prefix configured for Avrae in your server.</p>${input('setting-prefix', 'Avrae prefix', workspace.preferences.prefix)}<p><button id="save-settings" class="primary">Save preferences</button></p></section><section class="card card-pad"><h2>Controller presets</h2><p class="section-note">Use real Discord user IDs or mentions. Labels can be anything; @handles alone do not supply an ID.</p>${workspace.controllers.map((c, i) => `<div class="encounter-row"><div><strong>${escape(c.name)}</strong><p>${escape(c.value)}</p></div><button data-remove-controller="${i}" class="quiet danger">Remove</button></div>`).join('')}<div class="grid-two">${input('controller-label', 'Preset label', '')}${input('controller-value', 'Discord ID / <@ID> mention', '')}</div><p><button id="add-controller">Add controller</button></p></section><section class="card card-pad"><h2>Imported files</h2><p class="section-note">Export a source file as an individual creature or whole bestiary, matching its original structure.</p>${workspace.documents.map((d, i) => `<div class="encounter-row"><div><strong>${escape(d.label)}</strong><p>${d.data.creatures ? 'Whole bestiary' : 'Individual creature'} · ${C.list(d).length} creature(s)</p></div><div class="toolbar tight"><button data-copy-doc="${i}">Copy JSON</button><button data-export-doc="${i}">Export</button><button data-delete-doc="${i}" class="danger">Remove</button></div></div>`).join('') || '<p class="muted">No files imported.</p>'}</section></div><div class="stack"><section class="card card-pad"><h2>Workspace backups</h2><p class="muted">Back up your creatures, collection metadata, encounters, controllers, preferences, history, favorites, and command queue.</p><div class="toolbar"><button id="export-workspace" class="primary">Export workspace backup</button><button id="import-workspace">Restore backup</button></div><input id="workspace-file" type="file" accept=".json,application/json" hidden><div class="notice">An Aina workspace backup is a different format from CritterDB JSON. Use file exports for CritterDB. Bot credentials are never included.</div></section><section class="card card-pad"><h2>How this workspace works</h2><p class="muted">Files save under <code>data/critter/</code> on the computer running Aina. Browser storage is not the primary copy. The last saved workspace is also retained as <code>workspace.json.previous</code>.</p><p class="muted">The editor works without Discord or internet access. It is bound to this computer. Discord posting requires Aina to be connected.</p><p class="muted">Discord controls are restricted to the application owner, or CRITTER_OWNER_ID if configured. The browser trusts access to this local computer.</p><p class="muted">Undo covers the last 30 workspace changes in this browser session. Use backups for changes across sessions. Separate open windows detect save conflicts.</p><p class="muted">Avrae does not execute Aina’s previews. You copy and send them. Aina deletes its own preview after your matching message, ✅ button, or ✅ reaction; this does not confirm Avrae execution.</p></section><section class="card card-pad"><h2>Syntax references</h2><p class="muted">Command generation follows Avrae’s published command list and current public initiative parser.</p><p><a href="https://avrae.io/commands" target="_blank" rel="noopener noreferrer">Avrae command reference ↗</a></p><p><a href="https://github.com/avrae/avrae/blob/nightly/cogs5e/models/homebrew/bestiary.py" target="_blank" rel="noopener noreferrer">CritterDB importer ↗</a></p></section></div></div>`;
  bind('save-settings', async () => { const prefix = C.prefix($('#setting-prefix').value.trim()); await commit(w => { w.preferences.prefix = prefix; }); notify('Command prefix saved. Rebuild old previews to use it.'); });
  bind('add-controller', async () => {
    const name = $('#controller-label').value.trim(), value = $('#controller-value').value.trim();
    if (!name || !/^(?:\d{15,22}|<@!?\d{15,22}>)$/.test(value)) throw new Error('Enter a preset label and a real numeric Discord user ID or <@ID> mention.');
    if (workspace.controllers.some(c => c.name.toLowerCase() === name.toLowerCase())) throw new Error('That controller label is already in use.');
    await commit(w => w.controllers.push({ name, value }));
  });
  $$('[data-remove-controller]').forEach(b => b.onclick = async () => { try { await commit(w => w.controllers.splice(Number(b.dataset.removeController), 1)); } catch (e) { notify(e.message, true); } });
  $$('[data-export-doc]').forEach(b => b.onclick = () => { const d = workspace.documents[Number(b.dataset.exportDoc)]; download(d.label, d.data); });
  $$('[data-copy-doc]').forEach(b => b.onclick = () => copyJSON(workspace.documents[Number(b.dataset.copyDoc)].data));
  $$('[data-delete-doc]').forEach(b => b.onclick = async () => { if (!confirm('Remove this entire source file and its creatures from this workspace? Encounter references will need updating.')) return; try { await commit(w => w.documents.splice(Number(b.dataset.deleteDoc), 1)); } catch (e) { notify(e.message, true); } });
  bind('export-workspace', () => download('aina-workspace-' + new Date().toISOString().slice(0, 10) + '.json', workspace));
  bind('import-workspace', () => $('#workspace-file').click());
  bind('workspace-file', async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 20 * 1024 * 1024) throw new Error('Backup exceeds 20 MB.');
    const restored = C.validateWorkspace(C.parseJSON(await file.text()));
    if (!confirm('Replace this workspace with the backup? Export the current workspace first if you need a separate copy.')) return;
    await commit(w => { for (const key of Object.keys(w)) delete w[key]; Object.assign(w, restored); }); notify('Workspace restored.');
  }, 'change');
}

async function refreshStatus() {
  try {
    const status = await api('status'); connected = status.connected; channels = status.channels;
    $('#connection-dot').classList.toggle('online', connected);
    $('#connection-label').textContent = connected ? 'Discord connected · owner workspace' : 'Offline editor · local files';
    if (status.error) notify(status.error, true);
    if (page === 'commands' && $('#post-channel')) {
      const selected = $('#post-channel').value;
      $('#post-channel').innerHTML = channelOptions(); if (channels.some(c => c.id === selected)) $('#post-channel').value = selected;
      $('#post-commands').disabled = !connected;
    }
  } catch { $('#connection-label').textContent = 'Workspace server unavailable'; $('#connection-dot').classList.remove('online'); }
}
async function start() {
  const result = await api('workspace'); workspace = result.workspace; revision = result.revision;
  $$('.nav').forEach(b => b.onclick = () => { if (!canLeave()) return; dirty = false; draft = null; page = b.dataset.page; render(); });
  bind('import-button', () => $('#import-files').click());
  bind('import-files', async e => { await importFiles([...e.target.files]); e.target.value = ''; }, 'change');
  bind('refresh-status', async () => {
    await refreshStatus();
    const result = await api('workspace');
    if (result.revision !== revision) {
      if (!canLeave()) return;
      workspace = result.workspace; revision = result.revision; dirty = false; draft = null; render();
      notify('Loaded the latest saved workspace.');
    }
  });
  bind('apply-raw', async () => {
    try {
      const value = C.validateCreature(C.parseJSON($('#raw-json').value)), ref = current();
      await commit(w => { const d = w.documents.find(d => d.id === ref.documentId); if (d.data.creatures) d.data.creatures[ref.index] = value; else d.data = value; });
      $('#raw-dialog').close(); notify('Valid JSON saved.');
    } catch (e) { $('#raw-error').textContent = e.message; }
  });
  window.addEventListener('beforeunload', e => { if (dirty || saving) { e.preventDefault(); e.returnValue = ''; } });
  render(); await refreshStatus();
  await window.startRemoteUI?.();
}
start().catch(e => { $('#main').innerHTML = '<div class="card empty"><h1>Workspace unavailable</h1><p>' + escape(e.message) + '</p><p>Start Aina or run npm run critter, then reload this page.</p></div>'; });
