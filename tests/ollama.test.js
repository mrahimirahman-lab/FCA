import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createApp} from '../server/app.js';
import {localConfiguration,checkOllama,analyzeOllama} from '../server/ollama.js';
import {providerSettings,providerHealth} from '../server/ai-provider.js';
import {configureLocalEnvironment} from '../scripts/use-local-ai.js';

const plan={rooms:[{name:'Pejabat',bounds:{x:10,y:10,width:30,height:40},confidence:.7}],notes:'Hasil ujian protokol, bukan inferens model sebenar.'};
// Provider payload for the 100 × 100 fixture PNG. API/UI still use percentage bounds.
const pixelPlan={rooms:[{name:'Pejabat',bbox:[10,10,40,50],confidence:.7}],notes:plan.notes};
const damage={damageType:'Retak',description:'Retak kelihatan.',remedial:'Periksa di tapak sebelum pembaikan.',severity:'Sederhana',confidence:.6,limitations:'Foto sahaja.'};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const stop=server=>new Promise(resolve=>server.close(resolve));

async function localFixture(t) {
  const calls=[],state={capabilities:['completion','vision'],missing:false,remote:false,bad:false,truncated:false,output:undefined};
  const ollama=http.createServer(async(req,res)=>{
    try {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');calls.push({path:req.url,body,authorization:req.headers.authorization});
      res.setHeader('Content-Type','application/json');
      if(req.url==='/api/show') {
        if(state.missing){res.statusCode=404;res.end(JSON.stringify({error:'model missing'}));return;}
        res.end(JSON.stringify({capabilities:state.capabilities,...(state.remote?{remote_host:'https://example.invalid'}:{})}));return;
      }
      if(req.url==='/api/chat') {
        const result=state.output??(state.bad?{rooms:[{name:'Bad',confidence:.5,bbox:[99,0,119,20]}],notes:''}:body.format.properties.rooms?pixelPlan:damage);
        res.end(JSON.stringify({done:true,done_reason:state.truncated?'length':'stop',message:{role:'assistant',content:JSON.stringify(result)}}));return;
      }
      res.statusCode=404;res.end('{}');
    } catch {res.statusCode=500;res.end('{}');}
  });
  const localUrl=await listen(ollama);const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fca-ollama-'));
  const server=http.createServer(createApp({dataDir,aiProvider:'ollama',aiKey:'test-cloud-key-must-stay-unused',ollamaUrl:localUrl}));
  const origin=await listen(server);
  t.after(async()=>{await stop(server);await stop(ollama);fs.rmSync(dataDir,{recursive:true,force:true});});
  const request=async(url,method='GET',body)=>{
    const response=await fetch(origin+'/api'+url,{method,headers:body instanceof FormData?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  };
  const p=(await request('/projects','POST',{name:'AI tempatan',building:'L',floor:'01'})).data;
  const png=await sharp({create:{width:100,height:100,channels:3,background:'#ddd'}}).png().toBuffer();
  const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'plan.png');const photo=(await request('/uploads','POST',form)).data;
  await request(`/projects/${p.id}/plan`,'PUT',{photoId:photo.id});
  return {request,p,photo,calls,state};
}

test('local HTTP protocol supports plan and damage workflows without forwarding cloud credentials',async t=>{
  const f=await localFixture(t);
  const health=await f.request('/health');assert.equal(health.data.provider,'ollama');assert.equal(health.data.aiEnabled,true);assert.equal(health.data.model,'qwen2.5vl:3b');assert.equal(health.data.analysisTimeoutMs,600000);
  const result=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});assert.equal(result.status,200);assert.deepEqual(result.data,plan);
  assert.equal((await f.request('/projects')).data[0].rooms.length,0);
  const imported=await f.request(`/projects/${f.p.id}/rooms`,'POST',{rooms:plan.rooms.map(r=>({name:r.name,bounds:r.bounds,source:'ai'}))});assert.equal(imported.status,201);
  const room=imported.data.rooms[0];assert.equal(room.code,'L 01 0001');assert.equal(room.reviewed,false);
  const photoResult=await f.request(`/projects/${f.p.id}/analyze/damage`,'POST',{photoId:f.photo.id,roomId:room.id});assert.equal(photoResult.status,200);assert.deepEqual(photoResult.data,damage);
  const saved=await f.request(`/projects/${f.p.id}/inspections`,'POST',{roomId:room.id,photoId:f.photo.id,...damage,reviewed:false,inspector:''});assert.equal(saved.status,201);assert.equal(saved.data.inspections.length,1);
  const chats=f.calls.filter(c=>c.path==='/api/chat');assert.equal(chats.length,2);
  for(const call of chats) {
    assert.equal(call.body.model,'qwen2.5vl:3b');assert.equal(call.body.stream,false);assert.equal(call.body.options.temperature,0);
    assert.equal(call.body.messages[0].images.length,1);assert.equal(call.body.format.type,'object');
    const decoded=Buffer.from(call.body.messages[0].images[0],'base64');assert.equal((await sharp(decoded).metadata()).format,'png');
    const confidence=call.body.format.properties.rooms?call.body.format.properties.rooms.items.properties.confidence:call.body.format.properties.confidence;
    assert.equal(confidence.minimum,0);assert.equal(confidence.maximum,1);
    assert.match(call.body.messages[0].content,/bukan 80/);
  }
  const bbox=chats[0].body.format.properties.rooms.items.properties.bbox;
  assert.equal(bbox.items.maximum,100);assert.equal(bbox.minItems,4);assert.equal(bbox.maxItems,4);
  assert.equal(bbox.items.type,'integer');
  assert.deepEqual(chats[0].body.format.properties.rooms.items.properties.confidence.enum,[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1]);
  assert.equal(chats[0].body.format.properties.notes.maxLength,600);
  assert.equal(chats[0].body.options.num_predict,8192);assert.ok(chats[0].body.options.num_ctx>=chats[0].body.options.num_predict+8192);
  assert.equal(chats[1].body.options.num_ctx,8192);assert.equal(chats[1].body.options.num_predict,5000);
  assert.match(chats[0].body.messages[0].content,/100 piksel lebar dan 100 piksel tinggi/);
  assert.ok(f.calls.every(c=>c.authorization===undefined));assert.ok(!JSON.stringify(f.calls).includes('test-cloud-key-must-stay-unused'));
});

