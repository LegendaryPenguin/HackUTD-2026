import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Maximize2 } from 'lucide-react';
import { useStore } from '../state/store';
import { facilities, fmt, hoursToLimit } from '../lib/model';
import type { System } from '../lib/types';
import { liveFacility, statusColor, statusLabel, type LiveFacility } from '../lib/status';
import { applyDispatchOverlay, buildDispatchedPlan, dispatchForFacility } from '../lib/dispatch';
import { failureContext } from '../lib/planner';
import { MapPin, systemThreadArt, systemThreads, mapBackgrounds } from '../components/MapMarkers';
import { FacilityTriageCard } from '../components/FacilityTriageCard';
import { FinancialsBox } from '../components/FinancialsBox';

const W = 1100, H = 720;
const FIELD_BG = mapBackgrounds.moonlit;
/** Enchantress-scale: ~9–12% of map width at zoom 1. */
const PIN = { facility: 96, facilityFocus: 110, facilityHot: 120, hub: 84, hubFocus: 98, well: 44 } as const;

/** equirectangular projection into the SVG box using real lat/lon (no schematic spread). */
function makeProj(points: [number, number][], pad = 130) {
  const lat0 = points.reduce((a, p) => a + p[0], 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p[1] * k), ys = points.map((p) => p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
  return (lat: number, lon: number): [number, number] => [ox + (lon * k - minX) * s, H - (oy + (lat - minY) * s)];
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

  // True geographic positions from network.json (facility / disposal / truck yard lat-lon).
  const proj = useMemo(() => {
    if (!dataset) return null;
    const pts: [number, number][] = [];
    for (const s of dataset.network.systems) {
      pts.push([s.disposal_site.lat, s.disposal_site.lon], [s.truck_yard[0], s.truck_yard[1]]);
      for (const f of s.facilities) pts.push([f.lat, f.lon]);
    }
    return makeProj(pts);
  }, [dataset]);

  if (!dataset || !analysis || !proj) return null;

  // a selected facility always focuses its own system; otherwise use the manual pick
  const selectedFac = selectedId ? facs.find((x) => x.id === selectedId) : undefined;
  const sysFocus = selectedFac ? selectedFac.system : manualFocus;
  const setSysFocus = (id: string | null) => { setManualFocus(id); if (selectedId) setParams({}); };

  // focus / fit transform — keep every pin inside the viewBox (meet, not crop)
  const focusSys = dataset.network.systems.find((s) => s.id === sysFocus) ?? null;
  const fitPts = focusSys
    ? [proj(focusSys.disposal_site.lat, focusSys.disposal_site.lon), proj(focusSys.truck_yard[0], focusSys.truck_yard[1]), ...focusSys.facilities.map((f) => proj(f.lat, f.lon))]
    : dataset.network.systems.flatMap((s) => [
        proj(s.disposal_site.lat, s.disposal_site.lon),
        proj(s.truck_yard[0], s.truck_yard[1]),
        ...s.facilities.map((f) => proj(f.lat, f.lon)),
      ]);
  const fitPad = focusSys ? 150 : 110;
  const minX = Math.min(...fitPts.map((p) => p[0])) - fitPad;
  const maxX = Math.max(...fitPts.map((p) => p[0])) + fitPad;
  const minY = Math.min(...fitPts.map((p) => p[1])) - fitPad;
  const maxY = Math.max(...fitPts.map((p) => p[1])) + fitPad;
  const fitK = Math.min(W / (maxX - minX || 1), H / (maxY - minY || 1), focusSys ? 2.6 : 1.15);
  const transform = {
    k: fitK,
    x: W / 2 - ((minX + maxX) / 2) * fitK,
    y: H / 2 - ((minY + maxY) / 2) * fitK,
  };
  const selected = selectedId ? live.get(selectedId) ?? null : null;
  // Open Identify/Decide/Act whenever the selected station asset has an active pump failure.
  const showTriage = Boolean(
    selected
    && selected.status === 'failure'
    && analysis.orderedFailures.some((c) => c.facility.id === selected.f.id),
  );

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
                proj={proj}
                live={live}
                hover={hover}
                setHover={setHover}
                selected={selectedId}
                failureId={stationFailureId(s.id)}
                onSelect={(id) => setParams({ f: id })}
                dim={!!sysFocus && sysFocus !== s.id}
                k={transform.k}
                focused={sysFocus === s.id}
              />
            ))}
          </g>
        </svg>

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
          <LegendChip src={systemThreads.S1} label="station" />
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
        {showTriage && selected && !simulating && (
          <FacilityTriageCard key={`triage-${selected.f.id}`} live={selected} onClose={() => setParams({})} />
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

function PinTip({ title, sub, y }: { title: string; sub: string; y: number }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <text y={y} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--ink-0)"
        style={{ paintOrder: 'stroke', stroke: 'rgba(4,12,20,.92)', strokeWidth: 3.5 }}>
        {title}
      </text>
      <text y={y + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink-2)"
        style={{ paintOrder: 'stroke', stroke: 'rgba(4,12,20,.9)', strokeWidth: 3 }}>
        {sub}
      </text>
    </g>
  );
}

