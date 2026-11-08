import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

type Emphasis = 'none' | 'warn' | 'critical' | 'ok';

const EMPHASIS: Record<Emphasis, CSSProperties> = {
  none: {},
  warn: { borderColor: 'rgba(244, 162, 97, 0.45)' },
  critical: { borderColor: 'rgba(255, 49, 49, 0.5)' },
  ok: { borderColor: 'rgba(132, 241, 180, 0.4)' },
};

function useCoarsePointer() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Aceternity-style industrial card — restrained tilt, matte depth. */
export function IndustrialCard({
  children,
  className = '',
  style,
  emphasis = 'none',
  interactive = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  emphasis?: Emphasis;
  interactive?: boolean;
}) {
  const reduce = useReducedMotion();
  const coarse = useCoarsePointer();
  const tiltOn = interactive && !reduce && !coarse;
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const rotX = useSpring(0, { stiffness: 240, damping: 24, mass: 0.35 });
  const rotY = useSpring(0, { stiffness: 240, damping: 24, mass: 0.35 });
  const glare = useMotionTemplate`radial-gradient(380px circle at ${mx}% ${my}%, rgba(0, 180, 216, 0.12), transparent 45%)`;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!tiltOn || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    mx.set(px * 100);
    my.set(py * 100);
    rotX.set((0.5 - py) * 7);
    rotY.set((px - 0.5) * 8);
  };

  const onLeave = () => {
    setHover(false);
    rotX.set(0);
    rotY.set(0);
    mx.set(50);
    my.set(50);
  };

  return (
    <motion.div
      ref={ref}
      className={`card industrial-card ${className}`.trim()}
      onPointerMove={onMove}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={onLeave}
      style={{
        transformStyle: 'preserve-3d',
        perspective: 900,
        scale: hover && tiltOn ? 1.01 : 1,
        rotateX: tiltOn ? rotX : 0,
        rotateY: tiltOn ? rotY : 0,
        ...EMPHASIS[emphasis],
        ...style,
      }}
    >
      <motion.div
        aria-hidden
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          background: glare,
          opacity: tiltOn && hover ? 1 : 0,
          transition: 'opacity .2s ease',
        }}
      />
      <div style={{ position: 'relative', transform: 'translateZ(12px)' }}>{children}</div>
    </motion.div>
  );
}
