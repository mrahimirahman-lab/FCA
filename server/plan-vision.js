// Match only whole labels: a real room named "Bilik T1" or "Stor pintu"
// must remain a room. Bare P/T tags are reserved for drawing symbols in the
// default convention; an organisation using them as room names can add manually.
export function isPlanSymbolLabel(name) {
  const label=name.normalize('NFKC').trim().replace(/^[([]|[)\]]$/g,'').trim();
  return /^(?:[PT][\s._-]*\d{1,3})(?:\s*[/,&]\s*[PT][\s._-]*\d{1,3})*$/i.test(label)
    || /^(?:pintu|tingkap|door|window)(?:[\s:_-]*(?:type|jenis)?[\s:_-]*[A-Z]?\d{1,3})?$/i.test(label);
}

export function reviewPlanRooms(result,{targetRoom}={}) {
  // Focused review of an existing, manually named room must keep its identity.
  if(targetRoom)return warnOverlappingRooms(result);
  for(let index=0;index<result.rooms.length;index++) {
    const parent=result.rooms[index].parentIndex;
    if(parent!=null && (parent===index || !result.rooms[parent] || result.rooms[parent].parentIndex!=null))throw Object.assign(new Error('Hubungan induk/subruang AI tidak sah. Cuba semula atau daftar ruang secara manual. Tiada hasil disimpan.'),{status:502});
  }
  const excluded=result.rooms.filter(room=>isPlanSymbolLabel(room.name));
  if(!excluded.length)return warnOverlappingRooms(result);
  const names=[...new Set(excluded.map(room=>room.name))];
  const summary=`${excluded.length} cadangan simbol pintu/tingkap disisihkan: ${names.slice(0,12).join(', ')}${names.length>12?', …':''}. Label ini tidak diimport sebagai ruang. Jika ia nama ruang sebenar mengikut standard organisasi, daftar secara manual.`;
  const notes=`${summary}\n${result.notes.slice(0,Math.max(0,4000-summary.length-1))}`.trim();
  const kept=result.rooms.map((room,index)=>({room,index})).filter(({room})=>!isPlanSymbolLabel(room.name));
  const indexMap=new Map(kept.map(({index},position)=>[index,position]));
  const rooms=kept.map(({room})=>{
    if(room.parentIndex==null)return room;
    if(!indexMap.has(room.parentIndex))throw Object.assign(new Error('Induk subruang AI ialah label simbol yang disisihkan. Cuba semula atau daftar secara manual. Tiada hasil disimpan.'),{status:502});
    return {...room,parentIndex:indexMap.get(room.parentIndex)};
  });
  return warnOverlappingRooms({...result,rooms,notes});
}

export function warnOverlappingRooms(result) {
  const {rooms}=result;
  for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++) {
    if(rooms[i].parentIndex===j || rooms[j].parentIndex===i)continue;
    const a=rooms[i].bounds,b=rooms[j].bounds;
    const width=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
    const height=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
    if(width*height>Math.min(a.width*a.height,b.width*b.height)*.2) {
      const warning='Semakan sempadan diperlukan: beberapa kotak cadangan bertindih dengan ketara. Semak muka dalam dinding dan laras pemegang sebelum menyimpan ruang.';
      return {...result,notes:`${warning}\n${result.notes.slice(0,4000-warning.length-1)}`.trim()};
    }
  }
  return result;
}
