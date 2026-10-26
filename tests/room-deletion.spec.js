import {test,expect} from '@playwright/test';
import sharp from 'sharp';

async function setup(page,request,building) {
  let p=await (await request.post('/api/projects',{data:{name:'Ujian padam ruang',building,floor:'09'}})).json();
  const buffer=await sharp({create:{width:800,height:600,channels:3,background:'#fafafa'}}).png().toBuffer();
  const image=await (await request.post('/api/uploads',{multipart:{image:{name:'pelan.png',mimeType:'image/png',buffer}}})).json();
  await request.put(`/api/projects/${p.id}/plan`,{data:{photoId:image.id}});
  p=await (await request.post(`/api/projects/${p.id}/rooms`,{data:{rooms:['Bilik satu','Bilik dua','Dapur','Pejabat'].map((name,i)=>({name,bounds:{x:5+i*23,y:15,width:18,height:30},materials:{wall:'Bata',floor:'Jubin',ceiling:'Gipsum'}}))}})).json();
  p=await (await request.post(`/api/projects/${p.id}/inspections`,{data:{roomId:p.rooms[3].id,photoId:image.id,damageType:'Retak',description:'Retak dinding.',remedial:'Periksa di tapak.',severity:'Rendah',reviewed:true,inspector:'Ali'}})).json();
  await page.goto('/');await page.getByLabel(await page.getByLabel('Projek aktif').isVisible()?'Projek aktif':'Tukar projek').selectOption(p.id);
  await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();
  return p;
}
const current=async(request,id)=>(await (await request.get('/api/projects')).json()).find(p=>p.id===id);

test('checkbox selection deletes a reviewed batch, retains protected rooms and survives reload',async({page,request},info)=>{
  const p=await setup(page,request,info.project.name==='desktop'?'DA':'DB');
  await expect(page.getByLabel('Tanda 0004 Pejabat untuk padam')).toBeDisabled();
  await page.getByLabel('Tanda 0003 Dapur untuk padam').check();
  await page.getByLabel('Cari ruang').fill('Bilik');
  await page.getByLabel('Pilih semua hasil carian').check();
  await expect(page.getByRole('button',{name:'Padam pilihan (3)',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Padam pilihan (3)',exact:true}).click();
  const dialog=page.getByRole('dialog');
  for(const name of ['Bilik satu','Bilik dua','Dapur'])await expect(dialog.getByText(name,{exact:true})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Batal',exact:true})).toBeFocused();
  await dialog.getByRole('button',{name:'Batal',exact:true}).click();
  expect((await current(request,p.id)).rooms).toHaveLength(4);
  await page.getByRole('button',{name:'Padam pilihan (3)',exact:true}).click();
  await dialog.getByRole('button',{name:'Ya, padam 3 ruang',exact:true}).click();
  await expect(dialog).toHaveCount(0);await expect(page.getByText('3 ruang dipadam.',{exact:true})).toBeVisible();
  const saved=await current(request,p.id);
  expect(saved).toEqual({...p,rooms:[p.rooms[3]]});
  await page.reload();await page.getByLabel(await page.getByLabel('Projek aktif').isVisible()?'Projek aktif':'Tukar projek').selectOption(p.id);await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();
  await expect(page.locator('.room-row')).toHaveCount(1);await expect(page.locator('.room-row')).toContainText('Pejabat');
});

test('Delete works on a selected plan or list room, avoids text inputs and handles failure safely',async({page,request},info)=>{
  const p=await setup(page,request,info.project.name==='desktop'?'DC':'DD');
  const box=page.getByRole('button',{name:'Pilih Bilik satu',exact:true});
  await box.click();
  const name=page.getByLabel('Nama ruang',{exact:true});await name.fill('Draf belum disimpan');await name.press('Delete');
  await expect(page.getByRole('dialog')).toHaveCount(0);expect((await current(request,p.id)).rooms).toHaveLength(4);
  await box.click();await box.press('Delete');
  let dialog=page.getByRole('dialog');await expect(dialog.getByText(/Perubahan yang belum disimpan/)).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(name).toHaveValue('Draf belum disimpan');
  await box.press('Delete');
  await page.route(`**/api/projects/${p.id}/rooms`,route=>route.request().method()==='DELETE'?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Tiada ruang dipadam. Cuba lagi.'})}):route.continue());
  await dialog.getByRole('button',{name:'Ya, padam 1 ruang',exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Tiada ruang dipadam. Cuba lagi.');expect((await current(request,p.id)).rooms).toHaveLength(4);
  await page.unroute(`**/api/projects/${p.id}/rooms`);
  await dialog.getByRole('button',{name:'Ya, padam 1 ruang',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page.locator('.room-row')).toHaveCount(3);await expect(page.locator('.room-editor')).toHaveCount(0);
  const row=page.locator('.room-row').filter({hasText:'Bilik dua'});await row.click();await row.press('Delete');
  await dialog.getByRole('button',{name:'Ya, padam 1 ruang',exact:true}).click();await expect(page.locator('.room-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Pilih Pejabat',exact:true}).click();await page.getByRole('button',{name:'Pilih Pejabat',exact:true}).press('Delete');
  await expect(dialog.getByRole('alert')).toContainText('rekod pemeriksaan dilindungi');await expect(dialog.getByRole('button',{name:'Ya, padam 1 ruang',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Batal',exact:true}).click();
  const saved=await current(request,p.id);expect(saved.rooms).toEqual([p.rooms[2],p.rooms[3]]);expect(saved.inspections).toEqual(p.inspections);
});
