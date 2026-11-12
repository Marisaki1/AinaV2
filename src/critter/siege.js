'use strict';
const { randomUUID, randomInt } = require('crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs=require('fs');
const path=require('path');
const R = require('./siege-rules');
const clone = x => JSON.parse(JSON.stringify(x));
const names = {guard:'Guard',guild:'Guild member',bandit:'Bandit',bandit_archer:'Bandit Archers'};
function nameOf(value) {
  const name=String(value||'').trim();
  if(!name || name.length>80 || /[\r\n]/.test(name)) throw new Error('Enter a name with 1–80 characters.');
  return name;
}
function imageOf(value) {
  const image=String(value||'').trim();
  if(!image) return '';
  if(/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(image) && image.length<=1400000) return image;
  try {const url=new URL(image);if(url.protocol==='https:' && !url.username && !url.password && image.length<=1000)return image;}catch{}
  throw new Error('Use an HTTPS image link or a PNG, JPEG, or WebP file under 1 MB.');
}
function countOf(value) {const n=Number(value);if(!Number.isInteger(n)||n<1||n>100)throw new Error('Choose 1–100 members.');return n;}
function typeRules(data) {
  const defaults=R.PRESETS.guard, rules={};
  for(const key of Object.keys(defaults)) {
    if(typeof defaults[key]==='boolean')continue;
    const n=Number(data[key]??defaults[key]);
    if(!Number.isSafeInteger(n)||n<(key==='hpPerMember'?1:['attackRoll','hitPerAttacker'].includes(key)?-100000:0)||n>100000)throw new Error('Type stats must be whole numbers up to 100,000; HP must be positive.');
    rules[key]=n;
  }
  const per=Number(data.hitPerAttacker??0);if(!Number.isSafeInteger(per)||Math.abs(per)>100000)throw new Error('Hit bonus per attacker must be a whole number between -100,000 and 100,000.');rules.hitPerAttacker=per;
  for(const key of ['noHealingUses','doubleAtHalfMembers']){if(data[key]!==undefined&&typeof data[key]!=='boolean')throw new Error('Invalid battalion setting.');rules[key]=data[key]??false;}
  rules.attackMode=attackMode(data.attackMode);return rules;
}
function attackMode(value){const mode=value||'normal';if(!['normal','advantage','disadvantage'].includes(mode))throw new Error('Choose normal, advantage, or disadvantage.');return mode;}
function leaderFor(s,input,previous){if(input===null)return null;const type=String(input.type||''),custom=s.leaderTypes?.find(x=>x.id===type),preset=R.LEADERS[type],old=previous?.type===type?previous:null;if(!preset&&!custom&&!old)throw new Error('Choose a leader type.');const effects=custom?.effects||old?.effects;return {type,name:nameOf(input.name||custom?.name||preset?.label||old?.name),image:imageOf(input.image??custom?.image??old?.image),...(effects?{effects:clone(effects)}:{})};}

class Siege {
  constructor(store,bridge) {
    this.store=store;this.bridge=bridge;this.busy=false;this.animation=null;
    this.sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    if(!this.view().types)this.change(s=>{
      s.types=Object.entries(R.PRESETS).map(([id,rules])=>({id,name:names[id],defaultMembers:6,...rules}));
      for(const b of s.battalions){b.rules||=clone(R.PRESETS[b.kind]||R.PRESETS.guard);b.typeName||=names[b.kind]||'Custom';}
    });
    if(!this.view().requestedRulesV1){
      if(store.file&&fs.existsSync(store.file)){const dir=path.join(store.directory,'siege-backups');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(store.file,path.join(dir,`before-preset-update-${Date.now()}.json`),fs.constants.COPYFILE_EXCL);}
      this.change(s=>{
        for(const [id,name] of Object.entries(names)){
          let item=s.types.find(t=>t.id===id)||s.types.find(t=>String(t.name).trim().toLowerCase()===name.toLowerCase());
          if(!item){item={id,name,defaultMembers:6,...clone(R.PRESETS[id])};s.types.push(item);}
          else{const p=R.PRESETS[id];for(const k of ['hpPerMember','attack','block','acPerBlock','healUsesPerMember','noHealingUses','move','bonusThreshold','doubleAtHalfMembers','hitPerAttacker'])item[k]=p[k];if(id!=='guild')item.heal=0;}
        }
        s.requestedRulesV1=true;
      });
    }
    if(!this.view().requestedRulesV2){
      if(store.file&&fs.existsSync(store.file)){const dir=path.join(store.directory,'siege-backups');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(store.file,path.join(dir,`before-action-update-${Date.now()}.json`),fs.constants.COPYFILE_EXCL);}
      this.change(s=>{
        for(const t of s.types){t.hitPerAttacker=1;t.acPerBlock=2;if(t.id==='guard'&&t.attackRoll===1)t.attackRoll=0;}
        for(const b of s.battalions){b.rules||=clone(R.PRESETS[b.kind]||R.PRESETS.guard);b.rules.hitPerAttacker=1;b.rules.acPerBlock=2;if(b.kind==='guard'&&b.rules.attackRoll===1)b.rules.attackRoll=0;}
        if(s.battleSettings){s.battleSettings.blockAC=null;s.battleSettings.critBase=20;s.battleSettings.critPerExtra=1;s.battleSettings.critMinimum=2;}
        s.requestedRulesV2=true;
      });
    }
  }
  view(){return this.store.read().workspace.siege;}
  change(fn){const state=this.store.read();const result=fn(state.workspace.siege);this.store.save(state.workspace,state.revision);return result;}
  idle(){if(this.busy)throw new Error('Wait for the current siege action to finish.');}
  editable(s,id){this.idle();if(['voting','narrating'].includes(s.active?.status)&&[s.active.leftId,s.active.rightId].includes(id))throw new Error('Finish or cancel the active battle before changing this battalion.');}
  saveType(data){
    this.idle();const existing=data.id?this.view().types.find(t=>t.id===data.id):null,item={id:data.id||randomUUID(),name:nameOf(data.name),defaultMembers:countOf(data.defaultMembers??6),...typeRules(data),image:imageOf(data.image??existing?.image??'')};
    this.change(s=>{const i=s.types.findIndex(x=>x.id===item.id);if(data.id&&i<0)throw new Error('Type not found.');if(i<0)s.types.push(item);else s.types[i]=item;});return item;
  }
  deleteType(id){this.idle();this.change(s=>{if(!s.types.some(t=>t.id===id))throw new Error('Type not found.');s.types=s.types.filter(t=>t.id!==id);});}
  saveLeader(data){
    this.idle();const effects={};for(const key of R.BONUS_KEYS){const n=Number(data.effects?.[key]??0);if(!Number.isSafeInteger(n)||Math.abs(n)>100000)throw new Error('Leader effects must be whole numbers between -100,000 and 100,000.');effects[key]=n;}
    effects.attackMode=attackMode(data.effects?.attackMode);const heal=data.effects?.healSet;if(heal!==''&&heal!==null&&heal!==undefined){effects.healSet=Number(heal);if(!Number.isSafeInteger(effects.healSet)||effects.healSet<0||effects.healSet>100000)throw new Error('Healing replacement must be a whole number from 0 to 100,000.');}
    const item={id:data.id||randomUUID(),name:nameOf(data.name),image:imageOf(data.image),effects};
    this.change(s=>{s.leaderTypes||=[];const i=s.leaderTypes.findIndex(x=>x.id===item.id);if(data.id&&i<0)throw new Error('Leader not found.');
      if(i<0)s.leaderTypes.push(item);else{
        const previous=s.leaderTypes[i],affected=s.battalions.filter(b=>b.leader?.type===item.id);
        if(s.active?.status==='narrating'&&affected.some(b=>[s.active.leftId,s.active.rightId].includes(b.id)))throw new Error('Wait for the current battle narration to finish.');
        for(const b of affected){const before=R.maximumHP(b),hp=b.hp;b.leader.effects=clone(item.effects);if(b.leader.name===previous.name)b.leader.name=item.name;if(b.leader.image===previous.image)b.leader.image=item.image;const max=R.maximumHP(b);if(max<1||R.bonuses(b).extraHeals<0)throw new Error('A squad would have invalid maximum HP or healing uses.');b.hp=hp===0?0:Math.max(0,Math.min(max,hp+max-before));
          if(s.active?.status==='voting'){const side=[s.active.leftId,s.active.rightId].indexOf(b.id);if(side>=0){s.active.sides[side]=clone(b);const choices=side===0?s.active.actions:s.active.votes,allowed=R.sideMembers(b);if(choices.length>allowed){choices.length=allowed;s.active.choicesTrimmed=true;}}}
        }
        s.leaderTypes[i]=item;
      }
    });return item;
  }
  deleteLeader(id){this.idle();this.change(s=>{if(!s.leaderTypes?.some(x=>x.id===id))throw new Error('Leader not found.');s.leaderTypes=s.leaderTypes.filter(x=>x.id!==id);});}
  saveSettings(data){this.idle();const settings=R.battleSettings(data);this.change(s=>{if(['voting','narrating'].includes(s.active?.status))throw new Error('Finish the current battle before changing its rules.');s.battleSettings=settings;});return settings;}
  configure(data){
    this.change(s=>{this.idle();if(s.active?.status==='narrating'&&[s.active.leftId,s.active.rightId].includes(data.id))throw new Error('Wait for the current battle narration to finish.');const b=s.battalions.find(x=>x.id===data.id);if(!b)throw new Error('Battalion not found.');
      const before=R.maximumHP(b),oldHP=b.hp;
      if(data.leader!==undefined)b.leader=leaderFor(s,data.leader,b.leader);
      if(data.bonuses!==undefined){const bonus={};for(const key of R.BONUS_KEYS){const n=Number(data.bonuses[key]??0);if(!Number.isSafeInteger(n)||Math.abs(n)>100000)throw new Error('Modifiers must be whole numbers between -100,000 and 100,000.');bonus[key]=n;}bonus.attackMode=attackMode(data.bonuses.attackMode);b.bonuses=bonus;}
      const max=R.maximumHP(b);if(max<1||R.bonuses(b).extraHeals<0)throw new Error('Maximum HP must be positive and extra healing uses cannot be negative.');
      b.hp=oldHP===0?0:Math.max(0,Math.min(max,oldHP+max-before));
      if(s.active?.status==='voting'){
        const i=[s.active.leftId,s.active.rightId].indexOf(b.id);
        if(i>=0){const choices=i===0?s.active.actions:s.active.votes,allowed=R.sideMembers(b);s.active.sides[i]=clone(b);if(choices.length>allowed){choices.length=allowed;s.active.choicesTrimmed=true;}}
      }
    });
  }
  adjust(data){this.change(s=>{this.editable(s,data.id);const b=s.battalions.find(x=>x.id===data.id);if(!b)throw new Error('Battalion not found.');
    if(data.restoreHeals){b.healsUsed=[];b.extraHealsUsed=0;return;}
    const isUses=data.healUses!==undefined,raw=isUses?data.healUses:data.heal,amount=Number(raw);
    if(raw===null||raw===''||!Number.isSafeInteger(amount)||Math.abs(amount)>100000||amount===0)throw new Error('Enter a nonzero whole number between -100,000 and 100,000.');
    if(isUses){
      b.healsUsed||=[];b.extraHealsUsed||=0;
      if(amount>0){
        const extra=Math.min(amount,b.extraHealsUsed);b.extraHealsUsed-=extra;
        b.healsUsed.splice(Math.max(0,b.healsUsed.length-(amount-extra)));
      }else{
        const rules=R.rulesFor(b),limit=rules.healUsesPerMember;
        if(!rules.noHealingUses&&!limit)throw new Error('This squad has unlimited standard healing uses.');
        let remaining=-amount;
        if(!rules.noHealingUses)for(let i=0;i<R.sideMembers(b)&&remaining;i++){
          const spent=b.healsUsed.filter(v=>v===i).length,take=Math.min(remaining,Math.max(0,limit-spent));
          for(let n=0;n<take;n++)b.healsUsed.push(i);remaining-=take;
        }
        b.extraHealsUsed+=Math.min(remaining,Math.max(0,R.bonuses(b).extraHeals-b.extraHealsUsed));
      }
      return;
    }
    if(!b.hp&&amount>0)throw new Error('Healing cannot revive a defeated battalion.');
    b.hp=Math.max(0,Math.min(R.maximumHP(b),b.hp+amount));
  });}
  create(data){
    this.idle();const s=this.view(),type=s.types.find(t=>t.id===data.kind);
    if(!type)throw new Error('Choose a battalion type, or create one first.');
    const b={id:randomUUID(),name:nameOf(data.name),kind:type.id,typeName:type.name,rules:typeRules(type),members:countOf(data.members),healsUsed:[],image:imageOf(data.image??type.image),leader:data.leader?leaderFor(s,data.leader):null};
    b.hp=R.maximumHP(b);if(b.hp<1||R.bonuses(b).extraHeals<0)throw new Error('Maximum HP must be positive and extra healing uses cannot be negative.');this.change(v=>v.battalions.push(b));return b;
  }
  reset(id){this.change(s=>{this.editable(s,id);const b=s.battalions.find(x=>x.id===id);if(!b)throw new Error('Battalion not found.');b.hp=R.maximumHP(b);b.healsUsed=[];b.extraHealsUsed=0;});}
  remove(id){this.change(s=>{this.editable(s,id);if(!s.battalions.some(b=>b.id===id))throw new Error('Battalion not found.');s.battalions=s.battalions.filter(b=>b.id!==id);});}
  edit(data){
    const name=nameOf(data.name),members=countOf(data.members);
    this.change(s=>{
      this.idle();if(s.active?.status==='narrating'&&[s.active.leftId,s.active.rightId].includes(data.id))throw new Error('Wait for the current battle narration to finish.');const b=s.battalions.find(x=>x.id===data.id);if(!b)throw new Error('Battalion not found.');
      const lost=R.maximumHP(b)-b.hp;
      if(data.kind!==undefined){const type=s.types.find(t=>t.id===data.kind);if(!type)throw new Error('Type not found.');b.kind=type.id;b.typeName=type.name;b.rules=typeRules(type);}
      if(data.image!==undefined)b.image=imageOf(data.image);
      if(data.leader!==undefined)b.leader=leaderFor(s,data.leader,b.leader);
      b.name=name;b.members=members;b.hp=b.hp===0?0:Math.max(0,R.maximumHP(b)-lost);
      if(R.maximumHP(b)<1||R.bonuses(b).extraHeals<0)throw new Error('Maximum HP must be positive and extra healing uses cannot be negative.');
      if(s.active?.status==='voting'){const i=[s.active.leftId,s.active.rightId].indexOf(b.id);if(i>=0){s.active.sides[i]=clone(b);const choices=i===0?s.active.actions:s.active.votes,allowed=R.sideMembers(b);if(choices.length>allowed){choices.length=allowed;s.active.choicesTrimmed=true;}}}
    });
  }
  static components(token,closed=false){
    if(closed)return [];
    const button=(key,label,style)=>new ButtonBuilder().setCustomId(`siege:${token}:${key}`).setLabel(label).setStyle(style);
    return [new ActionRowBuilder().addComponents(button('attack','Attack',ButtonStyle.Danger),button('block','Defend',ButtonStyle.Primary),button('heal','Heal',ButtonStyle.Success),button('move','Move',ButtonStyle.Secondary)),new ActionRowBuilder().addComponents(button('undo','Undo',ButtonStyle.Secondary),button('confirm','Confirm',ButtonStyle.Success),button('cancel','Cancel',ButtonStyle.Danger))];
  }
  summary(s,battle){
    const a=s.battalions.find(x=>x.id===battle.leftId),b=s.battalions.find(x=>x.id===battle.rightId);
    const counts=['attack','block','heal','move'].map(k=>`${k==='block'?'defend':k}: ${battle.votes.filter(x=>x===k).length}`).join(' · ');
    return `⚔️ **${a.name} vs ${b.name}**\n**${b.name} — assign actions (${battle.votes.length}/${R.sideMembers(b)})**\n${counts}\n${battle.choicesTrimmed?'Some choices were removed because the squad lost available members.\n':''}Undo removes the latest shared choice. Confirm begins the battle; Cancel ends it.`;
  }
  displayOrder(sides){return sides[0].leader&&!sides[1].leader?[1,0]:[0,1];}
  gallery(battle){
    const files=[];
    const order=this.displayOrder(battle.sides);
    // In a two-column gallery, squads occupy the first row and leaders the second.
    // Discord controls the final layout, particularly for three images and mobile clients.
    const pictures=[...order.map(i=>({i,j:0})),...order.filter(i=>battle.sides[i].leader).map(i=>({i,j:1}))];
    const items=pictures.map(({i,j})=>{const side=battle.sides[i],item=j?side.leader:side;
      let url=item.image;
      if(!url)url='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
      if(url.startsWith('data:')){const [header,contents]=url.split(','),ext=header.includes('png')?'png':header.includes('webp')?'webp':'jpg',filename=`squad-${i}-${j}.${ext}`;files.push({attachment:Buffer.from(contents,'base64'),name:filename});url='attachment://'+filename;}
      return {media:{url},description:j?`${side.name} leader: ${item.name}`:side.name};
    });
    return {flags:MessageFlags.IsComponentsV2,components:[{type:17,components:[{type:12,items}]}],...(files.length?{files}:{}),allowedMentions:{parse:[]}};
  }
  payload(s,battle){
    const sides=battle.sides||[s.battalions.find(x=>x.id===battle.leftId),s.battalions.find(x=>x.id===battle.rightId)];
    let plans=battle.result;
    if(battle.status==='voting'){try{plans=R.resolvePair(sides[0],sides[1],[battle.actions,battle.votes],[10,10],battle.settings);}catch{plans=null;}}
    const fields=this.displayOrder(sides).map(i=>{const b=sides[i];
      const oldResult=battle.status==='resolved'&&!battle.frames?battle.result?.[i]:null;
      const plan=plans?.[i],step=battle.display?.[i]||(oldResult?{hp:oldResult.hp,healing:oldResult.healed,damage:oldResult.damage,blocking:oldResult.blocking,movement:oldResult.move}:{hp:b.hp,healing:plan?.healingPotential??0,damage:plan?.attackDamage??0,blocking:plan?.blocking??0,movement:plan?.move??0});
      const max=R.maximumHP(b),filled=Math.max(0,Math.min(10,Math.round(step.hp/max*10)));
      const hidden=battle.status==='voting'&&i===0;
      return {name:b.name,value:`${b.typeName||names[b.kind]||'Battalion'} · ${R.sideMembers(b,step.hp)}/${b.members} members${b.leader?`\nLeader: ${b.leader.name}`:''}\n${'▰'.repeat(filled)}${'▱'.repeat(10-filled)} **${step.hp}/${max} HP**\nDamage: ${hidden?'??':step.damage??0}\nDefense: ${hidden?'??':step.blocking??0}\nHealing: ${hidden?'??':step.healing??0}\nMovement: ${hidden?'??':`${step.movement??0} ft.`}`,inline:true};
    });
    return {content:battle.status==='voting'?this.summary(s,battle)+'\nYour damage and healing show assigned amounts before rolls, defense, and HP limits.':battle.status==='cancelled'?'Battle cancelled. HP and healing uses were not spent.':'Battle report · Damage is the amount each squad took this turn.',embeds:[{color:0x4169e1,fields}],components:Siege.components(battle.token,battle.status!=='voting'),allowedMentions:{parse:[]}};
  }
  async sync(){this.idle();this.busy=true;try{const s=this.view(),b=s.active;if(!b?.messageId)throw new Error('No Discord battle post to refresh.');const channel=await this.bridge.messageDestination(b.channelId);const message=await channel.messages.fetch(b.messageId);if(b.status==='narrating'&&b.narrationSending&&!this.animation){this.change(v=>{v.active.status='resolved';v.active.display=clone(v.active.frames.at(-1).display);v.active.presentationError='The narration send was interrupted. Check the Discord channel; the saved result is shown here.';});const current=this.view();await message.edit(this.payload(current,current.active));return;}await message.edit(this.payload(s,b));if(b.status==='voting'&&b.galleryMessageId){const gallery=await channel.messages.fetch(b.galleryMessageId);await gallery.edit({...this.gallery(b),attachments:[]});}if(b.status==='narrating'&&!this.animation)this.launchAnimation(b.token);}finally{this.busy=false;}}
  async start(data){
    this.idle();this.busy=true;
    try{
      const s=this.view();if(['voting','narrating'].includes(s.active?.status))throw new Error('Finish or cancel the current battle first.');
      const a=s.battalions.find(x=>x.id===data.leftId),b=s.battalions.find(x=>x.id===data.rightId);if(!a||!b||a.id===b.id)throw new Error('Choose two different battalions.');
      const settings=R.battleSettings(s.battleSettings),actions=data.actions;if(!Array.isArray(actions))throw new Error('Choose your actions.');R.resolvePair(a,b,[actions,[]],[10,10],settings);
      if(!this.bridge.client?.isReady())throw new Error('Start the Discord bot before posting a battle.');
      const delay=Number(data.delaySeconds??s.delaySeconds??2);if(!Number.isFinite(delay)||delay<0||delay>60)throw new Error('Narration delay must be between 0 and 60 seconds.');
      const channel=await this.bridge.messageDestination(data.channelId),battle={token:randomUUID(),leftId:a.id,rightId:b.id,sides:clone([a,b]),settings,actions,votes:[],status:'voting',channelId:channel.id,messageId:'',delaySeconds:delay};
      const gallery=await channel.send(this.gallery(battle));battle.galleryMessageId=gallery.id;
      let sent;try{sent=await channel.send(this.payload(s,battle));}catch(error){throw new Error(`The image gallery was posted, but the battle controls could not be posted: ${error.message}`);}battle.messageId=sent.id;
      this.change(state=>{state.active=battle;state.delaySeconds=delay;});return battle;
    }finally{this.busy=false;}
  }
  initialDisplay(sides,result){return sides.map((side,i)=>({hp:side.hp,healing:result[i].healingPotential??result[i].healed,damage:result[i].damage,blocking:result[i].blocking,movement:result[i].move}));}
  narrate(sides,result,settings={}){
    const frames=[],display=this.initialDisplay(sides,result),pick=a=>a[randomInt(a.length)],unit=n=>n===1?'member':'members';
    const add=line=>frames.push({line,display:clone(display)});
    for(let i=0;i<2;i++)if(result[i].move)add(`**Movement** · ${sides[i].name} ${pick(['advances','moves','marches'])} **${result[i].move} ft.**`);
    for(let i=0;i<2;i++)if(result[i].counts.heal){display[i].hp=result[i].afterHeal;display[i].healing=result[i].healed;add(`**Healing** · ${result[i].counts.heal} ${unit(result[i].counts.heal)} of ${sides[i].name} ${pick(['tending the squad','providing healing'])}: **${result[i].healed} HP restored**.`);}
    for(let i=0;i<2;i++)if(result[i].counts.block){display[i].blocking=result[i].blocking;add(`**Defense** · ${result[i].counts.block} ${unit(result[i].counts.block)} of ${sides[i].name} ${pick(['bracing for impact','preparing defenses','taking defensive positions'])}: **AC ${result[i].ac} · ${result[i].blocking} blocking**.`);}
    for(let i=0;i<2;i++)if(result[i].attack.roll!==null){const a=result[i].attack,t=1-i;let dice=`1d20 (**${a.roll}**)`;if(a.mode==='advantage'||a.mode==='disadvantage'){const [first,second]=a.dice,keepFirst=first===a.roll;dice=`2d20${a.mode==='advantage'?'kh1':'kl1'} (${keepFirst?`**${first}**`:`~~${first}~~`} ${keepFirst?`~~${second}~~`:`**${second}**`})`;}
      add(`**Attack** · ${sides[i].name} → ${sides[t].name} (${result[i].counts.attack} ${unit(result[i].counts.attack)}): ${dice} ${a.bonus<0?'−':'+'} ${Math.abs(a.bonus)} = **${a.total}** vs AC ${result[t].ac} — **${a.hit?(a.critical?'CRITICAL':'HIT'):'MISS'}**.`);}
    for(let i=0;i<2;i++)if(result[1-i].attack.roll!==null){display[i].hp=result[i].hp;add(`${sides[i].name}: ${result[i].incoming} incoming − ${result[i].blocking} blocking → **${result[i].damage} damage**. HP: **${result[i].hp}/${R.maximumHP(sides[i])}**${result[i].hp?'':' · defeated'}.`);}
    if(!frames.length)add('Neither battalion takes an action this turn.');
    return frames;
  }
  launchAnimation(token){
    const task=this.animate(token).catch(error=>{this.change(s=>{if(s.active?.token===token)s.active.presentationError=`The battle was saved, but its Discord presentation stopped: ${error.message}`;});});
    this.animation=task;task.finally(()=>{if(this.animation===task)this.animation=null;});
  }
  async animate(token){
    let battle=this.view().active;if(!battle||battle.token!==token||battle.status!=='narrating')return;
    const channel=await this.bridge.messageDestination(battle.channelId),status=await channel.messages.fetch(battle.messageId);
    if(!battle.narrationMessageId){
      // A failed/ambiguous send must not cause an automatic duplicate message.
      if(battle.narrationSending)throw new Error('Check the channel for the narration message before starting another battle.');
      this.change(s=>{s.active.narrationSending=true;});
      const sent=await channel.send({content:battle.delaySeconds===0?battle.narration:battle.frames[0].line,allowedMentions:{parse:[]}});
      this.change(s=>{Object.assign(s.active,{narrationMessageId:sent.id,narrationSending:false});});
    }
    battle=this.view().active;const report=await channel.messages.fetch(battle.narrationMessageId);
    const first=battle.delaySeconds===0?battle.frames.length-1:(battle.frameIndex??-1)+1;
    for(let i=first;i<battle.frames.length;i++){
      if(i>0&&battle.delaySeconds>0)await this.sleep(battle.delaySeconds*1000);
      battle=this.view().active;if(battle?.token!==token||battle.status!=='narrating')return;
      if(i>0&&battle.delaySeconds>0)await report.edit({content:battle.frames.slice(0,i+1).map(f=>f.line).join('\n'),allowedMentions:{parse:[]}});
      this.change(s=>{s.active.display=clone(battle.frames[i].display);s.active.frameIndex=i;delete s.active.presentationError;});
      const current=this.view();await status.edit(this.payload(current,current.active));
    }
    this.change(s=>{if(s.active?.token===token)s.active.status='resolved';});
  }
  async onButton(interaction){
    if(!interaction.isButton?.()||!interaction.customId?.startsWith('siege:'))return;
    if(this.busy)return interaction.reply({content:'A siege choice is being processed; please try again.',flags:MessageFlags.Ephemeral});
    this.busy=true;
    try{
      const [,token,choice]=interaction.customId.split(':'),s=this.view(),battle=s.active;
      if(!battle||battle.token!==token||battle.status!=='voting'||battle.messageId!==interaction.message.id||battle.channelId!==interaction.channelId)return interaction.reply({content:'This siege post is no longer active.',flags:MessageFlags.Ephemeral});
      const [a,b]=battle.sides||[s.battalions.find(x=>x.id===battle.leftId),s.battalions.find(x=>x.id===battle.rightId)];
      if(!a||!b)throw new Error('A battalion is missing.');
      if(['move','attack','block','heal'].includes(choice)){const votes=[...battle.votes,choice];R.resolvePair(a,b,[battle.actions,votes],[10,10],battle.settings);this.change(v=>{v.active.votes=votes;});}
      else if(choice==='undo'){if(!battle.votes.length)return interaction.reply({content:'There is no choice to undo.',flags:MessageFlags.Ephemeral});this.change(v=>{v.active.votes.pop();});}
      else if(choice==='cancel')this.change(v=>{v.active.status='cancelled';});
      else if(choice==='confirm'){
        const result=R.resolvePair(a,b,[battle.actions,battle.votes],[[randomInt(1,21),randomInt(1,21)],[randomInt(1,21),randomInt(1,21)]],battle.settings),frames=this.narrate([a,b],result,battle.settings),narration=frames.map(f=>f.line).join('\n');
        this.change(v=>{for(const [i,side] of [a,b].entries()){const saved=v.battalions.find(x=>x.id===side.id);saved.hp=result[i].hp;saved.healsUsed=result[i].used;saved.extraHealsUsed=result[i].extraUsed;}Object.assign(v.active,{status:'narrating',result,narration,frames,frameIndex:-1,display:this.initialDisplay([a,b],result)});v.history.unshift({at:new Date().toISOString(),names:[a.name,b.name],result,narration});v.history=v.history.slice(0,100);});
      }else return interaction.reply({content:'Unknown siege action.',flags:MessageFlags.Ephemeral});
      const current=this.view();await interaction.update(this.payload(current,current.active));
      if(choice==='confirm')this.launchAnimation(token);
    }catch(e){if(!interaction.replied&&!interaction.deferred)await interaction.reply({content:e.message,flags:MessageFlags.Ephemeral});}
    finally{this.busy=false;}
  }
}
module.exports={Siege};
