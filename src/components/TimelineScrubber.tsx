/**
 * Timeline scrubber — pointer-capture slide with instant playhead follow.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type TimelineTick = {
  id: string;
  value: number;
  label?: string;
  tone?: TimelineScrubberTone;
};

export type TimelineScrubberTone = 'danger' | 'neutral' | 'primary' | 'success' | 'warn';

const TONE_NAME: Record<TimelineScrubberTone, string> = {
  danger: 'Failure',
  warn: 'Leak',
  primary: 'Wear',
  success: 'Ok',
  neutral: 'Mark',
};

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
  onTickJump?: (tick: TimelineTick) => void;
}) {
  const labelId = useId();
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const raf = useRef<number | null>(null);
  const pending = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  const safeEnd = end <= start ? start + 1 : end;
  const span = safeEnd - start;
  const display = preview ?? clamp(value, start, safeEnd);
  const ratio = clamp((display - start) / span, 0, 1);
  const region = labels?.region ?? 'Timeline scrubber';

  const flush = useCallback(() => {
    raf.current = null;
    if (pending.current == null) return;
    onValueChange(pending.current);
    pending.current = null;
  }, [onValueChange]);

  const commit = useCallback(
    (next: number, immediate = false) => {
      const v = clamp(next, start, safeEnd);
      setPreview(v);
      if (immediate) {
        if (raf.current != null) cancelAnimationFrame(raf.current);
        raf.current = null;
        pending.current = null;
        onValueChange(v);
        return;
      }
      pending.current = v;
      if (raf.current == null) raf.current = requestAnimationFrame(flush);
    },
    [flush, onValueChange, safeEnd, start],
  );

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return clamp(value, start, safeEnd);
      const r = el.getBoundingClientRect();
      const t = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
      const raw = start + t * span;
      const snapped = start + Math.round((raw - start) / step) * step;
      return clamp(snapped, start, safeEnd);
    },
    [safeEnd, span, start, step, value],
  );

  useEffect(() => {
    if (!dragging.current) setPreview(null);
  }, [value]);

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.ts-mark')) return;
    dragging.current = true;
    setActive(true);
    trackRef.current?.setPointerCapture(e.pointerId);
    commit(valueFromClientX(e.clientX), true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    commit(valueFromClientX(e.clientX));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    setActive(false);
    try {
      trackRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    commit(valueFromClientX(e.clientX), true);
    setPreview(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = step * 12;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      commit(display - (e.shiftKey ? big : step), true);
      setPreview(null);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      commit(display + (e.shiftKey ? big : step), true);
      setPreview(null);
    } else if (e.key === 'Home') {
      e.preventDefault();
      commit(start, true);
      setPreview(null);
    } else if (e.key === 'End') {
      e.preventDefault();
      commit(safeEnd, true);
      setPreview(null);
    }
  };

  return (
    <div
      className={`timeline-scrubber ${active ? 'is-scrubbing' : ''} ${className ?? ''}`.trim()}
      data-tone={tone}
      role="group"
      aria-labelledby={labelId}
    >
      <div className="ts-labels" id={labelId}>
        <span>{formatValue ? formatValue(start) : start}</span>
        <span className="ts-cursor">{formatValue ? formatValue(display) : display}</span>
        <span>{formatValue ? formatValue(safeEnd) : safeEnd}</span>
      </div>
      <div
        ref={trackRef}
        className="ts-track"
        role="slider"
        tabIndex={0}
        aria-label={region}
        aria-valuemin={start}
        aria-valuemax={safeEnd}
        aria-valuenow={display}
        aria-valuetext={typeof formatValue?.(display) === 'string' ? String(formatValue(display)) : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <span className="ts-rail" aria-hidden />
        <span className="ts-fill" aria-hidden style={{ width: `${ratio * 100}%` }} />
        <motion.span
          className="ts-playhead"
          aria-hidden
          style={{ left: `${ratio * 100}%` }}
          animate={active || reduce ? undefined : { scaleY: 1 }}
          transition={{ duration: 0 }}
        >
          <span className="ts-knob" />
        </motion.span>
        {ticks?.map((tick, i) => {
          const left = clamp((tick.value - start) / span, 0, 1) * 100;
          const t = tick.tone ?? 'neutral';
          return (
            <motion.button
              key={tick.id}
              type="button"
              className={`ts-mark tone-${t}`}
              style={{ left: `${left}%` }}
              title={tick.label ?? TONE_NAME[t]}
              aria-label={tick.label ?? `${TONE_NAME[t]} at ${tick.value}`}
              tabIndex={-1}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onTickJump?.(tick)}
              initial={reduce ? false : { opacity: 0, y: 6, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={reduce ? { duration: 0 } : { delay: Math.min(i * 0.015, 0.25), type: 'spring', stiffness: 380, damping: 24 }}
              whileHover={reduce || active ? undefined : { scale: 1.12, y: -2 }}
            >
              <span className="ts-mark-stem" aria-hidden />
              <span className="ts-mark-orb" aria-hidden>
                <span className="ts-mark-ring" />
                <span className="ts-mark-core" />
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
