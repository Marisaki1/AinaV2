// Static export checks. This is not an Avrae runtime or official schema validator.
const YAML=require('yaml'),C=require('./public/core');
// Conservative project budget, not an asserted Avrae/platform limit.
const MAX_DEPTH=32;
function auditAction(action,{maxDepth=MAX_DEPTH}={}){
 const issues=[];
 const add=(code,message,path='action')=>issues.push({code,message,path});
 if(!action||typeof action!=='object'||action._v!==2||typeof action.name!=='string'||!Array.isArray(action.automation)){
  add('action-shape','Expected one named _v: 2 action with an automation array.');return issues;
 }
 const stack=[{value:action,path:'action',depth:1,target:false}];let depthReported=false;
 while(stack.length){
  const {value,path,depth,target}=stack.pop();if(!value||typeof value!=='object')continue;
  if(depth>maxDepth&&!depthReported){add('payload-depth',`Payload exceeds the project depth budget of ${maxDepth}; use shallow or balanced routing.`,path);depthReported=true;}
  if(value.type==='condition'&&typeof value.condition==='string'){
   if(value.condition.length>255)add('expression-length','Condition exceeds the 255-character expression limit.',path);
   // Includes compound choice keys (e.g. choice.split("|")[0] == "Fire+Wood").
   const literals=[...value.condition.matchAll(/\bchoice(?:\.[a-z_]+\([^)]*\)|\[[^\]]*\])*\s*==\s*(["'])(.*?)\1/g)];
   for(const [, ,literal] of literals)if(literal!==literal.toLowerCase())add('choice-case','Avrae lowercases choice; this mixed-case literal cannot match: '+literal,path);
  }
  if(['attack','save','damage','temphp','ieffect2'].includes(value.type)&&!target)add('target-context',value.type+' needs a target context.',path);
  const inTarget=target||value.type==='target';
  for(const [key,child] of Object.entries(value)){
   // Granted interactions start new automation, not the containing target's context.
   const nextTarget=['buttons','attacks'].includes(key)?false:inTarget;
   if(child&&typeof child==='object')stack.push({value:child,path:path+'.'+key,depth:depth+1,target:nextTarget});
  }
 }
 return issues;
}
function auditCreature(creature,options){
 const issues=[],names=new Map();let actions=0;
 for(const section of C.sections)for(const [index,entry] of (creature.stats?.[section]||[]).entries()){
  const {blocks}=C.splitDescription(entry.description);
  for(const [blockIndex,block] of blocks.entries()){
   const location={section,index,blockIndex,entry:entry.name};
   // CritterDB's legacy name|hit|damage syntax is not a YAML action.
   if(/^[^\n]*\|[+-]?\d*\|[^\n]*$/.test(block.source.trim()))continue;
   const doc=YAML.parseDocument(block.source,{uniqueKeys:true,maxAliasCount:50});
   if(doc.errors.length){issues.push({...location,code:'yaml',message:doc.errors[0].message});continue;}
   let value;try{value=doc.toJS({maxAliasCount:50});}catch(e){issues.push({...location,code:'yaml',message:e.message});continue;}
   for(const action of Array.isArray(value)?value:[value]){
    actions++;issues.push(...auditAction(action,options).map(i=>({...location,...i})));
    if(action?.name){const name=action.name.toLowerCase();if(names.has(name))issues.push({...location,code:'duplicate-action',message:'Duplicate command name: '+action.name});else names.set(name,location);}
   }
  }
 }
 return {actions,issues};
}
module.exports={MAX_DEPTH,auditAction,auditCreature};
