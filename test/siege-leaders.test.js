'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../src/critter/siege-rules');
const {Siege}=require('../src/critter/siege');
const base=(kind='guild')=>({kind,members:6,hp:600,healsUsed:[]});

test('leader bonuses apply to the correct phase and do not add actions',()=>{
  let a={...base(),hp:750,leader:{type:'veteran'}};assert.equal(R.maximumHP(a),750);assert.equal(R.sideMembers(a),6);assert.equal(R.sideMembers(a,500),5);
  for(const [type,expected] of [['shield',5],['defensive',20],['scout',60]]){
    a={...base(),leader:{type}};const out=R.resolvePair(a,base('guard'),[['block','move'],[]],[10,10])[0];
    assert.equal(type==='shield'?out.ac:type==='defensive'?out.blocking:out.move,expected);
  }
  a={...base(),leader:{type:'war'}};assert.equal(R.resolvePair(a,base('guard'),[['attack','attack'],[]],[10,10])[0].attackDamage,40);
  a={...base(),leader:{type:'tactician'}};const target={...base('guard'),rules:{...R.PRESETS.guard,baseAC:12}};const out=R.resolvePair(a,target,[['attack'],[]],[10,10])[0];assert.equal(out.attack.total,14);assert.equal(out.attack.hit,true);
  a={...base(),hp:400,leader:{type:'medic'}};assert.equal(R.resolvePair(a,base('guard'),[['heal'],[]],[10,10])[0].healed,50);
});

test('shared healing uses are consumed after normal uses and limited by active members',()=>{
  const a={...base(),hp:400,healsUsed:[0,1,2,3],leader:{type:'quartermaster'}};
  const out=R.resolvePair(a,base('guard'),[['heal','heal'],[]],[10,10])[0];assert.equal(out.healed,60);assert.equal(out.extraUsed,2);assert.deepEqual(out.used,a.healsUsed);
  assert.throws(()=>R.resolvePair({...a,extraHealsUsed:2},base('guard'),[['heal'],[]],[10,10]),/healers/);
});

test('critical and block settings change actual rolls and damage',()=>{
  const out=R.resolvePair(base(),base('guard'),[['attack','attack'],['block']],[18,1],{critBase:19,critPerExtra:1,critMinimum:2,critPercent:200,blockAC:4});
  assert.equal(out[1].ac,4);assert.equal(out[0].attack.critAt,18);assert.equal(out[1].incoming,60);
});

test('type, leader, squad and battle attack modifiers combine without changing natural-roll rules',()=>{
  const a={...base(),rules:{...R.PRESETS.guild,attackRoll:4,hitPerAttacker:0},leader:{type:'tactician'},bonuses:{attackRoll:-2}};
  const target={...base('guard'),rules:{...R.PRESETS.guard,baseAC:17}};
  const result=R.resolvePair(a,target,[['attack'],[]],[10,1],{attackRoll:2})[0];
  assert.equal(result.attack.bonus,7);assert.equal(result.attack.total,17);assert.equal(result.attack.hit,true);
  assert.equal(R.resolvePair(a,target,[['attack'],[]],[1,1],{attackRoll:100})[0].attack.hit,false);
  const critical=R.resolvePair(a,target,[['attack'],[]],[19,1],{attackRoll:2,critBase:20})[0];assert.equal(critical.attack.critical,false);
  assert.equal(R.resolvePair(base(),target,[['attack'],[]],[10,1])[0].attack.bonus,1);
});

test('six attackers rolling 14 plus 6 hit AC 20 without a critical; narration separates the roll',()=>{
  const attacker={...base(),rules:{...R.PRESETS.guild,attackRoll:6,hitPerAttacker:0}},target={...base('guard'),rules:{...R.PRESETS.guard,baseAC:20}};
  const result=R.resolvePair(attacker,target,[Array(6).fill('attack'),[]],[14,1]);
  assert.equal(result[0].attack.total,20);assert.equal(result[0].attack.hit,true);assert.equal(result[0].attack.critAt,15);assert.equal(result[0].attack.critical,false);
  assert.equal(result[1].incoming,90);
  const siege=new Siege({read:()=>({workspace:{siege:{types:[],requestedRulesV1:true,requestedRulesV2:true}}})},{});
  const line=siege.narrate([{...attacker,name:'Attackers'},{...target,name:'Defenders'}],result).find(x=>x.line.includes('**Attack**')).line;
  assert.match(line,/1d20 \(\*\*14\*\*\) \+ 6 = \*\*20\*\* vs AC 20 — \*\*HIT\*\*/);
  const crit=R.resolvePair(attacker,target,[Array(6).fill('attack'),[]],[15,1]);assert.equal(crit[0].attack.critical,true);assert.equal(crit[1].incoming,135);
});

test('per-attacker hit bonus scales while the fixed bonus is added once',()=>{
  const a={...base(),rules:{...R.PRESETS.guild,attackRoll:5,hitPerAttacker:1}},t=base('guard');
  const one=R.resolvePair(a,t,[['attack'],[]],[10,1])[0].attack;
  const six=R.resolvePair(a,t,[Array(6).fill('attack'),[]],[10,1])[0].attack;
  assert.equal(one.bonus,6);assert.equal(six.bonus,11);assert.equal(six.total,21);
});

