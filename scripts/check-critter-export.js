// Any supplied creature/bestiary export; no live services or mutations.
const fs=require('fs'),C=require('../src/critter/public/core'),{auditCreature}=require('../src/critter/export-audit');
const files=process.argv.slice(2);if(!files.length){console.error('Usage: node scripts/check-critter-export.js <creature-or-bestiary.json> [...]');process.exitCode=2;}
for(const file of files){try{
 const data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));C.importData(data);
 let count=0,errors=0;for(const creature of data.creatures||[data]){const result=auditCreature(creature);count+=result.actions;errors+=result.issues.length;for(const i of result.issues)console.error(`${file}: ${creature.name} / ${i.entry}: [${i.code}] ${i.message}`);}
 console.log(`${file}: ${count} actions; ${errors} static issues. Runtime and live execution are not tested.`);if(errors)process.exitCode=1;
}catch(e){console.error(file+': '+e.message);process.exitCode=1;}}
