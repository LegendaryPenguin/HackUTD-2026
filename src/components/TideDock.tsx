import { ChevronRight, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { fmt } from '../lib/model';
import { detectEvents } from '../lib/detector';
import { boundariesInRange, nextBoundaryAfter, shiftKindAt } from '../lib/crew';
import { TimelineScrubber, type TimelineTick } from './TimelineScrubber';
import type { Category, DetectedEvent } from '../lib/types';

type CritTick = TimelineTick & { facilityId?: string; category?: Category; end?: number | null; kind?: 'event' | 'shift' };

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
  if (e.end != null && e.end <= now) return false; // resolved
  return e.onset <= now; // ongoing
}

function isShiftsPath(path: string) {
  return path === '/crew' || path === '/shifts';
}

export function TideDock() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const shiftsMode = isShiftsPath(pathname);
  const { dataset, now, liveNow, isLive, setNow, resetNow } = useStore();
  const t0 = dataset?.telemetry.ts[0] ?? 0;

  const allEvents = useMemo(() => {
    if (!dataset) return [] as DetectedEvent[];
    return detectEvents(dataset, liveNow);
  }, [dataset, liveNow]);

  const eventTicks = useMemo<CritTick[]>(() => {
    return allEvents.filter((e) => activeAt(e, now)).map((e) => ({
      id: e.id,
      value: e.onset,
      tone: TONE[e.category],
      label: `${CAT_WORD[e.category]} · ${fmt.short(e.facility)} · ${fmt.dayTime(e.onset)}`,
      facilityId: e.facility,
      category: e.category,
      end: e.end,
      kind: 'event' as const,
    }));
  }, [allEvents, now]);

  /** Handoff markers only on Shifts. Everywhere else: problem ticks only. */
  const shiftTicks = useMemo<CritTick[]>(() => {
    if (!dataset || !shiftsMode) return [];
    return boundariesInRange(t0, liveNow).map((b) => {
      const to = shiftKindAt(b + 60);
      const from = to === 'day' ? 'night' : 'day';
      return {
        id: `shift-${b}`,
        value: b,
        tone: 'success' as const,
        label: `Handoff · ${from} → ${to} · ${fmt.dayTime(b)}`,
        kind: 'shift' as const,
      };
    });
  }, [dataset, t0, liveNow, shiftsMode]);

  const ticks = useMemo(() => [...eventTicks, ...shiftTicks], [eventTicks, shiftTicks]);

  const nextCritical = useMemo(() => {
    const upcoming = eventTicks.filter((t) => t.value > now + 60).sort((a, b) => a.value - b.value);
    return upcoming.find((t) => t.category === 'pump_failure') ?? upcoming[0] ?? null;
  }, [eventTicks, now]);

  const nextHandoff = useMemo(() => {
    if (!shiftsMode) return null;
    const n = nextBoundaryAfter(now);
    if (n > liveNow) return null;
    return shiftTicks.find((t) => t.value === n) ?? {
      id: `shift-${n}`,
      value: n,
      kind: 'shift' as const,
      label: `Next handoff · ${fmt.dayTime(n)}`,
    };
  }, [shiftsMode, now, liveNow, shiftTicks]);

  if (!dataset) return null;

  const clock = clockParts(now);

  const jumpTick = (tick: CritTick) => {
    if (tick.kind === 'shift') {
      setNow(Math.min(liveNow, tick.value));
      if (!shiftsMode) nav('/crew');
      return;
    }
    setNow(Math.min(liveNow, tick.value + 300));
    if (tick.facilityId && !shiftsMode) {
      nav(`/?f=${encodeURIComponent(tick.facilityId)}`);
    }
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
          labels={{
            region: shiftsMode
              ? 'Week timeline · handoffs and problems'
              : 'Week timeline · drag to set now',
          }}
          onValueChange={setNow}
          onTickJump={(tick) => {
            const full = ticks.find((t) => t.id === tick.id);
            if (full) jumpTick(full);
            else setNow(Math.min(liveNow, tick.value + 300));
          }}
        />
      </div>

      <div className="tide-dock-actions">
        {shiftsMode ? (
          <button
            type="button"
            className="btn primary sm"
            disabled={!nextHandoff}
            title={nextHandoff?.label ?? 'No later handoff'}
            onClick={() => nextHandoff && jumpTick(nextHandoff)}
          >
            Next handoff <ChevronRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="btn primary sm"
            disabled={!nextCritical}
            title={nextCritical?.label ?? 'No later critical events'}
            onClick={() => nextCritical && jumpTick(nextCritical)}
          >
            Next critical <ChevronRight size={14} />
          </button>
        )}
        {!isLive && (
          <button type="button" className="btn sm" onClick={resetNow}>
            <RotateCcw size={13} /> Back to now
          </button>
        )}
      </div>
    </div>
  );
}
