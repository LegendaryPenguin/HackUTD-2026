/* Custom themed asset icons (SVG). All take `size` and `color` props. */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number; color?: string };

export function TankIcon({ size = 22, color = 'currentColor', ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...r}>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
      <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" opacity=".5" />
    </svg>
  );
}

export function PumpIcon({ size = 22, color = 'currentColor', ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...r}>
      <circle cx="10" cy="13" r="5.5" />
      <circle cx="10" cy="13" r="1.6" fill={color} />
      <path d="M15.5 13H21M19 10.5V13M4 20h12" />
      <path d="M10 7.5V4h3" />
    </svg>
  );
}

export function WellIcon({ size = 22, color = 'currentColor', ...r }: P) {
  // pumpjack silhouette
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...r}>
      <path d="M3 20h18" />
      <path d="M8 20l3-10 3 10" />
      <path d="M5 9.5L19 7.5" />
      <path d="M18 7.5l2 4M5 9.5v4" />
      <circle cx="11" cy="10" r="1" fill={color} />
    </svg>
  );
}

export function PipelineIcon({ size = 22, color = 'currentColor', ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...r}>
      <path d="M3 9h7a4 4 0 0 1 4 4v2h7" />
      <path d="M3 13h7" opacity=".5" />
      <path d="M14 15v3M21 12v6" />
    </svg>
  );
}

export function DisposalIcon({ size = 22, color = 'currentColor', ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...r}>
      <path d="M4 8h16" />
      <path d="M12 8v12" />
      <path d="M8 14l4 4 4-4" />
      <path d="M7 4h10" opacity=".5" />
    </svg>
  );
}

export function TruckIcon({ size = 22, color = 'currentColor', ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...r}>
      <path d="M3 7h10v9H3z" />
      <path d="M13 10h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.8" fill="var(--bg-1)" />
      <circle cx="17" cy="17.5" r="1.8" fill="var(--bg-1)" />
      <path d="M5 11c2 1 4 1 6 0" opacity=".6" />
    </svg>
  );
}

export function DropIcon({ size = 22, color = 'currentColor', ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...r}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
      <path d="M9.5 14.5c0 1.4 1.1 2.5 2.5 2.5" opacity=".6" />
    </svg>
  );
}

export function LeakIcon({ size = 22, color = 'currentColor', ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...r}>
      <path d="M3 8h7M14 8h7" />
      <path d="M3 12h5M16 12h5" opacity=".5" />
      <path d="M12 10s2.5 2.8 2.5 4.6a2.5 2.5 0 0 1-5 0C9.5 12.8 12 10 12 10z" fill={color} fillOpacity=".25" />
    </svg>
  );
}

export function WearIcon({ size = 22, color = 'currentColor', ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...r}>
      <path d="M4 17l4-6 4 3 4-7 4 5" />
      <path d="M4 20h16" opacity=".4" />
    </svg>
  );
}
