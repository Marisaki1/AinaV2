const { CELL, CELL_EMOJI } = require('../../config/constants');
const config = require('../../config/config');
const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
function shuffle(values, random) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
function generateFloor(width, height, difficultyKey, complexityKey, random) {
  if (![width, height].every(value => Number.isInteger(value) && value >= 5 && value <= 51)) throw new Error('Dungeon dimensions must be integers from 5 to 51.');
  const difficulty = config.dungeon.difficulty[difficultyKey];
  const complexity = config.dungeon.complexity[complexityKey];
  const grid = Array.from({ length: height }, () => Array(width).fill(CELL.WALL));
  const inside = (r, c) => r >= 1 && r < height - 1 && c >= 1 && c < width - 1;
  const stack = [{ row: 1, col: 1, direction: null }];
  grid[1][1] = CELL.PATH;
  // Iterative DFS avoids recursion limits. Branch factor controls how often a
  // corridor turns; the dead-end target controls how much the maze is braided.
  while (stack.length) {
    const current = stack[stack.length - 1];
    const directions = DIRECTIONS.filter(([dr, dc]) => inside(current.row + dr * 2, current.col + dc * 2) && grid[current.row + dr * 2][current.col + dc * 2] === CELL.WALL);
    if (!directions.length) { stack.pop(); continue; }
    const straight = current.direction && directions.find(([dr, dc]) => dr === current.direction[0] && dc === current.direction[1]);
    const direction = straight && random() > complexity.branchFactor ? straight : directions[Math.floor(random() * directions.length)];
    const [dr, dc] = direction;
    const row = current.row + dr * 2;
    const col = current.col + dc * 2;
    grid[current.row + dr][current.col + dc] = CELL.PATH;
    grid[row][col] = CELL.PATH;
    stack.push({ row, col, direction });
  }
  const neighbors = (r, c) => DIRECTIONS.filter(([dr, dc]) => inside(r + dr, c + dc) && grid[r + dr][c + dc] !== CELL.WALL).length;
  const deadEnds = [];
  for (let r = 1; r < height - 1; r += 2) for (let c = 1; c < width - 1; c += 2) if (neighbors(r, c) === 1) deadEnds.push([r, c]);
  let remaining = deadEnds.length;
  for (const [r, c] of shuffle(deadEnds, random)) {
    if (remaining <= complexity.deadEnds) break;
    if (neighbors(r, c) !== 1) continue;
    const choices = DIRECTIONS.filter(([dr, dc]) => inside(r + dr * 2, c + dc * 2) && grid[r + dr][c + dc] === CELL.WALL && grid[r + dr * 2][c + dc * 2] === CELL.PATH);
    if (!choices.length) continue;
    const [dr, dc] = choices[Math.floor(random() * choices.length)];
    remaining -= neighbors(r + dr * 2, c + dc * 2) === 1 ? 2 : 1;
    grid[r + dr][c + dc] = CELL.PATH;
  }
  // Even-sized maps have an even goal coordinate, outside the odd DFS lattice.
  // Connect that goal to the last carved cell instead of creating an isolated exit.
  const endRow = height - 2;
  const endCol = width - 2;
  const lastOddRow = endRow % 2 ? endRow : endRow - 1;
  const lastOddCol = endCol % 2 ? endCol : endCol - 1;
  for (let r = lastOddRow; r <= endRow; r++) grid[r][lastOddCol] = CELL.PATH;
  for (let c = lastOddCol; c <= endCol; c++) grid[endRow][c] = CELL.PATH;
  grid[1][1] = CELL.START;
  grid[endRow][endCol] = CELL.END;
  for (let r = 1; r < height - 1; r++) for (let c = 1; c < width - 1; c++) {
    if (grid[r][c] !== CELL.PATH) continue;
    const roll = random();
    if (roll < difficulty.trapChance) grid[r][c] = CELL.TRAP;
    else if (roll < difficulty.trapChance + difficulty.enemyChance) grid[r][c] = CELL.ENEMY;
    else if (roll < difficulty.trapChance + difficulty.enemyChance + difficulty.chestChance) grid[r][c] = CELL.CHEST;
  }
  return grid;
}
function generateDungeon(options = {}, random = Math.random) {
  const keys = { sizeKey: options.sizeKey ?? 'MEDIUM', complexityKey: options.complexityKey ?? 'NORMAL', floorsKey: options.floorsKey ?? 'SMALL', difficultyKey: options.difficultyKey ?? 'NORMAL' };
  for (const [key, table] of [['sizeKey', 'sizes'], ['complexityKey', 'complexity'], ['floorsKey', 'floors'], ['difficultyKey', 'difficulty']]) {
    if (!Object.hasOwn(config.dungeon[table], keys[key])) throw new Error(`Invalid dungeon ${table} choice.`);
  }
  const size = config.dungeon.sizes[keys.sizeKey];
  const floorConfig = config.dungeon.floors[keys.floorsKey];
  if (![floorConfig.min, floorConfig.max].every(n => Number.isInteger(n) && n >= 1 && n <= 100) || floorConfig.max < floorConfig.min) throw new Error('Dungeon floor range must be between 1 and 100.');
  const numFloors = Math.floor(random() * (floorConfig.max - floorConfig.min + 1)) + floorConfig.min;
  const floors = Array.from({ length: numFloors }, (_, index) => {
    const floor = generateFloor(size.width, size.height, keys.difficultyKey, keys.complexityKey, random);
    if (index > 0) floor[1][1] = CELL.STAIRS_UP;
    if (index < numFloors - 1) floor[size.height - 2][size.width - 2] = CELL.STAIRS_DOWN;
    return floor;
  });
  return { floors, numFloors, width: size.width, height: size.height, ...keys };
}
function renderFloor(grid, playerPos, revealed = new Set(), radius = config.dungeon.visibilityRadius) {
  const { row: pr, col: pc } = playerPos;
  const height = grid.length;
  const width = grid[0].length;
  const visibleRadius = Number.isFinite(radius) ? Math.max(0, Math.min(Math.floor(radius), Math.max(width, height))) : 2;
  const newRevealed = new Set(revealed);
  for (let r = Math.max(0, pr - visibleRadius); r <= Math.min(height - 1, pr + visibleRadius); r++) {
    for (let c = Math.max(0, pc - visibleRadius); c <= Math.min(width - 1, pc + visibleRadius); c++) newRevealed.add(`${r},${c}`);
  }
  const lines = grid.map((row, r) => row.map((cell, c) => r === pr && c === pc ? CELL_EMOJI.PLAYER : newRevealed.has(`${r},${c}`) ? CELL_EMOJI[cell] ?? CELL_EMOJI[CELL.PATH] : CELL_EMOJI[CELL.FOG]).join(''));
  return { map: lines.join('\n'), revealed: newRevealed };
}
module.exports = { generateDungeon, renderFloor };
