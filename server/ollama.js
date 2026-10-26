import sharp from 'sharp';
import { aiRoomsSchema, aiDamageSchema } from './domain.js';
import { analysisPrompt, localRoomOutput, localDamageOutput } from './ai-contract.js';

export const DEFAULT_LOCAL_MODEL='qwen2.5vl:3b';
export const DEFAULT_LOCAL_URL='http://127.0.0.1:11434';

// Report only known field names and fixed explanations, never raw model output
// or Zod messages that could contain private text from a plan or photo.
function validationDetails(kind,issues) {
  const messages=issues.map(({path})=>{
    if(kind==='plan') {
      if(path[0]==='notes')return 'Medan notes mesti teks, maksimum 4000 aksara.';
      if(path[0]==='rooms' && Number.isInteger(path[1])) {
        const label=`Ruang ${path[1]+1}`;
        if(path[2]==='confidence')return `${label}: confidence mesti nombor 0–1, bukan 0–100.`;
        if(path[2]==='name')return `${label}: nama mesti diisi, maksimum 120 aksara.`;
        if(path[2]==='bounds')return `${label}: bounds mesti nombor peratus 0–100; width/height lebih daripada 0, x + width dan y + height tidak melebihi 100.`;
        return `${label}: butiran ruang tidak lengkap atau tidak sah.`;
      }
      return 'Medan rooms mesti senarai maksimum 100 ruang dan notes mesti disertakan.';
    }
    const messages={damageType:'Jenis kerosakan mesti diisi, maksimum 150 aksara.',description:'Deskripsi mesti diisi, maksimum 4000 aksara.',remedial:'Cadangan pembaikan mesti diisi, maksimum 4000 aksara.',severity:'Tahap mesti Rendah, Sederhana, Tinggi atau Kritikal.',confidence:'confidence mesti nombor 0–1, bukan 0–100.',limitations:'Medan limitations mesti teks, maksimum 4000 aksara.'};
    return messages[path[0]] || 'Butiran kerosakan tidak lengkap atau tidak sah.';
  });
  return [...new Set(messages)].slice(0,3).join(' ');
}

function invalidOutput(message) {
  return Object.assign(new Error(`${message} Tiada hasil disimpan. Cuba analisis semula; jika berulang, tandakan ruang atau isi dapatan secara manual.`),{status:502});
}
export function localConfiguration({model=DEFAULT_LOCAL_MODEL,baseUrl=DEFAULT_LOCAL_URL,timeoutSeconds=600}={}) {
  let url;
  try {url=new URL(baseUrl);} catch {return {error:'Alamat Ollama tidak sah. Gunakan pelayan Ollama pada komputer ini.'};}
  if (url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.username || url.password || url.pathname!=='/' || url.search || url.hash) return {error:'Mod AI tempatan hanya membenarkan Ollama pada komputer ini, melalui alamat loopback.'};
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/.test(model) || /(?:[:_-])cloud(?:$|[-_])/i.test(model)) return {error:'Pilih model vision yang dimuat turun secara tempatan, contohnya qwen2.5vl:3b.'};
  const timeout=Number(timeoutSeconds);
  if (!Number.isFinite(timeout) || timeout<30 || timeout>1800) return {error:'Tempoh analisis AI tempatan mesti antara 30 hingga 1800 saat.'};
  return {model,baseUrl:url.origin,timeoutMs:Math.round(timeout*1000)};
}

