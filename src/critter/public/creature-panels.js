window.CreaturePanels = (() => {
  const states = new Map();
  function render(container, groups, selected, onSelect, onAdd) {
    const key = container.id || 'creature-panels';
    const state = states.get(key) || { expanded: null, scroll: {}, filters: {} };
    states.set(key, state);
    container.innerHTML = '<div class="ability-board">' + groups.map(g => '<section class="ability-pane"><div class="pane-heading"><h3>' + escape(g.label) + ' <span class="count">' + g.rows.length + '</span></h3>' + (onAdd ? '<button class="small" data-pane-add="' + escape(g.key) + '">+ Add</button>' : '') + '</div><input class="pane-search" type="search" data-pane-filter="' + escape(g.key) + '" placeholder="Search ' + escape(g.label.toLowerCase()) + '" aria-label="Search ' + escape(g.label) + '"><div class="pane-scroll" data-pane-list="' + escape(g.key) + '">' + g.rows.map(row => '<button class="pane-entry ' + (row.id === selected ? 'selected' : '') + '" data-pane-entry="' + escape(row.id) + '" data-search="' + escape((row.title + ' ' + (row.summary || '')).toLowerCase()) + '"><strong>' + escape(row.title) + '</strong>' + (row.summary ? '<small>' + escape(row.summary) + '</small>' : '') + '</button>').join('') + '<p class="pane-no-match hint" ' + (g.rows.length ? 'hidden' : '') + '>No entries</p></div></section>').join('') + '</div>';
    const board = container.querySelector('.ability-board');
    function updateExpanded() {
      const active = state.expanded;
      board.classList.toggle('ability-board-expanded', !!active);
      board.querySelectorAll('.ability-pane').forEach(pane => {
        const button = pane.querySelector('[data-pane-expand]');
        pane.hidden = !!active && button.dataset.paneExpand !== active;
        button.setAttribute('aria-expanded', String(button.dataset.paneExpand === active));
      });
    }
    board.querySelectorAll('.ability-pane').forEach((pane, index) => {
      const heading = pane.querySelector('.pane-heading h3');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'pane-expand'; button.dataset.paneExpand = groups[index].key;
      button.innerHTML = heading.innerHTML; heading.replaceChildren(button);
      button.onclick = () => { state.expanded = state.expanded === groups[index].key ? null : groups[index].key; updateExpanded(); };
    });
    updateExpanded();
    container.querySelectorAll('[data-pane-list]').forEach(list => {
      list.scrollTop = state.scroll[list.dataset.paneList] || 0;
      list.onscroll = () => { state.scroll[list.dataset.paneList] = list.scrollTop; };
    });
    container.querySelectorAll('[data-pane-entry]').forEach(b => b.onclick = () => {
      container.querySelectorAll('[data-pane-list]').forEach(list => { state.scroll[list.dataset.paneList] = list.scrollTop; });
      onSelect(b.dataset.paneEntry);
    });
    container.querySelectorAll('[data-pane-add]').forEach(b => b.onclick = () => onAdd(b.dataset.paneAdd));
    container.querySelectorAll('[data-pane-filter]').forEach(input => { input.value = state.filters[input.dataset.paneFilter] || ''; input.oninput = () => {
      state.filters[input.dataset.paneFilter] = input.value;
      const list = container.querySelector('[data-pane-list="' + input.dataset.paneFilter + '"]'), query = input.value.trim().toLowerCase(); let visible = 0;
      list.querySelectorAll('[data-pane-entry]').forEach(b => { b.hidden = !b.dataset.search.includes(query); if (!b.hidden) visible++; });
      const empty = list.querySelector('.pane-no-match'); empty.hidden = Boolean(visible); empty.textContent = query ? 'No matches' : 'No entries';
    }; input.oninput(); });
  }
  return { render };
})();
