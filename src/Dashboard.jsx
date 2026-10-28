import React, { useState } from 'react';
import { ArrowRight, Building2, Camera, Check, CheckCheck, ChevronRight, ClipboardCheck, Clock3, FileImage, FileText, FolderOpen, Layers3, MapPinned, Search, ShieldCheck } from 'lucide-react';
import './dashboard.css';

const formatDate = value => new Date(value).toLocaleDateString('ms-MY', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur',
});

export default function Dashboard({ projects, project, disabled, onNewProject, onNavigate, onOpenProject, onSelectInspection }) {
  const [query, setQuery] = useState('');
  const rooms = project?.rooms || [];
  const records = project?.inspections || [];
  const reviewedRooms = rooms.filter(room => room.reviewed).length;
  const reviewed = records.filter(record => record.reviewed).length;
  const drafts = records.length - reviewed;
  const visibleProjects = projects.filter(item => `${item.name} ${item.building} ${item.floor}`.toLocaleLowerCase('ms-MY').includes(query.trim().toLocaleLowerCase('ms-MY')));
  const latest = [...records].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
  const next = !project?.plan ? { label: 'Muat naik pelan', target: 'plan' }
    : !rooms.length ? { label: 'Daftarkan ruang', target: 'plan' }
      : drafts ? { label: 'Semak draf pemeriksaan', target: 'report', filter: 'draft' }
        : { label: 'Mulakan pemeriksaan', target: 'inspection' };
  const steps = [
    { icon: FileImage, label: 'Pelan lantai', detail: project?.plan ? 'Pelan tersedia' : 'Belum dimuat naik', done: Boolean(project?.plan), target: 'plan' },
    { icon: MapPinned, label: 'Semakan ruang', detail: rooms.length ? `${reviewedRooms} / ${rooms.length} ruang disemak` : 'Belum ada ruang', done: rooms.length > 0 && reviewedRooms === rooms.length, target: 'plan' },
    { icon: ShieldCheck, label: 'Pengesahan rekod', detail: records.length ? `${reviewed} / ${records.length} rekod disahkan` : 'Belum ada pemeriksaan', done: records.length > 0 && reviewed === records.length, target: 'report' },
  ];
  const stats = [
    { label: 'Ruang berdaftar', value: rooms.length, note: `${reviewedRooms} ruang telah disemak`, icon: MapPinned, target: 'plan', name: 'Lihat ruang berdaftar', tone: 'forest' },
    { label: 'Rekod pemeriksaan', value: records.length, note: 'Bukti foto dan dapatan', icon: ClipboardCheck, target: 'report', filter: 'all', name: 'Lihat semua rekod pemeriksaan', tone: 'blue' },
    { label: 'Menunggu pengesahan', value: drafts, note: drafts ? 'Draf untuk semakan pemeriksa' : 'Tiada draf menunggu semakan', icon: Clock3, target: 'report', filter: 'draft', name: 'Lihat pemeriksaan draf', tone: 'amber' },
    { label: 'Disahkan pemeriksa', value: reviewed, note: 'Rekod yang telah disemak', icon: CheckCheck, target: 'report', filter: 'reviewed', name: 'Lihat pemeriksaan disahkan', tone: 'forest' },
  ];

  return <div className="dashboard">
    <section className={`dashboard-summary ${project ? '' : 'first-project'}`} aria-labelledby="active-project-title">
      <div className="dashboard-summary-copy">
        <div className="dashboard-kicker"><span className="dashboard-live-dot"/>{project ? 'PROJEK AKTIF' : 'SELAMAT DATANG KE FCA'}</div>
        <h2 id="active-project-title">{project?.name || 'Mulakan rekod bangunan anda.'}</h2>
        {project ? <><p className="dashboard-location"><Building2 size={16}/> Blok {project.building}<span/> Aras {project.floor}</p>
          <p className="dashboard-summary-description">{drafts ? `${drafts} rekod pemeriksaan menunggu pengesahan anda.` : rooms.length ? 'Pelan, daftar ruang dan rekod pemeriksaan dalam satu ruang kerja.' : 'Sediakan pelan dan daftarkan ruang untuk memulakan pemeriksaan.'}</p></>
          : <p className="dashboard-summary-description">Daftarkan bangunan dan aras, petakan ruang pada pelan, kemudian rekod keadaan di tapak.</p>}
        <div className="dashboard-summary-actions">
          <button className="button dashboard-cta" disabled={disabled} onClick={() => project ? onNavigate(next.target, next.filter) : onNewProject()}>{project ? next.label : 'Daftar projek pertama'}<ArrowRight size={17}/></button>
          {project && <button className="dashboard-secondary" disabled={disabled} onClick={() => onNavigate('plan')}>Buka pelan lantai <ChevronRight size={16}/></button>}
        </div>
      </div>
      <div className="dashboard-progress">
        <div className="dashboard-progress-heading"><span>STATUS KERJA</span><Layers3 size={17}/></div>
        {steps.map(({ icon: Icon, label, detail, done, target }, index) => <button key={label} className={`dashboard-step ${done ? 'done' : ''}`} disabled={disabled || !project} onClick={() => onNavigate(target)}>
          <span className="dashboard-step-icon">{done ? <Check size={17}/> : <Icon size={17}/>}</span><span><strong>{label}</strong><small>{detail}</small></span><span className="dashboard-step-index">0{index + 1}</span>
        </button>)}
      </div>
    </section>

    <section className="dashboard-metrics" aria-labelledby="metrics-title">
      <div className="dashboard-section-heading"><div><span className="dashboard-overline">RINGKASAN</span><h2 id="metrics-title">Keadaan projek anda</h2></div><span className="dashboard-scope">{project ? `Blok ${project.building} · Aras ${project.floor}` : 'Belum ada projek aktif'}</span></div>
      <div className="dashboard-stats">{stats.map(({ label, value, note, icon: Icon, target, filter, name, tone }) => <button key={label} className={`dashboard-stat ${tone}`} aria-label={name} disabled={disabled || !project} onClick={() => onNavigate(target, filter)}>
        <span className="dashboard-stat-top"><span>{label}</span><span className="dashboard-stat-icon"><Icon size={19}/></span></span>
        <strong>{value.toLocaleString('ms-MY')}</strong><span className="dashboard-stat-bottom"><small>{note}</small><ArrowRight size={15}/></span>
      </button>)}</div>
    </section>

    <div className="dashboard-columns">
      <section className="dashboard-panel" aria-labelledby="projects-title">
        <div className="dashboard-panel-heading"><div><h2 id="projects-title">Projek anda <span className="dashboard-count">{projects.length}</span></h2><p>Satu projek untuk setiap aras bangunan.</p></div><button className="dashboard-text-button" disabled={disabled} onClick={onNewProject}>Tambah projek <ArrowRight size={15}/></button></div>
        <label className="dashboard-search"><Search size={17}/><input type="search" aria-label="Cari projek" placeholder="Cari nama, blok atau aras…" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <div className="dashboard-project-list">{visibleProjects.map(item => <button key={item.id} className={`dashboard-project ${project?.id === item.id ? 'is-active' : ''}`} aria-label={`Buka projek ${item.name}, blok ${item.building}, aras ${item.floor}`} disabled={disabled} onClick={() => onOpenProject(item.id)}>
          <span className="dashboard-project-icon"><Building2 size={21}/></span><span className="dashboard-project-info"><strong>{item.name}</strong><small>Blok {item.building} <span>·</span> Aras {item.floor} <span>·</span> {item.rooms.length} ruang</small></span>
          <span className={`dashboard-project-status ${item.plan ? 'ready' : ''}`}>{item.plan ? 'Pelan tersedia' : 'Belum ada pelan'}</span><ChevronRight size={17}/>
        </button>)}</div>
        {!projects.length ? <div className="dashboard-empty"><FolderOpen size={31}/><h3>Ruang kerja anda bermula di sini</h3><p>Projek yang didaftarkan akan disenaraikan di sini.</p></div>
          : !visibleProjects.length && <div className="dashboard-empty"><Search size={28}/><h3>Tiada projek sepadan</h3><p>Cuba nama, kod blok atau aras yang lain.</p><button className="dashboard-text-button" onClick={() => setQuery('')}>Kosongkan carian</button></div>}
        {projects.length > 0 && <div className="dashboard-panel-foot">{visibleProjects.length} daripada {projects.length} projek<span>Klik projek untuk membuka pelan <ArrowRight size={13}/></span></div>}
      </section>

      <section className="dashboard-panel" aria-labelledby="recent-title">
        <div className="dashboard-panel-heading"><div><h2 id="recent-title">Pemeriksaan terkini</h2><p>{project ? `Projek aktif · Aras ${project.floor}` : 'Rekod bagi projek aktif'}</p></div><button className="dashboard-text-button" disabled={disabled || !project} onClick={() => onNavigate('report', 'all')}>Lihat semua <ArrowRight size={15}/></button></div>
        {latest.length ? <div>{latest.map(record => <button key={record.id} className="dashboard-record" disabled={disabled} onClick={() => onSelectInspection(record)}>
          <img src={`/uploads/${record.photoId}.png`} alt="Foto kerosakan" loading="lazy"/><span className="dashboard-record-info"><strong>{record.damageType}</strong><small>{rooms.find(room => room.id === record.roomId)?.name || 'Ruang'} · {formatDate(record.createdAt)}</small><span className={`dashboard-review-state ${record.reviewed ? 'reviewed' : ''}`}>{record.reviewed ? <CheckCheck size={12}/> : <Clock3 size={12}/>} {record.reviewed ? 'Disahkan' : 'Menunggu semakan'}</span></span><span className={`dashboard-severity ${['Tinggi', 'Kritikal'].includes(record.severity) ? 'urgent' : ''}`}>{record.severity}</span>
        </button>)}</div> : <div className="dashboard-empty"><ClipboardCheck size={33}/><h3>Belum ada pemeriksaan</h3><p>Foto dan dapatan bagi projek aktif akan dipaparkan di sini.</p><button className="dashboard-text-button" disabled={disabled || !project} onClick={() => onNavigate(rooms.length ? 'inspection' : 'plan')}>{rooms.length ? 'Rekod pemeriksaan pertama' : 'Sediakan daftar ruang'}<ArrowRight size={15}/></button></div>}
        <div className="dashboard-note"><ShieldCheck size={17}/><p>Semak bukti foto dan cadangan pembaikan sebelum mengesahkan rekod.</p></div>
      </section>
    </div>

    <section className="dashboard-shortcuts" aria-labelledby="shortcuts-title"><div className="dashboard-section-heading"><div><span className="dashboard-overline">AKSES PANTAS</span><h2 id="shortcuts-title">Teruskan kerja anda</h2></div></div><div className="dashboard-shortcut-grid">{[
      { icon: MapPinned, title: 'Pelan & daftar aset', detail: 'Urus pelan, lokasi dan maklumat ruang.', target: 'plan' },
      { icon: Camera, title: 'Pemeriksaan di tapak', detail: 'Rekod bukti foto dan dapatan kerosakan.', target: 'inspection' },
      { icon: FileText, title: 'Laporan pemeriksaan', detail: 'Semak rekod dan eksport laporan.', target: 'report' },
    ].map(({ icon: Icon, title, detail, target }) => <button key={target} className="dashboard-shortcut" disabled={disabled} onClick={() => project ? onNavigate(target) : onNewProject()}><span className="dashboard-shortcut-icon"><Icon size={21}/></span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={17}/></button>)}</div></section>
  </div>;
}
