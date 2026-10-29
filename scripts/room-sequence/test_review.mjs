import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

test('room sequence review requires geometry, frame, clean-image and entrance confirmation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fca-sequence-browser-'));let browser,server;
 try{
  execFileSync(process.env.SEQUENCE_TEST_PYTHON||'python3',['-c',`
import sys
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path('scripts/room-sequence').resolve()))
import test_sequence
root=Path(sys.argv[1]);p=root/'image.png';Image.new('RGB',(100,100),'white').save(p)
test_sequence.sequence.build(p,test_sequence.encode(test_sequence.reference()),root/'out')
`,dir],{stdio:'pipe'});
  const html=await readFile(join(dir,'out','BUKA-SEMAKAN-URUTAN.html'));
  server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.SEQUENCE_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({acceptDownloads:true}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin+'/'))external.push(r.url())});
  await page.goto(origin+'/');await page.locator('#image').evaluate(im=>im.decode());
  assert.equal(await page.locator('#save').isDisabled(),true);assert.match(await page.locator('#progress').innerText(),/0\/4/);
  await page.locator('#frame-confirmed').check();await page.locator('#clean-confirmed').check();
  for(const checkbox of await page.locator('#entrances input').all())await checkbox.check();
  await page.locator('#polygon').fill('[[15,15],[42,15],[42,40],[15,40]]');
  assert.equal(await page.locator('#confirm-room').isDisabled(),true);
  await page.locator('#apply-polygon').click();assert.equal(await page.locator('#confirm-room').isDisabled(),false);
  for(let i=0;i<4;i++)await page.locator('#confirm-room').click();
  assert.equal(await page.locator('#save').isDisabled(),false);
  const wait=page.waitForEvent('download');await page.locator('#save').click();const dl=await wait;
  const result=JSON.parse(await readFile(await dl.path(),'utf8'));
  assert.equal(result.total_rooms,4);assert.equal(result.indoor_rooms,2);assert.equal(result.outdoor_rooms,2);
  assert.equal(result.rooms[0].bbox_2d[2],420);assert.ok(result.rooms.every(r=>r.reviewed));
  assert.equal(result.clean_image_confirmed,true);
  // Verify the actual exported data with the independent Python validator and clean PNG.
  const resultFile=join(dir,'review.json');await (await import('node:fs/promises')).writeFile(resultFile,JSON.stringify(result));
  execFileSync(process.env.SEQUENCE_TEST_PYTHON||'python3',['-c',`
import sys,json
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path('scripts/room-sequence').resolve()))
import test_sequence
p=Path(sys.argv[1]);test_sequence.sequence.validate_review(json.loads(p.read_text()),test_sequence.reference(),Image.open(p.parent/'out'/'pelan-bersih.png'))
`,resultFile],{stdio:'pipe'});
  // Vertex drag invalidates only the edited room; frame changes invalidate all rooms/entrances.
  await page.locator('#rooms button').first().click();await page.locator('#zoom').fill('200');await page.locator('#zoom').dispatchEvent('input');
  const circle=page.locator('#overlay circle[data-vertex="0"]'),box=await circle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+4,box.y+box.height/2+4);await page.mouse.up();
  assert.equal(await page.locator('#save').isDisabled(),true);assert.match(await page.locator('#progress').innerText(),/3\/4/);
  await page.locator('#confirm-room').click();assert.equal(await page.locator('#save').isDisabled(),false);
  const draftWait=page.waitForEvent('download');await page.locator('#draft').click();const draftDl=await draftWait;
  const draft=await readFile(await draftDl.path());
  await page.locator('#fx1').fill('11');assert.equal(await page.locator('#frame-confirmed').isDisabled(),true);
  await page.locator('#apply-frame').click();assert.match(await page.locator('#progress').innerText(),/0\/4/);assert.match(await page.locator('#progress').innerText(),/0\/2/);
  await page.locator('#draft-file').setInputFiles({name:'draft.json',mimeType:'application/json',buffer:draft});
  assert.match(await page.locator('#progress').innerText(),/4\/4/);
  await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}
});
