window.WorldBuilderUI=(()=>{
  let panel,frame,backendOrigin,initialized=false;
  const size=()=>{const header=$('.app-header');document.documentElement.style.setProperty('--aina-header-height',(header?.getBoundingClientRect().height||80)+'px');};
  const resize=new ResizeObserver(size);
  window.addEventListener('resize',size);
  function init(){
    if(initialized)return;initialized=true;
    window.addEventListener('message',e=>{
      if(!frame||e.source!==frame.contentWindow||e.origin!==backendOrigin)return;
      if(e.data?.type==='aina:navigate'&&['worldbuilder','combat','initiative','siege','library','sender','roleplay'].includes(e.data.tab))setTab(e.data.tab);
      if(e.data?.type==='aina:account'){
        $('#aina-account').hidden=e.data.authenticated!==true;
        $('#aina-account-name').textContent=String(e.data.name||'Account').slice(0,80);
      }
    });
    bind('aina-logout',()=>{setTab('worldbuilder');$('#aina-account').removeAttribute('open');frame?.contentWindow.postMessage({type:'aina:logout'},backendOrigin);});
    document.addEventListener('click',e=>{for(const id of ['aina-menu','aina-account']){const d=$('#'+id);if(d&&!d.contains(e.target))d.removeAttribute('open');}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const id of ['aina-menu','aina-account'])$('#'+id)?.removeAttribute('open');});
  }
  async function render(){
    if(!panel?.isConnected){panel=document.createElement('section');panel.id='worldbuilder-panel';panel.className='worldbuilder-panel';$('#workspace').append(panel);}
    panel.hidden=false;resize.observe($('.app-header'));size();
    const status=await api('worldbuilder');if(ui.tab!=='worldbuilder'){panel.hidden=true;return;}
    if(status.state!=='ready'){
      panel.textContent='';const h=document.createElement('h1');h.textContent='WorldBuilder';const p=document.createElement('p');p.textContent=status.error||'WorldBuilder is '+status.state+'.';panel.append(h,p);frame=null;return;
    }
    if(!frame){panel.textContent='';backendOrigin=new URL(status.url).origin;frame=document.createElement('iframe');frame.title='WorldBuilder';frame.src=status.url+'/';panel.append(frame);}
  }
  return {render,init};
})();
