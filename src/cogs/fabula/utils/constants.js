// ── Dice ─────────────────────────────────────────────────────────────
const DICE_VALUES = ['d6', 'd8', 'd10', 'd12'];
const DICE_ORDER  = ['d6', 'd8', 'd10', 'd12']; // ascending power

// ── Attribute Arrays ─────────────────────────────────────────────────
const ATTRIBUTE_ARRAYS = {
  JACK: {
    label:       'Jack of All Trades',
    description: 'd8 • d8 • d8 • d8',
    fixed:       { MIG: 'd8', DEX: 'd8', INS: 'd8', WLP: 'd8' },
  },
  STANDARD: {
    label:       'Standard',
    description: 'd10 • d8 • d8 • d6',
    pool:        ['d10', 'd8', 'd8', 'd6'],
  },
  SPECIALIZED: {
    label:       'Specialized',
    description: 'd10 • d10 • d6 • d6',
    pool:        ['d10', 'd10', 'd6', 'd6'],
  },
};

// ── Status Effects ────────────────────────────────────────────────────
// Descriptions updated to reflect die-reduction mechanics.
const STATUS_EFFECTS = [
  { name: 'Slow',        emoji: '🐢', description: 'Temporarily reduces your Dexterity die size by one.' },
  { name: 'Dazed',       emoji: '😵', description: 'Temporarily reduces your Insight die size by one.' },
  { name: 'Weak',        emoji: '💔', description: 'Temporarily reduces your Might die size by one.' },
  { name: 'Shaken',      emoji: '😰', description: 'Temporarily reduces your Willpower die size by one.' },
  { name: 'Enraged',     emoji: '😡', description: 'Temporarily reduces your Dexterity and Insight die sizes by one.' },
  { name: 'Poisoned',    emoji: '☠️',  description: 'Temporarily reduces your Might and Willpower die sizes by one.' },
  { name: 'Burning',     emoji: '🔥', description: 'Suffer 5 fire damage at the start of each turn.' },
  { name: 'Frozen',      emoji: '❄️',  description: 'Speed becomes 0; physical damage taken is increased.' },
  { name: 'Confused',    emoji: '🌀', description: 'Cannot distinguish friend from foe.' },
  { name: 'Provoked',    emoji: '👊', description: 'Must target the provoker with all attacks.' },
  { name: 'Unconscious', emoji: '💤', description: 'Cannot take actions or reactions.' },
];

const STATUS_NAMES = STATUS_EFFECTS.map(s => s.name);

// ── Status Die Reductions ─────────────────────────────────────────────
// Maps status name → { ATTR: stepsDown }.  Minimum die is always d6.
const STATUS_DIE_REDUCTIONS = {
  Dazed:    { INS: 1 },
  Enraged:  { DEX: 1, INS: 1 },
  Poisoned: { MIG: 1, WLP: 1 },
  Shaken:   { WLP: 1 },
  Slow:     { DEX: 1 },
  Weak:     { MIG: 1 },
};

// ── Attribute → Stat Reduction per die-step-down ──────────────────────
// When an attribute die is reduced one step (e.g. d8→d6), the listed
// field is reduced by `amount`.
//   MIG → hp.max  −10
//   WLP → mp.max  −10
//   DEX → def     −2
//   INS → mdef    −2
const ATTR_STAT_REDUCTION = {
  MIG: { field: 'hpMax',  amount: 10 },
  WLP: { field: 'mpMax',  amount: 10 },
  DEX: { field: 'def',    amount: 2  },
  INS: { field: 'mdef',   amount: 2  },
};

// ── Bond Feelings (paired opposites) ─────────────────────────────────
const BOND_FEELING_PAIRS = [
  ['Admiration', 'Inferiority'],
  ['Affection',  'Hatred'],
  ['Loyalty',    'Mistrust'],
];
const ALL_BOND_FEELINGS = BOND_FEELING_PAIRS.flat();

// ── Damage Types ──────────────────────────────────────────────────────
const DAMAGE_TYPES = [
  'Physical', 'Air', 'Bolt', 'Dark',
  'Earth', 'Fire', 'Ice', 'Light', 'Poison',
];

// ── Weapon Categories ─────────────────────────────────────────────────
const WEAPON_CATEGORIES = [
  'Arcane', 'Bow', 'Brawling', 'Dagger',
  'Firearm', 'Flail', 'Heavy', 'Spear', 'Sword', 'Thrown',
];

// ── Default Character Template ────────────────────────────────────────
const DEFAULT_CHARACTER = {
  name:       'Unknown Hero',
  imageUrl:   null,
  pronouns:   'They/Them',
  identity:   '',   // formerly "theme / background" — renamed to Identity
  theme:      '',   // formerly "origin" — renamed to Theme
  level:      1,    // recalculated from class levels after first class is added
  exp:        0,
  attributes: { MIG: 'd8', DEX: 'd8', INS: 'd8', WLP: 'd8' },
  hp:         { current: 0, max: 0 },
  mp:         { current: 0, max: 0 },
  ip:         { current: 0, max: 0 },
  def:        0,
  mdef:       0,
  initiative: 'd6+0',
  fabulaPoints: 3,
  zenit:      0,
  classes:    [],
  bonds:      [],
  traits:     [],
  quirks:     '',
  equipment: {
    mainhand:    null,
    offhand:     null,
    armor:       null,
    shield:      null,
    accessories: [],
    items:       [],
  },
  spells:    [],
  abilities: [],
  statuses:  [],
};

module.exports = {
  DICE_VALUES, DICE_ORDER, ATTRIBUTE_ARRAYS,
  STATUS_EFFECTS, STATUS_NAMES,
  STATUS_DIE_REDUCTIONS, ATTR_STAT_REDUCTION,
  BOND_FEELING_PAIRS, ALL_BOND_FEELINGS,
  DAMAGE_TYPES, WEAPON_CATEGORIES,
  DEFAULT_CHARACTER,
};