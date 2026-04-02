// Cell types for the dungeon grid
const CELL = {
  WALL:        0,
  PATH:        1,
  START:       2,
  END:         3,
  STAIRS_UP:   4,
  STAIRS_DOWN: 5,
  CHEST:       6,
  TRAP:        7,
  ENEMY:       8,
  FOG:         9,
};

// Emoji representations for dungeon cells
const CELL_EMOJI = {
  [CELL.WALL]:        '🧱',
  [CELL.PATH]:        '⬜',
  [CELL.START]:       '🏠',
  [CELL.END]:         '🏆',
  [CELL.STAIRS_UP]:   '⬆️',
  [CELL.STAIRS_DOWN]: '⬇️',
  [CELL.CHEST]:       '🎁',
  [CELL.TRAP]:        '⚠️',
  [CELL.ENEMY]:       '👹',
  [CELL.FOG]:         '🌫️',
  PLAYER:             '🧙',
};

// Movement directions
const DIRECTION = {
  UP:    { dr: -1, dc: 0 },
  DOWN:  { dr:  1, dc: 0 },
  LEFT:  { dr:  0, dc: -1 },
  RIGHT: { dr:  0, dc:  1 },
};

// Button custom IDs for dungeon movement
const DUNGEON_BUTTONS = {
  UP:       'dungeon_up',
  DOWN:     'dungeon_down',
  LEFT:     'dungeon_left',
  RIGHT:    'dungeon_right',
  INTERACT: 'dungeon_interact',
  STATUS:   'dungeon_status',
  QUIT:     'dungeon_quit',
};

module.exports = { CELL, CELL_EMOJI, DIRECTION, DUNGEON_BUTTONS };
