import {test,expect} from '@playwright/test';
import sharp from 'sharp';

async function setup(page,request,building) {
  const create=await request.post('/api/projects',{data:{name:'Ukuran dan zoom',building,floor:'10'}});expect(create.status()).toBe(201);let p=await create.json();
  const buffer=await sharp({create:{width:800,height:600,channels:3,background:'#fafafa'}}).png().toBuffer();
  const upload=await request.post('/api/uploads',{multipart:{image:{name:'pelan.png',mimeType:'image/png',buffer}}});expect(upload.status()).toBe(201);const image=await upload.json();
  expect((await request.put(`/api/projects/${p.id}/plan`,{data:{photoId:image.id}})).status()).toBe(200);
  const room=await request.post(`/api/projects/${p.id}/rooms`,{data:{rooms:[{name:'Bilik ukuran',bounds:{x:10,y:20,width:30,height:25}}]}});expect(room.status()).toBe(201);p=await room.json();
  await page.goto('/');const label=await page.getByLabel('Projek aktif').isVisible()?'Projek aktif':'Tukar projek';await page.getByLabel(label).selectOption(p.id);await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();
  await page.getByRole('button',{name:'Pilih Bilik ukuran',exact:true}).click();return {p,label,image};
}

async function point(page,x,y) {
  await page.locator('.plan-scroll').scrollIntoViewIfNeeded();
  const box=await page.locator('.plan-stage').boundingBox();
  await page.mouse.click(box.x+box.width*x/100,box.y+box.height*y/100);
}

test('manual metre dimensions and area persist while zoomed dragging changes only the room selection',async({page,request},info)=>{
  const {p,label,image}=await setup(page,request,info.project.name==='desktop'?'ZA':'ZB');
  await expect(page.getByLabel('Panjang (m)',{exact:true})).toBeVisible();await expect(page.getByLabel('Keluasan ruang',{exact:true})).toHaveText('—');
  await expect(page.getByLabel('Kiri (%)',{exact:true})).toBeHidden();
  await page.getByLabel('Panjang (m)',{exact:true}).fill('4.5');await page.getByLabel('Lebar (m)',{exact:true}).fill('3');
  await expect(page.getByLabel('Keluasan ruang',{exact:true})).toHaveText('13.50');
  await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.locator('.room-edit-hint')).toContainText('Maklumat ruang disimpan');
  const initial=await page.locator('.plan-stage').boundingBox();
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'Zoom masuk',exact:true}).click();
  await expect(page.getByLabel('Tahap zoom')).toHaveText('200%');
  expect((await page.locator('.plan-stage').boundingBox()).width/initial.width).toBeCloseTo(2,2);
  expect(await page.locator('.plan-scroll').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'Alih pandangan',exact:true}).click();await page.locator('.plan-scroll').scrollIntoViewIfNeeded();
  const view=await page.locator('.plan-scroll').boundingBox(),offset=await page.locator('.plan-scroll').evaluate(el=>el.scrollLeft);
  await page.mouse.move(view.x+view.width/2,view.y+view.height/2);await page.mouse.down();await page.mouse.move(view.x+view.width/2-50,view.y+view.height/2-30,{steps:4});await page.mouse.up();
  expect(await page.locator('.plan-scroll').evaluate(el=>el.scrollLeft)).toBeGreaterThan(offset);expect(Number(await page.getByLabel('Lebar (%)',{exact:true}).inputValue())).toBe(30);
  await page.getByRole('button',{name:'Alih pandangan',exact:true}).click();
  const handle=page.getByRole('button',{name:'Ubah saiz tepi kanan',exact:true});await handle.scrollIntoViewIfNeeded();
  const box=await handle.boundingBox(),stage=await page.locator('.plan-stage').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+stage.width*.03,box.y+box.height/2,{steps:5});await page.mouse.up();
  expect(Number(await page.getByLabel('Lebar (%)',{exact:true}).inputValue())).toBeCloseTo(33,1);await expect(page.getByLabel('Keluasan ruang',{exact:true})).toHaveText('13.50');
  await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.locator('.room-edit-hint')).toContainText('Maklumat ruang disimpan');
  const saved=(await(await request.get('/api/projects')).json()).find(item=>item.id===p.id);expect(saved.rooms[0].dimensions).toEqual({lengthM:4.5,widthM:3});expect(saved.rooms[0].code).toBe(p.rooms[0].code);
  await page.getByRole('button',{name:'Zoom keluar',exact:true}).click();await expect(page.getByLabel('Tahap zoom')).toHaveText('175%');await page.getByRole('button',{name:'Muat lebar',exact:true}).click();await expect(page.getByLabel('Tahap zoom')).toHaveText('100%');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:info.outputPath('zoom-dimensions.png'),fullPage:true});
  await page.reload();await page.getByLabel(label).selectOption(p.id);await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();await page.getByRole('button',{name:'Pilih Bilik ukuran',exact:true}).click();
  await expect(page.getByLabel('Panjang (m)',{exact:true})).toHaveValue('4.5');await expect(page.getByLabel('Keluasan ruang',{exact:true})).toHaveText('13.50');
  const record=await request.post(`/api/projects/${p.id}/inspections`,{data:{roomId:p.rooms[0].id,photoId:image.id,damageType:'Retak',description:'Ujian.',remedial:'Periksa.',severity:'Rendah',reviewed:false,inspector:''}});expect(record.status()).toBe(201);
  await page.reload();await page.getByLabel(label).selectOption(p.id);await page.getByRole('button',{name:'Laporan',exact:true}).click();await expect(page.locator('.room-measure-summary')).toContainText('13.50 m²');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'CSV',exact:true}).click();const stream=await(await pending).createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const csv=Buffer.concat(chunks).toString('utf8');expect(csv).toContain('Keluasan semasa (m2)');expect(csv).toContain('13.500');
});

