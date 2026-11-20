const fs=require('fs');
const c=JSON.parse(fs.readFileSync('exports/Patchouli_uploaded_original.json','utf8'));
c.stats.abilityScores.intelligence=20;
c.stats.savingThrows.find(x=>x.ability==='intelligence').value=8;
for(const x of c.stats.skills)if(['Arcana','History','Religion','Investigation'].includes(x.name))x.value=8;
const types=['fire','cold','lightning','thunder','radiant'],elements=['Fire','Water','Wood','Metal','Earth'];
const target=effects=>({type:'target',target:'each',effects});
const self=effects=>({type:'target',target:'self',effects});
const text=s=>({type:'text',text:s});
function effect(name,desc,passive={},duration=1){return {type:'ieffect2',name,desc,effects:passive,duration,end:true,tick_on_caster:true,stacking:false,buttons:[{label:'End effect',automation:[{type:'remove_ieffect'}]}]};}
function cond(p,yes,no=[]){return {type:'condition',condition:p,onTrue:yes,onFalse:no,errorBehaviour:'raise'};}
function block(name,auto,act=1){return '<avrae hidden>\n'+JSON.stringify({_v:2,name,activation_type:act,automation:auto})+'\n</avrae>';}
function entry(name,rules,auto,act=1){return {name,description:rules+'\n\n'+block(name,auto,act)};}
const ward=effect('Moon Earth','Immune to the next damage received. Remove immediately after it is blocked.',{immunities:['acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder']},-1);
ward.buttons[0].label='Remove after damage';
function status(inf){
 if(inf==='moonwater')return [effect('Prone','Speed is 0. Outgoing attacks have disadvantage; incoming attacks depend on distance. Ends at the end of Patchouli’s turn.',{attack_advantage:-1})];
 if(inf==='moonmetal')return [effect('Stunned','Incapacitated; cannot move; automatically fails Strength and Dexterity saves; incoming attacks have advantage. Ends at the end of Patchouli’s turn.')];
 if(inf==='moonwood')return [effect('Exhaustion','Two levels of exhaustion: -4 to D20 Tests and speed reduced by 10 feet; ends at the end of Patchouli’s turn.',{to_hit_bonus:'-4',save_bonus:'-4',check_bonus:'-4'})];
 return [];
}
function damage(amount,type,earth){const normal={type:'damage',damage:`(${amount})[${type}]`,fixedValue:true};return earth?cond(`target.resistances.is_immune("${type}")`,[normal],[{...normal,damage:`(${amount})[^${type}]`}]):normal;}
function resolve(es,inf,type,mode='normal'){
 const active=es.filter(e=>inf!==('sun'+e.toLowerCase())&&inf!==('moon'+e.toLowerCase()));
 const healing=(active.includes('Water')||inf==='sunwater')&&mode!=='enemies';
 const mult=inf==='sunwood'?3:active.includes('Wood')?2:1;
 const area=active.includes('Fire')||active.includes('Metal')||inf==='sunfire'||inf==='sunmetal';
 const extra=inf==='sunearth'?[effect('Vulnerability',`Vulnerable to ${type} damage until the end of Patchouli?s turn.`,{vulnerabilities:[type]})]:status(inf),auto=[];
 if(inf==='moonearth')auto.push(self([ward]));
 if(inf==='moonfire')auto.push(text('After casting, teleport to a space you can see within 60 feet.'));
 if(healing){auto.push({type:'roll',dice:`(2d10)*${mult}`,name:'healing',displayName:'Healing',fixedValue:true});auto.push(target([{type:'variable',name:'healed',value:'healing if target.max_hp-target.hp >= healing else target.max_hp-target.hp if target.max_hp > target.hp else 0'}, {type:'damage',damage:'-{healing}',fixedValue:true},...(inf==='sunwater'?[{type:'temphp',amount:'{target.temp_hp if target.temp_hp > healed else healed}'}]:[])]));return auto;}
 const earth=active.includes('Earth');
 const hit=[];
 if(inf==='sunearth')hit.push(effect('Vulnerability',`Vulnerable to ${type} damage until the end of Patchouli’s turn.`,{vulnerabilities:[type]}));
 hit.push(damage('{damage}',type,earth),... (inf==='sunearth'?[]:extra));
 const save={type:'save',stat:'dex',dc:'16',fail:hit,success:[damage('({damage})/2',type,earth)]};
 if(mode==='enemies') {save.fail=extra;save.success=[];auto.push(target([save]));return auto;}
 if(area||extra.length||inf==='sunearth'){auto.push({type:'roll',dice:`((2d10)*${mult})[${type}]`,name:'damage',displayName:'Damage'},target([save]));}
 else {const outcomes=[damage(`(2d10)*${mult}`,type,earth)];auto.push(target([{type:'attack',attackBonus:'8',hit:outcomes,miss:[]} ]));}
 return auto;
}
let choices=0;
c.stats.actions=[];
for(let mask=1;mask<32;mask++){
 const es=elements.filter((e,i)=>mask&(1<<i));if(![2,3].includes(es.length))continue;
 const options=['none',...es.flatMap(e=>['sun'+e.toLowerCase(),'moon'+e.toLowerCase()])];
 let tree=[text('Choose an infusion and damage type: none/fire, sunwood/cold, etc. Only a selected element can be infused.')];
 for(const inf of options.slice().reverse())for(const type of types.slice().reverse()){
 const key=inf+'/'+type;choices++;
 let auto=resolve(es,inf,type);
 tree=[cond(`choice == "${key}"`+(inf==='none'&&type==='fire'?' or choice == ""':''),auto,tree)];
 }
 const name='Philosopher’s Stone —'+es.join(' + ');
 const rules='Magic action. Combine '+es.join(' and ')+'. Base 2d10 damage. Single-target spells use +8 to hit; area spells use a DC 16 Dexterity save, half damage on success. Fire: 120-foot by 5-foot line. Metal: 25-foot by 5-foot line centered on the touched space. Choose which area applies if both are present. Otherwise range is touch. Water heals allies instead. Wood doubles the roll; Earth ignores resistance, preserving immunity and vulnerability. An infusion replaces its selected element. Three-element casts require a stored element from Wis. Water has 3 uses per long rest; infusions have 5 uses per long rest, at most one per turn. Sun Fire: freely directed 120-foot by 5-foot line, no target hit twice. Sun Water: healing and equal temporary hit points. Sun Wood: triple roll. Sun Metal: 15-foot square centered on Patchouli. Sun Earth: vulnerability to the chosen type. Moon Fire: teleport 60 feet after casting. Moon Water: enemies have speed 0 and are Prone. Moon Wood: enemies gain two exhaustion levels. Moon Metal: enemies are Stunned. Harmful infusion effects require a failed DC 16 Dexterity save and end at the end of Patchouli’s turn. Moon Earth: immunity to the next damage received.';
 c.stats.actions.push(entry(name,rules,tree));
 // Healing combinations with harmful infusions resolve the enemies separately, without rerolling healing or spending another use.
 if(es.includes('Water'))for(const inf of options.filter(i=>['moonwood','moonmetal','sunearth'].includes(i))){const nm=name+' —'+inf+' enemies';c.stats.actions.push(entry(nm,'As part of the same casting, selected enemies make a DC 16 Dexterity save. Failure applies the infusion effect until the end of Patchouli’s turn. This does not spend a second use.',types.map(t=>cond(`choice == "${t}"`+(t==='fire'?' or choice == ""':''),resolve(es,inf,t,'enemies')))));}
}
const named=c.stats.legendaryActions;
function namedSpell(idx,dice,rules,statusName){const name=named[idx].name;let tree=[text('Choose fire, cold, lightning, thunder, or radiant.')];for(const t of [...types].reverse()){let fail=[damage('{damage}',t,false)];if(statusName)fail.push(effect(statusName,statusName==='Stunned'?'Incapacitated; cannot move; automatically fails Strength and Dexterity saves; incoming attacks have advantage. Ends at the end of Patchouli’s turn.':'Speed 0; outgoing attacks have disadvantage; incoming attacks depend on distance. Ends at the end of Patchouli’s turn.',statusName==='Prone'?{attack_advantage:-1}:{}));tree=[cond(`choice == "${t}"`+(t==='fire'?' or choice == ""':''),[{type:'roll',dice:`(${dice})[${t}]`,name:'damage',displayName:'Damage'},target([{type:'save',stat:'dex',dc:'16',fail,success:[damage('({damage})/2',t,false)]}])],tree)];}named[idx]={...named[idx],description:rules+'\n\n'+block(name,tree)};}
namedSpell(0,'2d10','Magic action. Fire + Metal. A 100-foot by 10-foot line. DC 16 Dexterity save; 2d10 damage on failure, half on success.');
namedSpell(1,'2d10','Magic action. Sun Fire + Metal. Each creature in a 30-foot radius centered on a point Patchouli can see within 120 feet makes a DC 16 Dexterity save. Failure: 2d10 damage and Stunned until the end of Patchouli’s turn. Success: half damage, no stun. Costs one infusion use.','Stunned');
namedSpell(2,'2d10','Magic action. Moon Water + Earth. Each enemy in a 15-foot square centered on a point within 60 feet makes a DC 16 Dexterity save. Failure: 2d10 damage, speed 0, and Prone until the end of Patchouli’s turn. Success: half damage, no condition. Damage ignores resistance but preserves immunity. Costs one Water use and one infusion use.','Prone');
// Silent Selene retains Earth’ resistance bypass.
// Rebuild Silent Selene damage nodes recursively for Earth.
const m=named[2].description.match(/<avrae hidden>([\s\S]*?)<\/avrae>/);const st=JSON.parse(m[1]);function earthify(n){if(Array.isArray(n))return n.map(earthify);if(n&&typeof n==='object'){if(n.type==='damage'){const mt=n.damage.match(/^\((.*)\)\[(\w+)\]$/);if(mt)return damage(mt[1],mt[2],true);}for(const k of Object.keys(n))n[k]=earthify(n[k]);}return n;}earthify(st);named[2].description=named[2].description.split('<avrae hidden>')[0]+ '<avrae hidden>\n'+JSON.stringify(st)+'\n</avrae>';
c.stats.additionalAbilities[0].description+='\n\nWater: 3 uses per long rest. Spell attack bonus +8; spell save DC 16. For competing areas, Patchouli chooses which applies; Wood multiplies healing as well as damage.';
c.stats.additionalAbilities[1].description=c.stats.additionalAbilities[1].description.replace('doesn遯ｶ蜀ｲ','does not');
c.stats.additionalAbilities[2].description+='\n\n5 uses per long rest, at most one infusion per turn. Harmful infusions require a failed DC 16 Dexterity save and end at the end of Patchouli’s turn. Moon Wood gives the enemy two exhaustion levels. Moon Earth blocks the next damage Patchouli receives.';
c.stats.additionalAbilities[2].description='When Patchouli uses her Magic action, she can infuse one of its selected elements with Sun or Moon, replacing that element?s normal effect. Five uses per long rest; at most one infusion per turn.\nSun Fire: a freely directed 120-foot by 5-foot line; cannot hit a target twice. Sun Water: heal allies and grant temporary hit points equal to HP actually restored. Sun Wood: triple the base roll. Sun Metal: a 15-foot square centered on Patchouli. Sun Earth: on a failed DC 16 Dexterity save, the enemy becomes vulnerable to the chosen damage type until the end of Patchouli?s turn, including the current damage.\nMoon Fire: teleport to a visible space within 60 feet after casting. Moon Water: on a failed DC 16 Dexterity save, enemies have speed 0 and are Prone. Moon Wood: on a failed DC 16 Dexterity save, enemies gain two levels of Exhaustion. Moon Metal: on a failed DC 16 Dexterity save, enemies are Stunned. These harmful Moon effects end at the end of Patchouli?s turn. Moon Earth: immunity to the next damage Patchouli receives.';
c.stats.reactions[0].description+='\n\n3 uses per long rest. Absorption does not reduce damage. The absorbed element is added as a third element to the next spell; it expires at the end of Patchouli’s next turn.';
let wis=[];for(const e of [...elements].reverse()){const ef=effect('Wis: '+e,'Stored '+e+' element. Adds a third element to the next spell. Remove after using it.',{},1);ef.buttons[0].label='Use stored element';wis=[cond(`choice == "${e.toLowerCase()}"`,[self([ef])],wis.length?wis:[text('Choose fire, water, wood, metal, or earth.')])];}c.stats.reactions[0].description+='\n\n'+block('Wis',wis,4);
c.stats.legendaryActionsDescription='Unique combinations use a Magic action, replacing the usual combination effects. Spell attack +8; save DC 16. Water: 3 uses per long rest. Royal Diamond Ring: 5 uses per long rest, at most one infusion per turn. Wis: 3 uses per long rest.';
/* compact below */
const routes=[];
for(const a of c.stats.actions){
 const payload=JSON.parse(a.description.match(/<avrae hidden>([\s\S]*?)<\/avrae>/)[1]);
 const bits=a.name.split(/\s*\u2014\s*/); const pair=bits[1].split(' + ').join('+'); const enemy=bits.length>2?bits[2].split(' ')[0]:null;
 function rewrite(n){if(Array.isArray(n))return n.map(rewrite);if(n&&typeof n==='object'){if(n.type==='condition'&&n.condition.includes('choice ==')){n.condition=n.condition.replace(/choice/g,'choice.split("|")[1]');}for(const k of Object.keys(n))if(typeof n[k]==='object')n[k]=rewrite(n[k]);}return n;}
 routes.push({key:pair+(enemy?':'+enemy+':enemies':''),automation:rewrite(payload.automation)});
}
let root=[text('Select two elements, an optional infusion, and a damage type.')];
for(const route of routes.reverse())root=[cond('choice.split("|")[0] == '+JSON.stringify(route.key.toLowerCase()),route.automation,root)];
// Choice alternatives are mutually exclusive. Keep them as siblings, not a
// recursive else-if chain: Avrae validates every branch when importing.
function flattenChoices(nodes){
 const out=[];
 for(const original of nodes){
  const n=structuredClone(original);
  if(n.type==='condition' && (n.condition.includes('choice ==') || n.condition.includes('choice.split('))){
   const alternatives=n.onFalse;
   n.onTrue=flattenChoices(n.onTrue);n.onFalse=[];out.push(n);
   out.push(...flattenChoices(alternatives));
  }else{
   for(const key of ['onTrue','onFalse','effects','hit','miss','fail','success'])if(Array.isArray(n[key]))n[key]=flattenChoices(n[key]);
   out.push(n);
  }
 }
 // A trailing choice-help text was the old final else branch. The mixer
 // validates choices; do not print that text after a successful selection.
 return out.filter(n=>n.type!=='text'||!/^Select two elements|^Choose an infusion/.test(n.text));
}
root=[cond('choice.count("|") == 1',flattenChoices(root),[text('Prepare Elemental Magic in the element mixer.')])];
c.stats.actions=[entry('Elemental Magic','Magic action. Combine two different elements. Wis can supply a third element. An optional Sun or Moon infusion replaces one selected element?s effect. Spell attack +8; spell save DC 16.',root)];
c.stats.actions[0].description='<!-- AINA_ELEMENTAL_MAGIC:v3 -->\n'+c.stats.actions[0].description;
fs.writeFileSync('src/critter/public/elemental-magic-data.json',JSON.stringify({actions:c.stats.actions,reactions:c.stats.reactions,legendaryActions:c.stats.legendaryActions}));
fs.writeFileSync('exports/Patchouli_Knowledge_CritterDB_Avrae.json',JSON.stringify(c,null,2)+'\n');console.log({actions:c.stats.actions.length,choices,bytes:fs.statSync('exports/Patchouli_Knowledge_CritterDB_Avrae.json').size});

