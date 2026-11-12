const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/critter/siege-rules');

test('partial member HP retains an action and defeat leaves none', () => {
  assert.equal(R.availableMembers(600, 100, 6), 6);
  assert.equal(R.availableMembers(501, 100, 6), 6);
  assert.equal(R.availableMembers(500, 100, 6), 5);
  assert.equal(R.availableMembers(1, 100, 6), 1);
  assert.equal(R.availableMembers(0, 100, 6), 0);
  assert.throws(() => R.availableMembers(601, 100, 6));
});

test('healing resolves before damage, cannot exceed the maximum or revive', () => {
  assert.equal(R.healBeforeDamage(580, 30, 600), 600);
  assert.equal(R.healBeforeDamage(1, 30, 600), 31);
  assert.equal(R.healBeforeDamage(0, 30, 600), 0);
});

test('critical damage is rounded per squad before combined blocking', () => {
  assert.deepEqual(R.combinedDamage([{ damage: 90, hit: true, critical: true }], 40), { incoming: 135, blocked: 40, damage: 95 });
  assert.deepEqual(R.combinedDamage([{ damage: 15, hit: true, critical: true }, { damage: 10, hit: true, critical: false }], 20), { incoming: 32, blocked: 20, damage: 12 });
  assert.deepEqual(R.combinedDamage([{ damage: 45, hit: true, critical: false }], 60), { incoming: 45, blocked: 45, damage: 0 });
  assert.deepEqual(R.combinedDamage([{ damage: 45, hit: false, critical: false }], 0), { incoming: 0, blocked: 0, damage: 0 });
});

test('both battalions heal before damage and attacks use starting strength', () => {
  const a={kind:'guild',members:6,hp:301,healsUsed:[]}, b={kind:'bandit',members:6,hp:300,healsUsed:[]};
  const [guild, bandit]=R.resolvePair(a,b,[['heal','attack','attack','block'],['attack','attack','block']],[20,20]);
  assert.equal(guild.healed,30); assert.equal(guild.attack.damage,30); assert.equal(guild.incoming,90);
  assert.equal(guild.damage,75); assert.equal(guild.hp,256); assert.equal(bandit.incoming,45); assert.equal(bandit.damage,30); assert.equal(bandit.hp,270);
  assert.deepEqual(guild.used,[0]);
});

test('one d20 per squad, capped critical range, and a natural one misses', () => {
  const a={kind:'guard',members:25,hp:2500,healsUsed:[]}, b={kind:'guard',members:6,hp:600,healsUsed:[]};
  const [attack] = R.resolvePair(a,b,[Array(25).fill('attack'),[]],[2,1]);
  assert.equal(attack.attack.critAt,2); assert.equal(attack.attack.critical,true);
  const [miss] = R.resolvePair(a,b,[['attack'],[]],[1,1]); assert.equal(miss.attack.hit,false);
});
