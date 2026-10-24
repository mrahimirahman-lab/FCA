import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
import { analyzeImage } from '../server/ai.js';

async function fixture(t, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(),'fca-test-'));
  const start = () => new Promise(resolve => { const server = createApp({dataDir,aiKey:'',...options}).listen(0,'127.0.0.1',() => resolve(server)); });
  let server = await start();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dataDir,{recursive:true,force:true}); });
  const request = async (url, method = 'GET', body, headers = {}) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {method,headers: body instanceof FormData ? headers : {'Content-Type':'application/json',...headers},body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)}); return {status:response.status,data:await response.json()}; };
  const upload = async () => { const buffer = await sharp({create:{width:100,height:80,channels:3,background:'#ffffff'}}).png().toBuffer(); const form = new FormData();form.append('image',new Blob([buffer],{type:'image/png'}),'plan.png');const result=await request('/uploads','POST',form);assert.equal(result.status,201);return result.data; };
  const project = async () => { const result=await request('/projects','POST',{name:'Blok A',building:'d',floor:'b1'}); assert.equal(result.status,201);return result.data; };
  return {request,upload,project,origin:()=>`http://127.0.0.1:${server.address().port}`,restart:async () => {await new Promise(resolve => server.close(resolve));server=await start();}};
}

test('hosting password protects application, records and images while health checks stay public',async t=>{
  const f=await fixture(t,{accessUser:'inspector',accessPassword:'test-password-only',aiKey:'test-placeholder'});
  assert.deepEqual((await f.request('/health')).data,{ok:true});
  assert.equal((await f.request('/projects')).status,401);
  assert.equal((await fetch(f.origin()+'/')).status,401);
  assert.equal((await fetch(f.origin()+'/uploads/example.png')).status,401);
  const auth={Authorization:'Basic '+Buffer.from('inspector:test-password-only').toString('base64')};
  assert.equal((await f.request('/health','GET',undefined,auth)).data.aiEnabled,true);
  assert.equal((await f.request('/projects','GET',undefined,auth)).status,200);
  assert.equal((await f.request('/projects','GET',undefined,{Authorization:'Basic '+Buffer.from('inspector:incorrect').toString('base64')})).status,401);
});

test('floor plan → stable assets → reviewed inspection → persistence',async t => {
  const f=await fixture(t); let p=await f.project(); const image=await f.upload();
  assert.equal((await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id})).status,200);
  const input={name:'Pejabat',bounds:{x:10,y:10,width:30,height:40}};
  p=(await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[input,input]})).data;
  assert.deepEqual(p.rooms.map(r=>r.code),['D B1 0001','D B1 0002']);
  assert.equal((await f.request(`/projects/${p.id}/rooms/${p.rooms[1].id}`,'DELETE')).status,200);
  p=(await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[input]})).data;
  assert.equal(p.rooms[1].code,'D B1 0003');
  const inspection={roomId:p.rooms[0].id,photoId:image.id,damageType:'Retak dinding',description:'Retak halus kelihatan pada dinding.',remedial:'Periksa punca dan pantau sebelum pembaikan.',severity:'Sederhana',componentCodes:['33','25','13','11','00','00','00'],reviewed:true,inspector:'Ali'};
  p=(await f.request(`/projects/${p.id}/inspections`,'POST',inspection)).data;
  assert.equal(p.inspections[0].assetCode,'D B1 0001 33 25 13 11 00 00 00');assert.equal(p.inspections.length,1);assert.ok(p.inspections[0].reviewedAt);
  assert.equal((await f.request(`/projects/${p.id}/rooms/${p.rooms[0].id}`,'DELETE')).status,409);
  assert.equal((await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id})).status,409);
  await f.restart(); const saved=(await f.request('/projects')).data[0];assert.deepEqual(saved,p);
  const changed={...inspection,description:'Retak memerlukan ukuran di tapak.',reviewed:false};
  const result=await f.request(`/projects/${p.id}/inspections/${p.inspections[0].id}`,'PATCH',changed);
  assert.equal(result.status,200);assert.equal(result.data.inspections[0].reviewedAt,null);
});

