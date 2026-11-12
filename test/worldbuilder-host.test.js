const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../src/critter/WorldBuilder/WorldBuilder');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
test('managed Python startup failure exits cleanly while the parent stdin pipe remains open',{skip:!fs.existsSync(python),timeout:15000},async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aina-host-failure-')),blocker=path.join(directory,'not-a-directory');fs.writeFileSync(blocker,'fixture');
  const child=spawn(python,['scripts/aina_host.py','--no-browser','--port','8879'],{cwd:root,windowsHide:true,env:{...process.env,WORLDBUILDER_DATA:blocker},stdio:['pipe','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill();fs.unlinkSync(blocker);fs.rmdirSync(directory);});
  let output='';child.stderr.on('data',b=>{output+=b.toString();});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  assert.equal(code,1,output);assert.match(output,/FileExistsError|NotADirectoryError/);assert.doesNotMatch(output,/Fatal Python error|_enter_buffered_busy|could not acquire lock/);
});
