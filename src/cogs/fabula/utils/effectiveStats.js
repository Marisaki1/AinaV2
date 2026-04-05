/**
 * effectiveStats.js
 *
 * Computes "effective" attribute dice and derived stats after applying
 * active status effects. The base character data is NEVER mutated —
 * these are display-only calculations.
 *
 * Die reduction order (minimum d6):  d12 → d10 → d8 → d6
 */

const { DICE_ORDER, STATUS_DIE_REDUCTIONS, ATTR_STAT_REDUCTION } = require('./constants');

// ── Core helpers ──────────────────────────────────────────────────────

/**
 * Reduce a die string by `steps` steps toward d6.
 * e.g. reduceDie('d10', 1) → 'd8'  |  reduceDie('d6', 5) → 'd6'
 */
function reduceDie(die, steps) {
  const idx = DICE_ORDER.indexOf(die);
  if (idx < 0) return die;                       // unknown die → unchanged
  return DICE_ORDER[Math.max(0, idx - steps)];   // clamp at d6
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Returns the effective attribute dice after all active status effects are
 * applied, plus a map of how many steps each attribute was reduced.
 *
 * @param {object} char  Full character data object
 * @returns {{ effective: object, steps: object }}
 */
function getEffectiveAttributes(char) {
  const steps = {}; // attrKey → total step reductions

  for (const status of (char.statuses ?? [])) {
    const reductions = STATUS_DIE_REDUCTIONS[status] ?? {};
    for (const [attr, n] of Object.entries(reductions)) {
      steps[attr] = (steps[attr] ?? 0) + n;
    }
  }

  const effective = { ...(char.attributes ?? {}) };
  for (const [attr, n] of Object.entries(steps)) {
    if (effective[attr]) effective[attr] = reduceDie(effective[attr], n);
  }

  return { effective, steps };
}

/**
 * Returns effective attributes PLUS the derived stat penalties caused by
 * die reductions (lower max HP/MP, reduced DEF/MDEF).
 *
 * Per step-down:
 *   MIG → max HP − 10
 *   WLP → max MP − 10
 *   DEX → DEF    −  2
 *   INS → MDEF   −  2
 *
 * @param {object} char  Full character data object
 * @returns {{ effective, steps, effectiveHpMax, effectiveMpMax, effectiveDef, effectiveMdef }}
 */
function getEffectiveStats(char) {
  const { effective, steps } = getEffectiveAttributes(char);

  let hpPenalty   = 0;
  let mpPenalty   = 0;
  let defPenalty  = 0;
  let mdefPenalty = 0;

  for (const [attr, n] of Object.entries(steps)) {
    const rule = ATTR_STAT_REDUCTION[attr];
    if (!rule) continue;
    if (rule.field === 'hpMax')  hpPenalty   += n * rule.amount;
    if (rule.field === 'mpMax')  mpPenalty   += n * rule.amount;
    if (rule.field === 'def')    defPenalty  += n * rule.amount;
    if (rule.field === 'mdef')   mdefPenalty += n * rule.amount;
  }

  return {
    effective,
    steps,
    effectiveHpMax:  Math.max(0, (char.hp?.max  ?? 0) - hpPenalty),
    effectiveMpMax:  Math.max(0, (char.mp?.max  ?? 0) - mpPenalty),
    effectiveDef:    Math.max(0, (char.def       ?? 0) - defPenalty),
    effectiveMdef:   Math.max(0, (char.mdef      ?? 0) - mdefPenalty),
    hasReductions:   Object.keys(steps).length > 0,
  };
}

module.exports = { reduceDie, getEffectiveAttributes, getEffectiveStats, DICE_ORDER };
