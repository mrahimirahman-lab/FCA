import React from 'react';
import {ArrowUp,ArrowDown} from 'lucide-react';
import {startSuggestionOrder,moveSuggestion,normalizeSuggestionOrder,suggestionTags} from './suggestion-order.js';

export default function RoomSuggestionChoices({rooms,order,onOrderChange,parents,onParentsChange,plan,building,floor,nextSequence,excluded,onChange,disabled}) {
  const selectedIndices=order.filter(index=>!excluded.includes(index));
  const selected=selectedIndices.length;
  const next=Number.isInteger(nextSequence)?nextSequence:1;
  const roots=selectedIndices.filter(index=>parents[index]==null);
  const tags=suggestionTags(order,parents,excluded,next);
  const number=index=>tags.get(index)||'Induk belum dipilih';
  function toggle(index,checked) {
    const nextExcluded=new Set(excluded);
    if(checked){nextExcluded.delete(index);if(parents[index]!=null)nextExcluded.delete(parents[index]);}
    else {nextExcluded.add(index);parents.forEach((parent,child)=>{if(parent===index)nextExcluded.add(child);});}
    onChange([...nextExcluded]);
  }
  function changeParent(index,value) {
    const nextParents=[...parents];nextParents[index]=value===''?null:Number(value);
    onParentsChange(nextParents);onOrderChange(normalizeSuggestionOrder(order,nextParents));
    if(!excluded.includes(index) && nextParents[index]!=null)onChange(excluded.filter(other=>other!==nextParents[index]));
  }
  return <div className="suggestion-choices">
    <div className="suggestion-order-controls"><strong>Urutan tag dari pintu masuk utama</strong><p>AI mencadangkan ruang pertama yang dilalui dari pintu masuk, kemudian ruang mengikut arah jam, sebelum ruang tengah. Semak laluan sebenar pada drawing; pilih ruang pertama dan gunakan Naik/Turun untuk membetulkan urutan.</p><label>Ruang pertama dari pintu masuk<select aria-label="Ruang pertama dari pintu masuk" value={roots[0]??''} disabled={disabled||!roots.length} onChange={event=>onOrderChange(startSuggestionOrder(order,Number(event.target.value),parents))}>{!roots.length && <option value="">Tiada ruang dipilih</option>}{roots.map(index=><option key={index} value={index}>{rooms[index].name} · Cadangan {index+1}</option>)}</select></label><small>Kod pratonton ialah kod seterusnya yang tersedia ({String(next).padStart(4,'0')}); kod yang pernah dipadam tidak digunakan semula. Subruang menggunakan akhiran a, b dan seterusnya pada kod induk. Import mengesahkan urutan ini.</small></div>
    <div className="suggestion-selection"><label className="checkbox"><input type="checkbox" checked={selected===rooms.length} disabled={disabled} onChange={event=>onChange(event.target.checked?[]:rooms.map((_,index)=>index))}/> Pilih semua cadangan</label><span role="status">{selected} daripada {rooms.length} cadangan dipilih untuk import.</span></div>
    {plan && <div className="suggestion-plan-preview" aria-label="Pratonton urutan tag ruang"><img src={plan.url} alt="Pelan untuk semakan urutan ruang" draggable={false}/>{selectedIndices.map(index=>{const room=rooms[index],b=room.bounds;return <button type="button" key={index} className={`suggestion-preview-box ${index===roots[0]?'first':''}`} style={{left:`${b.x}%`,top:`${b.y}%`,width:`${b.width}%`,height:`${b.height}%`}} title={`${number(index)} · ${room.name}. Klik untuk jadikan ruang pertama.`} aria-label={`Jadikan ${room.name} cadangan ${index+1} ruang pertama`} disabled={disabled||parents[index]!=null} onClick={()=>onOrderChange(startSuggestionOrder(order,index,parents))}><span>{number(index)}</span></button>;})}{plan.entrance && <span className="suggestion-entry" style={{left:`${plan.entrance.x}%`,top:`${plan.entrance.y}%`}}>Masuk</span>}</div>}
    <ol className="suggestion-ordered-list">{order.map((index)=>{const room=rooms[index],included=!excluded.includes(index);return <li className={`${included?'included':'excluded'} ${parents[index]!=null?'subroom':''}`} key={index} data-candidate={index+1}>
      <label className="suggestion-room-choice"><input type="checkbox" aria-label={`Import cadangan ${index+1}: ${room.name}`} checked={included} disabled={disabled} onChange={event=>toggle(index,event.target.checked)}/><span><strong>{room.name}</strong><small>{included?`${building} ${floor} ${number(index)}${parents[index]!=null?' · Subruang':index===roots[0]?' · Ruang pertama':''}`:'Tidak diimport'}</small></span></label>
      <label className="suggestion-parent">Ruang induk · Cadangan {index+1}<select aria-label={`Ruang induk cadangan ${index+1}: ${room.name}`} value={parents[index]??''} disabled={disabled||parents.some(parent=>parent===index)} onChange={event=>changeParent(index,event.target.value)}><option value="">Ruang utama</option>{order.filter(parent=>parent!==index && parents[parent]==null).map(parent=><option key={parent} value={parent}>{rooms[parent].name} · Cadangan {parent+1}</option>)}</select></label>
      <div className="button-row"><button type="button" className="button small-button" disabled={disabled||order.filter(other=>(parents[other]??null)===(parents[index]??null)).indexOf(index)===0} aria-label={`Naikkan cadangan ${index+1}: ${room.name}`} onClick={()=>onOrderChange(moveSuggestion(order,index,-1,parents))}><ArrowUp size={14}/> Naik</button><button type="button" className="button small-button" disabled={disabled||order.filter(other=>(parents[other]??null)===(parents[index]??null)).at(-1)===index} aria-label={`Turunkan cadangan ${index+1}: ${room.name}`} onClick={()=>onOrderChange(moveSuggestion(order,index,1,parents))}><ArrowDown size={14}/> Turun</button></div>
    </li>;})}</ol>
  </div>;
}
