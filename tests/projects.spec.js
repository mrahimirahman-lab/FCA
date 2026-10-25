import {test,expect} from '@playwright/test';

async function fillProject(page,building,name='Projek ujian') {
  await page.getByRole('button',{name:'Projek baharu',exact:true}).click();
  await page.getByLabel('Nama projek').fill(name);
  await page.getByLabel('Kod blok').fill(building);
  await page.getByLabel('Kod aras').fill('01');
  return page.getByRole('dialog');
}

test('duplicate block/floor errors are visible inside the dialog and open the existing project',async({page},info)=>{
  const building=info.project.name==='desktop'?'XX':'XY';
  const response=await page.request.post('/api/projects',{data:{name:'Projek sedia ada',building,floor:'01'}});
  expect(response.status()).toBe(201);const existing=await response.json();
  await page.goto('/');
  const dialog=await fillProject(page,building,'Nama projek berbeza');
  await dialog.getByRole('button',{name:'Cipta projek',exact:true}).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('sudah mempunyai projek');
  await expect(dialog.getByLabel('Nama projek')).toHaveValue('Nama projek berbeza');
  const projects=await(await page.request.get('/api/projects')).json();
  expect(projects.filter(p=>p.building===building&&p.floor==='01')).toHaveLength(1);
  await dialog.getByRole('button',{name:'Buka projek sedia ada'}).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading',{name:'Pelan & daftar aset',exact:true})).toBeVisible();
  await expect(page.getByLabel(info.project.name==='desktop'?'Projek aktif':'Tukar projek')).toHaveValue(existing.id);
});

test('server conflict refreshes the project list when another session created the floor',async({page},info)=>{
  const building=info.project.name==='desktop'?'XZ':'YX';
  const loaded=page.waitForResponse(response=>response.url().endsWith('/api/projects')&&response.request().method()==='GET');
  await page.goto('/');
  await loaded;
  const dialog=await fillProject(page,building,'Sesi kedua');
  const saved=await page.request.post('/api/projects',{data:{name:'Dicipta oleh sesi lain',building,floor:'01'}});
  expect(saved.status()).toBe(201);const existing=await saved.json();
  await dialog.getByRole('button',{name:'Cipta projek',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('sudah didaftarkan');
  await dialog.getByRole('button',{name:'Buka projek sedia ada'}).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel(info.project.name==='desktop'?'Projek aktif':'Tukar projek')).toHaveValue(existing.id);
});

test('validation and request failures stay in the dialog; retry closes it after one successful save',async({page},info)=>{
  const building=info.project.name==='desktop'?'YZ':'ZZ';
  await page.goto('/');const dialog=await fillProject(page,building);
  await dialog.getByLabel('Kod aras').fill('1');
  await dialog.getByRole('button',{name:'Cipta projek',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Kod aras');
  await dialog.getByLabel('Kod aras').fill('01');
  let attempts=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/projects',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    attempts++;
    if(attempts===1)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Ujian: rekod belum dapat disimpan.'})});
    if(attempts===2)return route.abort('failed');
    await gate;return route.continue();
  });
  await dialog.getByRole('button',{name:'Cipta projek',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('rekod belum dapat disimpan');
  await expect(dialog.getByLabel('Nama projek')).toHaveValue('Projek ujian');
  await dialog.getByRole('button',{name:'Cipta projek',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Tidak dapat menghubungi pelayan FCA');
  await dialog.getByRole('button',{name:'Cipta projek',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Menyimpan projek…'})).toBeDisabled();
  expect(attempts).toBe(3);release();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading',{name:'Pelan & daftar aset',exact:true})).toBeVisible();
  const projects=await(await page.request.get('/api/projects')).json();
  expect(projects.filter(p=>p.building===building&&p.floor==='01')).toHaveLength(1);
});
