/** Night Tide map stickers — Enchantress-scale labeled pins on terrain. */
import { useId } from 'react';
import tankArt from '../assets/night-tide/icons/facility-tank.png';
import wellArt from '../assets/night-tide/icons/well-pumpjack.png';
import disposalArt from '../assets/night-tide/icons/disposal-intake.png';
import truckArt from '../assets/night-tide/icons/tanker-truck.png';
import oilCenter1 from '../assets/night-tide/icons/oil-centers/oil-center-1.png';
import oilCenter2 from '../assets/night-tide/icons/oil-centers/oil-center-2.png';
import oilCenter3 from '../assets/night-tide/icons/oil-centers/oil-center-3.png';
import oilCenter4 from '../assets/night-tide/icons/oil-centers/oil-center-4.png';
import oilCenter5 from '../assets/night-tide/icons/oil-centers/oil-center-5.png';
import fieldBg from '../assets/night-tide/backgrounds/moonlit-oilfield.png';
import basinBg from '../assets/night-tide/backgrounds/midnight-permian-basin.png';
import desertBg from '../assets/night-tide/backgrounds/miniature-desert.png';
import wireframeTide from '../assets/night-tide/backgrounds/wireframe-tide.jpg';
import topoTide from '../assets/night-tide/backgrounds/wireframe-tide-map.jpg';

/** Periwinkle / seafoam + sibling palette — cycle when oil centers exceed 5. */
export const OIL_CENTER_ICONS = [
  oilCenter1,
  oilCenter2,
  oilCenter3,
  oilCenter4,
  oilCenter5,
] as const;

/** 1-based oil-center index → icon (wraps for S6+, facility 6+, etc.). */
export function oilCenterArt(index1Based: number): string {
  const n = OIL_CENTER_ICONS.length;
  const i = ((Math.floor(index1Based) - 1) % n + n) % n;
  return OIL_CENTER_ICONS[i];
}

/** S1→1 … S5→5; unknown ids fall back to 1. */
export function systemOilCenterIndex(systemId: string): number {
  const m = systemId.toUpperCase().match(/S(\d+)/);
  if (m) return Math.max(1, parseInt(m[1], 10));
  return 1;
}

/** Building-thread stickers for S1–S5 (and beyond via wrap). */
export const systemThreads: Record<string, string> = {
  S1: oilCenterArt(1),
  S2: oilCenterArt(2),
  S3: oilCenterArt(3),
  S4: oilCenterArt(4),
  S5: oilCenterArt(5),
};

/** Oil-center (disposal hub) art for a system id. */
export function systemThreadArt(systemId: string): string {
  return oilCenterArt(systemOilCenterIndex(systemId));
}

export const mapArt = {
  tank: tankArt,
  well: wellArt,
  pump: wellArt,
  disposal: disposalArt,
  truck: truckArt,
  system: oilCenterArt(1),
} as const;

export const mapBackgrounds = {
  moonlit: fieldBg,
  basin: basinBg,
  desert: desertBg,
  wireframe: wireframeTide,
  /** Primary field map — cyber topo grid */
  topo: topoTide,
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

  // Oil-center buildings sit on the middle disposal hub (and kind="system"), not tanks.
  const hubSystem = (kind === 'disposal' || kind === 'system') && badge
    ? (badge.toUpperCase().match(/S\d+/)?.[0] ?? badge.toUpperCase())
    : undefined;
  const isOilCenter = Boolean(hubSystem) || kind === 'system';
  const src = isOilCenter
    ? oilCenterArt(systemOilCenterIndex(hubSystem ?? badge ?? 'S1'))
    : mapArt[kind];

  const showBadge = Boolean(badge);
  const half = s / 2;
  const isWide = isOilCenter;
  const isTruck = kind === 'truck';
  const useShadow = !isOilCenter;
  // Tanker is a wide side profile; oil centers read taller.
  const imgW = isTruck ? s * 1.7 : s;
  const imgH = isWide ? s * 0.86 : isTruck ? s * 0.7 : s;
  const imgX = isTruck ? -imgW / 2 : -half;
  const imgY = isWide ? -half * 0.86 : isTruck ? -imgH * 0.55 : -half;
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
        {useShadow && (
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow
              dx="0"
              dy={3 * inv}
              stdDeviation={active || trouble ? 5 * inv : 2.8 * inv}
              floodColor={trouble ? (glow ?? '#fb7185') : shadowColor}
              floodOpacity={trouble ? 0.6 : active ? 0.5 : 0.4}
            />
          </filter>
        )}
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
        href={src}
        x={imgX}
        y={imgY}
        width={imgW}
        height={imgH}
        filter={useShadow ? `url(#${filterId})` : undefined}
        preserveAspectRatio="xMidYMid meet"
        style={{ pointerEvents: 'none' }}
      />
      {showBadge && (
        <g transform={`translate(${s * 0.34}, ${s * 0.32})`} style={{ pointerEvents: 'none' }}>
          <circle r={badgeR} fill="rgba(6, 22, 34, 0.92)" stroke={glow ?? 'var(--aqua)'} strokeWidth={1.6 * inv} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={(badge?.length ?? 0) > 2 ? badgeR * 0.85 : badgeR * 1.05}
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
