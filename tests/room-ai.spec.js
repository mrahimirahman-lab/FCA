import {test,expect} from '@playwright/test';
import sharp from 'sharp';

// Provider responses are controlled here: this tests the review/save workflow,
// not the accuracy of a real vision model's wall detection.
test('focused AI bounds are previewed without renumbering, preserve material drafts and require an explicit save',async({page,request},info)=>{
  const building=info.project.name==='desktop'?'SA':'SB';
  const create=await request.post('/api/projects',{data:{name:'Semak sempadan',building,floor:'09'}});expect(create.status()).toBe(201);let p=await create.json();
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/><path d="M 80 120 H 560 V 480 H 80 Z M 320 120 V 480" stroke="black" stroke-width="5" fill="none"/><text x="145" y="220" font-family="sans-serif" font-size="22">BILIK 1</text><text x="380" y="220" font-family="sans-serif" font-size="22">BILIK 2</text></svg>');
  const buffer=await sharp(svg).png().toBuffer();
  const upload=await request.post('/api/uploads',{multipart:{image:{name:'pelan.png',mimeType:'image/png',buffer}}});expect(upload.status()).toBe(201);const image=await upload.json();
  expect((await request.put(`/api/projects/${p.id}/plan`,{data:{photoId:image.id}})).status()).toBe(200);
  const rooms=await request.post(`/api/projects/${p.id}/rooms`,{data:{rooms:[{name:'BILIK 1',bounds:{x:5,y:5,width:80,height:80},materials:{wall:'Bata',floor:'Jubin',ceiling:'Gipsum'}}]}});expect(rooms.status()).toBe(201);p=await rooms.json();const room=p.rooms[0];
  const record=await request.post(`/api/projects/${p.id}/inspections`,{data:{roomId:room.id,photoId:image.id,damageType:'Retak',description:'Dapatan terkawal.',remedial:'Periksa.',severity:'Rendah',reviewed:false,inspector:''}});expect(record.status()).toBe(201);p=await record.json();
  await page.route('**/api/health',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,aiEnabled:true,provider:'ollama',model:'qwen2.5vl:3b',aiStatus:'ready',analysisTimeoutMs:600000})}));
  await page.goto('/');await page.getByLabel(info.project.name==='desktop'?'Projek aktif':'Tukar projek').selectOption(p.id);await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();
  await page.getByRole('button',{name:'Pilih BILIK 1',exact:true}).click();
  await page.getByLabel('Material lantai',{exact:true}).fill('Vinil khas');
  let attempts=0,release;const gate=new Promise(resolve=>release=resolve);
  const bounds={x:10.5,y:20.5,width:29,height:59};
  await page.route(`**/api/projects/${p.id}/analyze/room`,async route=>{
    attempts++;expect(route.request().postDataJSON().roomId).toBe(room.id);
    if(attempts===1)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'AI ujian belum dapat membaca sempadan.'})});
    await gate;return route.fulfill({contentType:'application/json',body:JSON.stringify({roomId:room.id,planId:p.plan.id,bounds,confidence:.7,notes:'Semak sisi dalam dinding. Respons ujian sahaja.'})});
  });
  await page.getByRole('button',{name:'Semak sempadan AI',exact:true}).click();
  await expect(page.locator('.room-save-error')).toContainText('AI ujian belum dapat membaca sempadan');await expect(page.getByLabel('Lebar (%)',{exact:true})).toHaveValue('80');
  await page.getByRole('button',{name:'Semak sempadan AI',exact:true}).click();
  await expect(page.getByRole('button',{name:'Menyemak sempadan…'})).toBeDisabled();
  release();await expect(page.locator('.room-ai-note')).toContainText('Cadangan sempadan dipaparkan');
  await expect(page.getByLabel('Lebar (%)',{exact:true})).toHaveValue('29');await expect(page.getByLabel('Nama ruang',{exact:true})).toHaveValue('BILIK 1');await expect(page.getByLabel('Material lantai',{exact:true})).toHaveValue('Vinil khas');
  await expect(page.getByLabel('Label dan sempadan telah disemak')).not.toBeChecked();
  await expect(page.getByRole('button',{name:'Pilih BILIK 1',exact:true})).toHaveClass(/unreviewed/);
  expect((await(await request.get('/api/projects')).json()).find(item=>item.id===p.id)).toEqual(p);
  await page.screenshot({path:info.outputPath('focused-bounds.png'),fullPage:true});
  await page.getByLabel('Label dan sempadan telah disemak').check();
  await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.locator('.room-edit-hint')).toContainText('Maklumat ruang disimpan');
  const saved=(await(await request.get('/api/projects')).json()).find(item=>item.id===p.id);
  expect(saved.rooms).toHaveLength(1);expect(saved.rooms[0].id).toBe(room.id);expect(saved.rooms[0].code).toBe(room.code);expect(saved.rooms[0].bounds).toEqual(bounds);expect(saved.rooms[0].materials.floor).toBe('Vinil khas');expect(saved.inspections).toEqual(p.inspections);
  expect(attempts).toBe(2);
  await page.getByRole('button',{name:'Semak sempadan AI',exact:true}).click();await expect(page.locator('.room-ai-note')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Kanan 90°',exact:true}).click();
  await expect(page.getByRole('group',{name:'Orientasi pelan'})).toContainText('Putaran 90°');await expect(page.locator('.room-ai-note')).toHaveCount(0);
});
