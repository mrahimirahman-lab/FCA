import {randomUUID} from 'node:crypto';
import {assetCode} from './domain.js';
import {subRoomSuffix} from './room-codes.js';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};

// Allocate in memory first; neither counters nor parent records change until
// the entire batch, including all parent references, has passed validation.
export function allocateRooms(project,inputs) {
  const isChild=input=>input.parentIndex!=null || input.parentId!=null;
  const reserved=new Set(project.rooms.filter(room=>!room.parentId).map(room=>room.number));
  for(const input of inputs.filter(input=>!isChild(input) && input.number)) {
    if(reserved.has(input.number))fail('Kod ruang sudah digunakan pada aras ini.',409);
    reserved.add(input.number);
  }
  let sequence=project.nextRoomSequence;
  const allocated=new Map(),parentUpdates=new Map();
  inputs.forEach((input,index)=>{
    if(isChild(input))return;
    let number=input.number;
    if(!number) {
      while(reserved.has(String(sequence).padStart(4,'0')))sequence++;
      if(sequence>9999)fail('Had kod ruang empat digit dicapai.',409);
      number=String(sequence++).padStart(4,'0');reserved.add(number);
    }
    const {parentIndex,parentId,...fields}=input;
    allocated.set(index,{...fields,number,id:randomUUID(),code:assetCode(project,number),reviewed:input.source==='manual'});
  });
  inputs.forEach((input,index)=>{
    if(!isChild(input))return;
    if(input.number)fail('Nombor subruang diwarisi daripada ruang induk; jangan isi nombor ruang baharu.');
    if(input.parentIndex!=null && input.parentId!=null)fail('Pilih satu rujukan induk sahaja.');
    let parent;
    if(input.parentIndex!=null) {
      if(input.parentIndex===index || !allocated.has(input.parentIndex) || isChild(inputs[input.parentIndex]))fail('Subruang mesti merujuk ruang utama dalam import yang sama.');
      parent=allocated.get(input.parentIndex);
    } else {
      parent=parentUpdates.get(input.parentId)||project.rooms.find(room=>room.id===input.parentId);
      if(!parent || parent.parentId)fail('Ruang induk tidak ditemui dalam projek ini atau merupakan subruang.');
      if(!parentUpdates.has(parent.id)){parent={...parent};parentUpdates.set(parent.id,parent);}
    }
    let subSequence=parent.nextSubSequence||1;
    const used=new Set([...project.rooms,...allocated.values()].filter(room=>room.parentId===parent.id).map(room=>room.subCode));
    while(subSequence<=18278 && used.has(subRoomSuffix(subSequence)))subSequence++;
    if(subSequence>18278)fail('Had kod subruang dicapai.',409);
    const subCode=subRoomSuffix(subSequence);parent.nextSubSequence=subSequence+1;
    const {parentIndex,parentId,...fields}=input;
    allocated.set(index,{...fields,number:parent.number,parentId:parent.id,subCode,id:randomUUID(),code:assetCode(project,parent.number,subCode),reviewed:input.source==='manual'});
  });
  return {rooms:inputs.map((_,index)=>allocated.get(index)),sequence,parentUpdates};
}