export async function checkOllama(config,{fetchImpl=fetch}={}) {
  if (config.error) return {ready:false,status:'invalid_configuration',message:config.error};
  let response,info;
  try {
    response=await fetchImpl(`${config.baseUrl}/api/show`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(4000),headers:{'Content-Type':'application/json'},body:JSON.stringify({model:config.model})});
    info=await response.json();
  } catch {return {ready:false,status:'unavailable',message:'Ollama tidak dapat dihubungi. Buka aplikasi Ollama pada komputer ini, kemudian semak sambungan semula.'};}
  if (response.status===404) return {ready:false,status:'model_missing',message:`Model ${config.model} belum tersedia. Muat turun model itu dalam Ollama dahulu.`};
  if (!response.ok) return {ready:false,status:'unavailable',message:'Ollama tidak dapat memberikan maklumat model. Semak aplikasi Ollama dan cuba semula.'};
  if (info.remote_host || info.remote_model || info.remote_model_name) return {ready:false,status:'remote_model',message:'Model ini menggunakan pelayan jauh. Mod tempatan memerlukan model vision yang dimuat turun pada komputer ini.'};
  if (!Array.isArray(info.capabilities) || !info.capabilities.includes('vision')) return {ready:false,status:'vision_required',message:'Model ini tidak melaporkan sokongan imej. Gunakan model vision seperti qwen2.5vl:3b dan versi Ollama terkini.'};
  return {ready:true,status:'ready',message:`Ollama dapat dihubungi dan model vision ${config.model} tersedia. Hasil analisis masih perlu disemak oleh pemeriksa.`};
}

export async function analyzeOllama({kind,image,roomName='',model=DEFAULT_LOCAL_MODEL,baseUrl=DEFAULT_LOCAL_URL,timeoutSeconds=600,fetchImpl=fetch}) {
  const config=localConfiguration({model,baseUrl,timeoutSeconds});
  const state=await checkOllama(config,{fetchImpl});
  if (!state.ready) throw Object.assign(new Error(state.message),{status:503});
  // Preserve the image's aspect ratio and percentage coordinates while reducing vision memory use.
  const png=await sharp(image).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const schema=kind==='plan'?localRoomOutput:localDamageOutput;
  let response,result;
  try {
    response=await fetchImpl(`${config.baseUrl}/api/chat`,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(config.timeoutMs),
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:config.model,stream:false,format:schema,keep_alive:'5m',
        messages:[{role:'user',content:`${analysisPrompt(kind,roomName)}\nPulangkan satu objek JSON sahaja mengikut skema ini: ${JSON.stringify(schema)}`,images:[png.toString('base64')]}],
        options:{temperature:0,num_ctx:8192,num_predict:5000}}),
    });
    result=await response.json();
  } catch(error) {
    throw Object.assign(new Error(error.name==='TimeoutError'||error.name==='AbortError'
      ? 'Analisis tempatan tamat masa. Cuba pelan yang lebih ringkas atau kecilkan kawasan pelan; komputer mungkin memerlukan lebih masa.'
      : 'Sambungan analisis tempatan terputus atau respons tidak lengkap. Pastikan Ollama masih berjalan.'),{status:502});
  }
  if (!response.ok) {
    const message=response.status===404 ? 'Model Ollama tidak ditemui. Muat turun model yang dipilih sebelum mencuba lagi.'
      : 'Ollama gagal memproses imej. Semak ruang RAM/VRAM, model vision dan aplikasi Ollama; cuba model yang lebih kecil jika perlu.';
    throw Object.assign(new Error(message),{status:502});
  }
  if (result?.done_reason==='length') throw Object.assign(new Error('Hasil AI tempatan melebihi had jawapan. Cuba satu aras atau kawasan pelan yang lebih kecil. Tiada hasil disimpan.'),{status:502});
  if (result?.done!==true || (result.done_reason && result.done_reason!=='stop') || typeof result.message?.content!=='string') throw invalidOutput('Jawapan AI tempatan belum lengkap.');
  let output;
  try {output=JSON.parse(result.message.content);}
  catch {throw invalidOutput('Jawapan AI tempatan bukan JSON yang sah.');}
  const parsed=(kind==='plan'?aiRoomsSchema:aiDamageSchema).safeParse(output);
  if(!parsed.success)throw invalidOutput(`Jawapan AI tempatan tidak sah. ${validationDetails(kind,parsed.error.issues)}`);
  return parsed.data;
}
