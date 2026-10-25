import { z } from 'zod';

const blockCode = z.string().trim().toUpperCase().regex(/^[A-Z]{1,3}$/, 'Kod blok: 1–3 huruf, contohnya D.');
const floorCode = z.string().trim().toUpperCase().regex(/^(?:[A-Z][0-9]|[0-9]{2})$/, 'Kod aras: dua aksara, contohnya B1 atau 04.');
export const projectSchema = z.object({ name: z.string().trim().min(1,'Sila masukkan nama projek.').max(120,'Nama projek maksimum 120 aksara.'), building: blockCode, floor: floorCode });
export const boundsSchema = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), width: z.number().positive().max(100), height: z.number().positive().max(100) }).refine(b => b.x + b.width <= 100.01 && b.y + b.height <= 100.01, 'Sempadan ruang mesti berada dalam pelan.');
export const roomNumberSchema = z.string().regex(/^[0-9]{4}$/, 'Kod ruang mesti empat digit, contohnya 0002.');
export const componentCodesSchema = z.array(z.string().regex(/^[0-9]{2}$/, 'Setiap peringkat komponen mesti dua digit.')).length(7, 'DAK mempunyai tujuh peringkat kod komponen.').nullable().default(null);
export const roomSchema = z.object({ name: z.string().trim().min(1).max(120), number: roomNumberSchema.optional(), bounds: boundsSchema, source: z.enum(['manual', 'ai']).default('manual') });
export const severitySchema = z.enum(['Rendah', 'Sederhana', 'Tinggi', 'Kritikal']);
export const inspectionSchema = z.object({ roomId: z.string().min(1), photoId: z.string().uuid(), damageType: z.string().trim().min(1).max(150), description: z.string().trim().min(1).max(4000), remedial: z.string().trim().min(1).max(4000), severity: severitySchema, reviewed: z.boolean(), inspector: z.string().trim().max(120).default(''), componentCodes: componentCodesSchema }).refine(v => !v.reviewed || v.inspector.length > 0, 'Nama pemeriksa diperlukan untuk pengesahan.');
export const aiRoomsSchema = z.object({ rooms: z.array(z.object({ name: z.string().trim().min(1).max(120), bounds: boundsSchema, confidence: z.number().min(0).max(1) })).max(100), notes: z.string().max(4000) });
export const aiDamageSchema = z.object({ damageType: z.string().trim().min(1).max(150), description: z.string().trim().min(1).max(4000), remedial: z.string().trim().min(1).max(4000), severity: severitySchema, confidence: z.number().min(0).max(1), limitations: z.string().max(4000) });
export const assetCode = (project, number) => `${project.building} ${project.floor} ${String(number).padStart(4, '0')}`;
export const fullDak = (room, components) => components ? `${room.code} ${components.join(' ')}` : null;
