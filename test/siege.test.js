const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WorkspaceStore } = require('../src/critter/store');
const { Siege } = require('../src/critter/siege');

test('shared Discord votes undo in order, resolve once and survive a workspace reload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-siege-test-'));
  const store = new WorkspaceStore(dir), sent = [];
  const messages=new Map();
  const channel={id:'channel',send:async payload=>{sent.push(payload);const m={id:`message${sent.length}`,edit:async()=>{}};messages.set(m.id,m);return m;},messages:{fetch:async id=>messages.get(id)}};
  const bridge = { client:{ isReady:()=>true }, messageDestination: async()=>channel };
  const siege = new Siege(store, bridge);
  const a=siege.create({name:'Guards',kind:'guard',members:6,image:'https://example.com/guards.png'}), b=siege.create({name:'Guild',kind:'guild',members:6,image:'https://example.com/guild.png'});
  const battle=await siege.start({leftId:a.id,rightId:b.id,actions:['attack','attack','block'],channelId:'channel',delaySeconds:0});
  assert.equal(sent.length,2); assert.equal(sent[1].components.length,2);
  assert.deepEqual(sent[0].components[0].components[0].items.map(e=>e.media.url),['https://example.com/guards.png','https://example.com/guild.png']);
  const click = async (key,user='player') => { const i={customId:`siege:${battle.token}:${key}`,channelId:'channel',message:{id:battle.messageId},user:{id:user},isButton:()=>true,update:async p=>{i.payload=p;i.replied=true;},reply:async p=>{i.payload=p;i.replied=true;}};await siege.onButton(i);return i; };
  await click('attack','one'); await click('block','two'); await click('undo','three'); assert.deepEqual(siege.view().active.votes,['attack']);
  await click('undo','one'); assert.deepEqual(siege.view().active.votes,[]); await click('attack');
  const finished=await click('confirm','anyone'); await siege.animation;assert.equal(siege.view().active.status,'resolved'); assert.match(finished.payload.embeds[0].fields[0].value,/HP/);
  assert.deepEqual(finished.payload.components,[]);assert.equal(finished.payload.embeds.length,1);
  const prior=siege.view().battalions.map(x=>x.hp); const stale=await click('confirm','other'); assert.match(stale.payload.content,/no longer active/); assert.deepEqual(siege.view().battalions.map(x=>x.hp),prior);
  const reload=new WorkspaceStore(dir); assert.equal(reload.read().workspace.siege.active.status,'resolved'); assert.deepEqual(reload.read().workspace.siege.battalions.map(x=>x.hp),prior);
});

test('cancel leaves HP and healing uses unchanged', async () => {
  const store=new WorkspaceStore(fs.mkdtempSync(path.join(os.tmpdir(),'aina-siege-cancel-')));
  const bridge={client:{isReady:()=>true},messageDestination:async()=>({id:'channel',send:async()=>({id:'message'})})};
  const siege=new Siege(store,bridge), a=siege.create({name:'A',kind:'guild',members:6}), b=siege.create({name:'B',kind:'bandit',members:6});
  siege.edit({id:a.id,name:'A enlarged',members:8}); assert.equal(siege.view().battalions[0].hp,800);
  const battle=await siege.start({leftId:a.id,rightId:b.id,actions:['heal'],channelId:'channel'});
  assert.throws(()=>siege.reset(a.id),/Finish or cancel/);
  let payload;const i={customId:`siege:${battle.token}:cancel`,channelId:'channel',message:{id:'message'},isButton:()=>true,update:async p=>{payload=p;},reply:async()=>{}};await siege.onButton(i);
  assert.deepEqual(payload.components,[]);assert.equal(payload.embeds.length,1);
  assert.equal(siege.view().active.status,'cancelled'); assert.equal(siege.view().battalions[0].hp,800); assert.deepEqual(siege.view().battalions[0].healsUsed,[]);
});

test('custom types, image replacement, template deletion and battalion deletion preserve saved stats', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aina-siege-types-')),store=new WorkspaceStore(dir),siege=new Siege(store,{});
  const t=siege.saveType({name:'Medics',defaultMembers:4,hpPerMember:50,attack:7,block:12,acPerBlock:2,baseAC:4,move:20,heal:15,healUsesPerMember:2,bonusThreshold:100,bonusAttack:14});
  const b=siege.create({name:'Medical squad',kind:t.id,members:4,image:'https://example.com/old.png'});
  assert.equal(b.hp,200);assert.equal(b.rules.attack,7);
  siege.saveType({...t,attack:22});assert.equal(siege.view().battalions[0].rules.attack,7);
  siege.edit({id:b.id,name:b.name,members:4,image:'https://example.com/new.png'});assert.equal(siege.view().battalions[0].image,'https://example.com/new.png');
  siege.edit({id:b.id,name:b.name,members:4,image:''});assert.equal(siege.view().battalions[0].image,'');
  siege.deleteType(t.id);assert.equal(siege.view().types.some(x=>x.id===t.id),false);assert.equal(siege.view().battalions[0].rules.attack,7);
  siege.reset(b.id);assert.equal(siege.view().battalions[0].hp,200);
  const reloaded=new Siege(new WorkspaceStore(dir),{});assert.equal(reloaded.view().battalions[0].rules.hpPerMember,50);
  reloaded.remove(b.id);assert.equal(reloaded.view().battalions.length,0);
  assert.throws(()=>reloaded.saveType({name:'Bad',hpPerMember:0}),/positive/);
});

test('custom type rules affect actual combat, including healing uses and movement', () => {
  const rules={...require('../src/critter/siege-rules').PRESETS.guild,hpPerMember:50,attack:12,baseAC:4,acPerBlock:3,move:20,heal:10,healUsesPerMember:2};
  const a={kind:'custom',rules,members:4,hp:151,healsUsed:[0]},b={kind:'guard',members:6,hp:600,healsUsed:[]};
  const [out]=require('../src/critter/siege-rules').resolvePair(a,b,[['heal','move','attack','block'],[]],[20,1]);
  assert.equal(out.healed,10);assert.equal(out.move,20);assert.equal(out.attack.damage,12);assert.equal(out.ac,7);assert.deepEqual(out.used,[0,0]);
});
