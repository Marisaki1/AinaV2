const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config/config');
const { CELL, DUNGEON_BUTTONS } = require('../config/constants');
const { generateDungeon, renderFloor } = require('../src/utils/mapGenerator');
const manager = require('../src/utils/dungeonManager');
const cog = require('../src/cogs/dungeon');
let directory;
const originalSaves = config.dungeon.savesDir;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-dungeon-test-'));
  config.dungeon.savesDir = path.join(directory, 'saves');
});
afterEach(() => {
  for (const id of ['100', '101', '1000']) manager.remove(id);
  config.dungeon.savesDir = originalSaves;
  assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
  fs.rmSync(directory, { recursive: true, force: true });
});
function random(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function reachable(grid) {
  const seen = new Set(['1,1']);
  const queue = [[1, 1]];
  for (let i = 0; i < queue.length; i++) {
    const [row, col] = queue[i];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = row + dr; const nc = col + dc;
      if (!grid[nr] || grid[nr][nc] == null || grid[nr][nc] === CELL.WALL || seen.has(`${nr},${nc}`)) continue;
      seen.add(`${nr},${nc}`); queue.push([nr, nc]);
    }
  }
  return seen;
}
function state() {
  const current = manager.create('100', { sizeKey: 'SMALL', floorsKey: 'SMALL', name: 'Test maze' }, '300');
  current.messageId = '500'; current.channelId = '200';
  cog.buildDungeonMessage(current, manager.renderCurrent('100'));
  return current;
}
function button(current, action, user = '300', extra = {}) {
  return {
    customId: `${action}:${current.uiToken}`, user: { id: user }, guild: { id: '100' }, channelId: '200', message: { id: '500' },
    memberPermissions: { has: () => false }, replies: [], edits: [],
    async reply(payload) { this.replies.push(payload); },
    async followUp(payload) { this.replies.push(payload); },
    async deferUpdate() { this.deferred = true; },
    async editReply(payload) { this.edits.push(payload); },
    ...extra,
  };
}
test('all configured map sizes and complexities have reachable exits, connected paths, and intact borders', () => {
  for (const sizeKey of ['SMALL', 'MEDIUM', 'LARGE']) {
    for (const complexityKey of ['EASY', 'NORMAL', 'HARD']) {
      for (let seed = 1; seed <= 25; seed++) {
        const dungeon = generateDungeon({ sizeKey, complexityKey, floorsKey: 'SMALL' }, random(seed));
        for (const floor of dungeon.floors) {
          const seen = reachable(floor);
          assert.ok(seen.has(`${dungeon.height - 2},${dungeon.width - 2}`), `${sizeKey}/${complexityKey}/${seed} exit must be connected`);
          for (let row = 0; row < dungeon.height; row++) for (let col = 0; col < dungeon.width; col++) {
            if (row === 0 || col === 0 || row === dungeon.height - 1 || col === dungeon.width - 1) assert.equal(floor[row][col], CELL.WALL);
            else if (floor[row][col] !== CELL.WALL) assert.ok(seen.has(`${row},${col}`));
          }
        }
      }
    }
  }
});
test('complexity affects generation and multi-floor maps include both stair directions', () => {
  const easy = generateDungeon({ complexityKey: 'EASY', floorsKey: 'MEDIUM' }, random(71));
  const hard = generateDungeon({ complexityKey: 'HARD', floorsKey: 'MEDIUM' }, random(71));
  assert.notDeepEqual(easy.floors, hard.floors);
  easy.floors.forEach((floor, index) => {
    assert.equal(floor[1][1], index === 0 ? CELL.START : CELL.STAIRS_UP);
    assert.equal(floor[easy.height - 2][easy.width - 2], index === easy.numFloors - 1 ? CELL.END : CELL.STAIRS_DOWN);
  });
  assert.throws(() => generateDungeon({ sizeKey: '../bad' }), /Invalid/);
});
test('fog reveals only the visibility square and preserves previous exploration', () => {
  const floor = Array.from({ length: 7 }, () => Array(7).fill(CELL.PATH));
  const initial = new Set(['6,6']);
  const rendered = renderFloor(floor, { row: 1, col: 1 }, initial, 1);
  assert.equal(rendered.revealed.size, 10);
  assert.equal(initial.size, 1);
  assert.ok(rendered.revealed.has('6,6'));
  assert.ok(!rendered.revealed.has('4,4'));
});
test('stairs round-trip to the correct floor and retain fog for each floor', () => {
  const current = state();
  const width = 5; const height = 5;
  const floor = () => [[0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 1, 1, 1, 0], [0, 1, 1, 1, 0], [0, 0, 0, 0, 0]];
  current.dungeon = { floors: [floor(), floor()], width, height, numFloors: 2 };
  current.dungeon.floors[0][3][3] = CELL.STAIRS_DOWN;
  current.dungeon.floors[1][1][1] = CELL.STAIRS_UP;
  current.playerPos = { row: 3, col: 2 };
  current.revealed = new Set(['0,0']);
  const down = manager.move('100', 0, 1);
  assert.equal(down.newFloor, true);
  assert.equal(current.currentFloor, 1);
  assert.deepEqual(current.playerPos, { row: 1, col: 1 });
  manager.move('100', 0, 1);
  const up = manager.move('100', 0, -1);
  assert.equal(up.newFloor, true);
  assert.equal(current.currentFloor, 0);
  assert.deepEqual(current.playerPos, { row: 3, col: 3 });
  assert.ok(current.revealed.has('0,0'));
  assert.ok(current.revealedByFloor[1].size > 0);
});
test('movement rejects jumps and walls, triggers chests once, and completes once', () => {
  const current = state();
  const floor = current.dungeon.floors[0];
  floor[1][2] = CELL.CHEST;
  assert.deepEqual(manager.move('100', 2, 0), { moved: false });
  assert.deepEqual(manager.move('100', -1, 0), { moved: false });
  assert.equal(current.steps, 0);
  assert.equal(manager.move('100', 0, 1).event.type, 'chest');
  assert.equal(floor[1][2], CELL.PATH);
  manager.move('100', 0, -1);
  assert.equal(manager.move('100', 0, 1).event, null);
  current.dungeon.floors = [floor]; current.dungeon.numFloors = 1;
  floor[1][3] = CELL.END;
  assert.equal(manager.move('100', 0, 1).won, true);
  assert.deepEqual(manager.move('100', 0, -1), { moved: false });
});
test('party removal transfers leadership and enforces membership limits', () => {
  const current = state();
  assert.equal(manager.removePlayer('100', 'unknown'), false);
  manager.addPlayer('100', '301');
  manager.removePlayer('100', '300');
  assert.equal(current.leaderId, '301');
  for (let i = 0; i < manager.MAX_PLAYERS - 1; i++) assert.equal(manager.addPlayer('100', `${400 + i}`), true);
  assert.equal(manager.addPlayer('100', '999'), false);
  assert.equal(manager.addPlayer('100', '301'), false);
});
test('save/load preserves progress, unknown data, per-floor fog, and records actual save time', () => {
  const current = state();
  current.customMetadata = { campaign: 'Keep me' };
  current.revealedByFloor[1] = new Set(['1,1', '1,2']);
  const id = manager.saveState('100');
  const originalToken = current.uiToken;
  assert.ok(current.savedAt);
  manager.remove('100');
  const loaded = manager.loadState(id, '100', { userId: '300' });
  assert.deepEqual(loaded.customMetadata, { campaign: 'Keep me' });
  assert.deepEqual([...loaded.revealedByFloor[1]], ['1,1', '1,2']);
  assert.ok(loaded.revealed instanceof Set);
  assert.notEqual(loaded.uiToken, originalToken);
  assert.equal(loaded.messageId, null);
  assert.equal(manager.listSaved('100')[0].id, id);
});
test('save loading blocks traversal, server-prefix collisions, unauthorized users, and active game replacement', () => {
  const current = state();
  const id = manager.saveState('100');
  assert.throws(() => manager.loadState(id, '100'), /End the active/);
  manager.remove('100');
  assert.equal(manager.loadState('../outside', '100'), null);
  assert.equal(manager.loadState(id, '101'), null);
  assert.equal(manager.listSaved('10').length, 0);
  assert.throws(() => manager.loadState(id, '100', { userId: '400' }), /leader or an administrator/);
  assert.equal(manager.get('100'), null);
  const loaded = manager.loadState(id, '100', { userId: '400', isAdmin: true });
  assert.equal(loaded.leaderId, '400');
  assert.ok(loaded.players.includes('400'));
});
test('corrupt or malformed saves fail without overwriting source bytes or activating state', () => {
  const current = state();
  const id = manager.saveState('100');
  manager.remove('100');
  const file = path.join(config.dungeon.savesDir, `${id}.json`);
  fs.writeFileSync(file, '{ broken');
  assert.throws(() => manager.loadState(id, '100'), /Cannot read JSON/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{ broken');
  fs.writeFileSync(file, JSON.stringify({ id, guildId: '100', dungeon: {} }));
  assert.throws(() => manager.loadState(id, '100'), /save is invalid/);
  assert.equal(manager.get('100'), null);
});
test('old maps, replacement-game tokens and expired controls cannot move the current party', async () => {
  const current = state();
  const stale = button(current, DUNGEON_BUTTONS.RIGHT, '300', { message: { id: 'old' } });
  await cog.handleButton(stale);
  assert.match(stale.replies[0].embeds[0].data.title, /Old Dungeon Controls/);
  const replacement = button(current, DUNGEON_BUTTONS.RIGHT, '300', { customId: `${DUNGEON_BUTTONS.RIGHT}:old-token` });
  await cog.handleButton(replacement);
  assert.match(replacement.replies[0].embeds[0].data.title, /Old Dungeon Controls/);
  current.controlsAt = Date.now() - config.dungeon.buttonTimeout - 1;
  const expired = button(current, DUNGEON_BUTTONS.RIGHT);
  await cog.handleButton(expired);
  assert.match(expired.replies[0].embeds[0].data.title, /Controls Expired/);
  assert.equal(current.steps, 0);
});
test('only party members move and only leader/admin may flee', async () => {
  const current = state();
  const stranger = button(current, DUNGEON_BUTTONS.RIGHT, '400');
  await cog.handleButton(stranger);
  assert.match(stranger.replies[0].embeds[0].data.title, /Not In Party/);
  manager.addPlayer('100', '400');
  const member = button(current, DUNGEON_BUTTONS.QUIT, '400');
  await cog.handleButton(member);
  assert.match(member.replies[0].embeds[0].data.title, /Not Authorised/);
  assert.equal(manager.get('100'), current);
  const leader = button(current, DUNGEON_BUTTONS.QUIT);
  await cog.handleButton(leader);
  assert.equal(manager.get('100'), null);
  assert.equal(leader.edits[0].components.length, 0);
});
test('button moves serialize while Discord is acknowledging a previous move', async () => {
  const current = state();
  current.dungeon.floors[0][1][2] = CELL.PATH;
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const first = button(current, DUNGEON_BUTTONS.RIGHT, '300', { async deferUpdate() { entered(); await pending; } });
  const active = cog.handleButton(first);
  await started;
  const second = button(current, DUNGEON_BUTTONS.RIGHT);
  await cog.handleButton(second);
  assert.match(second.replies[0].embeds[0].data.title, /Move In Progress/);
  release(); await active;
  assert.equal(current.steps, 1);
});
test('a player leaving while a button acknowledges cannot still move the party', async () => {
  const current = state();
  manager.addPlayer('100', '400');
  const request = button(current, DUNGEON_BUTTONS.RIGHT, '300', {
    async deferUpdate() { manager.removePlayer('100', '300'); },
  });
  await cog.handleButton(request);
  assert.equal(current.steps, 0);
  assert.match(request.replies[0].content, /party changed/);
});
test('an administrator outside the party can flee through the current controls', async () => {
  const current = state();
  const request = button(current, DUNGEON_BUTTONS.QUIT, '400', {
    memberPermissions: { has: permission => permission === PermissionFlagsBits.Administrator },
  });
  await cog.handleButton(request);
  assert.equal(manager.get('100'), null);
});
test('inspect is truthful about exploration limits and map payloads fit Discord limits', async () => {
  const current = state();
  current.dungeon.floors[0][1][1] = CELL.ENEMY;
  const inspect = button(current, DUNGEON_BUTTONS.INTERACT);
  await cog.handleButton(inspect);
  const output = inspect.edits[0].embeds[0].toJSON();
  assert.match(output.fields.at(-1).value, /not tracked/);
  assert.equal(current.steps, 0);
  assert.ok(output.description.length <= 4096);
  const huge = cog.buildDungeonMessage(current, { ...manager.renderCurrent('100'), map: 'x'.repeat(5000) });
  assert.equal(huge.files.length, 1);
  assert.ok(huge.embeds[0].data.description.length < 4096);
  assert.equal(cog.commands[0].data.toJSON().dm_permission, false);
});
