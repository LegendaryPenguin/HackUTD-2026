import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Play, Send, X } from 'lucide-react';
import { useStore } from '../state/store';
import { fmt } from '../lib/model';
import { systemThreadArt } from './MapMarkers';
import { PlanTraceChart } from './PlanTraceChart';
import { calcBreakdown } from '../lib/financials';
import { representativePlans } from '../lib/scenarios';
import type { LiveFacility } from '../lib/status';
import type { PlanOption } from '../lib/types';
import ReflectiveCard from './ReflectiveCard';

/** Fixed ReflectiveCard footprint — Identify / Decide / Act share one size. */
const CARD_W = 460;
const CARD_H = 620;

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
export function FacilityTriageCard({ live, onClose }: { live: LiveFacility; onClose: () => void }) {
  const { dataset, analysis, dispatch, startSimulate } = useStore();
  const [step, setStep] = useState<Step>('identify');
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
  const selected = options.find((o) => o.label === (selectedLabel ?? rec?.label)) ?? rec ?? options[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (rec?.label) setSelectedLabel(rec.label);
  }, [rec?.label]);

  if (!dataset || !analysis || !fail || !selected) return null;

  const onsetLabel = fmt.time(fail.event.onset);
  const leftLabel = isFinite(fail.hoursToLimit) ? fmt.dur(fail.hoursToLimit) : '—';
  const leftWords = isFinite(fail.hoursToLimit) ? hoursWords(fail.hoursToLimit) : '—';
  const savedRec = Math.max(0, fail.doNothingCost - (rec?.cost ?? 0));
  const savedSel = Math.max(0, fail.doNothingCost - selected.cost);
  const repairH = dataset.ops.expected_repair_hours.pump_failure;
  const stationName = `${live.f.system} station`;
  const truckBlurb = rec
    ? (rec.trucks > 0
      ? `${rec.trucks} truck${rec.trucks > 1 ? 's' : ''} · about ${fmt.money(rec.truckCost)} · tank stays under 92%.`
      : `${rec.label} · tank stays under 92%.`)
    : '';

  const actionSteps = buildActionSteps(selected, fail.facility.response_min, repairH, stationName);
  const confidence = fail.event.confidence;
  const confPct = Math.round(confidence * 100);
  const confTone = confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'mid' : 'low';
  const systemArt = systemThreadArt(live.f.system);

  const simulate = () => {
    startSimulate(fail.event.id, selected);
    onClose();
  };
  const commit = () => {
    dispatch(fail.event.id, selected);
    onClose();
  };

  return (
    <div className="triage-scrim" onClick={onClose} role="presentation">
      <motion.div
        className="triage-card triage-card--reflective"
        role="dialog"
        aria-modal
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <ReflectiveCard
          theme="dark"
          tint="#9ae4ef"
          metalness={0.88}
          roughness={0.4}
          blurStrength={6}
          grayscale={0.9}
          warp={0.45}
          shine={0.95}
          glare={0.45}
          bevel={3}
          enableTilt
          tiltStrength={8}
          intro
          webcam={false}
          width={CARD_W}
          height={CARD_H}
          radius={20}
          className="night-reflective"
        >
          <div className="rc-flow">
            <div className="rc-flow__top">
              {step !== 'identify' ? (
                <button
                  type="button"
                  className="rc-flow__back"
                  onClick={() => setStep(step === 'act' ? 'decide' : 'identify')}
                >
                  <ArrowLeft size={14} /> Back
                </button>
              ) : <span />}
              <div className="rc-steps" aria-label="Triage steps">
                {STEPS.map((s) => (
                  <span key={s} className={`rc-steps__item ${s === step ? 'is-active' : ''}`}>
                    {STEP_LABEL[s]}
                  </span>
                ))}
              </div>
              <button type="button" className="rc-flow__close" onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {step === 'identify' && (
              <div className="rc-triage">
                <div className="rc-triage__head">
                  <div className="rc-triage__icon">
                    <img src={systemArt} alt="" width={56} height={40} />
                  </div>
                  <div className="rc-triage__head-copy">
                    <div className="rc-triage__title-row">
                      <h2 className="rc-triage__title">{stationName}</h2>
                      <span className="chip coral">Pump stopped</span>
                    </div>
                    <p className="rc-triage__body">
                      The pump that empties this tank has stopped. Water from the wells is still filling the tank.
                    </p>
                  </div>
                </div>

                <div className="rc-triage__facts rc-triage__facts--3">
                  <div className="rc-triage__fact-col">
                    <b>Where</b>
                    <span>{stationName}</span>
                  </div>
                  <div className="rc-triage__fact-col">
                    <b>What broke</b>
                    <span>The pump (not the pipeline). Fault since {onsetLabel}.</span>
                  </div>
                  <div className="rc-triage__fact-col">
                    <b>Why it matters</b>
                    <span>If the tank hits 92% full, every well here is forced off until the pump is fixed (~{repairH} hours).</span>
                  </div>
                </div>

                <div className="rc-triage__pulse">
                  <strong>{leftWords} left until the tank hits 92%.</strong>
                  <span>
                    Tank is {fail.levelPct.toFixed(0)}% full now · filling from {fail.producingWells.length} wells · {fmt.num(fail.inflowBpd)} bpd.
                  </span>
                </div>

                {rec && (
                  <div className="rc-triage__chart">
                    <PlanTraceChart ctx={fail} ds={dataset} plan={rec} height={112} compact />
                  </div>
                )}

                <div className="rc-triage__impact rc-triage__impact--row">
                  <div className="rc-triage__chip coral">
                    <div className="rc-triage__chip-kicker">Doing nothing</div>
                    <div className="rc-triage__chip-value">~{fmt.money(fail.doNothingCost)} lost</div>
                    <div className="rc-triage__chip-sub">Wells forced off in {leftLabel} · production stops until repair.</div>
                  </div>
                  {rec && (
                    <div className="rc-triage__chip mint">
                      <div className="rc-triage__chip-kicker">With recommended plan</div>
                      <div className="rc-triage__chip-value mint">Saves ~{fmt.money(savedRec)}</div>
                      <div className="rc-triage__chip-sub">{truckBlurb}</div>
                    </div>
                  )}
                </div>

                <button type="button" className="rc-triage__cta" onClick={() => setStep('decide')}>
                  Next: Decide <ArrowRight size={16} />
                </button>
              </div>
            )}

            {step === 'decide' && (
              <div className="rc-decide">
                <div>
                  <h2 className="rc-plans__title">Choose a plan</h2>
                  <p className="rc-plans__sub">{stationName} · pick one path, then Act</p>
                </div>

                <div className="rc-decide__choices">
                  {options.map((o) => {
                    const isSel = o.label === selected.label;
                    const isRec = !!o.recommended || o.label === rec?.label;
                    return (
                      <button
                        key={o.label}
                        type="button"
                        className={`rc-choice ${isSel ? 'is-selected' : ''} ${isRec ? 'is-rec' : ''}`}
                        onClick={() => setSelectedLabel(o.label)}
                      >
                        {isRec && <span className="rc-choice__tag">Recommended</span>}
                        <span className="rc-choice__label">{o.label}</span>
                        <span className="rc-choice__cost">{fmt.money(o.cost)}</span>
                      </button>
                    );
                  })}
                </div>

                <div className={`rc-confidence rc-confidence--${confTone}`}>
                  <div className="rc-confidence__ring" style={{ ['--conf' as string]: confPct }}>
                    <strong>{confPct}%</strong>
                    <span>confidence</span>
                  </div>
                  <div className="rc-confidence__copy">
                    <b>Signal confidence</b>
                    <p>
                      {confPct >= 85
                        ? 'Readings strongly match a stopped pump — safe to commit a plan.'
                        : confPct >= 60
                          ? 'Likely a pump stop. Simulate if you want a second look before acting.'
                          : 'Weaker signal — verify on the map or simulate before you act.'}
                    </p>
                    <div className="rc-confidence__bars" aria-hidden>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <i key={i} className={confidence >= (i + 1) / 5 - 0.05 ? 'on' : ''} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rc-triage__impact rc-triage__impact--row">
                  <div className="rc-triage__chip coral">
                    <div className="rc-triage__chip-kicker">Doing nothing</div>
                    <div className="rc-triage__chip-value">~{fmt.money(fail.doNothingCost)}</div>
                    <button type="button" className="rc-link" onClick={() => setCalc({ kind: 'nothing', plan: selected })}>
                      See calculation
                    </button>
                  </div>
                  <div className="rc-triage__chip mint">
                    <div className="rc-triage__chip-kicker">This plan saves</div>
                    <div className="rc-triage__chip-value mint">{moneyShort(savedSel)}</div>
                    <button type="button" className="rc-link" onClick={() => setCalc({ kind: 'plan', plan: selected })}>
                      See calculation
                    </button>
                  </div>
                </div>

                <div className="rc-plan__actions rc-decide__actions">
                  <button type="button" className="sim" onClick={simulate}>
                    <Play size={14} /> Simulate
                  </button>
                  <button type="button" className="act" onClick={() => setStep('act')}>
                    Act <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {step === 'act' && (
              <div className="rc-act">
                <div>
                  <h2 className="rc-plans__title">Plan of action</h2>
                  <p className="rc-plans__sub">{selected.label} · {fmt.money(selected.cost)}</p>
                </div>

                <div className="rc-act__hero">
                  <img src={systemArt} alt="" width={48} height={34} />
                  <div>
                    <strong>{stationName}</strong>
                    <span>Saves {moneyShort(savedSel)} vs doing nothing · peak {selected.peakPct.toFixed(0)}%</span>
                  </div>
                </div>

                <ol className="rc-act__steps">
                  {actionSteps.map((line, i) => (
                    <li key={line}>
                      <span className="rc-act__num">{i + 1}</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>

                <div className="rc-triage__chip mint" style={{ margin: 0 }}>
                  Cost {fmt.money(selected.cost)}
                  {selected.truckCost > 0 ? ` · trucks ${fmt.money(selected.truckCost)}` : ''}
                  {selected.shutInCost > 0 ? ` · shut-ins ${fmt.money(selected.shutInCost)}` : ''}
                </div>

                <div className="rc-plan__actions rc-decide__actions">
                  <button type="button" className="sim" onClick={simulate}>
                    <Play size={14} /> Simulate first
                  </button>
                  <button type="button" className="act primary" onClick={commit}>
                    <Send size={14} /> Put into action
                  </button>
                </div>
              </div>
            )}
          </div>
        </ReflectiveCard>

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
