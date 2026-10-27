window.AttackModifiers = (() => {
  function inherited() {
    const ref = source(); if (!ref) return 20;
    const trait = CriticalRanges.config(ref.data); if (trait) return trait.minimum;
    const part = options().ability.split(':');
    const row = analysisCache.get(ref.key)?.analysis.find(a => a.section === part[0] && a.index === Number(part[1]));
    const values = [...new Set((row?.fields || []).filter(f => f.label === 'Critical minimum').map(f => Number(f.value)))];
    return values.length === 1 && values[0] >= 1 && values[0] <= 20 ? values[0] : 20;
  }
  function threshold(opts) { return CriticalRanges.minimum(opts.criton || inherited()); }
  function eligible() { const ref = source(), part = options().ability.split(':'); return Boolean(analysisCache.get(ref?.key)?.analysis.find(a => a.section === part[0] && a.index === Number(part[1]))?.hasAttack); }
  function html(opts) {
    const attack = eligible();
    return '<section class="attack-modifiers">' + (attack ? '<fieldset class="compact-fieldset"><legend>Critical hit</legend>' + CreatureFields.radios('combat-critical', [['normal', 'Normal'], ['crit', 'Crit'], ['nocrit', 'No crit']], opts.critical || 'normal') + '<div class="crit-range-row"><label>Crit from<input id="crit-minimum" type="number" min="1" max="20" value="' + escape(opts.criton || inherited()) + '"></label><output id="crit-range-label">' + CriticalRanges.label(opts.criton || inherited()) + '</output><button id="crit-default" class="small quiet" aria-label="Use creature critical default" title="Use creature default">&#8634;</button></div></fieldset>' : '') + '<details class="bonus-disclosure"' + (opts.attackBonus || opts.damageBonus ? ' open' : '') + '><summary>To hit &amp; damage bonuses' + (opts.attackBonus || opts.damageBonus ? ' - set' : '') + '</summary><div class="bonus-editor"><label>Extra to hit</label><div class="bonus-stepper"><button type="button" ' + (!attack ? 'disabled ' : '') + 'data-bonus-step="attackBonus:-1" aria-label="Decrease extra to hit">−</button><input ' + (!attack ? 'disabled ' : '') + 'id="attack-bonus" aria-label="Extra to hit" value="' + escape(opts.attackBonus || '') + '" placeholder="0 or 1d4"><button type="button" ' + (!attack ? 'disabled ' : '') + 'data-bonus-step="attackBonus:1" aria-label="Increase extra to hit">+</button></div><label>Extra damage</label><div class="bonus-stepper"><button type="button" data-bonus-step="damageBonus:-1" aria-label="Decrease extra damage">−</button><input id="damage-bonus" aria-label="Extra damage" value="' + escape(opts.damageBonus || '') + '" placeholder="0 or 1d6"><button type="button" data-bonus-step="damageBonus:1" aria-label="Increase extra damage">+</button></div><div class="bonus-damage-options">' + AuthoringUI.select('bonus-die', 'Add damage die', [['', '+ Die'], ...[4,6,8,10,12,20].map(n => ['1d'+n, 'd'+n])]) + AuthoringUI.select('bonus-damage-type', 'Damage type', [['', 'Use attack type'], ...Authoring.damageTypes], opts.bonusDamageType || '') + '</div><div class="section-heading"><small>Extra modifiers for this command.</small><button id="reset-modifiers" class="small quiet">Reset</button></div></div></details></section>';
  }
  function typed(value, type) {
    value = String(value || '').trim();
    if (!type || !value) return value;
    // Wrap the whole extra expression, so the selected type applies to every term.
    return '(' + value.replace(/\[[a-z]+\]/gi, '').replace(/^\((.*)\)$/, '$1') + ')[' + type + ']';
  }
  function step(value, delta) {
    value = String(value || '').trim();
    if (!value || /^[+-]?\d+$/.test(value)) return String(Number(value || 0) + delta);
    return value + (delta > 0 ? '+' : '') + delta;
  }
  function bind(opts) {
    document.querySelectorAll('[name="combat-critical"]').forEach(n => n.onchange = () => { opts.critical = n.value; remember(); updatePreviewOnly(); });
    if ($('#crit-minimum')) $('#crit-minimum').oninput = e => { opts.criton = e.target.value; $('#crit-range-label').textContent = e.target.value ? CriticalRanges.label(e.target.value) : 'Creature default'; remember(); updatePreviewOnly(); };
    if ($('#crit-default')) $('#crit-default').onclick = () => { delete opts.criton; remember(); renderCommand(); };
    for (const [id,key] of [['attack-bonus','attackBonus'],['damage-bonus','damageBonus']]) $('#' + id).oninput = e => { opts[key] = e.target.value; remember(); updatePreviewOnly(); };
    document.querySelectorAll('[data-bonus-step]').forEach(n => n.onclick = () => { const [key,delta] = n.dataset.bonusStep.split(':'); opts[key] = step(opts[key], Number(delta)); remember(); renderCommand(); });
    $('#bonus-die').onchange = e => { if (e.target.value) { opts.damageBonus = opts.damageBonus ? opts.damageBonus + '+' + e.target.value : e.target.value; remember(); renderCommand(); } };
    $('#bonus-damage-type').onchange = e => { opts.bonusDamageType = e.target.value; remember(); updatePreviewOnly(); };
    $('#reset-modifiers').onclick = () => { Object.assign(opts, { critical:'normal', attackBonus:'', damageBonus:'', bonusDamageType:'' }); delete opts.criton; remember(); renderCommand(); };
  }
  return { html, bind, threshold, typed, step, eligible };
})();
