/**
 * Soft industrial steam / vapor plume for map pins.
 * Pattern inspired by classic SVG smokestack particle loops (no deps).
 */
export function MapSteam({
  inv = 1,
  intensity = 1,
  tone = 'steam',
}: {
  inv?: number;
  /** 0.4–1.6 relative plume strength */
  intensity?: number;
  tone?: 'steam' | 'flare' | 'haze';
}) {
  const s = Math.max(0.35, intensity);
  const fill =
    tone === 'flare' ? 'rgba(255, 176, 96, 0.55)'
      : tone === 'haze' ? 'rgba(154, 228, 239, 0.4)'
        : 'rgba(230, 242, 255, 0.55)';
  const puffs = [
    { cx: -6, delay: '0s', dur: '3.6s', scale: 1 },
    { cx: 2, delay: '0.7s', dur: '4.1s', scale: 0.85 },
    { cx: 8, delay: '1.4s', dur: '3.2s', scale: 1.1 },
    { cx: -2, delay: '2.1s', dur: '4.6s', scale: 0.75 },
    { cx: 5, delay: '2.8s', dur: '3.8s', scale: 0.95 },
  ];

  return (
    <g className="map-steam" style={{ pointerEvents: 'none' }} opacity={0.55 + s * 0.35}>
      {puffs.map((p, i) => (
        <ellipse
          key={i}
          className="map-steam__puff"
          cx={p.cx * inv * s}
          cy={-18 * inv * s}
          rx={5.5 * inv * p.scale * s}
          ry={4.2 * inv * p.scale * s}
          fill={fill}
          style={{
            ['--steam-x' as string]: `${(p.cx * 0.6 + 4) * inv * s}px`,
            ['--steam-y' as string]: `${-42 * inv * s}px`,
            animationDuration: p.dur,
            animationDelay: p.delay,
          }}
        />
      ))}
    </g>
  );
}