function SystemLayer({ sys, proj, live, hover, setHover, selected, failureId, onSelect, dim, k, focused }: {
  sys: System; proj: (lat: number, lon: number) => [number, number]; live: Map<string, LiveFacility>;
  hover: string | null; setHover: (id: string | null) => void; selected: string | null;
  failureId: string | null;
  onSelect: (id: string) => void;
  dim: boolean; k: number; focused: boolean;
}) {
  const [dx, dy] = proj(sys.disposal_site.lat, sys.disposal_site.lon);
  const inv = 1 / k;
  const disposalKey = `${sys.id}-disposal`;
  const hubSize = focused ? PIN.hubFocus : PIN.hub;
  const failLive = failureId ? live.get(failureId) : undefined;
  // Prefer an active pump failure over leak/wear so the triage card matches the red halo.
  const hotFac = failLive
    ?? sys.facilities.map((f) => live.get(f.id)!).find((l) => l.status === 'failure')
    ?? sys.facilities.map((f) => live.get(f.id)!).find((l) => isCritical(l.status));
  const stationTrouble = Boolean(failureId) || Boolean(hotFac && hotFac.status === 'failure');
  // Red halo = pump failure only (matches Identify/Decide/Act). Leak/wear keep pipe color cues.
  const stationWarn = stationTrouble;
  const otherCritical = !stationTrouble && sys.facilities.some((f) => isCritical(live.get(f.id)?.status ?? 'normal'));
  const stationStatus = stationTrouble
    ? 'pump failed — click for triage'
    : otherCritical && hotFac
      ? statusLabel[hotFac.status]
      : `${sys.disposal_site.lat.toFixed(3)}, ${sys.disposal_site.lon.toFixed(3)}`;

  return (
    <g opacity={dim ? 0.16 : 1} style={{ transition: 'opacity .3s' }}>
      {sys.facilities.map((f) => {
        const l = live.get(f.id)!;
        const [fx, fy] = proj(f.lat, f.lon);
        const mx = (fx + dx) / 2 + (fy - dy) * 0.12, my = (fy + dy) / 2 + (dx - fx) * 0.12;
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
                strokeWidth={14 * inv}
                opacity={0.22}
                filter="url(#crit-glow)"
                style={{ pointerEvents: 'none' }}
              />
            )}
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={(leak ? 5.5 : flowing ? 3.2 : 2) * inv}
              opacity={leak ? 1 : flowing ? 0.9 : 0.45}
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

      {/* Single station pin — click opens the alert card, not wells / mining logos. */}
      <g
        transform={`translate(${dx},${dy})`}
        onMouseEnter={() => setHover(disposalKey)}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: 'pointer' }}
        onClick={() => {
          // Always open the failing facility when present so Identify/Decide/Act use real numbers.
          const id = failureId
            ?? sys.facilities.map((f) => live.get(f.id)!).find((l) => l.status === 'failure')?.f.id
            ?? hotFac?.f.id
            ?? sys.facilities[0]?.id;
          if (id) onSelect(id);
        }}
      >
        {stationWarn && (
          <>
            <circle r={(hubSize * 0.62) * inv} fill="var(--coral)" opacity={0.12} filter="url(#crit-glow)" />
            <circle r={(hubSize * 0.52) * inv} fill="none" stroke="var(--coral)" strokeWidth={2.4 * inv} opacity={0.9} className="map-crit-ring" />
            <circle r={(hubSize * 0.72) * inv} fill="none" stroke="var(--coral)" strokeWidth={1.6 * inv} opacity={0.55} className="map-crit-ring delay" />
          </>
        )}
        <MapPin
          kind="system"
          size={hubSize * 1.25}
          inv={inv}
          badge={sys.id}
          active={hover === disposalKey || focused || selected != null && sys.facilities.some((f) => f.id === selected)}
          glow={stationWarn ? 'var(--coral)' : hover === disposalKey || focused ? 'var(--aqua)' : undefined}
          trouble={stationTrouble}
        />
        {(hover === disposalKey || focused) && (
          <PinTip title={`${sys.id} station`} sub={stationStatus} y={(hubSize * 0.55 + 6) * inv} />
        )}
      </g>
    </g>
  );
}

function HoverCard({ l }: { l: LiveFacility }) {
  const hrsWarn = hoursToLimit(l.level, l.f.tank.capacity_bbl, Math.max(0, l.inflow - (l.pumpStatus === 1 ? l.pumpFlow : 0)), 85);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <img
            src={systemThreadArt(l.f.system)}
            alt=""
            width={56}
            height={40}
            style={{ objectFit: 'contain' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{l.f.system} station</b>
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
