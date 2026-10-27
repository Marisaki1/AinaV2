const YAML=require('yaml'),C=require('./public/core'),A=require('./public/authoring-model');
function choiceGuard(maximum,automation){
  return [{type:'variable',name:'ainaSteps',value:'choice or 0',onError:-1},{type:'condition',condition:'ainaSteps >= 0 and ainaSteps <= '+maximum,onTrue:automation,onFalse:[{type:'text',text:'Use -choice N, without =, for 0 through '+maximum+' extra steps.'}],errorBehaviour:'raise'}];
}
function updateRecipe(original,body,change){const recipe=A.recipe(original);if(!recipe)return body;body=body.replace(/<!-- AINA_ABILITY:v1:[^]*? -->\s*/,'').trim();if(change)change(recipe);return '<!-- AINA_ABILITY:v1:'+encodeURIComponent(JSON.stringify({definition:recipe,fingerprint:A.fingerprint(body)}))+' -->\n'+body;}
function repair(creature){
 const c=C.clone(creature),changes=[];
 for(const section of C.sections)for(const [index,entry]of(c.stats[section]||[]).entries()){
  const original=entry.description;let changed=false;
  entry.description=original.replace(/(<avrae\s+hidden>)([^]*?)(<\/avrae>)/gi,(whole,open,source,close)=>{
   const doc=YAML.parseDocument(source,{keepSourceTokens:true,uniqueKeys:true});if(doc.errors.length)return whole;
   const patches=[];
   function visit(node){if(YAML.isMap(node)){
    const scalar=node.get('condition',true),m=node.get('type')==='condition'&&YAML.isScalar(scalar)&&String(scalar.value).match(/^choice == '' or choice in (\[[^]*\])$/);
    if(m){let choices;try{choices=JSON.parse(m[1]);}catch{}if(Array.isArray(choices)&&choices.length>=2&&choices.length<=101&&choices.every((v,i)=>v===String(i)))patches.push({start:scalar.range[0],end:scalar.range[1],text:JSON.stringify("choice == '' or "+choices.map(v=>'choice == '+JSON.stringify(v)).join(' or '))});}
    for(const pair of node.items)visit(pair.value);
   }else if(YAML.isSeq(node))node.items.forEach(visit);}
   visit(doc.contents);if(!patches.length)return whole;
   for(const p of patches.sort((a,b)=>b.start-a.start))source=source.slice(0,p.start)+p.text+source.slice(p.end);
   changed=true;return open+source+close;
  });
  if(changed){entry.description=updateRecipe(original,entry.description);changes.push({section,index,name:entry.name});}
 }
 return {creature:c,changes};
}
module.exports={choiceGuard,repair,updateRecipe};
