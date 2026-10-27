const test=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const C=require('../src/critter/public/core'),S=require('../src/critter/public/spellcasting-model'),A=require('../src/critter/public/authoring-model');
const {build}=require('../src/critter/authoring'),{calculate}=require('../src/critter/creature-calculations'),M=require('../src/critter/public/creature-math'),{repair}=require('../src/critter/automation-compat'),{fieldsFor}=require('../src/critter/ability-editor'),{inspectCreature}=require('../src/critter/automation');
const model=e=>YAML.parse(C.splitDescription(e.description).blocks[0].source);
function source(){const c=C.blankCreature('DC test');c._id='keep';c.extra={keep:true};c.stats.legendaryActionsDescription='Spell points and notes. She has a DC of 15 and a +7 to spell hits.';c.stats.actions.push(build({name:'Save spell',kind:'save',target:'each',dc:15,saveStat:'con',damages:[{dice:'4d8',type:'cold'}],scaling:{enabled:true,maximum:4,count:2,sides:8,dc:1}}).entry,build({name:'Attack spell',kind:'attack',target:'each',attackBonus:7,damages:[{dice:'2d8',type:'force'}]}).entry);return c;}
test('shared DC and hit preserve upcast increments, metadata, unrelated fields and readable notes',()=>{
 const original=source(),c=S.write(original,{enabled:true,dc:16,applyAttack:true,attackBonus:8,resources:[{name:'Spell points',maximum:12,shortRestore:3,longReset:true}]}),result=calculate(c,M.infer(c));
 const save=model(result.stats.actions[0]);assert.equal(save.automation[1].onTrue[2].effects[0].dc,'16+1*ainaSteps');assert.equal(model(result.stats.actions[1]).automation[0].effects[0].attackBonus,'8');
 assert.equal(A.recipe(result.stats.actions[0].description).dc,16);assert.equal(A.recipe(result.stats.actions[1].description).attackBonus,8);assert.equal(result._id,'keep');assert.deepEqual(result.extra,original.extra);assert.match(S.rules(result),/DC of 16/);assert.match(S.rules(result),/\+8 to spell hits/);assert.equal(S.read(C.importData(JSON.parse(JSON.stringify(result))).data).resources[0].maximum,12);
});
test('per-ability Fixed exceptions survive default changes and ordering; a disabled profile does not rewrite automation',()=>{
 let c=source();const before=C.clone(c);c=S.write(c,{enabled:false,dc:16,resources:[]});assert.equal(calculate(c,M.infer(c)).stats.actions[0].description,before.stats.actions[0].description);
 S.setOverride(c.stats.actions[0],'dc',true);assert(A.recipe(c.stats.actions[0].description));c=S.write(c,{enabled:true,dc:19,applyAttack:true,attackBonus:10});const result=calculate(c,M.infer(c));assert.equal(model(result.stats.actions[0]).automation[1].onTrue[2].effects[0].dc,'15+1*ainaSteps');assert.equal(model(result.stats.actions[1]).automation[0].effects[0].attackBonus,'10');
 S.setOverride(result.stats.actions[0],'dc',false);const next=calculate(result,M.infer(result));assert.equal(model(next.stats.actions[0]).automation[1].onTrue[2].effects[0].dc,'19+1*ainaSteps');
});
test('legacy List guards repair without changing field IDs, unknown YAML, formulas or damage mechanics',()=>{
 const c=C.blankCreature('Legacy');c.stats.actions=[{name:'Old spell',description:''}];
 // Use JSON source for an exact literal of the formerly invalid expression.
 c.stats.actions[0].description='<p>Keep original prose.</p><avrae hidden>'+JSON.stringify({_v:2,name:'Old spell',unknown:'keep',automation:[{type:'condition',condition:'choice == \'\' or choice in ["0","1","2"]',onTrue:[{type:'target',target:'each',effects:[{type:'save',stat:'con',dc:'15+int(choice or 0)',fail:[],success:[]}]}],onFalse:[]}]})+'</avrae>';
 const ids=fieldsFor(c.stats.actions[0].description).map(f=>f.id),p=repair(c);assert.equal(p.changes.length,1);assert(!model(p.creature.stats.actions[0]).automation[0].condition.includes(' in ['));assert.equal(model(p.creature.stats.actions[0]).automation[0].onTrue[0].effects[0].dc,'15+int(choice or 0)');assert.deepEqual(fieldsFor(p.creature.stats.actions[0].description).map(f=>f.id),ids);assert.equal(inspectCreature(p.creature)[0].scalingByName['Old spell'].maximum,2);assert.deepEqual(repair(p.creature).creature,p.creature);
});
test('resource validation rejects ambiguous names and invalid values; definitions do not create Avrae player counters',()=>{
 assert.throws(()=>S.validate({resources:[{name:'Points',maximum:12},{name:'points',maximum:12}]}),/unique/);assert.throws(()=>S.validate({dc:101}),/Default DC/);assert.throws(()=>S.validate({resources:[{name:'Points',maximum:-1}]}),/Resource maximum/);
 const c=S.write(source(),{enabled:true,dc:16,resources:[{name:'Points',maximum:12}]});assert(!JSON.stringify(c).includes('"type":"counter"'));
});
test('hit defaults can be enabled independently, zero hit remains an explicit value, and DC formulas do not double-count modifiers',()=>{
 let c=S.write(source(),{enabled:false,dc:16,applyAttack:true,attackBonus:0});let result=calculate(c,M.infer(c));assert.equal(model(result.stats.actions[1]).automation[0].effects[0].attackBonus,'0');assert.equal(model(result.stats.actions[0]).automation[1].onTrue[2].effects[0].dc,'15+1*ainaSteps');
 c.stats.actions[0].description='<avrae hidden>'+JSON.stringify({_v:2,name:'Formula',automation:[{type:'target',target:'each',effects:[{type:'save',stat:'con',dc:'8+proficiencyBonus+intelligenceMod',fail:[],success:[]}]}]})+'</avrae>';c=S.write(c,{enabled:true,dc:16});result=calculate(c,M.infer(c));assert.equal(model(result.stats.actions[0]).automation[0].effects[0].dc,'16');
});
test('editing visible rules preserves Fixed settings, source comments and exact hidden automation',()=>{
 const c=source(),entry=c.stats.actions[0];S.setOverride(entry,'dc',true);entry.description='<!-- preserve this unknown comment -->\n'+entry.description;const raw=C.splitDescription(entry.description).blocks[0].raw;entry.description=C.replaceReadable(entry.description,'Corrected visible rules.');assert(S.overrides(entry).dc);assert(entry.description.includes('<!-- preserve this unknown comment -->'));assert.equal(C.splitDescription(entry.description).blocks[0].raw,raw);
});
test('Seija export resolves immediately, uses DC 16 throughout, retains IDs and has no Resolve fall utility',()=>{
 const c=require('../exports/Seija_Kijin_CritterDB_Avrae.json');assert.equal(S.read(c).dc,16);assert.equal(c._id,'6aa91af515443bd5efce5345');assert(!JSON.stringify(c).includes('Resolve fall'));const side=c.stats.legendaryActions.find(a=>/This Side Down/.test(a.name));assert(A.recipe(side.description).scaling.enabled);assert.equal(A.recipe(side.description).dc,16);assert.equal(model(side).automation[1].onTrue[2].effects[0].dc,'16+1*ainaSteps');
 const texts=fieldsFor(c.stats.legendaryActions[2].description).filter(f=>f.label==='Target save DC');assert(texts.length>=4);assert(texts.every(f=>f.value==='16'));assert(!c.stats.legendaryActions[2].description.includes('choice in ['));
});
