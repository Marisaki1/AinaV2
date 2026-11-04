const fs = require('fs');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const moment = require('moment-timezone');
const config = require('../../config/config');
const { readJson, writeJson, resolvePath } = require('./jsonStore');

function filePath(guildId) {
  if (!/^[\w-]+$/.test(String(guildId))) throw new Error('Invalid server ID.');
  return path.join(resolvePath(config.alarms.dataDir), `${guildId}.json`);
}
function load(guildId) {
  const alarms = readJson(filePath(guildId), []);
  if (!Array.isArray(alarms) || alarms.some(a => !a || typeof a !== 'object' || Array.isArray(a))) throw new Error(`Invalid alarm data for server ${guildId}; the file has not been changed.`);
  // Stable identities protect legacy entries from deletion after concurrent edits.
  return alarms.map((alarm, index) => ({
    ...alarm,
    id: alarm.id || createHash('sha256').update(`${guildId}:${index}:${JSON.stringify(alarm)}`).digest('hex').slice(0, 32),
    revision: Number.isSafeInteger(alarm.revision) ? alarm.revision : 0,
  }));
}
function save(guildId, alarms) { writeJson(filePath(guildId), alarms); }
function nextRun(alarm, from = moment(), includeCurrentMinute = false) {
  const now = moment(from).tz(config.alarms.timezone);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(alarm.time || '')) throw new Error('Use HH:MM in 24-hour format.');
  if (!moment.tz.zone(config.alarms.timezone)) throw new Error('Invalid alarm timezone in config.');
  const [hour, minute] = alarm.time.split(':').map(Number);
  const candidate = now.clone().hour(hour).minute(minute).second(0).millisecond(0);
  const threshold = includeCurrentMinute ? now.clone().startOf('minute') : now;
  if (alarm.repeat === 'weekly') {
    const day = Number(alarm.weekday) || (alarm.createdAt ? moment(alarm.createdAt).tz(config.alarms.timezone).isoWeekday() : now.isoWeekday());
    candidate.isoWeekday(day);
    if (candidate.isBefore(threshold) || (!includeCurrentMinute && candidate.isSame(threshold))) candidate.add(1, 'week');
  } else if (candidate.isBefore(threshold) || (!includeCurrentMinute && candidate.isSame(threshold))) candidate.add(1, 'day');
  return candidate.toISOString();
}
function validate(alarm) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(alarm.time || '')) throw new Error('Use HH:MM in 24-hour format.');
  if (typeof alarm.message !== 'string' || !alarm.message.trim() || alarm.message.length > 1000) throw new Error('Alarm messages must contain 1–1000 characters.');
  if (!['once', 'daily', 'weekly'].includes(alarm.repeat ?? 'once')) throw new Error('Invalid alarm frequency.');
  if (alarm.weekday != null && (!Number.isInteger(alarm.weekday) || alarm.weekday < 1 || alarm.weekday > 7)) throw new Error('Invalid weekday.');
  for (const key of ['channels', 'members']) {
    if (!Array.isArray(alarm[key]) || alarm[key].length > 10 || alarm[key].some(v => typeof v !== 'string' || !v.trim())) throw new Error(`Choose at most 10 ${key}.`);
  }
  if (!alarm.channels.length && !alarm.members.length) throw new Error('Choose at least one channel or member to notify.');
}
function add(guildId, alarm) {
  validate(alarm);
  const alarms = load(guildId);
  if (alarms.length >= config.alarms.maxAlarmsPerGuild) throw new Error(`This server has reached its limit of ${config.alarms.maxAlarmsPerGuild} alarms.`);
  const entry = { ...alarm, id: randomUUID(), revision: 0, createdAt: new Date().toISOString() };
  // Without an explicit weekday, weekly means the next occurrence, then every seven days.
  if (entry.repeat === 'weekly' && !entry.weekday) entry.weekday = moment(nextRun({ ...entry, repeat: 'once' })).tz(config.alarms.timezone).isoWeekday();
  entry.nextRunAt = nextRun(entry);
  alarms.push(entry);
  save(guildId, alarms);
  return alarms.length;
}
function update(guildId, index, alarm) {
  validate(alarm);
  const alarms = load(guildId);
  if (!Number.isInteger(index) || index < 0 || index >= alarms.length) return false;
  if (alarm.id && alarm.id !== alarms[index].id) return false;
  if (alarm.revision != null && alarm.revision !== alarms[index].revision) return false;
  const entry = { ...alarms[index], ...alarm, id: alarms[index].id, revision: alarms[index].revision + 1 };
  if (entry.repeat === 'weekly' && !entry.weekday) entry.weekday = moment(nextRun({ ...entry, repeat: 'once' })).tz(config.alarms.timezone).isoWeekday();
  entry.nextRunAt = nextRun(entry);
  delete entry.deliveredTargets;
  delete entry.lastAttemptAt;
  delete entry.lastError;
  alarms[index] = entry;
  save(guildId, alarms);
  return true;
}
function remove(guildId, index) {
  const alarms = load(guildId);
  if (!Number.isInteger(index) || index < 0 || index >= alarms.length) return false;
  alarms.splice(index, 1);
  save(guildId, alarms);
  return true;
}
// Edits made while Discord is sending win over scheduler updates.
function applyDelivery(guildId, alarm, patch, removeEntry = false) {
  const alarms = load(guildId);
  const index = alarms.findIndex(a => a.id === alarm.id && a.revision === alarm.revision);
  if (index < 0) return false;
  if (removeEntry) alarms.splice(index, 1);
  else alarms[index] = { ...alarms[index], ...patch };
  save(guildId, alarms);
  return true;
}
function loadAll() {
  const dir = resolvePath(config.alarms.dataDir);
  if (!fs.existsSync(dir)) return {};
  const result = {};
  for (const file of fs.readdirSync(dir)) {
    if (!/^[\w-]+\.json$/.test(file)) continue;
    const guildId = file.slice(0, -5);
    try { result[guildId] = load(guildId); }
    catch (error) { console.error(`[Alarms] ${guildId}: ${error.message}`); }
  }
  return result;
}
function imagePath(name) {
  if (typeof name !== 'string' || path.basename(name) !== name || /[\\/]/.test(name) || !/\.(png|jpe?g|gif|webp)$/i.test(name)) return null;
  const root = resolvePath(config.alarms.imagesDir);
  const target = path.join(root, name);
  try {
    const relative = path.relative(fs.realpathSync(root), fs.realpathSync(target));
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) && fs.statSync(target).isFile() ? target : null;
  } catch { return null; }
}
module.exports = { load, save, add, update, remove, list: load, loadAll, nextRun, applyDelivery, imagePath };
