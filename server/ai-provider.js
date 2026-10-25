import {analyzeImage} from './ai.js';
import {analyzeOllama,checkOllama,localConfiguration,DEFAULT_LOCAL_MODEL,DEFAULT_LOCAL_URL} from './ollama.js';

export function providerSettings({provider='openai',key,model='gpt-4.1',localModel=DEFAULT_LOCAL_MODEL,localUrl=DEFAULT_LOCAL_URL,localTimeoutSeconds=600}={}) {
  if (!['openai','ollama'].includes(provider)) return {provider,error:'Penyedia AI tidak dikenali. Pilih openai atau ollama dalam konfigurasi.'};
  if (provider==='openai') return {provider,key,model,timeoutMs:90000};
  const config=localConfiguration({model:localModel,baseUrl:localUrl,timeoutSeconds:localTimeoutSeconds});
  return {provider,...config,localTimeoutSeconds};
}

export async function providerHealth(settings) {
  if (settings.error) return {aiEnabled:false,provider:settings.provider,aiStatus:'invalid_configuration',aiMessage:settings.error};
  if (settings.provider==='openai') return {aiEnabled:Boolean(settings.key),provider:'openai',model:settings.model,analysisTimeoutMs:90000,aiStatus:settings.key?'configured':'not_configured'};
  const state=await checkOllama(settings);
  return {aiEnabled:state.ready,provider:'ollama',model:settings.model,analysisTimeoutMs:settings.timeoutMs,aiStatus:state.status,aiMessage:state.message};
}

export async function analyzeConfiguredImage({settings,...input}) {
  if (settings.error) throw Object.assign(new Error(settings.error),{status:503});
  if (settings.provider==='ollama') return analyzeOllama({...input,model:settings.model,baseUrl:settings.baseUrl,timeoutSeconds:settings.localTimeoutSeconds});
  return analyzeImage({...input,key:settings.key,model:settings.model});
}
