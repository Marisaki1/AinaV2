window.LanguageUI = (() => {
  let tab = 'decode', activeId = '', draft = '', decoding = true, output = '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const modes = { syllables: 'Syllables', symbols: 'Symbols', phrases: 'Phrasebook' };

  async function render(root) {
    if (!root) return;
    root.innerHTML = '<p class="hint" role="status">Loading languages…</p>';
    let settings;
    try {
      settings = await api('languages');
    } catch (error) {
      root.firstElementChild.textContent = error.message;
      return;
    }
    if (!root.isConnected) return;
    const find = selector => root.querySelector(selector);
    const selected = () => settings.presets.find(preset => preset.id === activeId);
    const status = text => { if (find('.language-status')) find('.language-status').textContent = text; };
    const options = () => settings.presets.map(preset =>
      `<option value="${escape(preset.id)}" ${preset.id === activeId ? 'selected' : ''}>${escape(preset.name)}</option>`
    ).join('');
    let saving = false, request = 0;

    async function save(next, feedback) {
      if (saving) return;
      saving = true;
      try {
        settings = await api('languages', 'POST', next);
        paint();
        status(feedback);
        return true;
      } catch (error) {
        status(error.message);
        return false;
      } finally {
        saving = false;
      }
    }

    function paint() {
      request++;
      if (!selected()) activeId = settings.presets[0]?.id || '';
      root.innerHTML = `
        <section class="language-card" aria-label="Language Converter">
          <header class="language-heading">
            <h2>Language Converter</h2>
            <nav class="language-tabs" aria-label="Language tools">
              ${[['decode', 'Decoder'], ['presets', 'Languages'], ['names', 'Protected names'], ['log', 'Private log']].map(([id, title]) =>
                `<button type="button" data-language-tab="${id}" aria-pressed="${tab === id}">${title}</button>`
              ).join('')}
            </nav>
          </header>
          <div class="language-body"></div>
          <div class="language-status hint" role="status"></div>
        </section>`;
      root.querySelectorAll('[data-language-tab]').forEach(button => button.onclick = () => {
        tab = button.dataset.languageTab;
        paint();
      });
      if (tab === 'decode') paintDecoder();
      else if (tab === 'presets') paintPresets();
      else if (tab === 'names') paintNames();
      else void paintLog();
    }

    function changePreset(preset) {
      activeId = preset;
      output = '';
      paint();
    }

    function paintDecoder() {
      find('.language-body').innerHTML = `
        <form class="language-decode">
          <div class="language-toolbar">
            <label>Language<select id="language-decode-preset">${options()}</select></label>
            <div class="language-switch" aria-label="Conversion direction">
              <button type="button" data-language-direction="decode" aria-pressed="${decoding}">To English</button>
              <button type="button" data-language-direction="encode" aria-pressed="${!decoding}">From English</button>
            </div>
          </div>
          ${selected()?.mode === 'phrases' ? '<p class="hint">Uses exact phrasebook matches, one line at a time.</p>' : ''}
          ${activeId === 'demon-god-tongue' ? '<p class="hint">Romanized textbook examples. Open Languages to see the available entries.</p>' : ''}
          <div class="language-text-grid">
            <label>${decoding ? 'Converted dialogue' : 'English'}<textarea id="language-input" rows="4" maxlength="4000" spellcheck="false">${escape(draft)}</textarea></label>
            <label>${decoding ? 'English result' : 'Converted result'}<textarea id="language-output" rows="4" readonly spellcheck="false">${escape(output)}</textarea></label>
          </div>
          <div class="language-actions">
            <button class="primary" ${selected() ? '' : 'disabled'}>${decoding ? 'Decode' : 'Convert'}</button>
            <button type="button" id="language-copy" ${output ? '' : 'disabled'}>Copy result</button>
          </div>
        </form>`;
      find('#language-decode-preset').onchange = event => changePreset(event.target.value);
      root.querySelectorAll('[data-language-direction]').forEach(button => button.onclick = () => {
        const next = button.dataset.languageDirection === 'decode';
        if (next === decoding) return;
        decoding = next;
        if (output) draft = output;
        output = '';
        paint();
      });
      find('#language-input').oninput = event => {
        draft = event.target.value;
        output = '';
        request++;
        find('#language-output').value = '';
        find('#language-copy').disabled = true;
        status('');
      };
      find('.language-decode').onsubmit = async event => {
        event.preventDefault();
        const token = ++request;
        try {
          const result = await api('languages/convert', 'POST', { id: activeId, text: draft, decode: decoding });
          if (token !== request || !root.isConnected) return;
          output = result.text;
          find('#language-output').value = output;
          find('#language-copy').disabled = !output;
          status('');
        } catch (error) {
          if (token === request) status(error.message);
        }
      };
      find('#language-copy').onclick = async () => {
        try {
          await navigator.clipboard.writeText(output);
          status('Copied.');
        } catch {
          find('#language-output').select();
          status('Select and copy the result.');
        }
      };
    }

    function paintPresets() {
      find('.language-body').innerHTML = `
        <div class="language-toolbar">
          <label>Language<select id="language-preset">${options()}</select></label>
          <button type="button" id="language-new">New language</button>
        </div>
        <div id="language-editor"></div>`;
      find('#language-preset').onchange = event => changePreset(event.target.value);
      find('#language-new').onclick = () => editPreset();
      if (selected()) editPreset(selected());
    }

    function editPreset(original) {
      const preset = original || { id: crypto.randomUUID(), name: '', mode: 'syllables', units: [], words: [] };
      const editor = find('#language-editor');
      editor.innerHTML = `
        <form class="language-edit">
          <div class="language-text-grid">
            <label>Name<input id="language-name" maxlength="60" required value="${escape(preset.name)}"></label>
            <label>Conversion type<select id="language-mode">
              ${Object.entries(modes).map(([mode, title]) => `<option value="${mode}" ${preset.mode === mode ? 'selected' : ''}>${title}</option>`).join('')}
            </select></label>
          </div>
          <div id="language-rules"></div>
          <label>Glossary<textarea id="language-words" rows="4" maxlength="95000" spellcheck="false">${escape(preset.words.map(pair => pair.join(' = ')).join('\n'))}</textarea></label>
          <p class="hint" id="language-glossary-hint"></p>
          <div class="language-actions">
            <button class="primary">Save language</button>
            ${original ? '<button type="button" class="danger" id="language-delete">Delete language</button>' : '<button type="button" id="language-cancel">Cancel</button>'}
          </div>
        </form>`;
      const maps = new Map([[preset.mode, preset.units]]);
      let currentMode = preset.mode;
      const readUnits = () => [...editor.querySelectorAll('[data-letter]')].map(input => input.value.trim());
      function rules() {
        const mode = currentMode, units = maps.get(mode) || [];
        find('#language-rules').innerHTML = mode === 'phrases' ? '' : `
          <details class="language-letter-map" ${original && original.mode === mode ? '' : 'open'}>
            <summary>${mode === 'symbols' ? 'Symbol map' : 'Letter-to-syllable map'}</summary>
            <div class="language-letter-grid">${[...alphabet].map((letter, index) =>
              `<label>${letter}<input data-letter="${letter}" maxlength="${mode === 'symbols' ? 2 : 5}" value="${escape(units[index] || '')}"></label>`
            ).join('')}</div>
          </details>`;
        find('#language-glossary-hint').textContent = mode === 'phrases'
          ? 'One phrase per line. Example: Good morning = おはようございます'
          : preset.id === 'demon' && mode === 'syllables'
            ? 'One word or contraction per line. Format: English = converted.'
            : 'One word per line. Format: English = converted.';
      }
      find('#language-mode').onchange = event => {
        maps.set(currentMode, readUnits());
        currentMode = event.target.value;
        rules();
      };
      rules();
      find('.language-edit').onsubmit = async event => {
        event.preventDefault();
        const lines = find('#language-words').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const words = lines.map(line => {
          const at = line.indexOf('=');
          return at < 0 ? [] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
        });
        if (words.some(pair => pair.length !== 2)) {
          status('Enter English = converted on each glossary line.');
          return;
        }
        const value = { id: preset.id, name: find('#language-name').value.trim(), mode: currentMode, units: readUnits(), words };
        const next = original ? settings.presets.map(item => item.id === preset.id ? value : item) : [...settings.presets, value];
        const previous = activeId;
        activeId = value.id;
        if (!await save({ ...settings, presets: next }, 'Language saved.')) activeId = previous;
      };
      if (original) find('#language-delete').onclick = async () => {
        if (confirm(`Delete ${original.name}? NPCs using it will switch to Off.`)) {
          await save({ ...settings, presets: settings.presets.filter(preset => preset.id !== original.id) }, 'Language deleted.');
        }
      };
      else find('#language-cancel').onclick = paintPresets;
    }

    function paintNames() {
      find('.language-body').innerHTML = `
        <p class="hint">Keep these names unchanged when converting and decoding.</p>
        <div class="language-name-tools">
          <form id="language-name-form">
            <label>Protect a name<input id="language-protect-name" required maxlength="80" placeholder="e.g. Shuu"></label>
            <button class="primary">Add</button>
          </form>
          <label>Find a name<input id="language-name-filter" type="search"></label>
        </div>
        <div class="language-names"></div>`;
      const list = find('.language-names');
      function paintList() {
        const query = find('#language-name-filter').value.toLowerCase();
        list.innerHTML = settings.names.filter(name => name.toLowerCase().includes(query)).sort((a, b) =>
          a.localeCompare(b)).map(name => `<span class="language-name-chip">
            ${escape(name)}<button type="button" aria-label="Remove ${escape(name)}" data-remove-name="${escape(name)}">×</button>
          </span>`).join('') || '<span class="hint">No matching names.</span>';
        list.querySelectorAll('[data-remove-name]').forEach(button => button.onclick = () =>
          save({ ...settings, names: settings.names.filter(name => name !== button.dataset.removeName) }, 'Name removed.'));
      }
      find('#language-name-form').onsubmit = event => {
        event.preventDefault();
        const name = find('#language-protect-name').value.trim();
        if (name) void save({ ...settings, names: [...settings.names, name] }, 'Name protected.');
      };
      find('#language-name-filter').oninput = paintList;
      paintList();
    }

    async function paintLog() {
      const body = find('.language-body');
      body.textContent = 'Loading private log…';
      try {
        const posts = await api('languages/log');
        if (!body.isConnected) return;
        body.innerHTML = `
          <label>Find a converted post<input type="search" id="language-log-filter"></label>
          <div class="language-log"></div>`;
        function filter() {
          const query = find('#language-log-filter').value.toLowerCase();
          find('.language-log').innerHTML = posts.filter(post =>
            [post.name, post.languageName, post.text, post.convertedText].some(value => String(value).toLowerCase().includes(query))
          ).map(post => `<details><summary><strong>${escape(post.name)}</strong> · ${escape(post.languageName)} ·
            ${escape(new Date(post.createdAt).toLocaleString())} · ${escape(post.delivery)}</summary>
            <div class="language-text-grid">
              <div><strong>Original</strong><p>${escape(post.text)}</p></div>
              <div><strong>Posted text</strong><p>${escape(post.convertedText)}</p></div>
            </div></details>`).join('') || '<p class="hint">No matching converted posts.</p>';
        }
        find('#language-log-filter').oninput = filter;
        filter();
      } catch (error) {
        if (body.isConnected) body.textContent = error.message;
      }
    }
    paint();
  }
  return { render };
})();
