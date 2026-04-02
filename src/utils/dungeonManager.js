const fs = require('fs');
const path = require('path');
const { generateDungeon, renderFloor } = require('./mapGenerator');
const { CELL } = require('../../config/constants');
const config = require('../../config/config');

// Active dungeons in memory: Map<guildId, DungeonState>
const activeDungeons = new Map();

function saveDir() {
  const d = config.dungeon.savesDir;
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Create a new dungeon for a guild */
function create(guildId, options = {}, leaderId) {
  const dungeon = generateDungeon(options);
  const startPos = { row: 1, col: 1 };

  const state = {
    id: `${guildId}_${Date.now()}`,
    guildId,
    leaderId,
    name: options.name || `${options.sizeKey || 'MEDIUM'} Dungeon`,
    options,
    dungeon,
    currentFloor: 0,
    playerPos: startPos,
    revealed: new Set(),  // Revealed cells for current floor
    revealedByFloor: {},  // Persisted revealed sets per floor index
    players: [leaderId],
    messageId: null,      // The Discord message showing the map
    channelId: null,
    createdAt: new Date().toISOString(),
    steps: 0,
    events: [],           // Log of events (chests opened, traps hit, etc.)
  };

  activeDungeons.set(guildId, state);
  return state;
}

function get(guildId) {
  return activeDungeons.get(guildId) ?? null;
}

function remove(guildId) {
  activeDungeons.delete(guildId);
}

function addPlayer(guildId, userId) {
  const s = get(guildId);
  if (!s || s.players.includes(userId)) return false;
  s.players.push(userId);
  return true;
}

function removePlayer(guildId, userId) {
  const s = get(guildId);
  if (!s) return false;
  s.players = s.players.filter(id => id !== userId);
  return true;
}

/**
 * Attempt to move the player. Returns { moved, event, won, newFloor }
 */
function move(guildId, dr, dc) {
  const s = get(guildId);
  if (!s) return { moved: false };

  const floor = s.dungeon.floors[s.currentFloor];
  const { row, col } = s.playerPos;
  const nr = row + dr;
  const nc = col + dc;

  // Bounds check
  if (nr < 0 || nr >= s.dungeon.height || nc < 0 || nc >= s.dungeon.width) {
    return { moved: false };
  }

  const cell = floor[nr][nc];

  // Can't walk into walls
  if (cell === CELL.WALL) return { moved: false };

  // Move the player
  s.playerPos = { row: nr, col: nc };
  s.steps++;

  // Update revealed cells
  const { revealed } = renderFloor(floor, s.playerPos, s.revealed);
  s.revealed = revealed;

  let event = null;
  let won = false;
  let newFloor = false;

  // Handle landing on special cells
  switch (cell) {
    case CELL.TRAP:
      event = { type: 'trap', msg: '⚠️ You stepped on a trap! Watch your step!' };
      floor[nr][nc] = CELL.PATH; // Trap is used up
      break;
    case CELL.ENEMY:
      event = { type: 'enemy', msg: '👹 An enemy lurks here! Engage or retreat!' };
      // Enemy stays until explicitly defeated (future improvement: combat system)
      break;
    case CELL.CHEST:
      event = { type: 'chest', msg: '🎁 You found a chest! Something shiny is inside~' };
      floor[nr][nc] = CELL.PATH; // Chest opened
      break;
    case CELL.END:
      if (s.currentFloor === s.dungeon.numFloors - 1) {
        won = true;
        event = { type: 'won', msg: '🏆 You reached the final goal! The dungeon is cleared!' };
      }
      break;
    case CELL.STAIRS_DOWN:
      // Go to next floor
      s.revealedByFloor[s.currentFloor] = s.revealed;
      s.currentFloor++;
      s.playerPos = { row: 1, col: 1 };
      s.revealed = s.revealedByFloor[s.currentFloor] ?? new Set();
      // Reveal around new position
      const { revealed: newRev } = renderFloor(
        s.dungeon.floors[s.currentFloor], s.playerPos, s.revealed
      );
      s.revealed = newRev;
      newFloor = true;
      event = { type: 'stairs', msg: `⬇️ Descending to floor ${s.currentFloor + 1}...` };
      break;
    case CELL.STAIRS_UP:
      if (s.currentFloor > 0) {
        s.revealedByFloor[s.currentFloor] = s.revealed;
        s.currentFloor--;
        s.playerPos = { row: s.dungeon.height - 2, col: s.dungeon.width - 2 };
        s.revealed = s.revealedByFloor[s.currentFloor] ?? new Set();
        newFloor = true;
        event = { type: 'stairs', msg: `⬆️ Ascending to floor ${s.currentFloor + 1}...` };
      }
      break;
  }

  if (event) s.events.push({ ...event, step: s.steps });

  return { moved: true, event, won, newFloor };
}

/** Render the current state of the dungeon as a map string */
function renderCurrent(guildId) {
  const s = get(guildId);
  if (!s) return null;
  const floor = s.dungeon.floors[s.currentFloor];
  const { map, revealed } = renderFloor(floor, s.playerPos, s.revealed);
  s.revealed = revealed;
  return {
    map,
    floorNum: s.currentFloor + 1,
    totalFloors: s.dungeon.numFloors,
    steps: s.steps,
    players: s.players,
    lastEvent: s.events[s.events.length - 1] ?? null,
  };
}

/** Save dungeon state to disk */
function saveState(guildId) {
  const s = get(guildId);
  if (!s) return;
  const data = {
    ...s,
    revealed: [...s.revealed],
    revealedByFloor: Object.fromEntries(
      Object.entries(s.revealedByFloor).map(([k, v]) => [k, [...v]])
    ),
  };
  const fp = path.join(saveDir(), `${s.id}.json`);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2));
  return s.id;
}

/** List all saved dungeons for a guild */
function listSaved(guildId) {
  const dir = saveDir();
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(guildId) && f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean);
}

/** Load a saved dungeon back into memory */
function loadState(dungeonId, guildId) {
  const fp = path.join(saveDir(), `${dungeonId}.json`);
  if (!fs.existsSync(fp)) return null;
  const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  data.revealed = new Set(data.revealed);
  data.revealedByFloor = Object.fromEntries(
    Object.entries(data.revealedByFloor).map(([k, v]) => [k, new Set(v)])
  );
  activeDungeons.set(guildId, data);
  return data;
}

module.exports = {
  create, get, remove,
  addPlayer, removePlayer,
  move, renderCurrent,
  saveState, listSaved, loadState,
};
