window.CreaturePanels = (() => {
  function render(container, groups, selected, onSelect, onAdd) {
    container.innerHTML = '<div class="ability-board">' + groups.map(g => '<section class="ability-pane"><div class="pane-heading"><h3>' + escape(g.label) + ' <span class="count">' + g.rows.length + '</span></h3>' + (onAdd ? '<button class="small" data-pane-add="' + escape(g.key) + '">+ Add</button>' : '') + '</div><input class="pane-search" type="search" data-pane-filter="' + escape(g.key) + '" placeholder="Search ' + escape(g.label.toLowerCase()) + '" aria-label="Search ' + escape(g.label) + '"><div class="pane-scroll" data-pane-list="' + escape(g.key) + '">' + g.rows.map(row => '<button class="pane-entry ' + (row.id === selected ? 'selected' : '') + '" data-pane-entry="' + escape(row.id) + '" data-search="' + escape((row.title + ' ' + (row.summary || '')).toLowerCase()) + '"><strong>' + escape(row.title) + '</strong>' + (row.summary ? '<small>' + escape(row.summary.slice(0, 85)) + '</small>' : '') + '</button>').join('') + '<p class="pane-no-match hint" ' + (g.rows.length ? 'hidden' : '') + '>No entries</p></div></section>').join('') + '</div>';
    container.querySelectorAll('[data-pane-entry]').forEach(b => b.onclick = () => onSelect(b.dataset.paneEntry));
    container.querySelectorAll('[data-pane-add]').forEach(b => b.onclick = () => onAdd(b.dataset.paneAdd));
    container.querySelectorAll('[data-pane-filter]').forEach(input => input.oninput = () => {
      const list = container.querySelector('[data-pane-list="' + input.dataset.paneFilter + '"]'), query = input.value.trim().toLowerCase(); let visible = 0;
      list.querySelectorAll('[data-pane-entry]').forEach(b => { b.hidden = !b.dataset.search.includes(query); if (!b.hidden) visible++; });
      const empty = list.querySelector('.pane-no-match'); empty.hidden = Boolean(visible); empty.textContent = query ? 'No matches' : 'No entries';
    });
  }
  return { render };
})();
