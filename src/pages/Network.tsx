import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Maximize2 } from 'lucide-react';
import { useStore } from '../state/store';
import { facilities, fmt, hoursToLimit } from '../lib/model';
import type { System } from '../lib/types';
import { liveFacility, statusColor, statusLabel, type LiveFacility } from '../lib/status';
import { applyDispatchOverlay, dispatchForFacility } from '../lib/dispatch';
import {
  MapPin,
  facilityBadge,
  wellBadge,
  mapArt,
  mapBackgrounds,
  oilCenterArt,
} from '../components/MapMarkers';
import { FacilityTriageCard } from '../components/FacilityTriageCard';
import { FacilityStatusCard } from '../components/FacilityStatusCard';
import { InspectIssueCard } from '../components/InspectIssueCard';
import { FinancialsBox } from '../components/FinancialsBox';
import { LiquidMeter } from '../components/ui';
import { MapSteam } from '../components/MapSteam';

const W = 1100, H = 720;
const FIELD_BG = mapBackgrounds.topo;
/** Station stickers stay readable without eating the basin. */
const PIN = {
  facility: 96,
  facilityFocus: 110,
  facilityHot: 120,
  oilCenter: 108,
  oilCenterFocus: 132,
  truck: 40,
  truckFocus: 48,
  well: 44,
} as const;

type XY = [number, number];
type StationLayout = {
  disposal: XY;
  yard: XY;
  facilities: Record<string, XY>;
  /** Soft ring that groups the station visually. */
  ring: { x: number; y: number; r: number };
};

/**
 * Grid of station yards. Each cell gets disposal in the middle, then tanks + trucks
 * on a wide local ring so badges/rings never sit on top of each other.
 */
function buildStationLayout(systems: System[]): Map<string, StationLayout> {
  const ordered = [...systems].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const n = Math.max(1, ordered.length);
  const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const padX = 40;
  // Extra bottom pad so the last row clears the floating timeline in the SVG frame.
  const padTop = 36;
  const padBottom = 150;
  const cellW = (W - padX * 2) / cols;
  const cellH = (H - padTop - padBottom) / rows;
  // Keep assets inside the cell with clearance ≈ pin diameter (~100).
  // Room for larger oil-center hubs — ring grows with the pad.
  const localR = Math.min(cellW, cellH) * 0.36;
  const ringR = Math.min(cellW, cellH) * 0.5;
  const out = new Map<string, StationLayout>();

  ordered.forEach((sys, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Center leftover cells on the last row (e.g. 2 of 3).
    const rowCount = row === rows - 1 ? n - row * cols : cols;
    const rowOffset = ((cols - rowCount) * cellW) / 2;
    const hx = padX + rowOffset + col * cellW + cellW / 2;
    const hy = padTop + row * cellH + cellH / 2;

    const facN = sys.facilities.length;
    const slots = facN + 1; // facilities + truck, evenly spaced
    const facilities: Record<string, XY> = {};
    sys.facilities.forEach((f, j) => {
      const a = -Math.PI / 2 + ((j + 0.5) / slots) * Math.PI * 2;
      facilities[f.id] = [hx + Math.cos(a) * localR, hy + Math.sin(a) * localR];
    });
    const yardA = -Math.PI / 2 + ((facN + 0.5) / slots) * Math.PI * 2;
    out.set(sys.id, {
      disposal: [hx, hy],
      yard: [hx + Math.cos(yardA) * localR, hy + Math.sin(yardA) * localR],
      facilities,
      ring: { x: hx, y: hy, r: ringR },
    });
  });
  return out;
}

function isCritical(status: LiveFacility['status']) {
  return status === 'failure' || status === 'leak' || status === 'wear';
}

