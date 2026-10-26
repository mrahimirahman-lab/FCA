import React from 'react';

export const materialFields=[
  {key:'wall',label:'Material dinding',options:['Bata berlepa','Konkrit','Papan gipsum','Kaca','Kayu','Panel logam']},
  {key:'floor',label:'Material lantai',options:['Jubin seramik','Jubin porselin','Konkrit','Vinil','Kayu','Karpet','Batu semula jadi']},
  {key:'ceiling',label:'Material siling',options:['Papan gipsum','Papan gentian mineral','Konkrit terdedah','Logam','PVC','Kayu']},
];

export function MaterialFields({materials,onChange,disabled}) {
  return <fieldset className="materials-fields" disabled={disabled}><legend>Material ruang</legend><p>Pilih cadangan atau taip jenis material dan kemasan yang diperiksa. Boleh diisi kemudian.</p>{materialFields.map(({key,label,options})=><label key={key}>{label}<input list={`materials-${key}`} maxLength={200} placeholder="Pilih atau taip material…" value={materials?.[key]||''} onChange={event=>onChange({...materials,[key]:event.target.value})}/><datalist id={`materials-${key}`}>{options.map(option=><option value={option} key={option}/>)}</datalist></label>)}</fieldset>;
}

export function RoomMaterials({room}) {
  return <div className="room-material-summary"><p>Material ruang semasa</p><dl>{materialFields.map(({key,label})=><React.Fragment key={key}><dt>{label}</dt><dd>{room?.materials?.[key]||'Belum direkodkan'}</dd></React.Fragment>)}</dl></div>;
}
