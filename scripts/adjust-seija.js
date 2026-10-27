// Build a reviewable JSON file from the previous adjusted export. No API calls.
const fs=require('fs'),path=require('path'),C=require('../src/critter/public/core');
const {build}=require('../src/critter/authoring'),{repair}=require('../src/critter/automation-compat'),S=require('../src/critter/public/spellcasting-model');
function adjust(source){
 let creature=repair(C.validateCreature(source)).creature;
 const index=creature.stats.legendaryActions.findIndex(a=>/This Side Down/.test(a.name));if(index<0)throw new Error('This Side Down was not found.');
 const rules='(Action; 1 spell point plus extra points) Seija inverts gravity in a 20-foot cube she can see within 60 ft. Targets make a DC 16 Strength save. Failure: flung 30 feet, immediately fall for 4d8 bludgeoning damage, become prone, and have movement 0 on their next turn. Success: half damage, no prone or movement restriction. Each extra spell point adds 15 feet of height, 2d8 damage, and +1 DC.';
 const common={resistances:[],immunities:[],vulnerabilities:[]};
 const action=build({name:'This Side Down',kind:'save',rules,target:'each',saveStat:'str',dc:16,half:true,damageTiming:'afterSave',resolutionTiming:'onCast',damages:[{dice:'4d8',type:'bludgeoning'}],scaling:{enabled:true,mode:'points',maximum:11,count:2,sides:8,dc:1},usage:{enabled:true,name:'Spell points',maximumFrom:'fixed',maximum:12,cost:1,reset:'rest',shortRestore:3},effects:[
  {...common,name:'Prone',condition:'prone',description:'Prone. Stand up costs half your speed; requires available movement.',attackRoll:'dis',removeButton:{enabled:true,label:'Stand up',cost:'Spend half your speed in movement. Do not stand while movement is 0.'}},
  {...common,name:'Restricted movement',description:'Movement 0 on your next turn.',duration:1,end:true}
 ]});
 creature.stats.legendaryActions[index]={...creature.stats.legendaryActions[index],description:action.entry.description};
 // Keep the existing repeat/concentration structure and damage-before-save flow.
 for(const section of C.sections)for(const entry of creature.stats[section]||[])if(/Reverse Needle/.test(entry.name))entry.description=entry.description.replace(/At START of your turn:[^"\n]*click Bleeding damage[^"\n]*/g,'Start: 2d8 necrotic. End: CON save; success ends Bleeding.');
 creature=S.write(creature,{enabled:true,dc:16,applyAttack:true,attackBonus:8,resources:[{name:'Spell points',maximum:12,shortRestore:3,longReset:true},{name:'Evil in the Mirror',maximum:5,shortMode:'manual',shortRestore:0,longReset:true},{name:'Reverse Hierarchy',maximum:3,shortMode:'manual',shortRestore:0,longReset:false},{name:'Looking-Glass',maximum:3,shortMode:'manual',shortRestore:0,longReset:false}]});
 creature=require('../src/critter/spellcasting').apply(creature);
 return C.validateCreature(creature);
}
if(require.main===module){const input=process.argv[2],output=process.argv[3]||'exports/Seija_Kijin_CritterDB_Avrae.json';if(!input)throw new Error('Usage: node scripts/adjust-seija.js <previous-adjusted-export.json> [output.json]');const source=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));const result=adjust(source);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2),'utf8');console.log('Created '+output+'; no Discord or CritterDB requests.');}
module.exports={adjust};
