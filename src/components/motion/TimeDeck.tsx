import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, RotateCcw, X } from 'lucide-react';
import { IndustrialCard } from './IndustrialCard';
import { TimelineScrubber, type TimelineTick } from '../TimelineScrubber';
import './time-deck.css';

const TONE_LABEL: Record<NonNullable<TimelineTick['tone']>, string> = {
  danger: 'Failure',
  warn: 'Leak',
  primary: 'Wear',
  success: 'Ok',
  neutral: 'Mark',
};

/** Compact topbar chip + Aceternity-style 3D time deck (click to open). */
export function TimeDeck({
  start,
  end,
  value,
  isLive,
  ticks,
  formatValue,
  onValueChange,
  onTickJump,
  onReset,
}: {
  start: number;
  end: number;
  value: number;
  isLive: boolean;
  ticks: TimelineTick[];
  formatValue: (u: number) => string;
  onValueChange: (u: number) => void;
  onTickJump: (tick: TimelineTick) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const span = Math.max(1, end - start);
  const ratio = Math.min(1, Math.max(0, (value - start) / span));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPtr = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPtr);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPtr);
    };
  }, [open]);

  const jump = (tick: TimelineTick) => {
    onTickJump(tick);
  };

  return (
    <div className="time-deck" ref={rootRef}>
      <button
        type="button"
        className={`time-chip${open ? ' is-open' : ''}${isLive ? '' : ' is-replay'}`}
        aria-expanded={open}
        aria-controls={titleId}
        onClick={() => setOpen((v) => !v)}
      >
        <i className={isLive ? 'live' : 'past'} aria-hidden />
        <span className="time-chip-copy">
          <strong>{isLive ? 'Live end' : 'Replay'}</strong>
          <em>{formatValue(value)}</em>
        </span>
        <span className="time-chip-rail" aria-hidden>
          <span style={{ width: `${ratio * 100}%` }} />
        </span>
        <ChevronDown size={14} className="time-chip-chevron" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="time-deck-scrim"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            />
            <motion.div
              id={titleId}
              className="time-deck-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Week timeline"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97, rotateX: 8 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, rotateX: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.6 }}
              style={{ transformPerspective: 1200 }}
            >
              <IndustrialCard className="time-deck-card" interactive={!reduce}>
                <div className="time-deck-head">
                  <div>
                    <h2 className="time-deck-title">Week timeline</h2>
                    <p className="time-deck-sub">Drag the rail or jump an event onset.</p>
                  </div>
                  <div className="time-deck-actions">
                    {!isLive && (
                      <button type="button" className="btn sm" onClick={onReset}>
                        <RotateCcw size={13} /> Back to now
                      </button>
                    )}
                    <button type="button" className="btn ghost sm" aria-label="Close timeline" onClick={() => setOpen(false)}>
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div className="time-deck-scrub">
                  <TimelineScrubber
                    start={start}
                    end={end}
                    value={value}
                    step={60}
                    ticks={ticks}
                    tone="primary"
                    className="is-deck"
                    formatValue={formatValue}
                    labels={{ region: 'Week timeline — drag to set now' }}
                    onValueChange={onValueChange}
                    onTickJump={jump}
                  />
                </div>

                <div className="time-deck-legend" aria-hidden>
                  <span><i className="tone-danger" /> Failure</span>
                  <span><i className="tone-warn" /> Leak</span>
                  <span><i className="tone-primary" /> Wear</span>
                </div>

                <div className="time-deck-events">
                  <div className="time-deck-events-head">
                    <span>Events</span>
                    <span className="muted">{ticks.length}</span>
                  </div>
                  <ul className="time-deck-list">
                    {ticks.length === 0 && <li className="muted time-deck-empty">No onsets in this week.</li>}
                    {ticks.map((tick) => (
                      <li key={tick.id}>
                        <button
                          type="button"
                          className={`time-deck-row tone-${tick.tone ?? 'neutral'}`}
                          onClick={() => jump(tick)}
                        >
                          <i />
                          <span className="time-deck-row-main">
                            <strong>{TONE_LABEL[tick.tone ?? 'neutral']}</strong>
                            <em>{tick.label?.split(' · ').slice(1).join(' · ') ?? tick.id}</em>
                          </span>
                          <span className="mono">{formatValue(tick.value)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </IndustrialCard>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
