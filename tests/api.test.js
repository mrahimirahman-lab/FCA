import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
import { analyzeImage } from '../server/ai.js';
import { cleanCadSvg } from '../server/cad.js';
import {roomMeasurements} from '../server/measurements.js';

async function fixture(t, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(),'fca-test-'));
  const start = () => new Promise(resolve => { const server = createApp({dataDir,aiProvider:'openai',aiKey:'',...options}).listen(0,'127.0.0.1',() => resolve(server)); });
  let server = await start();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dataDir,{recursive:true,force:true}); });
  const request = async (url, method = 'GET', body, headers = {}) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {method,headers: body instanceof FormData ? headers : {'Content-Type':'application/json',...headers},body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)}); return {status:response.status,data:await response.json()}; };
  const upload = async () => { const buffer = await sharp({create:{width:100,height:80,channels:3,background:'#ffffff'}}).png().toBuffer(); const form = new FormData();form.append('image',new Blob([buffer],{type:'image/png'}),'plan.png');const result=await request('/uploads','POST',form);assert.equal(result.status,201);return result.data; };
  const project = async () => { const result=await request('/projects','POST',{name:'Blok A',building:'d',floor:'b1'}); assert.equal(result.status,201);return result.data; };
  return {request,upload,project,dataDir,origin:()=>`http://127.0.0.1:${server.address().port}`,restart:async () => {await new Promise(resolve => server.close(resolve));server=await start();}};
}

test('room resizing and materials persist with stable asset codes and preserve materials for older clients',async t=>{
  const f=await fixture(t);let p=await f.project();const image=await f.upload();
  await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id});
  p=(await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[{name:'Pejabat',bounds:{x:10,y:20,width:30,height:40},materials:{wall:'  Bata berlepa + cat  ',floor:'Jubin seramik',ceiling:'Papan gipsum'}}]})).data;
  const room=p.rooms[0];assert.deepEqual(room.materials,{wall:'Bata berlepa + cat',floor:'Jubin seramik',ceiling:'Papan gipsum'});
  p=(await f.request(`/projects/${p.id}/inspections`,'POST',{roomId:room.id,photoId:image.id,damageType:'Retak',description:'Retak kelihatan.',remedial:'Periksa di tapak.',severity:'Rendah',reviewed:true,inspector:'Ali'})).data;
  const inspection=p.inspections[0];
  const response=await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...room,bounds:{x:5,y:15,width:45,height:50},materials:{wall:'Panel komposit khas',floor:'Vinil',ceiling:''},planId:p.plan.id});
  assert.equal(response.status,200);p=response.data;
  assert.equal(p.rooms[0].code,room.code);assert.equal(p.rooms[0].id,room.id);assert.deepEqual(p.inspections,[inspection]);
  const {materials,...oldClient}=p.rooms[0];
  p=(await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...oldClient,name:'Pejabat baharu'})).data;
  assert.deepEqual(p.rooms[0].materials,materials);
  for(const invalid of [{...materials,wall:'x'.repeat(201)},{wall:5},{floor:null}]) {
    const bad=await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...p.rooms[0],materials:invalid});assert.equal(bad.status,400);
    assert.deepEqual((await f.request('/projects')).data[0],p);
  }
  assert.equal((await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...p.rooms[0],bounds:{x:90,y:0,width:50,height:40}})).status,400);
  p=(await f.request(`/projects/${p.id}/plan/rotate`,'POST',{angle:90,planId:p.plan.id})).data;
  assert.deepEqual(p.rooms[0].materials,materials);assert.deepEqual(p.inspections,[inspection]);
  await f.restart();assert.deepEqual((await f.request('/projects')).data[0],p);
});

test('legacy rooms without materials remain editable and accept partial material registration',async t=>{
  const f=await fixture(t);const p=await f.project();const image=await f.upload();
  await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id});
  const room=(await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[{name:'Lama',bounds:{x:0,y:0,width:20,height:20}}]})).data.rooms[0];
  assert.deepEqual(room.materials,{wall:'',floor:'',ceiling:''});
  const file=path.join(f.dataDir,'database.json');const db=JSON.parse(fs.readFileSync(file,'utf8'));delete db.projects[0].rooms[0].materials;fs.writeFileSync(file,JSON.stringify(db));await f.restart();
  const legacy=(await f.request('/projects')).data[0].rooms[0];assert.equal(legacy.materials,undefined);
  const result=await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...legacy,bounds:{x:1,y:2,width:30,height:40},materials:{ceiling:'Konkrit terdedah'}});
  assert.equal(result.status,200);assert.deepEqual(result.data.rooms[0].materials,{wall:'',floor:'',ceiling:'Konkrit terdedah'});
  assert.equal(result.data.rooms[0].code,room.code);
});

