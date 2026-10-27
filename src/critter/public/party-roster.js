window.PartyRoster = (() => {
  const names = ['Sanae', 'Shuu', 'Reisen', 'Byron'];
  let pending = false;
  function html() {
    const rows = workspace.currentEncounter.entries;
    return '<section class="party-roster"><h3>Players in this fight</h3><div class="party-options">' + names.map(name => { const row = rows.find(e => e.kind === 'player' && e.partyName === name); return '<label><input type="checkbox" data-party-player="' + name + '" ' + (row ? 'checked' : '') + '>' + name + '</label>'; }).join('') + '</div><small>Choose participants, then enter their initiative in the roster. Players join Avrae themselves; this only prepares Aina’s roster and targets.</small></section>';
  }
  function bind() {
    document.querySelectorAll('[data-party-player]').forEach(n => n.onchange = () => run(async () => {
      if (pending) { n.checked = !n.checked; return; }
      pending = true; n.disabled = true;
      document.querySelector('.party-roster').inert = true;
      const include = n.checked, name = n.dataset.partyPlayer;
      try { await updateRoster(entries => {
        const found = entries.find(e => e.kind === 'player' && e.partyName === name);
        if (!include) return entries.filter(e => e !== found);
        if (found) return entries;
        return M.ordered([...entries, { id: uid(), kind:'player', partyName:name, name, sourceName:name, sourceKey:'', quantity:'1', fixedInitiative:'', initiativeBonus:'' }]);
      }); remember(); }
      catch(e) { await renderWorkspace(); throw e; }
      finally { pending = false; const current = document.querySelector('.party-roster'); if (current) current.inert = false; }
    }));
  }
  function renderSelected(roster) {
    const opts = options(); if (!['saves','checks'].includes(opts.category)) opts.category = 'saves';
    const save = opts.category !== 'checks';
    $('#content-panel').innerHTML = '<div class="panel-heading"><div><div class="eyebrow">PLAYER COMBATANT</div><h1>' + escape(roster.name) + '</h1><p class="hint">Character sheet and actions stay in Avrae. Live state unknown.</p></div><button id="player-manage">Manage</button></div><nav class="section-tabs"><button data-player-category="saves" class="' + (save ? 'active' : '') + '">Saves</button><button data-player-category="checks" class="' + (!save ? 'active' : '') + '">Checks</button></nav><div class="roll-grid">' + (save ? C.abilities : [...C.abilities, ...CombatTraits.skills]).map(a => '<button data-player-stat="' + a + '">' + escape(CombatTraits.label(a)) + '</button>').join('') + '</div><p class="hint">Use the exact encounter name from Avrae. This local entry does not import stats, join combat, or grant control of a player’s sheet.</p>';
    document.querySelectorAll('[data-player-category]').forEach(n => n.onclick = () => { opts.category = n.dataset.playerCategory; opts.check = ''; remember(); renderWorkspace().catch(e => message(e.message,true)); });
    document.querySelectorAll('[data-player-stat]').forEach(n => n.onclick = () => { opts.category = save ? 'saves' : 'checks'; opts.check = n.dataset.playerStat; remember(); renderCommand(); });
    $('#player-manage').onclick = () => CombatControls.open(roster.id);
  }
  return { names, html, bind, renderSelected };
})();
