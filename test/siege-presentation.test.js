'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client, MessageFlags, MessagePayload } = require('discord.js');
const { Siege } = require('../src/critter/siege');
const rules = require('../src/critter/siege-rules');

function fixture() {
  let state={revision:0,workspace:{siege:{battalions:[],history:[]}}};
  const store={read:()=>structuredClone(state),save:(workspace,revision)=>{assert.equal(revision,state.revision);state={revision:revision+1,workspace:structuredClone(workspace)};}};
  const sent=[],messages=new Map(),edits=[];
  const channel={id:'channel',send:async payload=>{const message={id:String(sent.length+1),edit:async p=>{edits.push({id:message.id,payload:p});}};sent.push(payload);messages.set(message.id,message);return message;},messages:{fetch:async id=>{assert.ok(messages.has(id));return messages.get(id);}}};
  const siege=new Siege(store,{client:{isReady:()=>true},messageDestination:async()=>channel});
  const a=siege.create({name:'First',kind:'guard',members:6,image:'https://example.com/first.png'});
  const b=siege.create({name:'Second',kind:'guild',members:6,image:'https://example.com/second.png'});
  const button=(battle,choice)=>({customId:`siege:${battle.token}:${choice}`,channelId:'channel',message:{id:battle.messageId},isButton:()=>true,update:async p=>edits.push({id:battle.messageId,payload:p}),reply:async p=>{throw Error(p.content);}});
  return {siege,a,b,sent,edits,button};
}

test('choices and undo immediately update both squads planned damage, defense, healing and movement',async()=>{
  const {siege,a,b,sent,edits,button}=fixture();
  const battle=await siege.start({leftId:a.id,rightId:b.id,actions:['attack','block','move'],channelId:'channel'});
  assert.deepEqual(sent[1].components[0].toJSON().components.map(x=>x.label),['Attack','Defend','Heal','Move']);
  const first=sent[1].embeds[0].fields[0].value;
  assert.match(first,/Damage: \?\?\nDefense: \?\?\nHealing: \?\?\nMovement: \?\?/);
  const field=()=>edits.at(-1).payload.embeds[0].fields[1].value;
  await siege.onButton(button(battle,'attack'));assert.match(field(),/Damage: 15\nDefense: 0\nHealing: 0\nMovement: 0 ft\./);
  await siege.onButton(button(battle,'block'));assert.match(field(),/Damage: 15\nDefense: 15/);
  await siege.onButton(button(battle,'heal'));assert.match(field(),/Healing: 30/);
  await siege.onButton(button(battle,'move'));assert.match(field(),/Movement: 30 ft\./);
  assert.match(field(),/600\/600 HP/);
  await siege.onButton(button(battle,'undo'));assert.match(field(),/Healing: 30\nMovement: 0 ft\./);
  await siege.onButton(button(battle,'undo'));assert.match(field(),/Defense: 15\nHealing: 0/);
  await siege.onButton(button(battle,'undo'));assert.match(field(),/Damage: 15\nDefense: 0/);
  await siege.onButton(button(battle,'undo'));assert.match(field(),/Damage: 0\nDefense: 0/);
  assert.doesNotMatch(field(),/Damage taken/);
});

test('confirmed damage is the amount each squad took and stays fixed throughout narration',()=>{
  const {siege,a,b}=fixture(),result=rules.resolvePair(a,b,[['attack','attack','attack'],['block']],[10,10]);
  const frames=siege.narrate([a,b],result),last=frames.at(-1).display;
  assert.equal(result[1].incoming,30);assert.equal(result[1].damage,15);
  assert.equal(last[0].damage,0);assert.equal(last[1].damage,15);assert.equal(last[1].blocking,15);
  assert.deepEqual(siege.initialDisplay([a,b],result).map(x=>x.damage),[0,15]);
  for(const frame of frames)assert.deepEqual(frame.display.map(x=>x.damage),[0,15]);
});

test('DM values stay hidden when a leader reverses the display order and after undo',async()=>{
  const {siege,a,b,sent,edits,button}=fixture();
  siege.configure({id:a.id,leader:{type:'war',name:'Captain'}});
  const battle=await siege.start({leftId:a.id,rightId:b.id,actions:['attack','block'],channelId:'channel'});
  assert.deepEqual(sent[1].embeds[0].fields.map(x=>x.name),['Second','First']);
  assert.match(sent[1].embeds[0].fields[1].value,/Damage: \?\?\nDefense: \?\?\nHealing: \?\?\nMovement: \?\?/);
  await siege.onButton(button(battle,'block'));await siege.onButton(button(battle,'undo'));
  const fields=edits.at(-1).payload.embeds[0].fields;
  assert.match(fields[0].value,/Defense: 0/);assert.match(fields[1].value,/Defense: \?\?/);
});

