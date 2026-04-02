/**
 * userRegistry.js
 *
 * Maintains a persistent record of every Discord user who interacts with Aina.
 * Each user gets their own entry keyed by Discord ID, stored in data/users/registry.json.
 *
 * Tracked fields per user:
 *   - id, username, displayName
 *   - isOwner (true only for the configured ownerId)
 *   - firstSeen, lastSeen (ISO timestamps)
 *   - messageCount  — total @mention / /chat messages sent
 *   - commandCount  — total slash commands used
 *   - guilds         — set of server IDs where they were seen
 */

const fs   = require('fs');
const path = require('path');
const config = require('../../config/config');

// ── Internal helpers ─────────────────────────────────────────────────

function registryPath() {
  fs.mkdirSync(config.users.dataDir, { recursive: true });
  return path.join(config.users.dataDir, 'registry.json');
}

function loadRegistry() {
  const fp = registryPath();
  if (!fs.existsSync(fp)) return {};
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return {};
  }
}

function saveRegistry(registry) {
  fs.writeFileSync(registryPath(), JSON.stringify(registry, null, 2));
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Record or update a user entry in the registry.
 * Call this every time a user interacts with Aina.
 *
 * @param {import('discord.js').User}   user    - Discord.js User object
 * @param {string|null}                 guildId - The guild where the interaction occurred
 * @param {'message'|'command'|'other'} type    - Type of interaction
 * @returns {object} The updated user record
 */
function record(user, guildId = null, type = 'other') {
  const registry = loadRegistry();
  const now      = new Date().toISOString();
  const isOwner  = user.id === config.ownerId;

  if (!registry[user.id]) {
    registry[user.id] = {
      id:           user.id,
      username:     user.username,
      displayName:  user.displayName ?? user.username,
      isOwner,
      firstSeen:    now,
      lastSeen:     now,
      messageCount: 0,
      commandCount: 0,
      guilds:       [],
    };
  }

  const entry = registry[user.id];

  // Always refresh mutable fields
  entry.username    = user.username;
  entry.displayName = user.displayName ?? user.username;
  entry.isOwner     = isOwner;
  entry.lastSeen    = now;

  // Increment appropriate counter
  if (type === 'message') entry.messageCount++;
  if (type === 'command') entry.commandCount++;

  // Track guilds (deduplicated)
  if (guildId && !entry.guilds.includes(guildId)) {
    entry.guilds.push(guildId);
  }

  saveRegistry(registry);
  return entry;
}

/**
 * Retrieve a single user record by Discord ID.
 * Returns null if the user has never been seen.
 *
 * @param {string} userId
 * @returns {object|null}
 */
function get(userId) {
  const registry = loadRegistry();
  return registry[userId] ?? null;
}

/**
 * Returns true if the given user ID belongs to the configured owner (Papa).
 *
 * @param {string} userId
 * @returns {boolean}
 */
function isOwner(userId) {
  return userId === config.ownerId;
}

/**
 * Return all recorded users as an array, sorted by lastSeen descending.
 *
 * @returns {object[]}
 */
function listAll() {
  const registry = loadRegistry();
  return Object.values(registry).sort(
    (a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)
  );
}

/**
 * Return the total count of unique users ever recorded.
 *
 * @returns {number}
 */
function totalUsers() {
  return Object.keys(loadRegistry()).length;
}

module.exports = { record, get, isOwner, listAll, totalUsers };
