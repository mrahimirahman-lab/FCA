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
