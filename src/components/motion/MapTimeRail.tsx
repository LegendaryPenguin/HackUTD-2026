import { RotateCcw } from 'lucide-react';
import { TimelineScrubber, type TimelineTick } from '../TimelineScrubber';
import './map-time-rail.css';

/** Compact scrubber ends — full stamp lives once in the status column. */
function shortStamp(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 3) return `${parts[0]} ${parts[1]}`;
  return full;
}

/** Bottom field-map instrument strip — matte chronograph over the basin. */
export function MapTimeRail({
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
  return (
    <div className="map-time-rail" role="region" aria-label="Field map timeline">
      <div className="map-time-rail-meta">
        <div className="map-time-rail-status">
          <i className={isLive ? 'live' : 'past'} aria-hidden />
          <div>
            <strong>{isLive ? 'Live' : 'Replay'}</strong>
            <em>{formatValue(value)}</em>
          </div>
        </div>

        <div className="map-time-rail-legend" aria-hidden>
          <span className="tone-danger">Fail</span>
          <span className="tone-warn">Leak</span>
          <span className="tone-primary">Wear</span>
        </div>

        {!isLive && (
          <button type="button" className="map-time-rail-reset" onClick={onReset}>
            <RotateCcw size={13} strokeWidth={2} />
            Now
          </button>
        )}
      </div>

      <TimelineScrubber
        start={start}
        end={end}
        value={value}
        step={60}
        ticks={ticks}
        className="is-map"
        formatValue={(u) => shortStamp(formatValue(u))}
        labels={{ region: 'Field map week timeline' }}
        onValueChange={onValueChange}
        onTickJump={onTickJump}
      />
    </div>
  );
}
