import React,{useEffect,useRef,useState} from 'react';

export default function RoomDeletionDialog({rooms,protectedIds,dirty,onDelete,onClose}) {
  const dialog=useRef(null),cancel=useRef(null),request=useRef(false);
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const locked=rooms.filter(room=>protectedIds.has(room.id));
  useEffect(()=>{
    const previous=document.activeElement;
    cancel.current.focus();
    return ()=>{if(previous?.isConnected && previous!==document.body)previous.focus({preventScroll:true});else document.querySelector('.room-panel h2')?.focus({preventScroll:true});};
  },[]);
  async function confirm() {
    if(request.current || locked.length)return;
    request.current=true;setPending(true);setError('');
    try {await onDelete();}catch(error){setError(error.message);}
    finally {request.current=false;setPending(false);}
  }
  function keyboard(event) {
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!pending)onClose();}
    if(event.key==='Tab') {
      const buttons=[...dialog.current.querySelectorAll('button:not(:disabled)')];
      const first=buttons[0],last=buttons.at(-1);
      if(!first){event.preventDefault();return;}
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    }
  }
  return <div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget && !pending)onClose();}}>
    <section ref={dialog} className="modal room-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-room-title" aria-describedby="delete-room-description" aria-busy={pending} onKeyDown={keyboard}>
      <h2 id="delete-room-title">Padam {rooms.length} ruang?</h2>
      <p id="delete-room-description">Semak pilihan di bawah. Pemadaman tidak boleh dibatalkan dan nombor aset tidak akan digunakan semula.</p>
      <ul className="delete-room-list">{rooms.map(room=><li key={room.id}><strong>{room.name}</strong><small>{room.code}{protectedIds.has(room.id)?' · Mempunyai pemeriksaan':''}</small></li>)}</ul>
      {dirty && <p>Perubahan yang belum disimpan pada ruang pilihan juga akan dibuang.</p>}
      {locked.length>0 && <div role="alert" className="alert error">Ruang yang mempunyai rekod pemeriksaan dilindungi. Batalkan dan keluarkan ruang tersebut daripada pilihan.</div>}
      {error && <div role="alert" className="alert error">{error}</div>}
      <div className="button-row"><button ref={cancel} type="button" className="button" disabled={pending} onClick={onClose}>Batal</button><button type="button" className="button danger" disabled={pending || locked.length>0} onClick={confirm}>{pending?'Memadam…':`Ya, padam ${rooms.length} ruang`}</button></div>
    </section>
  </div>;
}
