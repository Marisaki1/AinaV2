window.AbilityToolsUI = (() => {
  const F = window.AbilityToolsModel;
  const input = (id, label, value = '', type = 'number') => '<label>' + label + '<input id="' + id + '" type="' + type + '" value="' + escape(value) + '"></label>';
  function open(sourceKey, section, index) {
    const ref = C.creatures(workspace).find(c => c.key === sourceKey), entry = ref?.data.stats[section]?.[index];
    if (!entry) throw new Error('Select an existing ability.');
    const definition = Authoring.recipe(entry.description), followup = F.validateFollowup(definition?.followup), usage = F.validateUsage(definition?.usage);
    const rows = M.expand(M.ordered(workspace.currentEncounter.entries)).filter(e => !e.unresolved);
    const casters = rows.filter(e => e.sourceKey === sourceKey), selected = casters.find(e => e.rosterKey === ui.rosterKey) || (casters.length === 1 ? casters[0] : null);
    const initialOperation = followup.enabled ? followup.operation : usage.enabled ? 'resource' : 'adjust';
    const root = $('#ability-tools-root'), dialog = $('#ability-tools-dialog'); let prepared = [], report = '', posting = false, lastPost = null;
    root.innerHTML = '<div class="dialog-heading"><div><div class="eyebrow">EXPLICIT FOLLOW-UP</div><h2>' + escape(entry.name) + '</h2></div><button id="fu-close">Close</button></div>' + (followup.rules ? '<p class="notice">' + escape(followup.rules) + '</p>' : '') + '<div class="field-grid">' + AuthoringUI.select('fu-operation', 'Operation', [...(usage.enabled ? [['resource', 'Track local uses']] : []), ['adjust', 'Adjust a recorded total'], ['reverse', 'Reverse a recorded outcome'], ['save', 'Reroll a live saving throw'], ['check', 'Reroll a live ability / skill check'], ['attack', 'Reroll an attack die only'], ['dice', 'Roll extra dice'], ['initiative', 'Swap initiative values']], initialOperation) + AuthoringUI.select('fu-actor', 'Affected combatant', [['', 'Choose from initiative'], ...rows.map(e => [e.name, e.name])], selected?.name || '') + '</div><div id="fu-original"><div class="field-grid">' + input('fu-total', 'Original total') + AuthoringUI.select('fu-success', 'Original outcome', [['success', 'Success'], ['failure', 'Failure']], 'success') + '</div><label class="check-row"><input id="fu-special" type="checkbox">Natural 1/20 or another automatic / special result applies</label></div><div class="field-grid"><div id="fu-adjustment-wrap">' + input('fu-adjustment', 'Signed adjustment', followup.adjustment || 0) + '</div><div id="fu-dc-wrap">' + input('fu-dc', 'DC / AC (optional)') + '</div></div><div id="fu-reroll">' + AuthoringUI.select('fu-stat', 'Save / check', C.abilities.map(a => [a, CombatTraits.label(a)]), 'constitution') + CreatureFields.radios('fu-roll', [['normal', 'Normal'], ['adv', 'Advantage'], ['dis', 'Disadvantage']], 'normal') + '<div id="fu-bonus-wrap">' + input('fu-bonus', 'Total to-hit bonus, including relevant modifiers', definition?.attackBonus || 0) + '</div></div><div id="fu-dice-wrap">' + input('fu-dice', 'Dice', followup.dice || '1d8', 'text') + '</div><div id="fu-swap"><div class="field-grid">' + AuthoringUI.select('fu-other', 'Second combatant', [['', 'Choose another combatant'], ...rows.map(e => [e.name, e.name])]) + input('fu-init', 'Actual first initiative') + input('fu-other-init', 'Actual second initiative') + '</div><label class="check-row"><input id="fu-confirm" type="checkbox">I checked the live initiative values, target eligibility, range and any CR restriction.</label><p class="hint">These commands use the values you confirm. Avrae can reject changing the current combatant’s initiative.</p></div><p id="fu-explanation" class="hint"></p><pre id="fu-preview" aria-live="polite"></pre><p id="fu-error" class="error" role="status"></p><div id="fu-posting" class="toolbar"><button id="fu-post" class="primary">Post as Aina</button><button id="fu-copy">Copy result / commands</button></div><p id="fu-manual-state" class="hint">Nothing intercepts a roll or edits the original Discord result. Previous damage, conditions, action costs and uses require explicit correction. Avrae application status unknown.</p>' + (usage.enabled ? '<details class="local-usage"' + (initialOperation === 'resource' ? ' open' : '') + '><summary>Local use tracker · ' + escape(usage.name) + ' <span id="fu-pool-summary"></span></summary>' + AuthoringUI.select('fu-caster', 'Ability user / tracked copy', [['', 'Choose the ability user'], ...casters.map(e => [e.rosterKey, e.name])], selected?.rosterKey || '') + '<p id="fu-pool-state" role="status"></p><div class="field-grid">' + input('fu-pool-set', 'Known remaining uses') + input('fu-cost', 'Amount to spend', usage.cost + (definition?.scaling?.enabled ? Number(optionsFor(selected)?.scalingSteps || 0) : 0)) + '</div><div class="toolbar"><button id="fu-pool-initialize" class="small">Set remaining</button><button id="fu-spend" class="small">Spend recorded uses</button>' + (usage.reset === 'turn' ? '<button id="fu-reset" class="small">Reset for next turn</button>' : usage.reset === 'rest' ? '<button id="fu-short" class="small">Apply short-rest recovery</button><button id="fu-reset" class="small">Apply long-rest recovery</button>' : '') + '</div><p id="fu-pool-error" class="error"></p><p class="hint">Local bookkeeping only. Posting a command does not spend uses here. This tracker does not write Avrae counters or synchronize with its encounter.</p></details>' : '');
    function optionsFor(caster) { return caster && ui.perRoster[caster.rosterKey]; }
    function refreshStatOptions() {
      const kind = $('#fu-operation').value;
      $('#fu-stat').innerHTML = C.abilities.map(a => '<option value="' + a + '">' + CombatTraits.label(a) + '</option>').join('') + (kind === 'check' ? CombatTraits.skills.map(s => '<option value="' + s + '">' + CombatTraits.label(s) + '</option>').join('') : '');
    }
    function setInheritedRoll() {
      const actor = rows.find(r => r.name === $('#fu-actor').value), cfg = workspace.combatTraits?.[actor?.sourceKey], kind = $('#fu-operation').value;
      const mode = ['save', 'check'].includes(kind) ? CombatTraits.inherited(cfg, kind, $('#fu-stat').value) : 'normal';
      const node = document.querySelector('[name="fu-roll"][value="' + mode + '"]'); if (node) node.checked = true;
    }
    function update() {
      const operation = $('#fu-operation').value, reroll = ['save', 'check', 'attack'].includes(operation);
      $('#fu-preview').hidden = operation === 'resource'; $('#fu-posting').hidden = operation === 'resource'; $('#fu-manual-state').hidden = operation === 'resource';
      $('#fu-original').hidden = !['adjust', 'reverse'].includes(operation); $('#fu-total').parentElement.hidden = operation === 'reverse'; $('#fu-success').closest('label').hidden = operation !== 'reverse';
      $('#fu-adjustment-wrap').hidden = ['reverse', 'dice', 'initiative', 'resource'].includes(operation); $('#fu-dc-wrap').hidden = !['adjust', 'save', 'check'].includes(operation);
      $('#fu-reroll').hidden = !reroll; $('#fu-stat').closest('label').hidden = operation === 'attack'; $('#fu-bonus-wrap').hidden = operation !== 'attack';
      $('#fu-dice-wrap').hidden = operation !== 'dice'; $('#fu-swap').hidden = operation !== 'initiative';
      $('#fu-actor').closest('label').hidden = ['adjust', 'reverse', 'dice', 'attack', 'resource'].includes(operation);
      $('#fu-explanation').textContent = operation === 'attack' ? 'Rolls only an attack die with the total bonus you enter. It does not execute the original attack again, deal damage, spend a resource or automatically read live attack bonuses.' : ['save', 'check'].includes(operation) ? 'A new roll by the selected live combatant. This does not retroactively replace the old roll or undo its consequences. Explicit Normal cancels advantage sources; other live effects can cancel opposing choices.' : operation === 'dice' ? 'Extra dice are rolled only on your click. Check the original ability’s trigger and any cap, then apply the correct damage explicitly.' : '';
      try {
        const spec = { operation, actor: $('#fu-actor').value, stat: $('#fu-stat').value, roll: document.querySelector('[name="fu-roll"]:checked')?.value || 'normal', adjustment: $('#fu-adjustment').value || '0', total: $('#fu-total').value, dc: $('#fu-dc').value, success: $('#fu-success').value, special: $('#fu-special').checked, bonus: $('#fu-bonus').value, dice: $('#fu-dice').value, other: $('#fu-other').value, initiative: $('#fu-init').value, otherInitiative: $('#fu-other-init').value, confirmed: $('#fu-confirm').checked };
        prepared = F.commands(spec, ui.prefix); report = '';
        if (['adjust', 'reverse'].includes(operation)) {
          if (operation === 'adjust' && spec.total === '') { $('#fu-preview').textContent = 'Enter the original roll total to evaluate the adjustment.'; $('#fu-error').textContent = ''; $('#fu-post').disabled = true; $('#fu-copy').disabled = true; return; }
          const result = F.evaluate(spec); report = (result.total !== undefined ? 'Adjusted total: ' + result.total + '\n' : '') + 'Outcome: ' + result.outcome + '\n' + result.detail;
        }
        $('#fu-preview').textContent = report || prepared.join('\n'); $('#fu-error').textContent = '';
      } catch(e) { prepared = []; report = ''; $('#fu-preview').textContent = ''; $('#fu-error').textContent = e.message; }
      $('#fu-post').disabled = posting || !prepared.length || !connected || !channels.some(c => c.id === ui.channelId); $('#fu-copy').disabled = !prepared.length && !report;
    }
    function pool() {
      const casterKey = $('#fu-caster').value, max = F.maximum(usage, ref.data);
      const state = ui.perRoster[casterKey]?.resources?.[usage.name];
      return { casterKey, max, state };
    }
    function paintPool() {
      const { casterKey, max, state } = pool();
      $('#fu-pool-state').textContent = !casterKey ? 'Choose the encounter copy to track.' : !state ? 'Not initialized. Maximum: ' + max + '. Enter its known remaining uses.' : Math.min(state.remaining, max) + ' / ' + max + ' locally recorded · Avrae status unknown';
      $('#fu-pool-summary').textContent = casterKey && state ? ' - ' + Math.min(state.remaining, max) + '/' + max : ' - not initialized';
      $('#fu-spend').disabled = !casterKey || !state;
    }
    function changePool(action) {
      try {
        const { casterKey, max, state } = pool(); if (!casterKey) throw new Error('Select the ability user first.');
        let remaining;
        if (action === 'set') remaining = F.number($('#fu-pool-set').value, 'Known remaining uses', 0, max);
        else { if (!state) throw new Error('Initialize the known remaining uses first.'); remaining = F.changePool(state.remaining, max, action, action === 'spend' ? $('#fu-cost').value : usage.shortRestoreMode === 'half' ? Math.ceil(max / 2) : usage.shortRestore); }
        ui.perRoster[casterKey] ||= {}; ui.perRoster[casterKey].resources ||= {}; ui.perRoster[casterKey].resources[usage.name] = { remaining, maximum: max, updatedAt: new Date().toISOString() };
        remember(); $('#fu-pool-error').textContent = ''; paintPool();
      } catch(e) { $('#fu-pool-error').textContent = e.message; }
    }
    root.querySelectorAll('input,select').forEach(n => n.addEventListener(n.type === 'checkbox' || n.type === 'radio' || n.tagName === 'SELECT' ? 'change' : 'input', update));
    $('#fu-operation').addEventListener('change', () => { refreshStatOptions(); setInheritedRoll(); if ($('#fu-operation').value === 'resource') root.querySelector('.local-usage').open = true; update(); });
    $('#fu-stat').addEventListener('change', () => { setInheritedRoll(); update(); });
    $('#fu-actor').addEventListener('change', () => { $('#fu-confirm').checked = false; const actor = rows.find(r => r.name === $('#fu-actor').value); $('#fu-init').value = actor?.fixedInitiative ?? ''; setInheritedRoll(); update(); });
    $('#fu-other').addEventListener('change', () => { $('#fu-confirm').checked = false; $('#fu-other-init').value = rows.find(r => r.name === $('#fu-other').value)?.fixedInitiative ?? ''; update(); });
    ['fu-init', 'fu-other-init'].forEach(id => $('#' + id).addEventListener('input', () => { $('#fu-confirm').checked = false; update(); }));
    $('#fu-init').value = selected?.fixedInitiative ?? '';
    $('#fu-close').onclick = () => dialog.close(); $('#fu-copy').onclick = () => copy(report || prepared.join('\n'));
    $('#fu-post').onclick = async () => {
      if (posting || !prepared.length) return;
      const fingerprint = JSON.stringify([ui.channelId, prepared]);
      if (lastPost?.fingerprint === fingerprint && Date.now() - lastPost.at < 1500) { Feedback.show('Already submitted', 'Check Discord before posting the same follow-up again.'); return; }
      lastPost = { fingerprint, at: Date.now() }; posting = true; const outgoing = prepared.slice(); update();
      try {
        if (outgoing.length === 1) await SenderUI.send(outgoing[0]);
        else { const result = await api('post', 'POST', { requestId: uid(), channelId: ui.channelId, commands: outgoing }); Feedback.show('Initiative commands posted', result.results.filter(r => r.posted).length + ' of ' + outgoing.length + ' previews posted. Execute each yourself; inspect Discord before posting any missing command again.'); }
      } catch(e) { if (!e.status) lastPost.at = Infinity; Feedback.show('Could not confirm posting', 'Check Discord before trying again. ' + e.message, 'error'); }
      finally { posting = false; update(); }
    };
    if (usage.enabled) {
      $('#fu-caster').addEventListener('change', paintPool); $('#fu-pool-initialize').onclick = () => changePool('set'); $('#fu-spend').onclick = e => { if (e.detail > 1) return; changePool('spend'); };
      if ($('#fu-short')) $('#fu-short').onclick = () => changePool('restore'); if ($('#fu-reset')) $('#fu-reset').onclick = () => changePool('reset'); paintPool();
    }
    refreshStatOptions(); setInheritedRoll(); update(); dialog.showModal();
  }
  return { open };
})();
