import { Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, FolderOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import emblem from '../assets/emblem.jpg';
import fieldBg from '../assets/night-tide/backgrounds/moonlit-oilfield.png';
import { useStore } from '../state/store';
import { fmt } from '../lib/model';
import { SideRail } from './motion/SideRail';
import { TideDock } from './TideDock';

export function Layout() {
  const { datasets, dataset, load, loadFiles, loading, error, liveNow, analysis } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  /** Map-first: rail closed until operator opens it. */
  const [railOpen, setRailOpen] = useState(false);
  const location = useLocation();
  const t0 = dataset?.telemetry.ts[0] ?? 0;
  const nFail = analysis?.orderedFailures.length ?? 0;
  const nOther = (analysis?.ongoing.length ?? 0) - nFail;

  const mapMode = location.pathname === '/' || location.pathname === '/network';
  const trendsMode = location.pathname === '/trends';
  const driveMode = location.pathname === '/drive';
  const tycoonMode = location.pathname === '/tycoon';
  const fieldBackdrop = !mapMode && !tycoonMode;
  const showOutlet = !!dataset || tycoonMode;

  // Map-first: arriving on the field map always tucks the sidebar away
  useEffect(() => {
    if (mapMode) setRailOpen(false);
  }, [mapMode, location.pathname]);

  return (
    <div
      className={[
        'shell',
        railOpen ? 'is-rail-open' : 'is-rail-closed',
        mapMode ? 'map-mode' : '',
        trendsMode ? 'trends-mode' : '',
        driveMode ? 'drive-mode' : '',
        tycoonMode ? 'tycoon-mode' : '',
        fieldBackdrop ? 'field-backdrop' : '',
      ].filter(Boolean).join(' ')}
    >
      {fieldBackdrop && (
        <div className="field-stage-bg" aria-hidden>
          <div className="field-stage-photo" style={{ backgroundImage: `url(${fieldBg})` }} />
          <div className="field-stage-veil" />
        </div>
      )}
      <div className="tide-ambient" aria-hidden>
        <span className="orb a" />
        <span className="orb b" />
        <span className="orb c" />
      </div>
      <header className="topbar">
        <div className="brand">
          <img src={emblem} alt="" />
          <div>
            <span className="sig">Avon</span>
            <small>Night Tide · water ops</small>
          </div>
        </div>

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
          <div className="topbar-live" title={fmt.dayTime(liveNow)}>
            <span className="chip ghost"><i className="dot live" /> LIVE END · {fmt.dayTime(liveNow)}</span>
          </div>
        )}
      </header>

      <SideRail
        alertCount={nFail + nOther}
        systems={dataset?.network.systems.length}
        facilities={dataset?.network.systems.reduce((n, s) => n + s.facilities.length, 0)}
        readings={dataset?.telemetry.ts.length}
        sensors={dataset?.telemetry.series.size}
        rangeLabel={dataset ? `${fmt.date(t0)} → ${fmt.date(liveNow)}` : undefined}
        open={railOpen}
        onOpenChange={setRailOpen}
      />

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
        {!loading && !dataset && !tycoonMode && (
          <div className="empty" style={{ height: '100%' }}>
            <div>
              <h2 className="page-title">No dataset found</h2>
              <p>Put a folder with <code>network.json</code>, <code>ops.json</code> and <code>telemetry.csv</code> under <code>data/</code>, or use <b>Open folder</b>.</p>
            </div>
          </div>
        )}
        {!loading && showOutlet && <Outlet />}
      </main>

      {dataset && !loading && !driveMode && !tycoonMode && <TideDock />}
    </div>
  );
}
