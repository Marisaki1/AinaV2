const BAR_LENGTH = 10;

/**
 * Render a unicode block bar.
 * e.g.  ████████░░  32 / 40
 */
function renderBar(current, max, length = BAR_LENGTH) {
  if (max <= 0) return '░'.repeat(length);
  const clamped = Math.max(0, Math.min(current, max));
  const filled  = Math.round((clamped / max) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

/**
 * Return an embed hex color based on HP ratio.
 *  > 50% → green | 25–50% → yellow | ≤ 25% → red
 */
function getHealthColor(current, max) {
  if (max <= 0) return '#ed4245';
  const ratio = current / max;
  if (ratio <= 0.25) return '#ed4245'; // red
  if (ratio <= 0.50) return '#fee75c'; // yellow
  return '#57f287';                    // green
}

module.exports = { renderBar, getHealthColor };
