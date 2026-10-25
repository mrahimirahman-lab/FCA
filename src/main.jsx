import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowRight, Building2, Camera, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, Download, FileImage, FileText, FolderOpen, Layers3, LoaderCircle, MapPinned, Plus, ScanLine, Search, ShieldCheck, Sparkles, Trash2, Upload, X } from 'lucide-react';
import './style.css';
import { projectSchema } from '../server/domain.js';

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(`/api${url}`, { ...options, headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers }, body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' || error.name === 'AbortError' ? 'Permintaan mengambil masa terlalu lama. Semak senarai projek sebelum mencuba semula.' : 'Tidak dapat menghubungi pelayan FCA. Pastikan aplikasi masih berjalan, kemudian cuba semula.');
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('Respons pelayan tidak dapat dibaca. Mulakan semula aplikasi dan cuba lagi.'); }
  if (!response.ok) throw Object.assign(new Error(result?.error || 'Permintaan gagal.'), { status:response.status });
  return result;
}
const emptyInspection = { componentCodes: null, roomId: '', photoId: '', damageType: '', description: '', remedial: '', severity: 'Sederhana', reviewed: false, inspector: '' };
const date = value => new Date(value).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
const severityClass = value => ({ Rendah: 'green', Sederhana: 'amber', Tinggi: 'red', Kritikal: 'red' })[value];
const roomCode = room => room?.code || '';
const ahuCodes = ['33','25','13','11','00','00','00'];

