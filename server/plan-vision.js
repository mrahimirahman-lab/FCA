import sharp from 'sharp';

// A temporary visual coordinate reference. No padding, cropping or rescaling:
// all output coordinates still refer to the exact same plan dimensions.
export async function addPlanGrid(png,{width,height}) {
  if(width<400 || height<300)return {png,hasGrid:false};
  const parts=[];
  for(let i=1;i<10;i++) {
    const x=Math.round(width*i/10),y=Math.round(height*i/10);
    parts.push(`<path d="M ${x} 0 V ${height} M 0 ${y} H ${width}" fill="none" stroke="#1684b8" stroke-width="0.7" stroke-opacity="0.4" stroke-dasharray="3 5"/>`);
    parts.push(`<rect x="${Math.min(x+1,width-54)}" y="0" width="53" height="14" fill="white" fill-opacity="0.7"/><text x="${Math.min(x+3,width-52)}" y="11">x=${x}</text>`);
    parts.push(`<rect x="0" y="${y-14}" width="53" height="14" fill="white" fill-opacity="0.7"/><text x="2" y="${y-3}">y=${y}</text>`);
  }
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g font-family="sans-serif" font-size="10" fill="#12678d">${parts.join('')}</g></svg>`);
  return {png:await sharp(png).composite([{input:svg}]).png().toBuffer(),hasGrid:true};
}

export function warnOverlappingRooms(result) {
  const {rooms}=result;
  for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++) {
    const a=rooms[i].bounds,b=rooms[j].bounds;
    const width=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
    const height=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
    if(width*height>Math.min(a.width*a.height,b.width*b.height)*.2) {
      return {...result,notes:`${result.notes}\nSemakan sempadan diperlukan: beberapa kotak cadangan bertindih dengan ketara. Semak muka dalam dinding dan laras pemegang sebelum menyimpan ruang.`.trim()};
    }
  }
  return result;
}
