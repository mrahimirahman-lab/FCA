import {test,expect} from '@playwright/test';
import sharp from 'sharp';

// Controlled provider responses exercise the UI without sending images or charging a real API.
const suggestions={rooms:[{name:'Ruang ujian AI',bounds:{x:10,y:10,width:20,height:20},confidence:.8}],notes:'Cadangan ujian terkawal; semak sempadan pada pelan.'};
async function setup(page,request,building) {
  const response=await request.post('/api/projects',{data:{name:'Ujian maklum balas AI',building,floor:'02'}});
  expect(response.status()).toBe(201);const p=await response.json();
  const image=await sharp({create:{width:600,height:1600,channels:3,background:'#ffffff'}}).png().toBuffer();
  const upload=await request.post('/api/uploads',{multipart:{image:{name:'plan.png',mimeType:'image/png',buffer:image}}});
  expect(upload.status()).toBe(201);const photo=await upload.json();
  expect((await request.put(`/api/projects/${p.id}/plan`,{data:{photoId:photo.id}})).status()).toBe(200);
  await page.route('**/api/health',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,aiEnabled:true,model:'test-only'})}));
  await page.goto('/');
  const label=await page.getByLabel('Projek aktif').isVisible()?'Projek aktif':'Tukar projek';
  await page.getByLabel(label).selectOption(p.id);
  await page.getByRole('button',{name:'Pelan & daftar aset',exact:true}).click();
  await expect(page.getByAltText('Pelan lantai 02')).toBeVisible();
  return p;
}

test('AI loading is visible and successful suggestions scroll into view before explicit import',async({page,request},info)=>{
  const building=info.project.name==='desktop'?'PA':'PB';const p=await setup(page,request,building);
  let release,calls=0;const gate=new Promise(resolve=>{release=resolve;});
  await page.route(`**/api/projects/${p.id}/analyze/plan`,async route=>{calls++;await gate;await route.fulfill({contentType:'application/json',body:JSON.stringify(suggestions)});});
  await page.getByRole('button',{name:'Analisis pelan',exact:true}).click();
  await expect(page.getByRole('button',{name:'Menganalisis pelan…'})).toBeDisabled();
  await expect(page.locator('.analysis-loading')).toBeVisible();
  await expect.poll(()=>calls).toBe(1);release();
  const result=page.getByRole('region',{name:'Keputusan analisis pelan'});
  await expect(result.getByRole('heading')).toContainText('1 cadangan ruang');
  await expect(result.getByRole('heading')).toBeInViewport();
  expect((await(await request.get('/api/projects')).json()).find(item=>item.id===p.id).rooms).toHaveLength(0);
  await result.getByRole('button',{name:'Import untuk semakan'}).click();
  await expect(page.locator('.room-list')).toContainText('Ruang ujian AI');
  const saved=(await(await request.get('/api/projects')).json()).find(item=>item.id===p.id);
  expect(saved.rooms).toHaveLength(1);expect(saved.rooms[0].code).toBe(`${building} 02 0001`);expect(saved.rooms[0].reviewed).toBe(false);
  await expect(page.getByRole('button',{name:'Analisis pelan',exact:true})).toBeDisabled();
  await expect(page.locator('.plan-ai-status')).toContainText('Ruang telah didaftarkan');
  expect(calls).toBe(1);
});

test('zero-room and quota outcomes are explicit and do not save rooms or retry automatically',async({page,request},info)=>{
  const p=await setup(page,request,info.project.name==='desktop'?'PC':'PD');let calls=0;
  await page.route(`**/api/projects/${p.id}/analyze/plan`,route=>{
    calls++;
    if(calls===1)return route.fulfill({contentType:'application/json',body:JSON.stringify({rooms:[],notes:'Pelan ujian tidak cukup jelas.'})});
    return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Kredit OpenAI API tidak mencukupi. Semak baki kredit dan bil API.'})});
  });
  await page.getByRole('button',{name:'Analisis pelan',exact:true}).click();
  const result=page.getByRole('region',{name:'Keputusan analisis pelan'});
  await expect(result.getByRole('heading')).toHaveText('Tiada ruang dikenal pasti');
  await expect(result).toContainText('Pelan ujian tidak cukup jelas.');
  await expect(result.getByRole('button',{name:'Import untuk semakan'})).toBeDisabled();
  await page.getByRole('button',{name:'Analisis pelan',exact:true}).click();
  await expect(result.getByRole('alert')).toContainText('Kredit OpenAI API tidak mencukupi');
  await expect(result.getByRole('heading')).toBeInViewport();
  await expect(result.getByRole('button',{name:'Cuba analisis semula'})).toBeEnabled();
  expect((await(await request.get('/api/projects')).json()).find(item=>item.id===p.id).rooms).toHaveLength(0);
  expect(calls).toBe(2);
});

test('connection and invalid-response failures stay visible without crashing the plan screen',async({page,request},info)=>{
  const p=await setup(page,request,info.project.name==='desktop'?'PE':'PF');let calls=0;const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(`**/api/projects/${p.id}/analyze/plan`,route=>{
    calls++;
    return calls===1?route.abort('failed'):route.fulfill({contentType:'application/json',body:JSON.stringify({rooms:'invalid',notes:''})});
  });
  await page.getByRole('button',{name:'Analisis pelan',exact:true}).click();
  const result=page.getByRole('region',{name:'Keputusan analisis pelan'});
  await expect(result.getByRole('alert')).toContainText('Tidak dapat menghubungi pelayan FCA');
  await result.getByRole('button',{name:'Cuba analisis semula'}).click();
  await expect(result.getByRole('alert')).toContainText('Jawapan AI tidak lengkap atau tidak sah');
  expect((await(await request.get('/api/projects')).json()).find(item=>item.id===p.id).rooms).toHaveLength(0);
  expect(errors).toEqual([]);expect(calls).toBe(2);
});