function App() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState('overview');
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [newProject, setNewProject] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [projectConflict, setProjectConflict] = useState(null);
  const [projectForm, setProjectForm] = useState({ name: '', building: 'D', floor: 'B1' });
  const [roomId, setRoomId] = useState('');
  const [roomDraft, setRoomDraft] = useState(null);
  const [addingRoom, setAddingRoom] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [search, setSearch] = useState('');
  const [inspection, setInspection] = useState({ ...emptyInspection });
  const [photo, setPhoto] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [reportFilter, setReportFilter] = useState('all');
  const fileRef = useRef();
  const photoRef = useRef();
  const cameraRef = useRef();
  const pdfTask = useRef(null);
  const projectRequest = useRef(false);
  const project = projects.find(p => p.id === projectId);
  const selectedRoom = project?.rooms.find(r => r.id === roomId);
  const records = project?.inspections || [];
  const filteredRecords = records.filter(i => reportFilter === 'all' || (reportFilter === 'reviewed' ? i.reviewed : !i.reviewed));
  const rooms = project?.rooms || [];
  const reviewedRooms = rooms.filter(r => r.reviewed).length;

  useEffect(() => {
    Promise.all([api('/projects'), api('/health')]).then(([p,h]) => { setProjects(p); setProjectId(p[0]?.id || ''); setHealth(h); }).catch(e => setError(e.message));
    return () => { pdfTask.current?.destroy(); };
  }, []);
  useEffect(() => { setRoomDraft(selectedRoom ? structuredClone(selectedRoom) : null); }, [roomId, selectedRoom]);

  function updateProject(p) { setProjects(list => list.map(item => item.id === p.id ? p : item)); }
  async function run(name, action) { if (busy) return; setBusy(name); setError(''); try { await action(); } catch(e) { setError(e.message); } finally { setBusy(''); } }
  function activateProject(id) {
    const oldPdf=pdfTask.current;pdfTask.current=null;
    if (oldPdf) void oldPdf.destroy().catch(()=>{});
    setProjectId(id); setRoomId(''); setSuggestions(null); setPdf(null); setPhoto(null); setAnalysis(null); setInspection({ ...emptyInspection }); setSearch(''); setAddingRoom(false);
  }
  function chooseProject(id) {
    if (id === projectId) return true;
    if ((photo || inspection.description) && !window.confirm('Tukar projek dan kosongkan borang pemeriksaan yang belum disimpan?')) return false;
    activateProject(id);return true;
  }
  function openNewProject() { setProjectError('');setProjectConflict(null);setError('');setNewProject(true); }
  function editProjectForm(key,value) { setProjectForm(current=>({...current,[key]:value}));setProjectError('');setProjectConflict(null); }
  async function createProject(event) {
    event.preventDefault();
    if (projectRequest.current || busy) return;
    setProjectError('');setProjectConflict(null);
    const parsed=projectSchema.safeParse(projectForm);
    if (!parsed.success) { setProjectError(parsed.error.issues[0].message);return; }
    const input=parsed.data;
    const existing=projects.find(p=>p.building===input.building && p.floor===input.floor);
    if (existing) {setProjectError(`Blok ${input.building}, aras ${input.floor} sudah mempunyai projek. Buka projek sedia ada untuk meneruskan pendaftaran ruang atau pemeriksaan.`);setProjectConflict(existing);return;}
    if ((photo || inspection.description) && !window.confirm('Cipta projek baharu dan kosongkan borang pemeriksaan yang belum disimpan?')) return;
    projectRequest.current=true;setBusy('project');setError('');
    try {
      const p=await api('/projects',{method:'POST',body:input,signal:AbortSignal.timeout(15000)});
      if (!p?.id || !Array.isArray(p.rooms) || !Array.isArray(p.inspections)) throw new Error('Maklumat projek daripada pelayan tidak lengkap. Semak senarai projek dan cuba lagi.');
      setProjects(list=>[...list.filter(item=>item.id!==p.id),p]);
      activateProject(p.id);setNewProject(false);setProjectForm({name:'',building:'D',floor:'B1'});setTab('plan');
    } catch(error) {
      setProjectError(error.message);
      if (error.status===409) {
        try { const latest=await api('/projects',{signal:AbortSignal.timeout(10000)});setProjects(latest);setProjectConflict(latest.find(p=>p.building===input.building && p.floor===input.floor)||null); } catch { /* Keep the original error visible and the form intact. */ }
      }
    } finally {projectRequest.current=false;setBusy('');}
  }
  async function uploadImage(file) { const form = new FormData(); form.append('image', file); return api('/uploads', { method: 'POST', body: form }); }
  async function savePlan(file) { const image = await uploadImage(file); const p = await api(`/projects/${projectId}/plan`, { method: 'PUT', body: { photoId: image.id } }); updateProject(p); setSuggestions(null); }
  async function renderPdf(document, pageNumber) {
    const page = await document.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2400 / Math.max(base.width, base.height), 3);
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Halaman PDF gagal ditukar kepada imej.');
    await savePlan(new File([blob], `pelan-halaman-${pageNumber}.png`, { type: 'image/png' }));
  }
  function handlePlan(file) {
    if (!file) return;
    run(/\.dwg$/i.test(file.name) ? 'cad' : 'plan', async () => {
      if (file.size > 25 * 1024 * 1024) throw new Error('Had saiz pelan ialah 25 MB.');
      if (/\.dwg$/i.test(file.name)) {
        const form=new FormData();form.append('drawing',file);
        const p=await api(`/projects/${projectId}/cad`,{method:'POST',body:form});
        updateProject(p);setSuggestions(null);pdfTask.current?.destroy();pdfTask.current=null;setPdf(null);
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const lib = await import('pdfjs-dist');
        lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
        const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
        task.onPassword = () => { task.destroy(); };
        let document;
        try { document = await task.promise; } catch { throw new Error('PDF tidak dapat dibuka. Gunakan PDF tanpa kata laluan atau muat naik gambar.'); }
        try { await renderPdf(document, 1); } catch(e) { await task.destroy(); throw e; }
        pdfTask.current?.destroy(); pdfTask.current = task;
        setPdf({ document, name: file.name, pages: document.numPages }); setPdfPage(1);
      } else { await savePlan(file); pdfTask.current?.destroy(); pdfTask.current = null; setPdf(null); }
    });
  }
  function addRoom(event) {
    if (!addingRoom || busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(85, (event.clientX - rect.left) / rect.width * 100 - 7.5));
    const y = Math.max(0, Math.min(85, (event.clientY - rect.top) / rect.height * 100 - 7.5));
    run('room', async () => {
      const p = await api(`/projects/${projectId}/rooms`, { method: 'POST', body: { rooms: [{ name: `Ruang ${rooms.length + 1}`, bounds: { x, y, width: 15, height: 15 }, source: 'manual' }] } });
      updateProject(p); setRoomId(p.rooms.at(-1).id); setAddingRoom(false);
    });
  }
  function selectInspection(record) {
    if ((photo || inspection.description) && !window.confirm('Buka rekod dan kosongkan borang yang belum disimpan?')) return;
    setInspection({ ...record }); setPhoto({ id: record.photoId, url: `/uploads/${record.photoId}.png` }); setAnalysis(null); setTab('inspection');
  }
  function exportCsv() {
    const rows = [['Kod lokasi','Kod DAK lengkap','Ruang','Jenis kerosakan','Deskripsi','Kerja pembaikan','Keutamaan','Status','Pemeriksa','Tarikh']];
    filteredRecords.forEach(i => { const r = rooms.find(r => r.id === i.roomId); rows.push([roomCode(r), i.assetCode || 'Kod komponen belum ditetapkan', r?.name, i.damageType, i.description, i.remedial, i.severity, i.reviewed ? 'Disahkan pemeriksa' : 'Draf', i.inspector, date(i.createdAt)]); });
    const quote = value => { let s = String(value ?? ''); if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"','""')}"`; };
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `FCA-${project.building}-${project.floor}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const Button = ({ children, className = '', disabled = false, ...props }) => <button className={`button ${className}`} disabled={Boolean(busy) || disabled} {...props}>{children}</button>;
  const navigation = [{ id: 'overview', label: 'Gambaran keseluruhan', icon: Building2 }, { id: 'plan', label: 'Pelan & daftar aset', icon: MapPinned }, { id: 'inspection', label: 'Pemeriksaan', icon: Camera }, { id: 'report', label: 'Laporan', icon: FileText }];

  return <div className="app-shell">
    <aside className="sidebar no-print">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('overview'); }}><span className="brand-symbol"><Layers3 size={23}/></span><span>FCA<span className="brand-sub">BUILDING INTELLIGENCE</span></span></a>
      <div className="workspace-label">RUANG KERJA <span>v0.1</span></div>
      <div className="project-picker"><Building2 size={18}/><select aria-label="Projek aktif" value={projectId} onChange={e => chooseProject(e.target.value)} disabled={Boolean(busy)}>{!projects.length && <option value="">Tiada projek</option>}{projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.floor}</option>)}</select><ChevronDown size={14}/></div>
      <nav>{navigation.map(({ id,label,icon: Icon }) => <button key={id} className={tab === id ? 'nav-item active' : 'nav-item'} onClick={() => setTab(id)} disabled={Boolean(busy)}><Icon size={19}/><span>{label}</span>{id === 'inspection' && records.length > 0 && <span className="nav-count">{records.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="ai-sidebar"><span className={`status-dot ${health?.aiEnabled ? 'enabled' : ''}`}/><span>{health?.aiEnabled ? 'AI dikonfigurasi' : 'Mod pemeriksaan manual'}</span></div><p>Daripada pelan kepada tindakan.<br/>Setiap ruang, setiap pemeriksaan.</p><div className="profile"><span className="avatar">PI</span><div><strong>Pemeriksa bangunan</strong><small>Ruang kerja tempatan</small></div><ShieldCheck size={17}/></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar no-print"><div className="breadcrumb">Ruang kerja <ChevronRight size={14}/><strong>{navigation.find(n => n.id === tab)?.label}</strong></div><div className="topbar-right"><select className="mobile-project-select" aria-label="Tukar projek" disabled={Boolean(busy)} value={projectId} onChange={e => chooseProject(e.target.value)}>{!projects.length && <option value="">Tiada projek</option>}{projects.map(p => <option key={p.id} value={p.id}>{p.building} · {p.floor}</option>)}</select><span className="badge subtle">VERSI AWAL</span><span className="topbar-divider"/><span className="avatar small">PI</span></div></header>
      <main>
        {error && <div role="alert" className="alert error"><span>{error}</span><button aria-label="Tutup mesej" onClick={() => setError('')}><X size={18}/></button></div>}
        {busy && <div role="status" className="working"><LoaderCircle size={16} className="spin"/> {busy === 'ai' ? 'AI sedang menganalisis imej…' : busy === 'cad' ? 'Fail DWG sedang diproses…' : 'Sedang memproses…'}</div>}
        <div className="page-heading no-print"><div><div className="eyebrow">PEMERIKSAAN BANGUNAN, LEBIH TERATUR</div><h1>{tab === 'overview' ? 'Setiap ruang ada ceritanya.' : tab === 'plan' ? 'Pelan & daftar aset' : tab === 'inspection' ? 'Pemeriksaan kerosakan' : 'Laporan pemeriksaan'}</h1><p>{tab === 'overview' ? 'Kenali ruang, rekod keadaan dan rancang pembaikan dalam satu aliran kerja.' : tab === 'plan' ? 'Petakan ruang pada pelan lantai dan bina daftar aset anda.' : tab === 'inspection' ? 'Hubungkan bukti foto dengan ruang dan tindakan pembaikan.' : 'Semak rekod, sahkan dapatan dan eksport hasil pemeriksaan.'}</p></div>{tab === 'overview' ? <Button className="primary" onClick={openNewProject}><Plus size={17}/> Projek baharu</Button> : project && <span className="project-tag"><Building2 size={16}/>{project.building} <span>/</span> {project.floor}</span>}</div>

        {tab === 'overview' && <>
          <section className="hero"><div className="hero-copy"><span className="hero-kicker"><span className="tiny-line"/> DARIPADA PELAN KE PEMBAIKAN</span><h2>Pemeriksaan yang jelas.<br/><em>Keputusan yang lebih baik.</em></h2><p>Satukan pelan lantai, nombor aset dan bukti kerosakan. Bina rekod bangunan yang mudah dirujuk, ruang demi ruang.</p><Button className="cream" onClick={() => project ? setTab('plan') : openNewProject()}>{project ? 'Buka pelan lantai' : 'Mulakan projek pertama'}<ArrowRight size={17}/></Button><div className="hero-foot"><ShieldCheck size={15}/> Dapatan AI disemak oleh pemeriksa</div></div><div className="hero-visual" aria-hidden="true"><div className="drawing-grid"/><div className="plan-drawing"><div className="drawing-room dr1">RUANG 01<span>B01 · L01</span></div><div className="drawing-room dr2">RUANG 02</div><div className="drawing-room dr3">RUANG 03</div><div className="drawing-room dr4">RUANG 04</div><div className="drawing-room dr5">LOBI</div><div className="drawing-room dr6">RUANG 05</div><div className="drawing-scan"/></div><div className="drawing-label"><span className="status-dot enabled"/> PELAN → ASET → PEMERIKSAAN</div><span className="drawing-north">N ↑</span></div></section>
          <div className="stats-grid">{[{ label: 'Projek aras', value: projects.length, icon: Building2, note: 'Bangunan & aras didaftarkan' }, { label: 'Ruang berdaftar', value: rooms.length, icon: MapPinned, note: project ? `${reviewedRooms} ruang telah disemak` : 'Mula dengan pelan lantai' }, { label: 'Rekod pemeriksaan', value: records.length, icon: ClipboardCheck, note: 'Bukti foto & dapatan kerosakan' }, { label: 'Disahkan pemeriksa', value: records.filter(i => i.reviewed).length, icon: CheckCheck, note: 'Sedia untuk rujukan laporan' }].map(({label,value,icon: Icon,note}) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><Icon size={19}/></div><strong>{value.toString().padStart(2,'0')}</strong><small>{note}</small></div>)}</div>
          <div className="section-title"><div><h2>Aliran kerja anda</h2><p>Tiga langkah untuk rekod pemeriksaan yang lengkap.</p></div><span className="text-muted">MULA DI SINI</span></div>
          <div className="workflow-grid">{[{ number: '01', icon: FileImage, title: 'Petakan pelan lantai', text: 'Muat naik DWG, PDF atau gambar. Kenal pasti ruang dengan AI atau tandakan secara manual.', target: 'plan', action: 'Urus pelan' }, { number: '02', icon: ScanLine, title: 'Rekod & analisis kerosakan', text: 'Ambil foto di tapak. Semak jenis kerosakan, deskripsi dan cadangan pembaikan.', target: 'inspection', action: 'Buat pemeriksaan' }, { number: '03', icon: FileText, title: 'Semak & hasilkan laporan', text: 'Sahkan dapatan pemeriksaan. Eksport daftar atau cetak laporan bersama bukti foto.', target: 'report', action: 'Lihat laporan' }].map(({number,icon: Icon,title,text,target,action}) => <button className="workflow-card" key={number} onClick={() => project ? setTab(target) : openNewProject()}><div className="workflow-top"><span className="icon-tile"><Icon size={22}/></span><span className="step-number">{number}</span></div><h3>{title}</h3><p>{text}</p><span className="card-link">{action}<ArrowRight size={15}/></span></button>)}</div>
          <div className="overview-bottom"><div className="panel recent-panel"><div className="panel-heading"><h2>Pemeriksaan terkini</h2><button className="text-button" onClick={() => setTab('report')}>Lihat semua <ArrowRight size={14}/></button></div>{records.length ? records.slice(0,3).map(i => <button className="record-row" key={i.id} onClick={() => selectInspection(i)}><img src={`/uploads/${i.photoId}.png`} alt="Foto kerosakan"/><div><strong>{i.damageType}</strong><small>{roomCode(rooms.find(r => r.id === i.roomId))} · {date(i.createdAt)}</small></div><span className={`badge ${severityClass(i.severity)}`}>{i.severity}</span><ChevronRight size={17}/></button>) : <div className="empty-inline"><ClipboardCheck size={29}/><div><strong>Belum ada rekod pemeriksaan</strong><p>Rekod pertama anda akan dipaparkan di sini.</p></div></div>}</div><div className="tip-card"><span className="tip-label"><CircleHelp size={17}/> NOTA PEMERIKSA</span><h3>Bukti yang baik,<br/>dapatan yang lebih tepat.</h3><p>Ambil satu foto keseluruhan dan satu foto dekat. Pastikan pencahayaan mencukupi serta kerosakan kelihatan jelas.</p></div></div>
        </>}

        {!project && tab !== 'overview' && <div className="panel big-empty"><FolderOpen size={42}/><h2>Cipta projek untuk bermula</h2><p>Daftarkan bangunan dan aras sebelum memuat naik pelan atau pemeriksaan.</p><Button className="primary" onClick={openNewProject}><Plus size={17}/> Projek baharu</Button></div>}

        {project && tab === 'plan' && <>
          <div className="alert info"><CircleHelp size={17}/><span>Kod lokasi ruang: <strong>{project.building} {project.floor} 0001</strong> (blok · aras · ruang). Kod DAK lengkap menambah tujuh peringkat kod komponen pada rekod pemeriksaan.</span></div>
          <div className="plan-layout"><section className="panel plan-panel"><div className="panel-heading"><h2><Layers3 size={18}/> Pelan lantai <span className="badge subtle">{project.floor}</span></h2><div className="button-row"><Button className="small-button" disabled={rooms.length > 0} onClick={() => fileRef.current.click()}><Upload size={15}/>{project.plan ? 'Ganti pelan' : 'Muat naik'}</Button>{project.plan && <Button className={addingRoom ? 'small-button primary' : 'small-button'} onClick={() => setAddingRoom(!addingRoom)}><Plus size={15}/>{addingRoom ? 'Batal tanda' : 'Tambah ruang'}</Button>}</div></div>
            <input hidden ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.dwg" onChange={e => { handlePlan(e.target.files?.[0]); e.target.value = ''; }}/>
            {project.plan?.cad && <><div className="cad-toolbar"><FileImage size={16}/><strong>{project.plan.cad.name}</strong><span className="badge subtle">DWG · MODEL SPACE</span><a className="button small-button" href={`/api/projects/${projectId}/cad/source`}><Download size={14}/> Fail asal</a></div><div className="cad-notice"><CircleHelp size={16}/><span>Paparan 2D hitam putih. Semak pelan sebelum menanda ruang; XREF, objek 3D, hatch, fon SHX dan sesetengah dimensi mungkin tiada atau berbeza. {project.plan.cad.skipped > 0 && `${project.plan.cad.skipped} objek tidak disertakan dalam paparan.`}</span></div></>}
            {pdf && <div className="pdf-toolbar"><FileText size={15}/><span>{pdf.name}</span><label>Halaman <select aria-label="Halaman PDF" disabled={Boolean(busy) || rooms.length > 0} value={pdfPage} onChange={e => { const value = Number(e.target.value); run('plan', async () => { await renderPdf(pdf.document,value); setPdfPage(value); }); }}>{Array.from({length: pdf.pages},(_,i) => <option key={i+1}>{i+1}</option>)}</select> / {pdf.pages}</label></div>}
            {project.plan ? <div className={`plan-stage ${addingRoom ? 'adding' : ''}`} onClick={addRoom}><img src={project.plan.url} alt={`Pelan lantai ${project.floor}`}/>{rooms.map(r => <button key={r.id} className={`room-bound ${roomId === r.id ? 'selected' : ''} ${!r.reviewed ? 'unreviewed' : ''}`} style={{ left: `${r.bounds.x}%`, top: `${r.bounds.y}%`, width: `${r.bounds.width}%`, height: `${r.bounds.height}%` }} onClick={e => { if (addingRoom) return; e.stopPropagation(); setRoomId(r.id); }} aria-label={`Pilih ${r.name}`}><span>{r.number}</span></button>)}</div> : <button className="upload-zone" disabled={Boolean(busy)} onClick={() => fileRef.current.click()}><span className="upload-circle"><Upload size={28}/></span><h3>Mulakan dengan pelan lantai</h3><p>Klik untuk memuat naik DWG, PDF, JPG atau PNG</p><small>DWG / PDF maksimum 25 MB · Imej maksimum 20 MB</small><span className="button primary">Pilih fail <ArrowRight size={15}/></span></button>}
            <div className="plan-footer"><span><span className="legend-box"/> Ruang disemak <span className="legend-box amber-box"/> Perlu semakan</span><small>{addingRoom ? 'Klik pada pelan untuk menambah ruang.' : rooms.length ? 'Klik ruang untuk mengubah nama atau sempadannya.' : 'Pilih satu halaman bagi setiap projek aras.'}</small></div>
            {project.plan && <div className="ai-plan-bar"><div><Sparkles size={20}/><span><strong>Kenal pasti ruang dengan AI</strong><small>AI mencadangkan label dan sempadan untuk semakan anda.</small></span></div><Button className="primary" disabled={!health?.aiEnabled || rooms.length > 0} onClick={() => run('ai', async () => setSuggestions(await api(`/projects/${projectId}/analyze/plan`, { method: 'POST', body: {} }))) }><Sparkles size={15}/> Analisis pelan</Button></div>}
          </section><aside className="panel room-panel"><div className="panel-heading"><h2>Daftar ruang <span className="count-pill">{rooms.length}</span></h2></div><div className="room-search"><Search size={16}/><input aria-label="Cari ruang" placeholder="Cari nama atau kod ruang…" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="room-list">{rooms.filter(r => `${r.name} ${r.code}`.toLowerCase().includes(search.toLowerCase())).map(r => <button key={r.id} className={`room-row ${r.id === roomId ? 'selected' : ''}`} onClick={() => setRoomId(r.id)}><span className="room-number">{r.number}</span><span><strong>{r.name}</strong><small>{roomCode(r)}</small></span>{r.reviewed ? <Check size={15} className="green-text"/> : <span className="status-dot"/>}</button>)}{!rooms.length && <div className="empty-rooms"><MapPinned size={29}/><p>Ruang akan disenaraikan di sini.</p><small>Tambah secara manual atau gunakan analisis AI.</small></div>}</div>
            {roomDraft && <form className="room-editor" onSubmit={e => { e.preventDefault(); run('room', async () => updateProject(await api(`/projects/${projectId}/rooms/${roomId}`, { method: 'PATCH', body: roomDraft }))); }}><h3>Butiran ruang</h3><label>Kod ruang (4 digit)<input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="0002" value={roomDraft.number} onChange={e => setRoomDraft({...roomDraft,number:e.target.value})}/><small className="text-muted">Kod lokasi: {project.building} {project.floor} {roomDraft.number}</small></label><label style={{marginTop:14}}>Nama ruang<input required value={roomDraft.name} onChange={e => setRoomDraft({...roomDraft,name:e.target.value})}/></label><div className="coordinate-grid">{['x','y','width','height'].map(key => <label key={key}>{({x:'Kiri (%)',y:'Atas (%)',width:'Lebar (%)',height:'Tinggi (%)'})[key]}<input type="number" step="any" min={key === 'width' || key === 'height' ? 0.1 : 0} max="100" required value={roomDraft.bounds[key]} onChange={e => setRoomDraft({...roomDraft,bounds:{...roomDraft.bounds,[key]: Number(e.target.value)}})}/></label>)}</div><label className="checkbox"><input type="checkbox" checked={roomDraft.reviewed} onChange={e => setRoomDraft({...roomDraft,reviewed:e.target.checked})}/> Label dan sempadan telah disemak</label><div className="button-row"><Button className="primary small-button" type="submit"><Check size={15}/> Simpan</Button><Button type="button" className="small-button danger" onClick={() => { if (window.confirm('Padam ruang ini? Nombor aset tidak akan digunakan semula.')) run('room',async () => { updateProject(await api(`/projects/${projectId}/rooms/${roomId}`, {method:'DELETE'})); setRoomId(''); }); }}><Trash2 size={15}/></Button></div></form>}
          </aside></div>
          {suggestions && <section className="panel suggestions"><div className="panel-heading"><h2><Sparkles size={18}/> Cadangan AI · {suggestions.rooms.length} ruang</h2><Button className="small-button" onClick={() => setSuggestions(null)}>Tutup</Button></div><p>{suggestions.notes}</p><div className="suggestion-chips">{suggestions.rooms.map((r,i) => <span className="badge subtle" key={i}>{r.name}</span>)}</div><p className="text-muted">Import sekali, kemudian semak nama dan sempadan setiap ruang pada pelan. Cadangan belum dianggap disahkan.</p><Button className="primary" disabled={!suggestions.rooms.length || rooms.length > 0} onClick={() => run('room', async () => { const p = await api(`/projects/${projectId}/rooms`, {method:'POST',body:{rooms:suggestions.rooms.map(r => ({name:r.name,bounds:r.bounds,source:'ai'}))}}); updateProject(p); setSuggestions(null); setRoomId(p.rooms[0]?.id || ''); })}>Import untuk semakan <ArrowRight size={16}/></Button></section>}
          {!health?.aiEnabled && <AiNotice/>}
        </>}

        {project && tab === 'inspection' && <>
          {!rooms.length ? <div className="panel big-empty"><MapPinned size={40}/><h2>Daftarkan ruang terlebih dahulu</h2><p>Setiap kerosakan perlu dipautkan kepada satu ruang dan nombor aset.</p><Button className="primary" onClick={() => setTab('plan')}>Buka pelan & daftar aset <ArrowRight size={16}/></Button></div> : <form className="inspection-layout" onSubmit={e => { e.preventDefault(); run('save', async () => { const p = await api(`/projects/${projectId}/inspections${inspection.id ? `/${inspection.id}` : ''}`, { method: inspection.id ? 'PATCH' : 'POST', body: inspection }); updateProject(p); setPhoto(null); setAnalysis(null); setInspection({...emptyInspection}); setTab('report'); }); }}>
            <div><section className="panel photo-panel"><div className="panel-heading"><h2><Camera size={19}/> Bukti foto</h2><span className="badge subtle">{inspection.id ? 'EDIT REKOD' : 'REKOD BAHARU'}</span></div><div className="field-padding"><label>Ruang / nombor aset<select required value={inspection.roomId} onChange={e => { setInspection({...inspection,roomId:e.target.value,reviewed:false}); setAnalysis(null); }}><option value="">Pilih ruang pemeriksaan</option>{rooms.map(r => <option key={r.id} value={r.id}>{roomCode(r)} — {r.name}</option>)}</select></label></div>
              {photo ? <div className="photo-preview"><img src={photo.url} alt="Bukti foto pemeriksaan"/></div> : <div className="photo-empty"><Camera size={42}/><h3>Gambar yang jelas, rekod yang tepat.</h3><p>Ambil gambar kerosakan atau pilih gambar sedia ada.</p></div>}
              <div className="photo-actions"><Button type="button" onClick={() => cameraRef.current.click()}><Camera size={16}/> Ambil gambar</Button><Button type="button" onClick={() => photoRef.current.click()}><Upload size={16}/> Pilih gambar</Button></div>
              {[{ref: photoRef, capture:undefined},{ref:cameraRef,capture:'environment'}].map((item,index) => <input key={index} hidden ref={item.ref} type="file" accept="image/jpeg,image/png,image/webp" capture={item.capture} onChange={e => { const file = e.target.files?.[0]; e.target.value=''; if (file) run('photo',async () => { const image = await uploadImage(file); setPhoto(image); setAnalysis(null); setInspection(current => ({...emptyInspection,roomId:current.roomId,photoId:image.id})); }); }}/>) }
              <div className="photo-tip"><CircleHelp size={16}/><span>Pastikan kerosakan berada dalam fokus. Sokongan kamera bergantung pada peranti dan pelayar.</span></div>
            </section><div className="ai-inspection-box"><div><Sparkles size={20}/><h3>Dapatkan cadangan awal AI</h3></div><p>AI menilai foto dan menyediakan draf dapatan untuk semakan pemeriksa.</p><Button type="button" className="primary" disabled={!photo || !inspection.roomId || !health?.aiEnabled} onClick={() => run('ai',async () => { const result = await api(`/projects/${projectId}/analyze/damage`, {method:'POST',body:{photoId:photo.id,roomId:inspection.roomId}}); setAnalysis(result); setInspection(current => ({...current,damageType:result.damageType,description:result.description,remedial:result.remedial,severity:result.severity,reviewed:false})); })}><Sparkles size={16}/> Analisis kerosakan</Button></div></div>
            <section className="panel findings-panel"><div className="panel-heading"><h2>Dapatan pemeriksaan</h2><span className="badge amber">{inspection.reviewed ? 'DISEMAK' : 'DRAF'}</span></div><div className="findings-body">{analysis && <div className="alert info"><Sparkles size={17}/><span>{analysis.limitations}<br/><small>Cadangan AI perlu disemak di tapak oleh pemeriksa.</small></span></div>}<label>Jenis kerosakan<input required placeholder="Contoh: Retak pada dinding" value={inspection.damageType} onChange={e => setInspection({...inspection,damageType:e.target.value,reviewed:false})}/></label><label>Deskripsi kerosakan<textarea required rows="4" placeholder="Nyatakan keadaan yang kelihatan, lokasi dan keluasan yang telah diukur…" value={inspection.description} onChange={e => setInspection({...inspection,description:e.target.value,reviewed:false})}/></label><label>Cadangan kerja pembaikan <span className="label-hint">REMEDIAL WORK</span><textarea required rows="4" placeholder="Nyatakan pemeriksaan lanjut dan tindakan pembaikan yang sesuai…" value={inspection.remedial} onChange={e => setInspection({...inspection,remedial:e.target.value,reviewed:false})}/></label><section className="dak-section"><h3>Kod komponen DAK</h3><p>DAK lengkap = kod lokasi ruang + tujuh peringkat komponen.</p><label>Klasifikasi komponen<select aria-label="Klasifikasi komponen" value={!inspection.componentCodes ? 'none' : inspection.componentCodes.join(' ') === ahuCodes.join(' ') ? 'ahu' : 'manual'} onChange={e => setInspection({...inspection,componentCodes:e.target.value === 'none' ? null : e.target.value === 'ahu' ? [...ahuCodes] : ['','','','','','',''],reviewed:false})}><option value="none">Belum ditetapkan</option><option value="ahu">Contoh rujukan: Customized Indoor AHU</option><option value="manual">Isi tujuh kod secara manual</option></select></label>{inspection.componentCodes && <div className="component-fields">{inspection.componentCodes.map((code,index) => <label key={index}>P{index + 1}<input aria-label={`Kod komponen peringkat ${index + 1}`} required inputMode="numeric" pattern="[0-9]{2}" maxLength={2} value={code} onChange={e => setInspection({...inspection,componentCodes:inspection.componentCodes.map((v,i) => i === index ? e.target.value : v),reviewed:false})}/></label>)}</div>}<div className="dak-preview"><span>{inspection.componentCodes ? 'KOD DAK LENGKAP' : 'KOD LOKASI RUANG'}</span><strong>{roomCode(rooms.find(r => r.id === inspection.roomId)) || 'Pilih ruang'}{inspection.componentCodes ? ` ${inspection.componentCodes.map(c => c || '??').join(' ')}` : ''}</strong></div><small>Pilih contoh AHU hanya untuk komponen yang sepadan. Kod kategori lain mesti dirujuk pada klasifikasi rasmi. 00 bermaksud tidak berkenaan mengikut rujukan.</small></section><div className="field-grid"><label>Keutamaan<select value={inspection.severity} onChange={e => setInspection({...inspection,severity:e.target.value,reviewed:false})}>{['Rendah','Sederhana','Tinggi','Kritikal'].map(s => <option key={s}>{s}</option>)}</select></label><label>Nama pemeriksa<input required={inspection.reviewed} placeholder="Nama pemeriksa" value={inspection.inspector} onChange={e => setInspection({...inspection,inspector:e.target.value})}/></label></div><label className="checkbox review-box"><input type="checkbox" checked={inspection.reviewed} onChange={e => setInspection({...inspection,reviewed:e.target.checked})}/><span>Saya telah menyemak bukti, dapatan dan cadangan tindakan pembaikan.</span></label><Button className="primary full-width" type="submit" disabled={!photo}><ClipboardCheck size={17}/>{inspection.id ? 'Simpan perubahan' : 'Simpan pemeriksaan'}</Button></div></section>
          </form>}
          {!health?.aiEnabled && <AiNotice/>}
        </>}

        {project && tab === 'report' && <section className="panel report-panel"><div className="panel-heading no-print"><h2>{records.length} rekod pemeriksaan</h2><div className="button-row"><select aria-label="Tapis status laporan" value={reportFilter} onChange={e => setReportFilter(e.target.value)}><option value="all">Semua status</option><option value="reviewed">Disahkan pemeriksa</option><option value="draft">Draf sahaja</option></select><Button disabled={!filteredRecords.length} className="small-button" onClick={exportCsv}><Download size={15}/> CSV</Button><Button disabled={!filteredRecords.length} className="primary small-button" onClick={() => window.print()}><FileText size={15}/> Cetak / PDF</Button></div></div><div className="report-heading"><div className="eyebrow">FCA · LAPORAN KEADAAN BANGUNAN</div><h2>{project.name}</h2><p>Bangunan {project.building} · Aras {project.floor} · {filteredRecords.length} rekod · Struktur kod DAK</p></div>{!filteredRecords.length ? <div className="big-empty"><ClipboardCheck size={38}/><h3>Belum ada rekod untuk dipaparkan</h3><p>Mulakan pemeriksaan atau ubah penapis status.</p><Button className="primary" onClick={() => setTab('inspection')}>Buat pemeriksaan <ArrowRight size={16}/></Button></div> : <div className="report-records">{filteredRecords.map(i => { const room = rooms.find(r => r.id === i.roomId); return <article className="report-record" key={i.id}><img src={`/uploads/${i.photoId}.png`} alt={`Bukti ${i.damageType}`}/><div className="report-details"><div className="report-record-top"><span className="asset-mono">{i.assetCode || `${roomCode(room)} (komponen belum ditetapkan)`} · {room?.name}</span><span className={`badge ${severityClass(i.severity)}`}>{i.severity}</span></div><h3>{i.damageType}</h3><dl><dt>Deskripsi</dt><dd>{i.description}</dd><dt>Kerja pembaikan</dt><dd>{i.remedial}</dd></dl><div className="record-meta"><span className={`badge ${i.reviewed ? 'green' : 'amber'}`}>{i.reviewed ? 'Disahkan pemeriksa' : 'Draf — belum disahkan'}</span><span>{i.inspector || 'Pemeriksa belum dinamakan'} · {date(i.createdAt)}</span><button className="text-button no-print" onClick={() => selectInspection(i)}>Semak / edit <ArrowRight size={14}/></button></div></div></article>; })}</div>}<div className="report-disclaimer">Dapatan berdasarkan bukti yang direkodkan. Cadangan AI memerlukan pengesahan pemeriksa dan penilaian lanjut yang bersesuaian. Kod lokasi mengikut struktur blok, aras dan ruang empat digit. Kod DAK lengkap hanya dipaparkan apabila tujuh peringkat kod komponen telah ditetapkan oleh pemeriksa.</div></section>}
        <footer className="page-footer no-print"><span>FCA <span className="footer-dot">·</span> Building Condition Assessment</span><span>Direka untuk pemeriksaan yang lebih teratur.</span></footer>
      </main>
    </div>
    {newProject && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) setNewProject(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="project-title"><div className="modal-heading"><span className="icon-tile"><Building2 size={23}/></span><button aria-label="Tutup" onClick={() => setNewProject(false)} disabled={Boolean(busy)}><X size={22}/></button></div><div className="eyebrow">LANGKAH PERTAMA</div><h2 id="project-title">Daftarkan projek anda.</h2><p>Satu projek mewakili satu pelan bagi satu aras bangunan.</p><form noValidate onSubmit={createProject} aria-busy={busy === 'project'}>{projectError && <div role="alert" className="alert error project-form-error"><span>{projectError}</span></div>}{projectConflict && <button type="button" className="button" disabled={Boolean(busy)} onClick={() => {if (chooseProject(projectConflict.id)) {setNewProject(false);setProjectError('');setProjectConflict(null);setTab('plan');}}}><FolderOpen size={16}/> Buka projek sedia ada</button>}<label>Nama projek<input autoFocus required maxLength={120} placeholder="Contoh: Pemeriksaan Blok Pentadbiran" value={projectForm.name} onChange={e => editProjectForm('name',e.target.value)}/></label><div className="field-grid"><label>Kod blok<input required maxLength={3} pattern="[A-Za-z]{1,3}" placeholder="D" value={projectForm.building} onChange={e => editProjectForm('building',e.target.value)}/></label><label>Kod aras<input required maxLength={2} pattern="([A-Za-z][0-9]|[0-9]{2})" placeholder="B1 atau 04" value={projectForm.floor} onChange={e => editProjectForm('floor',e.target.value)}/></label></div><p className="form-note">Struktur DAK: kod blok (1–3 huruf), aras (B1 atau 04) dan ruang (4 digit). Tujuh peringkat kod komponen ditambah semasa pemeriksaan.</p><Button className="primary full-width" type="submit">{busy === 'project' ? <><LoaderCircle size={17} className="spin"/> Menyimpan projek…</> : <>Cipta projek <ArrowRight size={17}/></>}</Button></form></section></div>}
  </div>;
}

function AiNotice() { return <div className="ai-notice"><Sparkles size={20}/><div><strong>Analisis AI belum diaktifkan</strong><p>Fungsi manual sudah tersedia. Pentadbir perlu menetapkan kunci penyedia AI pada pelayan untuk mengaktifkan analisis imej. Foto dihantar kepada penyedia hanya apabila analisis dimulakan.</p></div></div>; }

createRoot(document.getElementById('root')).render(<App/>);
