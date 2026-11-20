const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../src/critter/public/elemental-magic');
test('mixer replaces the infused element and preserves other selected effects',()=>{
 const b=E.build({elements:['Fire','Wood'],infusion:'moon',infused:'Fire',damageType:'cold'});
 assert.equal(b.name,'Fire - Wood');assert.equal(b.shape,'Touch');assert.match(b.effects.join(' '),/2d10 × 2 cold/);assert.equal(b.choice,'fire+wood|moonfire/cold');
});
test('Wis adds a third distinct element without duplicating a base element',()=>{
 const state={elements:['Water','Wood'],stored:'Fire',useStored:true,infusion:'sun',infused:'Water'};
 const b=E.build(state);assert.equal(b.key,'Fire+Water+Wood');assert.equal(b.healing,true);assert.equal(b.shapes.length,1);
 assert.equal(E.build({...state,stored:'Wood'}).key,'Water+Wood');
});
test('healing and enemy effects generate separate targeted commands for one casting',()=>{
 const s={elements:['Water','Wood'],infusion:'moon',infused:'Wood',damageType:'fire'};
 const lines=E.commands(s,{actor:'Patchouli One',allies:['Ally'],enemies:['Enemy']});
 assert.equal(lines.length,2);assert.match(lines[0],/water\+wood\|moonwood\/fire/);assert.match(lines[1],/water\+wood:moonwood:enemies\|fire/);
});
test('reject invalid selections and multiple touch targets',()=>{
 assert.throws(()=>E.build({elements:['Fire']}));assert.throws(()=>E.build({elements:['Fire','Earth'],infusion:'sun',infused:'Wood'}));
 assert.throws(()=>E.commands({elements:['Wood','Earth']},{actor:'Patchouli',targets:['A','B']}),/one target/);
});
test('every mixer combination and infusion has a compact native route',()=>{
 const data=require('../src/critter/public/elemental-magic-data.json');assert.equal(data.actions.length,1);
 const action=JSON.parse(data.actions[0].description.match(/<avrae hidden>([\s\S]*?)<\/avrae>/)[1]);
 const payload=JSON.stringify(action);
 for(let mask=0;mask<32;mask++){
  const es=E.elements.filter((_,i)=>mask&(1<<i));if(![2,3].includes(es.length))continue;
  for(const inf of ['none','sun','moon'])for(const e of (inf==='none'?['']:es))for(const t of E.types){
   const s={elements:es.slice(0,2),stored:es[2],useStored:es.length===3,infusion:inf,infused:e,damageType:t};
   const b=E.build(s);assert.ok(payload.includes(b.key.toLowerCase()));assert.ok(payload.includes((inf==='none'?'none':inf+e.toLowerCase())+'/'+t));
  }
 }
});
test('native routing stays shallow enough for recursive import validators',()=>{
 const data=require('../src/critter/public/elemental-magic-data.json');
 const payload=JSON.parse(data.actions[0].description.match(/<avrae hidden>([\s\S]*?)<\/avrae>/)[1]);
 const depth=n=>n&&typeof n==='object'?1+Math.max(0,...Object.values(n).map(depth)):0;
 assert.ok(depth(payload)<=20,'Do not rebuild an else-if chain for the mixer choices.');
 assert.match(data.actions[0].description,/AINA_ELEMENTAL_MAGIC:v3/);
});