test('plan calibration and manual dimensions persist, validate, survive rotation and reset on replacement',async t=>{
  const f=await fixture(t);let p=await f.project();const image=await f.upload();await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id});
  p=(await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[{name:'Pejabat',bounds:{x:10,y:20,width:30,height:25}}]})).data;
  const original=p,calibration={start:{x:10,y:10},end:{x:60,y:10},distanceM:5};
  const scale=await f.request(`/projects/${p.id}/plan/scale`,'PUT',{planId:p.plan.id,calibration});assert.equal(scale.status,200);p=scale.data;
  assert.equal(p.plan.scale.metersPerPixel,.1);assert.deepEqual(p.rooms,original.rooms);assert.equal(roomMeasurements(p.rooms[0],p.plan).areaM2,6);
  for(const bad of [{...calibration,distanceM:0},{...calibration,distanceM:-5},{...calibration,end:calibration.start},{...calibration,start:{x:101,y:10}}]) {
    assert.equal((await f.request(`/projects/${p.id}/plan/scale`,'PUT',{planId:p.plan.id,calibration:bad})).status,400);assert.deepEqual((await f.request('/projects')).data[0],p);
  }
  const rotated=await f.request(`/projects/${p.id}/plan/rotate`,'POST',{angle:90,planId:p.plan.id});assert.equal(rotated.status,200);p=rotated.data;
  assert.equal(roomMeasurements(p.rooms[0],p.plan).areaM2,6);
  assert.equal((await f.request(`/projects/${p.id}/plan/scale`,'PUT',{planId:image.id,calibration})).status,409);
  const room=p.rooms[0];
  p=(await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...room,dimensions:{lengthM:4,widthM:3,areaM2:9999}})).data;
  assert.deepEqual(p.rooms[0].dimensions,{lengthM:4,widthM:3});assert.equal(roomMeasurements(p.rooms[0],p.plan).areaM2,12);assert.equal(p.rooms[0].code,room.code);
  assert.equal((await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...p.rooms[0],dimensions:{lengthM:4,widthM:0}})).status,400);
  const {dimensions,...legacyClient}=p.rooms[0];p=(await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',legacyClient)).data;assert.deepEqual(p.rooms[0].dimensions,dimensions);
  await f.restart();assert.deepEqual((await f.request('/projects')).data[0],p);
  p=(await f.request(`/projects/${p.id}/plan/scale`,'PUT',{planId:p.plan.id,calibration:null})).data;assert.equal(p.plan.scale,null);assert.equal(roomMeasurements(p.rooms[0],p.plan).areaM2,12);
  p=(await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...p.rooms[0],dimensions:null})).data;assert.equal(roomMeasurements(p.rooms[0],p.plan),null);
  // A different plan must not silently reuse the previous image's scale.
  const second=(await f.request('/projects','POST',{name:'Aras lain',building:'D',floor:'02'})).data;
  await f.request(`/projects/${second.id}/plan`,'PUT',{photoId:image.id});await f.request(`/projects/${second.id}/plan/scale`,'PUT',{planId:image.id,calibration});
  const replacement=await f.upload();const changed=await f.request(`/projects/${second.id}/plan`,'PUT',{photoId:replacement.id});assert.equal(changed.status,200);assert.equal(changed.data.plan.scale,undefined);
});

test('focused room AI results for a concurrently edited room are rejected without overwriting the manual edit',async t=>{
  let release,started;const ready=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  const f=await fixture(t,{analyze:async({kind,targetRoom})=>{assert.equal(kind,'plan');assert.equal(targetRoom.name,'Pejabat');started();await gate;return {rooms:[{name:'Pejabat',bounds:{x:10,y:10,width:20,height:20},confidence:.7}],notes:'Controlled result.'};}});
  const p=await f.project();const image=await f.upload();await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id});
  const room=(await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[{name:'Pejabat',bounds:{x:5,y:5,width:70,height:70}}]})).data.rooms[0];
  const pending=f.request(`/projects/${p.id}/analyze/room`,'POST',{roomId:room.id,planId:image.id});
  let edited;
  try {await ready;edited=await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...room,bounds:{x:8,y:8,width:40,height:40}});assert.equal(edited.status,200);} finally {release();}
  assert.equal((await pending).status,409);assert.deepEqual((await f.request('/projects')).data[0],edited.data);
});

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

