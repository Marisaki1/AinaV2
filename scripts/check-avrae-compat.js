// Offline parser/dice compatibility; never connects to Discord or CritterDB.
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process'),YAML=require('yaml');
const C=require('../src/critter/public/core'),{build}=require('../src/critter/authoring');
const c=require('../exports/Seija_Kijin_CritterDB_Avrae.json'),fixtures=[];
for(const section of C.sections)for(const e of c.stats[section])for(const block of C.splitDescription(e.description).blocks){const value=YAML.parse(block.source);for(const action of Array.isArray(value)?value:[value])fixtures.push({...action,scaling:['This Side Down','Reverse Needle Attack'].includes(action.name),maximum:action.name==='This Side Down'?11:10,...(action.name==='This Side Down'?{expectedDC:18}:action.name==='Reverse Needle Attack'?{expectedDC:16}:{})});}
fixtures.push({...build({name:'Compiler regression',kind:'save',target:'each',saveStat:'str',dc:16,damages:[{dice:'4d8',type:'bludgeoning'}],scaling:{enabled:true,maximum:11,count:2,sides:8,dc:1}}).automation,scaling:true,maximum:11,expectedDC:18});
const file=path.join(os.tmpdir(),'aina-avrae-expression-fixture-'+process.pid+'.json');fs.writeFileSync(file,JSON.stringify(fixtures),{mode:0o600});
try{const result=spawnSync(process.env.AINA_AVRAE_PYTHON||'python',[path.join(__dirname,'check-avrae-expressions.py'),file],{stdio:'inherit',windowsHide:true});if(result.error)throw result.error;process.exitCode=result.status??1;}finally{fs.unlinkSync(file);}
