import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, ClipboardCopy, FileJson, Filter } from 'lucide-react';
import { useStore } from '../state/store';
import { eventsJson, shiftSummary } from '../lib/summary';
import { CATEGORY_LABEL, facilityMap, facilityRevPerHour, fmt, indexAt } from '../lib/model';
import { failureContext, planSystem } from '../lib/planner';
import type { Category, DetectedEvent } from '../lib/types';
import { CategoryChip, Confidence, StatusChip, catHex, fadeUp } from '../components/ui';

export default function ShiftLog() {
  const { dataset, analysis, now, setNow } = useStore();
  const [copied, setCopied] = useState(false);
  const [hoursBack, setHoursBack] = useState(12);
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [sys, setSys] = useState('all');

  const text = useMemo(() => (dataset && analysis ? shiftSummary(dataset, analysis, hoursBack) : ''), [dataset, analysis, hoursBack]);

  // Cost report: what each pump failure actually cost in the recording vs. what the recommended plan would have cost.
  const report = useMemo(() => {
    if (!dataset || !analysis) return [];
    const fm = facilityMap(dataset.network, dataset.ops);
    const t = dataset.telemetry;
    return analysis.events.filter((e) => e.category === 'pump_failure').map((e) => {
      const f = fm.get(e.facility)!;
      const end = e.end ?? Math.min(now, e.onset + dataset.ops.expected_repair_hours.pump_failure * 3600);
      const inflow = t.series.get(`${f.id}|inflow_bpd`)!;
      const i0 = indexAt(t, e.onset), i1 = indexAt(t, end);
      let shutSamples = 0;
      for (let i = i0; i <= i1; i++) if (inflow[i] < 1) shutSamples++;
      const actual = (shutSamples * 5 / 60) * facilityRevPerHour(f, dataset.ops);
      const ctx = failureContext(e, dataset, e.onset + 300);
      const plan = planSystem([ctx], dataset).plans[e.id];
      return { e, f, actual, plan, tripped: shutSamples > 0 };
    });
  }, [dataset, analysis, now]);

  if (!dataset || !analysis) return null;

  const events = [...analysis.events].reverse().filter((e) => (cat === 'all' || e.category === cat) && (sys === 'all' || e.system === sys));

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(eventsJson(dataset, analysis), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `events_${dataset.name}_${fmt.iso(now).replace(/[:]/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const totalActual = report.reduce((s, r) => s + r.actual, 0);
  const totalPlan = report.reduce((s, r) => s + (r.plan?.cost ?? 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Shift log</h1>
          <p className="page-sub">Handoff notes in plain words, the full event history, and the cost report.</p>
        </div>
        <button className="btn" onClick={download}><FileJson size={14} /> Export events.json</button>
      </div>

      <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', marginBottom: 16 }}>
        <motion.section className="card pad" {...fadeUp}>
          <h3 className="card-title">Handoff summary
            <span className="muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <span className="seg">{[8, 12, 24].map((h) => <button key={h} className={hoursBack === h ? 'on' : ''} onClick={() => setHoursBack(h)}>{h}h</button>)}</span>
              <button className="btn sm" onClick={copy}>{copied ? <Check size={13} /> : <ClipboardCopy size={13} />} {copied ? 'Copied' : 'Copy'}</button>
            </span>
          </h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font)', fontSize: 13.5, lineHeight: 1.6, margin: 0, color: 'var(--ink-1)' }}>{text}</pre>
        </motion.section>

        <motion.section className="card pad" {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.06 }}>
          <h3 className="card-title">Cost report <span className="muted">what it cost vs. what the plan would have cost</span></h3>
          {report.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>No pump failures in this recording yet.</p> : (
            <>
              <div style={{ display: 'flex', gap: 18, marginBottom: 10 }}>
                <div><div className="dim" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Lost in recording</div><div className="big num" style={{ color: 'var(--coral)', fontSize: 24 }}>{fmt.money(totalActual)}</div></div>
                <div><div className="dim" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>With recommended plans</div><div className="big num" style={{ color: 'var(--aqua-2)', fontSize: 24 }}>{fmt.money(totalPlan)}</div></div>
                <div><div className="dim" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Saved</div><div className="big num" style={{ color: 'var(--mint)', fontSize: 24 }}>{fmt.money(Math.max(0, totalActual - totalPlan))}</div></div>
              </div>
              <div style={{ height: Math.max(120, report.length * 30 + 20) }}>
                <ResponsiveContainer>
                  <BarChart data={report.map((r) => ({ name: `${r.f.system} ${fmt.short(r.f.id).replace('Facility ', '')} · ${fmt.dayTime(r.e.onset).slice(4)}`, actual: Math.round(r.actual), plan: Math.round(r.plan?.cost ?? 0), id: r.e.id }))} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, n) => [fmt.money(Number(v ?? 0)), n === 'actual' ? 'Lost in recording' : 'Recommended plan']} contentStyle={{ fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,.03)' }} />
                    <Bar dataKey="actual" radius={[0, 6, 6, 0]} isAnimationActive animationDuration={700}>{report.map((r) => <Cell key={r.e.id} fill="var(--coral)" opacity={0.85} />)}</Bar>
                    <Bar dataKey="plan" radius={[0, 6, 6, 0]} isAnimationActive animationDuration={700}>{report.map((r) => <Cell key={r.e.id} fill="var(--aqua)" />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>“Lost in recording” counts hours wells were actually shut in × facility revenue. Plan cost is the cheapest option available 5 minutes after the pump failed, trucks unshared.</div>
            </>
          )}
        </motion.section>
      </div>

      <section className="card">
        <div style={{ padding: '14px 18px 8px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 className="card-title" style={{ margin: 0 }}>Event history <span className="muted" style={{ marginLeft: 8 }}>{events.length} of {analysis.events.length}</span></h3>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Filter size={14} color="var(--ink-3)" />
            <span className="seg">
              <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All</button>
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => <button key={c} className={cat === c ? 'on' : ''} style={{ color: cat === c ? catHex[c] : undefined }} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>)}
            </span>
            <span className="seg">
              <button className={sys === 'all' ? 'on' : ''} onClick={() => setSys('all')}>All systems</button>
              {dataset.network.systems.map((s) => <button key={s.id} className={sys === s.id ? 'on' : ''} onClick={() => setSys(s.id)}>{s.id}</button>)}
            </span>
          </span>
        </div>
        <table className="table">
          <thead><tr><th>ID</th><th>Problem</th><th>Asset</th><th>Started</th><th>Ended</th><th>Duration</th><th>Confidence</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {events.map((e) => <Row key={e.id} e={e} now={now} setNow={setNow} />)}
            {events.length === 0 && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 24 }}>Nothing matches these filters.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Row({ e, now, setNow }: { e: DetectedEvent; now: number; setNow: (u: number) => void }) {
  const dur = ((e.end ?? now) - e.onset) / 3600;
  return (
    <tr className="row">
      <td className="mono dim">{e.id}</td>
      <td><CategoryChip cat={e.category} pulse={e.status === 'ongoing'} /></td>
      <td><div style={{ fontWeight: 600 }}>{e.asset}</div><div className="dim" style={{ fontSize: 11 }}>{e.facility} · {e.system}</div></td>
      <td className="mono">{fmt.dayTime(e.onset)}</td>
      <td className="mono">{e.end ? fmt.dayTime(e.end) : <span className="dim">—</span>}</td>
      <td className="num">{fmt.dur(dur)}</td>
      <td><Confidence value={e.confidence} /></td>
      <td><StatusChip status={e.status} /></td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <Link className="btn ghost sm" to={`/trends?f=${e.facility}&preset=${e.category === 'pipeline_leak' ? 'leak' : e.category === 'pump_degradation' ? 'pump' : 'tank'}&t=${e.onset}`}>Trend</Link>
        {e.category === 'pump_failure' && <button className="btn ghost sm" onClick={() => setNow(e.onset + 300)}>Replay</button>}
      </td>
    </tr>
  );
}
