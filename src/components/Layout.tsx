import { NavLink, Outlet } from 'react-router-dom';
import { Activity, Bell, ChevronDown, ClipboardList, FolderOpen, Map as MapIcon, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useMemo, useRef } from 'react';
import emblem from '../assets/emblem.jpg';
import { useStore } from '../state/store';
import { fmt } from '../lib/model';
import { detectEvents } from '../lib/detector';
import { TimelineScrubber, type TimelineTick } from './TimelineScrubber';
import type { Category } from '../lib/types';

const TONE: Record<Category, TimelineTick['tone']> = {
  pump_failure: 'danger',
  pipeline_leak: 'warn',
  pump_degradation: 'primary',
};

export function Layout() {
  const { datasets, dataset, load, loadFiles, loading, error, now, liveNow, isLive, setNow, resetNow, analysis } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const t0 = dataset?.telemetry.ts[0] ?? 0;
  const nFail = analysis?.orderedFailures.length ?? 0;
  const nOther = (analysis?.ongoing.length ?? 0) - nFail;

  // Full-week milestones (always vs live end) so ticks stay visible while scrubbing.
  const ticks = useMemo<TimelineTick[]>(() => {
    if (!dataset) return [];
    return detectEvents(dataset, liveNow).map((e) => ({
      id: e.id,
      value: e.onset,
      tone: TONE[e.category],
      label: `${e.category.replace(/_/g, ' ')} · ${e.asset} · ${fmt.dayTime(e.onset)}`,
    }));
  }, [dataset, liveNow]);

  return (
    <div className="shell">
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
          <div className="timebar">
            <TimelineScrubber
              start={t0}
              end={liveNow}
              value={now}
              step={300}
              ticks={ticks}
              tone="primary"
              formatValue={(u) => fmt.dayTime(u)}
              labels={{ region: 'Week timeline — drag to set now' }}
              onValueChange={setNow}
              onTickJump={(tick) => setNow(Math.min(liveNow, tick.value + 300))}
            />
            <span className="clock tip">
              <i className={isLive ? 'live' : 'past'} />
              {isLive ? 'live end' : 'replay'}
              <span className="tipbox">
                {isLive
                  ? 'Parked at the last reading in this dataset (not wall-clock). Coral / amber / violet ticks = failure / leak / wear onsets — click to jump.'
                  : 'Replaying the past — detection and plans as they would have looked then. Click Back to now for the dataset end.'}
              </span>
            </span>
            {!isLive && (
              <button className="btn sm" onClick={resetNow}><RotateCcw size={13} /> Back to now</button>
            )}
          </div>
        )}
      </header>

      <nav className="sidenav">
        <div className="nav-section">Operate</div>
        <NavLink to="/" end className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
          <MapIcon size={18} /> <span className="lbl">Map</span>
        </NavLink>
        <NavLink to="/alerts" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
          <Bell size={18} /> <span className="lbl">Alerts</span> {nFail + nOther > 0 && <span className="cnt">{nFail + nOther}</span>}
        </NavLink>
        <NavLink to="/plan" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
          <SlidersHorizontal size={18} /> <span className="lbl">Plan</span>
        </NavLink>
        <div className="nav-section">Review</div>
        <NavLink to="/trends" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
          <Activity size={18} /> <span className="lbl">Trends</span>
        </NavLink>
        <NavLink to="/log" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
          <ClipboardList size={18} /> <span className="lbl">Shift log</span>
        </NavLink>
        <div className="nav-foot" style={{ marginTop: 'auto', padding: 12, fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.5 }}>
          {dataset && (
            <>
              <div>{dataset.network.systems.length} systems · {dataset.network.systems.reduce((n, s) => n + s.facilities.length, 0)} facilities</div>
              <div>{dataset.telemetry.ts.length.toLocaleString()} readings × {dataset.telemetry.series.size} sensors</div>
              <div>{fmt.date(t0)} → {fmt.date(liveNow)}</div>
              <div style={{ marginTop: 6 }}>{ticks.length} event ticks on scrubber</div>
            </>
          )}
        </div>
      </nav>

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
              <p>Put a folder with <code>network.json</code>, <code>ops.json</code> and <code>telemetry.csv</code> under <code>data/</code>, or use <b>Open folder</b>.</p>
            </div>
          </div>
        )}
        {dataset && <Outlet />}
      </main>
    </div>
  );
}
