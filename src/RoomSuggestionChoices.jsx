import React from 'react';

export default function RoomSuggestionChoices({rooms,excluded,onChange,disabled}) {
  const selected=rooms.length-excluded.length;
  return <div className="suggestion-choices">
    <div className="suggestion-selection"><label className="checkbox"><input type="checkbox" checked={selected===rooms.length} disabled={disabled} onChange={event=>onChange(event.target.checked?[]:rooms.map((_,index)=>index))}/> Pilih semua cadangan</label><span role="status">{selected} daripada {rooms.length} cadangan dipilih untuk import.</span></div>
    <div className="suggestion-chips">{rooms.map((room,index)=><label className={`badge suggestion-choice ${excluded.includes(index)?'excluded':'included'}`} key={index}><input type="checkbox" aria-label={`Import cadangan ${index+1}: ${room.name}`} checked={!excluded.includes(index)} disabled={disabled} onChange={event=>onChange(event.target.checked?excluded.filter(item=>item!==index):[...excluded,index])}/><span>{room.name}</span></label>)}</div>
  </div>;
}
