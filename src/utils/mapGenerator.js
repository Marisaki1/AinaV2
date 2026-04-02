const { CELL, CELL_EMOJI } = require('../../config/constants');
const config = require('../../config/config');

/** Generate a dungeon floor using recursive backtracking maze algorithm */
function generateFloor(width, height, difficultyKey = 'NORMAL') {
  const diff = config.dungeon.difficulty[difficultyKey] ?? config.dungeon.difficulty.NORMAL;

  // Initialize all cells as walls
  const grid = Array.from({ length: height }, () => Array(width).fill(CELL.WALL));

  // Maze generation — carve paths using DFS
  // Work on odd cells so walls separate paths properly
  const visited = Array.from({ length: height }, () => Array(width).fill(false));

  function inBounds(r, c) {
    return r >= 1 && r < height - 1 && c >= 1 && c < width - 1;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function carve(r, c) {
    visited[r][c] = true;
    grid[r][c] = CELL.PATH;

    const dirs = shuffle([[-1, 0], [1, 0], [0, -1], [0, 1]]);
    for (const [dr, dc] of dirs) {
      const nr = r + dr * 2;
      const nc = c + dc * 2;
      if (inBounds(nr, nc) && !visited[nr][nc]) {
        // Remove wall between current and next
        grid[r + dr][c + dc] = CELL.PATH;
        carve(nr, nc);
      }
    }
  }

  // Start carving from (1,1)
  carve(1, 1);

  // Set start and end
  grid[1][1] = CELL.START;
  grid[height - 2][width - 2] = CELL.END;

  // Scatter elements on open PATH cells (not start/end)
  const pathCells = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === CELL.PATH) pathCells.push([r, c]);
    }
  }

  for (const [r, c] of pathCells) {
    const roll = Math.random();
    if      (roll < diff.trapChance)                           grid[r][c] = CELL.TRAP;
    else if (roll < diff.trapChance + diff.enemyChance)        grid[r][c] = CELL.ENEMY;
    else if (roll < diff.trapChance + diff.enemyChance + diff.chestChance) grid[r][c] = CELL.CHEST;
  }

  return grid;
}

/** Build a multi-floor dungeon */
function generateDungeon(options = {}) {
  const {
    sizeKey       = 'MEDIUM',
    complexityKey = 'NORMAL',
    floorsKey     = 'SMALL',
    difficultyKey = 'NORMAL',
  } = options;

  const size    = config.dungeon.sizes[sizeKey]    ?? config.dungeon.sizes.MEDIUM;
  const floorCfg = config.dungeon.floors[floorsKey] ?? config.dungeon.floors.SMALL;
  const numFloors = Math.floor(
    Math.random() * (floorCfg.max - floorCfg.min + 1) + floorCfg.min
  );

  const floors = [];
  for (let f = 0; f < numFloors; f++) {
    const floor = generateFloor(size.width, size.height, difficultyKey);

    // Add stairs (except on last floor)
    if (f < numFloors - 1) {
      // Place STAIRS_DOWN near the end cell
      floor[size.height - 2][size.width - 2] = CELL.STAIRS_DOWN;
    }

    floors.push(floor);
  }

  return {
    floors,
    numFloors,
    width:  size.width,
    height: size.height,
    sizeKey,
    complexityKey,
    floorsKey,
    difficultyKey,
  };
}

/**
 * Render the current floor as a string of emojis with fog of war.
 * @param {number[][]} grid - 2D cell array
 * @param {{row, col}} playerPos
 * @param {Set<string>} revealed - Set of "row,col" strings already revealed
 * @param {number} radius - visibility radius
 * @returns {{ map: string, revealed: Set<string> }}
 */
function renderFloor(grid, playerPos, revealed, radius = config.dungeon.visibilityRadius) {
  const { row: pr, col: pc } = playerPos;
  const height = grid.length;
  const width  = grid[0].length;

  // Mark newly visible cells
  const newRevealed = new Set(revealed);
  for (let r = pr - radius; r <= pr + radius; r++) {
    for (let c = pc - radius; c <= pc + radius; c++) {
      if (r >= 0 && r < height && c >= 0 && c < width) {
        newRevealed.add(`${r},${c}`);
      }
    }
  }

  let lines = [];
  for (let r = 0; r < height; r++) {
    let row = '';
    for (let c = 0; c < width; c++) {
      if (r === pr && c === pc) {
        row += CELL_EMOJI.PLAYER;
      } else if (newRevealed.has(`${r},${c}`)) {
        row += CELL_EMOJI[grid[r][c]] ?? CELL_EMOJI[CELL.PATH];
      } else {
        row += CELL_EMOJI[CELL.FOG];
      }
    }
    lines.push(row);
  }

  return { map: lines.join('\n'), revealed: newRevealed };
}

module.exports = { generateDungeon, renderFloor };
