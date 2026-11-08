import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from 'recharts';
import { ArrowRight, Maximize2, X } from 'lucide-react';
import terrain from '../assets/terrain.jpg';
import { useStore } from '../state/store';
import { facilities, fmt, indexAt } from '../lib/model';
import type { FacilityCtx, System } from '../lib/types';
import { liveFacility, statusColor, statusLabel, type LiveFacility } from '../lib/status';
import { DisposalIcon, PipelineIcon, PumpIcon, TankIcon, TruckIcon, WellIcon } from '../components/Icons';
import { TankGauge } from '../components/TankGauge';
import { CategoryChip, Confidence, Meter } from '../components/ui';

const W = 1000, H = 620;

/** equirectangular projection into the SVG box, lon scaled by cos(mean lat) */
function makeProj(points: [number, number][], pad = 70) {
  const lat0 = points.reduce((a, p) => a + p[0], 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p[1] * k), ys = points.map((p) => p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
  return (lat: number, lon: number): [number, number] => [ox + (lon * k - minX) * s, H - (oy + (lat - minY) * s)];
}

export default function Network() {
  const { dataset, analysis, now } = useStore();
  const [params, setParams] = useSearchParams();
  const [hover, setHover] = useState<string | null>(null);
  const [manualFocus, setManualFocus] = useState<string | null>(null);
  const selectedId = params.get('f');

  const facs = useMemo(() => (dataset ? facilities(dataset.network, dataset.ops) : []), [dataset]);
  const live = useMemo(() => {
    if (!dataset || !analysis) return new Map<string, LiveFacility>();
    return new Map(facs.map((f) => [f.id, liveFacility(dataset, f, now, analysis.ongoing)]));
  }, [dataset, analysis, facs, now]);

  // Schematic layout: real positions, but each system's local cluster (facilities + disposal) is
  // spread out around its center so the markers don't overlap at the all-systems zoom.
  const proj = useMemo(() => {
    if (!dataset) return null;
    const SPREAD = 2.4;
    const centerOf = new Map<string, [number, number]>();
    const spreadPt = (s: System, lat: number, lon: number): [number, number] => {
      const c = centerOf.get(s.id)!;
      return [c[0] + (lat - c[0]) * SPREAD, c[1] + (lon - c[1]) * SPREAD];
    };
    const pts: [number, number][] = [];
    for (const s of dataset.network.systems) {
      const members: [number, number][] = [[s.disposal_site.lat, s.disposal_site.lon], ...s.facilities.map((f) => [f.lat, f.lon] as [number, number])];
      centerOf.set(s.id, [members.reduce((a, p) => a + p[0], 0) / members.length, members.reduce((a, p) => a + p[1], 0) / members.length]);
      pts.push(spreadPt(s, s.disposal_site.lat, s.disposal_site.lon), [s.truck_yard[0], s.truck_yard[1]]);
      for (const f of s.facilities) pts.push(spreadPt(s, f.lat, f.lon));
    }
    const base = makeProj(pts);
    const ownerOf = new Map<string, System>();
    for (const s of dataset.network.systems) {
      ownerOf.set(`${s.disposal_site.lat},${s.disposal_site.lon}`, s);
      for (const f of s.facilities) ownerOf.set(`${f.lat},${f.lon}`, s);
    }
    return (lat: number, lon: number): [number, number] => {
      const s = ownerOf.get(`${lat},${lon}`);
      return s ? base(...spreadPt(s, lat, lon)) : base(lat, lon);
    };
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
    const minX = Math.min(...pts.map((p) => p[0])) - 60, maxX = Math.max(...pts.map((p) => p[0])) + 60;
    const minY = Math.min(...pts.map((p) => p[1])) - 60, maxY = Math.max(...pts.map((p) => p[1])) + 60;
    const k = Math.min(W / (maxX - minX), H / (maxY - minY), 3.2);
    transform = { k, x: W / 2 - ((minX + maxX) / 2) * k, y: H / 2 - ((minY + maxY) / 2) * k };
  }
  const selected = selectedId ? live.get(selectedId) ?? null : null;

  const counts = { failure: 0, leak: 0, wear: 0, warning: 0, normal: 0 } as Record<string, number>;
  for (const l of live.values()) counts[l.status]++;

  return (
    <div className="page" style={{ maxWidth: 1600 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Network</h1>
          <p className="page-sub">{dataset.network.systems.length} systems · {facs.length} facilities · every pipeline ends at its system’s disposal site</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['failure', 'leak', 'wear', 'warning', 'normal'] as const).map((s) => (
            <span key={s} className="chip ghost" style={{ color: counts[s] ? statusColor[s] : undefined, opacity: counts[s] ? 1 : 0.5 }}>
              <i className="dot" style={{ background: statusColor[s] }} /> {counts[s]} {statusLabel[s].toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      <div className="split" style={{ gridTemplateColumns: selected ? 'minmax(0,1fr) 400px' : '1fr' }}>
        <div className="card" style={{ position: 'relative' }}>
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
          <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 5, display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-2)', padding: '6px 10px', borderRadius: 10, background: 'rgba(8,14,26,.6)', backdropFilter: 'blur(6px)' }}>
            <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--aqua)" strokeWidth="2" strokeDasharray="6 4" /></svg> water flowing</span>
            <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--ink-3)" strokeWidth="2" /></svg> pump off</span>
            <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--amber)" strokeWidth="2" strokeDasharray="3 3" /></svg> leaking</span>
            <span><DisposalIcon size={12} /> disposal</span>
            <span><TruckIcon size={12} /> truck yard</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16, background: `url(${terrain}) center/cover` }}>
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <radialGradient id="siteGlow"><stop offset="0%" stopColor="var(--aqua)" stopOpacity=".35" /><stop offset="100%" stopColor="var(--aqua)" stopOpacity="0" /></radialGradient>
            </defs>
            <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transformOrigin: '0 0', transformBox: 'view-box', transition: 'transform .75s cubic-bezier(.2,.8,.2,1)' }}>
              {dataset.network.systems.map((s) => (
                <SystemLayer key={s.id} sys={s} proj={proj} live={live} hover={hover} setHover={setHover} selected={selectedId} onSelect={(id) => setParams({ f: id })} dim={!!sysFocus && sysFocus !== s.id} k={transform.k} />
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

function SystemLayer({ sys, proj, live, hover, setHover, selected, onSelect, dim, k }: {
  sys: System; proj: (lat: number, lon: number) => [number, number]; live: Map<string, LiveFacility>;
  hover: string | null; setHover: (id: string | null) => void; selected: string | null; onSelect: (id: string) => void; dim: boolean; k: number;
}) {
  const [dx, dy] = proj(sys.disposal_site.lat, sys.disposal_site.lon);
  const [yx, yy] = proj(sys.truck_yard[0], sys.truck_yard[1]);
  const inv = 1 / k; // keep markers readable when zoomed
  return (
    <g opacity={dim ? 0.25 : 1} style={{ transition: 'opacity .3s' }}>
      {/* pipelines */}
      {sys.facilities.map((f) => {
        const l = live.get(f.id)!;
        const [fx, fy] = proj(f.lat, f.lon);
        const mx = (fx + dx) / 2 + (fy - dy) * 0.18, my = (fy + dy) / 2 + (dx - fx) * 0.18;
        const flowing = l.pumpStatus === 1;
        const leak = l.status === 'leak';
        const stroke = leak ? 'var(--amber)' : flowing ? 'var(--aqua)' : 'rgba(127,147,171,.5)';
        return (
          <g key={f.id}>
            <path d={`M${fx},${fy} Q${mx},${my} ${dx},${dy}`} fill="none" stroke={stroke} strokeWidth={flowing ? 2.4 * inv : 1.6 * inv} opacity={flowing ? 0.9 : 0.6}
              strokeDasharray={flowing ? (leak ? `${4 * inv} ${4 * inv}` : `${8 * inv} ${6 * inv}`) : undefined}
              style={flowing ? { animation: `flow ${leak ? 0.9 : 1.4}s linear infinite` } : undefined} filter={flowing ? 'url(#glow)' : undefined} />
          </g>
        );
      })}
      {/* disposal site */}
      <g transform={`translate(${dx},${dy})`}>
        <circle r={26 * inv} fill="url(#siteGlow)" />
        <circle r={9 * inv} fill="var(--bg-2)" stroke="var(--aqua)" strokeWidth={1.6 * inv} />
        <g transform={`scale(${inv})`}><DisposalIcon size={11} color="var(--aqua-2)" x={-5.5} y={-5.5} /></g>
        <text y={-14 * inv} textAnchor="middle" fontSize={10 * inv} fill="var(--ink-2)" fontWeight={600}>{sys.id} disposal</text>
      </g>
      {/* truck yard */}
      <g transform={`translate(${yx},${yy})`}>
        <rect x={-9 * inv} y={-9 * inv} width={18 * inv} height={18 * inv} rx={5 * inv} fill="var(--bg-2)" stroke="var(--ink-3)" strokeWidth={1.4 * inv} />
        <g transform={`scale(${inv})`}><TruckIcon size={12} color="var(--ink-1)" x={-6} y={-6} /></g>
        <text y={-14 * inv} textAnchor="middle" fontSize={9.5 * inv} fill="var(--ink-3)">{sys.id} trucks</text>
      </g>
      {/* facilities */}
      {sys.facilities.map((f) => {
        const l = live.get(f.id)!;
        const [fx, fy] = proj(f.lat, f.lon);
        const c = statusColor[l.status];
        const isSel = selected === f.id, isHov = hover === f.id;
        const r = (isSel || isHov ? 15 : 13) * inv;
        const arc = Math.max(0.02, Math.min(1, l.level / 100));
        const circ = 2 * Math.PI * (r + 4 * inv);
        return (
          <g key={f.id} transform={`translate(${fx},${fy})`} style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)} onClick={() => onSelect(f.id)}>
            {l.status === 'failure' && <circle r={r} fill="none" stroke={c} strokeWidth={2 * inv} style={{ animation: 'ripple 1.8s ease-out infinite', transformOrigin: 'center', transformBox: 'fill-box' }} />}
            <circle r={r + 7 * inv} fill={c} opacity={isSel ? 0.22 : 0.1} />
            {/* level arc */}
            <circle r={r + 4 * inv} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={2.4 * inv} />
            <circle r={r + 4 * inv} fill="none" stroke={c} strokeWidth={2.4 * inv} strokeDasharray={`${circ * arc} ${circ}`} strokeLinecap="round" transform="rotate(-90)" style={{ transition: 'stroke-dasharray .6s' }} />
            <circle r={r} fill="var(--bg-2)" stroke={c} strokeWidth={(isSel ? 2.4 : 1.6) * inv} filter={isSel || isHov ? 'url(#glow)' : undefined} />
            <g transform={`scale(${inv})`}><TankIcon size={14} color={c} x={-7} y={-7} /></g>
            <text y={(r + 16) * inv} textAnchor="middle" fontSize={10.5 * inv} fontWeight={700} fill="var(--ink-0)" style={{ paintOrder: 'stroke', stroke: 'rgba(8,14,26,.8)', strokeWidth: 3 * inv }}>
              {fmt.short(f.id)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function HoverCard({ l }: { l: LiveFacility }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b>{l.f.id}</b>
        <span className="chip ghost" style={{ color: statusColor[l.status], marginLeft: 'auto' }}><i className="dot" style={{ background: statusColor[l.status] }} />{statusLabel[l.status]}</span>
      </div>
      <dl className="kv" style={{ marginTop: 8 }}>
        <dt>Tank</dt><dd>{l.level.toFixed(1)}% of {fmt.num(l.f.tank.capacity_bbl)} bbl</dd>
        <dt>Pump</dt><dd>{l.pumpStatus === 2 ? <span style={{ color: 'var(--coral)' }}>fault</span> : l.pumpStatus === 1 ? `${fmt.num(l.pumpFlow)} bpd` : 'off'}</dd>
        <dt>Inflow</dt><dd>{fmt.num(l.inflow)} bpd</dd>
        <dt>Pipeline</dt><dd>{fmt.num(l.recv)} bpd · {fmt.num(l.pipePsi)} psi</dd>
      </dl>
    </div>
  );
}

function FacilityPanel({ l, onClose }: { l: LiveFacility; onClose: () => void }) {
  const { dataset, now, analysis } = useStore();
  if (!dataset || !analysis) return null;
  const f: FacilityCtx = l.f;
  const limits = dataset.network.defaults.tank_limits_pct;
  const t = dataset.telemetry;
  const iNow = indexAt(t, now);
  const i0 = Math.max(0, iNow - 288);
  const lvl = t.series.get(`${f.tank.id}|level_pct`)!;
  const spark = Array.from({ length: iNow - i0 + 1 }, (_, k) => ({ t: t.ts[i0 + k], v: lvl[i0 + k] }));
  const running = l.pumpStatus === 1;
  const failed = l.pumpStatus === 2;
  const nodeStyle = (c: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1px solid ${c}33`, background: `${c}14` });
  const fail = analysis.orderedFailures.find((c) => c.facility.id === f.id);

  return (
    <div className="card pad" style={{ position: 'sticky', top: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div className="big" style={{ fontSize: 20 }}>{f.id}</div>
          <div className="muted" style={{ fontSize: 12 }}>{f.system} · {f.lat.toFixed(3)}, {f.lon.toFixed(3)} · trucks {f.response_min} min away</div>
        </div>
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={onClose}><X size={14} /></button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        <span className="chip ghost" style={{ color: statusColor[l.status] }}><i className="dot" style={{ background: statusColor[l.status] }} />{statusLabel[l.status]}</span>
        {l.events.map((e) => <CategoryChip key={e.id} cat={e.category} pulse />)}
      </div>

      {/* schematic */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 14 }}>
        <div style={nodeStyle('#7f93ab')}>
          <WellIcon color="var(--ink-1)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>Wells → {fmt.num(l.inflow)} bpd water</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {l.wells.map((w) => (
                <span key={w.id} className={`chip ${w.status === 1 ? 'aqua' : 'coral'} tip`} style={{ fontSize: 10.5 }}>
                  {w.id.replace(/^S\d+_WELL_/, '')} {w.status === 1 ? fmt.num(w.water) : 'shut in'}
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
            <div style={{ fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><TankIcon size={14} /> {f.tank.id}</div>
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
          <PumpIcon color={failed ? 'var(--coral)' : running ? 'var(--aqua)' : 'var(--ink-2)'} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>{f.pump.id} · {failed ? <span style={{ color: 'var(--coral)' }}>FAULT</span> : running ? 'running' : 'off (below start level)'}</div>
            <div className="muted" style={{ fontSize: 12 }}>{fmt.num(l.pumpFlow)} / {fmt.num(f.pump.max_flow_bpd)} bpd · discharge {fmt.num(l.discharge)} psi</div>
            {running && <div style={{ marginTop: 6 }}><Meter value={l.pumpFlow} max={f.pump.max_flow_bpd} ruler={false} height={8} color={l.pumpFlow / f.pump.max_flow_bpd < 0.97 ? 'amber' : 'aqua'} /></div>}
          </div>
        </div>
        <Arrow active={running} />
        <div style={nodeStyle(l.status === 'leak' ? '#f6b04b' : running ? '#2dd4bf' : '#7f93ab')}>
          <PipelineIcon color={l.status === 'leak' ? 'var(--amber)' : running ? 'var(--aqua)' : 'var(--ink-2)'} />
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