export default function Network() {
  const { dataset, analysis, now, dispatched } = useStore();
  const [params, setParams] = useSearchParams();
  const [hover, setHover] = useState<string | null>(null);
  const [manualFocus, setManualFocus] = useState<string | null>(null);
  const selectedId = params.get('f');

  const facs = useMemo(() => (dataset ? facilities(dataset.network, dataset.ops) : []), [dataset]);
  const live = useMemo(() => {
    if (!dataset || !analysis) return new Map<string, LiveFacility>();
    return new Map(facs.map((f) => {
      let L = liveFacility(dataset, f, now, analysis.ongoing);
      const d = dispatchForFacility(dispatched, f.id);
      if (d) L = applyDispatchOverlay(L, d, now, dataset);
      return [f.id, L] as const;
    }));
  }, [dataset, analysis, facs, now, dispatched]);

  const [narrow, setNarrow] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  /** Survives past pointerup so a drag doesn't also open a facility card. */
  const suppressClickRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  // Fresh framing whenever focus / selection changes.
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [manualFocus, selectedId]);
  const pinScale = narrow ? 0.7 : 1;

  const layout = useMemo(
    () => (dataset ? buildStationLayout(dataset.network.systems) : null),
    [dataset],
  );

  if (!dataset || !analysis || !layout) return null;

  // a selected facility always focuses its own system; otherwise use the manual pick
  const selectedFac = selectedId ? facs.find((x) => x.id === selectedId) : undefined;
  const sysFocus = selectedFac ? selectedFac.system : manualFocus;
  const setSysFocus = (id: string | null) => { setManualFocus(id); if (selectedId) setParams({}); };

  // Zoom a notch past "fit" so edges stick out — drag to slide stations toward center.
  const focusSys = dataset.network.systems.find((s) => s.id === sysFocus) ?? null;
  const packPts = (sys: System): XY[] => {
    const L = layout.get(sys.id)!;
    return [
      L.disposal,
      L.yard,
      ...Object.values(L.facilities),
      [L.ring.x - L.ring.r, L.ring.y],
      [L.ring.x + L.ring.r, L.ring.y],
      [L.ring.x, L.ring.y - L.ring.r],
      [L.ring.x, L.ring.y + L.ring.r],
    ];
  };
  const fitPts = focusSys
    ? packPts(focusSys)
    : dataset.network.systems.flatMap((s) => packPts(s));
  const fitPadX = focusSys ? (narrow ? 90 : 120) : (narrow ? 50 : 60);
  const fitPadTop = focusSys ? (narrow ? 100 : 120) : (narrow ? 50 : 55);
  const fitPadBottom = focusSys ? (narrow ? 110 : 130) : (narrow ? 70 : 80);
  const minX = Math.min(...fitPts.map((p) => p[0])) - fitPadX;
  const maxX = Math.max(...fitPts.map((p) => p[0])) + fitPadX;
  const minY = Math.min(...fitPts.map((p) => p[1])) - fitPadTop;
  const maxY = Math.max(...fitPts.map((p) => p[1])) + fitPadBottom;
  const baseFit = Math.min(W / (maxX - minX || 1), H / (maxY - minY || 1));
  const fitK = focusSys
    ? Math.min(baseFit * 1.08, narrow ? 2.05 : 2.35)
    : baseFit * (narrow ? 1.22 : 1.28);
  const panLimitX = Math.max(48, ((maxX - minX) * fitK - W) / 2 + 70);
  const panLimitY = Math.max(36, ((maxY - minY) * fitK - H) / 2 + 56);
  const clampPan = (x: number, y: number) => ({
    x: Math.max(-panLimitX, Math.min(panLimitX, x)),
    y: Math.max(-panLimitY, Math.min(panLimitY, y)),
  });
  // Bias the framed content slightly upward so nothing sits under the timeline.
  const transform = {
    k: fitK,
    x: W / 2 - ((minX + maxX) / 2) * fitK + pan.x,
    y: H * 0.46 - ((minY + maxY) / 2) * fitK + pan.y,
  };

  const clientToSvg = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  };
  const selected = selectedId ? live.get(selectedId) ?? null : null;
  // Open Identify/Decide/Act for any selected facility that still has an active pump-failure plan.
  const triageFail = selected
    ? analysis.orderedFailures.find((c) => c.facility.id === selected.f.id)
    : undefined;
  const showTriage = Boolean(selected && triageFail);
  const inspectEvent = selected && (selected.status === 'leak' || selected.status === 'wear')
    ? analysis.ongoing.find((e) =>
      e.facility === selected.f.id
      && (selected.status === 'leak' ? e.category === 'pipeline_leak' : e.category === 'pump_degradation'))
      ?? analysis.ongoing.find((e) => e.facility === selected.f.id)
    : null;
  const showInspect = Boolean(selected && inspectEvent && !showTriage);
  // Any other click: same glass card chrome, live data only (no recommendations).
  const showStatus = Boolean(selected && !showTriage && !showInspect);

  const stationFailureId = (systemId: string) => {
    const hit = analysis.orderedFailures.find((c) => c.facility.system === systemId);
    return hit?.facility.id ?? null;
  };

  const counts = { failure: 0, leak: 0, wear: 0, warning: 0, normal: 0 } as Record<string, number>;
  for (const l of live.values()) counts[l.status]++;

  const needYou = counts.failure + counts.leak + counts.wear;
  const failureIds = [...live.values()].filter((l) => l.status === 'failure').map((l) => l.f.id);
  const criticalIds = failureIds.length
    ? failureIds
    : [...live.values()].filter((l) => isCritical(l.status)).map((l) => l.f.id);

  return (
    <div className="map-screen">
      <div className="map-stage">
        <div className="map-parallax">
        {/* Fixed vignette only — the field photo lives in the SVG transform with the pins. */}
        <div className="map-topo map-topo--chrome" aria-hidden>
          <div className="map-topo__wave" />
        </div>
        <div className="map-mist" aria-hidden />
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={`map-svg${panning ? ' is-panning' : ''}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            // Only empty map chrome starts a pan — pins keep their clicks.
            if ((e.target as Element).closest('.map-pin-hit')) return;
            const svg = e.currentTarget;
            const local = clientToSvg(svg, e.clientX, e.clientY);
            dragRef.current = {
              pointerId: e.pointerId,
              x: local.x,
              y: local.y,
              panX: pan.x,
              panY: pan.y,
              moved: false,
            };
            svg.setPointerCapture(e.pointerId);
            setPanning(true);
          }}
          onPointerMove={(e) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== e.pointerId) return;
            const local = clientToSvg(e.currentTarget, e.clientX, e.clientY);
            const dx = local.x - drag.x;
            const dy = local.y - drag.y;
            if (!drag.moved && dx * dx + dy * dy > 9) drag.moved = true;
            if (!drag.moved) return;
            setPan(clampPan(drag.panX + dx, drag.panY + dy));
          }}
          onPointerUp={(e) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== e.pointerId) return;
            if (drag.moved) {
              suppressClickRef.current = true;
              window.setTimeout(() => { suppressClickRef.current = false; }, 0);
            }
            dragRef.current = null;
            setPanning(false);
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
          }}
          onPointerCancel={(e) => {
            dragRef.current = null;
            setPanning(false);
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
          }}
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="crit-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id="map-field-shade" cx="50%" cy="42%" r="68%">
              <stop offset="0%" stopColor="rgba(2,8,14,0)" />
              <stop offset="70%" stopColor="rgba(2,8,14,0.18)" />
              <stop offset="100%" stopColor="rgba(2,8,14,0.55)" />
            </radialGradient>
          </defs>
          {/* Drag surface — oversized so pan still grabs at the edges */}
          <rect
            x={-W}
            y={-H}
            width={W * 3}
            height={H * 3}
            fill="transparent"
            style={{ cursor: panning ? 'grabbing' : 'grab' }}
          />
          <g
            className="map-world"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
              transformOrigin: '0 0',
              transformBox: 'view-box',
              transition: panning ? 'none' : 'transform .55s cubic-bezier(.2,.8,.2,1)',
            }}
          >
            {/* Field photo in the same space as stations — pans/zooms with pins */}
            <image
              href={FIELD_BG}
              x={-W * 0.2}
              y={-H * 0.2}
              width={W * 1.4}
              height={H * 1.4}
              preserveAspectRatio="xMidYMid slice"
              style={{ pointerEvents: 'none' }}
            />
            <rect
              x={-W * 0.2}
              y={-H * 0.2}
              width={W * 1.4}
              height={H * 1.4}
              fill="url(#map-field-shade)"
              style={{ pointerEvents: 'none' }}
            />
            {dataset.network.systems.map((s) => (
              <SystemLayer
                key={s.id}
                sys={s}
                station={layout.get(s.id)!}
                live={live}
                hover={hover}
                setHover={setHover}
                selected={selectedId}
                failureId={stationFailureId(s.id)}
                onSelect={(id) => {
                  if (suppressClickRef.current || dragRef.current?.moved) return;
                  const L = live.get(id);
                  if (L?.status === 'failure' || analysis.orderedFailures.some((c) => c.facility.id === id)) {
                    setParams({ f: id, flow: 'identify' });
                  } else if (L && (L.status === 'leak' || L.status === 'wear')) {
                    setParams({ f: id });
                  } else {
                    setParams({ f: id });
                  }
                }}
                dim={!!sysFocus && sysFocus !== s.id}
                k={transform.k}
                focused={sysFocus === s.id}
                pinScale={pinScale}
              />
            ))}
          </g>
        </svg>
        </div>

        <div className="map-float map-float-tl">
          <div className="seg">
            <button className={!sysFocus ? 'on' : ''} onClick={() => { setSysFocus(null); }}><Maximize2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />All</button>
            {dataset.network.systems.map((s) => {
              const hot = s.facilities.some((f) => {
                const st = live.get(f.id)?.status;
                return st === 'failure' || st === 'leak' || st === 'wear';
              });
              const tone = s.facilities.some((f) => live.get(f.id)?.status === 'failure')
                ? 'var(--coral)'
                : s.facilities.some((f) => live.get(f.id)?.status === 'leak')
                  ? 'var(--amber)'
                  : 'var(--violet)';
              return (
                <button key={s.id} className={sysFocus === s.id ? 'on' : ''} onClick={() => setSysFocus(s.id)} style={{ color: hot && sysFocus !== s.id ? tone : undefined }}>
                  {s.id}
                </button>
              );
            })}
          </div>
          <div className="map-status-chips">
            {needYou > 0 && (
              <button
                type="button"
                className="btn primary sm"
                onClick={() => {
                  const next = criticalIds.find((id) => id !== selectedId) ?? criticalIds[0];
                  if (next) setParams({ f: next });
                }}
              >
                {failureIds.length
                  ? `${failureIds.length} pump fail${failureIds.length === 1 ? '' : 's'}`
                  : `${needYou} alert${needYou === 1 ? '' : 's'}`}
                {' '}<ArrowRight size={13} />
              </button>
            )}
            {(['failure', 'leak', 'wear'] as const).filter((s) => counts[s] > 0).map((s) => (
              <span key={s} className="chip ghost" style={{ color: statusColor[s] }}>
                <i className="dot" style={{ background: statusColor[s] }} /> {counts[s]} {statusLabel[s].toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="map-float map-float-tr">
          <FinancialsBox />
        </div>

        <div className="map-float map-float-bl map-legend">
          <LegendChip src={mapArt.tank} label="facility" />
          <LegendChip src={mapArt.well} label="well" />
          <LegendChip src={oilCenterArt(1)} label="oil center" />
          <LegendChip src={mapArt.truck} label="trucks" />
          <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--aqua)" strokeWidth="2" strokeDasharray="6 4" /></svg> flowing</span>
          <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--amber)" strokeWidth="2" strokeDasharray="3 3" /></svg> leak</span>
        </div>

        <AnimatePresence>
          {hover && live.get(hover) && !showTriage && !showInspect && !showStatus && (
            <motion.div
              key={hover}
              className="map-float map-hover-card"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <HoverCard l={live.get(hover)!} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showTriage && selected && (
          <FacilityTriageCard
            key={`triage-${selected.f.id}`}
            live={selected}
            initialStep={params.get('flow') === 'decide' || params.get('flow') === 'act' ? params.get('flow') as 'decide' | 'act' : 'identify'}
            onClose={() => setParams({})}
          />
        )}
        {showInspect && selected && inspectEvent && (
          <InspectIssueCard
            key={`inspect-${inspectEvent.id}`}
            live={selected}
            event={inspectEvent}
            onClose={() => setParams({})}
          />
        )}
        {showStatus && selected && (
          <FacilityStatusCard
            key={`status-${selected.f.id}`}
            live={selected}
            onClose={() => setParams({})}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LegendChip({ src, label }: { src: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <img src={src} alt="" width={24} height={24} style={{ borderRadius: 8, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.4))' }} />
      {label}
    </span>
  );
}

/** Label plate — offset from the pin so neighboring tips never share a point. */
function PinTip({
  title, sub, x = 0, y, anchor = 'middle',
}: {
  title: string;
  sub: string;
  x?: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
}) {
  const padX = anchor === 'middle' ? 0 : anchor === 'start' ? 6 : -6;
  return (
    <g transform={`translate(${x + padX}, ${y})`} style={{ pointerEvents: 'none' }}>
      <text textAnchor={anchor} fontSize={12} fontWeight={800} fill="var(--ink-0)"
        style={{ paintOrder: 'stroke', stroke: 'rgba(4,12,20,.92)', strokeWidth: 3.5 }}>
        {title}
      </text>
      <text y={14} textAnchor={anchor} fontSize={10} fontWeight={600} fill="var(--ink-2)"
        style={{ paintOrder: 'stroke', stroke: 'rgba(4,12,20,.9)', strokeWidth: 3 }}>
        {sub}
      </text>
    </g>
  );
}

/** Push a tip away from the station hub so it clears neighbors / disposal. */
function tipAwayFromHub(
  px: number, py: number, hx: number, hy: number, dist: number,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const dx = px - hx;
  const dy = py - hy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Prefer outward; if almost on the hub, drop below.
  const x = ux * dist;
  const y = Math.abs(ux) < 0.15 && Math.abs(uy) < 0.15 ? dist : uy * dist;
  const anchor: 'start' | 'middle' | 'end' =
    ux > 0.45 ? 'start' : ux < -0.45 ? 'end' : 'middle';
  return { x, y, anchor };
}

function SystemLayer({ sys, station, live, hover, setHover, selected, failureId, onSelect, dim, k, focused, pinScale }: {
  sys: System;
  station: StationLayout;
  live: Map<string, LiveFacility>;
  hover: string | null; setHover: (id: string | null) => void; selected: string | null;
  failureId: string | null;
  onSelect: (id: string) => void;
  dim: boolean; k: number; focused: boolean; pinScale: number;
}) {
  const [dx, dy] = station.disposal;
  const [yx, yy] = station.yard;
  const inv = 1 / k;
  const showWells = focused;
  const disposalKey = `${sys.id}-disposal`;
  const truckKey = `${sys.id}-trucks`;
  const oilSize = (focused ? PIN.oilCenterFocus : PIN.oilCenter) * pinScale;
  const truckSize = (focused ? PIN.truckFocus : PIN.truck) * pinScale;
  const ps = pinScale * (focused ? 0.9 : 0.68);
  const ringScale = focused ? 1.12 : 1;

  return (
    <g opacity={dim ? 0.12 : 1} style={{ transition: 'opacity .3s' }}>
      {/* Station pad — one island per system */}
      <circle
        className="map-pad-glow"
        cx={station.ring.x}
        cy={station.ring.y}
        r={station.ring.r * ringScale}
        fill={focused ? 'rgba(94,200,216,0.1)' : 'rgba(6,12,18,0.22)'}
        stroke={focused ? 'rgba(94,200,216,0.4)' : 'rgba(255,255,255,0.14)'}
        strokeWidth={1.4 * inv}
        style={{ pointerEvents: 'none', transition: 'r .35s ease' }}
      />
      {/* Overview only — focused view already has S# in the top chips; label collides with Facility A. */}
      {!focused && (
        <text
          x={station.ring.x}
          y={station.ring.y - station.ring.r * ringScale - 8 * inv}
          textAnchor="middle"
          fontSize={Math.max(12, 14 * inv)}
          fontWeight={800}
          fill="var(--ink-1)"
          letterSpacing="0.14em"
          style={{ pointerEvents: 'none', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          {sys.id}
        </text>
      )}

      {sys.facilities.map((f) => {
        const l = live.get(f.id)!;
        const [fx, fy] = station.facilities[f.id];
        const mx = (fx + dx) / 2 + (fy - dy) * 0.08;
        const my = (fy + dy) / 2 + (dx - fx) * 0.08;
        const flowing = l.pumpStatus === 1;
        const leak = l.status === 'leak';
        const stroke = leak ? 'var(--amber)' : flowing ? 'var(--aqua)' : 'rgba(120,150,170,.45)';
        const d = `M${fx},${fy} Q${mx},${my} ${dx},${dy}`;
        return (
          <g key={`pipe-${f.id}`}>
            {leak && (
              <path
                d={d}
                fill="none"
                stroke="var(--amber)"
                strokeWidth={12 * inv}
                opacity={0.2}
                filter="url(#crit-glow)"
                style={{ pointerEvents: 'none' }}
              />
            )}
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={(leak ? 5 : flowing ? 3 : 1.8) * inv}
              opacity={leak ? 1 : flowing ? 0.85 : focused ? 0.35 : 0.2}
              strokeDasharray={leak ? `${6 * inv} ${5 * inv}` : flowing ? `${10 * inv} ${7 * inv}` : undefined}
              className={flowing && !leak ? 'map-flow-dash' : undefined}
              style={{
                animation: leak ? `flow ${0.85}s linear infinite` : undefined,
                pointerEvents: 'none',
              }}
              filter={leak || flowing ? 'url(#glow)' : undefined}
            />
          </g>
        );
      })}

      {/* Short link from trucks to disposal */}
      <path
        d={`M${yx},${yy} L${dx},${dy}`}
        fill="none"
        stroke="rgba(148,163,176,0.35)"
        strokeWidth={1.6 * inv}
        strokeDasharray={`${4 * inv} ${4 * inv}`}
        style={{ pointerEvents: 'none' }}
      />

      <g
        className="map-pin-hit"
        transform={`translate(${dx},${dy})`}
        onMouseEnter={() => setHover(disposalKey)}
        onMouseLeave={() => setHover(null)}
      >
        <MapSteam inv={inv} intensity={focused ? 1.15 : 0.85} tone="haze" />
        <MapPin
          kind="disposal"
          size={oilSize}
          inv={inv}
          badge={sys.id}
          active={hover === disposalKey || focused}
          glow={hover === disposalKey || focused ? 'var(--aqua)' : undefined}
        />
        {/* Only the hovered hub — never keep disposal/truck labels on while focused. */}
        {hover === disposalKey && (
          <PinTip
            title={`${sys.id} oil center`}
            sub="station hub"
            y={(oilSize * 0.55 + 10) * inv}
          />
        )}
      </g>

      <g
        className="map-pin-hit"
        transform={`translate(${yx},${yy})`}
        onMouseEnter={() => setHover(truckKey)}
        onMouseLeave={() => setHover(null)}
      >
        <MapPin
          kind="truck"
          size={truckSize}
          inv={inv}
          badge={sys.id}
          active={hover === truckKey || focused}
          glow={hover === truckKey || focused ? 'var(--lagoon)' : undefined}
        />
        {hover === truckKey && (
          <PinTip
            title={`${sys.id} trucks`}
            sub="yard"
            {...tipAwayFromHub(yx, yy, dx, dy, (truckSize * 0.7 + 16) * inv)}
          />
        )}
      </g>

      {sys.facilities.map((f) => {
        const l = live.get(f.id)!;
        const [fx, fy] = station.facilities[f.id];
        const c = statusColor[l.status];
        const isSel = selected === f.id;
        const isHov = hover === f.id;
        const trouble = isCritical(l.status);
        const failed = l.status === 'failure' || failureId === f.id;
        const pin = (isSel || isHov || failed ? PIN.facilityHot : focused ? PIN.facilityFocus : PIN.facility) * ps;
        // One label at a time: this pin on hover, or selected while nothing else is hovered.
        const showTip = isHov || (isSel && hover === null);
        const showHalo = failed && (isHov || isSel || focused);
        const nWells = f.wells.length;
        // Clear the well orbit when focused so title/status don't sit on pumpjacks.
        const tipDist = ((showWells ? pin * 0.78 : pin * 0.55) + 26) * inv;
        const tip = tipAwayFromHub(fx, fy, dx, dy, tipDist);
        return (
          <g
            key={f.id}
            className="map-pin-hit"
            transform={`translate(${fx},${fy})`}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover(f.id)}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(f.id);
            }}
          >
            <circle r={(pin * 0.95) * inv} fill="transparent" />
            {showHalo && (
              <>
                <circle r={(pin * 0.48) * inv} fill="var(--coral)" opacity={0.1} filter="url(#crit-glow)" style={{ pointerEvents: 'none' }} />
                <circle r={(pin * 0.42) * inv} fill="none" stroke="var(--coral)" strokeWidth={2 * inv} opacity={0.85} className="map-crit-ring" style={{ pointerEvents: 'none' }} />
              </>
            )}
            {failed && !showHalo && (
              <circle r={(pin * 0.28) * inv} fill="none" stroke="var(--coral)" strokeWidth={2 * inv} opacity={0.7} style={{ pointerEvents: 'none' }} />
            )}
            <MapSteam
              inv={inv}
              intensity={failed ? 1.35 : trouble ? 1.1 : l.pumpStatus === 1 ? 0.9 : 0.55}
              tone={failed ? 'flare' : trouble ? 'haze' : 'steam'}
            />
            {showWells && f.wells.map((w, i) => {
              const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / Math.max(1, nWells);
              const rad = (pin * 0.72) * inv;
              const wx = Math.cos(ang) * rad;
              const wy = Math.sin(ang) * rad;
              const on = l.wells.find((x) => x.id === w.id)?.status === 1;
              const wKey = `${f.id}-${w.id}`;
              const wTip = tipAwayFromHub(fx + wx, fy + wy, fx, fy, (PIN.well * ps * 0.55 + 14) * inv);
              return (
                <g
                  key={w.id}
                  transform={`translate(${wx},${wy})`}
                  onMouseEnter={(e) => { e.stopPropagation(); setHover(wKey); }}
                  onMouseLeave={() => setHover(f.id)}
                >
                  <MapPin kind="well" size={PIN.well * ps} inv={inv} badge={wellBadge(w.id)} dim={!on} active={hover === wKey} />
                  {hover === wKey && (
                    <PinTip
                      title={fmt.short(w.id)}
                      sub={on ? 'producing' : 'shut in'}
                      x={wTip.x}
                      y={wTip.y}
                      anchor={wTip.anchor}
                    />
                  )}
                </g>
              );
            })}
            <MapPin
              kind="tank"
              size={pin}
              inv={inv}
              badge={facilityBadge(f.id)}
              glow={trouble || isHov || isSel ? c : undefined}
              trouble={trouble}
              active={isHov || isSel}
            />
            {showTip && (
              <PinTip
                title={fmt.short(f.id)}
                sub={statusLabel[l.status]}
                x={tip.x}
                y={tip.y}
                anchor={tip.anchor}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function hoverTone(status: LiveFacility['status']) {
  if (status === 'failure' || status === 'leak') return 'fault';
  if (status === 'wear' || status === 'warning') return 'warn';
  return 'ok';
}

function HoverCard({ l }: { l: LiveFacility }) {
  const netFill = Math.max(0, l.inflow - (l.pumpStatus === 1 ? l.pumpFlow : 0));
  const hrsWarn = hoursToLimit(l.level, l.f.tank.capacity_bbl, netFill, 85);
  const pumpMax = Math.max(1, l.f.pump.max_flow_bpd);
  const pipeMax = Math.max(1, l.f.pipeline.max_bpd);
  const online = l.wells.filter((w) => w.status === 1).length;
  const tone = hoverTone(l.status);
  return (
    <div className={`hover-card-viz tone-${tone}`}>
      <div className="hover-card-viz__accent" aria-hidden />
      <div className="hover-card-viz__head">
        <div className="hover-card-viz__icon">
          <img src={mapArt.tank} alt="" width={44} height={44} style={{ objectFit: 'contain' }} />
          <span className="chip aqua" style={{ position: 'absolute', right: -4, bottom: -4, fontSize: 10, padding: '1px 6px' }}>{facilityBadge(l.f.id)}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{fmt.short(l.f.id)}</b>
          <div className="dim" style={{ fontSize: 11 }}>{l.f.system} · {l.f.lat.toFixed(4)}, {l.f.lon.toFixed(4)}</div>
        </div>
        <span className={`hover-card-viz__chip tone-${tone}`}>
          <i className="dot" style={{ background: statusColor[l.status] }} />
          {statusLabel[l.status]}
        </span>
      </div>

      <div className="hover-card-viz__meters">
        <LiquidMeter
          label="Tank"
          value={l.level}
          max={100}
          warn={85}
          shut={92}
          display={`${l.level.toFixed(0)}% · ${fmt.num(l.f.tank.capacity_bbl)} bbl`}
          fluid="water"
          height={12}
        />
        <LiquidMeter
          label="Pump"
          value={l.pumpStatus === 1 ? l.pumpFlow : 0}
          max={pumpMax}
          display={l.pumpStatus === 2 ? 'fault' : l.pumpStatus === 1 ? `${fmt.num(l.pumpFlow)} bpd` : 'off'}
          fluid="oil"
          height={12}
        />
        <LiquidMeter
          label="Inflow"
          value={l.inflow}
          max={Math.max(l.inflow, pumpMax)}
          display={`${fmt.num(l.inflow)} bpd`}
          fluid="water"
          height={12}
        />
        <LiquidMeter
          label="Pipeline"
          value={l.recv}
          max={pipeMax}
          display={`${fmt.num(l.recv)} bpd · ${fmt.num(l.pipePsi)} psi`}
          fluid="brine"
          height={12}
        />
        <LiquidMeter
          label="Wells"
          value={online}
          max={Math.max(1, l.wells.length)}
          display={`${online}/${l.wells.length} online`}
          fluid="gas"
          height={12}
        />
      </div>

      <div className="hover-card-viz__chips">
        <span className="chip ghost">trucks {l.f.response_min} min</span>
        {l.planOverlay && <span className="chip mint">plan live</span>}
        {isFinite(hrsWarn) && hrsWarn < 48 && <span className="chip amber">warn in {fmt.dur(hrsWarn)}</span>}
      </div>
    </div>
  );
}
