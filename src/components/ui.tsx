import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { Category } from '../lib/types';
import { CATEGORY_LABEL, fmt } from '../lib/model';
import { LeakIcon, PumpIcon, WearIcon } from './Icons';
import { IndustrialCard } from './motion/IndustrialCard';

export const catColor: Record<Category, 'coral' | 'amber' | 'violet'> = {
  pump_failure: 'coral',
  pipeline_leak: 'amber',
  pump_degradation: 'violet',
};
export const catHex: Record<Category, string> = {
  pump_failure: '#ff3131',
  pipeline_leak: '#f4a261',
  pump_degradation: '#a100ff',
};

export function CategoryChip({ cat, pulse }: { cat: Category; pulse?: boolean }) {
  const Icon = cat === 'pump_failure' ? PumpIcon : cat === 'pipeline_leak' ? LeakIcon : WearIcon;
  return (
    <span className={`chip ${catColor[cat]}`}>
      {pulse ? <i className="dot pulse" /> : <Icon size={13} />}
      {CATEGORY_LABEL[cat]}
    </span>
  );
}

export function StatusChip({ status }: { status: 'ongoing' | 'resolved' }) {
  return status === 'ongoing' ? (
    <span className="chip coral"><i className="dot pulse" />Ongoing</span>
  ) : (
    <span className="chip mint"><CheckCircle2 size={12} />Resolved</span>
  );
}

/** Horizontal meter with optional limit marks and ruler ticks (Enchantress style). */
export function Meter({
  value, max = 100, warn, shut, ruler = true, height = 14, color,
}: { value: number; max?: number; warn?: number; shut?: number; ruler?: boolean; height?: number; color?: 'aqua' | 'amber' | 'coral' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tone = color ?? (shut != null && value >= shut ? 'coral' : warn != null && value >= warn ? 'amber' : 'aqua');
  return (
    <div>
      <div className="meter" style={{ height }}>
        <motion.div className={`fill ${tone}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} />
        {warn != null && <span className="mark warn" style={{ left: `${(warn / max) * 100}%` }} />}
        {shut != null && <span className="mark shut" style={{ left: `${(shut / max) * 100}%` }} />}
      </div>
      {ruler && (
        <div className="ruler">
          {[0, 25, 50, 75, 100].map((p) => (
            <span key={p} style={{ left: `${p}%` }}>{Math.round((p / 100) * max)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.85 ? 'mint' : value >= 0.6 ? 'amber' : 'ghost';
  return (
    <span className={`chip ${tone} tip`}>
      <svg width="34" height="8" viewBox="0 0 34 8" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={i * 7} y="0" width="5" height="8" rx="1.5" fill="currentColor" opacity={value >= (i + 1) / 5 - 0.05 ? 1 : 0.25} />
        ))}
      </svg>
      {pct}%
      <span className="tipbox">Confidence the readings really show this problem</span>
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <IndustrialCard className="pad" interactive={false} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</div>
      <div className="big num" style={{ color: tone }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </IndustrialCard>
  );
}

export function Countdown({ hours, tripsAt }: { hours: number; tripsAt: number | null }) {
  if (!isFinite(hours)) return <span className="chip mint"><CheckCircle2 size={12} />Never trips before repair</span>;
  if (hours <= 0) return <span className="chip coral"><ShieldAlert size={12} />Shut in now</span>;
  const tone = hours < 1.5 ? 'coral' : hours < 3 ? 'amber' : 'aqua';
  return (
    <span className={`chip ${tone}`}>
      <AlertTriangle size={12} />
      trips in {fmt.dur(hours)} · {tripsAt ? fmt.time(tripsAt) : ''}
    </span>
  );
}

export function Section({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <IndustrialCard className="pad" interactive={false}>
      <h3 className="card-title">{title}{right && <span className="muted">{right}</span>}</h3>
      {children}
    </IndustrialCard>
  );
}

export const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number] },
};
