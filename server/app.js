import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import { projectSchema, roomSchema, roomUpdateSchema, boundsSchema, aiRoomsSchema, planCalibrationSchema, inspectionSchema, assetCode, fullDak } from './domain.js';
import { analyzeConfiguredImage, providerSettings, providerHealth } from './ai-provider.js';
import { convertDwg } from './cad.js';
import { rotateRoomBounds } from './plan.js';
import {makePlanScale,rotatePlanScale} from './measurements.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 5 } });
const cadUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 0 } });
const idSchema = z.string().uuid();
export function createApp({ dataDir = process.env.FCA_DATA_DIR || path.resolve('data'), aiKey = process.env.INSPECTION_AI_API_KEY || process.env.OPENAI_API_KEY, aiModel = process.env.INSPECTION_AI_MODEL || 'gpt-4.1', aiProvider = process.env.INSPECTION_AI_PROVIDER || 'openai', ollamaModel=process.env.OLLAMA_MODEL || 'qwen2.5vl:3b', ollamaUrl=process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', ollamaTimeoutSeconds=process.env.OLLAMA_TIMEOUT_SECONDS || 600, accessUser = process.env.FCA_ACCESS_USER || 'inspector', accessPassword = process.env.FCA_ACCESS_PASSWORD || '', analyze = analyzeConfiguredImage } = {}) {
  const aiSettings=providerSettings({provider:aiProvider,key:aiKey,model:aiModel,localModel:ollamaModel,localUrl:ollamaUrl,localTimeoutSeconds:ollamaTimeoutSeconds});
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  const dbPath = path.join(dataDir, 'database.json');
  let db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : { projects: [], uploads: [] };
  const persist = () => { fs.writeFileSync(`${dbPath}.tmp`, JSON.stringify(db, null, 2)); fs.renameSync(`${dbPath}.tmp`, dbPath); };
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  if (accessPassword) {
    const expected = createHash('sha256').update(`${accessUser}:${accessPassword}`).digest();
    app.use((req,res,next) => {
      const header = req.get('authorization') || '';
      const match = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(header);
      const provided = createHash('sha256').update(match ? Buffer.from(match[1], 'base64') : '').digest();
      res.set('Cache-Control', 'no-store');
      if (match && timingSafeEqual(provided, expected)) return next();
      if (req.method === 'GET' && req.path === '/api/health') return res.json({ ok: true });
      res.set('WWW-Authenticate', 'Basic realm="FCA Inspection", charset="UTF-8"');
      return res.status(401).json({ error: 'Sila log masuk menggunakan akaun akses FCA.' });
    });
  }
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(path.join(dataDir, 'uploads'), { fallthrough: false, dotfiles: 'deny' }));
  const project = req => { const p = db.projects.find(p => p.id === req.params.id); if (!p) throw Object.assign(new Error('Projek tidak ditemui.'), { status: 404 }); return p; };
  const photo = id => { idSchema.parse(id); const item = db.uploads.find(u => u.id === id); if (!item) throw Object.assign(new Error('Imej tidak ditemui.'), { status: 404 }); return item; };
  const checkPlanVersion=(p,planId)=>{if(planId!==undefined && p.plan?.id!==planId)throw Object.assign(new Error('Pelan telah berubah. Muat semula halaman sebelum meneruskan supaya kedudukan ruang tepat.'),{status:409});};
  app.get('/api/health', async (_req,res) => res.json({ ok:true,...await providerHealth(aiSettings) }));
  app.get('/api/projects', (_req,res) => res.json(db.projects));
  app.post('/api/projects', (req,res) => {
    const input = projectSchema.parse(req.body);
    if (db.projects.some(p => p.building === input.building && p.floor === input.floor)) throw Object.assign(new Error('Bangunan dan aras ini sudah didaftarkan. Gunakan projek sedia ada supaya kod aset tidak berulang.'), { status: 409 });
    const p = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), plan: null, rooms: [], inspections: [], nextRoomSequence: 1 }; db.projects.push(p); persist(); res.status(201).json(p);
  });
  app.post('/api/uploads', upload.single('image'), async (req,res) => {
    if (!req.file) throw Object.assign(new Error('Pilih fail imej dahulu.'), { status: 400 });
    let buffer;
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: 60_000_000 });
      const metadata = await image.metadata();
      if (!['jpeg','png','webp'].includes(metadata.format)) throw new Error();
      buffer = await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    }
    catch { throw Object.assign(new Error('Imej tidak sah atau terlalu besar. Gunakan JPG, PNG atau WebP.'), { status: 400 }); }
    const id = randomUUID(); const metadata = await sharp(buffer).metadata();
    const item = { id, url: `/uploads/${id}.png`, width: metadata.width, height: metadata.height };
    fs.writeFileSync(path.join(dataDir,'uploads',`${id}.png`), buffer); db.uploads.push(item); persist(); res.status(201).json(item);
  });
  let cadBusy = false;
  app.post('/api/projects/:id/cad', cadUpload.single('drawing'), async (req,res) => {
    const p=project(req);
    if (p.rooms.length) throw Object.assign(new Error('Projek sudah mempunyai ruang. Cipta projek aras baharu untuk pelan lain.'),{status:409});
    if (!req.file || !/\.dwg$/i.test(req.file.originalname)) throw Object.assign(new Error('Pilih fail AutoCAD berformat .dwg.'),{status:400});
    if (cadBusy) throw Object.assign(new Error('Satu fail DWG sedang diproses. Cuba sebentar lagi.'),{status:429});
    cadBusy=true;
    try {
      const converted=await convertDwg(req.file.buffer);
      if (p.rooms.length) throw Object.assign(new Error('Ruang telah ditambah semasa pemprosesan. Pelan asal dikekalkan.'),{status:409});
      const id=randomUUID();
      const name=req.file.originalname.replace(/[\x00-\x1f\x7f]/g,'').slice(0,180);
      const cad={sourceId:id,name,version:converted.version,space:'Model Space',entityCount:converted.entityCount,skipped:converted.skipped,decodeWarnings:converted.decodeWarnings};
      const item={id,url:`/uploads/${id}.png`,width:converted.width,height:converted.height,cad};
      fs.mkdirSync(path.join(dataDir,'cad'),{recursive:true});
      fs.writeFileSync(path.join(dataDir,'cad',`${id}.dwg`),req.file.buffer);
      fs.writeFileSync(path.join(dataDir,'uploads',`${id}.png`),converted.png);
      db.uploads.push(item);p.plan=item;persist();res.status(201).json(p);
    } finally {cadBusy=false;}
  });
  app.get('/api/projects/:id/cad/source',(req,res)=>{
    const p=project(req);
    if (!p.plan?.cad) throw Object.assign(new Error('Projek ini tidak mempunyai fail DWG asal.'),{status:404});
    idSchema.parse(p.plan.cad.sourceId);
    res.download(path.resolve(dataDir,'cad',`${p.plan.cad.sourceId}.dwg`),p.plan.cad.name);
  });
  app.put('/api/projects/:id/plan', (req,res) => {
    const p = project(req); const image = photo(req.body.photoId);
    if (p.rooms.length) throw Object.assign(new Error('Projek sudah mempunyai ruang. Cipta projek aras baharu untuk pelan lain supaya pautan aset kekal tepat.'), { status: 409 });
    const {scale:unusedScale,...freshPlan}=image;
    p.plan = freshPlan; persist(); res.json(p);
  });
  app.put('/api/projects/:id/plan/scale',(req,res)=>{
    const p=project(req);
    const input=z.object({planId:idSchema,calibration:planCalibrationSchema.nullable()}).parse(req.body);
    if(!p.plan)throw Object.assign(new Error('Muat naik pelan dahulu.'),{status:409});
    checkPlanVersion(p,input.planId);
    const scale=input.calibration===null?null:makePlanScale(p.plan,input.calibration);
    const previous=p.plan;p.plan={...p.plan,scale};
    try {persist();}catch(error){p.plan=previous;throw error;}
    res.json(p);
  });
  app.post('/api/projects/:id/plan/rotate',async(req,res)=>{
    const p=project(req);
    const {angle,planId}=z.object({angle:z.union([z.literal(-90),z.literal(90),z.literal(180)]),planId:idSchema}).parse(req.body);
    if(!p.plan)throw Object.assign(new Error('Muat naik pelan dahulu.'),{status:409});
    checkPlanVersion(p,planId);
    const previous=p.plan;
    const {data:png,info}=await sharp(path.join(dataDir,'uploads',`${previous.id}.png`)).rotate(angle).png().toBuffer({resolveWithObject:true});
    // Recheck after image processing: another request may have replaced/rotated
    // the plan. Use current rooms so edits made during processing are retained.
    checkPlanVersion(p,planId);
    const nextRooms=p.rooms.map(room=>({...room,bounds:rotateRoomBounds(room.bounds,angle)}));
    const id=randomUUID();
    const next={...previous,id,url:`/uploads/${id}.png`,width:info.width,height:info.height,rotation:((previous.rotation||0)+angle+360)%360};
    if(previous.scale)next.scale=rotatePlanScale(previous.scale,angle);
    const file=path.join(dataDir,'uploads',`${id}.png`);
    fs.writeFileSync(file,png);
    const previousRooms=p.rooms;
    db.uploads.push(next);p.plan=next;p.rooms=nextRooms;
    try {persist();}
    catch(error){p.plan=previous;p.rooms=previousRooms;db.uploads.pop();fs.rmSync(file,{force:true});throw error;}
    res.json(p);
  });
  app.post('/api/projects/:id/rooms', (req,res) => {
    const p = project(req);
    if (!p.plan) throw Object.assign(new Error('Muat naik pelan dahulu.'), { status: 409 });
    checkPlanVersion(p,req.body.planId);
    const inputs = z.array(roomSchema).min(1).max(100).parse(req.body.rooms);
    if(p.rooms.length && inputs.some(room=>room.source==='ai'))throw Object.assign(new Error('Ruang sudah didaftarkan. Import AI berulang disekat supaya rekod tidak berganda; gunakan Semak sempadan AI pada ruang sedia ada.'),{status:409});
    const reserved = new Set(p.rooms.map(r => r.number));
    for (const input of inputs.filter(r => r.number)) { if (reserved.has(input.number)) throw Object.assign(new Error('Kod ruang sudah digunakan pada aras ini.'), { status: 409 }); reserved.add(input.number); }
    let sequence = p.nextRoomSequence;
    const rooms = inputs.map(input => {
      let number = input.number;
      if (!number) { while (reserved.has(String(sequence).padStart(4,'0'))) sequence++; if (sequence > 9999) throw Object.assign(new Error('Had kod ruang empat digit dicapai.'), { status: 409 }); number = String(sequence++).padStart(4,'0'); reserved.add(number); }
      return { ...input, number, id: randomUUID(), code: assetCode(p, number), reviewed: input.source === 'manual' };
    });
    p.nextRoomSequence = sequence;
    p.rooms.push(...rooms); persist(); res.status(201).json(p);
  });
  app.patch('/api/projects/:id/rooms/:roomId', (req,res) => {
    const p = project(req); const room = p.rooms.find(r => r.id === req.params.roomId);
    if (!room) throw Object.assign(new Error('Ruang tidak ditemui.'), { status: 404 });
    checkPlanVersion(p,req.body.planId);
    const update = roomUpdateSchema.parse(req.body);
    if (p.rooms.some(r => r.id !== room.id && r.number === update.number)) throw Object.assign(new Error('Kod ruang sudah digunakan pada aras ini.'), { status: 409 });
    if (room.number !== update.number && p.inspections.some(i => i.roomId === room.id)) throw Object.assign(new Error('Kod ruang yang mempunyai pemeriksaan dikunci untuk mengekalkan rujukan rekod.'), { status: 409 });
    Object.assign(room, update, { code: assetCode(p,update.number) }); persist(); res.json(p);
  });
  function deleteRooms(p,ids,res) {
    const selected=new Set(ids);
    if(ids.some(id=>!p.rooms.some(room=>room.id===id)))throw Object.assign(new Error('Ruang tidak ditemui. Muat semula daftar ruang sebelum memadam.'),{status:404});
    if(p.inspections.some(i=>selected.has(i.roomId)))throw Object.assign(new Error('Pilihan mengandungi ruang yang mempunyai rekod pemeriksaan. Tiada ruang dipadam.'),{status:409});
    const previous=p.rooms;
    p.rooms=p.rooms.filter(room=>!selected.has(room.id));
    try {persist();}catch(error){p.rooms=previous;throw error;}
    res.json(p);
  }
  app.delete('/api/projects/:id/rooms', (req,res) => {
    const p=project(req);
    const {roomIds}=z.object({roomIds:z.array(idSchema).min(1).max(9999).refine(ids=>new Set(ids).size===ids.length,'Pilihan ruang berulang.')}).parse(req.body);
    checkPlanVersion(p,req.body.planId);
    deleteRooms(p,roomIds,res);
  });
  app.delete('/api/projects/:id/rooms/:roomId', (req,res) => {
    deleteRooms(project(req),[req.params.roomId],res);
  });
  app.post('/api/projects/:id/inspections', (req,res) => {
    const p = project(req); const input = inspectionSchema.parse(req.body); photo(input.photoId);
    if (!p.rooms.some(r => r.id === input.roomId)) throw Object.assign(new Error('Pilih ruang daripada projek ini.'), { status: 400 });
    const room = p.rooms.find(r => r.id === input.roomId);
    p.inspections.unshift({ ...input, assetCode: fullDak(room,input.componentCodes), id: randomUUID(), createdAt: new Date().toISOString(), reviewedAt: input.reviewed ? new Date().toISOString() : null }); persist(); res.status(201).json(p);
  });
  app.patch('/api/projects/:id/inspections/:inspectionId', (req,res) => {
    const p = project(req); const inspection = p.inspections.find(i => i.id === req.params.inspectionId);
    if (!inspection) throw Object.assign(new Error('Rekod tidak ditemui.'), { status: 404 });
    const input = inspectionSchema.parse(req.body); photo(input.photoId);
    if (!p.rooms.some(r => r.id === input.roomId)) throw Object.assign(new Error('Ruang tidak sah.'), { status: 400 });
    const room = p.rooms.find(r => r.id === input.roomId);
    Object.assign(inspection, input, { assetCode: fullDak(room,input.componentCodes), reviewedAt: input.reviewed ? new Date().toISOString() : null }); persist(); res.json(p);
  });
  let aiBusy = false;
  app.post('/api/projects/:id/analyze/:kind', async (req,res) => {
    const p = project(req); const kind = z.enum(['plan','room','damage']).parse(req.params.kind);
    if(kind==='plan' && p.rooms.length)throw Object.assign(new Error('Ruang sudah didaftarkan. Gunakan Semak sempadan AI untuk ruang sedia ada.'),{status:409});
    const input=kind==='room'?z.object({roomId:idSchema,planId:idSchema,bounds:boundsSchema.optional()}).parse(req.body):req.body;
    const item = kind !== 'damage' ? p.plan : photo(req.body.photoId);
    if (!item) throw Object.assign(new Error('Muat naik imej dahulu.'), { status: 400 });
    if (aiBusy) throw Object.assign(new Error('Analisis lain sedang berjalan. Cuba sebentar lagi.'), { status: 429 });
    const room = p.rooms.find(r => r.id === input.roomId);
    if (kind !== 'plan' && !room) throw Object.assign(new Error('Pilih ruang yang telah didaftarkan.'), { status: 400 });
    if(kind==='room')checkPlanVersion(p,input.planId);
    const previousRoom=kind==='room'?JSON.stringify({name:room.name,bounds:room.bounds}):null;
    const targetRoom=kind==='room'?{name:room.name,bounds:input.bounds||room.bounds}:undefined;
    aiBusy = true;
    try {
      const image=fs.readFileSync(path.join(dataDir,'uploads',`${item.id}.png`));
      const result=await analyze({kind:kind==='room'?'plan':kind,image,key:aiKey,model:aiSettings.model,settings:aiSettings,roomName:room?.name,targetRoom});
      if(kind!=='damage')checkPlanVersion(p,item.id);
      if(kind==='room') {
        const current=p.rooms.find(r=>r.id===room.id);
        if(!current || previousRoom!==JSON.stringify({name:current.name,bounds:current.bounds}))throw Object.assign(new Error('Butiran ruang telah berubah semasa analisis. Muat semula sebelum mencuba lagi.'),{status:409});
        const parsed=aiRoomsSchema.safeParse(result);
        if(!parsed.success || parsed.data.rooms.length>1)throw Object.assign(new Error('AI tidak memberikan satu sempadan ruang yang jelas. Laras pemegang secara manual atau cuba semula.'),{status:502});
        if(!parsed.data.rooms.length)throw Object.assign(new Error('AI belum dapat mengenal pasti sempadan ruang ini. Laras lokasi anggaran atau pemegang secara manual.'),{status:422});
        const candidate=parsed.data.rooms[0];
        // Return a draft only. IDs, materials, room numbering and inspections
        // are changed only through their existing explicit save workflows.
        return res.json({roomId:room.id,planId:item.id,bounds:candidate.bounds,confidence:candidate.confidence,notes:parsed.data.notes});
      }
      res.json(result);
    }
    finally { aiBusy = false; }
  });
  app.use('/api', (_req,res) => res.status(404).json({ error: 'Laluan API tidak ditemui.' }));
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('/{*path}', (_req,res) => res.sendFile(path.join(dist,'index.html'))); }
  app.use((err,_req,res,_next) => {
    const status = err instanceof ZodError || err instanceof multer.MulterError ? 400 : err.status || 500;
    res.status(status).json({ error: err instanceof ZodError ? err.issues.map(i => i.message).join(' ') : status === 500 ? 'Ralat pelayan. Sila cuba semula.' : err.message });
  });
  return app;
}
