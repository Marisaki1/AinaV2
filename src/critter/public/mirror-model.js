(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core') : root.Critter, typeof module === 'object' && module.exports ? require('./combat-traits') : root.CombatTraits);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MirrorModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, T) {
  'use strict';
  const object = C.object, snowflake = v => typeof v === 'string' && /^\d{15,22}$/.test(v);
  function text(v, name, max = 200) { if (typeof v !== 'string' || !v.trim() || v.length > max || /[\x00-\x1f]/.test(v)) throw new Error('Invalid ' + name + '.'); return v; }
  function number(v, name, nullable = true) { if (v === null && nullable) return null; if (!Number.isSafeInteger(v)) throw new Error('Invalid ' + name + '.'); return v; }
  function field(v, kind, hidden = false) {
    if (hidden) return { status: 'hidden', value: null };
    if (!object(v) || !['known', 'hidden', 'unavailable'].includes(v.status)) return { status: 'unavailable', value: null };
    if (v.status !== 'known') return { status: v.status, value: null };
    let value = v.value;
    if (kind === 'number') number(value, 'numeric field', false);
    if (kind === 'text') text(value, 'text field');
    if (kind === 'list') { if (!Array.isArray(value) || value.length > 200) throw new Error('Invalid list field.'); value = value.map(s => text(s, 'list entry')); }
    if (kind === 'effects') {
      if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid effects.');
      value = value.map(e => ({ name: text(e.name, 'effect name'), duration: number(e.duration ?? null, 'effect duration'), remaining: number(e.remaining ?? null, 'effect remaining'), concentration: e.concentration === true, ticksOnEnd: e.ticksOnEnd === true }));
    }
    return { status: 'known', value };
  }
  function validate(raw) {
    if (!object(raw) || raw.format !== 'aina-avrae-snapshot' || raw.version !== 1) throw new Error('Expected an Aina Avrae snapshot (version 1).');
    for (const k of ['guildId', 'channelId', 'exporterId', 'requestId']) if (!snowflake(raw[k])) throw new Error('Invalid snapshot ' + k + '.');
    if (!Number.isSafeInteger(raw.exportedAt) || raw.exportedAt < 1420070400000 || raw.exportedAt > Date.now() + 300000 || typeof raw.active !== 'boolean') throw new Error('Invalid snapshot timestamp or encounter state.');
    if (!Array.isArray(raw.combatants) || raw.combatants.length > 200 || !Array.isArray(raw.groups) || raw.groups.length > 100) throw new Error('Invalid encounter roster.');
    const ids = new Set();
    const combatants = raw.combatants.map(u => {
      const id = text(u.id, 'combatant ID', 128); if (ids.has(id)) throw new Error('Duplicate combatant ID.'); ids.add(id);
      if (typeof u.hidden !== 'boolean') throw new Error('Missing combatant privacy state.');
      const row = { id, name: text(u.name, 'combatant name'), controllerId: u.controllerId == null ? null : text(String(u.controllerId), 'controller ID', 30), initiative: number(u.initiative, 'initiative', false), groupId: u.groupId == null ? null : text(u.groupId, 'group ID', 128), hidden: u.hidden };
      for (const k of ['hp', 'maxHp', 'tempHp', 'ac']) row[k] = field(u[k], 'number', u.hidden);
      row.sourceName = field(u.sourceName, 'text', u.hidden);
      for (const k of ['resistances', 'immunities', 'vulnerabilities', 'actions', 'spells']) row[k] = field(u[k], 'list', u.hidden);
      row.effects = field(u.effects, 'effects'); // Only public names/timing; all private effect details are discarded.
      return row;
    });
    const groups = raw.groups.map(g => {
      const id = text(g.id, 'group ID', 128); if (ids.has(id)) throw new Error('Duplicate group ID.'); ids.add(id);
      if (!Array.isArray(g.members) || g.members.some(m => !combatants.some(u => u.id === m)) || new Set(g.members).size !== g.members.length) throw new Error('Unknown group member.');
      return { id, name: text(g.name, 'group name'), initiative: number(g.initiative, 'group initiative', false), members: C.clone(g.members) };
    });
    for (const u of combatants) if (u.groupId !== null && !groups.some(g => g.id === u.groupId && g.members.includes(u.id))) throw new Error('Inconsistent combatant group.');
    if (raw.currentId != null && !ids.has(raw.currentId)) throw new Error('Unknown current turn.');
    if (!raw.active && (combatants.length || groups.length || raw.currentId != null)) throw new Error('Ended encounters must have an empty roster.');
    return { format: raw.format, version: 1, guildId: raw.guildId, channelId: raw.channelId, exporterId: raw.exporterId, requestId: raw.requestId, exportedAt: raw.exportedAt, nonce: typeof raw.nonce === 'string' ? raw.nonce : '', active: raw.active, name: raw.name == null ? null : text(raw.name, 'encounter name'), round: number(raw.round ?? null, 'round'), turn: number(raw.turn ?? null, 'turn'), currentId: raw.currentId ?? null, groups, combatants };
  }
  const key = (guildId, channelId) => { if (!snowflake(guildId) || !snowflake(channelId)) throw new Error('Use Discord server and channel IDs.'); return guildId + ':' + channelId; };
  const isCurrent = (snapshot, u) => snapshot.currentId != null && (snapshot.currentId === u.id || snapshot.currentId === u.groupId);
  function actor(snapshot, id) {
    const row = snapshot.combatants.find(u => u.id === id); if (!row) throw new Error('The selected actor or target is absent from the latest snapshot. Select it again.');
    if ([...snapshot.combatants, ...snapshot.groups].filter(u => u.name.toLowerCase() === row.name.toLowerCase()).length !== 1) throw new Error('Avrae command selectors use names. Rename this duplicate combatant in Discord, then refresh the snapshot.');
    return row;
  }
  function rollConfig(snapshot, unit, workspace) {
    if (!workspace || !unit) return null;
    const linked = workspace.currentEncounter.entries.find(e => e.mirrorLocation === snapshot.guildId + ':' + snapshot.channelId && e.mirrorId === unit.id);
    const refs = C.creatures(workspace), matches = !unit.hidden && unit.sourceName.status === 'known' ? refs.filter(r => r.data.name === unit.sourceName.value) : [];
    const key = linked?.sourceKey || (matches.length === 1 ? matches[0].key : '');
    return workspace.combatTraits?.[key] || null;
  }
  function command(snapshot, spec, prefix = '!', workspace = null) {
    if (!snapshot.active && spec.kind !== 'begin') throw new Error('This snapshot reports no active encounter. Prepare Start combat, execute it, then export again.');
    const p = C.prefix(prefix), integer = (v, label, min = -999999) => { if (!/^-?\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v)) || Number(v) < min) throw new Error('Enter an integer for ' + label + '.'); return String(Number(v)); };
    if (spec.kind === 'begin') return p + 'init begin';
    if (spec.kind === 'next') return p + 'i next';
    if (spec.kind === 'end') { if (spec.confirmEnd !== true) throw new Error('Confirm ending this encounter before preparing its command.'); return p + 'init end'; }
    const u = actor(snapshot, spec.actorId), name = C.quote(u.name);
    if (spec.kind === 'save' || spec.kind === 'check') return T.liveRoll(u.name, spec.kind, spec.stat, T.flags(rollConfig(snapshot, u, workspace), spec.kind, spec.stat, spec.traitChoices || [], spec.roll || 'normal'), p);
    if (['hp', 'hpSet', 'thp', 'remove', 'status'].includes(spec.kind)) return C.command({ mode: spec.kind, actor: u.name, value: spec.value }, p);
    if (spec.kind === 'opt') return C.command({ mode: 'opt', actor: u.name, fixedInitiative: spec.initiative, ac: spec.ac }, p);
    if (spec.kind === 'effectRemove') return p + 'i re ' + name + ' ' + C.quote(text(spec.effect, 'effect name'));
    if (spec.kind === 'effectAdd') {
      if (u.effects.status === 'known' && u.effects.value.some(e => e.name.toLowerCase() === String(spec.effect).toLowerCase())) throw new Error('That effect already exists. Adding the same name can replace its mechanics. Use another name or deliberately remove it in Discord, then refresh.');
      let out = p + 'i effect ' + name + ' ' + C.quote(text(spec.effect, 'effect name'));
      if (spec.duration !== '' && spec.duration != null) out += ' -dur ' + integer(spec.duration, 'duration', 1);
      if (spec.description?.trim()) out += ' -desc ' + C.quote(spec.description);
      return out; // A descriptive effect is not claimed to implement any condition mechanics.
    }
    if (!['action', 'cast', 'source'].includes(spec.kind)) throw new Error('Choose a supported command.');
    const targets = (spec.targetIds || []).map(id => actor(snapshot, id).name);
    if (new Set(spec.targetIds || []).size !== targets.length) throw new Error('Duplicate target selection.');
    if (spec.kind !== 'source' && spec.scope === 'current' && snapshot.currentId !== u.id) throw new Error('Current-turn commands require that exact individual to be the current turn. Use the named combatant mode for off-turn or grouped actors.');
    if ((spec.kind === 'source' || spec.kind === 'cast' && spec.scope === 'source') && u.sourceName.status !== 'known') throw new Error('The source creature name is hidden or unavailable.');
    const mode = spec.kind === 'source' ? 'ma' : spec.kind === 'cast' ? spec.scope === 'source' ? 'moncast' : spec.scope === 'current' ? 'cast' : 'rc' : spec.scope === 'current' ? 'action' : 'aoo';
    const action = text(spec.action, 'action or spell');
    if (spec.repeat && (!/^\d+$/.test(String(spec.repeat)) || Number(spec.repeat) < 1 || Number(spec.repeat) > 25)) throw new Error('Choose 1 to 25 repetitions.');
    return C.command({ mode, actor: u.name, sourceName: u.sourceName.value, action, targets, roll: spec.roll || 'normal', critical: spec.critical || 'normal', attackBonus: spec.attackBonus, damageBonus: spec.damageBonus, ...(spec.damageChoice ? { advanced: '-choice ' + C.quote(spec.damageChoice, 'Ability damage choice') } : {}), repeat: spec.repeat || '1', ...(spec.kind === 'cast' && spec.level !== '' && spec.level != null ? { level: spec.level } : {}) }, p);
  }
  function addCommands(snapshot, spec, workspace, prefix = '!') {
    if (!snapshot.active) throw new Error('Start combat in Discord and refresh the snapshot before adding creatures.');
    const preset = spec.presetName ? workspace.encounters.find(p => p.name === spec.presetName) : null;
    if (spec.presetName && !preset) throw new Error('Choose an existing encounter preset.');
    const entries = preset ? C.clone(preset.entries) : [{ sourceKey: spec.sourceKey, name: spec.addName, quantity: String(spec.quantity || '1'), fixedInitiative: spec.fixedInitiative || '', initiativeBonus: spec.initiativeBonus || '', initiativeRoll: spec.initiativeRoll || 'normal', controller: spec.controller || '' }];
    const resolved = entries.flatMap(e => {
      const ref = C.creatures(workspace).find(c => c.key === e.sourceKey); if (!ref) throw new Error('Choose a creature from your imported library.');
      const baseName = text(e.name, 'encounter name');
      const quantity = String(e.quantity || '1'); if (!/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 20) throw new Error('Mirror additions need a fixed quantity from 1 to 20 so each copy has a known name.');
      return Array.from({ length: Number(quantity) }, (_, i) => ({ ...e, sourceName: ref.data.name, quantity: '1', name: baseName.includes('#') ? baseName.replace(/#/g, String(i + 1)) : Number(quantity) > 1 ? baseName + (i + 1) : baseName }));
    });
    C.validateEncounter(resolved);
    for (const e of resolved) if ([...snapshot.combatants, ...snapshot.groups].some(u => u.name.toLowerCase() === e.name.toLowerCase())) throw new Error('A combatant or group named ' + e.name + ' is already in this snapshot. Choose another name.');
    const commands = resolved.map(e => C.encounterCommand(e, prefix));
    for (const e of resolved) if (workspace.combatTraits?.[e.sourceKey]) commands.push(T.setup(workspace.combatTraits[e.sourceKey], e.name, prefix));
    if (!commands.length || commands.length > 50) throw new Error('Prepare between 1 and 50 commands.');
    return commands;
  }
  function parsePart(text) {
    try { return JSON.parse(text); } catch (original) {
      // Legacy exporter double-quoted JSON through Avrae's argument parser,
      // which removes quote escapes but retains doubled backslashes.
      const runs = [...String(text).matchAll(/\\+/g)];
      if (!runs.length || runs.some(m => m[0].length % 2)) throw original;
      const repaired = JSON.parse(text.replace(/\\+/g, m => '\\'.repeat(m.length / 2)));
      if (repaired.format !== 'aina-avrae-part' || repaired.version !== 1) throw original;
      return repaired;
    }
  }
  function decodePayload(chunks, encoding) {
    const payload = chunks.join('');
    if (encoding === 'percent-json-v1') return decodeURIComponent(payload);
    if (encoding !== undefined && encoding !== null) throw new Error('Unsupported export encoding.');
    return payload;
  }
  function parseImport(input) {
    let parsed = input;
    if (typeof input === 'string') {
      if (input.length > 1024 * 1024) throw new Error('Snapshot import exceeds 1 MB.');
      try { parsed = JSON.parse(input.replace(/^\uFEFF/, '')); }
      catch { parsed = input.split(/\r?\n/).map(line => line.trim()).filter(line => line.includes('AINA-SNAPSHOT/1 ') || line.startsWith('{"format": "aina-avrae-part"') || line.startsWith('{"format":"aina-avrae-part"')).map(line => parsePart(line.includes('AINA-SNAPSHOT/1 ') ? line.slice(line.indexOf('AINA-SNAPSHOT/1 ') + 16) : line)); }
    }
    if (object(parsed) && parsed.format === 'aina-avrae-part') parsed = [parsed];
    if (object(parsed) && parsed.format === 'aina-avrae-snapshot') return validate(parsed);
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 20) throw new Error('Paste a snapshot JSON or all AINA-SNAPSHOT/1 export messages.');
    const first = parsed[0], chunks = new Map();
    for (const p of parsed) {
      if (p.format !== 'aina-avrae-part' || p.version !== 1 || p.nonce !== first.nonce || p.requestId !== first.requestId || p.signature !== first.signature || p.encoding !== first.encoding || p.total !== first.total || !Number.isInteger(p.total) || p.total < 1 || p.total > 20 || !Number.isInteger(p.part) || p.part < 0 || p.part >= p.total || typeof p.chunk !== 'string' || p.chunk.length > 1500 || chunks.has(p.part)) throw new Error('Mixed, duplicate or invalid export parts. Paste one complete export.');
      chunks.set(p.part, p.chunk);
    }
    if (chunks.size !== first.total) throw new Error('Incomplete export: paste all ' + first.total + ' parts.');
    const snapshot = validate(JSON.parse(decodePayload(Array.from({ length: first.total }, (_, i) => chunks.get(i)), first.encoding)));
    if (snapshot.requestId !== first.requestId || snapshot.nonce !== first.nonce) throw new Error('Snapshot does not match the export part identity.');
    return snapshot;
  }
  return { validate, key, isCurrent, actor, command, rollConfig, addCommands, parseImport, parsePart, decodePayload, snowflake };
});
