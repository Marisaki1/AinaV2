(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Spellcasting=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const marker=/<!-- AINA_SPELLCASTING:v1:([^]*?) -->\s*/;
  const overrideMarker=/<!-- AINA_SPELL_OVERRIDE:v1:([^]*?) -->\s*/;
  const integer=(v,label,min,max)=>{if(!/^[-+]?\d+$/.test(String(v))||Number(v)<min||Number(v)>max)throw new Error(label+' must be an integer from '+min+' to '+max+'.');return Number(v);};
  function validate(raw={}){
    const config={enabled:Boolean(raw.enabled),dc:integer(raw.dc??16,'Default DC',1,100),attackBonus:integer(raw.attackBonus??8,'Spell hit',-100,100),applyAttack:Boolean(raw.applyAttack),resources:[]};
    if(!Array.isArray(raw.resources||[])||(raw.resources||[]).length>20)throw new Error('Use up to 20 named resources.');
    const names=new Set();
    config.resources=(raw.resources||[]).map(r=>{const name=String(r.name||'').trim();if(!name||name.length>80||/[\r\n\x00-\x1f]/.test(name)||names.has(name.toLowerCase()))throw new Error('Give each resource a unique name (1–80 characters).');names.add(name.toLowerCase());if(!['fixed','half','manual'].includes(r.shortMode||'fixed'))throw new Error('Choose a short-rest recovery mode.');return {name,shortMode:r.shortMode||'fixed',maximum:integer(r.maximum??1,'Resource maximum',0,10000),shortRestore:integer(r.shortRestore??0,'Short-rest recovery',0,10000),longReset:r.longReset!==false};});
    return config;
  }
  function read(creature){const m=String(creature?.stats?.legendaryActionsDescription||'').match(marker);if(!m)return null;try{return validate(JSON.parse(decodeURIComponent(m[1])));}catch(e){throw new Error('Spellcasting configuration: '+e.message);}}
  function write(creature,raw){const cfg=validate(raw),c=JSON.parse(JSON.stringify(creature));c.stats.legendaryActionsDescription='<!-- AINA_SPELLCASTING:v1:'+encodeURIComponent(JSON.stringify(cfg))+' -->\n'+String(c.stats.legendaryActionsDescription||'').replace(marker,'');return c;}
  const rules=creature=>String(creature?.stats?.legendaryActionsDescription||'').replace(marker,'');
  function overrides(entry){const m=entry.description.match(overrideMarker);if(!m)return {};try{const value=JSON.parse(decodeURIComponent(m[1]));return {dc:Boolean(value.dc),attack:Boolean(value.attack)};}catch{throw new Error('Ability spellcasting override is damaged.');}}
  function setOverride(entry,key,value){if(!['dc','attack'].includes(key))throw new Error('Invalid spellcasting override.');const original=entry.description,A=typeof module==='object'&&module.exports?require('./authoring-model'):globalThis.Authoring,recipe=A?.recipe(original);const o={...overrides(entry),[key]:Boolean(value)};entry.description=entry.description.replace(overrideMarker,'');if(o.dc||o.attack)entry.description='<!-- AINA_SPELL_OVERRIDE:v1:'+encodeURIComponent(JSON.stringify(o))+' -->\n'+entry.description;if(recipe){const body=entry.description.replace(/<!-- AINA_ABILITY:v1:[^]*? -->\s*/,'').trim();entry.description='<!-- AINA_ABILITY:v1:'+encodeURIComponent(JSON.stringify({definition:recipe,fingerprint:A.fingerprint(body)}))+' -->\n'+body;}return entry;}
  return {read,write,validate,rules,overrides,setOverride,marker,overrideMarker,integer};
});
