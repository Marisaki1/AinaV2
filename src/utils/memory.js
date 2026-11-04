const config = require('../../config/config');

const store = new Map();
const pending = new Map();

function conversationKey(userId, guildId, channelId) {
  return guildId || channelId ? `${userId}:${guildId || 'dm'}:${channelId || 'default'}` : userId;
}

function prune() {
  const cutoff = Date.now() - (config.groq.memoryTtlMs ?? 3600000);
  for (const [key, value] of store) {
    if (value.touched < cutoff && !pending.has(key)) store.delete(key);
  }
  const limit = Math.max(1, config.groq.maxSessions ?? 1000);
  for (const key of store.keys()) {
    if (store.size < limit) break;
    if (!pending.has(key)) store.delete(key);
  }
}

function entry(key) {
  let value = store.get(key);
  if (value && value.touched < Date.now() - (config.groq.memoryTtlMs ?? 3600000) && !pending.has(key)) {
    store.delete(key);
    value = null;
  }
  if (!value) {
    prune();
    if (store.size >= (config.groq.maxSessions ?? 1000)) {
      throw Object.assign(new Error('All chat sessions are busy. Try again shortly.'), { code: 'CHAT_BUSY' });
    }
    value = { messages: [], touched: Date.now() };
    store.set(key, value);
  }
  value.touched = Date.now();
  store.delete(key);
  store.set(key, value);
  return value;
}

function getHistory(key) {
  if (!store.has(key)) return [];
  return entry(key).messages.map(message => ({ ...message }));
}

function trim(messages) {
  const limit = Math.max(2, Math.floor((config.groq.memoryLimit || 20) / 2) * 2);
  if (messages.length > limit) messages.splice(0, messages.length - limit);
  while (messages[0]?.role === 'assistant') messages.shift();
}

function addMessage(key, role, content) {
  if (!['user', 'assistant'].includes(role) || typeof content !== 'string') throw new TypeError('Invalid chat message.');
  const value = entry(key);
  value.messages.push({ role, content });
  trim(value.messages);
}

function clearHistory(key) { store.delete(key); }
function hasHistory(key) { return getHistory(key).length > 0; }

// One request per conversation prevents interleaved pairs. Clearing during a
// request invalidates its commit, so /endchat cannot be undone by a late reply.
async function converse(key, content, respond) {
  if (pending.has(key)) throw Object.assign(new Error('A response is already in progress.'), { code: 'CHAT_BUSY' });
  const value = entry(key);
  pending.set(key, value);
  try {
    const response = await respond([...getHistory(key), { role: 'user', content }]);
    if (typeof response !== 'string' || !response.trim()) throw new Error('The chat provider returned an empty response.');
    if (store.get(key) === value) {
      value.messages.push({ role: 'user', content }, { role: 'assistant', content: response });
      value.touched = Date.now();
      trim(value.messages);
    }
    return response;
  } finally {
    pending.delete(key);
    if (store.get(key) === value && !value.messages.length) store.delete(key);
  }
}

module.exports = { conversationKey, getHistory, addMessage, clearHistory, hasHistory, converse };
