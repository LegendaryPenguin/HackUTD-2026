/** Night Tide map stickers — Enchantress-scale labeled pins on terrain. */
import { useId } from 'react';
import tankArt from '../assets/night-tide/icons/facility-tank.png';
import wellArt from '../assets/night-tide/icons/well-pumpjack.png';
import disposalArt from '../assets/night-tide/icons/disposal-intake.png';
import truckArt from '../assets/night-tide/icons/tanker-truck.png';
import fieldBg from '../assets/night-tide/backgrounds/moonlit-oilfield.png';
import basinBg from '../assets/night-tide/backgrounds/midnight-permian-basin.png';
import desertBg from '../assets/night-tide/backgrounds/miniature-desert.png';

export const mapArt = {
  tank: tankArt,
  well: wellArt,
  pump: wellArt,
  disposal: disposalArt,
  truck: truckArt,
} as const;

export const mapBackgrounds = {
  moonlit: fieldBg,
  basin: basinBg,
  desert: desertBg,
} as const;

export type MapArtKind = keyof typeof mapArt;

/** Letter / short code for sticker identity (Facility A → "A", S3 trucks → "S3"). */
export function facilityBadge(id: string): string {
  const m = id.match(/_FACILITY_([A-Z0-9]+)$/i);
  return m ? m[1].toUpperCase() : id.slice(-1).toUpperCase();
}
export function wellBadge(id: string): string {
  const m = id.match(/_WELL_([A-Z0-9]+)$/i);
  return m ? m[1].toUpperCase() : '?';
}

/**
 * Flat sticker at (0,0). Sized in SVG units; pass `inv=1/k` so screen size stays
 * Enchantress-like (~9–12% of map width) while zooming.
 */
export function MapPin({
  kind, size = 96, inv = 1, glow, dim, active, trouble, badge,
}: {
  kind: MapArtKind;
  size?: number;
  inv?: number;
  glow?: string;
  dim?: boolean;
  active?: boolean;
  trouble?: boolean;
  /** Identity plate — A–J facilities, well codes, S1… hubs. */
  badge?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const s = size * inv;
  const filterId = `pin-soft-${uid}`;
  const lift = active ? -6 * inv : 0;
  const scale = active ? 1.12 : 1;
  const shadowColor = glow ?? '#0a1c28';
  const badgeR = Math.max(9 * inv, s * 0.18);
  return (
    <g
      opacity={dim ? 0.32 : 1}
      style={{
        transition: 'opacity .28s ease, transform .32s cubic-bezier(.2,.85,.25,1)',
        transform: `translate(0px, ${lift}px) scale(${scale})`,
        transformOrigin: 'center',
        transformBox: 'fill-box',
      }}
      className={active ? 'map-pin is-active' : 'map-pin'}
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0"
            dy={3 * inv}
            stdDeviation={active || trouble ? 5 * inv : 2.8 * inv}
            floodColor={trouble ? (glow ?? '#fb7185') : shadowColor}
            floodOpacity={trouble ? 0.6 : active ? 0.5 : 0.4}
          />
        </filter>
      </defs>
      {(trouble || active) && glow && (
        <ellipse
          cx={0}
          cy={s * 0.14}
          rx={s * (trouble ? 0.4 : 0.32)}
          ry={s * (trouble ? 0.2 : 0.14)}
          fill={glow}
          opacity={trouble ? 0.24 : 0.14}
          style={{ transition: 'all .28s ease' }}
        />
      )}
      <image
        href={mapArt[kind]}
        x={-s / 2}
        y={-s / 2}
        width={s}
        height={s}
        filter={`url(#${filterId})`}
        preserveAspectRatio="xMidYMid meet"
        style={{ pointerEvents: 'none' }}
      />
      {badge && (
        <g transform={`translate(${s * 0.34}, ${s * 0.32})`} style={{ pointerEvents: 'none' }}>
          <circle r={badgeR} fill="rgba(6, 22, 34, 0.92)" stroke={glow ?? 'var(--aqua)'} strokeWidth={1.6 * inv} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={badge.length > 2 ? badgeR * 0.85 : badgeR * 1.05}
            fontWeight={800}
            fill="var(--ink-0)"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            {badge}
          </text>
        </g>
      )}
    </g>
  );
}
