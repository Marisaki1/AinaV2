// ── Dice ─────────────────────────────────────────────────────────────
const DICE_VALUES = ['d6', 'd8', 'd10', 'd12'];

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
const STATUS_EFFECTS = [
  { name: 'Slow',        emoji: '🐢', description: 'Cannot use reactions; −10 to Initiative.' },
  { name: 'Dazed',       emoji: '😵', description: 'Cannot use Spells or Skills.' },
  { name: 'Weak',        emoji: '💔', description: 'All damage dealt is halved (round down).' },
  { name: 'Shaken',      emoji: '😰', description: 'Cannot use the Guard action.' },
  { name: 'Enraged',     emoji: '😡', description: 'Must spend full turn attacking; cannot cast Spells.' },
  { name: 'Poisoned',    emoji: '☠️',  description: 'Lose 5 HP at the start of each of your turns.' },
  { name: 'Burning',     emoji: '🔥', description: 'Suffer 5 fire damage at the start of each turn.' },
  { name: 'Frozen',      emoji: '❄️',  description: 'Speed becomes 0; physical damage taken is increased.' },
  { name: 'Confused',    emoji: '🌀', description: 'Cannot distinguish friend from foe.' },
  { name: 'Provoked',    emoji: '👊', description: 'Must target the provoker with all attacks.' },
  { name: 'Unconscious', emoji: '💤', description: 'Cannot take actions or reactions.' },
];

const STATUS_NAMES = STATUS_EFFECTS.map(s => s.name);

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
  theme:      '',
  origin:     '',
  level:      1,
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
  DICE_VALUES, ATTRIBUTE_ARRAYS,
  STATUS_EFFECTS, STATUS_NAMES,
  BOND_FEELING_PAIRS, ALL_BOND_FEELINGS,
  DAMAGE_TYPES, WEAPON_CATEGORIES,
  DEFAULT_CHARACTER,
};
