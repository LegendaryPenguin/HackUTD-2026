import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, LineChart, MapPin, Send, X } from 'lucide-react';
import { useStore } from '../state/store';
import { CATEGORY_LABEL, fmt } from '../lib/model';
import { systemThreadArt } from './MapMarkers';
import type { LiveFacility } from '../lib/status';
import type { DetectedEvent } from '../lib/types';
import ReflectiveCard from './ReflectiveCard';

const CARD_W = 420;
const CARD_H = 480;

/** Detail card for pipeline leak / pump wear — shown when triage (pump failure) does not apply. */
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
  const art = systemThreadArt(live.f.system);
  const sent = acked.has(event.id);

  return (
    <div className="triage-scrim" onClick={onClose} role="presentation">
      <motion.div
        className="triage-card triage-card--reflective"
        role="dialog"
        aria-modal
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        style={{ margin: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <ReflectiveCard
          theme="dark"
          tint={isLeak ? '#e8c07a' : '#a8b8e0'}
          metalness={0.88}
          roughness={0.4}
          blurStrength={6}
          grayscale={0.9}
          warp={0.45}
          shine={0.95}
          glare={0.45}
          bevel={3}
          enableTilt
          tiltStrength={8}
          intro
          webcam={false}
          width={CARD_W}
          height={CARD_H}
          radius={20}
          className="night-reflective"
        >
          <div className="rc-flow">
            <div className="rc-flow__top">
              <span />
              <div className="rc-steps" aria-label="Issue type">
                <span className="rc-steps__item is-active">{isLeak ? 'Leak' : 'Wear'}</span>
              </div>
              <button type="button" className="rc-flow__close" onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="rc-inspect">
              <div className="rc-triage__head">
                <div className="rc-triage__icon">
                  <img src={art} alt="" width={56} height={40} />
                </div>
                <div className="rc-triage__head-copy">
                  <div className="rc-triage__title-row">
                    <h2 className="rc-triage__title">{fmt.short(live.f.id)}</h2>
                    <span className={`chip ${isLeak ? 'amber' : 'violet'}`}>
                      {CATEGORY_LABEL[event.category]}
                    </span>
                  </div>
                  <p className="rc-triage__body">
                    {isLeak
                      ? 'Pipeline readings look like a leak. This does not fill the tank — send an inspector to confirm and isolate.'
                      : 'Pump efficiency is sliding. Not an emergency fill risk yet — schedule inspection before it becomes a hard stop.'}
                  </p>
                </div>
              </div>

              <div className="rc-triage__facts rc-triage__facts--3">
                <div className="rc-triage__fact-col">
                  <b>Asset</b>
                  <span>{event.asset}</span>
                </div>
                <div className="rc-triage__fact-col">
                  <b>System</b>
                  <span>{event.system}</span>
                </div>
                <div className="rc-triage__fact-col">
                  <b>Since</b>
                  <span>~{fmt.time(event.onset)}</span>
                </div>
              </div>

              <ul className="rc-inspect__evidence">
                {event.evidence.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>

              <div className="rc-flow__foot">
                {sent ? (
                  <span className="chip mint" style={{ justifyContent: 'center', padding: '10px 12px' }}>
                    Inspector sent
                  </span>
                ) : (
                  <button type="button" className="rc-triage__cta" onClick={() => ack(event.id)}>
                    <Send size={16} /> Send inspector
                  </button>
                )}
                <div className="rc-plan__actions">
                  <Link to={`/trends?preset=${isLeak ? 'leak' : 'pump'}&f=${event.facility}`} className="sim" onClick={onClose}>
                    <LineChart size={14} /> Trends
                  </Link>
                  <button type="button" className="act" onClick={onClose}>
                    <MapPin size={14} /> Stay on map <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ReflectiveCard>
      </motion.div>
    </div>
  );
}
