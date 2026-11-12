'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const ROOT=path.join(__dirname,'WorldBuilder','WorldBuilder');
class WorldBuilder {
  constructor(options={}){
    this.root=options.root||ROOT;const savedFile=path.join(this.root,'aina-data.json');const saved=fs.existsSync(savedFile)?JSON.parse(fs.readFileSync(savedFile,'utf8')):{};
    this.data=path.resolve(options.data||process.env.WORLDBUILDER_DATA||path.join(this.root,saved.dataDirectory||'data'));
    this.port=Number(options.port||process.env.WORLDBUILDER_PORT||8777);
    this.enabled=options.enabled!==false;this.phase=this.enabled?'stopped':'disabled';this.error='';this.child=null;this.starting=null;this.closing=false;
    if(!Number.isInteger(this.port)||this.port<1024||this.port>65535)throw new Error('WORLDBUILDER_PORT must be between 1024 and 65535.');
    this.url=`http://127.0.0.1:${this.port}`;
  }
  status(){return {state:this.phase,error:this.error,...(this.phase==='ready'?{url:this.url}:{}),managed:Boolean(this.child)};}
  python(){return path.join(this.root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');}
  async run(command,args){
    return new Promise((resolve,reject)=>{const p=spawn(command,args,{cwd:this.root,windowsHide:true,stdio:['ignore','pipe','pipe']});let tail='';
      for(const stream of [p.stdout,p.stderr])stream.on('data',b=>{tail=(tail+b.toString()).slice(-2000);});
      p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(new Error(`WorldBuilder preparation failed (${code}): ${tail.trim()}`)));
    });
  }
  async prepare(){
    if(!fs.existsSync(this.python()))await this.run(process.env.WORLDBUILDER_PYTHON||'python',['-m','venv','.venv']);
    try{await this.run(this.python(),['-c','import django, waitress, PIL, bleach, markdown']);}
    catch{await this.run(this.python(),['-m','pip','install','-r','requirements.lock']);}
    if(!fs.existsSync(path.join(this.root,'dist','index.html'))){
      const npm=async command=>process.platform==='win32'?this.run(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`npm.cmd ${command}`]):this.run('npm',command.split(' '));
      await npm('ci --no-fund --no-audit');await npm('run build');
    }
  }
  async probe(){try{const r=await fetch(this.url+'/api/bootstrap',{signal:AbortSignal.timeout(1500)});return r.ok?await r.json():null;}catch{return null;}}
  start(parent){
    if(!this.enabled)return Promise.resolve();if(this.starting)return this.starting;
    this.starting=this.launch(parent).catch(e=>{this.phase='failed';this.error=e.message;}).finally(()=>{this.starting=null;});return this.starting;
  }
  async launch(parent){
    this.closing=false;this.phase='starting';this.error='';await this.prepare();if(this.closing)return;
    const instance=createHash('sha256').update(this.data.toLowerCase()).digest('hex').slice(0,12),existing=await this.probe();
    if(existing){
      if(existing.app!=='worldbuilder-local'||existing.instance!==instance)throw new Error('WorldBuilder port is occupied by another application or data folder. Set WORLDBUILDER_PORT to a free port.');
      if(existing.aina_parent!==parent)throw new Error('Close the separately running WorldBuilder, then restart Aina so it can manage the integrated app.');
      this.phase='ready';return;
    }
    const child=spawn(this.python(),['scripts/aina_host.py','--port',String(this.port),'--no-browser'],{cwd:this.root,windowsHide:true,env:{...process.env,WORLDBUILDER_DATA:this.data,AINA_WORLDBUILDER_PARENT:parent},stdio:['pipe','pipe','pipe']});this.child=child;
    let tail='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{tail=(tail+b.toString()).slice(-2000);});
    let failure;child.once('error',e=>{failure=e.message;});child.once('exit',code=>{if(this.child===child)this.child=null;if(!this.closing){this.phase='failed';this.error=failure||`WorldBuilder stopped (${code}). ${tail.trim()}`;}});
    for(let i=0;i<120;i++){
      if(this.closing)return;
      if(this.phase==='failed'||failure)throw new Error(failure||this.error);
      const boot=await this.probe();if(boot?.app==='worldbuilder-local'&&boot.instance===instance&&boot.aina_parent===parent){this.phase='ready';return;}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    await this.close();throw new Error('WorldBuilder did not become ready. Check the Python environment and local port.');
  }
  async close(){
    this.closing=true;const child=this.child;if(child){await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},4000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.stdin.end();});this.child=null;}
    if(this.enabled)this.phase='stopped';
  }
}
module.exports={WorldBuilder};
