(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core') : root.Critter);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.AbilityToolsModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  const operations = ['adjust', 'reverse', 'save', 'check', 'attack', 'dice', 'initiative'];
  const number = (value, label, min = -100000, max = 100000) => {
    if (!/^[+-]?\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(label + ' must be a whole number from ' + min + ' to ' + max + '.');
    return Number(value);
  };
  function validateFollowup(raw = {}) {
    if (!raw.enabled) return { enabled: false };
    if (!operations.includes(raw.operation)) throw new Error('Select a supported follow-up operation.');
    const rules = String(raw.rules || ''); if (rules.length > 2000) throw new Error('Follow-up rules are too long.');
    return { enabled: true, operation: raw.operation, adjustment: number(raw.adjustment || 0, 'Roll adjustment'), dice: raw.dice ? dice(raw.dice) : '1d20', rules };
  }
  function validateUsage(raw = {}) {
    if (!raw.enabled) return { enabled: false };
    const name = String(raw.name || '').trim(); C.quote(name, 'Resource/pool name'); if (name.length > 80) throw new Error('Resource name is too long.');
    if (!['fixed', 'pb', ...C.abilities].includes(raw.maximumFrom || 'fixed')) throw new Error('Choose a valid resource maximum formula.');
    if (!['manual', 'turn', 'rest'].includes(raw.reset || 'manual')) throw new Error('Choose a resource reset rule.');
    if (!['fixed', 'half'].includes(raw.shortRestoreMode || 'fixed')) throw new Error('Choose a short-rest restoration formula.');
    return { enabled: true, name, maximumFrom: raw.maximumFrom || 'fixed', maximum: number(raw.maximum ?? 1, 'Resource maximum', 0), minimum: number(raw.minimum ?? 0, 'Minimum resource maximum', 0), cost: number(raw.cost ?? 1, 'Resource cost', 0), shortRestore: number(raw.shortRestore ?? 0, 'Short-rest restoration', 0), shortRestoreMode: raw.shortRestoreMode || 'fixed', reset: raw.reset || 'manual' };
  }
  function maximum(config, creature) {
    const c = validateUsage(config), s = creature.stats;
    return c.maximumFrom === 'fixed' ? c.maximum : Math.max(c.minimum, c.maximumFrom === 'pb' ? s.proficiencyBonus || 0 : Math.floor(((s.abilityScores?.[c.maximumFrom] ?? 10) - 10) / 2));
  }
  function changePool(current, max, action, amount) {
    current = number(current, 'Remaining uses', 0); max = number(max, 'Maximum uses', 0); amount = number(amount, 'Uses', 0);
    current = Math.min(max, current);
    if (action === 'spend' && amount > current) throw new Error('Not enough locally recorded uses. Check the encounter before changing the tracker.');
    if (action === 'spend') return current - amount;
    if (action === 'restore') return Math.min(max, current + amount);
    if (action === 'reset') return max;
    throw new Error('Choose a resource operation.');
  }
  function evaluate({ operation, total, adjustment = 0, dc, success, special = false }) {
    if (operation === 'reverse') {
      if (!['success', 'failure'].includes(success)) throw new Error('Select the original outcome.');
      return { outcome: success === 'success' ? 'failure' : 'success', manual: true, detail: 'Apply the stated reversal manually. Previous damage, conditions and resource use have not been undone.' };
    }
    const adjusted = number(total, 'Original total') + number(adjustment, 'Adjustment');
    return { total: adjusted, outcome: special || dc === '' || dc == null ? 'DM decision required' : adjusted >= number(dc, 'DC / AC', 0) ? 'success' : 'failure', manual: true, detail: 'This evaluates the recorded total only. Special natural-roll rules and already-applied consequences require manual resolution.' };
  }
  function dice(value) {
    value = String(value).replace(/\s/g, '');
    if (!/^(?:\d+d[1-9]\d*|\d+)(?:[+-](?:\d+d[1-9]\d*|\d+))*$/i.test(value) || value.length > 100) throw new Error('Enter dice such as 1d8 or 2d8+3.');
    return value;
  }
  function commands(input, prefix = '!') {
    const p = C.prefix(prefix), kind = input.operation;
    if (kind === 'dice') return [p + 'r ' + dice(input.dice)];
    if (kind === 'attack') {
      const bonus = number(input.bonus || 0, 'Total attack bonus') + number(input.adjustment || 0, 'Adjustment');
      if (!['normal', 'adv', 'dis'].includes(input.roll)) throw new Error('Choose a roll mode.');
      return [p + 'r ' + (input.roll === 'adv' ? '2d20kh1' : input.roll === 'dis' ? '2d20kl1' : '1d20') + (bonus < 0 ? '' : '+') + bonus];
    }
    if (['save', 'check'].includes(kind)) {
      const stat = String(input.stat || '');
      const key = kind === 'save' ? C.abilities.find(a => a === stat || a.slice(0, 3) === stat)?.slice(0, 3) : [...C.abilities, 'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival'].find(a => a === stat);
      if (!key || !['normal', 'adv', 'dis'].includes(input.roll)) throw new Error('Select a valid save/check and roll mode.');
      const adjustment = number(input.adjustment || 0, 'Adjustment');
      return [p + 'i ' + (kind === 'save' ? 'os ' : 'oc ') + C.quote(input.actor, 'Combatant') + ' ' + key + (input.roll === 'normal' ? ' adv dis' : ' ' + input.roll) + (adjustment ? ' -b ' + C.quote(adjustment) : '') + (input.dc !== '' && input.dc != null ? ' -dc ' + number(input.dc, 'DC', 0) : '')];
    }
    if (kind === 'initiative') {
      if (!input.confirmed || input.actor === input.other) throw new Error('Select two different combatants and confirm eligibility and the actual initiative values.');
      const first = number(input.initiative, 'First initiative'), second = number(input.otherInitiative, 'Second initiative');
      const signed = n => (n >= 0 ? '+' : '') + n;
      // Avrae interprets a negative -p value as a relative adjustment. Deltas
      // handle negative initiative totals as well as positive ones correctly.
      return [p + 'i opt ' + C.quote(input.actor) + ' -p ' + signed(second - first), p + 'i opt ' + C.quote(input.other) + ' -p ' + signed(first - second)];
    }
    return [];
  }
  return { operations, number, validateFollowup, validateUsage, maximum, changePool, evaluate, commands, dice };
});
