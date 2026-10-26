import {test,expect} from '@playwright/test';
import sharp from 'sharp';

async function setup(page,request,building) {
  const response=await request.post('/api/projects',{data:{name:'Ujian ruang dan material',building,floor:'08'}});expect(response.status()).toBe(201);const p=await response.json();
  const buffer=await sharp({create:{width:800,height:600,channels:3,background:'#fafafa'}}).png().toBuffer();
  const upload=await request.post('/api/uploads',{multipart:{image:{name:'pelan.png',mimeType:'image/png',buffer}}});expect(upload.status()).toBe(201);const image=await upload.json();
  expect((await request.put(`/api/projects/${p.id}/plan`,{data:{photoId:image.id}})).status()).toBe(200);
  await page.goto('/');const label=await page.getByLabel('Projek aktif').isVisible()?'Projek aktif':'Tukar projek';await page.getByLabel(label).selectOption(p.id);
  await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();
  await page.getByRole('button',{name:'Tambah ruang',exact:true}).click();
  await page.getByAltText('Pelan lantai 08').click({position:{x:100,y:100}});
  await expect(page.getByLabel('Nama ruang',{exact:true})).toHaveValue('Ruang 1');
  return {p,label,image};
}

async function drag(page,locator,dx,dy,touch=false) {
  await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox(),stage=await page.locator('.plan-stage').boundingBox();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  if(touch) {
    // Real Chromium touch input, including pointer capture and touch-action behavior.
    const client=await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+stage.width*dx/100,y:y+stage.height*dy/100}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();
  } else {
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+stage.width*dx/100,y+stage.height*dy/100,{steps:5});await page.mouse.up();
  }
}

test('manual rooms resize and move by mouse or touch, save materials, reload and export them',async({page,request},info)=>{
  const {p,label,image}=await setup(page,request,info.project.name==='desktop'?'MA':'MB');
  const beforeWidth=Number(await page.getByLabel('Lebar (%)',{exact:true}).inputValue());
  const beforeHeight=Number(await page.getByLabel('Tinggi (%)',{exact:true}).inputValue());
  await drag(page,page.getByRole('button',{name:'Ubah saiz penjuru kanan bawah',exact:true}),10,8,info.project.name==='mobile');
  expect(Number(await page.getByLabel('Lebar (%)',{exact:true}).inputValue())).toBeCloseTo(beforeWidth+10,0);
  expect(Number(await page.getByLabel('Tinggi (%)',{exact:true}).inputValue())).toBeCloseTo(beforeHeight+8,0);
  const beforeX=Number(await page.getByLabel('Kiri (%)',{exact:true}).inputValue());
  await drag(page,page.getByRole('button',{name:'Pilih Ruang 1',exact:true}),5,3,info.project.name==='mobile');
  expect(Number(await page.getByLabel('Kiri (%)',{exact:true}).inputValue())).toBeCloseTo(beforeX+5,0);
  await page.getByLabel('Nama ruang',{exact:true}).fill('Pejabat bahan');
  await page.getByLabel('Material dinding',{exact:true}).fill('Bata berlepa + cat');
  await page.getByLabel('Material lantai',{exact:true}).fill('Vinil khas');
  await page.getByLabel('Material siling',{exact:true}).fill('Papan gipsum');
  await expect(page.locator('.room-edit-hint')).toContainText('Perubahan belum disimpan');
  let saved=(await(await request.get('/api/projects')).json()).find(item=>item.id===p.id);
  expect(saved.rooms[0].materials.wall).toBe('');expect(saved.rooms[0].bounds.width).toBe(15);
  await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.locator('.room-edit-hint')).toContainText('Maklumat ruang disimpan');
  saved=(await(await request.get('/api/projects')).json()).find(item=>item.id===p.id);const room=saved.rooms[0];
  expect(room.materials).toEqual({wall:'Bata berlepa + cat',floor:'Vinil khas',ceiling:'Papan gipsum'});expect(room.bounds.width).toBeCloseTo(25,0);
  await page.screenshot({path:info.outputPath('room-materials.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.reload();await page.getByLabel(label).selectOption(p.id);await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();
  await page.getByRole('button',{name:'Pilih Pejabat bahan',exact:true}).click();await expect(page.getByLabel('Material lantai',{exact:true})).toHaveValue('Vinil khas');
  await expect(page.getByLabel('Lebar (%)',{exact:true})).toHaveValue(String(room.bounds.width));
  const record=await request.post(`/api/projects/${p.id}/inspections`,{data:{roomId:room.id,photoId:image.id,damageType:'Retak',description:'Retak ujian.',remedial:'Periksa.',severity:'Rendah',reviewed:false,inspector:''}});expect(record.status()).toBe(201);
  await page.reload();await page.getByLabel(label).selectOption(p.id);await page.getByRole('button',{name:/^Pemeriksaan/}).click();
  await page.getByLabel('Ruang / nombor aset').selectOption(room.id);await expect(page.locator('.room-material-summary')).toContainText('Bata berlepa + cat');
  await page.getByRole('button',{name:'Laporan',exact:true}).click();await expect(page.locator('.report-record')).toContainText('Vinil khas');
  await page.emulateMedia({media:'print'});await expect(page.locator('.room-material-summary')).toContainText('Papan gipsum');await page.emulateMedia({media:'screen'});
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'CSV',exact:true}).click();const download=await pending;
  const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const csv=Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('Material dinding semasa');expect(csv).toContain('Bata berlepa + cat');expect(csv).toContain('Vinil khas');
});

test('keyboard resizing stays within the plan and failed saves retain the draft for retry',async({page,request},info)=>{
  const {p}=await setup(page,request,info.project.name==='desktop'?'MC':'MD');
  const east=page.getByRole('button',{name:'Ubah saiz tepi kanan',exact:true});
  await east.focus();await east.press('ArrowRight');expect(Number(await page.getByLabel('Lebar (%)',{exact:true}).inputValue())).toBe(16);
  await east.press('Shift+ArrowRight');expect(Number(await page.getByLabel('Lebar (%)',{exact:true}).inputValue())).toBe(16.1);
  await page.getByLabel('Material dinding',{exact:true}).fill('Kaca khas');
  await drag(page,page.getByRole('button',{name:'Ubah saiz penjuru kiri atas',exact:true}),-200,-200);
  expect(Number(await page.getByLabel('Kiri (%)',{exact:true}).inputValue())).toBe(0);expect(Number(await page.getByLabel('Atas (%)',{exact:true}).inputValue())).toBe(0);
  await page.route(`**/api/projects/${p.id}/rooms/*`,route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Gagal simpan ujian.'})}),{times:1});
  await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.locator('.room-save-error')).toContainText('Gagal simpan ujian');
  await expect(page.getByLabel('Material dinding',{exact:true})).toHaveValue('Kaca khas');
  await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.locator('.room-edit-hint')).toContainText('Maklumat ruang disimpan');
  await expect(page.getByLabel('Material dinding',{exact:true})).toHaveValue('Kaca khas');
});
