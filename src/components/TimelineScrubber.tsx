/**
 * Timeline scrubber — adapted from VLLNT Timeline Scrubber
 * (https://ui.vllnt.com/components/timeline-scrubber)
 * Night Tide styling; no @vllnt/ui dependency.
 */
import { useId, type ChangeEvent, type ReactNode } from 'react';

export type TimelineTick = {
  id: string;
  value: number;
  label?: string;
  tone?: TimelineScrubberTone;
};

export type TimelineScrubberTone = 'danger' | 'neutral' | 'primary' | 'success' | 'warn';

export function TimelineScrubber({
  start,
  end,
  value,
  onValueChange,
  step = 1,
  ticks,
  tone = 'primary',
  formatValue,
  labels,
  className,
  onTickJump,
}: {
  start: number;
  end: number;
  value: number;
  onValueChange: (value: number) => void;
  step?: number;
  ticks?: TimelineTick[];
  tone?: TimelineScrubberTone;
  formatValue?: (value: number) => ReactNode;
  labels?: { region?: string };
  className?: string;
  /** Click a milestone to jump (e.g. event onset). */
  onTickJump?: (tick: TimelineTick) => void;
}) {
  const inputId = useId();
  const safeEnd = end <= start ? start + 1 : end;
  const span = safeEnd - start;
  const clamped = clamp(value, start, safeEnd);
  const ratio = clamp((clamped - start) / span, 0, 1);
  const region = labels?.region ?? 'Timeline scrubber';

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    onValueChange(clamp(Number(e.target.value), start, safeEnd));
  };

  return (
    <div
      className={`timeline-scrubber ${className ?? ''}`}
      data-tone={tone}
      role="group"
      aria-label={region}
    >
      <div className="ts-labels">
        <span>{formatValue ? formatValue(start) : start}</span>
        <span className="ts-cursor">{formatValue ? formatValue(clamped) : clamped}</span>
        <span>{formatValue ? formatValue(safeEnd) : safeEnd}</span>
      </div>
      <div className="ts-track">
        <span className="ts-rail" aria-hidden />
        <span className="ts-fill" aria-hidden style={{ width: `${ratio * 100}%` }} />
        {ticks?.map((tick) => {
          const left = clamp((tick.value - start) / span, 0, 1) * 100;
          return (
            <button
              key={tick.id}
              type="button"
              className={`ts-tick tone-${tick.tone ?? 'neutral'}`}
              style={{ left: `${left}%` }}
              title={tick.label}
              aria-label={tick.label ?? tick.id}
              onClick={() => onTickJump?.(tick)}
            />
          );
        })}
        <input
          id={inputId}
          className="ts-input"
          type="range"
          min={start}
          max={safeEnd}
          step={step}
          value={clamped}
          aria-label={region}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
