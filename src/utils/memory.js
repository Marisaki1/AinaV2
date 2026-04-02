const config = require('../../config/config');

// In-memory store: Map<userId, Array<{role, content}>>
const store = new Map();

function getHistory(userId) {
  return store.get(userId) ?? [];
}

function addMessage(userId, role, content) {
  if (!store.has(userId)) store.set(userId, []);
  const history = store.get(userId);
  history.push({ role, content });

  // Trim to memory limit (keep most recent messages)
  const limit = config.groq.memoryLimit;
  if (history.length > limit) history.splice(0, history.length - limit);
}

function clearHistory(userId) {
  store.delete(userId);
}

function hasHistory(userId) {
  return store.has(userId) && store.get(userId).length > 0;
}

module.exports = { getHistory, addMessage, clearHistory, hasHistory };
