import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';

const execute = promisify(execFile);
const readerPath = fileURLToPath(new URL('../tools/dwg-reader/cli.js',import.meta.url));
const previewMessage = 'DWG tidak dapat dipaparkan sebagai pelan 2D Model Space. Fail mungkin rosak, terlalu kompleks atau mengandungi objek yang belum disokong. Cuba eksport pelan kepada PDF daripada AutoCAD.';

export function cleanCadSvg(source) {
  const allowed = ['svg','defs','g','line','path','polyline','polygon','circle','ellipse','rect','text','tspan','use'];
  const clean = sanitizeHtml(source, {
    parser:{xmlMode:true,lowerCaseTags:false,lowerCaseAttributeNames:false},
    nonBooleanAttributes:['*'],
    allowedTags:allowed,
    allowedAttributes:{'*':['id','transform','stroke','stroke-width','fill','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','d','points','width','height','viewBox','xmlns','xmlns:xlink','version','preserveAspectRatio','font-size','font-family','text-anchor','dominant-baseline','href','xlink:href']},
    allowedSchemes:[],allowProtocolRelative:false,
    transformTags:{'*':(tagName,attributes)=>{
      const attribs={...attributes};
      for (const key of ['href','xlink:href']) if (attribs[key] && !attribs[key].startsWith('#')) delete attribs[key];
      if (attribs.stroke && attribs.stroke !== 'none') attribs.stroke='#26382d';
      if (attribs.fill && attribs.fill !== 'none') attribs.fill='#26382d';
      return {tagName,attribs};
    }},
  });
  const viewBox = clean.match(/viewBox="([^"]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] < 0 || viewBox[3] < 0 || Math.max(viewBox[2],viewBox[3]) <= 0) throw new Error('Invalid bounds');
  let [x,y,width,height] = viewBox;
  const margin = Math.max(width,height)*0.025;
  x-=margin;y-=margin;width+=2*margin;height+=2*margin;
  const scale=2400/Math.max(width,height);
  const outputWidth=Math.max(1,Math.round(width*scale));
  const outputHeight=Math.max(1,Math.round(height*scale));
  return clean.replace(/<svg\b[^>]*>/,`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${outputWidth}" height="${outputHeight}" viewBox="${x} ${y} ${width} ${height}">`);
}

export async function convertDwg(bytes) {
  if (bytes.length < 128 || !/^AC10\d{2}$/.test(bytes.subarray(0,6).toString('ascii'))) throw Object.assign(new Error('Fail ini bukan fail DWG yang sah. Menukar sambungan fail kepada .dwg tidak menukar formatnya.'),{status:400});
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fca-dwg-'));
  const input=path.join(directory,'input.dwg'), output=path.join(directory,'preview.json');
  try {
    await fs.writeFile(input,bytes);
    await execute(process.execPath,['--max-old-space-size=768',readerPath,input,output],{timeout:45000,maxBuffer:256*1024,windowsHide:true});
    if ((await fs.stat(output)).size>9*1024*1024) throw new Error('Preview too large');
    const drawing=JSON.parse(await fs.readFile(output,'utf8'));
    const svg=cleanCadSvg(drawing.svg);
    const png=await sharp(Buffer.from(svg),{limitInputPixels:6_000_000}).flatten({background:'#ffffff'}).png().toBuffer();
    const metadata=await sharp(png).metadata();
    return {png,width:metadata.width,height:metadata.height,version:drawing.version,entityCount:drawing.entityCount,skipped:drawing.skipped,decodeWarnings:drawing.decodeWarnings};
  } catch {
    throw Object.assign(new Error(previewMessage),{status:422});
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
}
