import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LineChart } from 'lucide-react';
import { fmt, hoursToLimit } from '../lib/model';
import { statusColor, statusLabel, type LiveFacility } from '../lib/status';
import { facilityBadge, mapArt } from './MapMarkers';
import { AvonCardShell } from './AvonCardShell';
import { LiquidMeter } from './ui';

/**
 * Status card — flat Avon v4 navy panel + Enchantress liquid meters.
 */
export function FacilityStatusCard({
  live,
  onClose,
}: {
  live: LiveFacility;
  onClose: () => void;
}) {
  const badge = facilityBadge(live.f.id);
  const facilityName = fmt.short(live.f.id);
  const onlineWells = live.wells.filter((w) => w.status === 1).length;
  const netFill = Math.max(0, live.inflow - (live.pumpStatus === 1 ? live.pumpFlow : 0));
  const hrsWarn = hoursToLimit(live.level, live.f.tank.capacity_bbl, netFill, 85);
  const hrsCrit = hoursToLimit(live.level, live.f.tank.capacity_bbl, netFill, 92);
  const pumpMax = Math.max(1, live.f.pump.max_flow_bpd);
  const pipeMax = Math.max(1, live.f.pipeline.max_bpd);
  const pumpLine =
    live.pumpStatus === 2 ? 'Fault — not emptying'
      : live.pumpStatus === 1 ? `Running · ${fmt.num(live.pumpFlow)} bpd`
        : 'Off';
  const statusChipClass =
    live.status === 'failure' ? 'coral'
      : live.status === 'leak' ? 'amber'
        : live.status === 'wear' ? 'violet'
          : live.status === 'warning' ? 'amber'
            : 'aqua';
  const rateLine = isFinite(hrsCrit) && hrsCrit < 72
    ? `~${fmt.dur(hrsCrit)} to 92%`
    : isFinite(hrsWarn) && hrsWarn < 72
      ? `~${fmt.dur(hrsWarn)} to warning`
      : 'stable at current rates';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <AvonCardShell onClose={onClose} scrimClassName="triage-scrim triage-scrim--status">
      <div className="avon-status">
        <div className="triage-head">
          <div className="triage-icon">
            <img src={mapArt.tank} alt="" width={64} height={48} />
            <span className="chip aqua triage-badge">{badge}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="triage-title-row">
              <h2 className="triage-title">{facilityName}</h2>
              <span className={`chip ${statusChipClass}`}>
                <i className="dot" style={{ background: statusColor[live.status] }} />
                {statusLabel[live.status]}
              </span>
            </div>
            <p className="triage-sentence">Live read on this tank battery</p>
          </div>
        </div>

        <div className="triage-facts">
          <div>
            <div className="triage-fact-label">Where</div>
            <div>{facilityName} · System {live.f.system}</div>
          </div>
          <div>
            <div className="triage-fact-label">Pump</div>
            <div>{pumpLine}</div>
          </div>
          <div>
            <div className="triage-fact-label">Wells</div>
            <div>{onlineWells}/{live.wells.length} online · trucks {live.f.response_min} min</div>
          </div>
        </div>

        <div className="avon-status__pulse">
          <strong>Tank {live.level.toFixed(0)}% of {fmt.num(live.f.tank.capacity_bbl)} bbl</strong>
          <span>Inflow {fmt.num(live.inflow)} bpd · {rateLine}</span>
        </div>

        <div className="avon-status__levels">
          <div className="triage-fact-label">Levels</div>
          <LiquidMeter
            label="Tank"
            display={`${live.level.toFixed(0)}%`}
            value={live.level}
            max={100}
            warn={85}
            shut={92}
            fluid="water"
            height={14}
          />
          <LiquidMeter
            label="Pump vs nameplate"
            display={live.pumpStatus === 2 ? 'fault' : `${Math.round((Math.max(0, live.pumpStatus === 1 ? live.pumpFlow : 0) / pumpMax) * 100)}%`}
            value={live.pumpStatus === 1 ? live.pumpFlow : 0}
            max={pumpMax}
            fluid="oil"
            height={14}
          />
          <LiquidMeter
            label="Inflow"
            display={`${fmt.num(live.inflow)} bpd`}
            value={live.inflow}
            max={Math.max(live.inflow, pumpMax)}
            fluid="water"
            height={14}
          />
          <LiquidMeter
            label="Pipeline"
            display={`${fmt.num(live.recv)} bpd`}
            value={live.recv}
            max={pipeMax}
            fluid="brine"
            height={14}
          />
          <LiquidMeter
            label="Wells"
            display={`${onlineWells}/${live.wells.length}`}
            value={onlineWells}
            max={Math.max(1, live.wells.length)}
            fluid="gas"
            height={14}
          />
        </div>

        <div className="avon-status__chips">
          <div className="avon-status__chip">
            <div className="triage-fact-label">Pipeline</div>
            <b>{fmt.num(live.recv)} bpd</b>
            <span>{fmt.num(live.pipePsi)} psi</span>
          </div>
          <div className="avon-status__chip is-mint">
            <div className="triage-fact-label">Coordinates</div>
            <b>{live.f.lat.toFixed(4)}</b>
            <span>{live.f.lon.toFixed(4)}</span>
          </div>
        </div>

        <Link to={`/trends?f=${live.f.id}`} className="btn primary triage-cta" onClick={onClose}>
          <LineChart size={16} /> Trends for this facility <ArrowRight size={16} />
        </Link>
      </div>
    </AvonCardShell>
  );
}
