import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, Bell, ChevronDown, ClipboardList, FolderOpen, Map as MapIcon, Menu, SlidersHorizontal, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import emblem from '../assets/emblem.jpg';
import { useStore } from '../state/store';
import { fmt } from '../lib/model';
import { TideDock } from './TideDock';

export function Layout() {
  const { datasets, dataset, load, loadFiles, loading, error, liveNow, analysis } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const t0 = dataset?.telemetry.ts[0] ?? 0;
  const nFail = analysis?.orderedFailures.length ?? 0;
  const nOther = (analysis?.ongoing.length ?? 0) - nFail;
  const mapMode = location.pathname === '/' || location.pathname === '/network';
  const trendsMode = location.pathname === '/trends';

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className={`shell ${mapMode ? 'map-mode' : ''} ${trendsMode ? 'trends-mode' : ''}`}>
      <div className="tide-ambient" aria-hidden>
        <span className="orb a" />
        <span className="orb b" />
        <span className="orb c" />
      </div>

      <header className="topbar topbar-slim">
        <button type="button" className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className="brand">
          <img src={emblem} alt="" />
          <div>
            <span className="sig">Avon</span>
            <small>Night Tide · water ops</small>
          </div>
        </div>
      </header>

      <div className={`menu-scrim ${menuOpen ? 'show' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden={!menuOpen} />
      <aside className={`menu-drawer ${menuOpen ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Menu">
        <div className="drawer-header">
          <div className="brand">
            <img src={emblem} alt="" />
            <div>
              <span className="sig">Avon</span>
              <small>Night Tide</small>
            </div>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setMenuOpen(false)} aria-label="Close"><X size={16} /></button>
        </div>

        <nav className="drawer-nav">
          <div className="nav-section">Operate</div>
          <NavLink to="/" end className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
            <MapIcon size={18} /> <span className="lbl">Map</span>
          </NavLink>
          <NavLink to="/alerts" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
            <Bell size={18} /> <span className="lbl">Alerts</span> {nFail + nOther > 0 && <span className="cnt">{nFail + nOther}</span>}
          </NavLink>
          <NavLink to="/plan" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
            <SlidersHorizontal size={18} /> <span className="lbl">Plan</span>
          </NavLink>
          <NavLink to="/crew" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
            <Users size={18} /> <span className="lbl">Shifts</span>
          </NavLink>
          <div className="nav-section">Review</div>
          <NavLink to="/trends" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
            <Activity size={18} /> <span className="lbl">Trends</span>
          </NavLink>
          <NavLink to="/log" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
            <ClipboardList size={18} /> <span className="lbl">Shift log</span>
          </NavLink>
        </nav>

        <div className="drawer-foot">
          <div className="select" title="Dataset folder (data/<folder>)">
            <select value={dataset?.name ?? ''} onChange={(e) => load(e.target.value)} disabled={!!loading}>
              {dataset && !datasets.includes(dataset.name) && <option value={dataset.name}>{dataset.name}</option>}
              {datasets.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
          <button className="btn ghost sm" onClick={() => fileRef.current?.click()} title="Open a folder with network.json, ops.json, telemetry.csv">
            <FolderOpen size={14} /> Open folder
          </button>
          <input ref={fileRef} type="file" hidden {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} multiple onChange={(e) => e.target.files && loadFiles(e.target.files)} />
          {error && <span className="chip coral">{error}</span>}
          {dataset && (
            <div className="drawer-meta">
              <div>{dataset.network.systems.length} systems · {dataset.network.systems.reduce((n, s) => n + s.facilities.length, 0)} facilities</div>
              <div>{dataset.telemetry.ts.length.toLocaleString()} readings × {dataset.telemetry.series.size} sensors</div>
              <div>{fmt.date(t0)} → {fmt.date(liveNow)}</div>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        {loading && (
          <div className="loader">
            <div className="box">
              <img src={emblem} alt="" />
              <div className="bar"><i /></div>
              <div className="muted">{loading}</div>
            </div>
          </div>
        )}
        {!loading && !dataset && (
          <div className="empty" style={{ height: '100%' }}>
            <div>
              <h2 className="page-title">No dataset found</h2>
              <p>Put a folder with <code>network.json</code>, <code>ops.json</code> and <code>telemetry.csv</code> under <code>data/</code>, or open the menu and choose <b>Open folder</b>.</p>
            </div>
          </div>
        )}
        {dataset && <Outlet />}
      </main>

      {dataset && !loading && <TideDock />}
    </div>
  );
}