test('actual AutoCAD 2000 and 2018 DWG imports preserve source, geometry and project data',async t=>{
  const f=await fixture(t);const p=await f.project();
  for (const name of ['2000-Polyline','2018-Polyline','2018-Text']) {
    const bytes=fs.readFileSync(new URL(`./fixtures/dwg/${name}.dwg`,import.meta.url));
    const form=new FormData();form.append('drawing',new Blob([bytes],{type:'application/acad'}),`${name}.dwg`);
    const result=await f.request(`/projects/${p.id}/cad`,'POST',form);
    assert.equal(result.status,201,JSON.stringify(result.data));
    const plan=result.data.plan;assert.equal(plan.cad.name,`${name}.dwg`);assert.ok(plan.cad.entityCount>0);
    assert.equal(plan.cad.version,name.startsWith('2000')?'AC1015':'AC1032');
    const preview=await fetch(f.origin()+plan.url);assert.equal(preview.status,200);
    const png=Buffer.from(await preview.arrayBuffer());const pixels=await sharp(png).stats();
    assert.ok(pixels.channels[0].stdev>1,'Rendered drawing must contain visible geometry or text');
    const rotated=await f.request(`/projects/${p.id}/plan/rotate`,'POST',{angle:90,planId:plan.id});
    assert.equal(rotated.status,200);assert.deepEqual(rotated.data.plan.cad,plan.cad);
    assert.equal(rotated.data.plan.width,plan.height);assert.equal(rotated.data.plan.height,plan.width);
    const original=await fetch(f.origin()+`/api/projects/${p.id}/cad/source`);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()),bytes);
  }
  const before=(await f.request('/projects')).data[0];
  const invalid=new FormData();invalid.append('drawing',new Blob(['not a real DWG']),'invalid.dwg');
  assert.equal((await f.request(`/projects/${p.id}/cad`,'POST',invalid)).status,400);
  assert.deepEqual((await f.request('/projects')).data[0],before,'Failed import must preserve the existing plan');
  const corrupt=new FormData();corrupt.append('drawing',new Blob([Buffer.concat([Buffer.from('AC1032'),Buffer.alloc(250)])]),'corrupt.dwg');
  assert.equal((await f.request(`/projects/${p.id}/cad`,'POST',corrupt)).status,422);
  const added=await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[{name:'Ruang CAD',bounds:{x:0,y:0,width:20,height:20}}]});
  assert.equal(added.status,201);assert.equal(added.data.rooms[0].code,'D B1 0001');
  const replacement=new FormData();replacement.append('drawing',new Blob([fs.readFileSync(new URL('./fixtures/dwg/2018-Polyline.dwg',import.meta.url))]),'replacement.dwg');
  assert.equal((await f.request(`/projects/${p.id}/cad`,'POST',replacement)).status,409);
  await f.restart();assert.deepEqual((await f.request('/projects')).data[0],added.data);
});

test('CAD rasterization strips active markup and external resource references',async()=>{
  const svg=cleanCadSvg('<svg viewBox="0 0 100 100"><script>alert(1)</script><image href="https://example.com/x"/><use href="https://example.com/y"/><g onclick="bad()"><path d=""/><line x1="0" y1="0" x2="100" y2="100" stroke="white"/><text x="1" y="2">A &amp; B</text></g></svg>');
  assert.ok(!svg.includes('<script'));assert.ok(!svg.includes('<image'));assert.ok(!svg.includes('https://'));assert.ok(!svg.includes('onclick'));
  assert.ok(svg.includes('<line'));assert.ok(svg.includes('A &amp; B'));assert.ok(svg.includes('width="2400"'));
  assert.ok((await sharp(Buffer.from(svg)).png().toBuffer()).length>0,'Empty CAD attributes must remain valid SVG/XML');
});

test('saved rotations move actual pixels and room bounds while preserving assets, inspection photos and persistence',async t=>{
  const f=await fixture(t);let p=await f.project();
  const red=await sharp({create:{width:20,height:10,channels:3,background:'#ff0000'}}).png().toBuffer();
  const png=await sharp({create:{width:100,height:80,channels:3,background:'#ffffff'}}).composite([{input:red,left:0,top:0}]).png().toBuffer();
  const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'plan.png');const image=(await f.request('/uploads','POST',form)).data;
  await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id});
  p=(await f.request(`/projects/${p.id}/rooms`,'POST',{rooms:[{name:'Pejabat',bounds:{x:10,y:20,width:30,height:40}}]})).data;
  const room=p.rooms[0];
  p=(await f.request(`/projects/${p.id}/inspections`,'POST',{roomId:room.id,photoId:image.id,damageType:'Retak',description:'Retak kelihatan.',remedial:'Periksa di tapak.',severity:'Rendah',reviewed:true,inspector:'Ali'})).data;
  const inspection=structuredClone(p.inspections[0]);
  for(const [angle,rotation,bounds] of [[90,90,{x:40,y:10,width:40,height:30}],[-90,0,room.bounds],[180,180,{x:60,y:40,width:30,height:40}],[180,0,room.bounds],[-90,270,{x:20,y:60,width:40,height:30}]]) {
    const response=await f.request(`/projects/${p.id}/plan/rotate`,'POST',{angle,planId:p.plan.id});assert.equal(response.status,200);p=response.data;
    assert.equal(p.plan.rotation,rotation);assert.deepEqual(p.rooms[0],{...room,bounds});assert.deepEqual(p.inspections,[inspection]);
    assert.equal(p.plan.width,rotation%180===0?100:80);assert.equal(p.plan.height,rotation%180===0?80:100);
    if(rotation===90) {
      const buffer=Buffer.from(await(await fetch(f.origin()+p.plan.url)).arrayBuffer());
      const sample=async(left,top)=>[...await sharp(buffer).extract({left,top,width:1,height:1}).removeAlpha().raw().toBuffer()];
      assert.deepEqual(await sample(75,5),[255,0,0]);assert.deepEqual(await sample(5,75),[255,255,255]);
    }
  }
  assert.deepEqual(Buffer.from(await(await fetch(f.origin()+image.url)).arrayBuffer()),png,'Original image used by inspections stays unchanged');
  await f.restart();assert.deepEqual((await f.request('/projects')).data[0],p);
});