test('validation prevents duplicate asset namespaces, invalid images and unsupported findings',async t => {
  const f=await fixture(t);const p=await f.project();
  assert.equal((await f.request('/projects','POST',{name:'Duplicate',building:'D',floor:'B1'})).status,409);
  assert.equal((await f.request('/projects','POST',{name:'Invalid',building:'<script>',floor:'B1'})).status,400);
  const image=await f.upload();await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id});
  assert.equal((await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[{name:'Bad bounds',bounds:{x:90,y:0,width:20,height:10}}]})).status,400);
  const room=(await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[{name:'Ruang',bounds:{x:0,y:0,width:10,height:10},source:'ai'}]})).data.rooms[0];
  assert.equal(room.reviewed,false);
  const findings={roomId:room.id,photoId:image.id,damageType:'Retak',description:'Foto retak',remedial:'Siasatan lanjut',severity:'Rendah',reviewed:true,inspector:''};
  assert.equal((await f.request(`/projects/${p.id}/inspections`,'POST',findings)).status,400);
  assert.equal((await f.request(`/projects/${p.id}/inspections`,'POST',{...findings,reviewed:false,roomId:'not-a-room'})).status,400);
  const form=new FormData();form.append('image',new Blob(['<svg><script>alert(1)</script></svg>'],{type:'image/png'}),'fake.png');
  assert.equal((await f.request('/uploads','POST',form)).status,400);
});

test('missing credentials disable AI without fabricated results',async t => {
  const f=await fixture(t);const p=await f.project();const image=await f.upload();
  assert.equal((await f.request('/health')).data.aiEnabled,false);
  await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id});
  const result=await f.request(`/projects/${p.id}/analyze/plan`,'POST',{});assert.equal(result.status,503);
  assert.equal((await f.request('/projects')).data[0].rooms.length,0);
});

test('DAK uses four-digit room locations and seven component levels from the supplied reference', async t => {
  const f=await fixture(t); const p=await f.project(); const image=await f.upload();
  await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id});
  const roomInput={name:'Bilik AHU',number:'0002',bounds:{x:0,y:0,width:20,height:20}};
  const added=await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[roomInput]});
  assert.equal(added.status,201);const room=added.data.rooms[0];assert.equal(room.code,'D B1 0002');
  assert.equal((await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[roomInput]})).status,409);
  assert.equal((await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[{...roomInput,number:'002'}]})).status,400);
  const inspection={roomId:room.id,photoId:image.id,damageType:'Kerosakan AHU',description:'Keadaan memerlukan pemeriksaan.',remedial:'Periksa unit.',severity:'Sederhana',reviewed:false,componentCodes:['33','25','13','11','00','00','00']};
  const saved=await f.request(`/projects/${p.id}/inspections`,'POST',inspection);
  assert.equal(saved.data.inspections[0].assetCode,'D B1 0002 33 25 13 11 00 00 00');
  assert.equal((await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...roomInput,number:'0003',reviewed:true})).status,409);
  assert.equal((await f.request(`/projects/${p.id}/inspections`,'POST',{...inspection,componentCodes:['33','25']})).status,400);
  const noClass=await f.request(`/projects/${p.id}/inspections`,'POST',{...inspection,componentCodes:null});
  assert.equal(noClass.data.inspections[0].assetCode,null);
  assert.equal((await f.request('/projects','POST',{name:'Aras 4',building:'D',floor:'04'})).status,201);
});

test('AI adapter checks complete structured output and rejects invalid/refused provider results',async () => {
  const valid={damageType:'Retak',description:'Retak kelihatan.',remedial:'Periksa di tapak.',severity:'Sederhana',confidence:.7,limitations:'Foto sahaja.'};
  const mock=(content,finish_reason='stop') => async () => new Response(JSON.stringify({choices:[{finish_reason,message:{content:JSON.stringify(content)}}]}),{status:200});
  const args={kind:'damage',image:Buffer.from('test'),key:'test-placeholder',model:'test-model'};
  assert.deepEqual(await analyzeImage({...args,fetchImpl:mock(valid)}),valid);
  await assert.rejects(analyzeImage({...args,fetchImpl:mock({...valid,severity:'unknown'})}),{status:502});
  await assert.rejects(analyzeImage({...args,fetchImpl:mock(valid,'length')}),{status:502});
  await assert.rejects(analyzeImage({...args,fetchImpl:async()=>new Response('{}',{status:401})}),{status:502});
  await assert.rejects(analyzeImage({...args,kind:'plan',fetchImpl:mock({rooms:[{name:'Invalid',confidence:.8,bounds:{x:99,y:0,width:10,height:5}}],notes:''})}),{status:502});
});
