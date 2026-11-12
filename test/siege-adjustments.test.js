'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Siege}=require('../src/critter/siege');
const R=require('../src/critter/siege-rules');
function setup(kind='guild'){
  let snapshot={revision:0,workspace:{siege:{battalions:[],history:[]}}};
  const store={read:()=>structuredClone(snapshot),save:(workspace,revision)=>{
    assert.equal(revision,snapshot.revision);snapshot={revision:revision+1,workspace:structuredClone(workspace)};
  }};
  const siege=new Siege(store,{}),squad=siege.create({name:'Test squad',kind,members:6});
  return {siege,id:squad.id,read:()=>siege.view().battalions[0]};
}
test('signed HP adjustments apply damage and healing, clamp HP, and survive reload',()=>{
  const {siege,id,read}=setup();
  siege.adjust({id,heal:-125});assert.equal(read().hp,475);assert.equal(R.sideMembers(read()),5);
  siege.adjust({id,heal:50});assert.equal(read().hp,525);
  siege.adjust({id,heal:999});assert.equal(read().hp,600);
  assert.equal(new Siege(siege.store,{}).view().battalions[0].hp,600);
  siege.adjust({id,heal:-999});assert.equal(read().hp,0);
  assert.throws(()=>siege.adjust({id,heal:1}),/cannot revive/);
  siege.adjust({id,heal:-1});assert.equal(read().hp,0);
});
test('signed healing-use adjustments spend normal then shared uses and restore without overflow',()=>{
  const {siege,id,read}=setup();siege.configure({id,leader:{type:'quartermaster'}});
  siege.adjust({id,healUses:-7});assert.equal(R.healers(read()).length,0);assert.equal(read().extraHealsUsed,1);
  siege.adjust({id,healUses:2});assert.equal(R.healers(read()).length,1);assert.equal(read().extraHealsUsed,0);
  siege.adjust({id,healUses:-999});assert.equal(read().healsUsed.length,6);assert.equal(read().extraHealsUsed,2);
  siege.adjust({id,healUses:999});assert.deepEqual(read().healsUsed,[]);assert.equal(read().extraHealsUsed,0);
  siege.adjust({id,healUses:-3});siege.adjust({id,restoreHeals:true});assert.equal(R.healers(read()).length,6);
});
test('adjustments reject invalid amounts and active-battle changes without losing data',()=>{
  const {siege,id,read}=setup();
  for(const heal of [0,null,'',1.5,NaN,Infinity,100001,-100001])assert.throws(()=>siege.adjust({id,heal}),/whole number/);
  assert.equal(read().hp,600);
  siege.change(s=>{s.active={status:'voting',leftId:id};});
  assert.throws(()=>siege.adjust({id,heal:-100}),/Finish or cancel/);
  assert.throws(()=>siege.adjust({id,healUses:-1}),/Finish or cancel/);
  assert.equal(read().hp,600);
});
test('disabled healing uses stay disabled; unlimited uses cannot be spent',()=>{
  const {siege,id,read}=setup('guard');siege.adjust({id,healUses:-3});assert.deepEqual(read().healsUsed,[]);
  siege.configure({id,leader:{type:'quartermaster'}});siege.adjust({id,healUses:-1});assert.equal(read().extraHealsUsed,1);
  const type=siege.saveType({name:'Unlimited healers',heal:30,healUsesPerMember:0,noHealingUses:false});
  siege.edit({id,name:'Test squad',members:6,kind:type.id});assert.throws(()=>siege.adjust({id,healUses:-1}),/unlimited/);
});
