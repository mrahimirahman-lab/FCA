import {test,expect} from '@playwright/test';
import sharp from 'sharp';

async function setup(page,request,building) {
  const p=await(await request.post('/api/projects',{data:{name:'Urutan pintu masuk dan subruang',building,floor:'12'}})).json();
  const buffer=await sharp({create:{width:800,height:600,channels:3,background:'#fafafa'}}).png().toBuffer();
  const image=await(await request.post('/api/uploads',{multipart:{image:{name:'pelan.png',mimeType:'image/png',buffer}}})).json();
  await request.put(`/api/projects/${p.id}/plan`,{data:{photoId:image.id}});
  await page.route('**/api/health',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,aiEnabled:true,model:'test-only'})}));
  await page.goto('/');const label=await page.getByLabel('Projek aktif').isVisible()?'Projek aktif':'Tukar projek';await page.getByLabel(label).selectOption(p.id);await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();return {p,label,image};
}
const current=async(request,id)=>(await(await request.get('/api/projects')).json()).find(project=>project.id===id);

test('entrance marking and reviewed clockwise groups import parent and child codes in the previewed order',async({page,request},info)=>{
  const {p,label}=await setup(page,request,info.project.name==='desktop'?'EA':'EB');
  await page.getByRole('button',{name:'Tandakan pintu masuk utama',exact:true}).click();
  await page.getByAltText('Pelan lantai 12').click({position:{x:100,y:150}});
  await expect(page.getByLabel('Tanda pintu masuk utama',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Simpan pintu masuk',exact:true}).click();
  await expect(page.locator('.scale-feedback')).toContainText('Pintu masuk utama disimpan');
  const marked=await current(request,p.id);expect(marked.plan.entrance.x).toBeGreaterThan(0);expect(marked.plan.entrance.y).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Kanan 90°',exact:true}).click();
  await expect(page.getByRole('group',{name:'Orientasi pelan'})).toContainText('Putaran 90°');
  const rotated=await current(request,p.id);expect(rotated.plan.entrance).toEqual({x:100-marked.plan.entrance.y,y:marked.plan.entrance.x});
  const rooms=['Bilik A','Laluan','Ruang kerja','Zon B','Sirkulasi','Bilik B'].map((name,i)=>({name,bounds:{x:5+i*14,y:20,width:10,height:20},confidence:.7,parentIndex:[3,4].includes(i)?2:null}));
  await page.route(`**/api/projects/${p.id}/analyze/plan`,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({rooms,notes:'Controlled order and hierarchy, not real inference.'})}));
  await page.getByRole('button',{name:'Analisis pelan',exact:true}).click();
  const result=page.getByRole('region',{name:'Keputusan analisis pelan'});
  await result.getByLabel('Ruang induk cadangan 1: Bilik A',{exact:true}).selectOption('2');
  await result.getByLabel('Ruang pertama dari pintu masuk',{exact:true}).selectOption('5');
  await expect(result.locator('li[data-candidate="6"]')).toContainText('0001');
  await result.getByLabel('Ruang pertama dari pintu masuk',{exact:true}).selectOption('1');
  await result.getByRole('button',{name:'Turunkan cadangan 3: Ruang kerja',exact:true}).click();
  for(let i=0;i<2;i++)await result.getByRole('button',{name:'Naikkan cadangan 5: Sirkulasi',exact:true}).click();
  await expect(result.locator('li[data-candidate="5"]')).toContainText('0003a');
  await expect(result.locator('li[data-candidate="1"]')).toContainText('0003b');
  await expect(result.locator('li[data-candidate="4"]')).toContainText('0003c');
  await result.getByLabel('Import cadangan 3: Ruang kerja',{exact:true}).uncheck();
  await expect(result.getByLabel('Import cadangan 5: Sirkulasi',{exact:true})).not.toBeChecked();
  await result.getByLabel('Import cadangan 5: Sirkulasi',{exact:true}).check();
  await expect(result.getByLabel('Import cadangan 3: Ruang kerja',{exact:true})).toBeChecked();
  await result.getByLabel('Pilih semua cadangan').check();
  await result.getByRole('button',{name:'Import untuk semakan'}).click();await expect(result).toHaveCount(0);
  let saved=await current(request,p.id);
  expect(saved.rooms.map(room=>room.name)).toEqual(['Laluan','Bilik B','Ruang kerja','Sirkulasi','Bilik A','Zon B']);
  expect(saved.rooms.map(room=>room.code.split(' ').at(-1))).toEqual(['0001','0002','0003','0003a','0003b','0003c']);
  expect(saved.nextRoomSequence).toBe(4);expect(saved.rooms.slice(3).every(room=>room.parentId===saved.rooms[2].id)).toBe(true);
  await page.reload();await page.getByLabel(label).selectOption(p.id);await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();
  await expect(page.locator('.room-list')).toContainText('0003b');await expect(page.getByLabel('Tanda pintu masuk utama',{exact:true})).toBeVisible();
  await page.locator('.room-row').filter({hasText:'Bilik A'}).click();
  await expect(page.getByLabel('Kod ruang (4 digit)')).not.toBeEditable();await expect(page.locator('.room-editor')).toContainText('Subruang bagi Ruang kerja');
  await page.getByLabel('Material lantai',{exact:true}).fill('Vinil subruang');await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.locator('.room-edit-hint')).toContainText('Maklumat ruang disimpan');
  saved=await current(request,p.id);expect(saved.rooms[4].materials.floor).toBe('Vinil subruang');expect(saved.rooms[4].code.split(' ').at(-1)).toBe('0003b');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:info.outputPath('entrance-subrooms.png'),fullPage:true});
});

