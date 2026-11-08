import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, LineChart, Play, Send, X } from 'lucide-react';
import { useStore } from '../state/store';
import { fmt } from '../lib/model';
import { mapArt } from './MapMarkers';
import { PlanTraceChart } from './PlanTraceChart';
import { calcBreakdown } from '../lib/financials';
import { representativePlans } from '../lib/scenarios';
import type { LiveFacility } from '../lib/status';
import type { PlanOption } from '../lib/types';
import { AvonCardShell } from './AvonCardShell';
import { LiquidMeter } from './ui';

type Step = 'identify' | 'decide' | 'act';
const STEPS: Step[] = ['identify', 'decide', 'act'];
const STEP_LABEL: Record<Step, string> = {
  identify: 'Identify',
  decide: 'Decide',
  act: 'Act',
};

/**
 * Night-guard flow: Identify → Decide → Act on a ReflectiveCard.
 */
export function FacilityTriageCard({
  live,
  onClose,
  initialStep = 'identify',
}: {
  live: LiveFacility;
  onClose: () => void;
  initialStep?: Step;
}) {
  const { dataset, analysis, dispatch, startSimulate } = useStore();
  const [step, setStep] = useState<Step>(initialStep);
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
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (rec?.label) setSelectedLabel(rec.label);
  }, [rec?.label]);

  if (!dataset || !analysis || !fail) return null;

  // Always show the glass card for an active failure — even if plan options are still empty.
  const fallbackPlan: PlanOption = {
    label: 'Wait for repair',
    cost: fail.doNothingCost,
    truckCost: 0,
    shutInCost: 0,
    trucks: 0,
    trips: 0,
    shutIns: [],
    peakPct: fail.levelPct,
    tripAt: isFinite(fail.hoursToLimit) ? Math.round(fail.hoursToLimit * 60) : null,
    recommended: true,
  };
  const selected = options.find((o) => o.label === (selectedLabel ?? rec?.label)) ?? rec ?? options[0] ?? fallbackPlan;

  const onsetLabel = fmt.time(fail.event.onset);
  const leftLabel = isFinite(fail.hoursToLimit) ? fmt.dur(fail.hoursToLimit) : '—';
  const leftWords = isFinite(fail.hoursToLimit) ? hoursWords(fail.hoursToLimit) : '—';
  const savedRec = Math.max(0, fail.doNothingCost - (rec?.cost ?? fallbackPlan.cost));
  const savedSel = Math.max(0, fail.doNothingCost - selected.cost);
  const repairH = dataset.ops.expected_repair_hours.pump_failure;
  const stationName = `${live.f.system} station`;
  const truckBlurb = rec
    ? (rec.trucks > 0
      ? `${rec.trucks} truck${rec.trucks > 1 ? 's' : ''} · about ${fmt.money(rec.truckCost)} · tank stays under 92%.`
      : `${rec.label} · tank stays under 92%.`)
    : '';

  const actionSteps = buildActionSteps(selected, fail.facility.response_min, repairH, stationName);

  const simulate = () => {
    startSimulate(fail.event.id, selected);
    onClose();
  };
  const commit = () => {
    dispatch(fail.event.id, selected);
    onClose();
  };

  return (
    <>
      <AvonCardShell
        onClose={onClose}
        topLeft={step !== 'identify' ? (
          <button
            type="button"
            className="avon-panel__back"
            onClick={() => setStep(step === 'act' ? 'decide' : 'identify')}
          >
            <ArrowLeft size={14} /> Back
          </button>
        ) : undefined}
        topCenter={(
          <div className="avon-steps" aria-label="Triage steps">
            {STEPS.map((s) => (
              <span key={s} className={`avon-steps__item ${s === step ? 'is-active' : ''}`}>
                {STEP_LABEL[s]}
              </span>
            ))}
          </div>
        )}
      >
            {step === 'identify' && (
              <div className="avon-status">
                <div className="triage-head">
                  <div className="triage-icon">
                    <img src={mapArt.tank} alt="" width={64} height={48} />
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
                    <div>{stationName}</div>
                  </div>
                  <div>
                    <div className="triage-fact-label">What broke</div>
                    <div>The pump (not the pipeline). Fault since {onsetLabel}.</div>
                  </div>
                  <div>
                    <div className="triage-fact-label">Why it matters</div>
                    <div>If the tank hits 92% full, every well here is forced off until the pump is fixed (~{repairH} hours).</div>
                  </div>
                </div>

                <div className="triage-countdown">
                  <div className="triage-countdown-main">{leftWords} left until the tank hits 92%.</div>
                  <div className="triage-countdown-sub">
                    Tank is {fail.levelPct.toFixed(0)}% full now · filling from {fail.producingWells.length} wells · {fmt.num(fail.inflowBpd)} bpd.
                  </div>
                </div>

                <LiquidMeter
                  label="Tank fill"
                  display={`${fail.levelPct.toFixed(0)}%`}
                  value={fail.levelPct}
                  max={100}
                  warn={85}
                  shut={92}
                  fluid="water"
                  height={14}
                />

                {rec && (
                  <div className="avon-status__chart">
                    <PlanTraceChart ctx={fail} ds={dataset} plan={rec} height={96} compact />
                  </div>
                )}

                <div className="avon-status__chips">
                  <div className="avon-status__chip is-coral">
                    <div className="triage-fact-label">Doing nothing</div>
                    <b>~{fmt.money(fail.doNothingCost)} lost</b>
                    <span>Wells forced off in {leftLabel} · production stops until repair.</span>
                  </div>
                  {rec && (
                    <div className="avon-status__chip is-mint">
                      <div className="triage-fact-label">With recommended plan</div>
                      <b>Saves ~{fmt.money(savedRec)}</b>
                      <span>{truckBlurb}</span>
                    </div>
                  )}
                </div>

                <div className="triage-actions" style={{ flexDirection: 'column', gap: 8 }}>
                  <button type="button" className="btn primary triage-cta" onClick={() => setStep('decide')}>
                    Next: choose a plan <ArrowRight size={16} />
                  </button>
                  <Link to="/alerts" className="btn ghost sm" onClick={onClose} style={{ justifyContent: 'center' }}>
                    <LineChart size={14} /> In-depth analysis
                  </Link>
                </div>
              </div>
            )}

            {step === 'decide' && (
              <div className="avon-status">
                <div className="triage-plans-head">
                  <h2 className="triage-title" style={{ fontSize: 22, textAlign: 'center' }}>Choose a plan</h2>
                  <p className="triage-plans-sub">{stationName} · pick one path, then Act</p>
                </div>

                <div className="avon-plan-choices">
                  {options.map((o) => {
                    const isSel = o.label === selected.label;
                    const isRec = !!o.recommended || o.label === rec?.label;
                    return (
                      <button
                        key={o.label}
                        type="button"
                        className={`avon-plan-choice ${isSel ? 'is-selected' : ''} ${isRec ? 'is-rec' : ''}`}
                        onClick={() => setSelectedLabel(o.label)}
                      >
                        {isRec && <span className="chip mint">Recommended</span>}
                        <span className="avon-plan-choice__label">{o.label}</span>
                        <span className="avon-plan-choice__cost">{fmt.money(o.cost)}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="avon-status__chips">
                  <div className="avon-status__chip is-coral">
                    <div className="triage-fact-label">Doing nothing</div>
                    <b>~{fmt.money(fail.doNothingCost)}</b>
                    <button type="button" className="btn ghost sm" onClick={() => setCalc({ kind: 'nothing', plan: selected })}>
                      See calculation
                    </button>
                  </div>
                  <div className="avon-status__chip is-mint">
                    <div className="triage-fact-label">This plan saves</div>
                    <b>{moneyShort(savedSel)}</b>
                    <button type="button" className="btn ghost sm" onClick={() => setCalc({ kind: 'plan', plan: selected })}>
                      See calculation
                    </button>
                  </div>
                </div>

                <div className="triage-actions" style={{ gap: 8 }}>
                  <button type="button" className="btn ghost" onClick={simulate}>
                    <Play size={14} /> Simulate
                  </button>
                  <button type="button" className="btn primary" onClick={() => setStep('act')} style={{ flex: 1 }}>
                    Act <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {step === 'act' && (
              <div className="avon-status">
                <div className="triage-plans-head">
                  <h2 className="triage-title" style={{ fontSize: 22, textAlign: 'center' }}>Plan of action</h2>
                  <p className="triage-plans-sub">{selected.label} · {fmt.money(selected.cost)}</p>
                </div>

                <div className="avon-act-hero">
                  <img src={mapArt.tank} alt="" width={48} height={34} />
                  <div>
                    <strong>{stationName}</strong>
                    <span>Saves {moneyShort(savedSel)} vs doing nothing · peak {selected.peakPct.toFixed(0)}%</span>
                  </div>
                </div>

                <ol className="avon-act-steps">
                  {actionSteps.map((line, i) => (
                    <li key={line}>
                      <span>{i + 1}</span>
                      <p>{line}</p>
                    </li>
                  ))}
                </ol>

                <div className="avon-status__chip is-mint">
                  Cost {fmt.money(selected.cost)}
                  {selected.truckCost > 0 ? ` · trucks ${fmt.money(selected.truckCost)}` : ''}
                  {selected.shutInCost > 0 ? ` · shut-ins ${fmt.money(selected.shutInCost)}` : ''}
                </div>

                <div className="triage-actions" style={{ gap: 8 }}>
                  <button type="button" className="btn ghost" onClick={simulate}>
                    <Play size={14} /> Simulate first
                  </button>
                  <button type="button" className="btn primary" onClick={commit} style={{ flex: 1 }}>
                    <Send size={14} /> Put into action
                  </button>
                </div>
              </div>
            )}
      </AvonCardShell>

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
    </>
  );
}

function hoursWords(h: number): string {
  if (!isFinite(h) || h < 0) return '—';
  const totalMin = Math.round(h * 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs <= 0) return `${mins} minute${mins === 1 ? '' : 's'}`;
  if (mins === 0) return `${hrs} hour${hrs === 1 ? '' : 's'}`;
  return `${hrs} hour${hrs === 1 ? '' : 's'} ${mins} minute${mins === 1 ? '' : 's'}`;
}

function moneyShort(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `$${k >= 10 ? Math.round(k) : +k.toFixed(1)}k`;
  }
  return fmt.money(v);
}

function buildActionSteps(
  plan: PlanOption,
  responseMin: number,
  repairH: number,
  facilityName: string,
): string[] {
  const steps: string[] = [];
  if (plan.trucks <= 0 && plan.shutIns.length === 0) {
    steps.push(`Hold production as-is at ${facilityName} — accept shut-in risk if the tank hits 92%.`);
    steps.push(`Monitor tank level until pump repair (~${repairH}h).`);
    steps.push('No truck dispatch. Re-open wells after repair clears.');
    return steps;
  }
  if (plan.trucks > 0) {
    const eta = fmt.dur(responseMin / 60);
    steps.push(
      `Dispatch ${plan.trucks} water truck${plan.trucks > 1 ? 's' : ''} to ${facilityName} (arrive ~${eta}, ${plan.trips} trip${plan.trips === 1 ? '' : 's'}).`,
    );
  }
  if (plan.shutIns.length > 0) {
    const wells = plan.shutIns
      .map((s) => `${fmt.short(s.well)} at +${fmt.dur(s.startMin / 60)}`)
      .join(', ');
    steps.push(`Shut in early: ${wells}.`);
  } else {
    steps.push('Keep wells online — trucks keep the tank under 92%.');
  }
  steps.push(`Hold the plan through repair (~${repairH}h), then resume normal pump-out.`);
  steps.push(`Expected cost ${fmt.money(plan.cost)} · peak tank ~${plan.peakPct.toFixed(0)}%.`);
  return steps;
}
