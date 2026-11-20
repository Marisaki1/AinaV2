// Temporary account/database only. No owner data, Discord, or visible browser.
const { chromium }=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),assert=require('node:assert/strict');
const {createService}=require('../src/critter/server');
async function freePort(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const value=server.address().port;await new Promise(r=>server.close(r));return value;}
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aina-transfer-ui-'));
 const service=createService({directory:path.join(directory,'aina'),port:0,worldbuilderOptions:{enabled:true,data:path.join(directory,'wb-data'),port:await freePort()}});let browser;
 try{
  await service.start();browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(service.worldbuilder.url+'/#/home');await page.getByRole('button',{name:'Switch to create account',exact:true}).click();
  await page.getByLabel('Username',{exact:true}).fill('transfer_test');await page.getByLabel('Display name',{exact:true}).fill('Transfer tester');await page.getByLabel('Your first world',{exact:true}).fill('Source test world');
  await page.getByLabel('Password',{exact:true}).fill('isolated-transfer-test');await page.getByLabel('Confirm password',{exact:true}).fill('isolated-transfer-test');await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByLabel('Account menu',{exact:true}).waitFor();
  const fixture=await page.evaluate(async()=>{
   const boot=await(await fetch('/api/bootstrap')).json(),cookie=document.cookie.split('; ').find(v=>v.startsWith(boot.csrf_cookie+'=')),source=boot.worlds[0].id;
   const send=async(url,data)=>{const r=await fetch('/api/'+url,{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':decodeURIComponent(cookie.split('=').slice(1).join('='))},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(JSON.stringify(v));return v;};
   const target=await send('worlds',{name:'Destination test world'}),folder=await send('worlds/'+source+'/resources',{kind:'folder',title:'Research folder'}),place=await send('worlds/'+source+'/resources',{title:'Lighthouse place',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Location body'}]}]}});
   const note=await send('worlds/'+source+'/resources',{kind:'note',title:'Transfer source note',parent:folder.id,summary:'Summary to preserve',private_notes:'Hidden original note',data:{unknown:{preserve:'Original unknown value'}},document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Original rich note about '},{type:'text',text:'the lighthouse',marks:[{type:'bold'},{type:'link',attrs:{href:'/#/entry/'+place.id}}]}]}]}});
   return {source,target:target.id,note:note.id,place:place.id,folder:folder.id};
  });
  const get=async suffix=>page.evaluate(async suffix=>(await(await fetch('/api'+suffix)).json()),suffix);
  await page.reload();await page.getByLabel('Account menu',{exact:true}).waitFor();await page.evaluate(()=>location.hash='/notebooks/all');
  await page.getByRole('button',{name:'Create linked article',exact:true}).click();
  const conversion=page.getByRole('dialog',{name:'Create linked article from note',exact:true});
  await conversion.getByLabel('Article title',{exact:true}).fill('Promoted article');
  await conversion.getByText('Original rich note about ',{exact:false}).waitFor();
  await page.route('**/notebooks',async route=>{
   if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='note_article'){await route.fetch();await route.abort('failed');}else await route.continue();
  });
  await conversion.getByRole('button',{name:'Create private article',exact:true}).click();await conversion.getByRole('alert').waitFor();
  assert.equal(await conversion.getByLabel('Article title',{exact:true}).inputValue(),'Promoted article');
  await page.unroute('**/notebooks');await conversion.getByRole('button',{name:'Create private article',exact:true}).click();await conversion.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Open linked article',exact:true}).waitFor();
  const original=await get('/resources/'+fixture.note),articleId=original.data.note_article_id;
  assert.equal((await get('/resources/'+articleId)).title,'Promoted article');assert.equal((await get('/resources/'+articleId)).visibility,'private');
  const sourceList=await get('/worlds/'+fixture.source+'/resources');assert.equal(sourceList.resources.filter(e=>e.title==='Promoted article').length,1);
  await page.getByRole('button',{name:'Copy & move',exact:true}).click();
  await page.getByRole('combobox',{name:'Destination world',exact:true}).click();await page.getByRole('option',{name:'Destination test world',exact:true}).click();
  await page.getByLabel('Transfer Transfer source note',{exact:true}).check();await page.getByRole('button',{name:'Review transfer',exact:true}).click();
  await page.getByRole('heading',{name:'Copy to Destination test world',exact:true}).waitFor();assert.equal(await page.locator('.transfer-records > div').count(),4);
  await page.getByRole('button',{name:'Confirm reviewed copy',exact:true}).click();await page.getByRole('heading',{name:'Transfer saved',exact:true}).waitFor();
  const after=await get('/resources/'+fixture.note);assert.deepEqual(after.document,original.document);assert.equal(after.revision,original.revision);
  const copied=(await get('/worlds/'+fixture.target+'/resources')).resources;assert.equal(copied.length,4);assert.ok(copied.every(e=>e.visibility==='private'));
  const copiedNote=copied.find(e=>e.kind==='note'),copiedPlace=copied.find(e=>e.title==='Lighthouse place');
  const fullCopy=await get('/resources/'+copiedNote.id);assert.equal(fullCopy.data.unknown.preserve,'Original unknown value');assert.ok(JSON.stringify(fullCopy.document).includes(copiedPlace.id));
  await page.reload();await page.getByRole('heading',{name:'Saved transfer recovered',exact:true}).waitFor();assert.equal((await get('/worlds/'+fixture.target+'/resources')).resources.length,4);
  await page.getByRole('button',{name:'Start another transfer',exact:true}).click();await page.getByLabel('Move originals',{exact:true}).check();await page.getByLabel('Transfer Lighthouse place',{exact:true}).check();
  await page.getByRole('button',{name:'Review transfer',exact:true}).click();await page.getByRole('heading',{name:'Move to Destination test world',exact:true}).waitFor();
  await page.getByText('Source entries that will still reference moved originals',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Confirm reviewed move',exact:true}).isDisabled(),true);
  await page.getByLabel('Acknowledge transfer references',{exact:true}).check();
  await page.route('**/transfer',async route=>{if(route.request().method()==='POST'){const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');}else await route.continue();});
  await page.getByRole('button',{name:'Confirm reviewed move',exact:true}).click();await page.getByRole('alert').waitFor();
  await page.unroute('**/transfer');await page.reload();await page.getByRole('heading',{name:'Saved transfer recovered',exact:true}).waitFor();
  assert.equal((await get('/worlds/'+fixture.target+'/resources')).resources.length,5);
  assert.ok((await get('/worlds/'+fixture.source+'/resources?trash=1')).resources.some(e=>e.id===fixture.place));
  assert.equal((await get('/resources/'+fixture.note)).data.unknown.preserve,'Original unknown value');
  for(const width of [390,1024,1500]){await page.setViewportSize({width,height:1100});assert.ok(await page.locator('.transfer-layout').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Transfer overflow at '+width);}
  await page.screenshot({path:path.join(directory,'reviewed-transfer.png')});assert.deepEqual(errors,[]);
  console.log('PASS rich note conversion/replay after lost response; dependency copy, reference remapping, source preservation, private destinations, reviewed Move and receipt recovery after source Trash; 390/1024/1500 layouts.');
  console.log('Transfer artifacts: '+directory);
 }finally{if(browser)await browser.close();await service.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
