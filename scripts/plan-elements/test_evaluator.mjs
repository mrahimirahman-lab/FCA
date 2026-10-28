import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

test('element comparison counts drawings/tasks separately and preserves per-class failures',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fca-element-eval-'));let browser,server;
 try{
  execFileSync(process.env.ELEMENTS_TEST_PYTHON||'python3',['-c',`
import sys,shutil
from pathlib import Path
sys.path.insert(0,str(Path('scripts/plan-elements').resolve()))
import test_batch,evaluate
x=test_batch.BatchTests();x.setUp()
try:
 x.build();evaluate.build(x.root/'out',x.root/'evaluation');shutil.copytree(x.root/'evaluation',Path(sys.argv[1])/'evaluation')
finally:x.tearDown()
`,dir],{stdio:'pipe'});
  const html=await readFile(join(dir,'evaluation','BUKA-UJIAN-ELEMEN.html'));
  server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.ELEMENTS_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({acceptDownloads:true}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin+'/'))external.push(r.url())});
  await page.goto(origin+'/');const payload=await page.evaluate(()=>data);
  assert.equal(payload.source_drawings,1);assert.equal(payload.cases.length,3);
  assert.match(await page.locator('#drawing-progress').innerText(),/0 \/ 1/);
  for(const c of payload.cases){
   await page.locator('#case').selectOption(c.id);assert.equal(await page.locator('#prompt').inputValue(),c.prompt);
   const base=c.target_class==='PINTU'?'[{"label":"PINTU","bbox_2d":[0,0,20,0]}]':JSON.stringify(c.expected);
   await page.locator('#base').fill(base);await page.locator('#tuned').fill(JSON.stringify(c.expected));await page.locator('#confirmed').check();
   await page.locator(c.target_class==='PINTU'?'#record-failure':'#compare').click();
  }
  assert.match(await page.locator('#progress').innerText(),/3 \/ 3 tugasan sudah diuji/);
  assert.match(await page.locator('#drawing-progress').innerText(),/1 \/ 1/);
  assert.match(await page.locator('#class-summary').innerText(),/PINTU — 1\/1 tugasan diuji; 0 pasangan sah/);
  const wait=page.waitForEvent('download');await page.locator('#export').click();const download=await wait;
  const report=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(report.kind,'plan_elements_paired_test_results');assert.equal(report.expected_tasks,3);assert.equal(report.attempted_tasks,3);
  assert.equal(report.source_drawings,1);assert.equal(report.drawing_progress.attempted_all_classes,1);assert.equal(report.drawing_progress.valid_all_classes,0);
  assert.equal(report.summary.base.tasks,2);assert.equal(report.summary.base.mean_iou_per_task,1);
  assert.equal(report.per_class.PINTU.summary.base,null);assert.equal(report.per_class.PINTU.output_validity.base.invalid,1);
  assert.equal(report.failures[0].target_class,'PINTU');assert.equal(report.failures[0].image_id,'D');
  assert.ok(!('expected_images' in report));assert.ok(!('images' in report.summary.base));
  await page.reload();assert.match(await page.locator('#progress').innerText(),/3 \/ 3 tugasan sudah diuji/);
  page.on('dialog',d=>d.accept());
  await page.locator('#importfile').setInputFiles({name:'results.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
  assert.match(await page.locator('#progress').innerText(),/3 \/ 3 tugasan sudah diuji/);
  const bad=structuredClone(report);bad.results[0].target_class='WRONG';
  await page.locator('#importfile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  assert.match(await page.locator('#notice').innerText(),/tidak sepadan/);
  const pngWait=page.waitForEvent('download');await page.locator('#png').click();const png=await pngWait;
  assert.equal(png.suggestedFilename(),'CubiCasa-D.png');
  assert.deepEqual(await readFile(await png.path()),await readFile(join(dir,'evaluation',payload.cases[0].file)));
  await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}
});
