import React from 'react';
import {roomMeasurements} from '../server/measurements.js';

const format=value=>Number(value).toLocaleString('ms-MY',{minimumFractionDigits:2,maximumFractionDigits:2});

export function RoomMeasurements({room,plan}) {
  const measured=roomMeasurements(room,plan);
  return <div className="room-measure-summary"><p>Ukuran ruang semasa</p>{measured?<p>Panjang {format(measured.lengthM)} m · Lebar {format(measured.widthM)} m · Keluasan {format(measured.areaM2)} m²<br/><small>{measured.source==='manual'?'Ukuran manual pemeriksa':'Anggaran kotak daripada skala pelan'}</small></p>:<p>Ukuran belum direkodkan</p>}</div>;
}

export default function RoomDimensions({room,plan,disabled,onChange}) {
  const measured=roomMeasurements(room,plan),manual=room.dimensions!=null;
  function edit(key,value) {
    const dimensions=room.dimensions||{lengthM:measured?.lengthM??'',widthM:measured?.widthM??''};
    onChange({...dimensions,[key]:value===''?'':Number(value)});
  }
  return <fieldset className="dimension-fields" disabled={disabled}><legend>Ukuran ruang</legend><div className="field-grid">{[['lengthM','Panjang (m)'],['widthM','Lebar (m)']].map(([key,label])=><label key={key}>{label}<input type="number" min="0.000001" step="any" max="10000" placeholder="Belum ditetapkan" value={manual?room.dimensions[key]:measured?Number(measured[key].toFixed(4)):''} onChange={event=>edit(key,event.target.value)}/></label>)}</div><div className="area-display"><span>Keluasan (m²)</span><output aria-label="Keluasan ruang">{measured?format(measured.areaM2):'—'}</output></div><p>{manual?'Ukuran manual pemeriksa. Saiz kotak boleh dilaras tanpa mengubah ukuran manual ini.':measured?'Anggaran daripada skala pelan. Panjang ialah sisi terpanjang kotak, lebar sisi terpendek.':'Masukkan panjang dan lebar yang diketahui, atau tetapkan skala pelan dahulu.'} Keluasan ini bagi ruang segi empat.</p>{manual && <button type="button" className="text-button" onClick={()=>onChange(null)}>{plan.scale?'Guna ukuran pelan':'Kosongkan ukuran manual'}</button>}</fieldset>;
}