test('local plan filtering excludes symbol tags before review and leaves repeated real room labels intact',async t=>{
  const f=await localFixture(t);
  f.state.output={rooms:['BILIK 1','BILIK 2','RUANG TAMU','DAPUR','TANDAS','DAPUR','T1','T2','P1','P2','P3'].map((name,i)=>({name,bbox:[i*8,5,i*8+5,15],confidence:.7})),notes:'Controlled symbol confusion.'};
  const response=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});assert.equal(response.status,200);
  assert.deepEqual(response.data.rooms.map(room=>room.name),['BILIK 1','BILIK 2','RUANG TAMU','DAPUR','TANDAS','DAPUR']);assert.match(response.data.notes,/5 cadangan simbol/);
  assert.equal((await f.request('/projects')).data[0].rooms.length,0);
  f.state.output={rooms:f.state.output.rooms.slice(6),notes:'Only symbols.'};
  const empty=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});assert.equal(empty.status,200);assert.equal(empty.data.rooms.length,0);assert.match(empty.data.notes,/disisihkan/);
});

test('local entrance hint uses exact image pixels and clockwise hierarchy guidance without provider-generated codes',async t=>{
  const f=await localFixture(t);
  assert.equal((await f.request(`/projects/${f.p.id}/plan/entrance`,'PUT',{planId:f.photo.id,entrance:{x:25,y:90}})).status,200);
  f.state.output={rooms:[{name:'Laluan',bbox:[10,10,90,90],confidence:.7,parentIndex:null},{name:'Sirkulasi',bbox:[20,20,40,40],confidence:.7,parentIndex:0}],notes:'Controlled hierarchy.'};
  const response=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});assert.equal(response.status,200);assert.equal(response.data.rooms[1].parentIndex,0);
  const call=f.calls.find(call=>call.path==='/api/chat'),prompt=call.body.messages[0].content;
  assert.match(prompt,/pintu masuk utama ditandakan/i);assert.match(prompt,/\{"x":25,"y":90\} dalam piksel/);assert.match(prompt,/ARA H|ARAH JAM/);assert.match(prompt,/parentIndex/);
  assert.ok(call.body.format.properties.rooms.items.required.includes('parentIndex'));
  const wide=await sharp({create:{width:3200,height:800,channels:3,background:'#fff'}}).png().toBuffer();let captured;
  await analyzeOllama({kind:'plan',image:wide,entrance:{x:25,y:90},fetchImpl:async(url,options)=>{
    if(url.endsWith('/api/show'))return new Response(JSON.stringify({capabilities:['vision']}));
    captured=JSON.parse(options.body).messages[0].content;return new Response(JSON.stringify({done:true,done_reason:'stop',message:{content:JSON.stringify({rooms:[],notes:'Controlled.'})}}));
  }});
  assert.match(captured,/\{"x":400,"y":360\} dalam piksel/);
});

