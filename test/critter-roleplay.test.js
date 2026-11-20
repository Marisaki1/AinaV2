'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {WorkspaceStore}=require('../src/critter/store');const {Roleplay,formatDialogue}=require('../src/critter/roleplay');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=','base64');

test('nested asset folders preserve paths, duplicate filenames, NPC grouping, and reject traversal',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aina-rp-folders-')),rp=new Roleplay(new WorkspaceStore(dir),{},path.join(dir,'assets'));
  rp.createFolder('Town/Guild');rp.createFolder('Empty');
  const image='data:image/png;base64,'+png.toString('base64');
  rp.upload({name:'Captain.png',folder:'Town/Guild',image});rp.upload({name:'Captain.png',folder:'Enemies',image});
  assert.deepEqual(rp.assets().map(a=>a.name),['Enemies/Captain.png','Town/Guild/Captain.png']);
  assert.ok(rp.view().folders.includes('Empty'));assert.equal(rp.assets()[1].folder,'Town/Guild');
  assert.equal(rp.image('Town/Guild/Captain.png').buffer.equals(png),true);
  const npc=rp.save({name:'Captain',image:'Town/Guild/Captain.png',folder:'Allies/Guild'});
  rp.save({id:npc.id,name:'Captain renamed',image:npc.image});assert.equal(rp.view().npcs[0].folder,'Allies/Guild');
  for(const folder of ['../escape','a/../../escape','C:/escape','/absolute','a\\b','a//b']){
    assert.throws(()=>rp.createFolder(folder));assert.throws(()=>rp.upload({name:'Captain.png',folder,image}));
  }
  assert.throws(()=>rp.image('../workspace.json'));assert.throws(()=>rp.upload({name:'Captain.png',folder:'Town/Guild',image}),/EEXIST/);
});
test('voice styles prefix every line and leave normal speech unchanged',()=>{
  assert.equal(formatDialogue('Sagume','Hello\nAgain','whisper'),'-# > Sagume: Hello\n-# > Sagume: Again');
  assert.equal(formatDialogue('Sagume','Hello\nAgain','shout'),'# > Sagume: Hello\n# > Sagume: Again');
  assert.equal(formatDialogue('Sagume','Hello'),' > Sagume: Hello'.trimStart());
});
test('shared artwork uses portable paths alongside existing NPC images', t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aina-shared-artwork-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const roots={repository:path.join(dir,'artwork'),private:path.join(dir,'artwork-private')};
  const rp=new Roleplay(new WorkspaceStore(dir),{},path.join(dir,'legacy'),roots);
  const image='data:image/png;base64,'+png.toString('base64');
  const {repository,private:local}=rp.view().artworkFolders;
  rp.upload({name:'Old.png',image});
  const publicImage=rp.upload({name:'Izumi.png',folder:repository+'/TouhouDND/Portraits',image});
  const privateImage=rp.upload({name:'Izumi.png',folder:local,image});
  assert.deepEqual(fs.readFileSync(path.join(roots.repository,'TouhouDND','Portraits','Izumi.png')),png);
  assert.deepEqual(fs.readFileSync(path.join(roots.private,'Izumi.png')),png);
  assert.deepEqual(rp.assets().map(asset=>asset.name).sort(), ['Old.png',privateImage.name,publicImage.name].sort());
  const npc=rp.save({name:'Izumi',image:publicImage.name});
  assert.equal(npc.image,repository+'/TouhouDND/Portraits/Izumi.png');
  assert.deepEqual(rp.image(npc.image).buffer,png);
  assert.throws(()=>rp.image(repository+'/../Old.png'));
  assert.throws(()=>rp.upload({name:'Other.png',folder:local+'/../artwork',image}));
});
test('NPC assets, edits, remembered channels and webhook delivery remain local and confirmed',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aina-rp-')),store=new WorkspaceStore(dir),sent=[],edits=[];
  const webhook={id:'111',token:'not-a-real-secret',edit:async x=>edits.push(x),send:async x=>{sent.push(x);return {id:'555'};}};
  const channel={id:'123',createWebhook:async()=>webhook,isThread:()=>false};const bridge={client:{isReady:()=>true},messageDestination:async id=>{assert.equal(id,'123');return channel;}};
  const rp=new Roleplay(store,bridge,path.join(dir,'assets'));rp.makeWebhook=()=>webhook;
  rp.upload({name:'Mara.png',image:'data:image/png;base64,'+png.toString('base64')});assert.equal(rp.assets()[0].label,'Mara');
  assert.throws(()=>rp.upload({name:'../x.png',image:'data:image/png;base64,'+png.toString('base64')}));
  const npc=rp.save({name:'Mara',tag:'Captain',image:'Mara.png',channelId:'123'});rp.configure({channelId:'123'});
  const out=await rp.send({id:npc.id,text:'Hello',requestId:'aaaaaaaaaaaaaaaa'});assert.equal(out.delivery,'sent');assert.equal(sent.length,1);assert.equal(sent[0].username,'Mara');assert.equal(sent[0].content,'> Mara: Hello');assert.deepEqual(sent[0].allowedMentions,{parse:[]});
  await rp.send({id:npc.id,text:'Hello',requestId:'aaaaaaaaaaaaaaaa'});assert.equal(sent.length,1);
  await rp.send({id:npc.id,text:'Quiet\nplease',requestId:'gggggggggggggggg',voice:'whisper'});assert.equal(sent[1].content,'-# > Mara: Quiet\n-# > Mara: please');
  await assert.rejects(()=>rp.send({id:npc.id,text:'Quiet\nplease',requestId:'gggggggggggggggg',voice:'shout'}),/different post/);
  rp.upload({name:'Other.png',image:'data:image/png;base64,'+png.toString('base64')});await rp.send({id:npc.id,text:'Hi',requestId:'ffffffffffffffff',displayName:'Temporary',displayImage:'Other.png'});assert.equal(sent[2].username,'Temporary');assert.equal(sent[2].content,'> Temporary: Hi');assert.equal(rp.view().npcs[0].name,'Mara');assert.equal(rp.view().npcs[0].image,'Mara.png');
  rp.save({...npc,name:'Mara Voss',tag:'Leader'});assert.equal(rp.view().npcs[0].name,'Mara Voss');assert.equal(rp.view().npcs[0].channelId,'123');assert.ok(!JSON.stringify(rp.view()).includes('not-a-real-secret'));
  rp.remove(npc.id);assert.equal(rp.view().npcs.length,0);assert.equal(rp.assets().length,2);
});
test('dialogue prefixes each line, retains the draft on long messages and identifies missing thread permissions',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aina-rp-format-')),store=new WorkspaceStore(dir),sent=[];
  const hook={id:'111',token:'secret',send:async x=>{sent.push(x);return {id:'555'};}};
  const parent={id:'123',name:'adventure',createWebhook:async()=>hook},channel={id:'456',parent,isThread:()=>true};
  const rp=new Roleplay(store,{client:{isReady:()=>true},messageDestination:async()=>channel},path.join(dir,'assets'));
  const n=rp.save({name:'Hana',channelId:'456'});
  await rp.send({id:n.id,text:'First line\nSecond line',requestId:'cccccccccccccccc'});assert.equal(sent[0].content,'> Hana: First line\n> Hana: Second line');
  await assert.rejects(()=>rp.send({id:n.id,text:'x'.repeat(2000),requestId:'dddddddddddddddd'}),/2,000-character/);assert.equal(sent.length,1);
  const deniedParent={id:'789',name:'adventure',createWebhook:async()=>{throw Object.assign(new Error('bad'),{code:50013,status:403});}};
  const other=new Roleplay(new WorkspaceStore(path.join(dir,'other')),{client:{isReady:()=>true},messageDestination:async()=>({id:'456',parent:deniedParent,isThread:()=>true})},path.join(dir,'other-assets'));
  const npc=other.save({name:'Hana',channelId:'456'});await assert.rejects(()=>other.send({id:npc.id,text:'Hello',requestId:'eeeeeeeeeeeeeeee'}),/Manage Webhooks.*parent channel/);
});
test('thread posts use parent webhook and ambiguous sends are not retried',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aina-rp-thread-')),store=new WorkspaceStore(dir);let calls=0;
  const hook={id:'111',token:'secret',send:async x=>{calls++;assert.equal(x.threadId,'456');throw Error('connection lost');}};
  const parent={id:'123',createWebhook:async()=>hook},channel={id:'456',parent,isThread:()=>true};
  const rp=new Roleplay(store,{client:{isReady:()=>true},messageDestination:async()=>channel},path.join(dir,'assets'));const n=rp.save({name:'Voice',channelId:'456'});
  const request={id:n.id,text:'Hello',requestId:'bbbbbbbbbbbbbbbb'};assert.equal((await rp.send(request)).delivery,'uncertain');assert.equal((await rp.send(request)).delivery,'uncertain');assert.equal(calls,1);
});
test('edits the original thread webhook message, preserves voice and keeps history unchanged on failure',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aina-rp-edit-')),store=new WorkspaceStore(dir),edits=[];
  const hook={id:'111',token:'secret',send:async()=>({id:'555'}),editMessage:async(id,options)=>{edits.push({id,options});return {id};}};
  const parent={id:'123',createWebhook:async()=>hook},channel={id:'456',parent,isThread:()=>true};
  const rp=new Roleplay(store,{client:{isReady:()=>true},messageDestination:async()=>channel},path.join(dir,'assets'));rp.makeWebhook=()=>hook;
  const n=rp.save({name:'Hana',channelId:'456'}),id='aaaaaaaaaaaaaaaa';await rp.send({id:n.id,text:'Before',requestId:id,voice:'whisper',displayName:'Other Hana'});
  const result=await rp.editMessage({requestId:id,originalText:'Before',text:'One\nTwo'});assert.equal(result.delivery,'edited');
  assert.equal(edits[0].id,'555');assert.deepEqual(edits[0].options,{content:'-# > Other Hana: One\n-# > Other Hana: Two',allowedMentions:{parse:[]},threadId:'456'});
  assert.equal(rp.view().recent[0].text,'One\nTwo');assert.ok(rp.view().recent[0].editedAt);
  await assert.rejects(()=>rp.editMessage({requestId:id,originalText:'Before',text:'Stale'}),/changed elsewhere/);
  hook.editMessage=async()=>{throw Object.assign(new Error('missing'),{code:10008,status:404});};
  await assert.rejects(()=>rp.editMessage({requestId:id,originalText:'One\nTwo',text:'Lost'}),/no longer exists/);assert.equal(rp.view().recent[0].text,'One\nTwo');
  await assert.rejects(()=>rp.editMessage({requestId:id,originalText:'One\nTwo',text:'x'.repeat(2000)}),/2,000-character/);
});
