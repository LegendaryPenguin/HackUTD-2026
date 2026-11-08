import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown } from 'lucide-react';
import { useStore } from '../state/store';
import { facilities, fmt, indexAt } from '../lib/model';
import type { FacilityCtx } from '../lib/types';
import { catHex } from '../components/ui';
import { CATEGORY_LABEL } from '../lib/model';

type Unit = 'pct' | 'bpd' | 'psi' | 'status';
interface MetricDef { key: string; asset: string; metric: string; label: string; unit: Unit; color: string }

const PRESETS: Record<string, { name: string; pick: (f: FacilityCtx) => string[] }> = {
  tank: { name: 'Tank sawtooth', pick: (f) => [`${f.tank.id}|level_pct`, `${f.pump.id}|status`, `${f.id}|inflow_bpd`, `${f.pump.id}|flow_bpd`] },
  leak: { name: 'Leak check', pick: (f) => [`${f.pump.id}|flow_bpd`, `${f.pipeline.id}|receive_flow_bpd`, `${f.pipeline.id}|pressure_psi`] },
  pump: { name: 'Pump health', pick: (f) => [`${f.pump.id}|flow_bpd`, `${f.pump.id}|discharge_psi`, `${f.pump.id}|status`] },
  wells: { name: 'Wells', pick: (f) => [`${f.id}|inflow_bpd`, ...f.wells.map((w) => `${w.id}|water_bpd`)] },
};
const WINDOWS = [{ l: '6h', s: 6 * 3600 }, { l: '24h', s: 24 * 3600 }, { l: '3d', s: 72 * 3600 }, { l: 'Week', s: 8 * 86400 }];
const COLORS = ['#2dd4bf', '#f6b04b', '#a78bfa', '#60a5fa', '#f472b6', '#4ade80', '#fb7185', '#facc15'];

