const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');
const C = require('../src/critter/public/core'), A = require('../src/critter/public/authoring-model'), T = require('../src/critter/public/combat-traits');
const context = vm.createContext({ window: {}, C, Authoring: A, CombatTraits: T });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/critter/public/combat-controls.js'), 'utf8'), context);
const command = context.window.CombatControls.command;

test('compact initiative commands use the exact named copy and the supported Avrae HP/AC syntax', () => {
  const name = 'Dragon Two';
  for (const [action, value, expected] of [
    ['damage', '7', '!i hp "Dragon Two" -(7)'], ['damage', '1d6+2', '!i hp "Dragon Two" -(1d6+2)'],
    ['heal', '10', '!i hp "Dragon Two" 10'], ['set', '15', '!i hp set "Dragon Two" 15'],
    ['thp', '5', '!i thp "Dragon Two" 5'], ['max', '100', '!i hp max "Dragon Two" 100'],
    ['restore', '', '!i hp max "Dragon Two"'], ['ac', '22', '!i opt "Dragon Two" -ac 22'],
    ['acBonus', '2', '!i opt "Dragon Two" -ac +2'], ['acBonus', '-2', '!i opt "Dragon Two" -ac -2'],
  ]) assert.equal(command({ name, action, value }), expected);
  assert.equal(command({ name, action: 'resist', type: 'fire' }), '!i opt "Dragon Two" -resist fire');
  assert.equal(command({ name, action: 'removeEffect', note: 'Custom Bleeding' }), '!i re "Dragon Two" "Custom Bleeding"');
  assert.throws(() => command({ name, action: 'damage', value: '1d0' }));
  assert.throws(() => command({ name, action: 'heal', value: '10\n!i end' }));
  assert.throws(() => command({ name, action: 'resist', type: 'unknown' }));
});

test('explicit Normal on an action requests cancelling sources without changing automation', () => {
  assert.equal(C.command({ mode: 'aoo', actor: 'Dragon Two', action: 'Attack', normalOverride: true }), '!i aoo "Dragon Two" "Attack" adv dis');
});
