// Shared output contracts and prompts for cloud and local vision providers.
const number = { type: 'number' };
const text = { type: 'string' };
const confidence = { ...number, minimum: 0, maximum: 1, enum: [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1], description: 'Approximate confidence from 0 to 1 in steps of 0.1, for example 0.8; never a percentage such as 80.' };
const detail = { ...text, minLength: 1, maxLength: 4000 };
// Keep the cloud contract compatible with providers supporting only a JSON Schema subset.
export const roomOutput = { type: 'object', additionalProperties: false, required: ['rooms', 'notes'], properties: {
  rooms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'bounds', 'confidence'], properties: { name: text, confidence: number, bounds: { type: 'object', additionalProperties: false, required: ['x','y','width','height'], properties: { x: number, y: number, width: number, height: number } } } } }, notes: text,
} };
export const damageOutput = { type: 'object', additionalProperties: false, required: ['damageType','description','remedial','severity','confidence','limitations'], properties: { damageType: text, description: text, remedial: text, severity: { type: 'string', enum: ['Rendah','Sederhana','Tinggi','Kritikal'] }, confidence: number, limitations: text } };

// Local vision returns pixel corners, avoiding percentage/size arithmetic in the
// model. Only the adapter converts these to the application's percentage bounds.
export function localRoomOutput(width,height,targetRoom) {
  return { type: 'object', additionalProperties: false, required: ['rooms', 'notes'], properties: {
    rooms: { type: 'array', maxItems: targetRoom?1:100, items: { type: 'object', additionalProperties: false, required: ['name', 'bbox', 'confidence'], properties: {
      name: { ...text, minLength: 1, maxLength: 120 }, confidence,
      bbox: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'integer', minimum: 0, maximum: Math.max(width,height) }, description: `Integer pixel corners [left, top, right, bottom] in the attached ${width} by ${height} pixel image. 0 <= left < right <= ${width}; 0 <= top < bottom <= ${height}.` },
    } } }, notes: { ...text, maxLength: 600 },
  } };
}
export const localDamageOutput = { type: 'object', additionalProperties: false, required: ['damageType','description','remedial','severity','confidence','limitations'], properties: { damageType: { ...text, minLength: 1, maxLength: 150 }, description: detail, remedial: detail, severity: { type: 'string', enum: ['Rendah','Sederhana','Tinggi','Kritikal'] }, confidence, limitations: { ...text, maxLength: 4000 } } };

const wallGuidance='ROOMS ONLY: door/window symbols and type tags are NOT rooms. Ikut petak RUANG DALAMAN yang dibatasi dinding. Cari label bilik dahulu, kemudian jejak empat sisi muka DALAM dinding yang mengelilingi label itu. Kotak mesti rapat pada ruang lantai dalaman; jangan membesarkannya hingga masuk bilik sebelah. Pada bukaan pintu, sambung arah dinding bersebelahan merentasi bukaan, jangan ikut lengkok ayunan pintu. Abaikan garisan ukuran/dimensi, garisan paksi putus-putus, anjung bumbung, bingkai luar dan tajuk pelan. P1/P2/P3 dan T1/T2 ialah contoh tag pintu/tingkap, bukan nama ruang; jangan senaraikannya walaupun tag berada dalam bulatan. BILIK 1, BILIK 2, RUANG TAMU, DAPUR dan TANDAS ialah contoh label ruang; jangan salin contoh ini sebagai hasil, gunakan label pada imej sahaja. Dua ruang berasingan boleh mempunyai nama sama; bezakan melalui dinding dan lokasi, bukan tag pintu/tingkap. Jangan jadikan simbol, hatch atau perabot sebagai ruang. Jika dinding tidak jelas atau ruang tidak berbentuk segi empat, nyatakan batasan dalam notes; kotak segi empat hanyalah anggaran, bukan kontur tepat.';

function targetGuidance(targetRoom,unit='peratus') {
  return targetRoom ? `Fokus SATU ruang sasaran sahaja: ${JSON.stringify(targetRoom)}. Koordinat yang diberi ialah anggaran lama dalam ${unit} imej dan mungkin terlalu besar; gunakan sebagai petunjuk lokasi sahaja. Utamakan label dan dinding sebenar. Jika nama sama muncul beberapa kali, gunakan lokasi anggaran untuk memilih ruang. Pulangkan tepat satu cadangan atau rooms kosong jika sasaran tidak dapat dikenal pasti. Jangan cadangkan ruang lain atau menukar nombor aset.` : '';
}

