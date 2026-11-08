import { Link } from 'react-router-dom';
import { ArrowRight, LineChart, MapPin, Send } from 'lucide-react';
import { useStore } from '../state/store';
import { CATEGORY_LABEL, fmt } from '../lib/model';
import { mapArt } from './MapMarkers';
import type { LiveFacility } from '../lib/status';
import type { DetectedEvent } from '../lib/types';
import { AvonCardShell } from './AvonCardShell';
import { LiquidMeter } from './ui';
import { OccurredStamp } from './OccurredStamp';
import { WaterJug3D } from './WaterJug3D';

/** Leak / wear card — status-card chrome with clear occurred stamp. */
export function InspectIssueCard({
  live,
  event,
  onClose,
}: {
  live: LiveFacility;
  event: DetectedEvent;
  onClose: () => void;
}) {
  const { dataset, acked, ack } = useStore();
  const isLeak = event.category === 'pipeline_leak';
  const sent = acked.has(event.id);
  const pumpMax = Math.max(1, live.f.pump.max_flow_bpd);
  const warnPct = dataset?.network.defaults.tank_limits_pct.warning ?? 85;
  const shutPct = dataset?.network.defaults.tank_limits_pct.shutdown ?? 92;

  return (
    <AvonCardShell onClose={onClose}>
      <div className="avon-status">
        <div className="triage-head" style={{ alignItems: 'flex-start' }}>
          <div className="triage-icon">
            <img src={mapArt.tank} alt="" width={64} height={48} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="triage-title-row">
              <h2 className="triage-title">{fmt.short(live.f.id)}</h2>
              <span className={`chip ${isLeak ? 'amber' : 'violet'}`}>
                {CATEGORY_LABEL[event.category]}
              </span>
            </div>
            <p className="triage-sentence">
              {isLeak
                ? 'Pipeline readings look like a leak. This does not fill the tank. Send an inspector to confirm and isolate.'
                : 'This pump is losing efficiency. Tank fill risk is still low. Schedule an inspection before it turns into a hard stop.'}
            </p>
          </div>
          <OccurredStamp unix={event.onset} label="Started" compact />
        </div>

        <div className="triage-facts">
          <div>
            <div className="triage-fact-label">Asset</div>
            <div>{event.asset}</div>
          </div>
          <div>
            <div className="triage-fact-label">System</div>
            <div>{event.system}</div>
          </div>
          <div>
            <div className="triage-fact-label">When</div>
            <div>{fmt.time(event.onset)} UTC</div>
          </div>
        </div>

        <div className="avon-status__viz">
          <WaterJug3D
            level={live.level}
            warn={warnPct}
            shut={shutPct}
            label="Tank"
            size="sm"
          />
          <div className="avon-status__levels" style={{ flex: 1, minWidth: 0 }}>
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
              label="Pump"
              display={live.pumpStatus === 2 ? 'fault' : live.pumpStatus === 1 ? `${fmt.num(live.pumpFlow)} bpd` : 'off'}
              value={live.pumpStatus === 1 ? live.pumpFlow : 0}
              max={pumpMax}
              fluid="oil"
              height={14}
            />
          </div>
        </div>

        <ul className="avon-evidence">
          {event.evidence.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>

        <div className="triage-actions" style={{ flexDirection: 'column', gap: 8 }}>
          {sent ? (
            <span className="chip mint" style={{ justifyContent: 'center', padding: '10px 12px' }}>
              Inspector sent
            </span>
          ) : (
            <button type="button" className="btn primary triage-cta" onClick={() => ack(event.id)}>
              <Send size={16} /> Send inspector
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/trends?preset=${isLeak ? 'leak' : 'pump'}&f=${event.facility}`} className="btn ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
              <LineChart size={14} /> Trends
            </Link>
            <button type="button" className="btn ghost" onClick={onClose} style={{ flex: 1 }}>
              <MapPin size={14} /> Stay on map <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </AvonCardShell>
  );
}
