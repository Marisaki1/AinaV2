const fs   = require('fs');
const path = require('path');
const { DEFAULT_CHARACTER } = require('./constants');

const DATA_DIR = 'data/fabula';

// ── Helpers ───────────────────────────────────────────────────────────

function filePath(guildId, userId) {
  const dir = path.join(DATA_DIR, String(guildId));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${userId}.json`);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      key in result &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────

function load(guildId, userId) {
  const fp = filePath(guildId, userId);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return null;
  }
}

function save(guildId, userId, data) {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath(guildId, userId), JSON.stringify(data, null, 2));
}

function create(guildId, userId, characterData) {
  const data = {
    ...DEFAULT_CHARACTER,
    ...characterData,
    // ensure nested defaults are preserved
    attributes: { ...DEFAULT_CHARACTER.attributes, ...(characterData.attributes ?? {}) },
    hp:         { ...DEFAULT_CHARACTER.hp,         ...(characterData.hp         ?? {}) },
    mp:         { ...DEFAULT_CHARACTER.mp,         ...(characterData.mp         ?? {}) },
    ip:         { ...DEFAULT_CHARACTER.ip,         ...(characterData.ip         ?? {}) },
    equipment: {
      ...DEFAULT_CHARACTER.equipment,
      ...(characterData.equipment ?? {}),
    },
    userId,
    guildId,
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
  };
  save(guildId, userId, data);
  return data;
}

/**
 * Shallow-merge top-level keys, deep-merge nested objects.
 * Arrays are REPLACED (not merged) — pass the full new array.
 */
function update(guildId, userId, updates) {
  const data = load(guildId, userId);
  if (!data) return null;
  const merged = deepMerge(data, updates);
  save(guildId, userId, merged);
  return merged;
}

function remove(guildId, userId) {
  const fp = filePath(guildId, userId);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}

function exists(guildId, userId) {
  return fs.existsSync(filePath(guildId, userId));
}

module.exports = { load, save, create, update, remove, exists };