test('advantage and disadvantage keep the right d20 for hits and crits and strike the discarded die',()=>{
  const target={...base('guard'),rules:{...R.PRESETS.guard,baseAC:20}},siege=new Siege({read:()=>({workspace:{siege:{types:[],requestedRulesV1:true,requestedRulesV2:true}}})},{});
  const attacker={...base(),rules:{...R.PRESETS.guild,attackRoll:1,hitPerAttacker:0,attackMode:'disadvantage'}};
  const result=R.resolvePair(attacker,target,[['attack'],[]],[[19,2],[10,10]]);
  assert.equal(result[0].attack.roll,2);assert.equal(result[0].attack.hit,false);assert.equal(result[0].attack.critical,false);
  const line=siege.narrate([{...attacker,name:'Squad'},{...target,name:'Target'}],result)[0].line;
  assert.match(line,/2d20kl1 \(~~19~~ \*\*2\*\*\) \+ 1 = \*\*3\*\*/);
  const adv=R.resolvePair({...attacker,rules:{...attacker.rules,attackMode:'advantage'}},target,[['attack'],[]],[[2,20],[10,10]])[0].attack;
  assert.equal(adv.roll,20);assert.equal(adv.critical,true);
  const cancel=R.resolvePair({...attacker,leader:{type:'custom',effects:{attackMode:'advantage'}}},target,[['attack'],[]],[[13,2],[10,10]])[0].attack;
  assert.equal(cancel.mode,'normal');assert.equal(cancel.roll,13);
  const tie=R.resolvePair(attacker,target,[['attack'],[]],[[11,11],[10,10]]);
  assert.match(siege.narrate([{...attacker,name:'Squad'},{...target,name:'Target'}],tie)[0].line,/\(\*\*11\*\* ~~11~~\)/);
});

test('attack-roll modifiers persist in battalion templates and their snapshots',()=>{
  let snapshot={revision:0,workspace:{siege:{battalions:[],history:[]}}};const store={read:()=>structuredClone(snapshot),save:(workspace,revision)=>{assert.equal(revision,snapshot.revision);snapshot={revision:revision+1,workspace:structuredClone(workspace)};}};
  const siege=new Siege(store,{}),type=siege.saveType({name:'Archers',attackRoll:-3});const squad=siege.create({name:'A',kind:type.id,members:6});
  assert.equal(squad.rules.attackRoll,-3);siege.saveType({...type,attackRoll:5});assert.equal(siege.view().battalions[0].rules.attackRoll,-3);
  siege.edit({id:squad.id,name:squad.name,members:6,kind:type.id});assert.equal(siege.view().battalions[0].rules.attackRoll,5);
  siege.saveSettings({...R.BATTLE_DEFAULTS,attackRoll:-1});assert.equal(siege.view().battleSettings.attackRoll,-1);
});

test('leader and modifier edits preserve damage and gallery and embed use matching order',()=>{
  let snapshot={revision:0,workspace:{siege:{battalions:[],history:[]}}};const store={read:()=>structuredClone(snapshot),save:(workspace,revision)=>{assert.equal(revision,snapshot.revision);snapshot={revision:revision+1,workspace:structuredClone(workspace)};}};
  const siege=new Siege(store,{}),a=siege.create({name:'A',kind:'guard',members:6,image:'https://example.com/a.png'}),b=siege.create({name:'B',kind:'guild',members:6,image:'https://example.com/b.png'});
  siege.configure({id:a.id,leader:{type:'veteran',name:'Veteran',image:'https://example.com/l.png'}});let squad=siege.view().battalions[0];assert.equal(squad.hp,750);
  siege.change(s=>{s.battalions[0].hp=500;});siege.configure({id:a.id,leader:null});squad=siege.view().battalions[0];assert.equal(squad.hp,350);
  siege.configure({id:a.id,leader:{type:'war',name:'Commander',image:'https://example.com/l.png'},bonuses:{ac:2,attack:3}});
  const sides=siege.view().battalions,battle={sides,status:'voting',token:'token',leftId:a.id,rightId:b.id,votes:[]};
  const gallery=siege.gallery(battle).components[0].components[0].items;assert.deepEqual(gallery.map(x=>x.media.url),['https://example.com/b.png','https://example.com/a.png','https://example.com/l.png']);
  assert.deepEqual(siege.payload(siege.view(),battle).embeds[0].fields.map(x=>x.name),['B','A']);
  assert.equal(R.resolvePair(sides[0],sides[1],[['attack'],[]],[10,10])[0].attackDamage,18);
  siege.adjust({id:a.id,heal:100});assert.equal(siege.view().battalions[0].hp,450);
});

test('custom leaders can be created, edited, assigned and deleted without deleting assignments',()=>{
  let snapshot={revision:0,workspace:{siege:{battalions:[],history:[]}}};const store={read:()=>structuredClone(snapshot),save:(workspace,revision)=>{assert.equal(revision,snapshot.revision);snapshot={revision:revision+1,workspace:structuredClone(workspace)};}};
  const siege=new Siege(store,{}),squad=siege.create({name:'Squad',kind:'guild',members:6});
  const leader=siege.saveLeader({name:'Captain',image:'https://example.com/captain.png',effects:{maxHP:100,attack:7,healSet:60}});
  siege.configure({id:squad.id,leader:{type:leader.id}});let b=siege.view().battalions[0];assert.equal(b.hp,700);assert.equal(b.leader.image,leader.image);
  siege.change(s=>{s.battalions[0].hp=550;});siege.saveLeader({...leader,name:'Captain Two',effects:{maxHP:50,attack:9,healSet:60}});
  b=siege.view().battalions[0];assert.equal(b.hp,500);assert.equal(b.leader.name,'Captain Two');assert.equal(R.bonuses(b).attack,9);
  siege.deleteLeader(leader.id);assert.equal(siege.view().leaderTypes.length,0);assert.equal(R.bonuses(siege.view().battalions[0]).attack,9);
  siege.configure({id:squad.id,leader:null});assert.equal(siege.view().battalions[0].hp,450);
});
