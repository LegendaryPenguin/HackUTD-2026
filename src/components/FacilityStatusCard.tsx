import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LineChart } from 'lucide-react';
import { fmt, hoursToLimit, indexAt } from '../lib/model';
import { statusLabel, type LiveFacility } from '../lib/status';
import { useStore } from '../state/store';
import { facilityBadge, mapArt } from './MapMarkers';
import { AvonCardShell } from './AvonCardShell';
import { TankLevelChart } from './TankLevelChart';
import { WaterJug3D } from './WaterJug3D';

type Tone = 'ok' | 'warn' | 'fault';

function statusTone(status: LiveFacility['status']): Tone {
  if (status === 'failure' || status === 'leak') return 'fault';
  if (status === 'wear' || status === 'warning') return 'warn';
  return 'ok';
}

/**
 * Status card — Avon v4 chrome with Enchantress-style tank level timeline.
 */
export function FacilityStatusCard({
  live,
  onClose,
}: {
  live: LiveFacility;
  onClose: () => void;
}) {
  const { dataset, now } = useStore();
  const badge = facilityBadge(live.f.id);
  const facilityName = fmt.short(live.f.id);
  const onlineWells = live.wells.filter((w) => w.status === 1).length;
  const netFill = Math.max(0, live.inflow - (live.pumpStatus === 1 ? live.pumpFlow : 0));
  const hrsWarn = hoursToLimit(live.level, live.f.tank.capacity_bbl, netFill, 85);
  const hrsCrit = hoursToLimit(live.level, live.f.tank.capacity_bbl, netFill, 92);
  const tone = statusTone(live.status);
  const warnPct = dataset?.network.defaults.tank_limits_pct.warning ?? 85;
  const shutPct = dataset?.network.defaults.tank_limits_pct.shutdown ?? 92;
  const pumpLine =
    live.pumpStatus === 2 ? 'Fault, not emptying'
      : live.pumpStatus === 1 ? `Running · ${fmt.num(live.pumpFlow)} bpd`
        : 'Off';
  const rateLine = isFinite(hrsCrit) && hrsCrit < 72
    ? `~${fmt.dur(hrsCrit)} to 92%`
    : isFinite(hrsWarn) && hrsWarn < 72
      ? `~${fmt.dur(hrsWarn)} to warning`
      : 'stable at current rates';
  const pulseCopy = `Tank is ${live.level.toFixed(0)}% full now · ${onlineWells} wells online · ${fmt.num(live.inflow)} bpd inflow`;
  const pillClass = tone === 'fault' ? 'avon-pill--fault' : tone === 'warn' ? 'avon-pill--warn' : 'avon-pill--ok';

  const seriesEnd = useMemo(() => {
    if (!dataset) return 0;
    return indexAt(dataset.telemetry, now);
  }, [dataset, now]);

  const levelSeries = dataset?.telemetry.series.get(`${live.f.tank.id}|level_pct`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <AvonCardShell onClose={onClose} scrimClassName="triage-scrim triage-scrim--status" wide>
      <div className={`avon-triage avon-triage--status tone-${tone}`}>
        <div className="triage-head">
          <div className="triage-icon">
            <img src={mapArt.tank} alt="" width={72} height={56} />
            <span className="chip aqua triage-badge">{badge}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="triage-title-row">
              <h2 className="triage-title">{facilityName}</h2>
              <span className={`avon-pill ${pillClass}`}>{statusLabel[live.status]}</span>
            </div>
            <p className="triage-sentence">Live read on this tank battery.</p>
          </div>
        </div>

        <div className="triage-facts">
          <div>
            <div className="triage-fact-label">Where</div>
            <div>{facilityName} · System {live.f.system}</div>
          </div>
          <div>
            <div className="triage-fact-label">Pump</div>
            <div className={live.pumpStatus === 2 ? 'is-fault' : undefined}>{pumpLine}</div>
          </div>
          <div>
            <div className="triage-fact-label">Wells</div>
            <div>{onlineWells}/{live.wells.length} online · trucks {live.f.response_min} min</div>
          </div>
        </div>

        <div className={`avon-status__pulse tone-${tone}`}>
          <strong>{pulseCopy}</strong>
          <span>{rateLine}</span>
        </div>

        <div className="avon-status__viz avon-status__viz--timeline">
          <WaterJug3D
            level={live.level}
            warn={warnPct}
            shut={shutPct}
            failed={live.status === 'failure'}
            label="Now"
            size="sm"
          />
          <div className="avon-status__spark-wrap">
            {dataset && levelSeries ? (
              <TankLevelChart
                timestamps={dataset.telemetry.ts}
                levels={levelSeries}
                capacityBbl={live.f.tank.capacity_bbl}
                warnPct={warnPct}
                shutPct={shutPct}
                endIdx={seriesEnd}
                height={176}
                tone={tone}
              />
            ) : (
              <div className="tank-level-chart__empty">No tank level history.</div>
            )}
          </div>
        </div>

        <div className="impact-row">
          <div className={`impact-card ${tone === 'fault' ? 'coral' : 'mint'}`}>
            <div className="impact-label">Pipeline receive</div>
            <div className={`impact-value ${tone === 'fault' ? 'impact-lost' : 'impact-saved'}`}>
              {fmt.num(live.recv)} bpd
            </div>
            <p className="impact-copy">{fmt.num(live.pipePsi)} psi on the line</p>
          </div>
          <div className="impact-card mint">
            <div className="impact-label">Response trucks</div>
            <div className="impact-value impact-saved">{live.f.response_min} min</div>
            <p className="impact-copy">{live.f.lat.toFixed(4)}, {live.f.lon.toFixed(4)}</p>
          </div>
        </div>

        <div className="triage-actions">
          <Link to={`/trends?f=${live.f.id}`} className="btn avon-cta" onClick={onClose}>
            <LineChart size={16} /> Trends for this facility <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </AvonCardShell>
  );
}
