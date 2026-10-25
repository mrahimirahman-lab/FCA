import { aiRoomsSchema, aiDamageSchema } from './domain.js';
import { analysisPrompt, roomOutput, damageOutput } from './ai-contract.js';


export async function analyzeImage({ kind, image, key, model, roomName = '', fetchImpl = fetch }) {
  if (!key) throw Object.assign(new Error('AI belum diaktifkan. Tetapkan INSPECTION_AI_API_KEY pada pelayan. Pemeriksaan manual masih boleh digunakan.'), { status: 503 });
  const prompt=analysisPrompt(kind,roomName);
  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_completion_tokens: 5000, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/png;base64,${image.toString('base64')}`, detail: 'high' } }] }], response_format: { type: 'json_schema', json_schema: { name: kind === 'plan' ? 'floor_rooms' : 'building_damage', strict: true, schema: kind === 'plan' ? roomOutput : damageOutput } } }),
    });
  } catch { throw Object.assign(new Error('Sambungan AI gagal atau tamat masa. Cuba semula kemudian.'), { status: 502 }); }
  let result;
  try { result=await response.json(); }
  catch { throw Object.assign(new Error('Penyedia AI tidak memberikan jawapan yang lengkap atau sambungan tamat masa. Tiada hasil disimpan; cuba semula kemudian.'),{status:502}); }
  if (!response.ok) {
    // Never forward the provider's raw message: authentication errors can contain key fragments.
    const code=result?.error?.code;
    let message='Penyedia AI gagal memproses imej. Cuba semula kemudian.';
    if (response.status===401) message='Kunci OpenAI API tidak diterima. Semak kunci yang dikonfigurasi pada pelayan.';
    else if (response.status===429) message=['insufficient_quota','billing_hard_limit_reached','usage_limit_reached'].includes(code)
      ? 'Kredit atau had belanja OpenAI API tidak mencukupi. Semak baki kredit dan bil API. Langganan ChatGPT tidak secara automatik menyediakan kredit API.'
      : 'Had kadar permintaan AI dicapai. Tunggu sebentar sebelum mencuba semula.';
    else if (response.status===403) message='Akses kepada penyedia atau model AI tidak dibenarkan untuk akaun ini. Semak kebenaran akaun API.';
    else if (response.status===404 || code==='model_not_found') message='Model AI yang dipilih tidak tersedia untuk akaun ini. Semak tetapan model dan akses API.';
    else if (response.status===400) message='Penyedia AI tidak menerima tetapan model atau permintaan imej ini. Semak bahawa model menyokong imej dan jawapan berstruktur.';
    throw Object.assign(new Error(message),{status:502});
  }
  try {
    const choice = result.choices?.[0];
    if (choice?.finish_reason !== 'stop' || choice.message?.refusal) throw new Error();
    return (kind === 'plan' ? aiRoomsSchema : aiDamageSchema).parse(JSON.parse(choice.message.content));
  } catch { throw Object.assign(new Error('Jawapan AI tidak lengkap atau tidak sah. Tiada hasil disimpan; cuba semula atau isi secara manual.'), { status: 502 }); }
}
