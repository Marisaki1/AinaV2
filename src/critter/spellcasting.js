const YAML=require('yaml'),C=require('./public/core'),S=require('./public/spellcasting-model');
const {updateRecipe}=require('./automation-compat');
function apply(creature){
 const config=S.read(creature);if(!config||!config.enabled&&!config.applyAttack)return C.clone(creature);
 const c=C.clone(creature);
 for(const section of C.sections)for(const entry of c.stats[section]||[]){
  const before=entry.description,override=S.overrides(entry),oldDCs=new Set(),oldHits=new Set(),actualDCs=new Set();
  entry.description=before.replace(/(<avrae\s+hidden>)([^]*?)(<\/avrae>)/gi,(whole,open,source,close)=>{
   const doc=YAML.parseDocument(source,{keepSourceTokens:true,uniqueKeys:true});if(doc.errors.length)return whole;const patches=[];
   function visit(node){if(YAML.isMap(node)){
    const type=node.get('type');
    if(type==='save'){const base=String(node.get('dc')).match(/^([+-]?\d+)/);if(base)actualDCs.add(Number(base[1]));}
    for(const [key,total,skip,set]of [['dc',config.dc,override.dc||!config.enabled,oldDCs],['defaultDC',config.dc,override.dc||!config.enabled,oldDCs],['attackBonus',config.attackBonus,override.attack||!config.applyAttack,oldHits],['defaultAttackBonus',config.attackBonus,override.attack||!config.applyAttack,oldHits]]){
     if(skip||!node.has(key)||(key==='dc'&&type!=='save')||(key==='attackBonus'&&type!=='attack'))continue;
     const scalar=node.get(key,true);if(!YAML.isScalar(scalar)||!scalar.range)continue;const old=String(scalar.value),m=old.match(/^([+-]?\d+)(\s*[+-][^]*)?$/);
     const upcast=m?.[2]&&/(?:ainaSteps|int\(choice or 0\)|spell_level)/.test(m[2])?m[2]:'';
     set.add(m?Number(m[1]):NaN);const replacement=String(total)+upcast;if(old!==replacement)patches.push({start:scalar.range[0],end:scalar.range[1],text:typeof scalar.value==='number'&&!upcast&&key!=='attackBonus'?String(total):JSON.stringify(replacement)});
    }
    for(const p of node.items)visit(p.value);
   }else if(YAML.isSeq(node))node.items.forEach(visit);}
   visit(doc.contents);for(const p of patches.sort((a,b)=>b.start-a.start))source=source.slice(0,p.start)+p.text+source.slice(p.end);
   // Keep explicit DC reminders consistent with the save nodes changed above.
   if(!override.dc&&oldDCs.size)source=source.replace(/\bDC (\d+)\b/g,()=> 'DC '+config.dc);
   return open+source+close;
  });
  // Prose-only conventions, and unambiguous prose accompanying explicit automation.
  if(config.enabled&&!override.dc)entry.description=entry.description.replace(/\bDC\s+(\d+)\b/g,(m,n)=>!C.splitDescription(before).blocks.length||oldDCs.size?m.replace(n,String(config.dc)):m);
  if(config.applyAttack&&!override.attack)entry.description=entry.description.replace(/([+-]\d+)\s+to hit/gi,(m,n)=>!C.splitDescription(before).blocks.length||oldHits.has(Number(n))?m.replace(n,(config.attackBonus>=0?'+':'')+config.attackBonus):m);
  if(override.dc&&actualDCs.size===1){const visible=[...new Set([...C.splitDescription(before).readable.matchAll(/\bDC\s+(\d+)\b/g)].map(m=>Number(m[1])))];if(visible.length===1)entry.description=entry.description.replace(/\bDC\s+(\d+)\b/g,(m,n)=>Number(n)===visible[0]?m.replace(n,String([...actualDCs][0])):m);}
  if(entry.description!==before)entry.description=updateRecipe(before,entry.description,r=>{if(config.enabled&&!override.dc&&r.kind==='save')r.dc=config.dc;if(config.applyAttack&&!override.attack&&r.kind==='attack')r.attackBonus=config.attackBonus;});
 }
 const notes=S.rules(c).replace(/(?:spell(?: save)? DC|She has a DC of)\s+(\d+)/gi,m=>config.enabled?m.replace(/\d+$/,String(config.dc)):m).replace(/([+-]\d+)( to spell hits)/gi,(m,n,tail)=>config.applyAttack?(config.attackBonus>=0?'+':'')+config.attackBonus+tail:m);
 c.stats.legendaryActionsDescription=notes;
 return S.write(c,config);
}
module.exports={apply};
