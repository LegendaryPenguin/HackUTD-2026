import { useReducedMotion } from 'framer-motion';
import './water-jug-3d.css';

/**
 * 3D glass jar — water height tracks tank % (warn / shut tones).
 */
export function WaterJug3D({
  level,
  warn,
  shut,
  failed,
  label,
  size = 'md',
}: {
  level: number;
  warn: number;
  shut: number;
  failed?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, Number.isFinite(level) ? level : 0));
  const tone = pct >= shut ? 'critical' : pct >= warn ? 'warn' : 'ok';
  const fill = Math.max(4, pct);

  return (
    <div
      className={`water-jug size-${size} tone-${tone}${failed ? ' is-failed' : ''}${reduce ? ' is-static' : ''}`}
      role="img"
      aria-label={label ? `${label} ${pct.toFixed(0)} percent` : `${pct.toFixed(0)} percent`}
    >
      <div className="water-jug-stage">
        <div className="water-jug-shadow" aria-hidden />
        <div className="water-jug-body">
          <div className="water-jug-rim" aria-hidden />
          <div className="water-jug-glass">
            <div className="water-jug-shine" aria-hidden />
            <div className="water-jug-fill" style={{ height: `${fill}%` }}>
              <i className="water-jug-wave" aria-hidden />
              <i className="water-jug-wave b" aria-hidden />
            </div>
            <span className="water-jug-limit warn" style={{ bottom: `${warn}%` }} aria-hidden />
            <span className="water-jug-limit shut" style={{ bottom: `${shut}%` }} aria-hidden />
          </div>
          <div className="water-jug-base" aria-hidden />
        </div>
      </div>
      <strong className="water-jug-pct">{pct.toFixed(0)}%</strong>
      {label && <span className="water-jug-label">{label}</span>}
    </div>
  );
}
