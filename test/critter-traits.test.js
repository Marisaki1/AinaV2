const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const C = require('../src/critter/public/core'), T = require('../src/critter/public/combat-traits'), M = require('../src/critter/public/combat-model');
const { preview } = require('../src/critter/combat-traits'), { inspectCreature } = require('../src/critter/automation');
const { creature, bestiary } = require('./critter-fixture'), { createService } = require('../src/critter/server'), { WorkspaceStore } = require('../src/critter/store');
const trait = (scope, selected, mode = 'adv', restriction = '') => ({ id: scope + mode + restriction, rules: 'Existing creature rule', scope, selected, mode, restriction });
const config = traits => ({ id: '0123456789abcdef0123456789abcdef', traits });

test('selected saves, camelCase skills and disadvantage compile to exact passive identifiers', () => {
  assert.deepEqual(T.passive(config([trait('saves', ['dexterity']), trait('skills', ['sleightOfHand', 'animalHandling']), trait('saves', ['wisdom'], 'dis')])), { save_adv: ['dexterity'], check_adv: ['sleightOfHand', 'animalHandling'], save_dis: ['wisdom'] });
  assert.throws(() => T.validate(config([trait('skills', ['Sleight of Hand'])])), /valid abilities or skills/);
});
test('all checks excludes initiative, covers 18 skills persistently and six base checks at command time', () => {
  const cfg = config([trait('allChecks', [])]); assert.equal(T.passive(cfg).check_adv.length, 18);
  assert(!T.passive(cfg).check_adv.includes('initiative')); assert(!T.passive(cfg).check_adv.includes('dexterity'));
  for (const a of C.abilities) assert.deepEqual(T.flags(cfg, 'check', a), ['adv']);
  for (const s of T.skills) assert.deepEqual(T.flags(cfg, 'check', s), []);
  assert.deepEqual(T.flags(cfg, 'check', 'initiative'), []);
  assert.deepEqual(T.passive(config([trait('allSaves', [])])).save_adv, C.abilities);
});
test('base-only and restricted checks never broaden into unconditional skill or initiative effects', () => {
  const conditional = trait('skills', ['perception'], 'adv', 'Relying on hearing'), base = trait('abilities', ['strength'], 'adv', 'While raging'), cfg = config([conditional, base]);
  assert.deepEqual(T.passive(cfg), {});
  assert.deepEqual(T.flags(cfg, 'check', 'Perception'), []); assert.deepEqual(T.flags(cfg, 'check', 'Perception', [conditional.id]), ['adv']);
  assert.deepEqual(T.flags(cfg, 'check', 'Athletics', [base.id]), []); assert.deepEqual(T.flags(cfg, 'check', 'str', [base.id]), ['adv']);
  assert.deepEqual(T.flags(cfg, 'check', 'perception', [conditional.id], 'dis'), ['adv', 'dis']);
  assert.equal(T.liveRoll('Dragon2', 'check', 'Sleight of Hand', ['adv']), '!i oc "Dragon2" sleightOfHand adv');
  assert.equal(T.liveRoll('Dragon1', 'save', 'dex'), '!i os "Dragon1" dex');
});
test('generated action preserves all other creature bytes and survives creature/bestiary export and reimport', () => {
  const original = creature(), cfg = config([trait('saves', ['dexterity'])]), result = preview(original, cfg, null);
  const preserved = C.clone(result.candidate); preserved.stats.actions.pop(); assert.deepEqual(preserved, original);
  assert.equal(result.automation._v, 2); assert.equal(result.automation.automation[0].target, 'self'); assert.equal(result.automation.automation[0].effects[0].stacking, false);
  const imported = C.importData(JSON.parse(JSON.stringify(result.candidate))).data;
  assert.deepEqual(imported, result.candidate); assert.equal(inspectCreature(imported).at(-1).names[0], T.names(cfg).action);
  const ws = C.blankWorkspace(), pack = bestiary(); pack.creatures[0] = imported;
  ws.documents.push({ id: 'doc', label: 'Test', data: pack, keys: ['dragon', 'tewi'] }); ws.combatTraits.dragon = cfg;
  assert.deepEqual(C.validateWorkspace(JSON.parse(JSON.stringify(ws))).combatTraits.dragon, cfg);
  assert.deepEqual(C.importData(M.bestiary(ws, 'dragon')).data, pack);
  assert.throws(() => preview(imported, cfg, null), /Restore its Aina workspace backup/);
});
test('reapplication replaces one marked utility, keeps stable effect name, and removal targets that effect only', () => {
  const cfg = config([trait('saves', ['dexterity'])]), first = preview(creature(), cfg, null);
  const changed = config([trait('skills', ['perception'], 'dis')]), second = preview(first.candidate, changed, cfg);
  assert.equal(second.candidate.stats.actions.length, first.candidate.stats.actions.length); assert.equal(first.effect, second.effect);
  assert.deepEqual(second.automation.automation[0].effects[0].effects, { check_dis: ['perception'] });
  assert.equal(T.remove(cfg, 'Copy2'), '!i re "Copy2" "Aina Combat Traits 0123456789abcdef0123456789abcdef"');
  const removed = preview(second.candidate, config([]), changed); assert.deepEqual(removed.automation.automation[0].effects[0].effects, {});
  const copies = M.expand([{ id: 'x', name: 'Dragon#', quantity: '2' }]);
  assert.deepEqual(copies.map(e => T.setup(cfg, e.name)), ['!i aoo "Dragon1" "Aina Setup Traits 0123456789abcdef0123456789abcdef"', '!i aoo "Dragon2" "Aina Setup Traits 0123456789abcdef0123456789abcdef"']);
  const entry = { sourceName: 'Ancient Silver Dragon', name: 'Dragon1', initiativeRoll: 'adv' };
  assert.equal(C.encounterCommand(entry), '!i madd "Ancient Silver Dragon" -name "Dragon1" adv');
  assert(!C.encounterCommand({ ...entry, fixedInitiative: '20' }).endsWith('adv'));
});
test('reviewed trait saves reject concurrent changes, retain durable originals and preserve unrelated creatures', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-traits-api-')), service = createService({ directory, port: 0 });
  const ws = C.blankWorkspace(); ws.documents.push({ id: 'doc', label: 'Pack', data: bestiary(), keys: ['dragon', 'tewi'] }); service.store.save(ws, service.store.revision);
  try {
    await service.start();
    const req = async (route, method, body) => { const response = await fetch(service.url + '/api/' + route, { method, headers: { 'X-Aina-Local': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
    const cfg = config([trait('saves', ['dexterity'])]), reviewed = (await req('combat-traits/preview', 'POST', { key: 'dragon', config: cfg })).body;
    assert.equal(service.store.value.documents[0].data.creatures[0].stats.actions.length, 1); // Preview never writes.
    const saved = await req('combat-traits', 'PUT', { key: 'dragon', config: cfg, original: reviewed.original, previous: reviewed.previous }); assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.workspace.documents[0].data.creatures[1], ws.documents[0].data.creatures[1]);
    assert.deepEqual(new WorkspaceStore(directory).read().workspace.combatTraits.dragon, cfg);
    assert.equal((await req('combat-traits', 'PUT', { key: 'dragon', config: cfg, original: reviewed.original, previous: null })).status, 409);
    const backup = JSON.parse(fs.readFileSync(path.join(directory, 'creature-backups', fs.readdirSync(path.join(directory, 'creature-backups'))[0]), 'utf8'));
    assert.deepEqual(backup.original, creature()); assert.deepEqual(backup.traits, cfg);
  } finally { await service.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
