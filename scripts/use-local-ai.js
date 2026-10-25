import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export function configureLocalEnvironment(filePath=fileURLToPath(new URL('../.env',import.meta.url))) {
  const exists=fs.existsSync(filePath);
  const source=exists?fs.readFileSync(filePath,'utf8'):'';
  const newline=source.includes('\r\n')?'\r\n':'\n';
  let updated=source.replace(/^\uFEFF/,'');
  const settings={INSPECTION_AI_PROVIDER:'ollama',OLLAMA_MODEL:'qwen2.5vl:3b',OLLAMA_BASE_URL:'http://127.0.0.1:11434',OLLAMA_TIMEOUT_SECONDS:'600'};
  for (const [name,value] of Object.entries(settings)) {
    const pattern=new RegExp(`^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=[^\\r\\n]*`,'gm');
    if (pattern.test(updated)) updated=updated.replace(pattern,`${name}=${value}`);
    else updated+=(updated && !updated.endsWith('\n')?newline:'')+`${name}=${value}${newline}`;
  }
  if (updated===source) return {changed:false,backupCreated:false};
  if (exists) {
    const stamp=new Date().toISOString().replaceAll(':','-');
    const backup=`${filePath}.backup-${stamp}-${randomUUID().slice(0,8)}`;
    fs.copyFileSync(filePath,backup,fs.constants.COPYFILE_EXCL);
    fs.chmodSync(backup,0o600);
  }
  const temporary=`${filePath}.tmp-${randomUUID()}`;
  try {fs.writeFileSync(temporary,updated,{mode:0o600});fs.renameSync(temporary,filePath);}
  finally {fs.rmSync(temporary,{force:true});}
  return {changed:true,backupCreated:exists};
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const result=configureLocalEnvironment();
    console.log('FCA kini dikonfigurasi untuk Ollama tempatan, model qwen2.5vl:3b.');
    if (result.backupCreated) console.log('Sandaran fail .env lama telah dibuat dalam folder aplikasi.');
    console.log('Tetapan lain, termasuk kunci sedia ada, dikekalkan. Tiada nilai rahsia dipaparkan.');
    console.log('Pastikan Ollama berjalan dan model sudah dimuat turun, kemudian jalankan npm start.');
  } catch {console.error('Konfigurasi tidak dapat disimpan. Tutup fail .env dalam editor dan semak kebenaran folder aplikasi.');process.exitCode=1;}
}