test('local readiness distinguishes missing, text-only and remote models and preserves manual workflow',async t=>{
  const f=await localFixture(t);
  for(const [state,status] of [[{missing:true},'model_missing'],[{missing:false,capabilities:['completion']},'vision_required'],[{capabilities:['completion','vision'],remote:true},'remote_model']]) {
    Object.assign(f.state,state);const health=(await f.request('/health')).data;assert.equal(health.aiEnabled,false);assert.equal(health.aiStatus,status);
    const response=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});assert.equal(response.status,503);
  }
  assert.equal(f.calls.filter(c=>c.path==='/api/chat').length,0);
  const manual=await f.request(`/projects/${f.p.id}/rooms`,'POST',{rooms:[{name:'Manual',bounds:{x:0,y:0,width:20,height:20}}]});assert.equal(manual.status,201);
});

test('focused local room analysis uses the saved plan and returns draft bounds without changing assets or materials',async t=>{
  const f=await localFixture(t);
  const p=(await f.request(`/projects/${f.p.id}/rooms`,'POST',{rooms:[{name:'BILIK 1',bounds:{x:5,y:5,width:70,height:70},materials:{wall:'Bata',floor:'Jubin',ceiling:'Gipsum'}}]})).data;
  const room=p.rooms[0];
  const response=await f.request(`/projects/${p.id}/analyze/room`,'POST',{roomId:room.id,planId:p.plan.id,bounds:{x:10,y:10,width:60,height:60}});
  assert.equal(response.status,200);assert.deepEqual(response.data.bounds,plan.rooms[0].bounds);assert.equal(response.data.roomId,room.id);
  assert.deepEqual((await f.request('/projects')).data[0],p);
  const call=f.calls.find(c=>c.path==='/api/chat');assert.equal(call.body.format.properties.rooms.maxItems,1);
  assert.match(call.body.messages[0].content,/Fokus SATU ruang/);assert.match(call.body.messages[0].content,/BILIK 1/);assert.match(call.body.messages[0].content,/muka DALAM dinding/);assert.match(call.body.messages[0].content,/P1\/P2\/P3/);
  assert.ok(call.body.messages[0].content.includes('"bbox":[10,10,70,70]'));assert.match(call.body.messages[0].content,/anggaran lama dalam piksel/);
  assert.equal((await f.request(`/projects/${p.id}/analyze/room`,'POST',{roomId:room.id,planId:f.photo.id.replace(/^./,f.photo.id[0]==='a'?'b':'a')})).status,409);
  for(const rooms of [[],[...pixelPlan.rooms,...pixelPlan.rooms]]) {
    f.state.output={rooms,notes:'Controlled ambiguous output.'};
    assert.ok([422,502].includes((await f.request(`/projects/${p.id}/analyze/room`,'POST',{roomId:room.id,planId:p.plan.id})).status));
    assert.deepEqual((await f.request('/projects')).data[0],p);
  }
});

