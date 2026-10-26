import React,{useRef,useState} from 'react';
import {Hand,Maximize,ZoomIn,ZoomOut,Ruler} from 'lucide-react';
import PlanCanvas from './PlanCanvas.jsx';

export default function PlanViewport({onSaveScale,...props}) {
  const [zoom,setZoom]=useState(100),[calibrating,setCalibrating]=useState(false),[points,setPoints]=useState([]);
  const [distance,setDistance]=useState(''),[unit,setUnit]=useState('mm'),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [panning,setPanning]=useState(false);
  const scroll=useRef(null),saving=useRef(false);
  const pan=useRef(null);
  const {plan,disabled}=props;
  function changeZoom(value) {
    const next=Math.max(25,Math.min(400,value));if(disabled || next===zoom)return;
    const box=scroll.current,ratio=next/zoom;
    const left=(box.scrollLeft+box.clientWidth/2)*ratio-box.clientWidth/2,top=(box.scrollTop+box.clientHeight/2)*ratio-box.clientHeight/2;
    setZoom(next);requestAnimationFrame(()=>{box.scrollLeft=left;box.scrollTop=top;});
  }
  function begin() {
    setPanning(false);setCalibrating(true);setPoints(plan.scale?[plan.scale.start,plan.scale.end]:[]);setDistance(plan.scale?String(plan.scale.distanceM*1000):'');setUnit('mm');setError('');setMessage('');
  }
  function click(event) {
    if(!calibrating)return panning?undefined:props.onAddRoom(event);
    if(disabled)return;
    const box=event.currentTarget.getBoundingClientRect();
    const point={x:Math.max(0,Math.min(100,(event.clientX-box.left)/box.width*100)),y:Math.max(0,Math.min(100,(event.clientY-box.top)/box.height*100))};
    setPoints(current=>current.length===1?[current[0],point]:[point]);setError('');
  }
  function startPan(event) {
    if(!panning || calibrating || disabled || event.button!==0 || event.isPrimary===false)return;
    event.preventDefault();pan.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:scroll.current.scrollLeft,top:scroll.current.scrollTop};event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePan(event) {const g=pan.current;if(!g || g.id!==event.pointerId)return;event.preventDefault();scroll.current.scrollLeft=g.left-event.clientX+g.x;scroll.current.scrollTop=g.top-event.clientY+g.y;}
  function endPan(event) {if(pan.current?.id!==event.pointerId)return;pan.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
  async function save(clear=false) {
    if(disabled || saving.current)return;
    const distanceM=Number(distance)*(unit==='mm' ? 0.001 : 1);
    if(!clear && (points.length!==2 || !Number.isFinite(distanceM) || distanceM<=0)){setError('Pilih dua titik pada pelan dan masukkan jarak rujukan yang sah.');return;}
    saving.current=true;setError('');
    try {
      await onSaveScale(clear?null:{start:points[0],end:points[1],distanceM});
      setCalibrating(false);setPoints([]);setMessage(clear?'Skala pelan dipadam. Ukuran manual ruang dikekalkan.':'Skala disimpan. Panjang, lebar dan keluasan anggaran kini boleh dikira daripada kotak ruang.');
    } catch(error){setError(error.message);}finally {saving.current=false;}
  }
  const overlay=calibrating?<svg className="calibration-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{points.length===2 && <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y}/>} {points.map((point,i)=><g key={i}><circle cx={point.x} cy={point.y} r="1"/><text x={point.x+1.5} y={point.y-1.5}>{i?'B':'A'}</text></g>)}</svg>:null;
  return <>
    <div className="zoom-toolbar" role="group" aria-label="Zoom dan skala pelan"><div className="button-row"><button type="button" className="button small-button" aria-label="Zoom keluar" disabled={disabled||zoom<=25} onClick={()=>changeZoom(zoom-25)}><ZoomOut size={16}/></button><output aria-label="Tahap zoom">{zoom}%</output><button type="button" className="button small-button" aria-label="Zoom masuk" disabled={disabled||zoom>=400} onClick={()=>changeZoom(zoom+25)}><ZoomIn size={16}/></button><button type="button" className="button small-button" disabled={disabled} onClick={()=>changeZoom(100)}><Maximize size={15}/> Muat lebar</button></div><button type="button" className={`button small-button ${panning?'primary':''}`} disabled={disabled||calibrating} aria-pressed={panning} onClick={()=>setPanning(!panning)}><Hand size={15}/> Alih pandangan</button><button type="button" className="button small-button" disabled={disabled} onClick={()=>calibrating?setCalibrating(false):begin()}><Ruler size={15}/>{calibrating?'Batal skala':'Tetapkan skala'}</button><small>{plan.scale?`Skala rujukan ${plan.scale.distanceM.toFixed(3)} m tersedia.`:'Tetapkan skala untuk ukuran daripada pelan, atau isi ukuran ruang secara manual.'} Pada zoom besar, skrol untuk mengalih pandangan.</small></div>
    {calibrating && <div className="calibration-panel"><strong>Tentukan skala pelan</strong><p>Pilih dua hujung garisan yang diketahui ukurannya pada drawing, kemudian isi jarak sebenar. Contoh 3300 mm = 3.3 m. Gunakan pelan tanpa herotan perspektif.</p><p role="status">{points.length===0?'Klik titik mula A pada pelan.':points.length===1?'Klik titik hujung B pada pelan.':'Dua titik dipilih. Masukkan jarak dan simpan skala.'}</p><div className="calibration-fields"><label>Jarak rujukan<input type="number" step="any" min="0" value={distance} disabled={disabled} placeholder="3300" onChange={event=>setDistance(event.target.value)}/></label><label>Unit jarak rujukan<select value={unit} disabled={disabled} onChange={event=>setUnit(event.target.value)}><option value="mm">mm</option><option value="m">m</option></select></label></div><div className="button-row"><button type="button" className="button primary small-button" disabled={disabled} onClick={()=>save()}>Simpan skala</button><button type="button" className="button small-button" disabled={disabled} onClick={()=>setPoints([])}>Pilih semula titik</button>{plan.scale && <button type="button" className="button small-button danger" disabled={disabled} onClick={()=>save(true)}>Padam skala</button>}</div></div>}
    {error && <div role="alert" className="alert error scale-feedback">{error}</div>}{message && <p role="status" className="scale-feedback">{message}</p>}
    <div className={`plan-scroll ${panning?'panning':''}`} ref={scroll} tabIndex={0} aria-label="Paparan pelan boleh diskrol" onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan}><PlanCanvas {...props} zoom={zoom} calibrating={calibrating} panning={panning} onAddRoom={click} overlay={overlay}/></div>
  </>;
}
