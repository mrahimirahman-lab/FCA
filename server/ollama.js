import sharp from 'sharp';
import { z } from 'zod';
import { aiRoomsSchema, aiDamageSchema } from './domain.js';
import { analysisPrompt, localPlanPrompt, localRoomOutput, localDamageOutput } from './ai-contract.js';
import {reviewPlanRooms} from './plan-vision.js';

export const DEFAULT_LOCAL_MODEL='qwen2.5vl:3b';
export const DEFAULT_LOCAL_URL='http://127.0.0.1:11434';

// Report only known field names and fixed explanations, never raw model output
// or Zod messages that could contain private text from a plan or photo.
function validationDetails(kind,issues,imageSize) {
  const messages=issues.map(({path,params})=>{
    if(kind==='plan') {
      if(path[0]==='notes')return 'Medan notes mesti teks, maksimum 600 aksara.';
      if(path[0]==='rooms' && Number.isInteger(path[1])) {
        const label=`Ruang ${path[1]+1}`;
        if(path[2]==='confidence')return `${label}: confidence mesti nombor 0–1, bukan 0–100.`;
        if(path[2]==='name')return `${label}: nama mesti diisi, maksimum 120 aksara.`;
        if(path[2]==='bbox') {
          const reasons={horizontal_order:'penjuru kanan tidak berada di sebelah kanan penjuru kiri',vertical_order:'penjuru bawah tidak berada di bawah penjuru atas',right_outside:'penjuru kanan melebihi lebar imej',bottom_outside:'penjuru bawah melebihi tinggi imej'};
          const reason=reasons[params?.geometry];
          return reason ? `${label}: bbox tidak sah kerana ${reason} (imej ${imageSize.width} × ${imageSize.height} piksel).`
            : `${label}: bbox mesti empat nombor bulat piksel [kiri, atas, kanan, bawah] dalam imej ${imageSize.width} × ${imageSize.height}; semua nombor mesti 0 atau lebih.`;
        }
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

function parseLocalPlan(output,{width,height},targetRoom) {
  // Validate the explicitly requested coordinate system. Never infer units from
  // value magnitude, reorder corners or clamp boxes to make output pass.
  const bbox=z.array(z.number().int().min(0)).length(4).superRefine((box,ctx)=>{
    if(box.length!==4)return;
    const [left,top,right,bottom]=box;
    for(const [invalid,geometry] of [[left>=right,'horizontal_order'],[top>=bottom,'vertical_order'],[right>width,'right_outside'],[bottom>height,'bottom_outside']]) {
      if(invalid)ctx.addIssue({code:'custom',message:'Penjuru ruang tidak sah.',params:{geometry}});
    }
  });
  const candidate=aiRoomsSchema.extend({rooms:z.array(aiRoomsSchema.shape.rooms.element.omit({bounds:true}).extend({bbox})).max(100),notes:z.string().max(600)}).safeParse(output);
  if(!candidate.success)throw invalidOutput(`Jawapan AI tempatan tidak sah. ${validationDetails('plan',candidate.error.issues,{width,height})}`);
  const converted={...candidate.data,rooms:candidate.data.rooms.map(({bbox:[left,top,right,bottom],...room})=>({
    ...room,bounds:{x:left/width*100,y:top/height*100,width:(right-left)/width*100,height:(bottom-top)/height*100},
  }))};
  const parsed=aiRoomsSchema.safeParse(converted);
  if(!parsed.success)throw invalidOutput(`Jawapan AI tempatan tidak sah. ${validationDetails('plan',parsed.error.issues)}`);
  return reviewPlanRooms(parsed.data,{targetRoom});
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

export async function analyzeOllama({kind,image,roomName='',targetRoom,entrance,model=DEFAULT_LOCAL_MODEL,baseUrl=DEFAULT_LOCAL_URL,timeoutSeconds=600,fetchImpl=fetch}) {
  const config=localConfiguration({model,baseUrl,timeoutSeconds});
  const state=await checkOllama(config,{fetchImpl});
  if (!state.ready) throw Object.assign(new Error(state.message),{status:503});
  // Use the exact dimensions of the PNG sent to the model, after resizing.
  const {data:png,info:imageSize}=await sharp(image).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
  const schema=kind==='plan'?localRoomOutput(imageSize.width,imageSize.height,targetRoom):localDamageOutput;
  const prompt=kind==='plan'?localPlanPrompt(imageSize.width,imageSize.height,targetRoom,entrance):analysisPrompt(kind,roomName);
  let response,result;
  try {
    response=await fetchImpl(`${config.baseUrl}/api/chat`,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(config.timeoutMs),
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:config.model,stream:false,format:schema,keep_alive:'5m',
        messages:[{role:'user',content:`${prompt}\nPulangkan satu objek JSON sahaja mengikut skema ini: ${JSON.stringify(schema)}`,images:[png.toString('base64')]}],
        // Leave room for the image/prompt as well as a complete plan response.
        // Damage requests retain the smaller context to limit memory use.
        options:{temperature:0,num_ctx:kind==='plan'?16384:8192,num_predict:kind==='plan'?8192:5000}}),
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
  if (result?.done_reason==='length') throw Object.assign(new Error('Hasil AI tempatan melebihi had jawapan. Model belum menamatkan JSON analisis. Cuba pelan satu aras yang lebih ringkas atau daftar ruang secara manual. Tiada hasil disimpan.'),{status:502});
  if (result?.done!==true || (result.done_reason && result.done_reason!=='stop') || typeof result.message?.content!=='string') throw invalidOutput('Jawapan AI tempatan belum lengkap.');
  let output;
  try {output=JSON.parse(result.message.content);}
  catch {throw invalidOutput('Jawapan AI tempatan bukan JSON yang sah.');}
  if(kind==='plan')return parseLocalPlan(output,imageSize,targetRoom);
  const parsed=aiDamageSchema.safeParse(output);
  if(!parsed.success)throw invalidOutput(`Jawapan AI tempatan tidak sah. ${validationDetails(kind,parsed.error.issues)}`);
  return parsed.data;
}
