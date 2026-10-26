import React,{useRef} from 'react';
import {boundsSchema} from '../server/domain.js';

const handles={nw:'penjuru kiri atas',n:'tepi atas',ne:'penjuru kanan atas',e:'tepi kanan',se:'penjuru kanan bawah',s:'tepi bawah',sw:'penjuru kiri bawah',w:'tepi kiri'};
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

function adjust(bounds,handle,dx,dy) {
  const {x,y,width,height}=bounds;
  let left=x,top=y,right=x+width,bottom=y+height;
  if(handle==='move') {
    left=clamp(x+dx,0,100-width);top=clamp(y+dy,0,100-height);
    right=left+width;bottom=top+height;
  } else {
    const minWidth=Math.min(.5,width),minHeight=Math.min(.5,height);
    if(handle.includes('w'))left=clamp(x+dx,0,right-minWidth);
    if(handle.includes('e'))right=clamp(x+width+dx,left+minWidth,100);
    if(handle.includes('n'))top=clamp(y+dy,0,bottom-minHeight);
    if(handle.includes('s'))bottom=clamp(y+height+dy,top+minHeight,100);
  }
  return Object.fromEntries(Object.entries({x:left,y:top,width:right-left,height:bottom-top}).map(([key,value])=>{
    const rounded=Number(value.toFixed(3));
    return [key,(key==='width'||key==='height') && rounded===0 ? value : rounded];
  }));
}

export default function PlanCanvas({plan,floor,rooms,roomId,roomDraft,addingRoom,disabled,onSelectRoom,onBoundsChange,onAddRoom}) {
  const stage=useRef(null),gesture=useRef(null);
  function start(event,room,handle,bounds) {
    if(disabled || addingRoom || event.button!==0 || event.isPrimary===false)return;
    if(room.id!==roomId)return;
    event.preventDefault();event.stopPropagation();
    gesture.current={pointerId:event.pointerId,roomId:room.id,bounds,handle,x:event.clientX,y:event.clientY,rect:stage.current.getBoundingClientRect()};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event) {
    const g=gesture.current;
    if(!g || g.pointerId!==event.pointerId || g.roomId!==roomId || disabled)return;
    event.preventDefault();
    onBoundsChange(g.roomId,adjust(g.bounds,g.handle,(event.clientX-g.x)/g.rect.width*100,(event.clientY-g.y)/g.rect.height*100));
  }
  function finish(event,cancel=false) {
    const g=gesture.current;if(!g || g.pointerId!==event.pointerId)return;
    gesture.current=null;
    if(cancel)onBoundsChange(g.roomId,g.bounds);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event,room,handle,bounds) {
    if(disabled || addingRoom || room.id!==roomId)return;
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(!direction)return;
    event.preventDefault();event.stopPropagation();
    const step=event.shiftKey ? 0.1 : 1;
    onBoundsChange(room.id,adjust(bounds,handle,direction[0]*step,direction[1]*step));
  }
  const events=(room,handle,bounds)=>({onPointerDown:event=>start(event,room,handle,bounds),onPointerMove:move,onPointerUp:event=>finish(event),onPointerCancel:event=>finish(event,true),onLostPointerCapture:event=>finish(event,true),onKeyDown:event=>keyboard(event,room,handle,bounds)});
  return <div ref={stage} className={`plan-stage ${addingRoom?'adding':''}`} onClick={onAddRoom}>
    <img src={plan.url} alt={`Pelan lantai ${floor}`} draggable={false}/>
    {rooms.map(room=>{
      const selected=room.id===roomId;
      const reviewed=selected && roomDraft?.id===room.id?roomDraft.reviewed:room.reviewed;
      const draft=selected && roomDraft?.id===room.id?boundsSchema.safeParse(roomDraft.bounds):null;
      const bounds=draft?.success?draft.data:room.bounds;
      return <div className={`room-box ${selected?'selected':''}`} key={room.id} style={{left:`${bounds.x}%`,top:`${bounds.y}%`,width:`${bounds.width}%`,height:`${bounds.height}%`}}>
        <button type="button" disabled={disabled} className={`room-bound ${selected?'selected':''} ${!reviewed?'unreviewed':''}`} aria-label={`Pilih ${room.name}`} title={selected?'Seret untuk alih ruang. Kekunci anak panah juga boleh digunakan.':`Pilih ${room.name}`} {...events(room,'move',bounds)} onClick={event=>{if(addingRoom)return;event.stopPropagation();onSelectRoom(room.id);}}><span>{room.number}</span></button>
        {selected && !addingRoom && Object.entries(handles).map(([handle,label])=><button key={handle} type="button" className={`resize-handle resize-${handle}`} disabled={disabled} aria-label={`Ubah saiz ${label}`} title={`Seret ${label}. Anak panah untuk laras; Shift untuk langkah kecil.`} {...events(room,handle,bounds)} onClick={event=>event.stopPropagation()}/>)}
      </div>;
    })}
  </div>;
}
