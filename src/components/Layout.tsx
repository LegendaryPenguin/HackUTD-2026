import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import emblem from '../assets/emblem.jpg';
import topoTide from '../assets/night-tide/backgrounds/wireframe-tide-map.jpg';
import { useStore } from '../state/store';
import { SideRail } from './motion/SideRail';
import { TideDock } from './TideDock';

export function Layout() {
  const { dataset, loading, analysis } = useStore();
  /** Map-first: rail closed until operator opens it. */
  const [railOpen, setRailOpen] = useState(false);
  const location = useLocation();
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
        'shell no-topbar',
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
          <div className="field-stage-photo" style={{ backgroundImage: `url(${topoTide})` }} />
          <div className="field-stage-veil" />
        </div>
      )}
      <div className="tide-ambient" aria-hidden>
        <span className="orb a" />
        <span className="orb b" />
        <span className="orb c" />
      </div>

      <SideRail
        alertCount={nFail + nOther}
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
              <p>Put a folder with <code>network.json</code>, <code>ops.json</code> and <code>telemetry.csv</code> under <code>data/</code>, or open the menu and use <b>Open folder</b>.</p>
            </div>
          </div>
        )}
        {!loading && showOutlet && <Outlet />}
      </main>

      {dataset && !loading && !driveMode && !tycoonMode && <TideDock />}
    </div>
  );
}
