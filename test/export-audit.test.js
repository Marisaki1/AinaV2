const {test}=require('node:test'),assert=require('node:assert/strict');
const {auditAction,auditCreature}=require('../src/critter/export-audit');
const action=automation=>({_v:2,name:'Example',automation});
const condition=(expression,yes=[],no=[])=>({type:'condition',condition:expression,onTrue:yes,onFalse:no});
test('choice routing rejects mixed-case simple and compound keys',()=>{
 for(const expression of ['choice == "Fire"','choice.split("|")[0] == "Water+Wood"'])assert.ok(auditAction(action([condition(expression)])).some(i=>i.code==='choice-case'));
 assert.deepEqual(auditAction(action([condition('choice.split("|")[0] == "water+wood"')])),[]);
});
test('recursive choice chains fail the budget while sibling choices pass',()=>{
 let chain=[];for(let i=0;i<30;i++)chain=[condition('choice == "'+i+'"',[],chain)];
 assert.ok(auditAction(action(chain)).some(i=>i.code==='payload-depth'));
 assert.deepEqual(auditAction(action(Array.from({length:30},(_,i)=>condition('choice == "'+i+'"')))),[]);
});
test('target mechanics and granted button runtimes are checked separately',()=>{
 assert.ok(auditAction(action([{type:'damage',damage:'1d6'}])).some(i=>i.code==='target-context'));
 assert.deepEqual(auditAction(action([{type:'target',target:'each',effects:[{type:'damage',damage:'1d6'}]}])),[]);
 const granted={type:'target',target:'self',effects:[{type:'ieffect2',name:'Ward',buttons:[{label:'Damage',automation:[{type:'damage',damage:'1d6'}]}]}]};
 assert.ok(auditAction(action([granted])).some(i=>i.code==='target-context'));
});
test('every block is checked without mutating source data',()=>{
 const c={name:'Fixture',stats:{actions:[{name:'First',description:'<avrae hidden>'+JSON.stringify(action([]))+'</avrae><avrae hidden>_v: 2\nname: duplicate\nname: broken\nautomation: []</avrae>'},{name:'Second',description:'<avrae hidden>'+JSON.stringify(action([]))+'</avrae>'}]}};
 const original=JSON.stringify(c),r=auditCreature(c);assert.ok(r.issues.some(i=>i.code==='yaml'));assert.ok(r.issues.some(i=>i.code==='duplicate-action'));assert.equal(JSON.stringify(c),original);
});
