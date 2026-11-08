/** Night Tide map stickers — Enchantress-scale labeled pins on terrain. */
import { useId } from 'react';
import tankArt from '../assets/night-tide/icons/facility-tank.png';
import wellArt from '../assets/night-tide/icons/well-pumpjack.png';
import disposalArt from '../assets/night-tide/icons/disposal-intake.png';
import truckArt from '../assets/night-tide/icons/tanker-truck.png';
import systemS1 from '../assets/night-tide/icons/systems/system-S1.png';
import systemS2 from '../assets/night-tide/icons/systems/system-S2.png';
import systemS3 from '../assets/night-tide/icons/systems/system-S3.png';
import systemS4 from '../assets/night-tide/icons/systems/system-S4.png';
import systemS5 from '../assets/night-tide/icons/systems/system-S5.png';
import fieldBg from '../assets/night-tide/backgrounds/moonlit-oilfield.png';
import basinBg from '../assets/night-tide/backgrounds/midnight-permian-basin.png';
import desertBg from '../assets/night-tide/backgrounds/miniature-desert.png';
import wireframeTide from '../assets/night-tide/backgrounds/wireframe-tide.jpg';

/** System → thread station sticker (baked S# glyphs are clipped; MapPin draws one plate). */
export const systemThreads: Record<string, string> = {
  S1: systemS1,
  S2: systemS2,
  S3: systemS3,
  S4: systemS4,
  S5: systemS5,
};

export function systemThreadArt(systemId: string): string {
  const key = systemId.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = key.match(/S[1-5]/);
  return systemThreads[m?.[0] ?? key] ?? systemS1;
}

export const mapArt = {
  tank: tankArt,
  well: wellArt,
  pump: wellArt,
  disposal: disposalArt,
  truck: truckArt,
  system: systemS1,
} as const;

export const mapBackgrounds = {
  moonlit: fieldBg,
  basin: basinBg,
  desert: desertBg,
  wireframe: wireframeTide,
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
  const systemKey = kind === 'system' && badge
    ? (badge.toUpperCase().match(/S[1-5]/)?.[0] ?? badge.toUpperCase())
    : undefined;
  const system = systemKey ? systemThreads[systemKey] : undefined;
  const src = system ?? mapArt[kind];
  // Systems: cover baked S# glyphs with one plate — never also render the chip badge.
  const showSystemPlate = Boolean(system && systemKey);
  const showBadge = Boolean(badge) && kind !== 'system';
  const half = s / 2;
  const isWide = Boolean(system);
  const useShadow = !system;
  const imgH = isWide ? s * 0.72 : s;
  const imgY = isWide ? -half * 0.72 : -half;
  // Letter band sits mid-lower on Night Tide stickers — mask + single stamp.
  const maskGradId = `sys-mask-${uid}`;
  const coverW = Math.max(36 * inv, s * 0.62);
  const coverH = Math.max(24 * inv, s * 0.34);
  const coverY = imgY + imgH * 0.5;
  const plateW = Math.max(28 * inv, s * 0.36);
  const plateH = Math.max(14 * inv, s * 0.17);
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
        {showSystemPlate && (
          <linearGradient id={maskGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(8,14,20)" stopOpacity="0" />
            <stop offset="28%" stopColor="rgb(8,14,20)" stopOpacity="0.92" />
            <stop offset="100%" stopColor="rgb(8,14,20)" stopOpacity="0.96" />
          </linearGradient>
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
        x={-half}
        y={imgY}
        width={s}
        height={imgH}
        filter={useShadow ? `url(#${filterId})` : undefined}
        preserveAspectRatio="xMidYMid meet"
        style={{ pointerEvents: 'none' }}
      />
      {showSystemPlate && (
        <g style={{ pointerEvents: 'none' }}>
          <rect
            x={-coverW / 2}
            y={coverY}
            width={coverW}
            height={coverH}
            rx={coverH * 0.2}
            fill={`url(#${maskGradId})`}
          />
          <g transform={`translate(0, ${coverY + coverH * 0.58})`}>
            <rect
              x={-plateW / 2}
              y={-plateH / 2}
              width={plateW}
              height={plateH}
              rx={plateH * 0.35}
              fill="rgba(6, 14, 22, 0.98)"
              stroke={glow ?? 'rgba(132, 241, 180, 0.4)'}
              strokeWidth={1.35 * inv}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={plateH * 0.7}
              fontWeight={800}
              fill="#f4f7fa"
              style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
            >
              {systemKey}
            </text>
          </g>
        </g>
      )}
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