test('manual subrooms inherit a parent, cannot orphan on deletion and keep suffix counters after deletion',async({page,request},info)=>{
  const {p}=await setup(page,request,info.project.name==='desktop'?'EC':'ED');
  await page.getByRole('button',{name:'Tambah ruang',exact:true}).click();await page.getByAltText('Pelan lantai 12').click({position:{x:100,y:100}});
  await expect(page.getByLabel('Nama ruang',{exact:true})).toHaveValue('Ruang 1');
  const parent=(await current(request,p.id)).rooms[0];
  await page.getByRole('button',{name:'Tambah subruang',exact:true}).click();await page.getByAltText('Pelan lantai 12').click({position:{x:120,y:110}});
  await expect(page.getByLabel('Nama ruang',{exact:true})).toHaveValue('Subruang 1');
  let saved=await current(request,p.id);expect(saved.rooms[1].parentId).toBe(parent.id);expect(saved.rooms[1].code.split(' ').at(-1)).toBe('0001a');expect(saved.nextRoomSequence).toBe(2);
  await page.locator('.room-row').filter({has:page.getByText('Ruang 1',{exact:true})}).click();await page.getByRole('button',{name:'Padam ruang',exact:true}).click();
  let dialog=page.getByRole('dialog');await expect(dialog.getByRole('alert')).toContainText('subruang yang belum dipilih');await expect(dialog.getByRole('button',{name:'Ya, padam 1 ruang',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'Batal',exact:true}).click();
  await page.getByLabel('Tanda 0001a Subruang 1 untuk padam',{exact:true}).check();await page.getByRole('button',{name:'Padam pilihan (1)',exact:true}).click();await dialog.getByRole('button',{name:'Ya, padam 1 ruang',exact:true}).click();
  await expect(page.locator('.room-row')).toHaveCount(1);
  await page.getByRole('button',{name:'Tambah subruang',exact:true}).click();await page.getByAltText('Pelan lantai 12').click({position:{x:120,y:110}});
  await expect(page.locator('.room-list')).toContainText('0001b');saved=await current(request,p.id);expect(saved.rooms[1].code.split(' ').at(-1)).toBe('0001b');expect(saved.rooms[0].id).toBe(parent.id);
});