test('two-point calibration at zoom uses original pixels, preserves drafts and survives saved rotation',async({page,request},info)=>{
  const {p}=await setup(page,request,info.project.name==='desktop'?'ZC':'ZD');
  await page.getByLabel('Material dinding',{exact:true}).fill('Bata draf');
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'Zoom masuk',exact:true}).click();
  await page.getByRole('button',{name:'Tetapkan skala',exact:true}).click();await page.getByRole('button',{name:'Simpan skala',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Pilih dua titik');
  await page.locator('.plan-scroll').evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});
  await point(page,10,10);await point(page,30,10);await page.getByLabel('Jarak rujukan',{exact:true}).fill('4000');
  await page.getByRole('button',{name:'Simpan skala',exact:true}).click();await expect(page.locator('.scale-feedback')).toContainText('Skala disimpan');
  await expect(page.getByLabel('Material dinding',{exact:true})).toHaveValue('Bata draf');
  // Mobile click coordinates are quantized to screen pixels. Check against the
  // actual chosen reference on the 800 × 600 image, not ideal fractional taps.
  const calibrated=(await(await request.get('/api/projects')).json()).find(item=>item.id===p.id).plan.scale;
  const referencePixels=Math.hypot((calibrated.end.x-calibrated.start.x)*8,(calibrated.end.y-calibrated.start.y)*6);
  const lengthM=240*4/referencePixels,widthM=150*4/referencePixels,area=(lengthM*widthM).toFixed(2);
  expect(lengthM).toBeCloseTo(6,1);expect(Number(await page.getByLabel('Panjang (m)',{exact:true}).inputValue())).toBeCloseTo(lengthM,3);expect(Number(await page.getByLabel('Lebar (m)',{exact:true}).inputValue())).toBeCloseTo(widthM,3);await expect(page.getByLabel('Keluasan ruang',{exact:true})).toHaveText(area);
  await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.locator('.room-edit-hint')).toContainText('Maklumat ruang disimpan');
  await page.getByRole('button',{name:'Zoom keluar',exact:true}).click();await expect(page.getByLabel('Keluasan ruang',{exact:true})).toHaveText(area);
  await page.getByRole('button',{name:'Kanan 90°',exact:true}).click();await expect(page.getByRole('group',{name:'Orientasi pelan'})).toContainText('Putaran 90°');await expect(page.getByLabel('Keluasan ruang',{exact:true})).toHaveText(area);
  const saved=(await(await request.get('/api/projects')).json()).find(item=>item.id===p.id);expect(saved.rooms[0].dimensions).toBe(null);expect(saved.rooms[0].materials.wall).toBe('Bata draf');expect(saved.rooms[0].code).toBe(p.rooms[0].code);
  await page.getByLabel('Panjang (m)',{exact:true}).fill('7');await page.getByLabel('Lebar (m)',{exact:true}).fill('2');await expect(page.getByLabel('Keluasan ruang',{exact:true})).toHaveText('14.00');
  await page.getByRole('button',{name:'Guna ukuran pelan',exact:true}).click();await expect(page.getByLabel('Keluasan ruang',{exact:true})).toHaveText(area);
  await page.getByRole('button',{name:'Tetapkan skala',exact:true}).click();await page.getByRole('button',{name:'Padam skala',exact:true}).click();await expect(page.getByLabel('Keluasan ruang',{exact:true})).toHaveText('—');
});
