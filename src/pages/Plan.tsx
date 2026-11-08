import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Play, Send } from 'lucide-react';
import { useStore } from '../state/store';
import { fmt } from '../lib/model';
import type { PlanOption } from '../lib/types';
import { facilityBadge, mapArt } from '../components/MapMarkers';
import { PlanTraceChart } from '../components/PlanTraceChart';
import { calcBreakdown } from '../lib/financials';
import { representativePlans } from '../lib/scenarios';
import { fadeUp } from '../components/ui';

export default function Plan() {
  const { id } = useParams();
  const nav = useNavigate();
  const { dataset, analysis, setNow, dispatched, dispatch, startSimulate } = useStore();
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const [calcFor, setCalcFor] = useState<{ kind: 'nothing' | 'plan'; plan: PlanOption } | null>(null);

  if (!dataset || !analysis) return null;

  const ctx = analysis.failures.find((c) => c.event.id === id);
  const event = analysis.events.find((e) => e.id === id);

  if (!ctx) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Choose a plan</h1>
            <p className="page-sub">No active pump failure at this time.</p>
          </div>
        </div>
        {event?.category === 'pump_failure' && (
          <button className="btn primary" onClick={() => setNow(event.onset + 300)}>Replay from onset</button>
        )}
        <div className="grid" style={{ marginTop: 16 }}>
          {analysis.orderedFailures.map((c) => (
            <Link key={c.event.id} to={`/plan/${c.event.id}`} className="card pad" style={{ color: 'inherit' }}>
              {fmt.short(c.facility.id)} · {fmt.dur(c.hoursToLimit)} to 92%
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const sp = analysis.systemPlans[ctx.facility.system];
  const options = representativePlans(sp?.options[ctx.event.id] ?? []);
  const rec = options.find((o) => o.recommended) ?? options[0];
  const expanded = openLabel ?? rec?.label ?? options[0]?.label ?? null;
  const active = options.find((o) => o.label === expanded) ?? rec;
  const committed = dispatched[ctx.event.id];

  return (
    <div className="page plans-page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <button type="button" className="btn ghost sm" onClick={() => nav(`/?f=${ctx.facility.id}`)} style={{ marginBottom: 8 }}>
            <ArrowLeft size={13} /> Map
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={mapArt.tank} alt="" width={48} height={48} style={{ objectFit: 'contain' }} />
            <div>
              <h1 className="page-title" style={{ margin: 0 }}>{fmt.short(ctx.facility.id)} · Pump stopped</h1>
              <p className="page-sub" style={{ margin: 0 }}>Choose a plan.</p>
            </div>
            <span className="chip aqua" style={{ fontWeight: 800 }}>{facilityBadge(ctx.facility.id)}</span>
          </div>
        </div>
      </div>

      <div className="plan-stack">
        {options.map((o) => {
          const isOpen = o.label === expanded;
          const isRec = !!o.recommended || o.label === rec?.label;
          return (
            <motion.div
              key={o.label}
              layout
              className={`plan-box ${isOpen ? 'open' : ''} ${isRec ? 'recommended' : ''}`}
              {...fadeUp}
            >
              <button type="button" className="plan-box-head" onClick={() => setOpenLabel(o.label)}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {isRec && <span className="chip aqua">Recommended</span>}
                    {committed?.label === o.label && <span className="chip mint"><Check size={12} /> Live</span>}
                  </div>
                  <b style={{ fontSize: 16 }}>{o.label}</b>
                  {isRec && <span className="dim" style={{ fontSize: 12 }}>Keeps wells online.</span>}
                </div>
                <div className="big" style={{ fontSize: 28, color: isRec ? 'var(--aqua-2)' : undefined }}>{fmt.money(o.cost)}</div>
              </button>

              {isOpen && active && active.label === o.label && (
                <div className="plan-box-body">
                  <PlanTraceChart ctx={ctx} ds={dataset} plan={o} height={200} />
                  <div className="impact-row">
                    <div className="impact-card coral">
                      <div className="impact-label">Cost</div>
                      <div className="impact-value">{fmt.money(o.cost)}</div>
                    </div>
                    <div className="impact-card mint">
                      <div className="impact-label">Saves</div>
                      <div className="impact-value">{fmt.money(Math.max(0, ctx.doNothingCost - o.cost))}</div>
                      <button type="button" className="btn ghost sm" onClick={() => setCalcFor({ kind: 'plan', plan: o })}>See calculation</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        startSimulate(ctx.event.id, o);
                        nav(`/?f=${ctx.facility.id}&sim=1`);
                      }}
                    >
                      <Play size={14} /> Simulate on map
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        dispatch(ctx.event.id, o);
                        nav(`/?f=${ctx.facility.id}`);
                      }}
                    >
                      <Send size={14} /> Put into action
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {calcFor && (
        <div className="calc-scrim" onClick={() => setCalcFor(null)} role="presentation">
          <div className="calc-modal" onClick={(e) => e.stopPropagation()}>
            <b>{calcFor.kind === 'nothing' ? 'Doing nothing' : 'This plan'}</b>
            <dl className="kv" style={{ marginTop: 10 }}>
              {(calcFor.kind === 'nothing' ? calcBreakdown(ctx, calcFor.plan).doNothing.lines : calcBreakdown(ctx, calcFor.plan).plan.lines).map((row) => (
                <div key={row.label} style={{ display: 'contents' }}>
                  <dt>{row.label}</dt><dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={() => setCalcFor(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
