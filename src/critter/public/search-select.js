/* Shared searchable dropdowns. The original select remains the form value and event source. */
(() => {
  const widgets = new Map(); let serial = 0, active = null, observer;
  const folded = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  function labelFor(select) {
    if (select.getAttribute('aria-label')) return select.getAttribute('aria-label');
    const label = select.labels?.[0];
    if (label) { const copy = label.cloneNode(true); copy.querySelectorAll('select,input,textarea,button').forEach(n => n.remove()); const name = copy.textContent.trim().replace(/\s+/g, ' '); if (name) return name; }
    return select.name || 'Option';
  }
  function close(focus = false) {
    if (!active) return;
    const old = active; active = null; old.popup.remove(); old.button.setAttribute('aria-expanded', 'false');
    if (focus && old.button.isConnected) old.button.focus();
  }
  function position(w) {
    const rect = w.button.getBoundingClientRect(), width = Math.min(Math.max(rect.width, 260), innerWidth - 20);
    const below = innerHeight - rect.bottom - 12, above = rect.top - 12, flip = below < 210 && above > below;
    const content = 65 + [...w.list.children].reduce((total, n) => total + n.getBoundingClientRect().height, 0);
    const height = Math.max(110, Math.min(360, flip ? above : below, content));
    Object.assign(w.popup.style, { width: width + 'px', left: Math.max(10, Math.min(rect.left, innerWidth - width - 10)) + 'px', top: (flip ? Math.max(10, rect.top - height - 5) : rect.bottom + 5) + 'px', height: height + 'px' });
  }
  function highlight(w, index) {
    const options = [...w.list.querySelectorAll('[role="option"]')];
    options.forEach(n => n.classList.remove('ss-active'));
    w.highlighted = index; const node = options[index];
    if (node) { node.classList.add('ss-active'); w.query.setAttribute('aria-activedescendant', node.id); node.scrollIntoView({ block: 'nearest' }); }
    else w.query.removeAttribute('aria-activedescendant');
  }
  function choose(w, option) {
    if (option.disabled || option.parentElement?.disabled || w.select.disabled) return;
    close(); w.select.value = option.value;
    w.select.dispatchEvent(new Event('input', { bubbles: true }));
    w.select.dispatchEvent(new Event('change', { bubbles: true }));
    sync(w); if (w.button.isConnected) w.button.focus();
  }
  function render(w) {
    const terms = folded(w.query.value).split(/\s+/).filter(Boolean);
    const options = [...w.select.options].filter(o => !o.hidden && !o.parentElement?.hidden && terms.every(t => folded(o.textContent + ' ' + (o.dataset.description || '') + ' ' + (o.parentElement?.label || '')).includes(t)));
    w.list.replaceChildren();
    for (const [i, option] of options.entries()) {
      const item = document.createElement('div'); item.id = w.id + '-option-' + i; item.className = 'ss-option'; item.dataset.value = option.value; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(option.selected));
      const disabled = option.disabled || option.parentElement?.disabled; item.setAttribute('aria-disabled', String(Boolean(disabled)));
      const title = document.createElement('span'); title.textContent = option.textContent; item.append(title);
      const description = option.dataset.description || (option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement.label : '');
      if (description) { const hint = document.createElement('small'); hint.textContent = description; item.append(hint); }
      item.onpointerdown = e => e.preventDefault(); item.onmouseenter = () => highlight(w, i); item.onclick = () => choose(w, option); item._option = option; w.list.append(item);
    }
    if (!options.length) { const empty = document.createElement('p'); empty.className = 'ss-empty'; empty.setAttribute('role', 'status'); empty.textContent = 'No matches'; w.list.append(empty); }
    const selected = options.findIndex(o => o.selected && !o.disabled && !o.parentElement?.disabled);
    position(w);
    highlight(w, selected >= 0 && !terms.length ? selected : options.findIndex(o => !o.disabled && !o.parentElement?.disabled));
  }
  function open(w) {
    if (w.select.matches(':disabled') || w.button.closest('[inert]')) return;
    if (active === w) { close(true); return; } close(); active = w;
    const popup = document.createElement('div'); popup.className = 'ss-popup'; popup.id = w.id + '-popup';
    const query = document.createElement('input'); query.type = 'search'; query.className = 'ss-query'; query.placeholder = 'Type to filter...'; query.setAttribute('aria-label', 'Filter ' + w.label); query.autocomplete = 'off'; query.setAttribute('aria-controls', w.id + '-list');
    const list = document.createElement('div'); list.className = 'ss-list'; list.id = w.id + '-list'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', w.label + ' options');
    Object.assign(w, { popup, query, list }); popup.append(query, list); (w.select.closest('dialog[open]') || document.body).append(popup);
    w.button.setAttribute('aria-expanded', 'true'); position(w); render(w); query.focus();
    query.oninput = () => render(w);
    query.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); const options = [...list.querySelectorAll('[role="option"]')]; const step = e.key === 'ArrowDown' ? 1 : -1;
        let next = w.highlighted; do { next += step; } while (next >= 0 && next < options.length && options[next].getAttribute('aria-disabled') === 'true');
        if (next >= 0 && next < options.length) highlight(w, next);
      }
      if (e.key === 'Enter') { e.preventDefault(); const item = list.querySelectorAll('[role="option"]')[w.highlighted]; if (item) choose(w, item._option); }
      if (e.key === 'Tab') {
        e.preventDefault(); close(true);
        const controls = [...document.querySelectorAll('button,input,textarea,select,a[href],[tabindex]')].filter(n => n.tabIndex >= 0 && !n.matches(':disabled') && n.getClientRects().length && !n.closest('[inert]'));
        const next = controls[controls.indexOf(w.button) + (e.shiftKey ? -1 : 1)]; next?.focus();
      }
    };
  }
  function sync(w) {
    const text = w.select.selectedOptions[0]?.textContent || 'Choose an option';
    if (w.caption.textContent !== text) w.caption.textContent = text;
    const disabled = w.select.matches(':disabled'); if (w.button.disabled !== disabled) w.button.disabled = disabled;
  }
  function enhance(select) {
    if (widgets.has(select) || select.multiple || select.dataset.nativeSelect !== undefined) return;
    const id = 'ss-' + ++serial, label = labelFor(select), wrapper = document.createElement('div'); wrapper.className = 'ss-control';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ss-trigger'; button.setAttribute('role', 'combobox'); button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', id + '-list'); button.setAttribute('aria-label', 'Choose ' + label);
    const caption = document.createElement('span'), arrow = document.createElement('span'); arrow.className = 'ss-arrow'; arrow.textContent = '▾'; arrow.setAttribute('aria-hidden', 'true'); button.append(caption, arrow);
    select.before(wrapper); wrapper.append(select, button);
    // Retain the existing control for forms and existing event handlers; expose the new combobox to assistive technology.
    select.classList.add('ss-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true'); select.setAttribute('aria-label', label);
    const w = { id, select, wrapper, button, caption, label, highlighted: -1 }; widgets.set(select, w); sync(w);
    button.onclick = e => { e.preventDefault(); open(w); };
    button.onkeydown = e => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(w); } };
    select.addEventListener('change', () => { sync(w); if (active === w) render(w); });
    const ancestor = select.closest('label'); if (ancestor) ancestor.addEventListener('click', e => { if (e.target === ancestor) { e.preventDefault(); open(w); } });
  }
  function scan() {
    for (const [select, w] of widgets) { if (!select.isConnected) { if (active === w) close(); widgets.delete(select); } else sync(w); }
    document.querySelectorAll('select').forEach(enhance);
  }
  function start() {
    scan(); observer = new MutationObserver(records => {
      scan(); if (active && records.some(r => r.target === active.select || active.select.contains(r.target))) render(active);
    }); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'label', 'value'] });
    document.addEventListener('pointerdown', e => { if (active && !active.popup.contains(e.target) && !active.wrapper.contains(e.target)) close(); }, true);
    document.addEventListener('cancel', () => close(), true);
    document.addEventListener('close', () => { if (active && !active.select.closest('dialog')?.open && active.select.closest('dialog')) close(); }, true);
    window.addEventListener('resize', () => { if (active) position(active); });
    window.addEventListener('scroll', e => { if (active && !active.popup.contains(e.target)) position(active); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.SearchSelect = { refresh: scan, close };
})();
