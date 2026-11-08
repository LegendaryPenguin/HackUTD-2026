import { motion } from 'framer-motion';
import { useId } from 'react';

/**
 * Animated liquid tank. Level animates, liquid has a slow wave, limit lines for warning/shutdown.
 */
export function TankGauge({
  level, warn, shut, width = 84, height = 110, label, failed,
}: { level: number; warn: number; shut: number; width?: number; height?: number; label?: string; failed?: boolean }) {
  const id = useId().replace(/:/g, '');
  const tone = level >= shut ? 'var(--coral)' : level >= warn ? 'var(--amber)' : 'var(--aqua)';
  const pad = 6;
  const innerH = height - pad * 2;
  const y = pad + innerH * (1 - Math.max(0, Math.min(100, level)) / 100);
  const waveW = width * 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={`clip-${id}`}>
          <rect x={pad} y={pad} width={width - pad * 2} height={innerH} rx={10} />
        </clipPath>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity=".95" />
          <stop offset="100%" stopColor={tone} stopOpacity=".55" />
        </linearGradient>
      </defs>
      {/* glass */}
      <rect x={pad} y={pad} width={width - pad * 2} height={innerH} rx={10} fill="rgba(255,255,255,.04)" stroke="rgba(148,184,220,.3)" strokeWidth="1.5" />
      {/* liquid */}
      <g clipPath={`url(#clip-${id})`}>
        <motion.g initial={{ y: innerH }} animate={{ y: y - pad }} transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1] }}>
          <g style={{ animation: 'wave 3.2s linear infinite' }}>
            <path
              d={`M0 ${pad} Q ${width / 4} ${pad - 4} ${width / 2} ${pad} T ${width} ${pad} T ${waveW * 0.75} ${pad} T ${waveW} ${pad} V ${height + 40} H 0 Z`}
              fill={`url(#g-${id})`}
            />
          </g>
          <g style={{ animation: 'wave 4.6s linear infinite reverse', opacity: 0.5 }}>
            <path
              d={`M0 ${pad + 2} Q ${width / 4} ${pad - 2} ${width / 2} ${pad + 2} T ${width} ${pad + 2} T ${waveW * 0.75} ${pad + 2} T ${waveW} ${pad + 2} V ${height + 40} H 0 Z`}
              fill={tone}
            />
          </g>
        </motion.g>
      </g>
      {/* limits */}
      {[{ v: warn, c: 'var(--amber)' }, { v: shut, c: 'var(--coral)' }].map(({ v, c }) => {
        const ly = pad + innerH * (1 - v / 100);
        return <line key={v} x1={pad - 3} x2={width - pad + 3} y1={ly} y2={ly} stroke={c} strokeWidth="1.5" strokeDasharray="3 3" opacity=".9" />;
      })}
      {/* value */}
      <text x={width / 2} y={height / 2 + 5} textAnchor="middle" fontFamily="var(--font-display)" fontWeight="700" fontSize="17" fill="#fff" style={{ paintOrder: 'stroke', stroke: 'rgba(8,14,26,.7)', strokeWidth: 3 }}>
        {level.toFixed(0)}%
      </text>
      {failed && <circle cx={width - pad} cy={pad} r="5" fill="var(--coral)" stroke="var(--bg-1)" strokeWidth="2" />}
      {label && <text x={width / 2} y={height + 14} textAnchor="middle" fontSize="11" fill="var(--ink-2)">{label}</text>}
    </svg>
  );
}
