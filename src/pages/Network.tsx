import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Maximize2 } from 'lucide-react';
import { useStore } from '../state/store';
import { facilities, fmt, hoursToLimit } from '../lib/model';
import type { System } from '../lib/types';
import { liveFacility, statusColor, statusLabel, type LiveFacility } from '../lib/status';
import { applyDispatchOverlay, buildDispatchedPlan, dispatchForFacility } from '../lib/dispatch';
import { failureContext } from '../lib/planner';
import {
  MapPin,
  facilityBadge,
  wellBadge,
  mapArt,
  mapBackgrounds,
} from '../components/MapMarkers';
import { FacilityTriageCard } from '../components/FacilityTriageCard';
import { InspectIssueCard } from '../components/InspectIssueCard';
import { FinancialsBox } from '../components/FinancialsBox';

const W = 1100, H = 720;
const FIELD_BG = mapBackgrounds.moonlit;
/** Station stickers stay readable without eating the basin. */
const PIN = { facility: 96, facilityFocus: 110, facilityHot: 120, hub: 64, hubFocus: 76, well: 44 } as const;

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
  const localR = Math.min(cellW, cellH) * 0.32;
  const ringR = Math.min(cellW, cellH) * 0.44;
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
  const { dataset, analysis, now, dispatched, simulating, exitSimulate, dispatch } = useStore();
  const [params, setParams] = useSearchParams();
  const [hover, setHover] = useState<string | null>(null);
  const [manualFocus, setManualFocus] = useState<string | null>(null);
  const selectedId = params.get('f');

  const facs = useMemo(() => (dataset ? facilities(dataset.network, dataset.ops) : []), [dataset]);
  const live = useMemo(() => {
    if (!dataset || !analysis) return new Map<string, LiveFacility>();
    return new Map(facs.map((f) => {
      let L = liveFacility(dataset, f, now, analysis.ongoing);
      let d = dispatchForFacility(dispatched, f.id);
      if (simulating && simulating.facilityId === f.id) {
        const ev = analysis.events.find((e) => e.id === simulating.eventId);
        if (ev) {
          const ctx = failureContext(ev, dataset, simulating.onsetUnix);
          d = buildDispatchedPlan(ctx, dataset, simulating.plan, simulating.onsetUnix);
        }
      }
      if (d) L = applyDispatchOverlay(L, d, now, dataset);
      return [f.id, L] as const;
    }));
  }, [dataset, analysis, facs, now, dispatched, simulating]);

  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
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

  // focus / fit transform — keep every pin inside the viewBox (meet, not crop)
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
  const fitPadX = focusSys ? (narrow ? 100 : 140) : (narrow ? 70 : 90);
  const fitPadTop = focusSys ? (narrow ? 110 : 140) : (narrow ? 70 : 80);
  const fitPadBottom = focusSys ? (narrow ? 120 : 150) : (narrow ? 100 : 120);
  const minX = Math.min(...fitPts.map((p) => p[0])) - fitPadX;
  const maxX = Math.max(...fitPts.map((p) => p[0])) + fitPadX;
  const minY = Math.min(...fitPts.map((p) => p[1])) - fitPadTop;
  const maxY = Math.max(...fitPts.map((p) => p[1])) + fitPadBottom;
  const fitK = Math.min(
    W / (maxX - minX || 1),
    H / (maxY - minY || 1),
    focusSys ? (narrow ? 1.85 : 2.1) : (narrow ? 0.95 : 0.9),
  );
  // Bias the framed content slightly upward so nothing sits under the timeline.
  const transform = {
    k: fitK,
    x: W / 2 - ((minX + maxX) / 2) * fitK,
    y: H * 0.46 - ((minY + maxY) / 2) * fitK,
  };
  const selected = selectedId ? live.get(selectedId) ?? null : null;
  // Open Identify/Decide/Act for any selected facility that still has an active pump-failure plan.
  const triageFail = selected
    ? analysis.orderedFailures.find((c) => c.facility.id === selected.f.id)
    : undefined;
  const showTriage = Boolean(selected && triageFail && !simulating);
  const inspectEvent = selected && (selected.status === 'leak' || selected.status === 'wear')
    ? analysis.ongoing.find((e) =>
      e.facility === selected.f.id
      && (selected.status === 'leak' ? e.category === 'pipeline_leak' : e.category === 'pump_degradation'))
      ?? analysis.ongoing.find((e) => e.facility === selected.f.id)
    : null;
  const showInspect = Boolean(selected && inspectEvent && !showTriage);

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
        <div className="map-topo" aria-hidden>
          <div className="map-topo__photo" style={{ backgroundImage: `url(${FIELD_BG})` }} />
          <div className="map-topo__wave" />
        </div>
        <div className="map-mist" aria-hidden />
        <svg viewBox={`0 0 ${W} ${H}`} className="map-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="crit-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transformOrigin: '0 0', transformBox: 'view-box', transition: 'transform .75s cubic-bezier(.2,.8,.2,1)' }}>
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

        {simulating && (
          <div className="sim-dock">
            <div className="sim-dock-msg">
              Simulating plan — scrub the timeline to see finances change. You do not know future errors yet.
            </div>
            <div className="sim-dock-actions">
              <button type="button" className="btn sm" onClick={exitSimulate}>Exit simulation</button>
              <button type="button" className="btn primary sm" onClick={() => { dispatch(simulating.eventId, simulating.plan); exitSimulate(); }}>
                Put into action
              </button>
            </div>
          </div>
        )}

        <div className="map-float map-float-bl map-legend">
          <LegendChip src={mapArt.tank} label="facility" />
          <LegendChip src={mapArt.well} label="well" />
          <LegendChip src={mapArt.disposal} label="disposal" />
          <LegendChip src={mapArt.truck} label="trucks" />
          <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--aqua)" strokeWidth="2" strokeDasharray="6 4" /></svg> flowing</span>
          <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--amber)" strokeWidth="2" strokeDasharray="3 3" /></svg> leak</span>
        </div>

        <AnimatePresence>
          {hover && live.get(hover) && !showTriage && (
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
  const hubSize = (focused ? PIN.hubFocus : PIN.hub) * pinScale * (focused ? 0.95 : 0.72);
  const ps = pinScale * (focused ? 0.9 : 0.68);

  return (
    <g opacity={dim ? 0.12 : 1} style={{ transition: 'opacity .3s' }}>
      {/* Station pad — one island per system */}
      <circle
        cx={station.ring.x}
        cy={station.ring.y}
        r={station.ring.r}
        fill={focused ? 'rgba(94,200,216,0.07)' : 'rgba(6,12,18,0.22)'}
        stroke={focused ? 'rgba(94,200,216,0.4)' : 'rgba(255,255,255,0.1)'}
        strokeWidth={1.4 * inv}
        style={{ pointerEvents: 'none' }}
      />
      {/* Overview only — focused view already has S# in the top chips; label collides with Facility A. */}
      {!focused && (
        <text
          x={station.ring.x}
          y={station.ring.y - station.ring.r - 8 * inv}
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
              style={{
                animation: leak || flowing ? `flow ${leak ? 0.85 : 1.5}s linear infinite` : undefined,
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
        transform={`translate(${dx},${dy})`}
        onMouseEnter={() => setHover(disposalKey)}
        onMouseLeave={() => setHover(null)}
      >
        <MapPin
          kind="disposal"
          size={hubSize}
          inv={inv}
          badge={sys.id}
          active={hover === disposalKey || focused}
          glow={hover === disposalKey || focused ? 'var(--aqua)' : undefined}
        />
        {/* Only the hovered hub — never keep disposal/truck labels on while focused. */}
        {hover === disposalKey && (
          <PinTip
            title={`${sys.id} disposal`}
            sub="station hub"
            y={(hubSize * 0.55 + 10) * inv}
          />
        )}
      </g>

      <g
        transform={`translate(${yx},${yy})`}
        onMouseEnter={() => setHover(truckKey)}
        onMouseLeave={() => setHover(null)}
      >
        <MapPin
          kind="truck"
          size={hubSize}
          inv={inv}
          badge={sys.id}
          active={hover === truckKey || focused}
          glow={hover === truckKey || focused ? 'var(--lagoon)' : undefined}
        />
        {hover === truckKey && (
          <PinTip
            title={`${sys.id} trucks`}
            sub="yard"
            {...tipAwayFromHub(yx, yy, dx, dy, (hubSize * 0.58 + 18) * inv)}
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

function HoverCard({ l }: { l: LiveFacility }) {
  const hrsWarn = hoursToLimit(l.level, l.f.tank.capacity_bbl, Math.max(0, l.inflow - (l.pumpStatus === 1 ? l.pumpFlow : 0)), 85);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <img src={mapArt.tank} alt="" width={48} height={48} style={{ objectFit: 'contain' }} />
          <span className="chip aqua" style={{ position: 'absolute', right: -4, bottom: -4, fontSize: 10, padding: '1px 6px' }}>{facilityBadge(l.f.id)}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{fmt.short(l.f.id)}</b>
          <div className="dim" style={{ fontSize: 11 }}>{l.f.lat.toFixed(4)} · {l.f.lon.toFixed(4)}</div>
        </div>
        <span className="chip ghost" style={{ color: statusColor[l.status] }}><i className="dot" style={{ background: statusColor[l.status] }} />{statusLabel[l.status]}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        <span className="chip ghost">tank {l.level.toFixed(0)}%</span>
        <span className="chip ghost">trucks {l.f.response_min} min</span>
        {l.planOverlay && <span className="chip mint tip">plan live<span className="tipbox">{l.planOverlay.label} — tank/wells follow your dispatch, pump fault still from sensors</span></span>}
        {isFinite(hrsWarn) && hrsWarn < 48 && <span className="chip amber">warn in {fmt.dur(hrsWarn)}</span>}
      </div>
      <dl className="kv" style={{ marginTop: 10 }}>
        <dt>Tank</dt><dd>{l.level.toFixed(1)}% of {fmt.num(l.f.tank.capacity_bbl)} bbl</dd>
        <dt>Pump</dt><dd>{l.pumpStatus === 2 ? <span style={{ color: 'var(--coral)' }}>fault</span> : l.pumpStatus === 1 ? `${fmt.num(l.pumpFlow)} bpd` : 'off'}</dd>
        <dt>Inflow</dt><dd>{fmt.num(l.inflow)} bpd</dd>
        <dt>Pipeline</dt><dd>{fmt.num(l.recv)} bpd · {fmt.num(l.pipePsi)} psi</dd>
      </dl>
    </div>
  );
}
