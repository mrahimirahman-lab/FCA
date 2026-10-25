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
const damage={damageType:'Retak',description:'Retak kelihatan.',remedial:'Periksa di tapak sebelum pembaikan.',severity:'Sederhana',confidence:.6,limitations:'Foto sahaja.'};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const stop=server=>new Promise(resolve=>server.close(resolve));

async function localFixture(t) {
  const calls=[],state={capabilities:['completion','vision'],missing:false,remote:false,bad:false};
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
        const result=state.bad?{rooms:[{name:'Bad',confidence:.5,bounds:{x:99,y:0,width:20,height:20}}],notes:''}:body.format.properties.rooms?plan:damage;
        res.end(JSON.stringify({done:true,done_reason:'stop',message:{role:'assistant',content:JSON.stringify(result)}}));return;
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
  }
  assert.ok(f.calls.every(c=>c.authorization===undefined));assert.ok(!JSON.stringify(f.calls).includes('test-cloud-key-must-stay-unused'));
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
  assert.equal((await f.request('/projects')).data[0].rooms.length,0);
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