export default function Trends() {
  const { dataset, analysis, now, setNow } = useStore();
  const [params, setParams] = useSearchParams();
  const facs = useMemo(() => (dataset ? facilities(dataset.network, dataset.ops) : []), [dataset]);
  const fid = params.get('f') ?? facs[0]?.id;
  const preset = params.get('preset') ?? 'tank';
  const [win, setWin] = useState(1);
  const [custom, setCustom] = useState<Set<string> | null>(null);
  const [compare, setCompare] = useState<string>('');

  const f = facs.find((x) => x.id === fid) ?? facs[0];
  const f2 = facs.find((x) => x.id === compare);

  const defs = useMemo<MetricDef[]>(() => {
    if (!dataset || !f) return [];
    const keys = custom ? [...custom] : PRESETS[preset]?.pick(f) ?? PRESETS.tank.pick(f);
    const all = [...keys];
    if (f2) for (const k of keys) all.push(k.replace(f.id.replace('FACILITY', ''), f2.id.replace('FACILITY', '')));
    return all
      .filter((k) => dataset.telemetry.series.has(k))
      .map((k, i) => {
        const [asset, metric] = k.split('|');
        const unit: Unit = metric.includes('pct') ? 'pct' : metric.includes('psi') ? 'psi' : metric === 'status' ? 'status' : 'bpd';
        return { key: k, asset, metric, label: `${fmt.short(asset)} ${metric.replace('_', ' ')}`, unit, color: COLORS[i % COLORS.length] };
      });
  }, [dataset, f, f2, preset, custom]);

  const data = useMemo(() => {
    if (!dataset || !f) return [];
    const t = dataset.telemetry;
    const centerParam = params.get('t');
    const end = centerParam ? Math.min(now, +centerParam + WINDOWS[win].s / 2) : now;
    const start = end - WINDOWS[win].s;
    const i0 = Math.max(0, indexAt(t, start)), i1 = indexAt(t, end);
    const step = Math.max(1, Math.floor((i1 - i0) / 900));
    const rows: Record<string, number>[] = [];
    for (let i = i0; i <= i1; i += step) {
      const row: Record<string, number> = { t: t.ts[i] };
      for (const d of defs) row[d.key] = t.series.get(d.key)![i];
      rows.push(row);
    }
    return rows;
  }, [dataset, f, defs, now, win, params]);

  if (!dataset || !analysis || !f) return null;
  const limits = dataset.network.defaults.tank_limits_pct;
  const t0 = data[0]?.t ?? now, t1 = data[data.length - 1]?.t ?? now;
  const evs = analysis.events.filter((e) => (e.facility === f.id || (f2 && e.facility === f2.id)) && e.onset <= t1 && (e.end ?? now) >= t0);
  const units = [...new Set(defs.map((d) => d.unit))];
  const assetMetrics = [f.tank, f.pump, f.pipeline, { id: f.id }, ...f.wells].flatMap((a) => (dataset.telemetry.metrics.get(a.id) ?? []).map((m) => `${a.id}|${m}`));

  return (
    <div className="page" style={{ maxWidth: 1600 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Trends</h1>
          <p className="page-sub">Any sensor, any asset. Shaded bands are detected problems; click one to jump there.</p>
        </div>
      </div>

      <div className="card pad" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="select">
          <select value={f.id} onChange={(e) => setParams({ f: e.target.value, preset })}>
            {dataset.network.systems.map((s) => (
              <optgroup key={s.id} label={s.id}>{s.facilities.map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}</optgroup>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <div className="seg">
          {Object.entries(PRESETS).map(([k, p]) => (
            <button key={k} className={!custom && preset === k ? 'on' : ''} onClick={() => { setCustom(null); setParams({ f: f.id, preset: k }); }}>{p.name}</button>
          ))}
          <button className={custom ? 'on' : ''} onClick={() => setCustom(new Set(PRESETS[preset]?.pick(f) ?? []))}>Custom</button>
        </div>
        <div className="seg">
          {WINDOWS.map((w, i) => <button key={w.l} className={win === i ? 'on' : ''} onClick={() => setWin(i)}>{w.l}</button>)}
        </div>
        <div className="select" style={{ marginLeft: 'auto' }}>
          <select value={compare} onChange={(e) => setCompare(e.target.value)}>
            <option value="">Compare with…</option>
            {facs.filter((x) => x.id !== f.id).map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
          </select>
          <ChevronDown size={14} />
        </div>
      </div>

      {custom && (
        <div className="card pad" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {assetMetrics.map((k) => {
            const on = custom.has(k);
            const [a, m] = k.split('|');
            return (
              <button key={k} className={`chip ${on ? 'aqua' : 'ghost'}`} style={{ cursor: 'pointer' }} onClick={() => setCustom((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}>
                {fmt.short(a)} · {m}
              </button>
            );
          })}
        </div>
      )}

      <div className="card pad">
        <div style={{ height: 460 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => (WINDOWS[win].s > 86400 ? fmt.dayTime(v).slice(0, 9) : fmt.time(v))} tickCount={10} />
              {units.includes('pct') && <YAxis yAxisId="pct" domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={44} />}
              {units.includes('bpd') && <YAxis yAxisId="bpd" orientation="right" tickFormatter={(v) => `${Math.round(v / 100) / 10}k`} width={40} />}
              {units.includes('psi') && <YAxis yAxisId="psi" orientation="right" domain={['auto', 'auto']} width={44} tickFormatter={(v) => `${v}`} />}
              {units.includes('status') && <YAxis yAxisId="status" hide domain={[0, 2]} />}
              <Tooltip labelFormatter={(v) => fmt.dayTime(Number(v))} formatter={(v, name) => [typeof v === 'number' ? fmt.num(v, String(name).includes('pct') ? 1 : 0) : String(v ?? ''), String(name)]} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {evs.map((e) => (
                <ReferenceArea key={e.id} yAxisId={units[0]} x1={Math.max(t0, e.onset)} x2={Math.min(t1, e.end ?? now)} fill={catHex[e.category]} fillOpacity={0.09} stroke={catHex[e.category]} strokeOpacity={0.35}
                  label={{ value: CATEGORY_LABEL[e.category], fill: catHex[e.category], fontSize: 10, position: 'insideTop' }} onClick={() => setNow(Math.min(now, (e.end ?? now)))} style={{ cursor: 'pointer' }} />
              ))}
              {units.includes('pct') && <ReferenceLine yAxisId="pct" y={limits.shutdown} stroke="var(--coral)" strokeDasharray="4 4" />}
              {units.includes('pct') && <ReferenceLine yAxisId="pct" y={limits.warning} stroke="var(--amber)" strokeDasharray="4 4" />}
              {defs.map((d) => (
                <Line key={d.key} yAxisId={d.unit} type={d.unit === 'status' ? 'stepAfter' : 'monotone'} dataKey={d.key} name={d.label} stroke={d.color} strokeWidth={d.unit === 'status' ? 1.2 : 1.8} dot={false} isAnimationActive animationDuration={500} strokeOpacity={d.unit === 'status' ? 0.6 : 1} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {evs.map((e) => (
            <span key={e.id} className="chip ghost" style={{ color: catHex[e.category] }}>
              <i className="dot" style={{ background: catHex[e.category] }} /> {e.asset} {CATEGORY_LABEL[e.category].toLowerCase()} · {fmt.dayTime(e.onset)} → {e.end ? fmt.time(e.end) : 'ongoing'}
            </span>
          ))}
          {evs.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No problems in this window for {f.id}.</span>}
        </div>
      </div>
    </div>
  );
}
