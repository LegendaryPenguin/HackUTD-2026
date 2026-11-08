import { Link } from 'react-router-dom';
import { ArrowRight, LineChart, MapPin, Send } from 'lucide-react';
import { useStore } from '../state/store';
import { CATEGORY_LABEL, fmt } from '../lib/model';
import { mapArt } from './MapMarkers';
import type { LiveFacility } from '../lib/status';
import type { DetectedEvent } from '../lib/types';
import { AvonCardShell } from './AvonCardShell';
import { LiquidMeter } from './ui';

/** Leak / wear card — same flat Avon navy panel as status + triage. */
export function InspectIssueCard({
  live,
  event,
  onClose,
}: {
  live: LiveFacility;
  event: DetectedEvent;
  onClose: () => void;
}) {
  const { acked, ack } = useStore();
  const isLeak = event.category === 'pipeline_leak';
  const sent = acked.has(event.id);
  const pumpMax = Math.max(1, live.f.pump.max_flow_bpd);

  return (
    <AvonCardShell
      onClose={onClose}
      topCenter={(
        <div className="avon-steps" aria-label="Issue type">
          <span className="avon-steps__item is-active">{isLeak ? 'Leak' : 'Wear'}</span>
        </div>
      )}
    >
      <div className="avon-status">
        <div className="triage-head">
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
                ? 'Pipeline readings look like a leak. This does not fill the tank — send an inspector to confirm and isolate.'
                : 'Pump efficiency is sliding. Not an emergency fill risk yet — schedule inspection before it becomes a hard stop.'}
            </p>
          </div>
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
            <div className="triage-fact-label">Since</div>
            <div>~{fmt.time(event.onset)}</div>
          </div>
        </div>

        <div className="avon-status__levels">
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
