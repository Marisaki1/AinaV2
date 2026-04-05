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

/**
 * Migrate legacy field names from old character saves:
 *   theme  → identity   (old "Theme / Background" label)
 *   origin → theme      (old "Origin" label)
 */
function migrateFields(data) {
  if (!data) return data;
  if ('origin' in data && !('identity' in data)) {
    // Old character: theme=old-theme, origin=old-origin
    data.identity = data.theme ?? '';
    data.theme    = data.origin;
    delete data.origin;
  }
  return data;
}

// ── Public API ────────────────────────────────────────────────────────

function load(guildId, userId) {
  const fp = filePath(guildId, userId);
  if (!fs.existsSync(fp)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    return migrateFields(data);
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
    attributes: { ...DEFAULT_CHARACTER.attributes, ...(characterData.attributes ?? {}) },
    hp:         { ...DEFAULT_CHARACTER.hp,         ...(characterData.hp         ?? {}) },
    mp:         { ...DEFAULT_CHARACTER.mp,         ...(characterData.mp         ?? {}) },
    ip:         { ...DEFAULT_CHARACTER.ip,         ...(characterData.ip         ?? {}) },
    equipment:  { ...DEFAULT_CHARACTER.equipment,  ...(characterData.equipment  ?? {}) },
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

// ── Auto-sync helpers ─────────────────────────────────────────────────

/**
 * Recalculate def + mdef from equipped armor and shield, then save.
 * Called automatically after any equipment change.
 */
function syncEquipmentStats(guildId, userId) {
  const data = load(guildId, userId);
  if (!data) return null;

  const eq   = data.equipment ?? {};
  let def    = 0;
  let mdef   = 0;

  if (eq.armor) {
    def  += eq.armor.def  ?? 0;
    mdef += eq.armor.mdef ?? 0;
  }
  if (eq.shield) {
    def  += eq.shield.def  ?? 0;
    mdef += eq.shield.mdef ?? 0;
  }

  return update(guildId, userId, { def, mdef });
}

/**
 * Recalculate character level as the sum of all class levels.
 * Minimum 0 (no classes = level 0).
 * Called automatically after any class add/edit/remove.
 */
function recalcLevel(guildId, userId) {
  const data = load(guildId, userId);
  if (!data) return null;

  const level = (data.classes ?? []).reduce((sum, c) => sum + (c.level ?? 0), 0);
  return update(guildId, userId, { level });
}

module.exports = { load, save, create, update, remove, exists, syncEquipmentStats, recalcLevel };