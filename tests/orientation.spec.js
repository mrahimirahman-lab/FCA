import {test,expect} from '@playwright/test';
import sharp from 'sharp';

async function setup(page,request,building,withRoom=true) {
  const response=await request.post('/api/projects',{data:{name:'Ujian orientasi',building,floor:'07'}});expect(response.status()).toBe(201);
  let p=await response.json();
  const buffer=await sharp({create:{width:600,height:400,channels:3,background:'#fff'}}).png().toBuffer();
  const upload=await request.post('/api/uploads',{multipart:{image:{name:'pelan.png',mimeType:'image/png',buffer}}});expect(upload.status()).toBe(201);const image=await upload.json();
  expect((await request.put(`/api/projects/${p.id}/plan`,{data:{photoId:image.id}})).status()).toBe(200);
  if(withRoom) {
    const room=await request.post(`/api/projects/${p.id}/rooms`,{data:{rooms:[{name:'Pejabat orientasi',bounds:{x:10,y:20,width:30,height:40}}]}});expect(room.status()).toBe(201);p=await room.json();
  }
  await page.route('**/api/health',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,aiEnabled:true,provider:'openai',model:'test-only'})}));
  await page.goto('/');
  const label=await page.getByLabel('Projek aktif').isVisible()?'Projek aktif':'Tukar projek';
  await page.getByLabel(label).selectOption(p.id);
  await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();
  await expect(page.getByAltText('Pelan lantai 07')).toBeVisible();
  return {p,label};
}

test('orientation is saved, preserves room coding, handles unsaved edits and remains usable on a phone',async({page,request},info)=>{
  const {p,label}=await setup(page,request,info.project.name==='desktop'?'RA':'RB');
  const group=page.getByRole('group',{name:'Orientasi pelan'});
  await expect(group).toContainText('Putaran 0°');
  await page.getByRole('button',{name:'Pilih Pejabat orientasi',exact:true}).click();
  await page.getByLabel('Nama ruang',{exact:true}).fill('Perubahan belum disimpan');
  page.once('dialog',dialog=>dialog.dismiss());
  await group.getByRole('button',{name:'Kanan 90°',exact:true}).click();
  await expect(page.getByLabel('Nama ruang',{exact:true})).toHaveValue('Perubahan belum disimpan');
  await expect(group).toContainText('Putaran 0°');
  page.once('dialog',dialog=>dialog.accept());
  await group.getByRole('button',{name:'Kanan 90°',exact:true}).click();
  await expect(group).toContainText('Putaran 90°');
  await expect(page.getByLabel('Nama ruang',{exact:true})).toHaveValue('Pejabat orientasi');
  await expect(page.getByLabel('Kiri (%)',{exact:true})).toHaveValue('40');
  await expect(page.getByLabel('Atas (%)',{exact:true})).toHaveValue('10');
  await expect(page.getByLabel('Lebar (%)',{exact:true})).toHaveValue('40');
  await expect(page.getByLabel('Tinggi (%)',{exact:true})).toHaveValue('30');
  await expect(page.locator('.room-list')).toContainText(p.rooms[0].code);
  await expect.poll(()=>page.getByAltText('Pelan lantai 07').evaluate(img=>[img.naturalWidth,img.naturalHeight])).toEqual([400,600]);
  await page.screenshot({path:info.outputPath('orientation.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
  await page.reload();await page.getByLabel(label).selectOption(p.id);await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();
  await expect(group).toContainText('Putaran 90°');
  await group.getByRole('button',{name:'Kiri 90°',exact:true}).click();await expect(group).toContainText('Putaran 0°');
  await group.getByRole('button',{name:'Putar 180°',exact:true}).click();await expect(group).toContainText('Putaran 180°');
  const saved=(await(await request.get('/api/projects')).json()).find(item=>item.id===p.id);
  expect(saved.rooms[0].id).toBe(p.rooms[0].id);expect(saved.rooms[0].code).toBe(p.rooms[0].code);
  expect(saved.rooms[0].bounds).toEqual({x:60,y:40,width:30,height:40});
});

test('rotation failures preserve AI suggestions and a successful turn clears suggestions for the old orientation',async({page,request},info)=>{
  const {p}=await setup(page,request,info.project.name==='desktop'?'RC':'RD',false);
  await page.route(`**/api/projects/${p.id}/analyze/plan`,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({rooms:[{name:'Cadangan ujian',bounds:{x:10,y:10,width:30,height:20},confidence:.7}],notes:'Respons terkawal untuk menguji orientasi.'})}));
  await page.getByRole('button',{name:'Analisis pelan',exact:true}).click();
  await expect(page.getByRole('button',{name:'Import untuk semakan'})).toBeVisible();
  const before=await page.getByAltText('Pelan lantai 07').getAttribute('src');
  await page.route(`**/api/projects/${p.id}/plan/rotate`,route=>route.abort(),{times:1});
  await page.getByRole('button',{name:'Kanan 90°',exact:true}).click();
  await expect(page.locator('.orientation-feedback').getByRole('alert')).toContainText('Tidak dapat menghubungi pelayan');
  await expect(page.getByRole('button',{name:'Import untuk semakan'})).toBeVisible();
  await expect(page.getByAltText('Pelan lantai 07')).toHaveAttribute('src',before);
  await page.getByRole('button',{name:'Kanan 90°',exact:true}).click();
  await expect(page.getByRole('group',{name:'Orientasi pelan'})).toContainText('Putaran 90°');
  await expect(page.getByRole('region',{name:'Keputusan analisis pelan'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Analisis pelan',exact:true})).toBeEnabled();
  expect((await(await request.get('/api/projects')).json()).find(item=>item.id===p.id).rooms).toHaveLength(0);
  await page.getByRole('button',{name:'Tambah ruang',exact:true}).click();
  await page.getByAltText('Pelan lantai 07').click({position:{x:60,y:60}});
  await expect(page.getByLabel('Nama ruang',{exact:true})).toHaveValue('Ruang 1');
});
