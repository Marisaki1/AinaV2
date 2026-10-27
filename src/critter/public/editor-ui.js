(function () {
  let record = null, request = 0;
  const keyFor = key => 'aina-creature-draft:' + key;
  const tabs = { flavor: 'Flavor', race: 'Race', stats: 'Core', defense: 'Defense', abilities: 'Abilities', challenge: 'Challenge', spellcasting: 'Spellcasting & resources', defaults: 'Avrae defaults', json: 'Raw JSON' };
  const sections = { additionalAbilities: 'Traits', actions: 'Actions', reactions: 'Reactions', legendaryActions: 'Legendary actions' };
  const traitChanged = () => JSON.stringify(record.config) !== JSON.stringify(record.previousTraits);
  const reviewCurrent = () => record.traitsReview && record.traitsReview.stamp === JSON.stringify([record.draft, record.config]);
  function retain() { record.dirty = true; if ($('#editor-save-state')) $('#editor-save-state').textContent = 'Unsaved local draft'; try { localStorage.setItem(keyFor(record.key), JSON.stringify(record)); } catch {} }
  function error(e) { const node = $('#editor-error'); if (node) node.textContent = e.message; Feedback.show('Edits were not saved', e.message, 'error'); }
  async function materialize() {
    const current = record; SpellcastingUI.commit(current); CreatureFields.ensure(current);
    const signature = () => JSON.stringify([current.draft, current.raw, current.edits, current.calculations]);
    const stamp = signature(), edits = C.clone(Object.values(current.edits)), calculations = C.clone(current.calculations);
    let candidate = current.raw !== undefined ? C.validateCreature(C.parseJSON(current.raw)) : C.clone(current.draft);
    for (const edit of edits) if (edit.name) for (const link of calculations.links || []) if (link.section === edit.section && link.index === edit.index) link.entryName = edit.name;
    if (edits.length) candidate = (await api('ability-edit', 'POST', { creature: candidate, edits })).creature;
    if (Spellcasting.read(candidate)?.enabled || Spellcasting.read(candidate)?.applyAttack) for (const edit of edits) { const e=candidate.stats[edit.section]?.[edit.index]; if (!e) continue; const fields=analysisCache.get(current.key)?.analysis?.find(a=>a.section===edit.section&&a.index===edit.index)?.fields || []; for(const patch of edit.fields||[]) { const f=fields.find(f=>f.id===patch.id); if(f&&patch.value!==f.value&&f.label==='Target save DC') Spellcasting.setOverride(e,'dc',true); if(f&&patch.value!==f.value&&f.label==='To-hit bonus') Spellcasting.setOverride(e,'attack',true); } }
    candidate = (await api('creature-calculate', 'POST', { creature: candidate, calculations })).creature;
    if (record !== current || stamp !== signature()) throw new Error('Your draft changed while calculations were running. Your latest edits are retained; try the operation again.');
    C.validateCreature(candidate);
    for (const key of ['_id', 'id', 'bestiaryId', 'publishedBestiaryId']) if (JSON.stringify(current.original[key]) !== JSON.stringify(candidate[key])) throw new Error('Keep the original creature ID and collection membership.');
    current.draft = candidate; current.calculations = calculations; current.edits = {}; delete current.raw;
    return candidate;
  }
  function field(path, label, type = 'text', wide = false) {
    const value = path.split('.').reduce((v, p) => v?.[p], record.draft);
    return `<label class="${wide ? 'wide' : ''}">${escape(label)}${type === 'textarea' ? `<textarea rows="5" data-edit-path="${path}"></textarea>` : `<input type="${type}" data-edit-path="${path}" value="${escape(value ?? '')}">`}</label>`;
  }
  function statsHTML() {
    const r = record, f = (...args) => field(...args);
    if (r.tab === 'flavor') return '<div class="field-grid">' + f('name', 'Creature name') + f('flavor.imageUrl', 'Image URL') + f('flavor.description', 'Description / original HTML', 'textarea', true) + '</div><label class="check-row"><input id="proper-name" type="checkbox" ' + (r.draft.flavor?.nameIsProper ? 'checked' : '') + '>Name is a proper name</label>';
    if (r.tab === 'race') return '<div class="field-grid">' + f('stats.race', 'Creature type / race') + AuthoringUI.select('creature-size', 'Size', [...new Set(['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', r.draft.stats.size].filter(Boolean))], r.draft.stats.size) + f('stats.speed', 'Speed') + f('stats.alignment', 'Alignment') + '</div>' + ['senses', 'languages'].map(k => '<label>' + CombatTraits.label(k) + ' (one per line)<textarea data-list-path="' + k + '" rows="3">' + escape((r.draft.stats[k] || []).join('\n')) + '</textarea></label>').join('');
    if (r.tab === 'spellcasting') return SpellcastingUI.html(r);
    if (r.tab === 'defense') return CreatureFields.defense(r);
    if (r.tab === 'challenge') return '<div class="field-grid">' + f('stats.challengeRating', 'Challenge rating', 'number') + f('stats.experiencePoints', 'Experience points', 'number') + f('stats.legendaryActionsPerRound', 'Legendary actions per round', 'number') + '<button id="open-resource-notes" class="small">Edit legendary description & resources</button>' + '</div>';
    return CreatureFields.core(r);
  }

  function defaultsHTML() {
    const T = CombatTraits, cfg = record.config || { traits: [] };
    const control = (scope, stat, label) => AuthoringUI.select('default-' + scope + '-' + (stat || 'all'), label, [['normal', 'No additional default'], ['adv', 'Advantage'], ['dis', 'Disadvantage']], cfg.traits.find(t => t.id === 'default-' + scope + '-' + (stat || 'all'))?.mode || 'normal');
    return '<h2>Default saving throws & checks</h2><p class="hint">Only configure mechanics this creature already has. These are temporary encounter passives, separate from base modifiers. Importing does not activate them: export, update CritterDB and Avrae, then run the generated Setup Traits command for each combatant. Application status unknown.</p><div class="field-grid">' + control('allSaves', '', 'All six saving throws') + control('allChecks', '', 'All ability and skill checks (excludes initiative)') + '</div><h3>Selected saving throws</h3><div class="field-grid">' + C.abilities.map(a => control('saves', a, T.label(a))).join('') + '</div><h3>Selected base ability checks</h3><p class="hint">Base-only checks use command flags in this editor; outside Aina append adv/dis manually. Applying an Avrae base-check passive would also affect skills and Dexterity initiative.</p><div class="field-grid">' + C.abilities.map(a => control('abilities', a, T.label(a))).join('') + '</div><h3>Selected skills</h3><div class="field-grid">' + T.skills.map(a => control('skills', a, T.label(a))).join('') + '</div>' + (cfg.traits.some(t => !t.id.startsWith('default-')) ? '<p class="hint">Other configured traits and conditional restrictions are preserved. Edit them under Combat traits in the main view.</p>' : '') + '<button id="editor-traits-review" class="primary">Preview default modifiers & automation</button><div id="editor-traits-preview"></div>' + CriticalEditor.html(record);
  }
  function bindDefaults() {
    CriticalEditor.bind(record, retain, render, materialize);
    document.querySelectorAll('[id^="default-"]').forEach(n => n.onchange = () => {
      record.config ||= { id: uid().replace(/-/g, ''), traits: [] };
      const [_, scope, ...tail] = n.id.split('-'), stat = tail.join('-'); Authoring.defaultTrait(record.config, scope, stat === 'all' ? '' : stat, n.value);
      delete record.traitsReview; retain(); $('#editor-traits-preview').replaceChildren();
    });
    $('#editor-traits-review').onclick = async () => { try {
      await materialize(); if (!record.config) throw new Error('Choose a modifier first.');
      const stamp = JSON.stringify([record.draft, record.config]), result = await api('creature-traits-preview', 'POST', { creature: record.draft, config: record.config, previous: record.previousTraits });
      if (stamp !== JSON.stringify([record.draft, record.config])) throw new Error('Draft changed. Preview again.');
      record.traitsReview = { stamp, candidate: result.candidate };
      $('#editor-traits-preview').innerHTML = '<h3>Pending generated utility</h3><p class="hint">Save changes to apply this locally. Other automation remains unchanged.</p><pre class="trait-code">' + escape(result.after.description) + '</pre>'; retain();
    } catch(e) { error(e); } };
  }
  function previewHTML() { return CreatureFields.preview(record); }
  function bindStats() { CreatureFields.bind(record, { retain, render }); }
  async function abilityHTML() {
    const generation = ++request, tab = record.section;
    if ($('#editor-ability-detail')) $('#editor-ability-detail').textContent='Loading ability?';
    const data = await api('analyze', 'POST', { creature: record.draft });
    if (!record || request !== generation || tab !== record.section || !$('#editor-ability-detail')) return;
    const rows = data.abilities.filter(a => a.section === tab);
    record.index = Math.min(record.index, Math.max(0, rows.length - 1));
    CreaturePanels.render($('#editor-ability-list'), Object.entries(sections).map(([key, label]) => ({ key, label, rows: data.abilities.filter(a => a.section === key).map(a => ({ id: key + ':' + a.index, title: a.title, summary: plain(a.readable) })) })), tab + ':' + record.index, async id => {
      $('#editor-ability-detail').textContent='Loading ability...';
      try { await materialize(); const [section, index] = id.split(':'); record.section = section; record.index = Number(index); abilityHTML().catch(error); } catch(e) { error(e); }
    }, section => { AuthoringUI.builder(section, async entry => { await materialize(); record.draft.stats[section] ||= []; record.draft.stats[section].push(SpellcastingUI.normalizeGenerated(record,entry)); record.section = section; record.index = record.draft.stats[section].length - 1; retain(); render(); }, { ...SpellcastingUI.generatedOptions(record), defaultCriton: CriticalRanges.config(record.draft)?.minimum }); });
    const showCritical = () => { $('#editor-ability-detail').innerHTML = CriticalEditor.html(record); CriticalEditor.bind(record, retain, render, materialize); };
    $('#editor-ability-list').insertAdjacentHTML('afterbegin', '<div class="toolbar"><button id="edit-critical-passive" class="small">Critical range passive</button><button id="edit-resource-notes" class="small">Legendary notes / resources</button></div>');
    $('#edit-critical-passive').onclick = showCritical;
    $('#edit-resource-notes').onclick=()=>{record.tab='spellcasting';render();};
    const a = rows[record.index]; if (!a) { $('#editor-ability-detail').innerHTML = '<p class="empty">No abilities in this section.</p>'; return; }
    if (CriticalRanges.marker.test(record.draft.stats[a.section][a.index].description)) { showCritical(); return; }
    if (record.draft.stats[a.section][a.index].description.includes('<!-- AINA_COMBAT_TRAITS:')) { $('#editor-ability-detail').innerHTML = '<h3>Generated Avrae trait setup</h3><p class="hint">Manage default saving throw and check modifiers in Avrae defaults. Conditional traits remain in the main Combat traits panel.</p><button id="utility-defaults">Open Avrae defaults</button><details><summary>Generated utility source</summary><pre class="trait-code">' + escape(record.draft.stats[a.section][a.index].description) + '</pre></details>'; $('#utility-defaults').onclick = () => { record.tab = 'defaults'; render(); }; return; }
    const identity = a.section + ':' + a.index, edit = record.edits[identity] || { section: a.section, index: a.index, fields: [] };
    const pending = new Map(edit.fields.map(f => [f.id, f.value]));
    const controls = { quick: [], advanced: [] };
    a.fields.forEach((f, i) => { if (f.kind === 'list') { const selected = JSON.parse(pending.get(f.id) ?? f.value); controls.quick.push(AuthoringUI.checklist('mechanic-' + i, f.label, [...new Set([...f.choices, ...selected])], selected)); return; } const html = `<label>${escape(f.label)}${f.label === 'Effect rules reminder' ? `<textarea data-mechanic="${i}" aria-label="${escape(f.label)}" rows="3">${escape(pending.get(f.id) ?? f.value)}</textarea>` : f.originalType === 'boolean' || /attack.*advantage|Effect attack_advantage/.test(f.label) ? `<select data-mechanic="${i}" aria-label="${escape(f.label)}">${(f.originalType === 'boolean' ? [['false', 'No'], ['true', 'Yes']] : [['0', 'Normal'], ['1', 'Advantage'], ['-1', 'Disadvantage'], ['2', 'Elven Accuracy']]).map(([v, name]) => `<option value="${v}" ${v === (pending.get(f.id) ?? f.value) ? 'selected' : ''}>${name}</option>`).join('')}</select>` : /\btype$/i.test(f.label) ? `<select data-mechanic="${i}" aria-label="${escape(f.label)}">${[...new Set([...Authoring.damageTypes.map(v => /^[A-Z]/.test(f.value) ? CombatTraits.label(v) : v), pending.get(f.id) ?? f.value])].map(v => `<option value="${escape(v)}" ${v === (pending.get(f.id) ?? f.value) ? 'selected' : ''}>${escape(v)}</option>`).join('')}</select>` : f.label === 'Target saving throw ability' ? `<select data-mechanic="${i}" aria-label="${escape(f.label)}">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(v => `<option ${v === (pending.get(f.id) ?? f.value) ? 'selected' : ''}>${v}</option>`).join('')}</select>` : `<input data-mechanic="${i}" aria-label="${escape(f.label)}" value="${escape(pending.get(f.id) ?? f.value)}">`}</label>`; controls[f.label === 'Executable name' || /\{.*\}/.test(f.value) ? 'advanced' : 'quick'].push(html); });
    const fieldsHTML = a.fields.length ? `<div class="field-grid">${controls.quick.join('')}</div>${controls.advanced.length ? `<details><summary>Advanced automation fields</summary><div class="field-grid">${controls.advanced.join('')}</div></details>` : ''}` : '<p class="hint">Correct this ability’s rules below. There are no recognized attack or saving-throw fields.</p>';
    $('#editor-ability-detail').innerHTML = `<label>Ability title<input id="editor-ability-name" value="${escape(edit.name ?? a.title)}"></label><div class="toolbar"><button id="editor-save-action" class="primary">Save action locally</button><button id="editor-reconfigure">Configure ability</button><button id="editor-ability-up">Move up</button><button id="editor-ability-down">Move down</button><button id="editor-ability-remove" class="danger">Remove from draft</button></div><h3>Attack, damage & target saves</h3>${fieldsHTML}<h3>Rules / description</h3><p class="hint">${a.blocks.length ? 'Automation controls what Avrae rolls. Correct the description separately when its wording needs to match. Unknown automation is preserved.' : 'These controls update the existing rules text. Simple damage dice also update their displayed average. No hidden automation is invented.'}</p><textarea id="editor-rules" rows="7"></textarea><details><summary>Original automation code</summary>${a.blocks.map((b, i) => `<label>Automation block ${i + 1}<textarea class="code" rows="9" data-raw-block="${i}"></textarea></label>`).join('') || '<p class="hint">No hidden automation block.</p>'}</details>`;
    $('#editor-save-action').onclick = () => $('#editor-save').onclick();
    $('#editor-reconfigure').onclick = async () => { try {
      await materialize(); const section = a.section, index = a.index, before = C.clone(record.draft.stats[section][index]);
      const definition = Authoring.recipe(before.description) || { name: before.name, rules: plain(C.splitDescription(before.description).readable), kind: 'description', damages: [], effects: [] };
      AuthoringUI.builder(section, async entry => {
        await materialize();
        if (JSON.stringify(record.draft.stats[section][index]) !== JSON.stringify(before)) throw new Error('This ability changed while configuring it. Close and review the latest source before replacing it.');
        record.draft.stats[section][index] = { ...before, name: entry.name, description: SpellcastingUI.normalizeGenerated(record,entry).description };
        record.calculations.links = (record.calculations.links || []).filter(l => l.section !== section || l.index !== index);
        record.edits = {}; record.section = section; record.index = index; retain(); render();
      }, { ...SpellcastingUI.generatedOptions(record), defaultCriton: CriticalRanges.config(record.draft)?.minimum, definition, beforeEntry: before });
    } catch(e) { error(e); } };

    for (const [id, step] of [['editor-ability-up', -1], ['editor-ability-down', 1], ['editor-ability-remove', 0]]) $('#' + id).onclick = async () => { try { await materialize(); const list = record.draft.stats[tab], at = record.index; if (step === 0) { list.splice(at, 1); record.calculations.links = (record.calculations.links || []).filter(l => l.section !== tab || l.index !== at).map(l => l.section === tab && l.index > at ? { ...l, index: l.index - 1 } : l); } else if (list[at + step]) { [list[at], list[at + step]] = [list[at + step], list[at]]; for (const link of record.calculations.links || []) if (link.section === tab) { if (link.index === at) link.index += step; else if (link.index === at + step) link.index -= step; } record.index += step; } retain(); render(); } catch(e) { error(e); } };
    $('#editor-rules').value = edit.readable ?? plain(a.readable);
    const changed = () => { record.edits[identity] = edit; retain(); };
    $('#editor-ability-name').oninput = e => { edit.name = e.target.value; changed(); };
    $('#editor-rules').oninput = e => { edit.readable = e.target.value; changed(); };
    const patch = (field, value) => { const existing = edit.fields.find(p => p.id === field.id); if (existing) existing.value = value; else edit.fields.push({ id: field.id, value }); };
    document.querySelectorAll('[data-choice^="mechanic-"]').forEach(input => { input.disabled = Boolean(edit.rawBlocks); input.onchange = () => { const i = Number(input.dataset.choice.slice(9)); patch(a.fields[i], JSON.stringify(AuthoringUI.checked('mechanic-' + i))); changed(); }; });
    document.querySelectorAll('[data-mechanic]').forEach(input => { input.disabled = Boolean(edit.rawBlocks); input.oninput = () => {
      const f = a.fields[Number(input.dataset.mechanic)]; patch(f, input.value);
      if (f.averageId) { const dice = input.value.replace(/\s/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i), i = a.fields.findIndex(field => field.id === f.averageId); if (dice && i >= 0) { const average = String(Math.floor(Number(dice[1] || 1) * (Number(dice[2]) + 1) / 2 + Number(dice[3] || 0))); $('#editor-ability-detail [data-mechanic="' + i + '"]').value = average; patch(a.fields[i], average); } }
      changed();
    }; });
    SpellcastingUI.attachAbility(record, a, edit, retain, render);
    ActionFormulas.attach(record, a, retain);
    document.querySelectorAll('[data-raw-block]').forEach(input => { const i = Number(input.dataset.rawBlock); input.value = edit.rawBlocks?.[i] ?? a.blocks[i].source; input.oninput = () => { edit.rawBlocks ||= a.blocks.map(b => b.source); edit.rawBlocks[i] = input.value; edit.fields = []; record.calculations.links = (record.calculations.links || []).filter(l => l.section !== a.section || l.index !== a.index); document.querySelectorAll('[data-mechanic], [data-choice^="mechanic-"]').forEach(node => { node.disabled = true; }); changed(); }; });
  }
  function render() {
    const r = record; CreatureFields.ensure(r);
    $('#editor-root').innerHTML = `<div class="editor-top"><div class="dialog-heading"><div><h2>Edit ${escape(r.draft.name)}</h2><span class="hint">Local creature data · original IDs and collection are preserved</span></div><div class="editor-actions"><button id="editor-close">Close</button><button id="editor-review">Review changes</button><button id="editor-save" class="primary">Save locally</button><button id="editor-remote-save" class="primary">Save to CritterDB</button></div></div><div class="export-row"><button id="editor-export-creature">Export creature JSON</button><button id="editor-export-bestiary">Export full bestiary JSON</button><span id="editor-save-state" class="hint">${r.dirty ? 'Unsaved local draft' : 'Saved in library'}</span></div></div><div id="editor-review-panel"></div><nav class="editor-nav">${Object.entries(tabs).map(([key, name]) => `<button data-editor-tab="${key}" class="${key === r.tab ? 'active' : ''}">${name}</button>`).join('')}</nav><p id="editor-error" class="editor-error" role="status"></p><div class="editor-body">${r.recovered ? '<p class="editor-recovery">Recovered your unsaved creature edits.</p>' : ''}${r.tab === 'abilities' ? `<div class="editor-ability-layout four-pane-editor"><div id="editor-ability-list"></div><div id="editor-ability-detail">Loading abilities...</div></div>` : r.tab === 'defaults' ? defaultsHTML() : r.tab !== 'json' ? `<div class="creature-layout"><section>${statsHTML()}</section><aside id="editor-statblock" class="statblock-preview">${previewHTML()}</aside></div>` : r.tab === 'json' ? '<label>Complete creature JSON<textarea id="editor-json" class="code" rows="22"></textarea></label>' : '<div class="editor-ability-layout four-pane-editor"><div id="editor-ability-list"></div><div id="editor-ability-detail">Loading fields…</div></div>'}</div>`;
    document.querySelectorAll('[data-editor-tab]').forEach(b => b.onclick = async () => { if (r.tab === b.dataset.editorTab) return; try { await materialize(); r.tab = b.dataset.editorTab; r.index = 0; render(); } catch (e) { error(e); } });
    document.querySelectorAll('[data-editor-section]').forEach(b => b.onclick = async () => { try { await materialize(); r.section = b.dataset.editorSection; r.index = 0; render(); } catch(e) { error(e); } });
    $('#editor-review').onclick = async () => { try {
      await materialize(); let candidate = record.draft;
      if (traitChanged()) {
        const stamp = JSON.stringify([record.draft, record.config]), result = await api('creature-traits-preview', 'POST', { creature: record.draft, config: record.config, previous: record.previousTraits });
        if (stamp !== JSON.stringify([record.draft, record.config])) throw new Error('Draft changed; review again.');
        record.traitsReview = { stamp, candidate: result.candidate }; candidate = result.candidate;
      }
      const changes = [];
      const walk = (a, b, path) => { if (JSON.stringify(a) === JSON.stringify(b)) return; if (C.object(a) && C.object(b)) for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], path ? path + '.' + k : k); else changes.push({ path, before: a, after: b }); };
      walk(record.original, candidate, '');
      walk(record.previousCalculations, record.calculations, 'Workspace calculation settings');
      $('#editor-review-panel').innerHTML = '<details open class="pending-review"><summary>Pending changes (' + changes.length + ' fields)</summary>' + changes.map(c => '<h3>' + escape(c.path) + '</h3><div class="field-grid"><div><strong>Before</strong><pre>' + escape(JSON.stringify(c.before, null, 2) ?? 'Absent') + '</pre></div><div><strong>After</strong><pre>' + escape(JSON.stringify(c.after, null, 2) ?? 'Absent') + '</pre></div></div>').join('') + (!changes.length ? '<p>No creature fields changed.</p>' : '') + '</details>';
    } catch(e) { error(e); } };
    $('#editor-close').onclick = () => { if (record.dirty) retain(); $('#editor-dialog').close(); };
    $('#editor-save').onclick = async () => {
      try { CriticalEditor.assertReviewed(record); } catch(e) { error(e); return; }
      $('#editor-save').disabled = true;
      $('#editor-root').inert = true;
      $('#editor-save-state').textContent = 'Saving…';
      try {
        const candidate = await materialize();
        if (traitChanged() && !reviewCurrent()) { await $('#editor-review').onclick(); if (reviewCurrent()) Feedback.show('Review generated roll defaults', 'The pending changes are shown above. Click Save again to confirm the reviewed automation.', 'info'); return; }
        const result = await api('creature', 'PUT', { key: r.key, original: r.original, candidate, calculations: r.calculations, previousCalculations: r.previousCalculations, ...(traitChanged() ? { traits: r.config, previousTraits: r.previousTraits } : {}) });
        workspace = result.workspace; revision = result.revision; r.original = C.clone(C.creatures(workspace).find(c => c.key === r.key).data); r.draft = C.clone(r.original); r.previousCalculations = C.clone(workspace.creatureCalculations?.[r.key] || null); r.calculations = C.clone(r.previousCalculations || CreatureMath.infer(r.draft)); r.previousTraits = C.clone(workspace.combatTraits?.[r.key] || null); r.config = C.clone(r.previousTraits); delete r.traitsReview; r.dirty = false; r.recovered = false;
        try { localStorage.removeItem(keyFor(r.key)); } catch {}
        analysisCache.delete(r.key); await renderWorkspace(); render(); $('#editor-save-state').textContent = 'Saved in library'; Feedback.show(r.tab === 'abilities' ? 'Action and creature saved locally' : 'Creature saved locally', 'Saved on this computer. Choose Save to CritterDB to update your account.');
      } catch (e) { retain(); error(e); } finally { $('#editor-root').inert = false; if ($('#editor-save')) $('#editor-save').disabled = false; }
    };
    $('#editor-remote-save').onclick = async () => { if (record.dirty) await $('#editor-save').onclick(); if (!record.dirty) await DirectUI.open(record.key); };
    for (const [id, full] of [['editor-export-creature', false], ['editor-export-bestiary', true]]) $('#' + id).onclick = async () => { try { CriticalEditor.assertReviewed(record); let candidate = await materialize(); if (traitChanged()) { if (!reviewCurrent()) throw new Error('Click Review changes before exporting changed roll-default automation.'); candidate = record.traitsReview.candidate; } if (full) { const ref = C.creatures(workspace).find(c => c.key === r.key), result = M.bestiary(workspace, r.key); if (workspace.documents.find(d => d.id === ref.documentId).data.creatures) result.creatures[ref.index] = C.clone(candidate); else result.creatures = C.creatures(workspace).map(c => C.clone(c.key === r.key ? candidate : c.data)); download(result.name + '_Bestiary_CritterDB.json', result); } else download(candidate.name + '_CritterDB.json', candidate); } catch (e) { error(e); } };
    if ($('#open-resource-notes')) $('#open-resource-notes').onclick=()=>{record.tab='spellcasting';render();};
    if (r.tab === 'spellcasting') SpellcastingUI.bind(r,retain,render,materialize); else if (r.tab === 'defaults') bindDefaults(); else if (!['abilities', 'json'].includes(r.tab)) bindStats(); else if (r.tab === 'json') { $('#editor-json').value = JSON.stringify(r.draft, null, 2); $('#editor-json').oninput = e => { r.raw = e.target.value; retain(); }; } else abilityHTML().catch(error);
  }
  async function open(key, section = 'stats', index = 0) {
    const ref = C.creatures(workspace).find(c => c.key === key); if (!ref) throw new Error('Choose a creature first.');
    record = { key, original: C.clone(ref.data), draft: C.clone(ref.data), edits: {}, tab: C.sections.includes(section) ? 'abilities' : section, section: C.sections.includes(section) ? section : 'actions', index, dirty: false, previousCalculations: C.clone(workspace.creatureCalculations?.[key] || null), calculations: C.clone(workspace.creatureCalculations?.[key] || CreatureMath.infer(ref.data)), previousTraits: C.clone(workspace.combatTraits?.[key] || null), config: C.clone(workspace.combatTraits?.[key] || null) };
    try { const cached = JSON.parse(localStorage.getItem(keyFor(key)) || 'null'); if (cached?.dirty && cached.key === key && C.object(cached.draft)) record = { ...cached, recovered: true }; } catch {}
    render(); $('#editor-dialog').showModal();
  }
  function syncRemote(key, result) {
    if (!record || record.key !== key) return; const ref = C.creatures(result.workspace).find(c => c.key === key); if (!ref) return;
    record.original = C.clone(ref.data); record.draft = C.clone(ref.data); record.previousCalculations = C.clone(result.workspace.creatureCalculations?.[key] || null); record.calculations = C.clone(record.previousCalculations || CreatureMath.infer(ref.data)); record.edits = {}; delete record.raw; record.dirty = false; record.previousTraits = C.clone(result.workspace.combatTraits?.[key] || null); record.config = C.clone(record.previousTraits); delete record.traitsReview;
    try { localStorage.removeItem(keyFor(key)); } catch {} render();
  }
  window.EditorUI = { open, syncRemote, forget: keys => { if (record && keys.includes(record.key)) record = null; }, dirty: () => Boolean(record?.dirty) };
})();
