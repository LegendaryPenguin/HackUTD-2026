import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, CheckCircle2, Clock, Fuel, MapPin, Send, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import hero from '../assets/hero.jpg';
import { useStore } from '../state/store';
import { CATEGORY_LABEL, fmt } from '../lib/model';
import type { FailureContext } from '../lib/types';
import { TankGauge } from '../components/TankGauge';
import { CategoryChip, Confidence, Countdown, fadeUp } from '../components/ui';
import { TruckIcon } from '../components/Icons';
import type { DispatchedPlan } from '../lib/dispatch';
import { planStillActive } from '../lib/dispatch';

export default function Alerts() {
  const { dataset, analysis, acked, ack, dispatched, dispatch, now } = useStore();
  if (!dataset || !analysis) return null;
  const limits = dataset.network.defaults.tank_limits_pct;
  const failures = analysis.orderedFailures;
  const others = analysis.ongoing.filter((e) => e.category !== 'pump_failure');
  const recent = analysis.events.filter((e) => e.status === 'resolved' && e.end != null && e.end >= now - 12 * 3600).sort((a, b) => b.end! - a.end!);
  const truckUse: Record<string, number> = {};
  for (const sp of Object.values(analysis.systemPlans)) truckUse[sp.system] = Object.values(sp.allocation).reduce((a, b) => a + b, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Alerts</h1>
          <p className="page-sub">
            {failures.length + others.length === 0
              ? 'Nothing needs you right now.'
              : `${failures.length} pump failure${failures.length === 1 ? '' : 's'} filling tanks · ${others.length} inspection${others.length === 1 ? '' : 's'} pending`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {dataset.network.systems.map((s) => {
            const fleet = dataset.ops.systems[s.id]?.emergency_fleet_size ?? 0;
            const used = truckUse[s.id] ?? 0;
            return (
              <span key={s.id} className={`chip ${used ? 'amber' : 'ghost'} tip`}>
                <TruckIcon size={13} /> {s.id} {fleet - used}/{fleet}
                <span className="tipbox">{s.id}: {fleet - used} of {fleet} trucks free{used ? ` (${used} in the recommended plan)` : ''}</span>
              </span>
            );
          })}
        </div>
      </div>

      {failures.length + others.length === 0 && (
        <motion.div className="empty card" {...fadeUp}>
          <img src={hero} alt="" />
          <h2 className="page-title" style={{ fontSize: 20 }}>All quiet over Avon</h2>
          <p>
            Every tank is cycling normally, pumps are at rated flow and pipelines receive what they are sent.
            {recent.length > 0 && ` ${recent.length} problem${recent.length > 1 ? 's' : ''} resolved in the last 12 hours.`}
          </p>
        </motion.div>
      )}

      {failures.length > 0 && (
        <>
          <h3 className="card-title" style={{ marginTop: 6 }}><span className="chip coral"><i className="dot pulse" />Pump failures</span><span className="muted">soonest to shut in first</span></h3>
          <div className="grid" style={{ marginBottom: 26 }}>
            <AnimatePresence initial={false}>
              {failures.map((c, i) => (
                <FailureCard key={c.event.id} ctx={c} rank={i + 1} limits={limits} dispatched={dispatched[c.event.id]} onDispatch={() => dispatch(c.event.id)} />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {others.length > 0 && (
        <>
          <h3 className="card-title"><span className="chip amber"><Wrench size={12} />Needs an inspector</span><span className="muted">leaks and worn pumps don’t fill tanks</span></h3>
          <div className="grid c2" style={{ marginBottom: 26 }}>
            <AnimatePresence initial={false}>
              {others.map((e) => (
                <motion.div key={e.id} className="card pad" layout {...fadeUp}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <CategoryChip cat={e.category} />
                    <span className="chip ghost">{e.system}</span>
                    <Confidence value={e.confidence} />
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                      <Clock size={12} style={{ verticalAlign: -2 }} /> since ~{fmt.time(e.onset)} · detected {fmt.time(e.detected)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
                    <div className="big" style={{ fontSize: 22 }}>{e.asset}</div>
                    <div className="muted">{fmt.short(e.facility)}</div>
                  </div>
                  <ul style={{ margin: '10px 0 14px', paddingLeft: 18, color: 'var(--ink-1)', fontSize: 13, lineHeight: 1.6 }}>
                    {e.evidence.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {acked.has(e.id) ? (
                      <span className="chip mint"><CheckCircle2 size={12} /> Inspector sent</span>
                    ) : (
                      <button className="btn primary sm" onClick={() => ack(e.id)}><Send size={13} /> Send inspector</button>
                    )}
                    <Link to={`/?f=${e.facility}`} className="btn ghost sm"><MapPin size={13} /> Facility</Link>
                    <Link to={`/trends?preset=${e.category === 'pipeline_leak' ? 'leak' : 'pump'}&f=${e.facility}`} className="btn ghost sm">Trend <ArrowRight size={13} /></Link>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <h3 className="card-title"><span className="chip mint"><Check size={12} />Resolved in the last 12 h</span></h3>
          <div className="card">
            <table className="table">
              <thead><tr><th>Problem</th><th>Asset</th><th>Started</th><th>Ended</th><th></th></tr></thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="row">
                    <td><CategoryChip cat={e.category} /></td>
                    <td className="mono">{e.asset}</td>
                    <td className="num">{fmt.dayTime(e.onset)}</td>
                    <td className="num">{fmt.dayTime(e.end!)}</td>
                    <td style={{ textAlign: 'right' }}><Link className="btn ghost sm" to={`/trends?f=${e.facility}&t=${e.onset}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function FailureCard({ ctx, rank, limits, dispatched, onDispatch }: {
  ctx: FailureContext; rank: number; limits: { warning: number; shutdown: number };
  dispatched?: DispatchedPlan; onDispatch: () => void;
}) {
  const { dataset, analysis, now } = useStore();
  if (!dataset || !analysis) return null;
  const e = ctx.event;
  const sp = analysis.systemPlans[e.system];
  const plan = dispatched?.plan ?? sp?.plans[e.id];
  const repairEnd = e.onset + dataset.ops.expected_repair_hours.pump_failure * 3600;
  const shares = sp && Object.keys(sp.plans).length > 1 ? Object.keys(sp.plans).filter((id) => id !== e.id) : [];
  const saving = ctx.doNothingCost - (plan?.cost ?? 0);
  const live = dispatched && planStillActive(dispatched, now);
  const m = live ? Math.min(Math.floor((now - dispatched.commitUnix) / 60), dispatched.levelTracePct.length - 1) : 0;
  const levelPct = live ? dispatched.levelTracePct[m] : ctx.levelPct;
  const shutWells = new Set(live ? dispatched.plan.shutIns.filter((s) => s.startMin <= m).map((s) => s.well) : []);
  if (live && dispatched.plan.tripAt != null && m >= dispatched.plan.tripAt) {
    for (const id of dispatched.producingWells) shutWells.add(id);
  }
  const liveInflow = live
    ? ctx.facility.wells.filter((w) => dispatched.producingWells.includes(w.id) && !shutWells.has(w.id)).reduce((a, w) => a + w.baseline_water_bpd, 0)
    : ctx.inflowBpd;
  const urgent = !live && ctx.hoursToLimit < 1.5;

  return (
    <motion.div layout className="card" {...fadeUp} style={{ borderColor: urgent ? 'rgba(251,113,133,.45)' : live ? 'rgba(45,212,191,.35)' : undefined }}>
      {urgent && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 0 1px rgba(251,113,133,.25), inset 0 0 60px rgba(251,113,133,.08)' }} />}
      <div className="fail-grid">
        <div className="big" style={{ fontSize: 34, color: urgent ? 'var(--coral)' : 'var(--ink-2)', width: 36 }}>{rank}</div>
        <TankGauge level={levelPct} warn={limits.warning} shut={limits.shutdown} failed label={ctx.facility.tank.id} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="big" style={{ fontSize: 20 }}>{fmt.short(ctx.facility.id)}</div>
            <span className="chip ghost">{e.system}</span>
            <CategoryChip cat="pump_failure" pulse />
            {live ? <span className="chip mint">plan +{m} min</span> : <Countdown hours={ctx.hoursToLimit} tripsAt={ctx.tripsAtUnix} />}
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>
            {e.asset} failed {fmt.time(e.onset)} · repair ends <b style={{ color: 'var(--ink-0)' }}>{fmt.time(repairEnd)}</b>
            {live
              ? <> · <b style={{ color: 'var(--mint)' }}>plan live</b> tank {levelPct.toFixed(1)}% · filling {fmt.num(liveInflow / 24, 0)} bbl/h</>
              : <> ({fmt.durMin(ctx.horizonMin)} left) · filling {fmt.num(ctx.inflowBpd / 24, 0)} bbl/h from {ctx.producingWells.length}/{ctx.facility.wells.length} wells · {fmt.money(ctx.revPerHour)}/h at stake</>}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'var(--aqua-dim)', border: '1px solid rgba(45,212,191,.3)' }}>
              <span style={{ color: 'var(--aqua-2)' }}>{plan?.trucks ? <TruckIcon size={18} /> : plan?.shutIns.length ? <Fuel size={18} /> : <CheckCircle2 size={18} />}</span>
              <div>
                <div style={{ fontWeight: 700 }}>{plan?.label ?? 'Wait for repair'}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {plan?.trucks ? `truck${plan.trucks > 1 ? 's' : ''} arrive ${fmt.time(analysis.now + ctx.facility.response_min * 60)} · ` : ''}
                  {plan?.shutIns.length ? `shut in at ${fmt.time(analysis.now + plan.shutIns[0].startMin * 60)} · ` : ''}
                  peak {plan?.peakPct.toFixed(0)}%
                </div>
              </div>
              <div className="big" style={{ fontSize: 20, color: 'var(--aqua-2)', marginLeft: 8 }}>{fmt.money(plan?.cost ?? 0)}</div>
            </div>
            <div className="muted tip" style={{ fontSize: 12.5 }}>
              do nothing: <b style={{ color: 'var(--coral)' }}>{fmt.money(ctx.doNothingCost)}</b>
              {saving > 0 && <> · saves <b style={{ color: 'var(--mint)' }}>{fmt.money(saving)}</b></>}
              <span className="tipbox">If nobody acts, all wells shut in at {ctx.tripsAtUnix ? fmt.time(ctx.tripsAtUnix) : '—'} until the repair at {fmt.time(repairEnd)}</span>
            </div>
            {shares.length > 0 && (
              <span className="chip violet tip">
                <TruckIcon size={12} /> shares {e.system}’s {sp.fleet} trucks
                <span className="tipbox">Planned together with {shares.join(', ')} — total {fmt.money(sp.totalCost)}</span>
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', minWidth: 150 }}>
          {dispatched ? (
            <span className="chip mint tip" style={{ justifyContent: 'center', padding: '8px 10px' }}>
              <CheckCircle2 size={13} /> {dispatched.label}
              <span className="tipbox">Live stats follow this plan when you scrub forward. Pump fault stays from sensors.</span>
            </span>
          ) : (
            <button className="btn primary" onClick={onDispatch}><Send size={14} /> Dispatch plan</button>
          )}
          <Link to={`/plan/${e.id}`} className="btn">Compare options <ArrowRight size={14} /></Link>
          <Link to={`/?f=${ctx.facility.id}`} className="btn ghost sm"><MapPin size={13} /> Show on map</Link>
        </div>
      </div>
    </motion.div>
  );
}

export { CATEGORY_LABEL };
