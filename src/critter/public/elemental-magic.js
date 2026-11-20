(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ElementalMagic=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const elements=['Fire','Water','Wood','Metal','Earth'],types=['fire','cold','lightning','thunder','radiant'];
 const eligible=c=>c?._id==='6abe01e115443bd5efcef40d'||c?.name==='Patchouli Knowledge';
 function build(s){
  const base=elements.filter(e=>(s.elements||[]).includes(e));
  if(base.length!==2)throw Error('Choose two different elements.');
  const selected=[...base];if(s.useStored){if(!elements.includes(s.stored))throw Error('Record a stored Wis element first.');if(!selected.includes(s.stored))selected.push(s.stored);}
  const infusion=s.infusion||'none',infused=infusion==='none'?'':s.infused;
  if(!['none','sun','moon'].includes(infusion))throw Error('Choose Sun, Moon, or no infusion.');
  if(infused&&!selected.includes(infused)||infusion!=='none'&&!infused)throw Error('Choose a selected element to infuse.');
  const type=s.damageType||'fire';if(!types.includes(type))throw Error('Choose a damage type.');
  const inf=infusion==='none'?'none':infusion+infused.toLowerCase();
  const active=selected.filter(e=>e!==infused),healing=active.includes('Water')||inf==='sunwater';
  const shapes=[];if(active.includes('Fire')||inf==='sunfire')shapes.push(inf==='sunfire'?'Directed line, 120 by 5 ft.':'Line, 120 by 5 ft.');if(active.includes('Metal'))shapes.push('Line, 25 by 5 ft., centered on touch');if(inf==='sunmetal')shapes.push('15-foot square centered on self');if(!shapes.length)shapes.push('Touch');
  const shape=shapes.includes(s.area)?s.area:shapes[0],area=shape!=='Touch',mult=inf==='sunwood'?3:active.includes('Wood')?2:1;
  const harmful=['moonwood','moonmetal','sunearth'].includes(inf);
  const key=elements.filter(e=>selected.includes(e)).join('+');
  const effects=[healing?`Heal allies for 2d10${mult>1?' × '+mult:''}.`:`${area||inf==='moonwater'||harmful?'DC 16 Dexterity save; half damage on success.':'+8 spell attack against one target.'} 2d10${mult>1?' × '+mult:''} ${type} damage.`];
  if(active.includes('Earth')&&!healing)effects.push('Ignores resistance; preserves immunity and vulnerability.');
  const notes={sunwater:'Gain temporary HP equal to HP actually restored.',sunearth:'Failed save: vulnerability to this damage type until the end of Patchouli’s turn.',moonfire:'Teleport to a visible space within 60 feet after casting.',moonwater:'Failed save: Prone and speed 0 until the end of Patchouli’s turn.',moonwood:'Failed save: two exhaustion levels until the end of Patchouli’s turn.',moonmetal:'Failed save: Stunned until the end of Patchouli’s turn.',moonearth:'Block the next damage received; remove the immunity effect immediately afterward.'};
  if(notes[inf])effects.push(notes[inf]);
  return {name:selected.join(' - '),key,choice:key.toLowerCase()+'|'+inf+'/'+type,enemyChoice:healing&&harmful?key.toLowerCase()+':'+inf+':enemies|'+type:null,healing,area,shapes,shape,effects,inf,selected};
 }
 function commands(s,{actor,sourceName,prefix='!',combat=true,targets=[],allies=[],enemies=[]}){
  const b=build(s),quote=v=>'"'+String(v).replace(/["\r\n\\]/g,()=>{throw Error('Invalid command name.');})+'"';
  const command=(choice,names)=>{if(!names.length)throw Error('Choose '+(b.healing?'ally':'spell')+' targets.');if(!b.area&&names.length>1)throw Error('Touch spells require one target.');return prefix+(combat?'i aoo '+quote(actor):'ma '+quote(sourceName))+' '+quote('Elemental Magic')+' '+names.map(n=>'-t '+quote(n)).join(' ')+' -choice '+quote(choice);};
  const result=[command(b.choice,b.healing?allies:targets)];
  if(b.enemyChoice&&enemies.length)result.push(command(b.enemyChoice,enemies));
  return result;
 }
 return {elements,types,eligible,build,commands};
});
