import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronDown, Play, Send, X } from 'lucide-react';
import { useStore } from '../state/store';
import { fmt } from '../lib/model';
import { facilityBadge, mapArt } from './MapMarkers';
import { PlanTraceChart } from './PlanTraceChart';
import { calcBreakdown } from '../lib/financials';
import { representativePlans } from '../lib/scenarios';
import type { LiveFacility } from '../lib/status';
import type { PlanOption } from '../lib/types';

/**
 * ONE card for the whole pump-failure flow:
 *  1) triage (docs/img/avon-triage-card-v4.jpg)
 *  2) choose plan (docs/img/plan-act/*) → simulate / put into action on the map
 */
export function FacilityTriageCard({ live, onClose }: { live: LiveFacility; onClose: () => void }) {
  const { dataset, analysis, dispatch, startSimulate } = useStore();
  const [step, setStep] = useState<'triage' | 'plans'>('triage');
  const [calc, setCalc] = useState<{ kind: 'nothing' | 'plan'; plan: PlanOption } | null>(null);

  const fail = analysis?.orderedFailures.find((c) => c.facility.id === live.f.id);
  const options = useMemo(() => {
    if (!fail || !analysis) return [] as PlanOption[];
    const raw = analysis.systemPlans[fail.facility.system]?.options[fail.event.id] ?? [];
    return representativePlans(raw);
  }, [fail, analysis]);
  const systemRec = fail && analysis ? analysis.systemPlans[fail.facility.system]?.plans[fail.event.id] : undefined;
  const rec = useMemo(() => {
    if (!systemRec) return options.find((o) => o.recommended) ?? options[0];
    const match = options.find((o) =>
      o.trucks === systemRec.trucks
      && o.trips === systemRec.trips
      && o.shutIns.length === systemRec.shutIns.length
      && o.shutIns.every((s, i) => s.well === systemRec.shutIns[i]?.well),
    );
    return match ?? options.find((o) => o.recommended) ?? options[0];
  }, [options, systemRec]);
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const expanded = openLabel ?? rec?.label ?? options[0]?.label ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (rec?.label) setOpenLabel(rec.label);
  }, [rec?.label]);

  if (!dataset || !analysis || !fail) return null;

  const onsetLabel = fmt.time(fail.event.onset);
  const leftLabel = isFinite(fail.hoursToLimit) ? fmt.dur(fail.hoursToLimit) : '—';
  const savedRec = rec ? Math.max(0, fail.doNothingCost - rec.cost) : 0;
  const truckBlurb = rec
    ? (rec.trucks > 0
      ? `${rec.trucks} truck${rec.trucks > 1 ? 's' : ''} · about ${fmt.money(rec.truckCost)} · tank stays under 92%.`
      : `${rec.label} · tank stays under 92%.`)
    : '';

  const simulate = (plan: PlanOption) => {
    startSimulate(fail.event.id, plan);
    onClose();
  };
  const act = (plan: PlanOption) => {
    dispatch(fail.event.id, plan);
    onClose();
  };

  return (
    <div className="triage-scrim" onClick={onClose} role="presentation">
      <motion.div
        className="triage-card"
        role="dialog"
        aria-modal
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'triage' ? (
          <>
            <button type="button" className="triage-close btn ghost sm" onClick={onClose} aria-label="Close"><X size={16} /></button>

            <div className="triage-head">
              <div className="triage-icon">
                <img src={mapArt.tank} alt="" width={72} height={72} />
                <span className="chip aqua triage-badge">{facilityBadge(live.f.id)}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="triage-title-row">
                  <h2 className="triage-title">{fmt.short(live.f.id)}</h2>
                  <span className="chip coral">Pump stopped</span>
                </div>
                <p className="triage-sentence">
                  The pump that empties this tank has stopped. Water from the wells is still filling the tank.
                </p>
              </div>
            </div>

            <div className="triage-facts">
              <div>
                <div className="triage-fact-label">Where</div>
                <div>{fmt.short(live.f.id)} · {live.f.system}</div>
              </div>
              <div>
                <div className="triage-fact-label">What broke</div>
                <div>The pump (not the pipeline). Fault since {onsetLabel}.</div>
              </div>
              <div>
                <div className="triage-fact-label">Why it matters</div>
                <div>If the tank hits 92% full, every well here is forced off and oil/gas money stops until the pump is fixed (~6 hours).</div>
              </div>
            </div>

            <div className="triage-countdown">
              <div className="triage-countdown-main">{leftLabel} left until the tank hits 92%.</div>
              <div className="triage-countdown-sub">
                Tank is {fail.levelPct.toFixed(0)}% full now · filling from {fail.producingWells.length} wells · {fmt.num(fail.inflowBpd)} bpd.
              </div>
            </div>

            {rec && <PlanTraceChart ctx={fail} ds={dataset} plan={rec} height={190} />}

            <div className="impact-row">
              <div className="impact-card coral">
                <div className="impact-copy">
                  <span className="impact-kicker">Doing nothing:</span>{' '}
                  <b className="impact-lost">~{fmt.money(fail.doNothingCost)} lost</b>.
                  {' '}Wells forced off in {leftLabel} · production stops until repair.
                </div>
              </div>
              <div className="impact-card mint">
                <div className="impact-copy">
                  <span className="impact-kicker">With recommended plan:</span>{' '}
                  <b className="impact-saved">Saves ~{fmt.money(savedRec)}</b>.
                  {' '}{truckBlurb}
                </div>
              </div>
            </div>

            <div className="triage-actions">
              <button type="button" className="btn primary triage-cta" onClick={() => setStep('plans')}>
                Next: choose a plan <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="triage-plans-top">
              <button type="button" className="btn ghost sm" onClick={() => setStep('triage')}>
                <ArrowLeft size={14} /> Back
              </button>
              <button type="button" className="triage-close btn ghost sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
            </div>

            <div className="triage-plans-head">
              <h2 className="triage-title" style={{ textAlign: 'center' }}>
                {fmt.short(live.f.id)} · Pump stopped
              </h2>
              <p className="triage-plans-sub">Choose a plan.</p>
              <p className="dim" style={{ textAlign: 'center', fontSize: 12.5, margin: '4px 0 0' }}>
                Click a plan to see its chart and finances.
              </p>
            </div>

            <div className="plan-stack triage-plan-stack">
              {options.map((o) => {
                const isOpen = o.label === expanded;
                const isRec = !!o.recommended || o.label === rec?.label;
                const saved = Math.max(0, fail.doNothingCost - o.cost);
                return (
                  <div key={o.label} className={`plan-box ${isOpen ? 'open' : ''} ${isRec ? 'recommended' : ''}`}>
                    <button
                      type="button"
                      className="plan-box-head"
                      onClick={() => setOpenLabel(isOpen && !isRec ? (rec?.label ?? o.label) : o.label)}
                    >
                      <div className="plan-box-head-left">
                        {isRec && <span className="chip aqua">Recommended</span>}
                        <b className="plan-box-label">{o.label}</b>
                        {isOpen && isRec && <span className="plan-box-keep">Keeps wells online.</span>}
                      </div>
                      <div className="plan-box-head-right">
                        <span className={`plan-box-cost ${isRec ? 'rec' : ''}`}>{fmt.money(o.cost)}</span>
                        {!isOpen && <ChevronDown size={16} className="plan-box-chevron" />}
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          className="plan-box-body"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <PlanTraceChart ctx={fail} ds={dataset} plan={o} height={200} />
                          <div className="impact-row">
                            <div className="impact-card mint">
                              <div className="impact-label">Cost</div>
                              <div className="impact-value aqua">{fmt.money(o.cost)}</div>
                            </div>
                            <div className="impact-card mint">
                              <div className="impact-label">Saves</div>
                              <div className="impact-value aqua">{moneyShort(saved)}</div>
                              <button type="button" className="btn ghost sm" onClick={() => setCalc({ kind: 'plan', plan: o })}>
                                See calculation
                              </button>
                            </div>
                          </div>
                          <div className="plan-box-actions">
                            <button type="button" className="btn primary" onClick={() => simulate(o)}>
                              <Play size={14} /> Simulate on map
                            </button>
                            <button type="button" className="btn" onClick={() => act(o)}>
                              <Send size={14} /> Put into action
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <AnimatePresence>
          {calc && (
            <motion.div className="calc-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCalc(null)}>
              <motion.div className="calc-modal" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <b>{calc.kind === 'nothing' ? 'Doing nothing' : 'This plan'}</b>
                  <button type="button" className="btn ghost sm" onClick={() => setCalc(null)}><X size={14} /></button>
                </div>
                <dl className="kv">
                  {(calc.kind === 'nothing'
                    ? calcBreakdown(fail, calc.plan).doNothing.lines
                    : calcBreakdown(fail, calc.plan).plan.lines
                  ).map((row) => (
                    <div key={row.label} style={{ display: 'contents' }}>
                      <dt>{row.label}</dt><dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function moneyShort(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `$${k >= 10 ? Math.round(k) : +k.toFixed(1)}k`;
  }
  return fmt.money(v);
}
