// Shared output contracts and prompts for cloud and local vision providers.
const number = { type: 'number' };
const text = { type: 'string' };
const confidence = { ...number, minimum: 0, maximum: 1, description: 'Confidence from 0 to 1, for example 0.8; never a percentage such as 80.' };
const percentage = { ...number, minimum: 0, maximum: 100 };
const extent = { ...number, exclusiveMinimum: 0, maximum: 100 };
const detail = { ...text, minLength: 1, maxLength: 4000 };
// Keep the cloud contract compatible with providers supporting only a JSON Schema subset.
export const roomOutput = { type: 'object', additionalProperties: false, required: ['rooms', 'notes'], properties: {
  rooms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'bounds', 'confidence'], properties: { name: text, confidence: number, bounds: { type: 'object', additionalProperties: false, required: ['x','y','width','height'], properties: { x: number, y: number, width: number, height: number } } } } }, notes: text,
} };
export const damageOutput = { type: 'object', additionalProperties: false, required: ['damageType','description','remedial','severity','confidence','limitations'], properties: { damageType: text, description: text, remedial: text, severity: { type: 'string', enum: ['Rendah','Sederhana','Tinggi','Kritikal'] }, confidence: number, limitations: text } };

// Ollama also receives the field ranges enforced by domain.js. Relational bounds
// (x + width, y + height) still require the prompt and final server validation.
export const localRoomOutput = { type: 'object', additionalProperties: false, required: ['rooms', 'notes'], properties: {
  rooms: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: false, required: ['name', 'bounds', 'confidence'], properties: { name: { ...text, minLength: 1, maxLength: 120 }, confidence, bounds: { type: 'object', description: 'Percentages of the entire image. x and y are the top-left corner. width and height are sizes, not right/bottom coordinates. x + width <= 100 and y + height <= 100.', additionalProperties: false, required: ['x','y','width','height'], properties: { x: percentage, y: percentage, width: extent, height: extent } } } } }, notes: { ...text, maxLength: 4000 },
} };
export const localDamageOutput = { type: 'object', additionalProperties: false, required: ['damageType','description','remedial','severity','confidence','limitations'], properties: { damageType: { ...text, minLength: 1, maxLength: 150 }, description: detail, remedial: detail, severity: { type: 'string', enum: ['Rendah','Sederhana','Tinggi','Kritikal'] }, confidence, limitations: { ...text, maxLength: 4000 } } };


export function analysisPrompt(kind,roomName='') {
  return kind === 'plan'
    ? 'Kenal pasti ruang yang benar-benar kelihatan dalam pelan lantai ini. Jawab dalam Bahasa Melayu. Gunakan label asal jika jelas. Koordinat bounds ialah peratus 0–100 daripada keseluruhan imej, bukan piksel, asal di kiri atas. x dan y ialah penjuru kiri atas; width dan height ialah lebar dan tinggi, bukan koordinat penjuru kanan bawah. width dan height mesti lebih daripada 0. Pastikan x + width <= 100 dan y + height <= 100. Contoh format sahaja, bukan ruang untuk disalin: {"name":"Label ruang","bounds":{"x":10,"y":20,"width":30,"height":25},"confidence":0.8}. Berikan segi empat mengelilingi setiap ruang tanpa keluar imej. Jangan anggap perabot, tangga atau simbol kecil sebagai bilik. Jika pelan tidak dapat dibaca atau bukan pelan, pulangkan rooms kosong dan jelaskan dalam notes. Sentiasa sertakan notes, nyatakan batasan dan minta semakan manusia. confidence mesti nombor 0–1 (contoh 0.8, bukan 80), anggaran model, bukan kebarangkalian yang ditentukur.'
    : `Anda membantu pemeriksa bangunan. Ruang: ${roomName}. Berdasarkan bukti visual sahaja, cadangkan jenis kerosakan, deskripsi, tahap keutamaan dan remedial work dalam Bahasa Melayu. Jangan mendakwa punca, kestabilan struktur, dimensi atau pematuhan kod yang tidak dapat dipastikan melalui foto. Jika tiada kerosakan jelas, nyatakan demikian. Bezakan tindakan pemeriksaan lanjut daripada pembaikan. Untuk petunjuk bahaya segera, cadangkan mengasingkan kawasan dan penilaian profesional. Nyatakan batasan foto dalam limitations. confidence mesti nombor 0–1 (contoh 0.8, bukan 80), anggaran model, bukan kebarangkalian yang ditentukur.`;
}
