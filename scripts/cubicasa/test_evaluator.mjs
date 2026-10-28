/* Browser integration using generated drawings only; no source data or model API. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

test('offline evaluation: paired completion, invalidation, persistence, export/import, clean PNG and mobile',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cubi-eval-browser-'));
 let browser,server;
 try{
  execFileSync(process.env.CUBICASA_TEST_PYTHON||'python3',['-c',`
import sys,json
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path('scripts/cubicasa').resolve()))
import prepare,evaluate
root=Path(sys.argv[1]);source=root/'source';source.mkdir();batch=root/'batch';batch.mkdir()
for i,name in enumerate(['train','validation','test-a','test-b']):
 p=source/name;p.mkdir();Image.new('RGB',(100+i*10,100+i*10),'white').save(p/'F1_scaled.png')
 (p/'model.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"><g id="r" class="Space Bedroom"><polygon points="10,10 40,10 40,40 10,40"/></g></svg>')
prepare.audit(source,batch/'audit');(batch/'dataset').mkdir()
export={'schema_version':1,'dataset':'CubiCasa5K','source_manifest_sha256':prepare.sha((batch/'audit'/'manifest-cubicasa.json').read_bytes()),'split_provenance':'synthetic','review_method':'synthetic','splits':{k:{'images':len(ids),'sample_ids':ids} for k,ids in {'train':['train'],'validation':['validation'],'test':['test-a','test-b']}.items()}}
(batch/'dataset'/'manifest-eksport.json').write_text(json.dumps(export))
evaluate.build(batch,root/'out')
`,dir],{cwd:resolve('.'),stdio:'pipe'});
  browser=await chromium.launch({headless:true,executablePath:process.env.CUBICASA_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
  const html=await readFile(join(dir,'out','BUKA-UJIAN-CUBICASA.html'));
  server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const page=await browser.newPage({acceptDownloads:true});const errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin+'/'))network.push(r.url())});
  await page.goto(origin+'/');
  await page.locator('#image').evaluate(im=>im.decode());
  const payload=await page.evaluate(()=>data);
  assert.equal(payload.cases.length,2);assert.match(await page.locator('#progress').innerText(),/0 \/ 2/);
  await page.locator('#compare').click();assert.match(await page.locator('#compare-status').innerText(),/BASE MODEL masih kosong/);assert.equal(await page.locator('#compare-status').getAttribute('data-error'),'true');assert.equal(await page.evaluate(()=>document.activeElement.id),'base');
  const expected=JSON.stringify(payload.cases[0].expected);
  await page.locator('#base').fill(expected);await page.locator('#tuned').fill(expected);
  await page.locator('#compare').click();assert.match(await page.locator('#notice').innerText(),/Sahkan/);assert.match(await page.locator('#compare-status').innerText(),/kotak pengesahan/);assert.equal(await page.evaluate(()=>document.activeElement.id),'confirmed');
  await page.locator('#confirmed').check();await page.locator('#compare').click();
  assert.match(await page.locator('#progress').innerText(),/1 \/ 2/);assert.match(await page.locator('#result').innerText(),/100.0%/);assert.match(await page.locator('#compare-status').innerText(),/berjaya disimpan/);
  const downloadWait=page.waitForEvent('download');await page.locator('#png').click();const png=await downloadWait;
  assert.equal(png.suggestedFilename(),'CubiCasa-test-a.png');
  const pngBytes=await readFile(await png.path());assert.deepEqual(pngBytes,await readFile(join(dir,'out',payload.cases[0].file)));
  const exportWait=page.waitForEvent('download');await page.locator('#export').click();const exported=await exportWait;
  const report=JSON.parse(await readFile(await exported.path(),'utf8'));
  assert.equal(report.completed_images,1);assert.equal(report.complete,false);assert.deepEqual(report.missing_ids,['test-b']);
  assert.equal(report.summary.base.mean_iou_per_image,1);
  // Persisted drafts/scores survive a page refresh.
  await page.reload();assert.match(await page.locator('#progress').innerText(),/1 \/ 2/);
  await page.locator('#base').fill('broken JSON');assert.match(await page.locator('#progress').innerText(),/0 \/ 2/);
  await page.locator('#confirmed').check();await page.locator('#compare').click();assert.match(await page.locator('#progress').innerText(),/0 \/ 2/);assert.match(await page.locator('#compare-status').innerText(),/BASE MODEL: jawapan JSON tidak sah/);
  // Imported scores are recomputed. An attacker-provided perfect cached score is ignored.
  report.results[0].models.base.mean_iou=-100;
  page.on('dialog',d=>d.accept());
  await page.locator('#importfile').setInputFiles({name:'results.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
  assert.match(await page.locator('#progress').innerText(),/1 \/ 2/);assert.match(await page.locator('#result').innerText(),/100.0%/);
  const bad={...report,benchmark_id:'wrong'};
  await page.locator('#importfile').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  assert.match(await page.locator('#notice').innerText(),/bukan daripada/);assert.match(await page.locator('#progress').innerText(),/1 \/ 2/);
  await page.locator('#next').click();assert.equal(await page.locator('#case').inputValue(),'test-b');assert.equal(await page.locator('#base').inputValue(),'');
  await page.locator('#base').fill('[]');await page.locator('#tuned').fill('[]');await page.locator('#confirmed').check();await page.locator('#compare').click();
  assert.match(await page.locator('#progress').innerText(),/2 \/ 2/);
  // Failed outputs retain the original response and are distinct from a valid empty prediction.
  const invalidRaw='[{"label":"A","bbox_2d":[20,900,300,900]}]';
  await page.locator('#base').fill(invalidRaw);await page.locator('#confirmed').check();
  await page.locator('#compare').click();assert.match(await page.locator('#compare-status').innerText(),/BASE MODEL/);
  await page.locator('#record-failure').click();
  assert.match(await page.locator('#result').innerText(),/GAGAL OUTPUT/);
  assert.match(await page.locator('#progress').innerText(),/2 \/ 2 pelan sudah diuji/);
  const failureWait=page.waitForEvent('download');await page.locator('#export').click();
  const failedExport=await failureWait, failed=JSON.parse(await readFile(await failedExport.path(),'utf8'));
  assert.equal(failed.attempted_images,2);assert.equal(failed.all_images_attempted,true);
  assert.equal(failed.completed_images,1);assert.equal(failed.complete,false);
  assert.equal(failed.failed_images,1);assert.deepEqual(failed.unattempted_ids,[]);
  assert.equal(failed.output_validity.base.invalid_rate,.5);assert.equal(failed.output_validity.tuned.invalid,0);
  assert.equal(failed.failures[0].models.base.raw_response,invalidRaw);
  assert.equal(failed.failures[0].models.base.metrics,null);
  assert.equal(failed.summary.base.images,1);
  await page.reload();assert.match(await page.locator('#progress').innerText(),/2 \/ 2 pelan sudah diuji/);
  await page.locator('#case').selectOption('test-b');assert.equal(await page.locator('#base').inputValue(),invalidRaw);
  await page.locator('#importfile').setInputFiles({name:'failed-results.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(failed))});
  assert.match(await page.locator('#progress').innerText(),/2 \/ 2 pelan sudah diuji/);
  await page.locator('#case').selectOption('test-b');assert.match(await page.locator('#result').innerText(),/GAGAL OUTPUT/);
  await page.locator('#base').fill('[]');await page.locator('#confirmed').check();
  await page.locator('#record-failure').click();assert.match(await page.locator('#compare-status').innerText(),/Kedua-dua jawapan sah/);
  await page.locator('#compare').click();assert.match(await page.locator('#progress').innerText(),/2 \/ 2 pelan selesai/);
  await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}
});
