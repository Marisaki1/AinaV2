window.CriticalEditor = (() => {
  function html(record) {
    const saved = CriticalRanges.config(record.draft), c = record.criticalDraft || { enabled: Boolean(saved), minimum: saved?.minimum || 20 };
    return '<section class="critical-trait-editor"><h3>Critical range · passive trait</h3><label class="check-row"><input id="creature-critical-enabled" type="checkbox" ' + (c.enabled ? 'checked' : '') + '>Use a creature-wide critical range</label><div class="crit-range-row"><label>Lowest natural roll<input id="creature-critical-minimum" type="number" min="1" max="20" value="' + (c?.minimum || 20) + '"></label><output id="creature-critical-label">' + CriticalRanges.label(c?.minimum || 20) + '</output></div><div class="toolbar compact">' + [20,19,18,15].map(n => '<button type="button" class="small" data-critical-preset="' + n + '">' + CriticalRanges.label(n) + '</button>').join('') + '</div><p class="hint">Stored as a passive trait. Explicit attack automation carries its critical minimum in exports. Review affected attacks before applying; saving throws are unaffected.</p><button id="creature-critical-preview">Preview critical trait changes</button><div id="creature-critical-review"></div></section>';
  }
  function bind(record, retain, render, materialize) {
    let sequence = 0;
    const changed = () => {
      sequence++; $('#creature-critical-review').replaceChildren();
      record.criticalDraft = { enabled: $('#creature-critical-enabled').checked, minimum: $('#creature-critical-minimum').value };
      $('#creature-critical-label').textContent = CriticalRanges.label($('#creature-critical-minimum').value || 20); retain();
    };
    $('#creature-critical-enabled').onchange = changed; $('#creature-critical-minimum').oninput = changed;
    document.querySelectorAll('[data-critical-preset]').forEach(n => n.onclick = () => { $('#creature-critical-enabled').checked = true; $('#creature-critical-minimum').value = n.dataset.criticalPreset; changed(); });
    $('#creature-critical-preview').onclick = async () => {
      const token = ++sequence;
      try {
        const config = { enabled: $('#creature-critical-enabled').checked, minimum: $('#creature-critical-minimum').value };
        await materialize(); const before = JSON.stringify(record.draft);
        const result = await api('creature-critical-preview', 'POST', { creature: record.draft, config });
        if (token !== sequence || before !== JSON.stringify(record.draft)) throw new Error('The draft or critical settings changed. Preview again.');
        $('#creature-critical-review').innerHTML = '<h4>' + result.attacks + ' explicit attack automation entries reviewed</h4>' + result.warnings.map(w => '<p class="notice">' + escape(w) + '</p>').join('') + '<p>' + (config.enabled ? 'Adds/replaces the generated Critical Range passive trait.' : 'Removes the generated trait and restores tracked original attack thresholds when unchanged elsewhere.') + '</p>' + result.changes.map(c => '<details><summary>' + escape(c.name) + '</summary><div class="field-grid"><div><strong>Before</strong><pre>' + escape(c.before) + '</pre></div><div><strong>After</strong><pre>' + escape(c.after) + '</pre></div></div></details>').join('') + '<button id="creature-critical-apply" class="primary">Apply reviewed changes to draft</button>';
        $('#creature-critical-apply').onclick = () => {
          if (before !== JSON.stringify(record.draft) || token !== sequence) { Feedback.show('Preview again', 'Your draft changed; no critical changes were applied.', 'error'); return; }
          record.draft = result.candidate; delete record.criticalDraft; retain(); render(); Feedback.show('Critical trait updated in draft', 'Save locally, then save/export to CritterDB to keep this change.');
        };
      } catch(e) { Feedback.show('Critical trait not applied', e.message, 'error'); }
    };
  }
  function assertReviewed(record) { if (record.criticalDraft) throw new Error('Preview and apply your pending critical range settings before saving or exporting. Open Critical range passive under Abilities or Avrae defaults.'); }
  return { html, bind, assertReviewed };
})();
