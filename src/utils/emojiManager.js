const fs = require('fs');
const path = require('path');
const config = require('../../config/config');

function filePath(guildId) {
  const dir = config.emoji.dataDir;
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${guildId}.json`);
}

function load(guildId) {
  const fp = filePath(guildId);
  if (!fs.existsSync(fp)) return { emojis: {}, stickers: {}, lastUpdated: null };
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); }
  catch { return { emojis: {}, stickers: {}, lastUpdated: null }; }
}

function save(guildId, data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(filePath(guildId), JSON.stringify(data, null, 2));
}

function updateEmoji(guildId, emojiId, emojiName, date = null) {
  const data = load(guildId);
  const now = date ? date.toISOString() : new Date().toISOString();

  if (!data.emojis[emojiId]) {
    data.emojis[emojiId] = { name: emojiName, count: 0, firstUsed: now, lastUsed: now };
  }

  data.emojis[emojiId].count++;
  data.emojis[emojiId].name = emojiName;

  if (date) {
    if (new Date(date) < new Date(data.emojis[emojiId].firstUsed))
      data.emojis[emojiId].firstUsed = now;
    if (new Date(date) > new Date(data.emojis[emojiId].lastUsed))
      data.emojis[emojiId].lastUsed = now;
  } else {
    data.emojis[emojiId].lastUsed = now;
  }

  save(guildId, data);
}

function updateSticker(guildId, stickerId, stickerName, date = null) {
  const data = load(guildId);
  const id = String(stickerId);
  const now = date ? date.toISOString() : new Date().toISOString();

  if (!data.stickers[id]) {
    data.stickers[id] = { name: stickerName, count: 0, firstUsed: now, lastUsed: now };
  }

  data.stickers[id].count++;
  data.stickers[id].name = stickerName;

  if (date) {
    if (new Date(date) < new Date(data.stickers[id].firstUsed))
      data.stickers[id].firstUsed = now;
    if (new Date(date) > new Date(data.stickers[id].lastUsed))
      data.stickers[id].lastUsed = now;
  } else {
    data.stickers[id].lastUsed = now;
  }

  save(guildId, data);
}

function extractCustomEmojiIds(content) {
  const matches = [...content.matchAll(/<a?:(\w+):(\d+)>/g)];
  return matches.map(m => ({ id: m[2], name: m[1] }));
}

function clearStats(guildId) {
  const fp = filePath(guildId);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

module.exports = { load, updateEmoji, updateSticker, extractCustomEmojiIds, clearStats };
