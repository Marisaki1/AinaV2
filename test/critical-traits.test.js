const test = require('node:test'), assert = require('node:assert/strict'), YAML = require('yaml');
const C = require('../src/critter/public/core'), R = require('../src/critter/public/critical-model'), A = require('../src/critter/public/authoring-model');
const { preview } = require('../src/critter/critical-traits'), { build } = require('../src/critter/authoring');
const { inspectCreature } = require('../src/critter/automation');
const models = entry => C.splitDescription(entry.description).blocks.flatMap(b => { const v = YAML.parse(b.source); return Array.isArray(v) ? v : [v]; });
function creature() {
  const c = C.blankCreature('Critical test'); c._id = 'keep-id'; c.bestiaryId = 'keep-pack'; c.unknown = { keep: true };
  c.stats.actions.push({ extra: 'keep-entry', ...build({ name:'Bite', kind:'attack', target:'each', attackBonus:8, damages:[{ dice:'2d8+4',type:'piercing' }], criton:19 }).entry });
  c.stats.reactions.push({ name:'Counter', description:'<p>Keep this HTML exactly.</p><avrae hidden>\n# untouched comment\n_v: 2\nname: Counter\nunknown: {keep: yes}\nautomation:\n  - type: target\n    target: each\n    effects:\n      - type: attack\n        attackBonus: "7" # attack comment\n        hit: [{type: damage, damage: "1d8[fire]"}]\n        miss: []\n</avrae>' });
  c.stats.actions.push({ name:'Save only', ...build({ name:'Save only',kind:'save',target:'each',saveStat:'con',dc:15,damages:[{dice:'2d6',type:'cold'}] }).entry });
  return c;
}
test('critical trait patches native attack models, leaves save automation and unknown data unchanged, and survives JSON', () => {
  const original = creature(), result = preview(original,{enabled:true,minimum:15}), c = result.candidate;
  assert.equal(R.config(c).minimum,15); assert.equal(result.attacks,2);
  assert.equal(models(c.stats.actions[0])[0].criton,15); assert.equal(models(c.stats.reactions[0])[0].criton,15);
  assert.equal(c.stats.actions[1].description,original.stats.actions[1].description);
  assert.equal(c.stats.actions[0].extra,'keep-entry'); assert.equal(c._id,original._id); assert.equal(c.bestiaryId,original.bestiaryId); assert.deepEqual(c.unknown,original.unknown);
  assert.match(c.stats.reactions[0].description, /attackBonus: "7" # attack comment/); assert.match(c.stats.reactions[0].description, /unknown: \{keep: yes\}/);
  assert.equal(A.recipe(c.stats.actions[0].description).criton,15);
  const roundtrip = C.importData(JSON.parse(JSON.stringify({name:'Bestiary',creatures:[c]}))).data.creatures[0];
  assert.equal(R.config(roundtrip).minimum,15); assert.equal(models(roundtrip.stats.actions[0])[0].criton,15);
  assert.equal(inspectCreature(c).find(a=>a.title==='Bite').fields.find(f=>f.label==='Critical minimum').value,'15');
});
test('changing/removing generated crit range restores native thresholds without deleting unrelated traits', () => {
  const original = creature(); original.stats.additionalAbilities.push({name:'Keep trait',description:'Never replace me.'});
  const first = preview(original,{enabled:true,minimum:15}).candidate, second = preview(first,{enabled:true,minimum:18}).candidate;
  assert.equal(models(second.stats.actions[0])[0].criton,18);
  const removed = preview(second,{enabled:false}).candidate;
  assert.equal(R.config(removed),null); assert.equal(models(removed.stats.actions[0])[0].criton,19); assert.equal(models(removed.stats.reactions[0])[0].criton,undefined);
  assert.equal(A.recipe(removed.stats.actions[0].description).criton,19);
  assert.deepEqual(removed.stats.additionalAbilities,original.stats.additionalAbilities);
  assert.deepEqual(preview(original,{enabled:false}).candidate, original);
});
test('shorthand attacks convert explicitly and restore; text-only attacks remain intact with a manual warning', () => {
  const c=C.blankCreature('Text and short');c.stats.actions=[{name:'Short',description:'<avrae hidden>Short|+5|1d6[piercing]</avrae>'},{name:'Text',description:'Melee Weapon Attack: +5 to hit. Hit: 7 (1d6+4) piercing damage.'}];
  const p=preview(c,{enabled:true,minimum:18});assert.equal(models(p.candidate.stats.actions[0])[0].criton,18);assert.equal(p.candidate.stats.actions[1].description,c.stats.actions[1].description);assert.match(p.warnings.join(' '),/text-parsed/);
  assert.equal(preview(p.candidate,{enabled:false}).candidate.stats.actions[0].description,c.stats.actions[0].description);
});
test('flow and sequence attack models get the native field; externally changed thresholds are retained on removal', () => {
  const c=C.blankCreature('Flow');c.stats.actions=[{name:'Flow',description:'<avrae hidden>[{_v: 2, name: One, automation: [{type: target, target: each, effects: [{type: attack, attackBonus: 3, hit: [], miss: []}]}]}, {_v: 2, name: Two, automation: [{type: text, text: keep}]}]</avrae>'}];
  const p=preview(c,{enabled:true,minimum:17}).candidate;assert.equal(models(p.stats.actions[0])[0].criton,17);assert.equal(models(p.stats.actions[0])[1].criton,undefined);
  p.stats.actions[0].description=p.stats.actions[0].description.replace('criton: 17','criton: 16');const removed=preview(p,{enabled:false});assert.equal(models(removed.candidate.stats.actions[0])[0].criton,16);assert.match(removed.warnings.join(' '),/externally changed/);
});
test('critical minimum commands validate range and cannot be injected through advanced arguments; players are never monster-added', () => {
  const spec={mode:'aoo',actor:'Dragon2',action:'Bite',criton:15,critical:'nocrit'};
  assert.equal(C.command(spec),'!i aoo "Dragon2" "Bite" nocrit -criton 15');
  for (const value of [0,21,'15\n!i end',1.5]) assert.throws(()=>C.command({...spec,criton:value}),/Critical minimum/);
  assert.throws(()=>C.command({...spec,advanced:'-criton 18'}),/controls/);
  assert.throws(()=>C.encounterCommand({kind:'player',name:'Sanae',sourceName:'Sanae'}),/Players join/);
});
