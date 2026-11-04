const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { DEFAULT_CHARACTER } = require('./constants');

const DATA_DIR = path.resolve(__dirname, '../../../../data/fabula');
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function deepMerge(target, source) {
  const result = structuredClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (forbiddenKeys.has(key)) continue;
    result[key] = isObject(value) && isObject(result[key])
      ? deepMerge(result[key], value)
      : structuredClone(value);
  }
  return result;
}

// Fill missing fields in older sheets without discarding extension fields or
// writing a migration merely because somebody viewed the character.
function normalize(data) {
  if (!isObject(data)) throw new Error('Character data must be a JSON object.');
  const result = deepMerge(DEFAULT_CHARACTER, data);
  for (const key of ['attributes', 'hp', 'mp', 'ip', 'equipment']) {
    if (!isObject(result[key])) throw new Error(`Invalid character field: ${key}.`);
  }
  for (const key of ['classes', 'bonds', 'traits', 'spells', 'abilities', 'statuses']) {
    if (!Array.isArray(result[key])) throw new Error(`Invalid character list: ${key}.`);
  }
  for (const key of ['accessories', 'items']) {
    if (!Array.isArray(result.equipment[key])) throw new Error(`Invalid equipment list: ${key}.`);
  }
  for (const key of ['hp', 'mp', 'ip']) {
    if (!['current', 'max'].every(part => Number.isSafeInteger(result[key][part]) && result[key][part] >= 0)) {
      throw new Error(`Invalid character resource: ${key}.`);
    }
  }
  for (const key of ['level', 'exp', 'fabulaPoints', 'zenit', 'def', 'mdef']) {
    if (!Number.isSafeInteger(result[key]) || result[key] < 0) throw new Error(`Invalid character value: ${key}.`);
  }
  for (const entries of [result.classes, result.bonds, result.spells, result.abilities, result.equipment.items]) {
    if (!entries.every(entry => isObject(entry) && typeof entry.name === 'string' && entry.name.trim())) {
      throw new Error('Invalid named character entry.');
    }
  }
  if (!result.statuses.every(entry => typeof entry === 'string') || !result.traits.every(entry => typeof entry === 'string')) {
    throw new Error('Invalid character notes.');
  }
  result.classes = result.classes.map(cls => ({ ...cls, skills: cls.skills ?? [] }));
  if (!result.classes.every(cls => Array.isArray(cls.skills) && cls.skills.every(skill => isObject(skill) && typeof skill.name === 'string')) ||
      !result.bonds.every(bond => Array.isArray(bond.feelings))) {
    throw new Error('Invalid character skills or bonds.');
  }
  return result;
}

function characterToken(character) {
  return createHash('sha256').update(String(character.characterId ?? character.createdAt ?? 'legacy')).digest('hex').slice(0, 12);
}

// A separate store makes offline tests independent of the user's characters.
function createStore(root = DATA_DIR) {
  function filePath(guildId, userId) {
    if (![guildId, userId].every(id => /^\d{1,22}$/.test(String(id)))) {
      throw new Error('Fabula requires valid server and user IDs.');
    }
    return path.join(root, String(guildId), `${userId}.json`);
  }

  function load(guildId, userId) {
    const filename = filePath(guildId, userId);
    let raw;
    try { raw = fs.readFileSync(filename, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    try { return normalize(JSON.parse(raw.replace(/^\uFEFF/, ''))); }
    catch (error) {
      throw Object.assign(new Error('This character file cannot be read. Ask the bot owner to restore its backup; the original file has been preserved.', { cause: error }), { code: 'FABULA_CORRUPT' });
    }
  }

  function save(guildId, userId, data) {
    const filename = filePath(guildId, userId);
    const saved = normalize(data);
    saved.updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(saved, null, 2);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, serialized, { flag: 'wx' });
      fs.renameSync(temporary, filename);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    return saved;
  }

  function create(guildId, userId, characterData) {
    const filename = filePath(guildId, userId);
    const now = new Date().toISOString();
    const data = normalize({ ...characterData, guildId, userId, characterId: randomUUID(), createdAt: now, updatedAt: now });
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    try { fs.writeFileSync(filename, JSON.stringify(data, null, 2), { flag: 'wx' }); }
    catch (error) {
      if (error.code === 'EEXIST') throw Object.assign(new Error('You already have a character. Use /fab character view or delete it before creating another.'), { code: 'FABULA_DUPLICATE' });
      throw error;
    }
    return data;
  }

  function update(guildId, userId, updates) {
    const data = load(guildId, userId);
    if (!data) return null;
    const merged = deepMerge(data, updates);
    // Identity and creation time belong to the record, not an edit payload.
    return save(guildId, userId, { ...merged, guildId: data.guildId, userId: data.userId, createdAt: data.createdAt, characterId: data.characterId });
  }

  function remove(guildId, userId) {
    try { fs.unlinkSync(filePath(guildId, userId)); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }

  function exists(guildId, userId) { return fs.existsSync(filePath(guildId, userId)); }
  return { load, save, create, update, remove, exists };
}

module.exports = { ...createStore(), createStore, characterToken };
