import sharp from 'sharp';
import { aiRoomsSchema, aiDamageSchema } from './domain.js';
import { analysisPrompt, roomOutput, damageOutput } from './ai-contract.js';

export const DEFAULT_LOCAL_MODEL='qwen2.5vl:3b';
export const DEFAULT_LOCAL_URL='http://127.0.0.1:11434';
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
  const schema=kind==='plan'?roomOutput:damageOutput;
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
  if (result.done_reason==='length') throw Object.assign(new Error('Hasil AI tempatan melebihi had jawapan. Cuba satu aras atau kawasan pelan yang lebih kecil. Tiada ruang disimpan.'),{status:502});
  try {
    if (result.done!==true || (result.done_reason && result.done_reason!=='stop') || typeof result.message?.content!=='string') throw new Error();
    return (kind==='plan'?aiRoomsSchema:aiDamageSchema).parse(JSON.parse(result.message.content));
  } catch {throw Object.assign(new Error('Jawapan AI tempatan tidak lengkap atau sempadan ruang tidak sah. Tiada hasil disimpan; cuba imej yang lebih jelas atau isi secara manual.'),{status:502});}
}
