const path = require('node:path');
const config = require('../../config/config');
const { resolvePath, readJson, writeJson } = require('./jsonStore');

// Cache and batch writes: a history scan must not read/write once per emoji.
function createEmojiManager({ dataDir = () => config.emoji.dataDir, flushDelay = 1000 } = {}) {
  const cache = new Map();
  const dirty = new Set();
  const liveRevisions = new Map();
  let revision = 0;
  let closing = false;
  let timer;
  const revisionKey = (guildId, messageId, emojiId = 'content') => `${guildId}:${messageId}:${emojiId}`;
  const changedDuringScan = (key, observedBefore) => observedBefore !== undefined && (liveRevisions.get(key) ?? 0) > observedBefore;

  function filePath(guildId) {
    if (!/^\d+$/.test(String(guildId))) throw new Error('Invalid server ID.');
    return path.join(resolvePath(typeof dataDir === 'function' ? dataDir() : dataDir), `${guildId}.json`);
  }

  function load(guildId) {
    const file = filePath(guildId);
    if (cache.has(file)) return cache.get(file);
    const data = readJson(file, { emojis: {}, stickers: {}, messages: {}, lastUpdated: null });
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid emoji statistics file.');
    for (const key of ['emojis', 'stickers', 'messages']) {
      if (data[key] === undefined) data[key] = {};
      if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) throw new Error(`Invalid emoji statistics: ${key}.`);
    }
    // Older totals have no message IDs; retain them and expose the limitation.
    if (data.schemaVersion !== 2 && (Object.keys(data.emojis).length || Object.keys(data.stickers).length)) data.legacyTotals = true;
    data.schemaVersion = 2;
    cache.set(file, data);
    return data;
  }

  function flushAll() {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const file of [...dirty]) {
      writeJson(file, cache.get(file));
      dirty.delete(file);
    }
  }

  function changed(guildId, data) {
    data.lastUpdated = new Date().toISOString();
    dirty.add(filePath(guildId));
    if (!timer) {
      timer = setTimeout(() => {
        try { flushAll(); } catch (error) { console.error('[Emoji] Could not save statistics:', error.message); }
      }, flushDelay);
      timer.unref?.();
    }
  }

  function apply(data, collection, id, name, count, date) {
    if (!/^\d+$/.test(String(id)) || !Number.isFinite(count)) return;
    const when = new Date(date || Date.now()).toISOString();
    const record = data[collection][id] ?? { name, count: 0, firstUsed: when, lastUsed: when };
    record.name = name;
    record.count = Math.max(0, (Number(record.count) || 0) + count);
    if (count > 0) {
      if (!record.firstUsed || when < record.firstUsed) record.firstUsed = when;
      if (!record.lastUsed || when > record.lastUsed) record.lastUsed = when;
    }
    data[collection][id] = record;
  }

  function update(guildId, collection, id, name, date = null, count = 1) {
    if (closing) return;
    const data = load(guildId);
    apply(data, collection, id, name, count, date);
    changed(guildId, data);
  }

  function messageRecord(data, messageId, date) {
    if (!/^\d+$/.test(String(messageId))) throw new Error('Invalid message ID.');
    return data.messages[messageId] ??= { createdAt: new Date(date || Date.now()).toISOString(), emojis: {}, stickers: {}, reactions: {} };
  }

  function trackMessage(message, { observedBefore, edited = false } = {}) {
    if (closing || !message.guild || message.author?.bot) return { emojis: 0, stickers: 0 };
    const guild = message.guild;
    const key = revisionKey(guild.id, message.id);
    if (changedDuringScan(key, observedBefore)) return { emojis: 0, stickers: 0, skipped: true };
    if (edited && observedBefore === undefined) liveRevisions.set(key, ++revision);
    const data = load(guild.id);
    const emojis = {}, stickers = {};
    for (const { id, name } of extractCustomEmojiIds(message.content)) {
      if (!guild.emojis.cache.has(id)) continue;
      emojis[id] ??= { name, count: 0 };
      emojis[id].count++;
    }
    for (const sticker of message.stickers?.values() ?? []) {
      if (sticker.guildId === guild.id || guild.stickers?.cache.has(sticker.id)) stickers[sticker.id] = { name: sticker.name, count: 1 };
    }
    if (!Object.keys(emojis).length && !Object.keys(stickers).length && !data.messages[message.id]) return { emojis: 0, stickers: 0 };
    if (observedBefore === undefined) liveRevisions.set(key, ++revision);
    const record = messageRecord(data, message.id, message.createdAt);
    const added = { emojis: 0, stickers: 0 };
    for (const [collection, next] of Object.entries({ emojis, stickers })) {
      for (const id of new Set([...Object.keys(record[collection]), ...Object.keys(next)])) {
        const delta = (next[id]?.count ?? 0) - (record[collection][id]?.count ?? 0);
        if (delta) apply(data, collection, id, next[id]?.name ?? record[collection][id].name, delta, record.createdAt);
        added[collection] += Math.max(0, delta);
      }
      record[collection] = next;
    }
    changed(guild.id, data);
    return added;
  }

  function setReactionUsers(guildId, messageId, emojiId, name, users, date, { observedBefore } = {}) {
    if (closing) return null;
    if (changedDuringScan(revisionKey(guildId, messageId, emojiId), observedBefore) || changedDuringScan(revisionKey(guildId, messageId, 'reactions'), observedBefore)) return null;
    const data = load(guildId);
    const record = messageRecord(data, messageId, date);
    const previous = record.reactions[emojiId]?.users ?? [];
    const next = [...new Set(users.map(String))];
    const delta = next.length - previous.length;
    apply(data, 'emojis', emojiId, name, delta, date ?? record.createdAt);
    record.reactions[emojiId] = { name, users: next };
    changed(guildId, data);
    return Math.max(0, delta);
  }

  function trackReaction(reaction, user, added = true) {
    if (closing) return 0;
    const guild = reaction.message.guild;
    if (!guild || user.bot || !reaction.emoji.id || !guild.emojis.cache.has(reaction.emoji.id)) return 0;
    liveRevisions.set(revisionKey(guild.id, reaction.message.id, reaction.emoji.id), ++revision);
    const record = load(guild.id).messages[reaction.message.id];
    const users = new Set(record?.reactions[reaction.emoji.id]?.users ?? []);
    if (added) users.add(user.id); else users.delete(user.id);
    return setReactionUsers(guild.id, reaction.message.id, reaction.emoji.id, reaction.emoji.name, [...users], reaction.message.createdAt);
  }

  function reconcileReactions(guildId, messageId, activeIds, observedBefore) {
    if (closing) return;
    if (observedBefore === undefined) liveRevisions.set(revisionKey(guildId, messageId, 'reactions'), ++revision);
    const record = load(guildId).messages[messageId];
    if (!record) return;
    const active = new Set(activeIds);
    for (const [emojiId, reaction] of Object.entries(record.reactions)) {
      if (active.has(emojiId)) continue;
      if (observedBefore === undefined) liveRevisions.set(revisionKey(guildId, messageId, emojiId), ++revision);
      setReactionUsers(guildId, messageId, emojiId, reaction.name, [], record.createdAt, { observedBefore });
    }
  }

  function removeReaction(guildId, messageId, emojiId) {
    if (closing) return;
    liveRevisions.set(revisionKey(guildId, messageId, emojiId), ++revision);
    const record = load(guildId).messages[messageId];
    const reaction = record?.reactions[emojiId];
    if (reaction) setReactionUsers(guildId, messageId, emojiId, reaction.name, [], record.createdAt);
  }

  function clearStats(guildId) {
    if (closing) return;
    const file = filePath(guildId);
    const data = { schemaVersion: 2, emojis: {}, stickers: {}, messages: {}, lastUpdated: null };
    cache.set(file, data);
    for (const key of liveRevisions.keys()) if (key.startsWith(`${guildId}:`)) liveRevisions.delete(key);
    changed(guildId, data);
    flushAll();
  }

  return {
    load, flushAll, trackMessage, trackReaction, setReactionUsers, reconcileReactions, removeReaction, clearStats,
    getRevision: () => revision,
    shutdown() { closing = true; flushAll(); },
    updateEmoji: (guild, id, name, date, count) => update(guild, 'emojis', id, name, date, count),
    updateSticker: (guild, id, name, date, count) => update(guild, 'stickers', id, name, date, count),
    extractCustomEmojiIds,
  };
}

function extractCustomEmojiIds(content = '') {
  return [...String(content).matchAll(/<a?:(\w+):(\d+)>/g)].map(match => ({ id: match[2], name: match[1] }));
}

module.exports = { ...createEmojiManager(), createEmojiManager };