test('local settings reject external destinations, redirects, cloud tags and unknown providers',async()=>{
  for(const baseUrl of ['https://127.0.0.1:11434','http://example.com','http://user:pass@127.0.0.1:11434','http://127.0.0.1:11434/api']) {
    const settings=localConfiguration({baseUrl});assert.ok(settings.error);
    let calls=0;assert.equal((await checkOllama(settings,{fetchImpl:async()=>{calls++;throw new Error();}})).ready,false);assert.equal(calls,0);
  }
  assert.ok(localConfiguration({model:'gpt-oss:20b-cloud'}).error);
  assert.ok(localConfiguration({model:'test:cloud'}).error);
  const invalid=await providerHealth(providerSettings({provider:'unrecognized',key:'test-placeholder'}));assert.equal(invalid.aiEnabled,false);
  const config=localConfiguration({});const state=await checkOllama(config,{fetchImpl:async(_url,options)=>{assert.equal(options.redirect,'error');throw new Error('redirect');}});assert.equal(state.status,'unavailable');
});

test('local invalid output fails without saving rooms',async t=>{
  const f=await localFixture(t);f.state.bad=true;
  const response=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});assert.equal(response.status,502);assert.match(response.data.error,/tidak sah/);
  assert.match(response.data.error,/Ruang 1: bbox/);
  assert.match(response.data.error,/penjuru kanan melebihi lebar imej/);
  assert.equal((await f.request('/projects')).data[0].rooms.length,0);
});

test('101 AI proposals are rejected and existing rooms cannot accumulate repeated AI imports',async t=>{
  const f=await localFixture(t);
  f.state.output={rooms:Array.from({length:101},(_,i)=>({...pixelPlan.rooms[0],name:`Ruang ${i+1}`})),notes:'Controlled overgeneration.'};
  const over=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});assert.equal(over.status,502);assert.equal((await f.request('/projects')).data[0].rooms.length,0);
  f.state.output=pixelPlan;
  const imported=await f.request(`/projects/${f.p.id}/rooms`,'POST',{rooms:[{...plan.rooms[0],source:'ai'}]});assert.equal(imported.status,201);
  assert.equal((await f.request(`/projects/${f.p.id}/rooms`,'POST',{rooms:[{...plan.rooms[0],source:'ai'}]})).status,409);
  const calls=f.calls.filter(c=>c.path==='/api/chat').length;
  assert.equal((await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{})).status,409);assert.equal(f.calls.filter(c=>c.path==='/api/chat').length,calls);
  assert.deepEqual((await f.request('/projects')).data[0],imported.data);
  assert.equal((await f.request(`/projects/${f.p.id}/rooms`,'POST',{rooms:[{name:'Tambahan manual',bounds:{x:50,y:50,width:20,height:20}}]})).status,201);
});

