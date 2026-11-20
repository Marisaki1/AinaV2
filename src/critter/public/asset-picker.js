/* Shared folder browser for every local image picker. Asset names are relative paths. */
window.AssetPicker=(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parent=name=>name.includes('/')?name.slice(0,name.lastIndexOf('/')):'';
  const url=name=>'/npc-assets/'+name.split('/').map(encodeURIComponent).join('/');
  const folderLabel=folder=>folder.replace(/^(Repository artwork|Private artwork):/, '$1');
  const catalogs=new WeakMap();
  const storageOptions=roots=>[['private','Private artwork'],['repository','Repository artwork']]
    .filter(([key])=>roots[key]).map(([key,label])=>'<option value="'+esc(roots[key])+'">'+label+'</option>').join('');
  async function upload(file, root, folder){
    if(file.size>8*1024*1024)throw new Error('Image must be 8 MB or smaller.');
    const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read image.'));reader.readAsDataURL(file);});
    return api('roleplay/upload','POST',{name:file.name,image,folder:[root,folder.trim()].filter(Boolean).join('/')});
  }
  function foldersFor(items,folders=[]){const all=new Set(folders);for(const item of items){let f=item.folder??parent(item.name);while(f){all.add(f);f=parent(f);}}return [...all].sort((a,b)=>a.localeCompare(b));}
  function browser(root,{items,folders=[],card,onPaint,initialFolder='*',onFolder}){
    let folder=initialFolder,query='';const allFolders=foldersFor(items,folders);
    root.innerHTML='<div class="folder-tools"><input type="search" aria-label="Filter items" placeholder="Search names or folders"></div><div class="folder-layout"><nav class="folder-nav" aria-label="Folders"></nav><div class="folder-scroll"><div class="folder-path"></div><div class="folder-grid"></div></div></div>';
    const paint=()=>{
      root.querySelector('.folder-nav').innerHTML=[['*','All folders'],['','Unfiled'],...allFolders.map(f=>[f,folderLabel(f)])].map(([f,n])=>`<button type="button" data-folder="${esc(f)}" class="${folder===f?'active':''}">${esc(n)}</button>`).join('');
      root.querySelector('.folder-path').textContent=folder==='*'?'All folders':folderLabel(folder)||'Unfiled';
      const matches=items.filter(x=>(folder==='*'||(x.folder??parent(x.name))===folder)&&(!query||`${x.label} ${x.folder||''} ${x.name}`.toLocaleLowerCase().includes(query)));
      root.querySelector('.folder-grid').innerHTML=matches.map(card).join('')||'<p class="hint">No matching items in this folder.</p>';
      root.querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>{folder=b.dataset.folder;onFolder?.(folder);paint();});onPaint?.(root);
    };
    root.querySelector('input').oninput=e=>{query=e.target.value.toLocaleLowerCase().trim();paint();};paint();
  }
  function open({assets,folders=[],selected='',onSelect,onReset}){
    const dialog=document.createElement('dialog');dialog.className='folder-dialog';
    dialog.innerHTML='<div class="folder-header"><h2>Choose image</h2><button type="button" data-close aria-label="Close image picker">×</button></div><div class="folder-browser"></div><div class="folder-footer"><button type="button" data-reset>Use saved image</button><button type="button" data-new-folder>New folder</button><button class="primary" data-close>Done</button></div>';
    document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());
    dialog.querySelector('[data-reset]').hidden=!onReset;dialog.querySelector('[data-reset]').onclick=()=>{onReset();dialog.close();};
    let folder=selected?parent(selected):'*';
    const paint=()=>browser(dialog.querySelector('.folder-browser'),{items:assets,folders,initialFolder:folder,onFolder:value=>{folder=value;},card:a=>`<button type="button" class="asset-tile ${a.name===selected?'selected':''}" data-asset-name="${esc(a.name)}"><img src="${esc(a.url)}" alt="" loading="lazy"><span>${esc(a.label)}</span><small>${esc(folderLabel(a.folder||'Unfiled'))}</small></button>`,onPaint:root=>root.querySelectorAll('[data-asset-name]').forEach(b=>b.onclick=()=>{onSelect(b.dataset.assetName);dialog.close();})});
    dialog.querySelector('[data-new-folder]').onclick=()=>run(async()=>{const name=prompt('Folder name (use / for nested folders)');if(!name?.trim())return;const next=[folder==='*'?'':folder,name.trim()].filter(Boolean).join('/');await api('roleplay/folder','POST',{folder:next});const fresh=await api('roleplay');assets=fresh.assets;folders=fresh.folders;folder=next;paint();});
    paint();dialog.showModal();return dialog;
  }
  function attach(select,assets,folders=[]){
    if(!select)return;
    catalogs.set(select,{assets,folders});
    if(select.dataset.assetPicker)return;select.dataset.assetPicker='1';select.dataset.nativeSelect='';select.hidden=true;
    const button=document.createElement('button');button.type='button';button.className='asset-picker-button';button.dataset.assetFor=select.id;
    const sync=()=>{button.textContent=select.value?(catalogs.get(select).assets.find(a=>a.name===select.value)?.label||select.selectedOptions[0]?.textContent):'Browse image folders…';};sync();
    select.insertAdjacentElement('afterend',button);select.addEventListener('change',sync);
    button.onclick=()=>open({...catalogs.get(select),selected:select.value,onSelect:name=>{
      if(![...select.options].some(o=>o.value===name))select.add(new Option(name,name));select.value=name;select.dispatchEvent(new Event('change',{bubbles:true}));
    }});
  }
  return {attach,open,browser,foldersFor,url,storageOptions,upload};
})();
