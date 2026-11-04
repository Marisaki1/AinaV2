const path = require('node:path');
const config = require('../../config/config');
const { readJson, writeJson, resolvePath } = require('./jsonStore');

function createRegistry(getPath = () => resolvePath(path.join(config.users.dataDir, 'registry.json'))) {
  const caches = new Map();
  function state() {
    const file = getPath();
    if (!caches.has(file)) {
      const data = readJson(file, {});
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('User registry must be a JSON object.');
      caches.set(file, { file, data, dirty: false, timer: null });
    }
    return caches.get(file);
  }
  function flushState(value) {
    clearTimeout(value.timer);
    value.timer = null;
    if (!value.dirty) return;
    writeJson(value.file, value.data);
    value.dirty = false;
  }
  function schedule(value) {
    value.dirty = true;
    if (value.timer) return;
    value.timer = setTimeout(() => {
      try { flushState(value); }
      catch (error) { console.error('[User registry]', error.message); }
    }, 1000);
    value.timer.unref();
  }
  function record(user, guildId = null, type = 'other') {
    if (!user?.id || ['__proto__', 'constructor', 'prototype'].includes(user.id)) return null;
    try {
      const value = state();
      const now = new Date().toISOString();
      const previous = Object.hasOwn(value.data, user.id) ? value.data[user.id] : null;
      const entry = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
      Object.assign(entry, {
        id: user.id, username: user.username ?? entry.username ?? user.id,
        displayName: user.displayName ?? user.globalName ?? user.username ?? entry.displayName ?? user.id,
        isOwner: user.id === config.ownerId,
        firstSeen: entry.firstSeen || now, lastSeen: now,
        messageCount: Number.isSafeInteger(entry.messageCount) ? entry.messageCount : 0,
        commandCount: Number.isSafeInteger(entry.commandCount) ? entry.commandCount : 0,
        guilds: Array.isArray(entry.guilds) ? entry.guilds : [],
      });
      if (type === 'message') entry.messageCount++;
      if (type === 'command') entry.commandCount++;
      if (guildId && !entry.guilds.includes(guildId)) entry.guilds.push(guildId);
      value.data[user.id] = entry;
      schedule(value);
      return structuredClone(entry);
    } catch (error) {
      // Telemetry cannot prevent commands or chat; a damaged registry remains untouched.
      console.error('[User registry]', error.message);
      return null;
    }
  }
  return {
    record,
    get(userId) { return structuredClone(Object.hasOwn(state().data, userId) ? state().data[userId] : null); },
    listAll() { return Object.values(structuredClone(state().data)).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)); },
    totalUsers() { return Object.keys(state().data).length; },
    flush() { for (const value of caches.values()) flushState(value); },
    isOwner(userId) { return userId === config.ownerId; },
  };
}

module.exports = { ...createRegistry(), createRegistry };
