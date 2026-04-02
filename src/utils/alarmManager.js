const fs = require('fs');
const path = require('path');
const config = require('../../config/config');

function filePath(guildId) {
  const dir = config.alarms.dataDir;
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${guildId}.json`);
}

function load(guildId) {
  const fp = filePath(guildId);
  if (!fs.existsSync(fp)) return [];
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); }
  catch { return []; }
}

function save(guildId, alarms) {
  fs.writeFileSync(filePath(guildId), JSON.stringify(alarms, null, 2));
}

function add(guildId, alarm) {
  const alarms = load(guildId);
  alarms.push(alarm);
  save(guildId, alarms);
  return alarms.length; // Returns the new alarm's 1-based index
}

function update(guildId, index, alarm) {
  const alarms = load(guildId);
  if (index < 0 || index >= alarms.length) return false;
  alarms[index] = alarm;
  save(guildId, alarms);
  return true;
}

function remove(guildId, index) {
  const alarms = load(guildId);
  if (index < 0 || index >= alarms.length) return false;
  alarms.splice(index, 1);
  save(guildId, alarms);
  return true;
}

function list(guildId) {
  return load(guildId);
}

// Load all alarms for all guilds (used by scheduler)
function loadAll() {
  const dir = config.alarms.dataDir;
  if (!fs.existsSync(dir)) return {};
  const result = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const guildId = file.replace('.json', '');
    result[guildId] = load(guildId);
  }
  return result;
}

module.exports = { load, save, add, update, remove, list, loadAll };