test('rotation rejects invalid and stale requests and prevents stale room coordinates after a concurrent turn',async t=>{
  const f=await fixture(t);const p=await f.project();const image=await f.upload();
  assert.equal((await f.request(`/projects/${p.id}/plan/rotate`,'POST',{angle:90,planId:image.id})).status,409);
  await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id});
  for(const body of [{angle:45,planId:image.id},{angle:90},{angle:'90',planId:image.id}])assert.equal((await f.request(`/projects/${p.id}/plan/rotate`,'POST',body)).status,400);
  const turns=await Promise.all([90,90].map(angle=>f.request(`/projects/${p.id}/plan/rotate`,'POST',{angle,planId:image.id})));
  assert.deepEqual(turns.map(r=>r.status).sort(),[200,409]);
  let saved=(await f.request('/projects')).data[0];assert.equal(saved.plan.rotation,90);
  const input={name:'Ruang',bounds:{x:10,y:20,width:30,height:40}};
  assert.equal((await f.request(`/projects/${p.id}/rooms`,'POST',{planId:image.id,rooms:[input]})).status,409);
  saved=(await f.request(`/projects/${p.id}/rooms`,'POST',{planId:saved.plan.id,rooms:[input]})).data;
  const room=saved.rooms[0];
  assert.equal((await f.request(`/projects/${p.id}/rooms/${room.id}`,'PATCH',{...room,planId:image.id})).status,409);
  assert.deepEqual((await f.request('/projects')).data[0],saved);
});

test('AI receives the saved orientation and a result for an earlier orientation is rejected',async t=>{
  let started,release,seen;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>started=resolve);
  const f=await fixture(t,{analyze:async({image})=>{seen=await sharp(image).metadata();started();await gate;return {rooms:[],notes:'Controlled orientation test.'};}});
  const p=await f.project();const image=await f.upload();await f.request(`/projects/${p.id}/plan`,'PUT',{photoId:image.id});
  const pending=f.request(`/projects/${p.id}/analyze/plan`,'POST',{});
  try {await ready;assert.equal(seen.width,100);assert.equal(seen.height,80);
    assert.equal((await f.request(`/projects/${p.id}/plan/rotate`,'POST',{angle:90,planId:image.id})).status,200);
  } finally {release();}
  assert.equal((await pending).status,409);
  assert.equal((await f.request(`/projects/${p.id}/analyze/plan`,'POST',{})).status,200);
  assert.equal(seen.width,80);assert.equal(seen.height,100);
  assert.equal((await f.request('/projects')).data[0].rooms.length,0);
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

test('AI errors distinguish credits from request rate and never expose provider key fragments',async()=>{
  const args={kind:'plan',image:Buffer.from('test'),key:'test-placeholder',model:'test-model'};
  const failure=(status,code)=>async()=>new Response(JSON.stringify({error:{code,message:'Provider message includes a private authentication fragment'}}),{status});
  await assert.rejects(analyzeImage({...args,fetchImpl:failure(429,'insufficient_quota')}),error=>error.status===502 && /Kredit|kredit/.test(error.message) && !error.message.includes('private'));
  await assert.rejects(analyzeImage({...args,fetchImpl:failure(429,'rate_limit_exceeded')}),error=>error.status===502 && /Had kadar/.test(error.message));
  await assert.rejects(analyzeImage({...args,fetchImpl:failure(401,'invalid_api_key')}),error=>error.status===502 && /Kunci OpenAI/.test(error.message) && !error.message.includes('private'));
  await assert.rejects(analyzeImage({...args,fetchImpl:failure(404,'model_not_found')}),error=>error.status===502 && /Model AI/.test(error.message));
  await assert.rejects(analyzeImage({...args,fetchImpl:async()=>new Response('not JSON',{status:200})}),error=>error.status===502 && /jawapan yang lengkap/.test(error.message));
});
