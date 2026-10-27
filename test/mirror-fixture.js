const C = require('../src/critter/public/core');
const owner = '123456789012345678', guild = '223456789012345678', channel = '323456789012345678', otherChannel = '423456789012345678';
let serial = 0n;
const requestId = () => String(((BigInt(Date.now()) - 1420070400000n) << 22n) + ++serial);
const known = value => ({ status: 'known', value });
function snapshot(channelId = channel) {
  const unit = (id, name) => ({ id, name, controllerId: owner, initiative: 18, groupId: 'dragons', hidden: false, sourceName: known('Ancient Silver Dragon'), hp: known(0), maxHp: known(100), tempHp: known(0), ac: known(20), resistances: known(['cold']), immunities: known([]), vulnerabilities: known([]), actions: known(['Bite', 'Cold Breath']), spells: known(['Fog Cloud']), effects: known([{ name: 'Bless', duration: 10, remaining: 0, concentration: true, ticksOnEnd: false }]) });
  const first = unit('copy-one', 'Dragon One'), second = unit('copy-two', 'Dragon "Two"'); second.hidden = true;
  return { format: 'aina-avrae-snapshot', version: 1, guildId: guild, channelId, exporterId: owner, requestId: requestId(), exportedAt: Date.now(), nonce: 'a'.repeat(32), active: true, name: 'Disposable fixture encounter', round: 2, turn: 18, currentId: 'dragons', groups: [{ id: 'dragons', name: 'Dragons', initiative: 18, members: [first.id, second.id] }], combatants: [first, second] };
}
function fragments(s, nonce) {
  const value = C.clone(s); value.nonce = nonce; const payload = JSON.stringify(value), chunks = [];
  for (let at = 0; at < payload.length; at += 650) chunks.push(payload.slice(at, at + 650));
  return chunks.map((chunk, part) => ({ format: 'aina-avrae-part', version: 1, requestId: value.requestId, nonce, signature: 'fixture-signature', part, total: chunks.length, chunk }));
}
module.exports = { owner, guild, channel, otherChannel, snapshot, requestId, fragments };