test('local validation identifies invalid confidence and missing fields without exposing model text or partially saving rooms',async t=>{
  const f=await localFixture(t);
  for(const [output,detail] of [
    [{...pixelPlan,rooms:[...pixelPlan.rooms,{...pixelPlan.rooms[0],name:'PRIVATE-MODEL-TEXT',confidence:80}]},/Ruang 2: confidence mesti nombor 0–1/],
    [{rooms:pixelPlan.rooms},/Medan notes mesti teks/],
    [{...pixelPlan,rooms:[{...pixelPlan.rooms[0],bbox:[100,0,100,20]}]},/Ruang 1: bbox/],
  ]) {
    f.state.output=output;
    const response=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});
    assert.equal(response.status,502);assert.match(response.data.error,detail);assert.ok(!response.data.error.includes('PRIVATE-MODEL-TEXT'));
    assert.equal((await f.request('/projects')).data[0].rooms.length,0);
  }
  const manual=await f.request(`/projects/${f.p.id}/rooms`,'POST',{rooms:[{name:'Manual',bounds:{x:0,y:0,width:20,height:20}}]});
  assert.equal(manual.status,201);
  f.state.output={...damage,confidence:80};
  const response=await f.request(`/projects/${f.p.id}/analyze/damage`,'POST',{photoId:f.photo.id,roomId:manual.data.rooms[0].id});
  assert.equal(response.status,502);assert.match(response.data.error,/confidence mesti nombor 0–1/);
  assert.equal((await f.request('/projects')).data[0].inspections.length,0);
});

test('local pixel corners use the exact resized PNG dimensions for wide, tall and small plans',async()=>{
  for(const [width,height,bbox] of [[2400,1200,[160,80,640,400]],[1200,2400,[80,160,320,800]],[80,140,[8,14,32,70]]]) {
    const image=await sharp({create:{width,height,channels:3,background:'#fff'}}).png().toBuffer();
    const result=await analyzeOllama({kind:'plan',image,fetchImpl:async(url,options)=>{
      if(url.endsWith('/api/show'))return new Response(JSON.stringify({capabilities:['vision']}));
      const body=JSON.parse(options.body);
      const sent=await sharp(Buffer.from(body.messages[0].images[0],'base64')).metadata();
      const scale=Math.min(1,1600/width,1600/height);
      assert.equal(sent.width,Math.round(width*scale));assert.equal(sent.height,Math.round(height*scale));
      assert.match(body.messages[0].content,new RegExp(`${sent.width} piksel lebar dan ${sent.height} piksel tinggi`));
      const pixels=await sharp(Buffer.from(body.messages[0].images[0],'base64')).stats();
      assert.ok(pixels.channels.every(channel=>channel.min===255 && channel.max===255),'No synthetic grid or labels should be added to the inference image');
      assert.equal(body.format.properties.rooms.items.properties.bbox.items.maximum,Math.max(sent.width,sent.height));
      return new Response(JSON.stringify({done:true,done_reason:'stop',message:{content:JSON.stringify({...pixelPlan,rooms:[{...pixelPlan.rooms[0],bbox}]})}}));
    }});
    const bounds=result.rooms[0].bounds;
    for(const [key,value] of Object.entries({x:10,y:10,width:30,height:40}))assert.ok(Math.abs(bounds[key]-value)<1e-8,`${width}×${height}: ${key}`);
    assert.equal(result.rooms[0].bbox,undefined);
  }
});

test('local pixel corners reject out-of-image, reversed, degenerate, nonnumeric and legacy boxes without guessing units',async t=>{
  const f=await localFixture(t);
  for(const bbox of [[-1,0,20,20],[10,10,101,20],[10,10,20,101],[20,10,10,30],[10,30,20,10],[10,10,10,20],[10,10,20,10],[.123456789,10,20,20],['10',10,20,20],[0,0,20],[0,0,20,20,40],null]) {
    f.state.output={...pixelPlan,rooms:[{...pixelPlan.rooms[0],bbox}]};
    const response=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});
    assert.equal(response.status,502);assert.match(response.data.error,/Ruang 1: bbox/);
    assert.equal((await f.request('/projects')).data[0].rooms.length,0);
  }
  f.state.output=plan; // Old percentage bounds are not interpreted as pixel corners.
  assert.equal((await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{})).status,502);
  assert.equal((await f.request('/projects')).data[0].rooms.length,0);
});