test('three Discord messages, staged status, and exactly one battle resolution',async()=>{
  const {siege,a,b,sent,edits,button}=fixture();const waits=[];siege.sleep=async ms=>waits.push(ms);
  const battle=await siege.start({leftId:a.id,rightId:b.id,actions:['attack','block'],channelId:'channel'});
  assert.equal(sent.length,2);assert.equal(sent[0].flags,MessageFlags.IsComponentsV2);
  assert.equal(sent[0].content,undefined);assert.equal(sent[0].embeds,undefined);
  assert.deepEqual(sent[0].components[0].components[0].items.map(i=>i.media.url),['https://example.com/first.png','https://example.com/second.png']);
  assert.equal(sent[1].embeds.length,1);assert.equal(sent[1].embeds[0].fields.length,2);assert.ok(sent[1].embeds[0].fields.every(f=>f.inline&&!f.image));
  // Exercise discord.js serialization, including the V2 container and gallery.
  const body=MessagePayload.create({client:new Client({intents:[]})},sent[0]).resolveBody().body;
  assert.equal(body.components[0].components[0].items.length,2);
  await siege.onButton(button(battle,'attack'));await siege.onButton(button(battle,'confirm'));await siege.animation;
  assert.equal(sent.length,3);assert.equal(siege.view().active.status,'resolved');
  const results=siege.view().active.result;
  for(const update of edits.filter(e=>e.id===battle.messageId&&e.payload.content.startsWith('Battle report'))){
    for(let i=0;i<2;i++)assert.match(update.payload.embeds[0].fields[i].value,new RegExp(`Damage: ${results[i].damage}(?:\\n|$)`));
  }
  assert.ok(waits.length>0);assert.ok(waits.every(ms=>ms===2000));
  const statusEdits=edits.filter(e=>e.id===battle.messageId);
  assert.ok(statusEdits.length>=3);assert.deepEqual(statusEdits.at(-1).payload.components,[]);
  assert.ok(edits.some(e=>e.id==='3'&&e.payload.content.includes('Attack')));
  assert.equal(siege.view().history.length,1);
  const final=structuredClone(siege.view().battalions);await assert.rejects(()=>siege.onButton(button(battle,'confirm')),/no longer active/);assert.deepEqual(siege.view().battalions,final);
});

test('zero delay reveals all narration at once and missing images still produce two gallery items',async()=>{
  const {siege,a,b,sent,edits,button}=fixture();siege.edit({id:a.id,name:a.name,members:a.members,image:''});siege.sleep=async()=>{throw Error('unexpected delay');};
  const battle=await siege.start({leftId:a.id,rightId:b.id,actions:['attack'],channelId:'channel',delaySeconds:0});
  assert.equal(sent[0].components[0].components[0].items.length,2);assert.equal(sent[0].files.length,1);
  await siege.onButton(button(battle,'attack'));await siege.onButton(button(battle,'confirm'));await siege.animation;
  assert.equal(sent[2].content,siege.view().active.narration);assert.equal(edits.filter(e=>e.id==='3').length,0);
  assert.equal(siege.view().active.status,'resolved');
});

test('an interrupted presentation retains the result and can resume without rolling again',async()=>{
  const {siege,a,b,button}=fixture();let fail=true;
  siege.sleep=async()=>{if(fail){fail=false;throw Error('connection lost');}};
  const battle=await siege.start({leftId:a.id,rightId:b.id,actions:['attack'],channelId:'channel'});
  await siege.onButton(button(battle,'attack'));await siege.onButton(button(battle,'confirm'));await siege.animation;
  const saved=siege.view();assert.equal(saved.active.status,'narrating');assert.match(saved.active.presentationError,/connection lost/);
  const hp=saved.battalions.map(x=>x.hp);await siege.sync();await siege.animation;
  assert.equal(siege.view().active.status,'resolved');assert.deepEqual(siege.view().battalions.map(x=>x.hp),hp);assert.equal(siege.view().history.length,1);
});
