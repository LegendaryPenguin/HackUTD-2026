import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, CheckCircle2, Fuel, MapPin, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import hero from '../assets/hero.jpg';
import { useStore } from '../state/store';
import { CATEGORY_LABEL, fmt } from '../lib/model';
import type { FailureContext } from '../lib/types';
import { WaterJug3D } from '../components/WaterJug3D';
import { OccurredStamp } from '../components/OccurredStamp';
import { CategoryChip, Confidence, Countdown, fadeUp, fadeUpAt } from '../components/ui';
import { TruckIcon } from '../components/Icons';
import type { DispatchedPlan } from '../lib/dispatch';
import { planStillActive } from '../lib/dispatch';
import { PlanImpactCompare } from '../components/PlanImpactCompare';
import { mapArt } from '../components/MapMarkers';
import './alerts.css';

export default function Alerts() {
  const { dataset, analysis, acked, ack, dispatched, now } = useStore();
  if (!dataset || !analysis) return null;
  const limits = dataset.network.defaults.tank_limits_pct;
  const failures = analysis.orderedFailures;
  const others = analysis.ongoing.filter((e) => e.category !== 'pump_failure');
  const recent = analysis.events
    .filter((e) => e.status === 'resolved' && e.end != null && e.end >= now - 12 * 3600)
    .sort((a, b) => b.end! - a.end!);
  const truckUse: Record<string, number> = {};
  for (const sp of Object.values(analysis.systemPlans)) {
    truckUse[sp.system] = Object.values(sp.allocation).reduce((a, b) => a + b, 0);
  }

  return (
    <div className="page alerts-page">
      <div className="alerts-hero">
        <div>
          <p className="alerts-kicker">Shift attention</p>
          <h1 className="page-title">Alerts</h1>
          <p className="page-sub">
            {failures.length + others.length === 0
              ? 'Nothing needs you right now.'
              : `${failures.length} pump failure${failures.length === 1 ? '' : 's'} filling tanks · ${others.length} inspection${others.length === 1 ? '' : 's'} pending`}
          </p>
        </div>
        <div className="alerts-fleet">
          {dataset.network.systems.map((s) => {
            const fleet = dataset.ops.systems[s.id]?.emergency_fleet_size ?? 0;
            const used = truckUse[s.id] ?? 0;
            return (
              <span key={s.id} className={`chip ${used ? 'amber' : 'ghost'} tip`}>
                <TruckIcon size={13} /> {s.id} {fleet - used}/{fleet}
                <span className="tipbox">
                  {s.id}: {fleet - used} of {fleet} trucks free
                  {used ? ` (${used} in the recommended plan)` : ''}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {failures.length + others.length === 0 && (
        <motion.div className="empty alerts-empty" {...fadeUp}>
          <img src={hero} alt="" />
          <h2 className="page-title" style={{ fontSize: 18 }}>All quiet</h2>
          <p>
            Every tank is cycling normally, pumps are at rated flow and pipelines receive what they are sent.
            {recent.length > 0 && ` ${recent.length} problem${recent.length > 1 ? 's' : ''} resolved in the last 12 hours.`}
          </p>
        </motion.div>
      )}

      {failures.length > 0 && (
        <section className="alerts-section">
          <div className="alerts-section-head">
            <h2>Pump failures</h2>
            <p>Soonest to shut in first · {failures.length}</p>
          </div>
          <div className="alerts-fail-list">
            <AnimatePresence initial={false}>
              {failures.map((c, i) => (
                <FailureCard key={c.event.id} ctx={c} rank={i + 1} limits={limits} dispatched={dispatched[c.event.id]} enterIndex={i} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="alerts-section">
          <div className="alerts-section-head">
            <h2>Needs an inspector</h2>
            <p>Leaks and worn pumps don’t fill tanks · {others.length}</p>
          </div>
          <div className="alerts-inspect-grid">
            <AnimatePresence initial={false}>
              {others.map((e) => (
                <motion.article
                  key={e.id}
                  className={`alert-inspect alert-status-card ${e.category === 'pipeline_leak' ? 'is-leak' : 'is-wear'}`}
                  layout
                  {...fadeUp}
                >
                  <Link to={`/?f=${encodeURIComponent(e.facility)}`} className="alert-inspect-hit" aria-label={`Open ${e.asset} on map`}>
                    <div className="alert-status-head">
                      <div className="alert-status-icon">
                        <img src={mapArt.tank} alt="" width={56} height={44} />
                      </div>
                      <div className="alert-status-titles">
                        <div className="alert-fail-title">
                          <h3>{fmt.short(e.facility)}</h3>
                          <CategoryChip cat={e.category} />
                          <span className="chip ghost">{e.system}</span>
                          <Confidence value={e.confidence} />
                        </div>
                        <p className="facility">{e.asset}</p>
                      </div>
                      <OccurredStamp unix={e.onset} label="Started" />
                    </div>
                    <ul>
                      {e.evidence.slice(0, 3).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </Link>
                  <div className="alert-inspect-actions">
                    {acked.has(e.id) ? (
                      <span className="chip mint">
                        <CheckCircle2 size={12} /> Inspector sent
                      </span>
                    ) : (
                      <button type="button" className="btn primary sm" onClick={() => ack(e.id)}>
                        <Send size={13} /> Send inspector
                      </button>
                    )}
                    <Link to={`/?f=${encodeURIComponent(e.facility)}`} className="btn ghost sm">
                      <MapPin size={13} /> Facility
                    </Link>
                    <Link
                      to={`/trends?preset=${e.category === 'pipeline_leak' ? 'leak' : 'pump'}&f=${e.facility}`}
                      className="btn ghost sm"
                    >
                      Trend <ArrowRight size={13} />
                    </Link>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="alerts-section">
          <div className="alerts-section-head">
            <h2>Resolved · last 12 hours</h2>
            <p>
              <span className="chip mint">
                <Check size={12} /> {recent.length}
              </span>
            </p>
          </div>
          <div className="alerts-resolved">
            <table className="table">
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Asset</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="row">
                    <td>
                      <CategoryChip cat={e.category} />
                    </td>
                    <td className="mono">{e.asset}</td>
                    <td className="num">{fmt.time(e.onset)}</td>
                    <td className="num">{fmt.time(e.end!)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link className="btn ghost sm" to={`/trends?f=${e.facility}&t=${e.onset}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function FailureCard({
  ctx,
  rank,
  limits,
  dispatched,
  enterIndex = 0,
}: {
  ctx: FailureContext;
  rank: number;
  limits: { warning: number; shutdown: number };
  dispatched?: DispatchedPlan;
  enterIndex?: number;
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
    ? ctx.facility.wells
        .filter((w) => dispatched.producingWells.includes(w.id) && !shutWells.has(w.id))
        .reduce((a, w) => a + w.baseline_water_bpd, 0)
    : ctx.inflowBpd;
  const urgent = !live && ctx.hoursToLimit < 1.5;

  return (
    <motion.article
      layout
      className={`alert-fail alert-status-card${urgent ? ' is-urgent' : ''}${live ? ' is-live' : ''}`}
      {...fadeUpAt(enterIndex)}
    >
      <div className="alert-status-head">
        <div className="alert-rank">{rank}</div>
        <div className="alert-status-icon">
          <img src={mapArt.tank} alt="" width={64} height={50} />
        </div>
        <div className="alert-status-titles">
          <div className="alert-fail-title">
            <h3>{fmt.short(ctx.facility.id)}</h3>
            <span className="chip ghost">{e.system}</span>
            <CategoryChip cat="pump_failure" pulse />
            {live ? (
              <span className="chip mint">plan +{m} min</span>
            ) : (
              <Countdown hours={ctx.hoursToLimit} tripsAt={ctx.tripsAtUnix} />
            )}
          </div>
          <p className="alert-fail-meta">
            {e.asset}
            {live ? (
              <>
                {' '}
                · <b style={{ color: 'var(--mint)' }}>plan live</b> tank {levelPct.toFixed(1)}% · filling{' '}
                {fmt.num(liveInflow / 24, 0)} bbl/h
              </>
            ) : (
              <>
                {' '}
                · filling {fmt.num(ctx.inflowBpd / 24, 0)} bbl/h from {ctx.producingWells.length}/
                {ctx.facility.wells.length} wells · {fmt.money(ctx.revPerHour)}/h at stake
              </>
            )}
          </p>
        </div>
        <OccurredStamp unix={e.onset} label="Failed" />
      </div>

      <div className="alert-fail-grid alert-fail-grid--body">
        <WaterJug3D
          level={levelPct}
          warn={limits.warning}
          shut={limits.shutdown}
          failed
          label={ctx.facility.tank.id}
        />
        <div className="alert-fail-main">
          <div className="alert-status-pulse">
            <strong>
              Tank {levelPct.toFixed(0)}% · repair ends {fmt.time(repairEnd)}
            </strong>
            <span>
              {live
                ? `Plan live · +${m} min`
                : `${fmt.durMin(ctx.horizonMin)} left before shut-in if nothing changes`}
            </span>
          </div>
          <div className="alert-plan">
            <div className="alert-plan-card">
              <span>
                {plan?.trucks ? <TruckIcon size={16} /> : plan?.shutIns.length ? <Fuel size={16} /> : <CheckCircle2 size={16} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <strong>{plan?.label ?? 'Wait for repair'}</strong>
                <span className="alert-plan-detail">
                  {plan?.trucks ? `truck${plan.trucks > 1 ? 's' : ''} arrive ${fmt.time(analysis.now + ctx.facility.response_min * 60)} · ` : ''}
                  {plan?.shutIns.length ? `shut in at ${fmt.time(analysis.now + plan.shutIns[0].startMin * 60)} · ` : ''}
                  peak {plan?.peakPct.toFixed(0)}%
                </span>
              </div>
              <div className="alert-plan-cost">{fmt.money(plan?.cost ?? 0)}</div>
            </div>
            <div className="alert-plan-aside tip">
              <span>
                do nothing <b className="coral">{fmt.money(ctx.doNothingCost)}</b>
              </span>
              {saving > 0 && (
                <span>
                  saves <b className="mint">{fmt.money(saving)}</b>
                </span>
              )}
              <span className="tipbox">
                If nobody acts, all wells shut in at {ctx.tripsAtUnix ? fmt.time(ctx.tripsAtUnix) : '-'} until the repair at{' '}
                {fmt.time(repairEnd)}
              </span>
            </div>
            {shares.length > 0 && (
              <span className="chip violet tip alert-share">
                <TruckIcon size={12} /> shares {e.system}’s {sp.fleet} trucks
                <span className="tipbox">
                  Planned together with {shares.join(', ')}, total {fmt.money(sp.totalCost)}
                </span>
              </span>
            )}
            {!live && plan && (
              <PlanImpactCompare ctx={ctx} ds={dataset} plan={plan} compact />
            )}
          </div>
        </div>
        <div className="alert-fail-actions">
          {dispatched ? (
            <span className="chip mint tip" style={{ justifyContent: 'center', padding: '8px 10px' }}>
              <CheckCircle2 size={13} /> {dispatched.label}
              <span className="tipbox">Live stats follow this plan when you scrub forward. Pump fault stays from sensors.</span>
            </span>
          ) : (
            <Link to={`/?f=${ctx.facility.id}&flow=decide`} className="btn primary">
              <Send size={14} /> Choose plan on map <ArrowRight size={14} />
            </Link>
          )}
          <Link to={`/?f=${ctx.facility.id}&flow=decide`} className="btn">
            Compare costs <ArrowRight size={14} />
          </Link>
          <Link to={`/?f=${ctx.facility.id}`} className="btn ghost sm">
            <MapPin size={13} /> Show on map
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

export { CATEGORY_LABEL };
