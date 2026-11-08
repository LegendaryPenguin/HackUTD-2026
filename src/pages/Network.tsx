import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from 'recharts';
import { ArrowRight, Maximize2, X } from 'lucide-react';
import { useStore } from '../state/store';
import { facilities, fmt, hoursToLimit, indexAt } from '../lib/model';
import type { FacilityCtx, System } from '../lib/types';
import { liveFacility, statusColor, statusLabel, type LiveFacility } from '../lib/status';
import { applyDispatchOverlay, dispatchForFacility } from '../lib/dispatch';
import { MapPin, facilityBadge, mapArt, mapBackgrounds, wellBadge } from '../components/MapMarkers';
import { TankGauge } from '../components/TankGauge';
import { CategoryChip, Confidence, Meter } from '../components/ui';

const W = 1100, H = 720;
const FIELD_BG = mapBackgrounds.moonlit;
/** Enchantress-scale: ~9–12% of map width at zoom 1. */
const PIN = { facility: 108, facilityFocus: 118, facilityHot: 128, hub: 96, hubFocus: 110, well: 52 } as const;

/** equirectangular projection into the SVG box using real lat/lon (no schematic spread). */
function makeProj(points: [number, number][], pad = 80) {
  const lat0 = points.reduce((a, p) => a + p[0], 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p[1] * k), ys = points.map((p) => p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
  return (lat: number, lon: number): [number, number] => [ox + (lon * k - minX) * s, H - (oy + (lat - minY) * s)];
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

  // focus transform
  const focusSys = dataset.network.systems.find((s) => s.id === sysFocus) ?? null;
  let transform = { x: 0, y: 0, k: 1 };
  if (focusSys) {
    const pts = [proj(focusSys.disposal_site.lat, focusSys.disposal_site.lon), proj(focusSys.truck_yard[0], focusSys.truck_yard[1]), ...focusSys.facilities.map((f) => proj(f.lat, f.lon))];
    const pad = 140; // room for large stickers + well orbit
    const minX = Math.min(...pts.map((p) => p[0])) - pad, maxX = Math.max(...pts.map((p) => p[0])) + pad;
    const minY = Math.min(...pts.map((p) => p[1])) - pad, maxY = Math.max(...pts.map((p) => p[1])) + pad;
    const k = Math.min(W / (maxX - minX), H / (maxY - minY), 2.6);
    transform = { k, x: W / 2 - ((minX + maxX) / 2) * k, y: H / 2 - ((minY + maxY) / 2) * k };
  }
  const selected = selectedId ? live.get(selectedId) ?? null : null;

  const counts = { failure: 0, leak: 0, wear: 0, warning: 0, normal: 0 } as Record<string, number>;
  for (const l of live.values()) counts[l.status]++;

  const needYou = counts.failure + counts.leak + counts.wear;

  return (
    <div className="page map-home" style={{ maxWidth: 1680 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Field map</h1>
          <p className="page-sub">
            {needYou === 0
              ? `All quiet across ${facs.length} facilities · pins are real locations`
              : `${needYou} site${needYou === 1 ? '' : 's'} need you · glow marks trouble · click a pin to dig in`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {needYou > 0 && (
            <Link to="/alerts" className="btn primary sm">
              Open alerts <ArrowRight size={13} />
            </Link>
          )}
          {(['failure', 'leak', 'wear', 'warning', 'normal'] as const).map((s) => (
            <span key={s} className="chip ghost" style={{ color: counts[s] ? statusColor[s] : undefined, opacity: counts[s] ? 1 : 0.5 }}>
              <i className="dot" style={{ background: statusColor[s] }} /> {counts[s]} {statusLabel[s].toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      <div className="split" style={{ gridTemplateColumns: selected ? 'minmax(0,1fr) 400px' : '1fr' }}>
        <div className="card map-stage" style={{ position: 'relative' }}>
          <div className="map-mist" aria-hidden />
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <div className="seg">
              <button className={!sysFocus ? 'on' : ''} onClick={() => { setSysFocus(null); }}><Maximize2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />All</button>
              {dataset.network.systems.map((s) => {
                const bad = s.facilities.some((f) => live.get(f.id)?.status === 'failure');
                return (
                  <button key={s.id} className={sysFocus === s.id ? 'on' : ''} onClick={() => setSysFocus(s.id)} style={{ color: bad && sysFocus !== s.id ? 'var(--coral)' : undefined }}>
                    {s.id}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 5, display: 'flex', gap: 12, fontSize: 11, color: 'var(--ink-2)', padding: '8px 12px', borderRadius: 14, background: 'rgba(7,19,28,.72)', backdropFilter: 'blur(8px)', alignItems: 'center', flexWrap: 'wrap' }}>
            <LegendChip src={mapArt.tank} label="facility" />
            <LegendChip src={mapArt.well} label="well" />
            <LegendChip src={mapArt.disposal} label="disposal" />
            <LegendChip src={mapArt.truck} label="truck yard" />
            <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--aqua)" strokeWidth="2" strokeDasharray="6 4" /></svg> flowing</span>
            <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--amber)" strokeWidth="2" strokeDasharray="3 3" /></svg> leak</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="map-svg" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 18, background: `url(${FIELD_BG}) center/cover` }}>
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transformOrigin: '0 0', transformBox: 'view-box', transition: 'transform .75s cubic-bezier(.2,.8,.2,1)' }}>
              {dataset.network.systems.map((s) => (
                <SystemLayer key={s.id} sys={s} proj={proj} live={live} hover={hover} setHover={setHover} selected={selectedId} onSelect={(id) => setParams({ f: id })} dim={!!sysFocus && sysFocus !== s.id} k={transform.k} focused={sysFocus === s.id} />
              ))}
            </g>
          </svg>
          {/* hover tooltip */}
          <AnimatePresence>
            {hover && live.get(hover) && (
              <motion.div key={hover} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                style={{ position: 'absolute', top: 12, right: 12, zIndex: 6, padding: '10px 12px', borderRadius: 12, background: 'rgba(8,14,26,.92)', border: '1px solid var(--line-strong)', boxShadow: 'var(--shadow)', minWidth: 220, pointerEvents: 'none' }}>
                <HoverCard l={live.get(hover)!} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {selected && (
            <motion.div key={selected.f.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
              <FacilityPanel l={selected} onClose={() => setParams({})} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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

function SystemLayer({ sys, proj, live, hover, setHover, selected, onSelect, dim, k, focused }: {
  sys: System; proj: (lat: number, lon: number) => [number, number]; live: Map<string, LiveFacility>;
  hover: string | null; setHover: (id: string | null) => void; selected: string | null; onSelect: (id: string) => void;
  dim: boolean; k: number; focused: boolean;
}) {
  const [dx, dy] = proj(sys.disposal_site.lat, sys.disposal_site.lon);
  const [yx, yy] = proj(sys.truck_yard[0], sys.truck_yard[1]);
  const inv = 1 / k;
  const showWells = focused || k > 1.2;
  const disposalKey = `${sys.id}-disposal`;
  const truckKey = `${sys.id}-trucks`;
  const hubSize = focused ? PIN.hubFocus : PIN.hub;
  return (
    <g opacity={dim ? 0.18 : 1} style={{ transition: 'opacity .3s' }}>
      {sys.facilities.map((f) => {
        const l = live.get(f.id)!;
        const [fx, fy] = proj(f.lat, f.lon);
        const mx = (fx + dx) / 2 + (fy - dy) * 0.12, my = (fy + dy) / 2 + (dx - fx) * 0.12;
        const flowing = l.pumpStatus === 1;
        const leak = l.status === 'leak';
        const stroke = leak ? 'var(--amber)' : flowing ? 'var(--aqua)' : 'rgba(120,150,170,.45)';
        return (
          <path key={`pipe-${f.id}`} d={`M${fx},${fy} Q${mx},${my} ${dx},${dy}`} fill="none" stroke={stroke}
            strokeWidth={(flowing ? 3.2 : 2) * inv} opacity={flowing ? 0.9 : 0.5}
            strokeDasharray={flowing ? (leak ? `${5 * inv} ${5 * inv}` : `${10 * inv} ${7 * inv}`) : undefined}
            style={flowing ? { animation: `flow ${leak ? 0.9 : 1.5}s linear infinite` } : undefined}
            filter={flowing ? 'url(#glow)' : undefined} />
        );
      })}

      <g transform={`translate(${dx},${dy})`}
        onMouseEnter={() => setHover(disposalKey)} onMouseLeave={() => setHover(null)}>
        <MapPin kind="disposal" size={hubSize} inv={inv} badge={sys.id} active={hover === disposalKey} glow={hover === disposalKey ? 'var(--aqua)' : undefined} />
        {(focused || hover === disposalKey) && (
          <PinTip title={`${sys.id} disposal`} sub={`${sys.disposal_site.lat.toFixed(3)}, ${sys.disposal_site.lon.toFixed(3)}`} y={(hubSize * 0.55 + 6) * inv} />
        )}
      </g>

      <g transform={`translate(${yx},${yy})`}
        onMouseEnter={() => setHover(truckKey)} onMouseLeave={() => setHover(null)}>
        <MapPin kind="truck" size={hubSize} inv={inv} badge={sys.id} active={hover === truckKey} glow={hover === truckKey ? 'var(--lagoon)' : undefined} />
        {(focused || hover === truckKey) && (
          <PinTip title={`${sys.id} trucks`} sub={`${sys.truck_yard[0].toFixed(3)}, ${sys.truck_yard[1].toFixed(3)}`} y={(hubSize * 0.55 + 6) * inv} />
        )}
      </g>

      {sys.facilities.map((f) => {
        const l = live.get(f.id)!;
        const [fx, fy] = proj(f.lat, f.lon);
        const c = statusColor[l.status];
        const isSel = selected === f.id, isHov = hover === f.id;
        const trouble = l.status === 'failure' || l.status === 'leak' || l.status === 'wear';
        const pin = isSel || isHov ? PIN.facilityHot : focused ? PIN.facilityFocus : PIN.facility;
        const showTip = focused || isHov || isSel || trouble;
        const nWells = f.wells.length;
        return (
          <g key={f.id} transform={`translate(${fx},${fy})`} style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)} onClick={() => onSelect(f.id)}>
            {l.status === 'failure' && (
              <circle r={(pin * 0.48) * inv} fill="none" stroke={c} strokeWidth={2 * inv} opacity={0.75}
                style={{ animation: 'ripple 1.8s ease-out infinite', transformOrigin: 'center', transformBox: 'fill-box' }} />
            )}
            {showWells && f.wells.map((w, i) => {
              const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / nWells;
              const rad = (pin * 0.72) * inv;
              const wx = Math.cos(ang) * rad, wy = Math.sin(ang) * rad;
              const on = l.wells.find((x) => x.id === w.id)?.status === 1;
              const wKey = `${f.id}-${w.id}`;
              return (
                <g key={w.id} transform={`translate(${wx},${wy})`}
                  onMouseEnter={(e) => { e.stopPropagation(); setHover(wKey); }}
                  onMouseLeave={() => setHover(f.id)}>
                  <MapPin kind="well" size={PIN.well} inv={inv} badge={wellBadge(w.id)} dim={!on} active={hover === wKey} />
                  {hover === wKey && (
                    <PinTip title={fmt.short(w.id)} sub={on ? 'producing' : 'shut in'} y={(PIN.well * 0.55 + 4) * inv} />
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
                sub={isHov || isSel ? `${f.lat.toFixed(3)}, ${f.lon.toFixed(3)}` : statusLabel[l.status]}
                y={(pin * 0.55 + 8) * inv}
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

function FacilityPanel({ l, onClose }: { l: LiveFacility; onClose: () => void }) {
  const { dataset, now, analysis, dispatched } = useStore();
  if (!dataset || !analysis) return null;
  const f: FacilityCtx = l.f;
  const limits = dataset.network.defaults.tank_limits_pct;
  const t = dataset.telemetry;
  const iNow = indexAt(t, now);
  const i0 = Math.max(0, iNow - 288);
  const lvl = t.series.get(`${f.tank.id}|level_pct`)!;
  const dPlan = dispatchForFacility(dispatched, f.id);
  const spark = Array.from({ length: iNow - i0 + 1 }, (_, k) => {
    const ts = t.ts[i0 + k];
    let v = lvl[i0 + k];
    if (dPlan && ts >= dPlan.commitUnix) {
      const m = Math.floor((ts - dPlan.commitUnix) / 60);
      if (m >= 0 && m < dPlan.levelTracePct.length) v = dPlan.levelTracePct[m];
    }
    return { t: ts, v };
  });
  const running = l.pumpStatus === 1;
  const failed = l.pumpStatus === 2;
  const nodeStyle = (c: string): CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, border: `1px solid ${c}33`, background: `${c}14` });
  const fail = analysis.orderedFailures.find((c) => c.facility.id === f.id);
  const netFill = Math.max(0, l.inflow - (running ? l.pumpFlow : 0));
  const hrsWarn = l.planOverlay
    ? hoursToLimit(l.level, f.tank.capacity_bbl, l.inflow, limits.warning)
    : hoursToLimit(l.level, f.tank.capacity_bbl, netFill, limits.warning);
  const hrsShut = l.planOverlay
    ? (isFinite(l.planOverlay.hoursToLimit) ? l.planOverlay.hoursToLimit : hoursToLimit(l.level, f.tank.capacity_bbl, l.inflow, limits.shutdown))
    : hoursToLimit(l.level, f.tank.capacity_bbl, netFill, limits.shutdown);

  return (
    <div className="card pad" style={{ position: 'sticky', top: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <img src={mapArt.tank} alt="" width={56} height={56} style={{ objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(94,200,216,.35))' }} />
          <span className="chip aqua" style={{ position: 'absolute', right: -6, bottom: -4, fontWeight: 800 }}>{facilityBadge(f.id)}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="big" style={{ fontSize: 20 }}>{fmt.short(f.id)}</div>
          <div className="muted" style={{ fontSize: 12 }}>{f.id} · {f.lat.toFixed(4)}, {f.lon.toFixed(4)}</div>
        </div>
        <button className="btn ghost sm" onClick={onClose}><X size={14} /></button>
      </div>

      {/* Enchantress-style cadence chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
        <span className="chip ghost" style={{ color: statusColor[l.status] }}><i className="dot" style={{ background: statusColor[l.status] }} />{statusLabel[l.status]}</span>
        {l.planOverlay && (
          <span className="chip mint tip">
            live plan · {l.planOverlay.label}
            <span className="tipbox">
              Dispatched at {fmt.time(l.planOverlay.commitUnix)}. Tank &amp; wells follow the plan sim (+{l.planOverlay.minute} min).
              Pump fault stays from sensors. Cost {fmt.money(l.planOverlay.cost)} · peak {l.planOverlay.peakPct.toFixed(0)}%.
            </span>
          </span>
        )}
        <span className="chip ghost">trucks {f.response_min} min</span>
        <span className="chip ghost">cycle {f.cycle_min} min</span>
        {isFinite(hrsWarn) && hrsWarn < 72 && <span className="chip amber">warn {fmt.dur(hrsWarn)}</span>}
        {isFinite(hrsShut) && hrsShut < 72 && <span className="chip coral">trip {fmt.dur(hrsShut)}</span>}
        {l.events.map((e) => <CategoryChip key={e.id} cat={e.category} pulse />)}
      </div>

      {/* Enchantress Start/End meters → Now tank fill vs capacity */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          <span>Tank now</span>
          <span className="muted">{l.level.toFixed(1)}% · {fmt.num((l.level / 100) * f.tank.capacity_bbl)} / {fmt.num(f.tank.capacity_bbl)} bbl</span>
        </div>
        <Meter value={l.level} max={100} warn={limits.warning} shut={limits.shutdown} height={16} />
      </div>

      {/* Pathways (Enchantress neighbor list → Avon flow chain) */}
      <div style={{ marginTop: 16, fontWeight: 800, fontSize: 12.5, letterSpacing: '.02em' }}>Pathways</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        <div style={nodeStyle('#7f93ab')}>
          <img src={mapArt.well} alt="" width={40} height={40} style={{ objectFit: 'contain' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>Wells → {fmt.num(l.inflow)} bpd water</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {l.wells.map((w) => (
                <span key={w.id} className={`chip ${w.status === 1 ? 'aqua' : 'coral'} tip`} style={{ fontSize: 10.5 }}>
                  {wellBadge(w.id)} {w.status === 1 ? fmt.num(w.water) : 'shut in'}
                  <span className="tipbox">{w.id}: {fmt.num(f.wells.find((x) => x.id === w.id)!.oil_bpd)} bbl oil · {fmt.num(f.wells.find((x) => x.id === w.id)!.gas_mcfd)} mcf gas /day</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <Arrow active />
        <div style={{ ...nodeStyle(l.level >= limits.shutdown ? '#fb7185' : l.level >= limits.warning ? '#f6b04b' : '#2dd4bf'), alignItems: 'stretch' }}>
          <TankGauge level={l.level} warn={limits.warning} shut={limits.shutdown} width={64} height={84} failed={failed} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <img src={mapArt.tank} alt="" width={18} height={18} style={{ objectFit: 'contain' }} /> {f.tank.id}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{fmt.num((l.level / 100) * f.tank.capacity_bbl)} / {fmt.num(f.tank.capacity_bbl)} bbl</div>
            <div style={{ height: 46, marginTop: 6 }}>
              <ResponsiveContainer>
                <AreaChart data={spark} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
                  <defs><linearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--aqua)" stopOpacity=".5" /><stop offset="100%" stopColor="var(--aqua)" stopOpacity="0" /></linearGradient></defs>
                  <YAxis domain={[0, 100]} hide />
                  <ReferenceLine y={limits.shutdown} stroke="var(--coral)" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="v" stroke="var(--aqua)" strokeWidth={1.5} fill="url(#sp)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="dim" style={{ fontSize: 10.5 }}>last 24 h</div>
          </div>
        </div>
        <Arrow active={running} />
        <div style={nodeStyle(failed ? '#fb7185' : running ? '#2dd4bf' : '#7f93ab')}>
          <img src={mapArt.well} alt="" width={40} height={40} style={{ borderRadius: 10, objectFit: 'contain', opacity: failed ? 1 : running ? 1 : 0.7 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>{f.pump.id} · {failed ? <span style={{ color: 'var(--coral)' }}>FAULT</span> : running ? 'running' : 'off (below start level)'}</div>
            <div className="muted" style={{ fontSize: 12 }}>{fmt.num(l.pumpFlow)} / {fmt.num(f.pump.max_flow_bpd)} bpd · discharge {fmt.num(l.discharge)} psi</div>
            {running && <div style={{ marginTop: 6 }}><Meter value={l.pumpFlow} max={f.pump.max_flow_bpd} ruler={false} height={8} color={l.pumpFlow / f.pump.max_flow_bpd < 0.97 ? 'amber' : 'aqua'} /></div>}
          </div>
        </div>
        <Arrow active={running} />
        <div style={nodeStyle(l.status === 'leak' ? '#f6b04b' : running ? '#2dd4bf' : '#7f93ab')}>
          <img src={mapArt.disposal} alt="" width={40} height={40} style={{ borderRadius: 10, objectFit: 'contain' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>{f.pipeline.id} → {f.system} disposal</div>
            <div className="muted" style={{ fontSize: 12 }}>receives {fmt.num(l.recv)} bpd · {fmt.num(l.pipePsi)} psi (disposal {f.disposal_psi})</div>
            {running && l.pumpFlow - l.recv > 25 && <div style={{ color: 'var(--amber)', fontSize: 12, fontWeight: 600 }}>losing ~{fmt.num(l.pumpFlow - l.recv)} bpd in the line</div>}
          </div>
        </div>
      </div>

      {fail && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'var(--coral-dim)', border: '1px solid rgba(251,113,133,.3)' }}>
          <div style={{ fontWeight: 700 }}>Trips in {fmt.dur(fail.hoursToLimit)} · recommended {analysis.systemPlans[f.system]?.plans[fail.event.id]?.label}</div>
          <div className="muted" style={{ fontSize: 12 }}>{fmt.money(analysis.systemPlans[f.system]?.plans[fail.event.id]?.cost ?? 0)} vs {fmt.money(fail.doNothingCost)} doing nothing</div>
        </div>
      )}
      {l.events.filter((e) => e.category !== 'pump_failure').map((e) => (
        <div key={e.id} style={{ marginTop: 10, fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Confidence value={e.confidence} /> <span className="muted">{e.evidence[0]}</span>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {fail && <Link to={`/plan/${fail.event.id}`} className="btn primary sm">Plan <ArrowRight size={13} /></Link>}
        <Link to={`/trends?f=${f.id}`} className="btn sm">Trend this facility <ArrowRight size={13} /></Link>
      </div>
    </div>
  );
}

function Arrow({ active }: { active?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', height: 14 }}>
      <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 0v10M3 7l4 4 4-4" fill="none" stroke={active ? 'var(--aqua)' : 'var(--ink-3)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}