export function localPlanPrompt(width,height,targetRoom) {
  const b=targetRoom?.bounds;
  // Keep the local hint and output in the same units; the small vision model
  // should not have to convert its percentage location hint to pixels itself.
  const hint=targetRoom?{name:targetRoom.name,bbox:[Math.round(b.x*width/100),Math.round(b.y*height/100),Math.round((b.x+b.width)*width/100),Math.round((b.y+b.height)*height/100)]}:null;
  return `Kenal pasti ruang yang benar-benar kelihatan dalam pelan lantai ini. Jawab nama dan nota dalam Bahasa Melayu; gunakan label asal jika jelas. ${wallGuidance} ${targetGuidance(hint,'piksel')} Imej yang dilampirkan berukuran ${width} piksel lebar dan ${height} piksel tinggi.  Untuk setiap ruang, pulangkan bbox: [left, top, right, bottom] dalam PIKSEL NOMBOR BULAT imej ini, asal di kiri atas. Tandakan penjuru kiri atas dan penjuru kanan bawah. Jangan pulangkan peratus, width atau height. Had wajib: 0 <= left < right <= ${width}; 0 <= top < bottom <= ${height}. Senaraikan setiap ruang sekali sahaja. Gunakan nama ruang pendek, tanpa deskripsi perabot. Jika bukan pelan atau tidak dapat dibaca, pulangkan rooms kosong dan jelaskan dalam notes. Sentiasa sertakan notes dalam satu atau dua ayat ringkas (maksimum 600 aksara), nyatakan batasan dan minta semakan manusia. confidence mesti nombor 0–1 dalam langkah 0.1 (contoh 0.8, bukan 80), anggaran model, bukan kebarangkalian yang ditentukur. Pulangkan JSON padat tanpa inden atau penerangan tambahan; tamatkan jawapan selepas objek JSON.`;
}

export function analysisPrompt(kind,roomName='',targetRoom) {
  return kind === 'plan'
    ? `Kenal pasti ruang yang benar-benar kelihatan dalam pelan lantai ini. Jawab dalam Bahasa Melayu. Gunakan label asal jika jelas. ${wallGuidance} ${targetGuidance(targetRoom)} Koordinat bounds ialah peratus 0–100 daripada keseluruhan imej, bukan piksel, asal di kiri atas. x dan y ialah penjuru kiri atas; width dan height ialah lebar dan tinggi, bukan koordinat penjuru kanan bawah. width dan height mesti lebih daripada 0. Pastikan x + width <= 100 dan y + height <= 100. Contoh format sahaja, bukan ruang untuk disalin: {"name":"Label ruang","bounds":{"x":10,"y":20,"width":30,"height":25},"confidence":0.8}. Berikan segi empat mengelilingi setiap ruang tanpa keluar imej. Jika pelan tidak dapat dibaca atau bukan pelan, pulangkan rooms kosong dan jelaskan dalam notes. Sentiasa sertakan notes, nyatakan batasan dan minta semakan manusia. confidence mesti nombor 0–1 (contoh 0.8, bukan 80), anggaran model, bukan kebarangkalian yang ditentukur.`
    : `Anda membantu pemeriksa bangunan. Ruang: ${roomName}. Berdasarkan bukti visual sahaja, cadangkan jenis kerosakan, deskripsi, tahap keutamaan dan remedial work dalam Bahasa Melayu. Jangan mendakwa punca, kestabilan struktur, dimensi atau pematuhan kod yang tidak dapat dipastikan melalui foto. Jika tiada kerosakan jelas, nyatakan demikian. Bezakan tindakan pemeriksaan lanjut daripada pembaikan. Untuk petunjuk bahaya segera, cadangkan mengasingkan kawasan dan penilaian profesional. Nyatakan batasan foto dalam limitations. confidence mesti nombor 0–1 (contoh 0.8, bukan 80), anggaran model, bukan kebarangkalian yang ditentukur.`;
}
