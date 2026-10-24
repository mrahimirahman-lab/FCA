import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import { projectSchema, roomSchema, roomNumberSchema, inspectionSchema, assetCode, fullDak } from './domain.js';
import { analyzeImage } from './ai.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 5 } });
const idSchema = z.string().uuid();
export function createApp({ dataDir = process.env.FCA_DATA_DIR || path.resolve('data'), aiKey = process.env.INSPECTION_AI_API_KEY || process.env.OPENAI_API_KEY, aiModel = process.env.INSPECTION_AI_MODEL || 'gpt-4.1', accessUser = process.env.FCA_ACCESS_USER || 'inspector', accessPassword = process.env.FCA_ACCESS_PASSWORD || '', analyze = analyzeImage } = {}) {
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
  app.get('/api/health', (_req,res) => res.json({ ok: true, aiEnabled: Boolean(aiKey), model: aiModel }));
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
  app.put('/api/projects/:id/plan', (req,res) => {
    const p = project(req); const image = photo(req.body.photoId);
    if (p.rooms.length) throw Object.assign(new Error('Projek sudah mempunyai ruang. Cipta projek aras baharu untuk pelan lain supaya pautan aset kekal tepat.'), { status: 409 });
    p.plan = image; persist(); res.json(p);
  });
  app.post('/api/projects/:id/rooms', (req,res) => {
    const p = project(req);
    if (!p.plan) throw Object.assign(new Error('Muat naik pelan dahulu.'), { status: 409 });
    const inputs = z.array(roomSchema).min(1).max(100).parse(req.body.rooms);
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
    const update = roomSchema.pick({ name: true, bounds: true }).extend({ number: roomNumberSchema, reviewed: z.boolean() }).parse(req.body);
    if (p.rooms.some(r => r.id !== room.id && r.number === update.number)) throw Object.assign(new Error('Kod ruang sudah digunakan pada aras ini.'), { status: 409 });
    if (room.number !== update.number && p.inspections.some(i => i.roomId === room.id)) throw Object.assign(new Error('Kod ruang yang mempunyai pemeriksaan dikunci untuk mengekalkan rujukan rekod.'), { status: 409 });
    Object.assign(room, update, { code: assetCode(p,update.number) }); persist(); res.json(p);
  });
  app.delete('/api/projects/:id/rooms/:roomId', (req,res) => {
    const p = project(req);
    if (p.inspections.some(i => i.roomId === req.params.roomId)) throw Object.assign(new Error('Ruang mempunyai rekod pemeriksaan dan tidak boleh dipadam.'), { status: 409 });
    p.rooms = p.rooms.filter(r => r.id !== req.params.roomId); persist(); res.json(p);
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
    const p = project(req); const kind = z.enum(['plan','damage']).parse(req.params.kind);
    const item = kind === 'plan' ? p.plan : photo(req.body.photoId);
    if (!item) throw Object.assign(new Error('Muat naik imej dahulu.'), { status: 400 });
    if (aiBusy) throw Object.assign(new Error('Analisis lain sedang berjalan. Cuba sebentar lagi.'), { status: 429 });
    const room = p.rooms.find(r => r.id === req.body.roomId);
    if (kind === 'damage' && !room) throw Object.assign(new Error('Pilih ruang pemeriksaan.'), { status: 400 });
    aiBusy = true;
    try { const image = fs.readFileSync(path.join(dataDir,'uploads',`${item.id}.png`)); res.json(await analyze({ kind, image, key: aiKey, model: aiModel, roomName: room?.name })); }
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