test('local long plan responses require complete generation and bounded notes before any explicit import',async t=>{
  const f=await localFixture(t);
  f.state.output={rooms:Array.from({length:100},(_,i)=>({...pixelPlan.rooms[0],name:`Ruang ujian ${i+1} `.padEnd(120,'x')})),notes:'x'.repeat(600)};
  let response=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});
  assert.equal(response.status,200);assert.equal(response.data.rooms.length,100);
  assert.deepEqual(response.data.rooms[99].bounds,plan.rooms[0].bounds);
  assert.equal((await f.request('/projects')).data[0].rooms.length,0);
  f.state.truncated=true;
  response=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});
  assert.equal(response.status,502);assert.match(response.data.error,/melebihi had jawapan/);
  assert.equal((await f.request('/projects')).data[0].rooms.length,0);
  f.state.truncated=false;f.state.output.notes='x'.repeat(601);
  response=await f.request(`/projects/${f.p.id}/analyze/plan`,'POST',{});
  assert.equal(response.status,502);assert.match(response.data.error,/notes mesti teks, maksimum 600/);
  assert.equal((await f.request('/projects')).data[0].rooms.length,0);
});

test('local malformed JSON and incomplete responses have distinct safe errors',async()=>{
  const image=await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).png().toBuffer();
  for(const [output,message] of [
    [{done:true,done_reason:'stop',message:{content:'PRIVATE-MODEL-TEXT'}},/bukan JSON yang sah/],
    [{done:false,message:{content:JSON.stringify(plan)}},/belum lengkap/],
    [null,/belum lengkap/],
  ]) {
    let calls=0;
    await assert.rejects(analyzeOllama({kind:'plan',image,fetchImpl:async url=>{
      if(url.endsWith('/api/show'))return new Response(JSON.stringify({capabilities:['vision']}));
      calls++;return new Response(JSON.stringify(output));
    }}),error=>error.status===502&&message.test(error.message)&&!error.message.includes('PRIVATE-MODEL-TEXT'));
    assert.equal(calls,1);
  }
});

test('local request timeout and truncated results produce actionable errors',async()=>{
  const image=await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).png().toBuffer();
  const metadata=()=>new Response(JSON.stringify({capabilities:['vision']}));
  await assert.rejects(analyzeOllama({kind:'plan',image,fetchImpl:async url=>{
    if(url.endsWith('/api/show'))return metadata();throw Object.assign(new Error(),{name:'TimeoutError'});
  }}),error=>error.status===502&&/tamat masa/.test(error.message));
  await assert.rejects(analyzeOllama({kind:'plan',image,fetchImpl:async url=>url.endsWith('/api/show')?metadata():new Response(JSON.stringify({done:true,done_reason:'length',message:{content:'{}'}}))}),error=>error.status===502&&/melebihi had/.test(error.message));
});

test('local configuration helper preserves credentials and data settings, backs up and repeats safely',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fca-local-env-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'.env');
  const original='# existing settings\r\nINSPECTION_AI_PROVIDER=openai\r\nINSPECTION_AI_API_KEY=test-private-placeholder\r\nFCA_DATA_DIR=C:/FCA/data\r\nPORT=3123\r\n';fs.writeFileSync(file,original);
  assert.equal(configureLocalEnvironment(file).backupCreated,true);
  const result=fs.readFileSync(file,'utf8');assert.ok(result.includes('INSPECTION_AI_API_KEY=test-private-placeholder'));assert.ok(result.includes('FCA_DATA_DIR=C:/FCA/data'));assert.ok(result.includes('PORT=3123'));
  assert.ok(result.includes('INSPECTION_AI_PROVIDER=ollama'));assert.ok(result.includes('OLLAMA_MODEL=qwen2.5vl:3b'));
  const backups=fs.readdirSync(dir).filter(n=>n.includes('.backup-'));assert.equal(backups.length,1);assert.equal(fs.readFileSync(path.join(dir,backups[0]),'utf8'),original);
  assert.equal(configureLocalEnvironment(file).changed,false);assert.equal(fs.readdirSync(dir).filter(n=>n.includes('.backup-')).length,1);
});
