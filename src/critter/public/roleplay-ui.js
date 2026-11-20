window.RoleplayUI=(()=>{
  let state,selected='',slots=Array(8).fill(null),drafts={},overrides={},pending=new Set(),restored=false,recentEdit=null,castFolder='*',chooserFolder='*';
  function rememberRoleplay(){ui.roleplay={slots:[...slots],drafts:{...drafts},overrides:{...overrides},castFolder,chooserFolder};remember();}
  function restoreRoleplay(){if(restored)return;const saved=ui.roleplay||{},seen=new Set();castFolder=typeof saved.castFolder==='string'?saved.castFolder:'*';chooserFolder=typeof saved.chooserFolder==='string'?saved.chooserFolder:'*';slots=Array.from({length:8},(_,i)=>{const id=Array.isArray(saved.slots)?saved.slots[i]:null;if(typeof id!=='string'||seen.has(id)||!state.npcs.some(n=>n.id===id))return null;seen.add(id);return id;});drafts=saved.drafts&&typeof saved.drafts==='object'&&!Array.isArray(saved.drafts)?Object.fromEntries(Object.entries(saved.drafts).filter(([id,text])=>state.npcs.some(n=>n.id===id)&&typeof text==='string').map(([id,text])=>[id,text.slice(0,2000)])):{};overrides=saved.overrides&&typeof saved.overrides==='object'&&!Array.isArray(saved.overrides)?Object.fromEntries(Object.entries(saved.overrides).filter(([id,v])=>state.npcs.some(n=>n.id===id)&&v&&typeof v==='object').map(([id,v])=>[id,{...(typeof v.name==='string'&&v.name.length<=80?{name:v.name}:{}),...(typeof v.image==='string'?{image:v.image}:{}),...(['whisper','shout'].includes(v.voice)?{voice:v.voice}:{})}])):{};restored=true;}
  const choices=(id,includeDefault=false)=>`${includeDefault?'<option value="">Use default channel</option>':'<option value="">Choose a channel</option>'}${id&&!channels.some(c=>c.id===id)?`<option value="${escape(id)}" selected>Saved channel ${escape(id)} (unavailable)</option>`:''}${channels.map(c=>`<option value="${escape(c.id)}" ${c.id===id?'selected':''}>${escape(c.name)}</option>`).join('')}`;
  const languageChoices=id=>'<option value="">Off</option>'+state.languageSettings.presets.map(preset=>
    `<option value="${escape(preset.id)}" ${preset.id===id?'selected':''}>${escape(preset.name)}</option>`).join('');
  const avatar=n=>n.image?`<img class="rp-avatar" src="/npc-assets/${n.image.split('/').map(encodeURIComponent).join('/')}" alt="">`:`<span class="rp-avatar rp-initial">${escape(n.name.slice(0,1).toUpperCase())}</span>`;
  async function refresh(){state=await api('roleplay');const fresh=await api('workspace');workspace=fresh.workspace;revision=fresh.revision;}
  async function write(route,data){const result=await api('roleplay/'+route,'POST',data);await refresh();return result;}
  function popup(npc){
    const root=$('#rp-dialog');root.className='';root.innerHTML=`<div class="dialog-heading"><h2>${npc?'Edit NPC':'New NPC'}</h2><button id="rp-close" aria-label="Close">×</button></div><div class="rp-form"><label>Image from asset folder<select id="rp-image" data-native-select><option value="">No image</option>${state.assets.map(a=>`<option value="${escape(a.name)}" ${npc?.image===a.name?'selected':''}>${escape(a.label)}</option>`).join('')}</select></label><button id="rp-image-clear" type="button" class="small quiet">Remove image</button>${Object.keys(state.artworkFolders||{}).length?'<label>Upload to<select id="rp-artwork-storage">'+AssetPicker.storageOptions(state.artworkFolders)+'</select></label><label>Artwork subfolder<input id="rp-artwork-folder" maxlength="300" placeholder="Optional"></label>':''}<label>Upload image<input id="rp-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Cast folder<input id="rp-folder" list="rp-folders" maxlength="400" value="${escape(npc?.folder??(npc?.image?.includes('/')?npc.image.slice(0,npc.image.lastIndexOf('/')).replace(/^(Repository artwork|Private artwork):\/?/,''):''))}" placeholder="e.g. Town / Guild"><datalist id="rp-folders">${AssetPicker.foldersFor(state.npcs.map(n=>({name:n.name,folder:n.folder||''}))).map(f=>`<option value="${escape(f)}">`).join('')}</datalist></label><label>Name<input id="rp-name" maxlength="80" value="${escape(npc?.name||'')}"></label><label>Tag<input id="rp-tag" maxlength="80" value="${escape(npc?.tag||'')}" placeholder="e.g. Squad Leader"></label><label>Channel<select id="rp-channel">${choices(npc?.channelId||'',true)}</select></label><label><input id="rp-visible" type="checkbox" ${npc?.visible!==false?'checked':''}> Show in cast</label><div class="toolbar"><button id="rp-save" class="primary">Save NPC</button>${npc?'<button id="rp-delete" class="danger">Delete NPC</button>':''}</div></div>`;root.showModal();AssetPicker.attach($('#rp-image'),state.assets,state.folders);
    bind('rp-image-clear',()=>{$('#rp-image').value='';$('#rp-image').dispatchEvent(new Event('change',{bubbles:true}));});bind('rp-close',()=>root.close());bind('rp-image',e=>{const file=state.assets.find(a=>a.name===e.target.value);if(file&&!$('#rp-name').value.trim())$('#rp-name').value=file.label;},'change');
    bind('rp-upload',async e=>{const f=e.target.files[0];if(!f)return;const asset=await AssetPicker.upload(f,$('#rp-artwork-storage')?.value,$('#rp-artwork-folder')?.value??$('#rp-folder').value);await refresh();const select=$('#rp-image');AssetPicker.attach(select,state.assets,state.folders);select.add(new Option(asset.label,asset.name,true,true));select.dispatchEvent(new Event('change',{bubbles:true}));if(!$('#rp-name').value.trim())$('#rp-name').value=asset.label;},'change');
    bind('rp-save',async()=>{await write('save',{...(npc?{id:npc.id}:{}),name:$('#rp-name').value,folder:$('#rp-folder').value,tag:$('#rp-tag').value,image:$('#rp-image').value,channelId:$('#rp-channel').value,visible:$('#rp-visible').checked});root.close();await render();});
    bind('rp-delete',async()=>{if(!confirm('Delete this NPC? Its image stays in the asset folder.'))return;await write('delete',{id:npc.id});slots=slots.map(id=>id===npc.id?null:id);delete drafts[npc.id];delete overrides[npc.id];rememberRoleplay();root.close();await render();});
  }
  function cast(){const query=($('#rp-search')?.value||'').toLowerCase(),folder=$('#rp-cast-folder')?.value??'*';$('#rp-list').innerHTML=state.npcs.filter(n=>n.visible!==false&&(folder==='*'||npcFolder(n)===folder)&&`${n.name} ${n.tag}`.toLowerCase().includes(query)).map(n=>`<div class="rp-cast">${avatar(n)}<div><strong>${escape(n.name)}</strong><small>${escape(n.tag)}</small></div><button class="small" data-rp-load="${n.id}">Load</button><button class="small" data-rp-edit="${n.id}">Edit</button></div>`).join('')||'<p class="hint">No visible NPCs found.</p>';
    document.querySelectorAll('[data-rp-load]').forEach(x=>x.onclick=()=>{const id=x.dataset.rpLoad;if(slots.includes(id))return;const index=slots.indexOf(null);if(index<0)return message('All eight slots are full.',true);slots[index]=id;rememberRoleplay();paintSlots();});document.querySelectorAll('[data-rp-edit]').forEach(x=>x.onclick=()=>popup(state.npcs.find(n=>n.id===x.dataset.rpEdit)));}
  function paintSlots(){const root=$('#rp-slots');root.innerHTML=slots.map((id,i)=>{const base=state.npcs.find(x=>x.id===id),n=base?{...base,...overrides[id]}:null;if(!n)return `<div class="rp-slot rp-empty">Slot ${i+1}<br>Load an NPC from the cast.</div>`;return `<div class="rp-slot"><div class="rp-slot-head"><button class="rp-avatar-button" data-rp-image="${i}" aria-label="Change image for ${escape(n.name)}">${avatar(n)}</button><div><input class="rp-temp-name" data-rp-name="${i}" maxlength="80" aria-label="Temporary name for ${escape(base.name)}" value="${escape(n.name)}"><small>${escape(n.tag)}</small></div><select data-rp-channel="${i}" aria-label="Channel for ${escape(n.name)}">${choices(n.channelId,true)}</select><button class="small" aria-label="Unload ${escape(n.name)}" data-rp-unload="${i}">x</button></div><textarea data-rp-draft="${i}" maxlength="2000" rows="2" placeholder="Speak as ${escape(n.name)}">${escape(drafts[id]||'')}</textarea><div class="rp-slot-bottom"><span id="rp-status-${i}" class="hint"></span><div class="rp-send-controls"><label class="rp-language">Language<select data-rp-language="${i}" aria-label="Language for ${escape(n.name)}" ${pending.has(id)?'disabled':''}>${languageChoices(n.languageId)}</select></label><label>Shout<input type="checkbox" data-rp-voice="${i}:shout" ${overrides[id]?.voice==='shout'?'checked':''}></label><label>Whisper<input type="checkbox" data-rp-voice="${i}:whisper" ${overrides[id]?.voice==='whisper'?'checked':''}></label><button data-rp-send="${i}" class="primary" ${pending.has(id)?'disabled':''}>Send as ${escape(n.name)}</button></div></div></div>`;}).join('');
    root.querySelectorAll('[data-rp-voice]').forEach(x=>x.onchange=()=>{const [i,voice]=x.dataset.rpVoice.split(':'),id=slots[Number(i)];overrides[id]={...overrides[id],voice:x.checked?voice:'normal'};for(const other of root.querySelectorAll('[data-rp-voice]'))if(other!==x&&other.dataset.rpVoice.startsWith(i+':'))other.checked=false;rememberRoleplay();});
    root.querySelectorAll('[data-rp-name]').forEach(x=>{x.oninput=()=>{const id=slots[Number(x.dataset.rpName)];overrides[id]={...overrides[id],name:x.value};const button=root.querySelector(`[data-rp-send="${x.dataset.rpName}"]`);if(button)button.textContent='Send as '+x.value;rememberRoleplay();};x.onblur=()=>{if(!x.value.trim()){const id=slots[Number(x.dataset.rpName)];delete overrides[id].name;x.value=state.npcs.find(n=>n.id===id)?.name||'';const button=root.querySelector(`[data-rp-send="${x.dataset.rpName}"]`);if(button)button.textContent='Send as '+x.value;rememberRoleplay();}};x.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();x.blur();}};});
    root.querySelectorAll('[data-rp-image]').forEach(x=>x.onclick=()=>chooseImage(Number(x.dataset.rpImage)));
    root.querySelectorAll('[data-rp-draft]').forEach(x=>{x.oninput=()=>{const i=Number(x.dataset.rpDraft),id=slots[i];drafts[id]=x.value;rememberRoleplay();};x.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!e.repeat){e.preventDefault();root.querySelector(`[data-rp-send="${x.dataset.rpDraft}"]`)?.click();}};});root.querySelectorAll('[data-rp-unload]').forEach(x=>x.onclick=()=>{slots[Number(x.dataset.rpUnload)]=null;rememberRoleplay();paintSlots();});
    root.querySelectorAll('[data-rp-channel]').forEach(x=>x.onchange=()=>run(async()=>{const n=state.npcs.find(v=>v.id===slots[Number(x.dataset.rpChannel)]);await write('save',{...n,channelId:x.value});}));
    root.querySelectorAll('[data-rp-language]').forEach(select=>select.onchange=async()=>{
      const id=slots[Number(select.dataset.rpLanguage)],npc=state.npcs.find(n=>n.id===id);
      if(!npc||pending.has(id))return;
      setSlotPending(id,true);
      try{await write('language',{id,languageId:select.value});}
      catch(error){slotStatus(id,error.message);}
      finally{
        setSlotPending(id,false);
        const current=slotControl(id,'language');
        if(current)current.value=state.npcs.find(n=>n.id===id)?.languageId||'';
      }
    });
    root.querySelectorAll('[data-rp-send]').forEach(button=>button.onclick=()=>run(async()=>{
      const id=slots[Number(button.dataset.rpSend)],text=drafts[id]||'';
      const npc=state.npcs.find(n=>n.id===id);
      if(!npc||pending.has(id))return;
      if(!text.trim())throw new Error('Enter a message.');
      setSlotPending(id,true);
      slotStatus(id,'Sending…');
      try{
        const result=await write('send',{
          id,text,voice:overrides[id]?.voice||'normal',requestId:crypto.randomUUID(),
          languageId:npc.languageId||'',channelId:npc.channelId||state.channelId,
          ...(overrides[id]?.name!==undefined?{displayName:overrides[id].name}:{}),
          ...(overrides[id]?.image!==undefined?{displayImage:overrides[id].image}:{}),
        });
        if(result.delivery!=='sent'){
          slotStatus(id,result.error||'Delivery not confirmed; check Discord.');
          return;
        }
        const draft=slotControl(id,'draft');
        if(drafts[id]===text){
          drafts[id]='';
          if(draft)draft.value='';
          rememberRoleplay();
        }
        slotStatus(id,'Sent');
        draft?.focus();
        recent();
      }catch(error){slotStatus(id,error.message);}
      finally{setSlotPending(id,false);}
    }));
  }
  function slotControl(id,name){
    const index=slots.indexOf(id);
    return index<0?null:$('#rp-slots')?.querySelector(`[data-rp-${name}="${index}"]`);
  }
  function slotStatus(id,text){
    const index=slots.indexOf(id);
    const status=index<0?null:$('#rp-status-'+index);
    if(status)status.textContent=text;
  }
  function setSlotPending(id,busy){
    if(busy)pending.add(id);else pending.delete(id);
    for(const name of ['language','send']){
      const control=slotControl(id,name);
      if(control)control.disabled=busy;
    }
  }
  function npcFolder(n){return n.folder??(n.image?.includes('/')?n.image.slice(0,n.image.lastIndexOf('/')):'');}
  function chooseImage(index){const id=slots[index],npc=state.npcs.find(n=>n.id===id);AssetPicker.open({assets:state.assets,folders:state.folders,selected:overrides[id]?.image??npc.image,onSelect:name=>{overrides[id]={...overrides[id],image:name};rememberRoleplay();paintSlots();},onReset:()=>{if(overrides[id])delete overrides[id].image;rememberRoleplay();paintSlots();}});}
  function chooseCast(){
    const d=$('#rp-dialog');d.className='folder-dialog';
    d.innerHTML='<div class="folder-header"><h2>Choose NPCs to display</h2><button id="rp-close" aria-label="Close">Close</button></div><div id="rp-checks" class="folder-browser"></div><div class="folder-footer"><span id="rp-selected-count"></span><button id="rp-done" class="primary">Done</button></div>';
    const count=()=>{$('#rp-selected-count').textContent=state.npcs.filter(n=>n.visible!==false).length+' displayed';};
    AssetPicker.browser($('#rp-checks'),{items:state.npcs.map(n=>({...n,label:n.name,folder:npcFolder(n)})),initialFolder:chooserFolder,onFolder:folder=>{chooserFolder=folder;rememberRoleplay();},card:n=>`<label class="rp-check-card">${avatar(n)}<span><strong>${escape(n.name)}</strong><small>${escape(n.tag)}</small></span><input type="checkbox" data-rp-visible="${n.id}" ${n.visible!==false?'checked':''}></label>`,onPaint:root=>root.querySelectorAll('[data-rp-visible]').forEach(x=>{x.checked=state.npcs.find(n=>n.id===x.dataset.rpVisible).visible!==false;x.onchange=()=>run(async()=>{const n=state.npcs.find(v=>v.id===x.dataset.rpVisible),old=n.visible;n.visible=x.checked;x.disabled=true;count();try{await write('save',{...n});}catch(e){n.visible=old;x.checked=old!==false;throw e;}finally{x.disabled=false;count();}});})});
    count();d.showModal();bind('rp-close',()=>{d.close();cast();});bind('rp-done',()=>{d.close();cast();});
  }
  function recent(){
    const root=$('#rp-recent');if(!root)return;
    root.innerHTML=state.recent.slice(0,12).map(x=>recentEdit?.id===x.requestId?`<div class="rp-recent-item rp-recent-editor"><strong>${escape(x.name)}</strong><textarea data-rp-edit-text rows="3" maxlength="2000">${escape(recentEdit.text)}</textarea><div class="rp-recent-actions"><span data-rp-edit-status class="hint">${escape(recentEdit.error||'')}</span><button class="small" data-rp-edit-cancel ${recentEdit.busy?'disabled':''}>Cancel</button><button class="small primary" data-rp-edit-save ${recentEdit.busy?'disabled':''}>${recentEdit.busy?'Saving...':'Save'}</button></div></div>`:`<button class="rp-recent-item rp-recent-post" data-rp-edit-post="${escape(x.requestId)}" ${x.delivery!=='sent'||!x.messageId?'disabled':''}><strong>${escape(x.name)} · ${escape(x.delivery)}${x.editedAt?' · edited':''}</strong><small>${escape(x.convertedText??x.text)}</small></button>`).join('')||'<p class="hint">No recent posts.</p>';
    root.querySelectorAll('[data-rp-edit-post]').forEach(button=>button.onclick=()=>{const post=state.recent.find(x=>x.requestId===button.dataset.rpEditPost);if(!post)return;recentEdit={id:post.requestId,originalText:post.text,text:post.text,error:'',busy:false};recent();const input=root.querySelector('[data-rp-edit-text]');input.focus();input.setSelectionRange(input.value.length,input.value.length);});
    const input=root.querySelector('[data-rp-edit-text]');if(!input)return;
    input.oninput=()=>{recentEdit.text=input.value;recentEdit.error='';};
    input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!e.repeat){e.preventDefault();root.querySelector('[data-rp-edit-save]')?.click();}};
    root.querySelector('[data-rp-edit-cancel]').onclick=()=>{recentEdit=null;recent();};
    root.querySelector('[data-rp-edit-save]').onclick=()=>run(async()=>{if(recentEdit.busy)return;const edit=recentEdit;if(!edit.text.trim()){root.querySelector('[data-rp-edit-status]').textContent='Enter a message.';return;}edit.busy=true;root.querySelector('[data-rp-edit-save]').disabled=true;root.querySelector('[data-rp-edit-cancel]').disabled=true;root.querySelector('[data-rp-edit-status]').textContent='Saving...';
      try{await write('edit-message',{requestId:edit.id,text:edit.text,originalText:edit.originalText});if(recentEdit===edit)recentEdit=null;recent();}
      catch(error){edit.busy=false;edit.error=error.message;recent();const box=root.querySelector('[data-rp-edit-text]');box?.focus();}
    });
  }
  async function render(){await refresh();if(ui.tab!=='roleplay')return;restoreRoleplay();$('#selection-panel').innerHTML=`<div class="panel-heading"><h2>Cast</h2><button id="rp-new" class="small">+ New NPC</button></div><select id="rp-cast-folder" aria-label="Cast folder"><option value="*">All folders</option><option value="">Unfiled</option>${[...new Set(state.npcs.map(npcFolder).filter(Boolean))].sort().map(f=>`<option value="${escape(f)}">${escape(f)}</option>`).join('')}</select><input id="rp-search" type="search" placeholder="Find an NPC"><div id="rp-list"></div><button id="rp-visibility" class="full">Choose NPCs to display</button>`;$('#content-panel').innerHTML=`<div class="eyebrow">DISCORD ROLEPLAY</div><h1>Speak as your NPCs</h1><label>Default channel<select id="rp-default">${choices(state.channelId)}</select></label><div id="rp-slots" class="rp-grid"></div><h2>Recent posts</h2><div id="rp-recent" class="rp-recent"></div><dialog id="rp-dialog"></dialog>`;$('#command-panel').innerHTML='';$('#message').hidden=true;$('#rp-cast-folder').value=castFolder;if($('#rp-cast-folder').selectedIndex<0){castFolder='*';$('#rp-cast-folder').value='*';}cast();paintSlots();recent();
    bind('rp-new',()=>popup(null));bind('rp-search',cast,'input');bind('rp-default',async e=>{await write('config',{channelId:e.target.value});},'change');
    bind('rp-cast-folder',e=>{castFolder=e.target.value;rememberRoleplay();cast();},'change');bind('rp-visibility',chooseCast);
  }
  return {render};
})();
