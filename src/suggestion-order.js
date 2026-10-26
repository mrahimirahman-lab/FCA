import {subRoomSuffix} from '../server/room-codes.js';

export function suggestionParents(rooms) {
  const parents=rooms.map(room=>room.parentIndex??null);
  if(parents.some((parent,index)=>parent!=null && (parent===index || !rooms[parent] || parents[parent]!=null)))throw new Error('Hubungan induk/subruang AI tidak sah. Tiada hasil disimpan; cuba semula atau daftar secara manual.');
  return parents;
}

export function normalizeSuggestionOrder(order,parents=[]) {
  return order.filter(index=>parents[index]==null).flatMap(index=>[index,...order.filter(child=>parents[child]===index)]);
}

// Stable indices keep equal room names separate and keep children with parents.
export function startSuggestionOrder(order,first,parents=[]) {
  if(parents[first]!=null)return [...order];
  const position=order.indexOf(first);
  return position<0?[...order]:normalizeSuggestionOrder([...order.slice(position),...order.slice(0,position)],parents);
}

export function moveSuggestion(order,index,direction,parents=[]) {
  const siblings=order.filter(other=>(parents[other]??null)===(parents[index]??null));
  const position=siblings.indexOf(index),next=position+direction;
  if(position<0 || next<0 || next>=siblings.length)return [...order];
  const result=[...order],from=result.indexOf(index),to=result.indexOf(siblings[next]);
  [result[from],result[to]]=[result[to],result[from]];
  return normalizeSuggestionOrder(result,parents);
}

export function suggestionTags(order,parents,excluded,nextSequence=1) {
  const selected=order.filter(index=>!excluded.includes(index));
  const tags=new Map();let sequence=nextSequence;
  for(const index of selected.filter(index=>parents[index]==null))tags.set(index,String(sequence++).padStart(4,'0'));
  const counts=new Map();
  for(const index of selected.filter(index=>parents[index]!=null)) {
    const parent=parents[index],count=(counts.get(parent)||0)+1;counts.set(parent,count);
    if(tags.has(parent))tags.set(index,`${tags.get(parent)}${subRoomSuffix(count)}`);
  }
  return tags;
}

export function makeSuggestionImport(rooms,order,parents,excluded) {
  const selected=order.filter(index=>!excluded.includes(index));
  return selected.map(index=>{
    const parent=parents[index],parentIndex=parent==null?null:selected.indexOf(parent);
    if(parentIndex===-1)throw new Error('Pilih ruang induk bersama subruang sebelum import.');
    return {name:rooms[index].name,bounds:rooms[index].bounds,source:'ai',...(parentIndex==null?{}:{parentIndex})};
  });
}
