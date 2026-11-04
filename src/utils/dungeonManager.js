const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { generateDungeon, renderFloor } = require('./mapGenerator');
const { CELL } = require('../../config/constants');
const config = require('../../config/config');
const { readJson, writeJson, resolvePath } = require('./jsonStore');
const activeDungeons = new Map();
const MAX_PLAYERS = 25;
function guildKey(guildId) {
  if (!/^[\w-]+$/.test(String(guildId))) throw new Error('Invalid server ID.');
  return String(guildId);
}
function savePath(id, guildId) {
  const guild = guildKey(guildId);
  if (typeof id !== 'string' || !/^[\w-]+$/.test(id) || !id.startsWith(`${guild}_`)) return null;
  return path.join(resolvePath(config.dungeon.savesDir), `${id}.json`);
}
function create(guildId, options = {}, leaderId) {
  guildKey(guildId);
  if (get(guildId)) throw new Error('A dungeon is already active in this server.');
  const dungeon = generateDungeon(options);
  const state = {
    id: `${guildId}_${Date.now()}_${randomUUID().slice(0, 8)}`, guildId, leaderId,
    name: String(options.name || `${dungeon.sizeKey} Dungeon`).trim().slice(0, 100), options,
    dungeon, currentFloor: 0, playerPos: { row: 1, col: 1 }, revealed: new Set(), revealedByFloor: {},
    players: [leaderId], messageId: null, channelId: null, uiToken: randomUUID().slice(0, 12),
    createdAt: new Date().toISOString(), steps: 0, events: [], completed: false,
  };
  activeDungeons.set(guildId, state);
  return state;
}
function get(guildId) { return activeDungeons.get(guildId) ?? null; }
function remove(guildId) { return activeDungeons.delete(guildId); }
function addPlayer(guildId, userId) {
  const state = get(guildId);
  if (!state || state.players.includes(userId) || state.players.length >= MAX_PLAYERS) return false;
  state.players.push(userId);
  return true;
}
function removePlayer(guildId, userId) {
  const state = get(guildId);
  if (!state || !state.players.includes(userId)) return false;
  state.players = state.players.filter(id => id !== userId);
  if (state.leaderId === userId) state.leaderId = state.players[0] ?? null;
  return true;
}
function move(guildId, dr, dc) {
  const state = get(guildId);
  if (!state || state.completed || !Number.isInteger(dr) || !Number.isInteger(dc) || Math.abs(dr) + Math.abs(dc) !== 1) return { moved: false };
  const floor = state.dungeon.floors[state.currentFloor];
  const nr = state.playerPos.row + dr;
  const nc = state.playerPos.col + dc;
  if (nr < 0 || nr >= state.dungeon.height || nc < 0 || nc >= state.dungeon.width || floor[nr][nc] === CELL.WALL) return { moved: false };
  const cell = floor[nr][nc];
  state.playerPos = { row: nr, col: nc };
  state.steps++;
  let event = null;
  let won = false;
  let newFloor = false;
  if (cell === CELL.TRAP || cell === CELL.CHEST) {
    event = cell === CELL.TRAP ? { type: 'trap', msg: '⚠️ You stepped on a trap! It has been triggered.' } : { type: 'chest', msg: '💰 You found and opened a chest!' };
    floor[nr][nc] = CELL.PATH;
  } else if (cell === CELL.ENEMY) {
    event = { type: 'enemy', msg: '👾 An enemy lurks here. This exploration game records encounters; it does not resolve combat.' };
  } else if (cell === CELL.END && state.currentFloor === state.dungeon.numFloors - 1) {
    won = true;
    state.completed = true;
    event = { type: 'won', msg: '🏁 You reached the final goal! The dungeon is cleared!' };
  } else if ((cell === CELL.STAIRS_DOWN && state.currentFloor < state.dungeon.numFloors - 1) || (cell === CELL.STAIRS_UP && state.currentFloor > 0)) {
    state.revealed = renderFloor(floor, state.playerPos, state.revealed).revealed;
    state.revealedByFloor[state.currentFloor] = state.revealed;
    const down = cell === CELL.STAIRS_DOWN;
    state.currentFloor += down ? 1 : -1;
    state.playerPos = down ? { row: 1, col: 1 } : { row: state.dungeon.height - 2, col: state.dungeon.width - 2 };
    state.revealed = state.revealedByFloor[state.currentFloor] ?? new Set();
    newFloor = true;
    event = { type: 'stairs', msg: `${down ? '⬇️ Descending' : '⬆️ Ascending'} to floor ${state.currentFloor + 1}...` };
  }
  state.revealed = renderFloor(state.dungeon.floors[state.currentFloor], state.playerPos, state.revealed).revealed;
  if (event) {
    state.events.push({ ...event, step: state.steps });
    // Only the recent event history is displayed; bound long-running sessions.
    if (state.events.length > 500) state.events.splice(0, state.events.length - 500);
  }
  return { moved: true, event, won, newFloor };
}
function inspect(guildId) {
  const state = get(guildId);
  if (!state) return null;
  const cell = state.dungeon.floors[state.currentFloor][state.playerPos.row][state.playerPos.col];
  const descriptions = {
    [CELL.START]: 'The dungeon entrance. Find the stairs or the final goal.',
    [CELL.STAIRS_UP]: 'Stairs to the previous floor. Step away and back onto them to ascend.',
    [CELL.STAIRS_DOWN]: 'Stairs to the next floor. Step away and back onto them to descend.',
    [CELL.ENEMY]: 'An enemy encounter. Combat, health, and loot are not tracked in this exploration game.',
    [CELL.END]: 'The final goal. The dungeon is cleared!',
  };
  return { type: 'inspect', msg: descriptions[cell] || 'An explored passage. Chests and traps trigger when you step on them. Find the stairs or the goal.' };
}
function renderCurrent(guildId) {
  const state = get(guildId);
  if (!state) return null;
  const { map, revealed } = renderFloor(state.dungeon.floors[state.currentFloor], state.playerPos, state.revealed);
  state.revealed = revealed;
  return { map, floorNum: state.currentFloor + 1, totalFloors: state.dungeon.numFloors, steps: state.steps, players: state.players, lastEvent: state.events.at(-1) ?? null };
}
function saveState(guildId) {
  const state = get(guildId);
  if (!state) return null;
  const target = savePath(state.id, guildId);
  if (!target) throw new Error('Invalid dungeon save ID.');
  const savedAt = new Date().toISOString();
  const data = {
    ...state, savedAt, revealed: [...state.revealed],
    revealedByFloor: Object.fromEntries(Object.entries(state.revealedByFloor).map(([key, cells]) => [key, [...cells]])),
  };
  writeJson(target, data);
  state.savedAt = savedAt;
  return state.id;
}
function validSave(data, guildId, dungeonId) {
  if (!data || data.guildId !== guildId || data.id !== dungeonId || !data.dungeon || typeof data.name !== 'string') return false;
  const { width, height, floors, numFloors } = data.dungeon;
  if (![width, height].every(n => Number.isInteger(n) && n >= 3 && n <= 51) || !Array.isArray(floors) || floors.length !== numFloors || numFloors < 1 || numFloors > 100) return false;
  if (floors.some(floor => !Array.isArray(floor) || floor.length !== height || floor.some(row => !Array.isArray(row) || row.length !== width || row.some(cell => !Number.isInteger(cell) || cell < 0 || cell > CELL.ENEMY)))) return false;
  if (!Number.isInteger(data.currentFloor) || data.currentFloor < 0 || data.currentFloor >= numFloors) return false;
  const { row, col } = data.playerPos || {};
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= height || col >= width || floors[data.currentFloor][row][col] === CELL.WALL) return false;
  if (!Array.isArray(data.players) || !data.players.length || data.players.length > MAX_PLAYERS || data.players.some(id => typeof id !== 'string')) return false;
  if (!Number.isSafeInteger(data.steps) || data.steps < 0 || !Array.isArray(data.events) || !Array.isArray(data.revealed)) return false;
  if (data.revealedByFloor != null && (typeof data.revealedByFloor !== 'object' || Array.isArray(data.revealedByFloor) || Object.values(data.revealedByFloor).some(cells => !Array.isArray(cells)))) return false;
  return true;
}
function listSaved(guildId) {
  guildKey(guildId);
  const dir = resolvePath(config.dungeon.savesDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(file => file.startsWith(`${guildId}_`) && /^[\w-]+\.json$/.test(file)).map(file => {
    try {
      const data = readJson(path.join(dir, file), null);
      return validSave(data, guildId, file.slice(0, -5)) ? data : null;
    } catch (error) { console.error(`[Dungeon] Cannot read save ${file}: ${error.message}`); return null; }
  }).filter(Boolean).sort((a, b) => String(b.savedAt || b.createdAt).localeCompare(String(a.savedAt || a.createdAt)));
}
function loadState(dungeonId, guildId, access = {}) {
  const target = savePath(dungeonId, guildId);
  if (!target) return null;
  if (get(guildId)) throw new Error('End the active dungeon before loading a save.');
  const data = readJson(target, null);
  if (!data) return null;
  if (!validSave(data, guildId, dungeonId)) throw new Error('This dungeon save is invalid; it has not been changed.');
  if (access.userId && access.userId !== data.leaderId && !access.isAdmin) throw new Error('Only the saved dungeon leader or an administrator can load it.');
  data.revealed = new Set(data.revealed);
  data.revealedByFloor = Object.fromEntries(Object.entries(data.revealedByFloor || {}).map(([key, cells]) => [key, new Set(cells)]));
  data.uiToken = randomUUID().slice(0, 12);
  data.messageId = null;
  data.channelId = null;
  data.completed = !!data.completed;
  // Legacy versions allowed a leader to leave without transferring leadership.
  if (!data.players.includes(data.leaderId)) data.leaderId = data.players[0];
  if (access.isAdmin && access.userId && !data.players.includes(access.userId)) {
    data.players = [access.userId, ...data.players].slice(0, MAX_PLAYERS);
    data.leaderId = access.userId;
  }
  activeDungeons.set(guildId, data);
  return data;
}
module.exports = { create, get, remove, addPlayer, removePlayer, move, inspect, renderCurrent, saveState, listSaved, loadState, MAX_PLAYERS };
