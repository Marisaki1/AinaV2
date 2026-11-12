'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const R=require('../src/critter/siege-rules');const {Siege}=require('../src/critter/siege');
test('requested defaults use the specified stats and half-members ability scales with squad size',()=>{
  for(const kind of ['bandit','bandit_archer']){
    const p=R.PRESETS[kind];assert.equal(p.hpPerMember,100);assert.equal(p.attack,15);assert.equal(p.block,kind==='bandit'?15:0);assert.equal(p.move,30);assert.equal(p.noHealingUses,true);
    const side={kind,members:10,hp:501},target={kind:'guard',members:6,hp:600};
    assert.equal(R.resolvePair(side,target,[['attack'],[]],[10,10])[0].attack.damage,15);
    assert.equal(R.resolvePair({...side,hp:500},target,[['attack'],[]],[10,10])[0].attack.damage,30);
    const boosted={...side,hp:500,leader:{type:'war'}};assert.equal(R.resolvePair(boosted,target,[['attack'],[]],[10,10])[0].attack.damage,40);
  }
  const guard={kind:'guard',members:6,hp:600},guild={kind:'guild',members:6,hp:600};
  const result=R.resolvePair(guard,guild,[['block','block'],['attack','attack','attack']],[10,10]);assert.equal(result[0].blocking,30);assert.equal(result[0].ac,4);assert.equal(result[1].attack.bonus,3);
  assert.equal(R.healers({...guard,leader:{type:'medic'}}).length,0);
});
test('existing types update once while existing squads, active battle and unrelated fields remain untouched',()=>{
  const squad={id:'unit',kind:'guard',name:'Existing',hp:400,members:6,rules:{...R.PRESETS.guard,block:77}},active={status:'voting',token:'unchanged'};
  let state={revision:0,workspace:{siege:{types:[{id:'guard',name:'Guard',attackRoll:7,baseAC:4,image:'https://example.com/a.png',block:99},{id:'guild',name:'Guild member',heal:33},{id:'bandit',name:'Bandit'}],battalions:[squad],active,history:[]}}};
  const store={read:()=>structuredClone(state),save:(workspace,revision)=>{assert.equal(revision,state.revision);state={revision:revision+1,workspace:structuredClone(workspace)};}};
  const siege=new Siege(store,{}),s=siege.view();assert.equal(s.types.find(x=>x.id==='guard').block,15);assert.equal(s.types.find(x=>x.id==='guard').attackRoll,7);assert.equal(s.types.find(x=>x.id==='guard').baseAC,4);assert.equal(s.types.find(x=>x.id==='guild').heal,33);assert.equal(s.types.find(x=>x.id==='bandit_archer').block,0);assert.deepEqual(s.battalions[0],squad);assert.deepEqual(s.active,active);
  siege.saveType({...s.types.find(x=>x.id==='guard'),block:44});new Siege(store,{});assert.equal(siege.view().types.find(x=>x.id==='guard').block,44);
});
test('action clarification migrates types and squads without changing an active battle snapshot',()=>{
  const squad={id:'unit',kind:'guard',name:'Existing',hp:400,members:6,rules:{...R.PRESETS.guard,attackRoll:1,hitPerAttacker:0,acPerBlock:1}},active={status:'voting',sides:[structuredClone(squad)]};
  let state={revision:0,workspace:{siege:{requestedRulesV1:true,types:[{id:'guard',name:'Guard',attackRoll:1,hitPerAttacker:0,acPerBlock:1}],battalions:[squad],active,history:[],battleSettings:{blockAC:3,critBase:18,critPerExtra:0,critMinimum:5,critPercent:200}}}};
  const store={read:()=>structuredClone(state),save:(workspace,revision)=>{assert.equal(revision,state.revision);state={revision:revision+1,workspace:structuredClone(workspace)};}};
  const siege=new Siege(store,{}),s=siege.view();assert.equal(s.types[0].attackRoll,0);assert.equal(s.types[0].hitPerAttacker,1);assert.equal(s.types[0].acPerBlock,2);assert.equal(s.battalions[0].rules.attackRoll,0);assert.equal(s.battalions[0].rules.hitPerAttacker,1);assert.equal(s.battalions[0].rules.acPerBlock,2);assert.deepEqual(s.active,active);assert.equal(s.battleSettings.blockAC,null);assert.equal(s.battleSettings.critPercent,200);
});
