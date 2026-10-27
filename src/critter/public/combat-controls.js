window.CombatControls = (() => {
  const modeKey = opts => opts.category + ':' + (opts.check || opts.ability || '');
  function inherited(opts) {
    const ref = source(); if (!ref) return 'normal';
    if (['saves', 'checks'].includes(opts.category)) return CombatTraits.inherited(workspace.combatTraits?.[ref.key], opts.category === 'saves' ? 'save' : 'check', opts.check);
    const [section, index] = (opts.ability || '').split(':');
    const fields = analysisCache.get(ref.key)?.analysis.find(a => a.section === section && a.index === Number(index))?.fields || [];
    const values = [...new Set(fields.filter(f => f.label.startsWith('Default attack advantage')).map(f => Number(f.value)))];
    return values.length === 1 ? values[0] > 0 ? 'adv' : values[0] === -1 ? 'dis' : 'normal' : 'normal';
  }
  function choice(opts) { return opts.rollChoices?.[modeKey(opts)] || inherited(opts); }
  const normalOverride = opts => opts.rollChoices?.[modeKey(opts)] === 'normal';
  function radios(opts) {
    const mode = choice(opts), base = inherited(opts);
    return '<fieldset class="roll-radios"><legend>Roll</legend>' + CreatureFields.radios('combat-roll', [['normal', 'Normal'], ['adv', 'Advantage'], ['dis', 'Disadvantage']], mode) + '<small>Creature default: ' + ({ normal: 'Normal', adv: 'Advantage', dis: 'Disadvantage' })[base] + '. Live effects can cancel; application unknown.</small></fieldset>';
  }
  function bindRoll(opts) {
    document.querySelectorAll('[name="combat-roll"]').forEach(n => n.onchange = () => { opts.rollChoices ||= {}; opts.rollChoices[modeKey(opts)] = n.value; remember(); updatePreviewOnly(); });
  }
  function flags(opts, config, type, stat, choices) {
    const selected = choice(opts);
    if (opts.rollChoices?.[modeKey(opts)] === 'normal') return ['adv', 'dis'];
    // A repeated adv/dis flag is a boolean source, not an extra die or bonus.
    return CombatTraits.flags(config, type, stat, choices, selected);
  }
  function command({ name, action, value = '', type = '', note = '' }, prefix = '!') {
    const p = C.prefix(prefix), actor = C.quote(name);
    const integer = (min = 0) => { if (!/^[+-]?\d+$/.test(value) || Number(value) < min || !Number.isSafeInteger(Number(value))) throw new Error('Enter a valid whole number.'); return String(Number(value)); };
    const amount = () => { if (!/^(?:\d+d[1-9]\d*|\d+)(?:[+-](?:\d+d[1-9]\d*|\d+))*$/i.test(value) || value.length > 100) throw new Error('Enter a positive amount or dice expression such as 10 or 1d6+2.'); return value; };
    if (action === 'damage') return p + 'i hp ' + actor + ' -(' + amount() + ')';
    if (action === 'heal') return p + 'i hp ' + actor + ' ' + amount();
    if (action === 'set') return p + 'i hp set ' + actor + ' ' + integer();
    if (action === 'max') return p + 'i hp max ' + actor + ' ' + integer(1);
    if (action === 'restore') return p + 'i hp max ' + actor;
    if (action === 'thp') return p + 'i thp ' + actor + ' ' + integer();
    if (action === 'ac') return p + 'i opt ' + actor + ' -ac ' + integer();
    if (action === 'acBonus') return p + 'i opt ' + actor + ' -ac ' + (Number(value) >= 0 ? '+' : '') + integer(-1000);
    if (['resist', 'immune', 'vuln', 'neutral'].includes(action)) { if (!Authoring.damageTypes.includes(type)) throw new Error('Select a damage type.'); return p + 'i opt ' + actor + ' -' + action + ' ' + type; }
    if (action === 'removeEffect') return p + 'i re ' + actor + ' ' + C.quote(note, 'Exact effect name');
    if (action === 'note') return p + 'i note ' + actor + ' ' + C.quote(note, 'Note');
    if (action === 'status') return p + 'i status ' + actor;
    throw new Error('Choose a combatant operation.');
  }
  function open(entryId) {
    const rows = M.expand(M.ordered(workspace.currentEncounter.entries)).filter(e => e.id === entryId || e.rosterKey === entryId);
    if (!rows.length || rows.some(e => e.unresolved)) throw new Error('Resolve the combatant names before preparing encounter changes.');
    const root = $('#unit-controls-root'), dialog = $('#unit-controls-dialog');
    root.innerHTML = '<div class="dialog-heading"><div><div class="eyebrow">ENCOUNTER COMMAND</div><h2>Manage combatant</h2></div><button id="unit-close">Close</button></div><div class="field-grid">' + AuthoringUI.select('unit-name', 'Combatant', rows.map(e => [e.name, e.name]), rows[0].name) + AuthoringUI.select('unit-action', 'Change', [['damage', 'Take resolved damage'], ['heal', 'Heal'], ['set', 'Set current HP'], ['thp', 'Set temporary HP'], ['max', 'Set maximum HP'], ['restore', 'Heal to maximum HP'], ['ac', 'Set AC'], ['acBonus', 'Adjust AC'], ['resist', 'Resistance'], ['immune', 'Immunity'], ['vuln', 'Vulnerability'], ['neutral', 'Remove damage defense'], ['removeEffect', 'Remove named effect'], ['note', 'Set note'], ['status', 'Inspect status']], 'damage') + '</div><label id="unit-value-label">Amount / dice<input id="unit-value" placeholder="10 or 1d6+2"></label><div id="unit-type-wrap">' + AuthoringUI.select('unit-type', 'Damage type', Authoring.damageTypes, 'fire') + '</div><label id="unit-note-label">Text<input id="unit-note"></label><p id="unit-hint" class="hint"></p><pre id="unit-preview"></pre><p id="unit-error" class="error" role="status"></p><div class="toolbar"><button id="unit-post" class="primary">Post as Aina</button><button id="unit-copy">Copy command</button></div><p class="hint">Changes apply only after you execute the command in Avrae. Library stats stay unchanged; live state is unknown.</p>';
    let prepared = '';
    const update = () => {
      const action = $('#unit-action').value;
      $('#unit-value-label').hidden = ['restore', 'status', 'resist', 'immune', 'vuln', 'neutral', 'removeEffect', 'note'].includes(action);
      $('#unit-type-wrap').hidden = !['resist', 'immune', 'vuln', 'neutral'].includes(action);
      $('#unit-note-label').hidden = !['removeEffect', 'note'].includes(action);
      $('#unit-hint').textContent = action === 'damage' ? 'Enter damage after saves and resistances are resolved. This adjusts HP; it does not calculate defenses.' : action === 'thp' ? 'Sets temporary HP. It does not add it to existing temporary HP.' : ['resist', 'immune', 'vuln', 'neutral'].includes(action) ? 'Changes this encounter combatant’s defense until changed again. For a timed defense, create a duration effect in an ability.' : '';
      try { prepared = command({ name: $('#unit-name').value, action, value: $('#unit-value').value.trim(), type: $('#unit-type').value, note: $('#unit-note').value.trim() }, ui.prefix); $('#unit-preview').textContent = prepared; $('#unit-error').textContent = ''; }
      catch(e) { prepared = ''; $('#unit-preview').textContent = ''; $('#unit-error').textContent = e.message; }
      $('#unit-post').disabled = !prepared || !connected || !channels.some(c => c.id === ui.channelId); $('#unit-copy').disabled = !prepared;
    };
    for (const id of ['unit-name', 'unit-action', 'unit-value', 'unit-type', 'unit-note']) $('#' + id).addEventListener(['unit-value', 'unit-note'].includes(id) ? 'input' : 'change', update);
    $('#unit-close').onclick = () => dialog.close(); $('#unit-copy').onclick = () => copy(prepared); $('#unit-post').onclick = () => SenderUI.send(prepared);
    update(); dialog.showModal();
  }
  return { inherited, choice, normalOverride, radios, bindRoll, flags, command, open };
})();
