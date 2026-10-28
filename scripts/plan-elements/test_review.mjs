/* Synthetic browser fixture; no user drawings are published. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

test('batch review distinguishes split and automatic screening from individual approvals',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fca-elements-browser-'));let browser,server;
 try{
  execFileSync(process.env.ELEMENTS_TEST_PYTHON||'python3',['-c',`
import sys,shutil
from pathlib import Path
sys.path.insert(0,str(Path('scripts/plan-elements').resolve()))
import test_batch
x=test_batch.BatchTests();x.setUp()
try:
 x.build();shutil.copytree(x.root/'out',Path(sys.argv[1])/'out')
finally:x.tearDown()
`,dir],{stdio:'pipe'});
  const html=await readFile(join(dir,'out','audit','BUKA-SEMAKAN-ELEMEN.html'));
  server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.ELEMENTS_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({acceptDownloads:true}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin+'/'))external.push(r.url())});
  await page.goto(origin+'/');assert.match(await page.locator('#batch-info').innerText(),/automatik/);
  const options=await page.locator('#sample option').allTextContents();
  assert.ok(options.some(s=>s.includes('LATIHAN')));assert.ok(options.some(s=>s.includes('VALIDASI')));assert.ok(options.some(s=>s.includes('UJIAN')));
  assert.match(await page.locator('#status').innerText(),/0 pelan disahkan secara individu/);
  await page.locator('#kind').selectOption('PINTU');assert.equal(await page.locator('#overlay polygon').count(),1);
  await page.locator('#approved').check();const wait=page.waitForEvent('download');await page.locator('#save').click();
  const downloaded=await wait,review=JSON.parse(await readFile(await downloaded.path(),'utf8'));
  assert.deepEqual(review.approved_ids,['A']);
  await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}
});
