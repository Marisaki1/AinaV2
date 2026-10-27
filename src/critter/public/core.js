(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Critter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  const skills = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'];
  const sections = ['additionalAbilities', 'actions', 'reactions', 'legendaryActions'];
  function validateCreature(value) {
    if (!object(value) || typeof value.name !== 'string' || !value.name.trim() || !object(value.stats)) {
      throw new Error('Expected a CritterDB creature with a name and a stats object.');
    }
    for (const key of sections) {
      if (value.stats[key] !== undefined && (!Array.isArray(value.stats[key]) || value.stats[key].some(a => !object(a) || typeof a.name !== 'string' || typeof a.description !== 'string'))) {
        throw new Error(`${value.name}: stats.${key} must be an array of named descriptions.`);
      }
    }
    for (const key of ['skills', 'savingThrows']) {
      if (value.stats[key] !== undefined && (!Array.isArray(value.stats[key]) || value.stats[key].some(item => !object(item) || typeof item[key === 'skills' ? 'name' : 'ability'] !== 'string' || (item.value != null && !Number.isFinite(item.value)) || (item.proficient != null && typeof item.proficient !== 'boolean')))) throw new Error(`${value.name}: stats.${key} must contain named proficiency/custom-total entries.`);
    }
    for (const key of ['damageVulnerabilities', 'damageResistances', 'damageImmunities', 'conditionImmunities', 'senses', 'languages']) {
      if (value.stats[key] !== undefined && (!Array.isArray(value.stats[key]) || value.stats[key].some(v => typeof v !== 'string'))) throw new Error(`${value.name}: stats.${key} must be an array of text entries.`);
    }
    for (const key of ['armorClass', 'numHitDie', 'hitDieSize', 'proficiencyBonus', 'challengeRating', 'experiencePoints', 'legendaryActionsPerRound']) {
      if (value.stats[key] != null && !Number.isFinite(value.stats[key])) throw new Error(`${value.name}: stats.${key} must be numeric.`);
    }
    if (value.stats.abilityScores != null && !object(value.stats.abilityScores)) throw new Error('stats.abilityScores must be an object.');
    for (const a of abilities) if (value.stats.abilityScores?.[a] != null && !Number.isFinite(value.stats.abilityScores[a])) throw new Error(`${a} must be numeric.`);
    if (value.flavor != null && !object(value.flavor)) throw new Error('flavor must be an object.');
    return value;
  }
  function importData(value) {
    if (object(value) && Array.isArray(value.creatures)) {
      value.creatures.forEach(validateCreature);
      return { kind: 'bestiary', data: clone(value) };
    }
    validateCreature(value);
    return { kind: 'creature', data: clone(value) };
  }
  function parseJSON(text) {
    try { return JSON.parse(text); } catch (e) { throw new Error(`Invalid JSON: ${e.message}`); }
  }
  function list(document) { return document.data.creatures || [document.data]; }
  function creatures(workspace) {
    return workspace.documents.flatMap(d => list(d).map((data, index) => ({ key: d.keys[index], documentId: d.id, label: d.label, index, data })));
  }
  function blankCreature(name = 'New creature') {
    return { name, flavor: { description: '', imageUrl: '', nameIsProper: false }, stats: {
      size: 'Medium', race: '', alignment: '', armorClass: 10, armorType: '', speed: '',
      numHitDie: 1, hitDieSize: 8, proficiencyBonus: 0,
      abilityScores: Object.fromEntries(abilities.map(a => [a, 10])),
      skills: [], savingThrows: [], damageVulnerabilities: [], damageResistances: [], damageImmunities: [],
      conditionImmunities: [], senses: [], languages: [], challengeRating: 0, experiencePoints: 0,
      additionalAbilities: [], actions: [], reactions: [], legendaryActions: [],
      legendaryActionsPerRound: 0, legendaryActionsDescription: '',
    } };
  }
  function duplicateCreature(value) {
    const copy = clone(value);
    copy.name += ' (copy)';
    // New records must not overwrite existing CritterDB records on import.
    for (const key of ['_id', 'id', 'bestiaryId', 'publishedBestiaryId', '__v']) delete copy[key];
    return copy;
  }
  function splitDescription(description) {
    const blocks = [];
    const readable = String(description || '').replace(/<avrae\s+hidden>([\s\S]*?)<\/avrae>/gi, (raw, source) => {
      blocks.push({ raw, source }); return '';
    });
    return { readable, blocks };
  }
  function replaceReadable(original, readable) {
    // Keep every original automation block byte-for-byte; only the visible portion changes.
    const { blocks, readable: oldReadable } = splitDescription(original);
    const comments = [...oldReadable.matchAll(/<!--[^]*?-->/g)].map(m=>m[0]).filter(comment=>!readable.includes(comment));
    return (comments.length?comments.join('\n')+'\n':'') + readable + (blocks.length ? '\n\n' + blocks.map(b => b.raw).join('\n\n') : '');
  }
  function averageHP(creature) {
    const s = creature.stats;
    if (!Number.isFinite(s.numHitDie) || !Number.isFinite(s.hitDieSize) || !Number.isFinite(s.abilityScores?.constitution)) return null;
    return Math.floor(s.numHitDie * (s.hitDieSize + 1) / 2) + s.numHitDie * Math.floor((s.abilityScores.constitution - 10) / 2);
  }
  function blankWorkspace() {
    return { format: 'aina-critter-workspace', version: 1, documents: [], encounters: [],
      currentEncounter: { name: 'Untitled encounter', entries: [] }, controllers: [],
      preferences: { prefix: '!', channelId: '' }, sender: { buttons: [], channelId: '', labels: {} }, combatTraits: {}, creatureCalculations: {}, history: [], favorites: [], queue: [] };
  }
  function validateWorkspace(value) {
    if (!object(value) || value.format !== 'aina-critter-workspace' || value.version !== 1) throw new Error('This is not an Aina workspace backup (version 1).');
    const clean = blankWorkspace();
    if (value.combatTraits !== undefined && !object(value.combatTraits)) throw new Error('Invalid combat traits backup.');
    for (const key of Object.keys(clean)) if (value[key] !== undefined) clean[key] = clone(value[key]);
    for (const key of ['documents', 'encounters', 'controllers', 'history', 'favorites', 'queue']) if (!Array.isArray(clean[key])) throw new Error(`${key} must be an array.`);
    const docIds = new Set(), creatureKeys = new Set();
    if (!object(clean.creatureCalculations)) throw new Error('Invalid creature calculation backup.');
    const math = typeof module === 'object' && module.exports ? require('./creature-math') : globalThis.CreatureMath;
    for (const config of Object.values(clean.creatureCalculations)) math.validate(config);
    for (const d of clean.documents) {
      importData(d.data);
      if (typeof d.id !== 'string' || docIds.has(d.id) || typeof d.label !== 'string' || !Array.isArray(d.keys) || d.keys.length !== list(d).length) throw new Error('Invalid document identity in backup.');
      docIds.add(d.id);
      for (const key of d.keys) {
        if (typeof key !== 'string' || creatureKeys.has(key)) throw new Error('Duplicate creature identity in backup.');
        creatureKeys.add(key);
      }
    }
    if (!object(clean.currentEncounter) || !Array.isArray(clean.currentEncounter.entries) || !object(clean.preferences)) throw new Error('Invalid encounter or preferences in backup.');
    for (const e of clean.encounters) if (!object(e) || typeof e.name !== 'string' || !Array.isArray(e.entries)) throw new Error('Invalid encounter preset.');
    for (const c of clean.controllers) if (!object(c) || typeof c.name !== 'string' || typeof c.value !== 'string') throw new Error('Invalid controller preset.');
    prefix(clean.preferences.prefix);
    if (typeof clean.preferences.channelId !== 'string') throw new Error('Invalid destination channel preference.');
    if (!object(clean.sender) || !Array.isArray(clean.sender.buttons) || clean.sender.buttons.length > 50 || typeof clean.sender.channelId !== 'string') throw new Error('Invalid Discord sender configuration.');
    const senderIds = new Set();
    const destinationLabels = clean.sender.labels || {};
    if (!object(destinationLabels) || Object.keys(destinationLabels).length > 100 || Object.entries(destinationLabels).some(([id, label]) => !/^\d{17,20}$/.test(id) || typeof label !== 'string' || !label.trim() || label.length > 80 || /[\r\n\x00-\x1f]/.test(label))) throw new Error('Invalid destination labels.');
    clean.sender = { channelId: clean.sender.channelId, labels: destinationLabels, buttons: clean.sender.buttons.map(b => {
      if (!object(b) || typeof b.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(b.id) || senderIds.has(b.id) || typeof b.label !== 'string' || !b.label.trim() || b.label.length > 80 || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 2000 || /[\r\n\x00-\x1f]/.test(b.label + b.text)) throw new Error('Invalid saved Discord command button.');
      senderIds.add(b.id); return { id: b.id, label: b.label, text: b.text };
    }) };
    for (const encounter of [clean.currentEncounter, ...clean.encounters]) {
      if (typeof encounter.name !== 'string') throw new Error('Encounter name must be text.');
      for (const entry of encounter.entries) if (!object(entry) || typeof entry.name !== 'string' || typeof entry.sourceName !== 'string') throw new Error('Invalid encounter combatant.');
      validateEncounter(encounter.entries);
    }
    for (const item of [...clean.history, ...clean.favorites, ...clean.queue]) {
      if (!object(item) || !Array.isArray(item.commands) || item.commands.some(c => typeof c !== 'string') || typeof item.createdAt !== 'string') throw new Error('Invalid command history, favorite, or queue entry.');
      if (item.spec?.draft && (!object(item.spec.draft) || !modeInfo[item.spec.draft.mode] || (item.spec.draft.targets != null && (!Array.isArray(item.spec.draft.targets) || item.spec.draft.targets.some(t => typeof t !== 'string'))))) throw new Error('Invalid reusable command settings.');
    }
    return clean;
  }
  function text(value, label = 'Value') {
    const str = String(value ?? '').trim();
    if (!str || /[\r\n\x00-\x1f\x7f]/.test(str) || str.includes('```')) throw new Error(`${label} is empty or contains unsupported control characters.`);
    return str;
  }
  function quote(value, label) {
    return '"' + text(value, label).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  const present = value => value !== '' && value !== undefined && value !== null;
  function integer(value, label, min = -100000, max = 100000) {
    if (!/^[+-]?\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(`${label} must be an integer between ${min} and ${max}.`);
    return String(Number(value));
  }
  function prefix(value = '!') {
    if (!/^[^\s"'`\\]{1,8}$/.test(value)) throw new Error('Use a command prefix of 1–8 characters without spaces or quotes.');
    return value;
  }
  function quantity(value = '1') {
    const str = String(value).trim();
    if (/^\d+$/.test(str)) { integer(str, 'Quantity', 1, 100); return String(Number(str)); }
    if (!/^\d{0,2}d\d{1,3}(?:[+-]\d{1,3})?$/i.test(str) || /d0(?:\D|$)/i.test(str)) throw new Error('Quantity must be 1–100 or a dice expression such as 1d4 or 2d6+1.');
    return str;
  }
  function validateEncounter(entries) {
    const names = new Set(), patterns = new Set();
    for (const e of entries) {
      const name = text(e.name, 'Encounter name').toLowerCase();
      const qty = quantity(e.quantity || '1');
      if (qty !== '1' && !name.includes('#')) throw new Error(`Use # in the name for multiple copies of ${e.name}, e.g. ${e.name}#.`);
      if (patterns.has(name)) throw new Error(`Duplicate encounter name: ${e.name}`);
      patterns.add(name);
      const expanded = /^\d+$/.test(qty) ? Array.from({ length: Number(qty) }, (_, i) => name.replace(/#/g, String(i + 1))) : [name];
      for (const n of expanded) { if (names.has(n)) throw new Error(`Conflicting encounter name: ${n}`); names.add(n); }
    }
    for (const pattern of patterns) if (pattern.includes('#')) {
      const escaped = pattern.split('#').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\d+');
      const re = new RegExp('^' + escaped + '$');
      for (const other of patterns) if (other !== pattern && re.test(other)) throw new Error(`Numbered name ${pattern} overlaps ${other}.`);
    }
    return entries;
  }
  function encounterCommand(entry, commandPrefix = '!') {
    if (entry.initiativeRoll && !['normal', 'adv', 'dis'].includes(entry.initiativeRoll)) throw new Error('Invalid initiative roll mode.');
    if (entry.kind === 'player') throw new Error('Players join Avrae with their own character; no monster-add command is generated.');
    const p = prefix(commandPrefix), q = quantity(entry.quantity || '1');
    if (present(entry.fixedInitiative) && present(entry.initiativeBonus)) throw new Error('Choose fixed initiative OR an initiative bonus.');
    const out = [`${p}i madd`, quote(entry.sourceName, 'Source creature'), '-name', quote(entry.name, 'Encounter name')];
    if (q !== '1') out.push('-n', q);
    if (entry.controller) {
      const controller = String(entry.controller).trim();
      if (/^@[^<]/.test(controller)) throw new Error('Controller @handles are placeholders. Select a real Discord member or enter their numeric ID / <@ID> mention.');
      out.push('-controller', quote(/^\d{15,22}$/.test(controller) ? `<@${controller}>` : controller));
    }
    for (const [key, flag] of [['fixedInitiative', '-p'], ['initiativeBonus', '-b'], ['ac', '-ac'], ['hp', '-hp'], ['thp', '-thp']]) if (present(entry[key])) out.push(flag, integer(entry[key], key));
    if (!present(entry.fixedInitiative) && ['adv', 'dis'].includes(entry.initiativeRoll)) out.push(entry.initiativeRoll);
    if (entry.group) out.push('-group', quote(entry.group));
    if (entry.notes) out.push('-note', quote(entry.notes));
    return out.join(' ');
  }
  const modeInfo = {
    ma: ['ma', 'Bestiary creature; uses the source stat block, not a unique live combatant.'],
    action: ['i a', 'The combatant whose turn it currently is in Avrae.'],
    aoo: ['i aoo', 'A named encounter combatant acting off turn.'],
    cast: ['i cast', 'The combatant whose turn it currently is in Avrae.'],
    rc: ['i rc', 'A named encounter combatant casting off turn.'],
    moncast: ['moncast', 'A bestiary creature casting from its source stat block.'],
    pcCast: ['cast', 'Your active Avrae player character.'],
    begin: ['init begin', 'Starts an Avrae encounter in this channel.'],
    dm: ['i add', 'Adds a generic DungeonMaster combatant.'],
    list: ['i list', 'Lists the Avrae encounter.'], status: ['i status', 'Shows a named encounter combatant.'],
    next: ['i next', 'Advances the turn in Avrae.'], end: ['init end', 'Ends the Avrae encounter.'],
    remove: ['i remove', 'Removes a named encounter combatant.'], opt: ['i opt', 'Changes a named encounter combatant.'],
    hp: ['i hp', 'Queries or adjusts a named combatant’s HP.'], hpSet: ['i hp set', 'Sets a named combatant’s current HP.'],
    thp: ['i thp', 'Sets temporary HP (negative values remove THP).'], save: ['i os', 'A named encounter combatant rolls a saving throw.'],
  };
  function tokenize(value) {
    const tokens = []; let token = '', quoted = false, escaped = false, started = false;
    for (const ch of value) {
      if (escaped) { token += ch; escaped = false; started = true; }
      else if (ch === '\\') escaped = true;
      else if (ch === '"') { quoted = !quoted; started = true; }
      else if (/\s/.test(ch) && !quoted) { if (started) tokens.push(token); token = ''; started = false; }
      else { token += ch; started = true; }
    }
    if (escaped || quoted) throw new Error('Unclosed quote or trailing escape in advanced arguments.');
    if (started) tokens.push(token);
    return tokens;
  }
  function command(input, commandPrefix = '!') {
    if (!modeInfo[input.mode]) throw new Error('Choose a command mode.');
    const out = [prefix(commandPrefix) + modeInfo[input.mode][0]];
    const actionMode = ['ma', 'action', 'aoo', 'cast', 'rc', 'moncast', 'pcCast'].includes(input.mode);
    if (['ma', 'moncast'].includes(input.mode)) out.push(quote(input.sourceName, 'Source creature'));
    if (['aoo', 'rc'].includes(input.mode)) out.push(quote(input.actor, 'Encounter actor'));
    if (actionMode) {
      out.push(quote(input.action, 'Action / spell'));
      for (const target of input.targets || []) {
        if (/^-/.test(target)) throw new Error('Target names cannot start with a flag (-).');
        out.push('-t', quote(target, 'Target'));
      }
      if (input.roll && !['normal', 'adv', 'dis'].includes(input.roll)) throw new Error('Choose normal, advantage, or disadvantage.');
      if (input.normalOverride) out.push('adv', 'dis');
      else if (input.roll && input.roll !== 'normal') out.push(input.roll);
      if (input.critical && !['normal', 'crit', 'nocrit'].includes(input.critical)) throw new Error('Choose normal, crit, or no crit.');
      if (input.critical && input.critical !== 'normal') out.push(input.critical);
      if (present(input.criton)) out.push('-criton', integer(input.criton, 'Critical minimum', 1, 20));
      for (const [key, flag] of [['attackBonus', '-b'], ['damageBonus', '-d']]) if (present(input[key])) out.push(flag, quote(input[key]));
      if (present(input.repeat)) out.push('-rr', integer(input.repeat, 'Repetition count', 1, 100));
      if (present(input.level)) {
        if (!['cast', 'rc', 'moncast', 'pcCast'].includes(input.mode)) throw new Error('Spell level applies only to casting modes.');
        out.push('-l', integer(input.level, 'Spell level', 0, 9));
      }
    } else if (input.mode === 'dm') out.push('100', quote(input.actor || 'DungeonMaster'));
    else if (!['begin', 'list', 'next', 'end'].includes(input.mode)) {
      out.push(quote(input.actor, 'Encounter combatant'));
      if (input.mode === 'save') {
        if (!['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(input.save)) throw new Error('Choose a saving throw ability.');
        out.push(input.save);
      } else if (['hp', 'hpSet', 'thp'].includes(input.mode)) {
        if (present(input.value)) {
          const n = integer(input.value, 'HP value');
          out.push(input.mode === 'hp' && Number(n) >= 0 ? '+' + n : n);
        } else if (input.mode !== 'hp') throw new Error('Enter an HP value.');
      } else if (input.mode === 'opt') {
        if (!present(input.fixedInitiative) && !present(input.ac)) throw new Error('Enter a fixed initiative value or AC override.');
        if (present(input.fixedInitiative)) out.push('-p', integer(input.fixedInitiative, 'Fixed initiative', 0));
        if (present(input.ac)) out.push('-ac', integer(input.ac, 'AC', 0));
      }
    }
    if (input.advanced?.trim()) {
      const extra = text(input.advanced, 'Advanced arguments');
      const args = tokenize(extra);
      // Keep the graphical controls authoritative, so contradictory rolls/targets cannot sneak in.
      const reserved = /^(?:(?:adv|dis|eadv)(?:\d+)?|-+(?:t|b|d|rr|l|p|ac|criton)(?:\d+)?)$/i;
      if (args.some(a => reserved.test(a))) throw new Error('Set targets, roll mode, bonuses, repetition, level, initiative and AC using the controls, not advanced arguments.');
      if (input.critical !== undefined && args.some(a => /^(?:crit|nocrit)(?:\d+)?$/i.test(a))) throw new Error('Set crit or no crit using the controls, not advanced arguments.');
      out.push(extra);
    }
    return out.join(' ');
  }
  return { clone, object, abilities, skills, sections, parseJSON, importData, validateCreature, list, creatures,
    blankCreature, duplicateCreature, splitDescription, replaceReadable, averageHP, blankWorkspace,
    validateWorkspace, quote, quantity, prefix, validateEncounter, encounterCommand, command, modeInfo, tokenize };
});
