// Shared output contracts and prompts for cloud and local vision providers.
const number = { type: 'number' };
const text = { type: 'string' };
export const roomOutput = { type: 'object', additionalProperties: false, required: ['rooms', 'notes'], properties: {
  rooms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'bounds', 'confidence'], properties: { name: text, confidence: number, bounds: { type: 'object', additionalProperties: false, required: ['x','y','width','height'], properties: { x: number, y: number, width: number, height: number } } } } }, notes: text,
} };
export const damageOutput = { type: 'object', additionalProperties: false, required: ['damageType','description','remedial','severity','confidence','limitations'], properties: { damageType: text, description: text, remedial: text, severity: { type: 'string', enum: ['Rendah','Sederhana','Tinggi','Kritikal'] }, confidence: number, limitations: text } };


export function analysisPrompt(kind,roomName='') {
  return kind === 'plan'
    ? 'Kenal pasti ruang yang benar-benar kelihatan dalam pelan lantai ini. Jawab dalam Bahasa Melayu. Gunakan label asal jika jelas. Koordinat bounds ialah peratus 0–100 daripada keseluruhan imej, asal di kiri atas. Berikan segi empat mengelilingi setiap ruang tanpa keluar imej. Jangan anggap perabot, tangga atau simbol kecil sebagai bilik. Jika pelan tidak dapat dibaca atau bukan pelan, pulangkan rooms kosong dan jelaskan dalam notes. Nyatakan batasan dan minta semakan manusia. confidence ialah anggaran model, bukan kebarangkalian yang ditentukur.'
    : `Anda membantu pemeriksa bangunan. Ruang: ${roomName}. Berdasarkan bukti visual sahaja, cadangkan jenis kerosakan, deskripsi, tahap keutamaan dan remedial work dalam Bahasa Melayu. Jangan mendakwa punca, kestabilan struktur, dimensi atau pematuhan kod yang tidak dapat dipastikan melalui foto. Jika tiada kerosakan jelas, nyatakan demikian. Bezakan tindakan pemeriksaan lanjut daripada pembaikan. Untuk petunjuk bahaya segera, cadangkan mengasingkan kawasan dan penilaian profesional. Nyatakan batasan foto dalam limitations. confidence ialah anggaran model, bukan kebarangkalian yang ditentukur.`;
}
