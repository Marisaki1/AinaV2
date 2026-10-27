window.ActionFormulas = (() => {
  function attach(record, ability, retain) {
    const fields = ability.fields.filter(f => ['To-hit bonus', 'Target save DC'].includes(f.label) && /^[+-]?\d+$/.test(f.value));
    if (!fields.length) return;
    const links = record.calculations.links ||= [];
    const find = field => links.find(l => l.section === ability.section && l.index === ability.index && l.field === field.id);
    const root = document.createElement('details'); root.className = 'action-formulas';
    root.innerHTML = '<summary>Automatic stat formulas</summary><p class="hint">Link selected fields explicitly. Existing automation and unlinked damage expressions are preserved.</p>' + fields.map((f, i) => {
      const link = find(f), kind = f.label === 'Target save DC' ? 'dc' : 'attack';
      return '<fieldset class="compact-fieldset"><legend>' + escape(f.label) + '</legend><label class="check-row"><input type="checkbox" data-link-enable="' + i + '" ' + (link ? 'checked' : '') + '>Calculate from ability' + (kind === 'dc' ? ' + PB + 8' : ' + PB') + '</label><div class="field-grid">' + AuthoringUI.select('action-link-ability-' + i, 'Ability', C.abilities, link?.ability || 'strength') + '<label>Additional bonus<input type="number" id="action-link-bonus-' + i + '" value="' + (link?.bonus || 0) + '"></label></div><p class="hint" id="action-link-total-' + i + '"></p></fieldset>';
    }).join('');
    $('#editor-ability-detail').append(root);
    const update = (f, i) => {
      const enabled = root.querySelector('[data-link-enable="' + i + '"]').checked;
      const old = find(f); if (old) links.splice(links.indexOf(old), 1);
      if (enabled) links.push({ section: ability.section, index: ability.index, entryName: record.draft.stats[ability.section][ability.index].name, field: f.id, kind: f.label === 'Target save DC' ? 'dc' : 'attack', ability: $('#action-link-ability-' + i).value, bonus: Number($('#action-link-bonus-' + i).value || 0) });
      if(enabled&&globalThis.Spellcasting){const p=Spellcasting.read(record.draft),kind=f.label==='Target save DC'?'dc':'attack';if(p&&(kind==='dc'?p.enabled:p.applyAttack)){Spellcasting.setOverride(record.draft.stats[ability.section][ability.index],kind,true);const fixed=document.querySelector('[name="spell-override-'+kind+'"][value="fixed"]');if(fixed)fixed.checked=true;}}
      paint(f, i); retain();
    };
    const paint = (f, i) => {
      const link = find(f), input = document.querySelector('[data-mechanic="' + ability.fields.indexOf(f) + '"]');
      if (input) { input.disabled = Boolean(link); if (link) input.value = CreatureMath.formula(record.draft, link); }
      $('#action-link-total-' + i).textContent = link ? 'Calculated total: ' + CreatureMath.signed(CreatureMath.formula(record.draft, link)) : 'Using the existing value.';
    };
    fields.forEach((f, i) => { root.querySelector('[data-link-enable="' + i + '"]').onchange = () => update(f, i); $('#action-link-ability-' + i).onchange = () => update(f, i); $('#action-link-bonus-' + i).oninput = () => update(f, i); paint(f, i); });
  }
  return { attach };
})();
