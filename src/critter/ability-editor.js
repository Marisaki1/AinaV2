const YAML = require('yaml');
const C = require('./public/core');
const A = require('./public/authoring-model');
const T = require('./public/combat-traits');
function textFields(source) {
  let text = '', tag = false; const offsets = [], fields = [];
  for (let i = 0; i < source.length; i++) { if (source[i] === '<') tag = true; else if (source[i] === '>') tag = false; else if (!tag) { text += source[i]; offsets.push(i); } }
  const add = (match, group, label, textType = '') => {
    const range = match.indices[group]; if (!range) return;
    fields.push({ id: 'text:' + label, kind: 'text', textType, label, range: [offsets[range[0]], offsets[range[1] - 1] + 1], value: textType === 'saveAbility' ? match[group].slice(0, 3).toLowerCase() : match[group] });
  };
  const hit = text.match(/(?:Melee|Ranged)(?: Weapon| Spell)? Attack(?: Roll)?:\s*([+-]\d+)/id) || text.match(/([+-]\d+)\s+to hit/id); if (hit) add(hit, 1, 'To-hit bonus');
  let number = 0;
  for (const match of text.matchAll(/(\d+)\s*\(([^()]*\d*d\d+[^()]*)\)\s*(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\s+damage/gid)) {
    number++; add(match, 1, `Damage ${number} average`); add(match, 2, `Damage ${number} dice`); add(match, 3, `Damage ${number} type`);
    fields.at(-2).averageId = 'text:Damage ' + number + ' average';
  }
  const long = '(strength|dexterity|constitution|intelligence|wisdom|charisma)';
  const modern = text.match(new RegExp(long + '\\s+Saving Throw:\\s*DC\\s*(\\d+)', 'id'));
  const classic = text.match(new RegExp('DC\\s*(\\d+)\\s+' + long + '\\s+saving throw', 'id'));
  if (modern) { add(modern, 1, 'Target saving throw ability', 'saveAbility'); add(modern, 2, 'Target save DC'); }
  else if (classic) { add(classic, 2, 'Target saving throw ability', 'saveAbility'); add(classic, 1, 'Target save DC'); }
  else { const spell = text.match(/spell save DC\s*(\d+)/id); if (spell) add(spell, 1, 'Target save DC'); }
  return fields;
}
function fieldsFor(description) {
  const blocks = C.splitDescription(description).blocks, fields = [];
  if (!blocks.length) return textFields(description);
  blocks.forEach((block, blockIndex) => {
    if (/^([^\n]*?)\|([+-]?\d*)\|([^\n]*)$/s.test(block.source)) {
      const parts = block.source.split('|');
      ['Executable name', 'To-hit bonus', 'Damage expression'].forEach((label, i) => fields.push({ id: `${blockIndex}:short:${i}`, block: blockIndex, part: i, kind: 'short', label, value: parts[i] })); return;
    }
    const doc = YAML.parseDocument(block.source, { keepSourceTokens: true, uniqueKeys: true });
    if (doc.errors.length) return;
    const visit = (node, path = [], context = '') => {
      if (YAML.isMap(node)) {
        const type = node.get('type'), name = node.get('name');
        const add = (key, label, splitDamage = false) => {
          const scalar = node.get(key, true); if (!YAML.isScalar(scalar) || !scalar.range) return;
          const value = String(scalar.value ?? ''), id = blockIndex + ':' + JSON.stringify([...path, key]);
          const typed = splitDamage && value.match(/^(.+)\[([^\[\]]+)\]$/);
          const common = { block: blockIndex, path: [...path, key], range: scalar.range.slice(0, 2), originalType: typeof scalar.value };
          const components = splitDamage ? [...value.matchAll(/([^\[\]]+)\[([^\[\]]+)\]/g)] : [];
          if (components.length > 1) {
            components.forEach((m, i) => {
              const prefix = i ? m[1].match(/^\s*\+\s*/)?.[0].length || 0 : 0;
              const start = m.index + prefix, diceEnd = m.index + m[1].length;
              fields.push({ ...common, id: id + ':component:' + i + ':dice', kind: 'component', label: label + ' · component ' + (i + 1) + ' dice', value: m[1].slice(prefix), original: value, segment: [start, diceEnd] });
              fields.push({ ...common, id: id + ':component:' + i + ':type', kind: 'component', damageType: true, label: label + ' · component ' + (i + 1) + ' type', value: m[2], original: value, segment: [diceEnd + 1, diceEnd + 1 + m[2].length] });
            });
            return;
          }
          if (typed) {
            fields.push({ ...common, id: id + ':dice', kind: 'dice', label: label + ' — dice', value: typed[1], original: value });
            fields.push({ ...common, id: id + ':type', kind: 'damageType', label: label + ' — type', value: typed[2], original: value });
          } else fields.push({ ...common, id, kind: 'scalar', label, value });
        };
        if (type === 'attack') add('attackBonus', 'To-hit bonus');
        if (type === 'attack') add('adv', 'Default attack advantage (1) / disadvantage (-1) / normal (0)');
        if (type === 'save') { add('stat', 'Target saving throw ability'); add('dc', 'Target save DC'); }
        if (type === 'damage') add('damage', context ? context + ' — damage' : 'Damage', true);
        if (type === 'roll') add('dice', 'Shared roll' + (name ? ': ' + name : ''), true);
        if (type === 'ieffect2') {
          for (const [key, label] of [['name', 'Effect name'], ['duration', 'Effect duration in rounds'], ['desc', 'Effect rules reminder'], ['conc', 'Effect concentration'], ['end', 'Effect ticks at turn end']]) add(key, label);
          const passive = node.get('effects', true);
          if (YAML.isMap(passive)) {
            for (const pair of passive.items) {
              const key = pair.key.value, value = pair.value;
              const choices = ['resistances', 'immunities', 'vulnerabilities'].includes(key) ? A.damageTypes : ['save_adv', 'save_dis'].includes(key) ? C.abilities : ['check_adv', 'check_dis'].includes(key) ? T.skills : null;
              if (choices && YAML.isSeq(value) && value.range && value.items.every(YAML.isScalar)) fields.push({ id: blockIndex + ':' + JSON.stringify([...path, 'effects', key]), block: blockIndex, path: [...path, 'effects', key], range: value.range.slice(0, 2), kind: 'list', label: 'Effect ' + key, value: JSON.stringify(value.toJSON()), choices });
            }
          }
        }
        // Passive scalar bonuses stay editable without rewriting adjacent automation.
        for (const key of ['attack_advantage', 'to_hit_bonus', 'damage_bonus', 'ac_bonus', 'max_hp_bonus', 'save_bonus', 'check_bonus', 'dc_bonus']) if (path.at(-1) === 'effects') add(key, 'Effect ' + key);
        if (node.has('automation') && typeof name === 'string') { add('name', 'Executable name'); add('criton', 'Critical minimum'); }
        for (const pair of node.items) visit(pair.value, [...path, pair.key.value], ['fail', 'success', 'hit', 'miss'].includes(String(pair.key.value)) ? String(pair.key.value) : context);
      } else if (YAML.isSeq(node)) node.items.forEach((item, i) => visit(item, [...path, i], context));
    };
    visit(doc.contents);
  });
  return fields;
}
function editAbility(creature, edits) {
  const candidate = C.clone(creature);
  for (const edit of edits || []) {
    if (!C.sections.includes(edit.section) || !Number.isInteger(edit.index)) throw new Error('Invalid ability selection.');
    const ability = candidate.stats[edit.section]?.[edit.index]; if (!ability) throw new Error('This ability no longer exists.');
    const original = ability.description, parts = C.splitDescription(original), known = fieldsFor(original), patches = edit.fields || [];
    if (!parts.blocks.length && edit.readable !== undefined) ability.description = edit.readable;
    const textChanges = [];
    const changedBlocks = new Map(), replacements = new Map();
    for (const patch of patches) {
      const field = known.find(f => f.id === patch.id); if (!field) throw new Error('Automation field changed. Reload the ability editor.');
      if (typeof patch.value !== 'string' || (field.label === 'Effect rules reminder' ? /[\x00]/ : /[\r\n\x00]/).test(patch.value) || patch.value.length > 2000) throw new Error('Automation fields must be single-line values.');
      if (patch.value === field.value) continue;
      if (field.label === 'Critical minimum' && (!/^\d+$/.test(patch.value) || Number(patch.value) < 1 || Number(patch.value) > 20)) throw new Error('Critical minimum must be from 1 to 20.');
      if (field.label === 'Target saving throw ability' && !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(patch.value)) throw new Error('Use str, dex, con, int, wis, or cha for a target save.');
      if (field.kind === 'text') {
        const current = textFields(ability.description).find(f => f.id === field.id); if (!current) throw new Error('The rules text no longer contains this field. Save the rules separately, then edit its numbers.');
        let value = patch.value;
        if (field.textType === 'saveAbility') { const full = C.abilities.find(a => a.startsWith(value)); value = full[0].toUpperCase() + full.slice(1); }
        if (field.label === 'To-hit bonus') { if (!/^[+-]?\d+$/.test(value)) throw new Error('Enter a numeric to-hit bonus.'); value = Number(value) >= 0 ? '+' + Number(value) : String(Number(value)); }
        if (/average$|Target save DC/.test(field.label) && !/^\d+$/.test(value)) throw new Error('Damage averages and save DCs must be non-negative integers.');
        if (/[<>]/.test(value) || !value.trim()) throw new Error('Enter a nonempty rules value.');
        textChanges.push({ range: current.range, value }); continue;
      }
      const block = parts.blocks[field.block];
      if (field.kind === 'list') {
        let values; try { values = JSON.parse(patch.value); } catch { throw new Error('Select valid effect values.'); }
        const allowed = [...field.choices, ...JSON.parse(field.value)];
        if (!Array.isArray(values) || values.some(v => typeof v !== 'string' || !allowed.includes(v))) throw new Error('Select supported effect values.');
        replacements.set(field.block + ':' + field.range[0], { field, value: [...new Set(values)] }); continue;
      }
      if (field.kind === 'short') {
        const values = changedBlocks.get(field.block) || block.source.split('|'); values[field.part] = patch.value; changedBlocks.set(field.block, values); continue;
      }
      const key = field.block + ':' + field.range[0], grouped = replacements.get(key) || { field, value: field.original || field.value };
      if (field.kind === 'component') {
        if (!patch.value.trim() || (field.damageType && /[\[\]]/.test(patch.value))) throw new Error('Choose valid component dice and type.');
        grouped.segments ||= new Map(); grouped.segments.set(field.segment[0], { range: field.segment, value: patch.value });
      } else if (field.kind === 'dice' || field.kind === 'damageType') {
        const match = grouped.value.match(/^(.+)\[([^\[\]]+)\]$/); if (!match) throw new Error('Damage expression changed. Reload the editor.');
        if (!patch.value.trim() || (field.kind === 'damageType' && /[\[\]]/.test(patch.value))) throw new Error('Enter a valid damage dice expression and type.');
        grouped.value = field.kind === 'dice' ? patch.value + '[' + match[2] + ']' : match[1] + '[' + patch.value + ']';
      } else grouped.value = patch.value;
      replacements.set(key, grouped);
    }
    const editedSources = parts.blocks.map(block => block.source);
    for (let i = 0; i < parts.blocks.length; i++) {
      let source = parts.blocks[i].source;
      if (changedBlocks.has(i)) source = changedBlocks.get(i).join('|');
      const changes = [...replacements.values()].filter(v => v.field.block === i).sort((a, b) => b.field.range[0] - a.field.range[0]);
      for (const change of changes) {
        const { field } = change; let value = change.value;
        if (change.segments) for (const segment of [...change.segments.values()].sort((a, b) => b.range[0] - a.range[0])) value = value.slice(0, segment.range[0]) + segment.value + value.slice(segment.range[1]);
        if (field.originalType === 'boolean' && !['true', 'false'].includes(value)) throw new Error('Use true or false for effect switches.');
        const scalar = field.originalType === 'boolean' ? value === 'true' : field.originalType === 'number' && /^[+-]?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
        let replacement = typeof scalar === 'string' && /[\r\n]/.test(scalar) ? JSON.stringify(scalar) : YAML.stringify(scalar, { lineWidth: 0, ...(field.kind === 'list' ? { collectionStyle: 'flow' } : {}) }).trimEnd();
        if (field.kind === 'list' && source.slice(...field.range).endsWith('\n')) replacement += '\n';
        source = source.slice(0, field.range[0]) + replacement + source.slice(field.range[1]);
      }
      if (source !== parts.blocks[i].source) {
        const doc = YAML.parseDocument(source); if (doc.errors.length && !changedBlocks.has(i)) throw new Error('The changes produced invalid automation YAML.');
        editedSources[i] = source;
      }
    }
    for (const change of textChanges.sort((a, b) => b.range[0] - a.range[0])) ability.description = ability.description.slice(0, change.range[0]) + change.value + ability.description.slice(change.range[1]);
    if (edit.rawBlocks !== undefined) {
      if (!Array.isArray(edit.rawBlocks) || edit.rawBlocks.length !== parts.blocks.length) throw new Error('Keep the existing number of automation blocks.');
      edit.rawBlocks.forEach((value, i) => { if (typeof value !== 'string') throw new Error('Invalid automation source.'); if (value !== parts.blocks[i].source) { const doc = YAML.parseDocument(value); if (doc.errors.length) throw new Error('Invalid automation YAML.'); editedSources[i] = value; } });
    }
    if (parts.blocks.length) { let block = 0; ability.description = original.replace(/(<avrae\s+hidden>)([\s\S]*?)(<\/avrae>)/gi, (_, open, source, close) => open + editedSources[block++] + close); }
    if (edit.name !== undefined) { if (typeof edit.name !== 'string' || !edit.name.trim()) throw new Error('Give the ability a name.'); ability.name = edit.name; }
    if (parts.blocks.length && edit.readable !== undefined && edit.readable !== parts.readable) ability.description = C.replaceReadable(ability.description, edit.readable);
  }
  return C.validateCreature(candidate);
}
module.exports = { fieldsFor, editAbility };
