import { ChevronRight, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { fmt } from '../lib/model';
import { detectEvents } from '../lib/detector';
import { TimelineScrubber, type TimelineTick } from './TimelineScrubber';
import type { Category, DetectedEvent } from '../lib/types';

type CritTick = TimelineTick & { facilityId: string; category: Category; end?: number | null };

const TONE: Record<Category, TimelineTick['tone']> = {
  pump_failure: 'danger',
  pipeline_leak: 'warn',
  pump_degradation: 'primary',
};

const CAT_WORD: Record<Category, string> = {
  pump_failure: 'Pump failed',
  pipeline_leak: 'Pipeline leak',
  pump_degradation: 'Pump wearing out',
};

function clockParts(unix: number) {
  const d = new Date(unix * 1000);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const date = `${day} · ${mon} ${d.getUTCDate()}`;
  const time = d.toISOString().slice(11, 16);
  return { date, time };
}

/** Still visible on the scrubber at `now`: upcoming, or started and not yet resolved. */
function activeAt(e: DetectedEvent, now: number): boolean {
  if (e.onset > now + 60) return true; // future
  if (e.end != null && e.end <= now) return false; // resolved — drop
  return e.onset <= now; // ongoing
}

export function TideDock() {
  const nav = useNavigate();
  const { dataset, now, liveNow, isLive, setNow, resetNow } = useStore();
  const t0 = dataset?.telemetry.ts[0] ?? 0;

  const allEvents = useMemo(() => {
    if (!dataset) return [] as DetectedEvent[];
    return detectEvents(dataset, liveNow);
  }, [dataset, liveNow]);

  const ticks = useMemo<CritTick[]>(() => {
    return allEvents.filter((e) => activeAt(e, now)).map((e) => ({
      id: e.id,
      value: e.onset,
      tone: TONE[e.category],
      label: `${CAT_WORD[e.category]} · ${fmt.short(e.facility)} · ${fmt.dayTime(e.onset)}`,
      facilityId: e.facility,
      category: e.category,
      end: e.end,
    }));
  }, [allEvents, now]);

  /** Prefer pump failures — those open the concept triage → plans flow. */
  const nextCritical = useMemo(() => {
    const upcoming = ticks.filter((t) => t.value > now + 60).sort((a, b) => a.value - b.value);
    return upcoming.find((t) => t.category === 'pump_failure') ?? upcoming[0] ?? null;
  }, [ticks, now]);

  if (!dataset) return null;

  const clock = clockParts(now);

  const jumpCritical = (tick: CritTick) => {
    setNow(Math.min(liveNow, tick.value + 300));
    nav(`/?f=${encodeURIComponent(tick.facilityId)}`);
  };

  return (
    <div className="tide-dock" role="region" aria-label="Week timeline">
      <div className="tide-dock-clock">
        <div className="tide-dock-date">{clock.date}</div>
        <div className="tide-dock-time">{clock.time}</div>
        <span className={`tide-dock-mode ${isLive ? 'live' : 'past'}`}>
          <i />
          {isLive ? 'live end' : 'replay'}
        </span>
      </div>

      <div className="tide-dock-scrub">
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
          onTickJump={(tick) => {
            const full = ticks.find((t) => t.id === tick.id);
            if (full) jumpCritical(full);
            else setNow(Math.min(liveNow, tick.value + 300));
          }}
        />
      </div>

      <div className="tide-dock-actions">
        <button
          type="button"
          className="btn primary sm"
          disabled={!nextCritical}
          title={nextCritical?.label ?? 'No later critical events'}
          onClick={() => nextCritical && jumpCritical(nextCritical)}
        >
          Next critical <ChevronRight size={14} />
        </button>
        {!isLive && (
          <button type="button" className="btn sm" onClick={resetNow}>
            <RotateCcw size={13} /> Back to now
          </button>
        )}
      </div>
    </div>
  );
}
