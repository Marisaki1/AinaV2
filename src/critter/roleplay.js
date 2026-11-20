'use strict';
const fs=require('fs');
const path=require('path');
const {randomUUID,createHash}=require('crypto');
const {WebhookClient}=require('discord.js');
const { convert, upgradeSettings, validateSettings } = require('./languages');
const extensions={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
function validImage(buffer,mime){return mime==='image/png'?buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):mime==='image/jpeg'?buffer[0]===255&&buffer[1]===216&&buffer[2]===255:mime==='image/webp'?buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP':false;}
function formatDialogue(name,text,voice='normal'){const prefix=voice==='whisper'?'-# ':voice==='shout'?'# ':'';return text.replace(/\r\n?/g,'\n').split('\n').map(line=>`${prefix}> ${name}: ${line}`).join('\n');}
function webhookCreateError(error,parent,thread){
  const where=parent.name?`#${parent.name}`:'the parent channel';
  if(error?.code===50013||error?.code===50001||error?.status===403)return new Error(`Discord denied webhook creation in ${where}. Give Aina View Channel and Manage Webhooks there${thread?' (the thread uses its parent channel)':''}, then check channel permission overrides.`);
  if(error?.code===30007)return new Error(`Discord's webhook limit was reached in ${where}. Remove an unused webhook in that channel's Integrations settings.`);
  if(error?.code===50035)return new Error('Discord rejected the webhook details or image. Try a different PNG or JPEG image.');
  if(error?.status===429)return new Error('Discord is rate-limiting webhook creation. Wait before trying again.');
  return new Error(`Discord could not create a webhook in ${where}${error?.code?` (error ${String(error.code).replace(/[^0-9]/g,'')})`:''}. Check the channel permissions and try again.`);
}
class Roleplay {
  constructor(store,bridge,assetDirectory){this.store=store;this.bridge=bridge;this.directory=assetDirectory||path.resolve(__dirname,'../../assets/critter/npcs');fs.mkdirSync(this.directory,{recursive:true});this.secretFile=path.join(store.directory,'roleplay-webhooks.json');this.secrets=fs.existsSync(this.secretFile)?JSON.parse(fs.readFileSync(this.secretFile,'utf8')):{};this.lock=false;this.inflight=new Set();if(this.store.read().workspace.roleplay.recent.some(x=>x.delivery==='sending'))this.change(r=>{for(const item of r.recent)if(item.delivery==='sending')item.delivery='uncertain';});}
  change(fn){const current=this.store.read();const result=fn(current.workspace.roleplay);this.store.save(current.workspace,current.revision);return result;}
  assetPath(name,folder=false){
    if(typeof name!=='string'||(!name&&!folder)||name.length>400||name.includes('\\')||/[\x00-\x1f<>:"|?*]/.test(name)||name.split('/').some(p=>p==='.'||p==='..'||(!p&&name!=='')))throw new Error('Choose a valid asset folder or image.');
    const root=path.resolve(this.directory),file=path.resolve(root,...name.split('/'));
    if(file!==root&&!file.startsWith(root+path.sep))throw new Error('Asset must stay in the asset folder.');
    let current=root;for(const part of name.split('/').filter(Boolean)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('Linked asset folders are not supported.');}
    return file;
  }
  catalog(){
    const assets=[],folders=[];
    const walk=(directory,prefix='')=>{for(const e of fs.readdirSync(directory,{withFileTypes:true})){
      if(e.isSymbolicLink())continue;const name=prefix+e.name;
      if(e.isDirectory()){folders.push(name);walk(path.join(directory,e.name),name+'/');}
      else if(e.isFile()&&extensions[path.extname(e.name).toLowerCase()])assets.push({name,label:path.parse(e.name).name,folder:prefix.replace(/\/$/,''),url:'/npc-assets/'+name.split('/').map(encodeURIComponent).join('/')});
    }};walk(this.directory);assets.sort((a,b)=>a.name.localeCompare(b.name));folders.sort();return {assets,folders};
  }
  assets(){return this.catalog().assets;}
  createFolder(name){const file=this.assetPath(name,true);fs.mkdirSync(file,{recursive:true});return {folder:name};}
  image(name){const file=this.assetPath(name);if(!extensions[path.extname(name).toLowerCase()])throw new Error('Choose an image from the asset folder.');const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)throw new Error('Image must be a local file under 8 MB.');const buffer=fs.readFileSync(file),mime=extensions[path.extname(name).toLowerCase()];if(!validImage(buffer,mime))throw new Error('Image contents do not match its file type.');return {buffer,mime};}
  upload(data){const original=String(data.name||'');const name=path.basename(original);if(name!==original||!extensions[path.extname(name).toLowerCase()]||/[\x00-\x1f]/.test(name))throw new Error('Choose a PNG, JPEG, or WebP image.');const match=/^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i.exec(data.image||'');if(!match||extensions[path.extname(name).toLowerCase()]!==`image/${match[1].toLowerCase()}`)throw new Error('Image type does not match the filename.');const buffer=Buffer.from(match[2],'base64');if(!buffer.length||buffer.length>8*1024*1024)throw new Error('Image must be under 8 MB.');if(!validImage(buffer,extensions[path.extname(name).toLowerCase()]))throw new Error('Image contents do not match its file type.');const folder=String(data.folder||'');const directory=this.assetPath(folder,true);fs.mkdirSync(directory,{recursive:true});const key=(folder?folder+'/':'')+name;fs.writeFileSync(this.assetPath(key),buffer,{flag:'wx'});return {name:key,label:path.parse(name).name,folder,url:'/npc-assets/'+key.split('/').map(encodeURIComponent).join('/')};}
  view(){
    const state = this.store.read().workspace.roleplay;
    return {
      ...state,
      languageSettings: this.languageSettings(state),
      recent: state.recent.map(({ languageSnapshot, ...item }) => item),
      ...this.catalog(),
      assetDirectory: this.directory,
      connected: Boolean(this.bridge.client?.isReady()),
    };
  }
  languageSettings(state = this.store.read().workspace.roleplay) {
    return upgradeSettings(state.languageSettings);
  }
  saveLanguages(input) {
    return this.change(state => {
      const current = this.languageSettings(state);
      if (input.version !== current.version) throw Object.assign(new Error('Languages changed elsewhere. Reload before saving.'), { status: 409 });
      const next = validateSettings({
        version: current.version + 1,
        demonVocabularyVersion: current.demonVocabularyVersion,
        presets: input.presets,
        names: input.names,
      });
      state.languageSettings = next;
      const ids = new Set(next.presets.map(preset => preset.id));
      for (const npc of state.npcs) if (npc.languageId && !ids.has(npc.languageId)) npc.languageId = '';
      return next;
    });
  }
  setLanguage(id, languageId) {
    return this.change(state => {
      const npc = state.npcs.find(candidate => candidate.id === id);
      if (!npc) throw new Error('NPC not found.');
      if (languageId !== '' && !this.languageSettings(state).presets.some(preset => preset.id === languageId)) {
        throw new Error('Choose an available language.');
      }
      npc.languageId = languageId;
      return npc;
    });
  }
  previewLanguage({ text, id, decode = true }) {
    const settings = this.languageSettings();
    const preset = settings.presets.find(candidate => candidate.id === id);
    if (!preset) throw new Error('Choose an available language.');
    return { text: convert(text, preset, settings.names, decode !== false) };
  }
  languageLog() {
    return this.store.read().workspace.roleplay.recent
      .filter(item => item.languageSnapshot && item.convertedText !== undefined)
      .map(({ requestId, name, languageName, text, convertedText, createdAt, delivery }) =>
        ({ requestId, name, languageName, text, convertedText, createdAt, delivery }));
  }
  save(data){const name=String(data.name||'').trim(),tag=String(data.tag||'').trim(),channelId=String(data.channelId||'');if(!name||name.length>80||/[\r\n]/.test(name)||tag.length>80||/[\r\n]/.test(tag))throw new Error('Enter a valid NPC name and tag.');if(channelId&&!/^\d{1,22}$/.test(channelId))throw new Error('Choose a valid channel.');const image=String(data.image||'');if(image)this.image(image);const previous=this.store.read().workspace.roleplay.npcs.find(n=>n.id===data.id),folder=String(data.folder??previous?.folder??'').trim();this.assetPath(folder,true);const npc={...previous,id:data.id||randomUUID(),name,tag,channelId,image,folder,visible:data.visible!==false};this.change(r=>{const i=r.npcs.findIndex(n=>n.id===npc.id);if(data.id&&i<0)throw new Error('NPC not found.');if(i<0)r.npcs.push(npc);else r.npcs[i]=npc;});return npc;}
  remove(id){this.change(r=>{if(!r.npcs.some(n=>n.id===id))throw new Error('NPC not found.');r.npcs=r.npcs.filter(n=>n.id!==id);});}
  configure(data){const id=String(data.channelId||'');if(id&&!/^\d{1,22}$/.test(id))throw new Error('Choose a valid channel.');this.change(r=>{r.channelId=id;});}
  async editMessage(data){
    const id=String(data.requestId||''),text=typeof data.text==='string'?data.text:'',original=this.store.read().workspace.roleplay.recent.find(x=>x.requestId===id);
    if(!original||original.delivery!=='sent'||!original.messageId)throw new Error('This post has no confirmed Discord message to edit.');
    if(typeof data.originalText!=='string'||data.originalText!==original.text)throw Object.assign(new Error('This post changed elsewhere. Refresh it before editing.'),{status:409});
    if(!text.trim())throw new Error('Enter a message.');
    const snapshot = original.languageSnapshot;
    const convertedText = snapshot ? convert(text, snapshot.preset, snapshot.names) : text;
    const content=formatDialogue(original.name,convertedText,original.voice||'normal');if(content.length>2000)throw new Error('Message exceeds Discord’s 2,000-character limit after formatting.');
    if(!this.bridge.client?.isReady())throw new Error('Aina is offline.');if(this.lock)throw new Error('Another NPC message is being processed. Please wait.');
    this.lock=true;try{
      const channel=await this.bridge.messageDestination(original.channelId),thread=Boolean(channel.isThread?.()),parent=thread?(channel.parent||await channel.fetchParent()):channel,saved=this.secrets[parent?.id];
      if(!saved?.id||!saved.token||(original.webhookId&&original.webhookId!==saved.id))throw new Error('The original webhook is unavailable. This message cannot be edited from Aina.');
      const webhook=this.makeWebhook?this.makeWebhook(saved):new WebhookClient({id:saved.id,token:saved.token});let edited;
      try{edited=await webhook.editMessage(original.messageId,{content,allowedMentions:{parse:[]},...(thread?{threadId:channel.id}:{})});}
      catch(error){if(error?.code===10008)throw new Error('This Discord message no longer exists.');if(error?.code===10015||error?.code===50027)throw new Error('The original webhook is unavailable. This message cannot be edited from Aina.');if(Number(error.status)>=400&&Number(error.status)<500)throw new Error('Discord rejected the edit. Check the webhook and channel permissions.');throw new Error('The edit could not be confirmed. Check Discord before trying again.');}
      if(!edited?.id)throw new Error('The edit could not be confirmed. Check Discord before trying again.');
      try{this.change(r=>{const item=r.recent.find(x=>x.requestId===id);if(!item||item.text!==original.text)throw new Error('Post changed locally.');item.text=text;if(snapshot)item.convertedText=convertedText;item.editedAt=Date.now();});}catch{throw new Error('Discord confirmed the edit, but the local history could not be saved. Refresh before editing again.');}
      return {requestId:id,messageId:edited.id,delivery:'edited'};
    }finally{this.lock=false;}
  }
  async send(data){
    const requestId=String(data.requestId||'');if(!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId))throw new Error('Missing request ID.');
    const prior=this.store.read().workspace.roleplay.recent.find(x=>x.requestId===requestId);if(prior){if(prior.npcId!==data.id||prior.text!==data.text||(data.channelId&&prior.channelId!==data.channelId)||(data.displayName!==undefined&&(typeof data.displayName!=='string'||prior.name!==data.displayName.trim()))||(data.displayImage!==undefined&&prior.image!==data.displayImage)||(prior.voice||'normal')!==(data.voice||'normal')||(data.languageId!==undefined&&(prior.languageId||'')!==data.languageId))throw new Error('Request ID already belongs to a different post.');return {requestId,delivery:prior.delivery,messageId:prior.messageId};}
    if(this.inflight.has(requestId)||this.lock)throw new Error('Another NPC message is being sent. Please wait.');
    const r=this.store.read().workspace.roleplay,stored=r.npcs.find(n=>n.id===data.id),npc=stored?{...stored}:null,text=String(data.text||''),channelId=String(data.channelId||npc?.channelId||r.channelId);
    if(!npc||!text.trim())throw new Error('Choose an NPC and enter a message.');
    if(data.displayName!==undefined){if(typeof data.displayName!=='string'||!data.displayName.trim()||data.displayName.trim().length>80||/[\r\n]/.test(data.displayName))throw new Error('Enter a valid temporary NPC name.');npc.name=data.displayName.trim();}
    if(data.displayImage!==undefined){if(typeof data.displayImage!=='string')throw new Error('Choose an image from the asset folder.');npc.image=data.displayImage;if(npc.image)this.image(npc.image);}
    const voice=data.voice??'normal';if(!['normal','whisper','shout'].includes(voice))throw new Error('Choose normal, whisper, or shout.');
    const languageId = npc.languageId || '';
    if (data.languageId !== undefined && data.languageId !== languageId) throw new Error('The NPC language changed. Refresh the Roleplay tab before sending.');
    const settings = this.languageSettings(r);
    const preset = settings.presets.find(candidate => candidate.id === languageId);
    if (languageId && !preset) throw new Error('Choose an available language for this NPC.');
    const convertedText = preset ? convert(text, preset, settings.names) : text;
    const content=formatDialogue(npc.name,convertedText,voice);if(content.length>2000)throw new Error('Message exceeds Discord’s 2,000-character limit after conversion and formatting. Shorten the message or use fewer lines.');
    if(!this.bridge.client?.isReady())throw new Error('Aina is offline.');
    this.lock=true;this.inflight.add(requestId);let sending=false;
    try{
      const channel=await this.bridge.messageDestination(channelId),thread=Boolean(channel.isThread?.()),parent=thread?(channel.parent||await channel.fetchParent()):channel;
      if(!parent?.createWebhook)throw new Error('This channel does not support incoming webhooks.');
      const image=npc.image?this.image(npc.image):null,hash=image?createHash('sha256').update(image.buffer).digest('hex'):'';
      let saved=this.secrets[parent.id],webhook;
      if(saved){webhook=this.makeWebhook?this.makeWebhook(saved):new WebhookClient({id:saved.id,token:saved.token});}
      else{try{webhook=await parent.createWebhook({name:'Aina Roleplay',...(image?{avatar:image.buffer}:{})});}catch(error){throw webhookCreateError(error,parent,thread);}if(!webhook.id||!webhook.token)throw new Error('Discord did not return webhook credentials.');saved={id:webhook.id,token:webhook.token,avatar:hash};this.secrets[parent.id]=saved;fs.writeFileSync(this.secretFile,JSON.stringify(this.secrets),{mode:0o600});}
      if(saved.avatar!==hash){try{await webhook.edit({avatar:image?image.buffer:null});}catch{throw new Error('Could not update the NPC avatar. Discord may be rate-limiting avatar changes.');}saved.avatar=hash;fs.writeFileSync(this.secretFile,JSON.stringify(this.secrets),{mode:0o600});}
      const item={requestId,npcId:npc.id,name:npc.name,image:npc.image,channelId,webhookId:saved.id,text,voice,delivery:'sending',createdAt:Date.now(),
        ...(preset ? { languageId, languageName: preset.name, convertedText, languageSnapshot: { preset, names: settings.names } } : {}),
      };this.change(v=>{v.recent.unshift(item);v.recent=v.recent.slice(0,100);});sending=true;
      let message;try{message=await webhook.send({username:npc.name,content,allowedMentions:{parse:[]},...(thread?{threadId:channel.id}:{})});}catch(error){const rejected=Number(error.status)>=400&&Number(error.status)<500;this.change(v=>{const x=v.recent.find(y=>y.requestId===requestId);x.delivery=rejected?'failed':'uncertain';});return {requestId,delivery:rejected?'failed':'uncertain',error:rejected?'Discord rejected the post. Check the webhook and channel permissions.':'Delivery could not be confirmed. Check Discord before sending again.'};}
      if(!message?.id)throw new Error('Discord did not confirm delivery.');this.change(v=>{const x=v.recent.find(y=>y.requestId===requestId);x.delivery='sent';x.messageId=message.id;});return {requestId,delivery:'sent',messageId:message.id};
    }catch(error){if(sending){try{this.change(v=>{const x=v.recent.find(y=>y.requestId===requestId);if(x&&x.delivery==='sending')x.delivery='uncertain';});}catch{}throw new Error('Delivery could not be confirmed. Check Discord before sending again.');}throw error;}finally{this.lock=false;this.inflight.delete(requestId);}
  }
}
module.exports={Roleplay,formatDialogue};
