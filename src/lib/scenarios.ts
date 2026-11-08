/**
 * Scenario comparison layer on top of the planner.
 *
 * Core idea the UI must make obvious:
 *   "Regular rate" = facility keeps earning revPerHour if wells stay on.
 *   Every plan's true cost = money you DON'T earn (shut-ins) + truck fees.
 *   That is exactly the loss vs. a night where the pump never failed.
 */
import type { Dataset, FailureContext, PlanOption, ShutIn } from './types';
import { fmt, wellRevPerHour } from './model';
import { failureContext, planOptions, planSystem, simulate, truckArrivals, traceFor } from './planner';
import type { DetectedEvent } from './types';

export type TimelineKind =
  | 'now'
  | 'truck'
  | 'shut_in'
  | 'would_trip'
  | 'trip'
  | 'repair'
  | 'truck_free';

export interface TimelineMark {
  kind: TimelineKind;
  /** minutes from plan start ("now") */
  atMin: number;
  unix: number;
  label: string;
  detail?: string;
}

export interface ScenarioCompare {
  id: string;
  label: string;
  family: 'do_nothing' | 'trucks_only' | 'shut_in_only' | 'mixed' | 'wait_safe';
  /** absolute $ paid/lost vs regular production over the repair window */
  cost: number;
  truckCost: number;
  /** lost well revenue (voluntary + auto trip) */
  lostProduction: number;
  /** what the facility WOULD have earned over the horizon if wells stayed on */
  baselineRevenue: number;
  /** fraction of baseline still earned: (baseline - lostProduction) / baseline */
  productionKeptPct: number;
  /** doNothing.cost - this.cost (positive = this plan is better) */
  savingsVsDoNothing: number;
  trucks: number;
  trips: number;
  shutIns: ShutIn[];
  tripAt: number | null;
  peakPct: number;
  preventsTrip: boolean;
  recommended?: boolean;
  timeline: TimelineMark[];
  /** tank % every minute, length H+1 */
  levelTracePct: Float32Array;
}

export interface CaseSweep {
  eventId: string;
  facility: string;
  system: string;
  asset: string;
  nowUnix: number;
  onsetUnix: number;
  repairUnix: number;
  levelPct: number;
  inflowBpd: number;
  fillBblPerHour: number;
  capacityBbl: number;
  revPerHour: number;
  hoursToLimit: number;
  tripsAtUnix: number | null;
  horizonMin: number;
  /** regular-rate money over the remaining repair window */
  baselineRevenue: number;
  doNothingCost: number;
  recommended: ScenarioCompare;
  scenarios: ScenarioCompare[];
  /** quick taxonomy counts */
  counts: {
    total: number;
    preventsTrip: number;
    doNothing: number;
    trucksOnly: number;
    shutInOnly: number;
    mixed: number;
    waitSafe: number;
  };
}

export function familyOf(o: PlanOption): ScenarioCompare['family'] {
  if (o.trucks === 0 && o.shutIns.length === 0) {
    return o.tripAt == null ? 'wait_safe' : 'do_nothing';
  }
  if (o.trucks > 0 && o.shutIns.length === 0) return 'trucks_only';
  if (o.trucks === 0 && o.shutIns.length > 0) return 'shut_in_only';
  return 'mixed';
}

const FAMILY_ORDER: ScenarioCompare['family'][] = [
  'trucks_only',
  'shut_in_only',
  'mixed',
  'wait_safe',
  'do_nothing',
];

/** One cheapest valid plan per family — what the triage card should show. */
export function representativePlans(options: PlanOption[]): PlanOption[] {
  const best = new Map<ScenarioCompare['family'], PlanOption>();
  for (const o of options) {
    const fam = familyOf(o);
    const prev = best.get(fam);
    if (!prev || o.cost < prev.cost - 1e-6) best.set(fam, o);
  }
  const rec = options.find((o) => o.recommended) ?? [...options].sort((a, b) => a.cost - b.cost)[0];
  const recFam = rec ? familyOf(rec) : null;
  const out: PlanOption[] = [];
  for (const fam of FAMILY_ORDER) {
    const o = best.get(fam);
    if (!o) continue;
    // Prefer the system-recommended option inside its family when it wins.
    const pick = rec && recFam === fam ? rec : o;
    out.push({
      ...pick,
      label: friendlyPlanLabel(pick),
      recommended: recFam === fam,
    });
  }
  if (!out.some((o) => o.recommended) && out.length) out[0].recommended = true;
  return out;
}

export function friendlyPlanLabel(o: PlanOption): string {
  const fam = familyOf(o);
  if (fam === 'do_nothing' || fam === 'wait_safe') return 'Do nothing';
  if (fam === 'trucks_only') {
    if (o.trucks === 1 && o.trips === 1) return 'Send 1 water truck';
    return `Send ${o.trucks} truck${o.trucks > 1 ? 's' : ''} × ${o.trips} trip${o.trips > 1 ? 's' : ''}`;
  }
  if (fam === 'shut_in_only') {
    const names = o.shutIns.map((s) => s.well.replace(/^S\d+_WELL_/, '')).join(', ');
    return o.shutIns.length === 1 ? `Shut well ${names} early` : `Shut wells ${names} early`;
  }
  const truck = o.trucks ? `${o.trucks}×${o.trips} truck` : '';
  const names = o.shutIns.map((s) => s.well.replace(/^S\d+_WELL_/, '')).join(', ');
  return [truck, names ? `shut ${names}` : ''].filter(Boolean).join(' + ') || o.label;
}

function buildTimeline(ctx: FailureContext, ds: Dataset, opt: PlanOption, now: number): TimelineMark[] {
  const f = ctx.facility;
  const H = ctx.horizonMin;
  const marks: TimelineMark[] = [];
  const push = (kind: TimelineKind, atMin: number, label: string, detail?: string) => {
    if (atMin < 0 || atMin > H + 1) return;
    marks.push({ kind, atMin, unix: now + atMin * 60, label, detail });
  };

  push('now', 0, 'Now', `tank ${ctx.levelPct.toFixed(1)}% · filling ${fmt.num(ctx.inflowBpd / 24, 1)} bbl/h`);

  const arrivals = truckArrivals(opt.trucks, opt.trips, f.response_min, f.cycle_min);
  arrivals.forEach((m, i) => {
    if (m < H) push('truck', m, `Truck arrives (−${ds.ops.emergency_trucking.truck_capacity_bbl} bbl)`, `arrival ${i + 1}/${arrivals.length}`);
  });
  if (opt.trucks > 0 && opt.trips > 0) {
    const free = f.response_min + opt.trips * f.cycle_min;
    if (free <= H) push('truck_free', free, 'Truck free again', 'back at yard for another job');
  }

  for (const s of opt.shutIns) {
    const short = s.well.replace(/^S\d+_WELL_/, '');
    const w = f.wells.find((x) => x.id === s.well);
    const rev = w ? wellRevPerHour(w, ds.ops) : 0;
    push('shut_in', s.startMin, `Shut in well ${short}`, `stops ${w?.baseline_water_bpd ?? '?'} bpd · loses ${fmt.money(rev)}/h`);
  }

  if (isFinite(ctx.hoursToLimit) && ctx.hoursToLimit > 0 && ctx.hoursToLimit * 60 <= H) {
    push('would_trip', Math.round(ctx.hoursToLimit * 60), 'Would hit 92% if nothing done', 'auto shut-in of all wells');
  }
  if (opt.tripAt != null) {
    push('trip', opt.tripAt, 'Tank hits 92% under this plan', 'forced shut-in starts');
  }
  push('repair', H, 'Pump repaired', 'wells can resume normal rate');

  marks.sort((a, b) => a.atMin - b.atMin || a.kind.localeCompare(b.kind));
  return marks;
}

export function enrichOption(ctx: FailureContext, ds: Dataset, opt: PlanOption, now: number): ScenarioCompare {
  const baselineRevenue = ctx.revPerHour * (ctx.horizonMin / 60);
  const lostProduction = opt.shutInCost;
  const productionKeptPct = baselineRevenue > 0 ? Math.max(0, (baselineRevenue - lostProduction) / baselineRevenue) : 1;
  return {
    id: `${opt.trucks}t${opt.trips}x-${opt.shutIns.map((s) => `${s.well}@${s.startMin}`).join('_') || 'none'}`,
    label: opt.label,
    family: familyOf(opt),
    cost: opt.cost,
    truckCost: opt.truckCost,
    lostProduction,
    baselineRevenue,
    productionKeptPct,
    savingsVsDoNothing: ctx.doNothingCost - opt.cost,
    trucks: opt.trucks,
    trips: opt.trips,
    shutIns: opt.shutIns,
    tripAt: opt.tripAt,
    peakPct: opt.peakPct,
    preventsTrip: opt.tripAt == null,
    recommended: opt.recommended,
    timeline: buildTimeline(ctx, ds, opt, now),
    levelTracePct: traceFor(ctx, ds, opt),
  };
}

/**
 * Full single-facility sweep: every truck×trip×well-subset the planner knows,
 * enriched with baseline-relative money + timeline marks.
 * Pass trucksAvail = fleet size to see the unrestricted menu; or less when trucks are shared.
 */
export function sweepCase(ctx: FailureContext, ds: Dataset, now: number, trucksAvail?: number): CaseSweep {
  const fleet = trucksAvail ?? ds.ops.systems[ctx.facility.system]?.emergency_fleet_size ?? 0;
  const raw = planOptions(ctx, ds, fleet, 3);
  const scenarios = raw.map((o) => enrichOption(ctx, ds, o, now));
  const recommended = scenarios.find((s) => s.recommended) ?? scenarios[0];
  const counts = {
    total: scenarios.length,
    preventsTrip: scenarios.filter((s) => s.preventsTrip).length,
    doNothing: scenarios.filter((s) => s.family === 'do_nothing').length,
    trucksOnly: scenarios.filter((s) => s.family === 'trucks_only').length,
    shutInOnly: scenarios.filter((s) => s.family === 'shut_in_only').length,
    mixed: scenarios.filter((s) => s.family === 'mixed').length,
    waitSafe: scenarios.filter((s) => s.family === 'wait_safe').length,
  };
  return {
    eventId: ctx.event.id,
    facility: ctx.facility.id,
    system: ctx.facility.system,
    asset: ctx.event.asset,
    nowUnix: now,
    onsetUnix: ctx.event.onset,
    repairUnix: ctx.event.onset + ds.ops.expected_repair_hours.pump_failure * 3600,
    levelPct: ctx.levelPct,
    inflowBpd: ctx.inflowBpd,
    fillBblPerHour: ctx.inflowBpd / 24,
    capacityBbl: ctx.facility.tank.capacity_bbl,
    revPerHour: ctx.revPerHour,
    hoursToLimit: ctx.hoursToLimit,
    tripsAtUnix: ctx.tripsAtUnix,
    horizonMin: ctx.horizonMin,
    baselineRevenue: ctx.revPerHour * (ctx.horizonMin / 60),
    doNothingCost: ctx.doNothingCost,
    recommended,
    scenarios,
    counts,
  };
}

/** Compact JSON (drops Float32 traces — keep timeline + money). */
export function caseSweepJson(c: CaseSweep) {
  return {
    ...c,
    recommended: stripTrace(c.recommended),
    scenarios: c.scenarios.map(stripTrace),
  };
}

function stripTrace(s: ScenarioCompare) {
  const { levelTracePct: _, ...rest } = s;
  return rest;
}

/**
 * For every pump_failure event: plan at onset+5min (same as answer-key convention),
 * plus optional joint plan when other failures overlap in the same system.
 */
export function sweepAllFailures(ds: Dataset, events: DetectedEvent[], padSec = 300) {
  const failures = events.filter((e) => e.category === 'pump_failure');
  const singles = failures.map((e) => {
    const now = e.onset + padSec;
    const ctx = failureContext(e, ds, now);
    return sweepCase(ctx, ds, now);
  });

  // joint windows: group failures whose [onset, onset+repair] overlap, same system
  const repairH = ds.ops.expected_repair_hours.pump_failure;
  const joints: { system: string; atUnix: number; eventIds: string[]; totalCost: number; allocation: Record<string, number>; plans: Record<string, string> }[] = [];
  const bySys = new Map<string, DetectedEvent[]>();
  for (const e of failures) {
    (bySys.get(e.system) ?? bySys.set(e.system, []).get(e.system)!).push(e);
  }
  for (const [system, list] of bySys) {
    const sorted = [...list].sort((a, b) => a.onset - b.onset);
    for (let i = 0; i < sorted.length; i++) {
      const anchor = sorted[i];
      const now = anchor.onset + padSec;
      const active = sorted.filter((e) => e.onset <= now && e.onset + repairH * 3600 > now);
      if (active.length < 2) continue;
      const ctxs = active.map((e) => failureContext(e, ds, now));
      const sp = planSystem(ctxs, ds);
      joints.push({
        system,
        atUnix: now,
        eventIds: active.map((e) => e.id),
        totalCost: sp.totalCost,
        allocation: sp.allocation,
        plans: Object.fromEntries(Object.entries(sp.plans).map(([id, p]) => [id, p.label])),
      });
    }
  }

  return { singles: singles.map(caseSweepJson), joints };
}

/** Sanity helper: recompute do-nothing loss from regular rate × forced-off hours. */
export function explainRelativeToRegular(ctx: FailureContext): string {
  const hoursOpen = ctx.horizonMin / 60;
  const baseline = ctx.revPerHour * hoursOpen;
  const forcedOff = isFinite(ctx.hoursToLimit) ? Math.max(0, hoursOpen - ctx.hoursToLimit) : 0;
  const loss = ctx.revPerHour * forcedOff;
  return [
    `Regular rate: ${fmt.money(ctx.revPerHour)}/h while wells run.`,
    `Repair window left: ${fmt.dur(hoursOpen)} → baseline earnings if uninterrupted: ${fmt.money(baseline)}.`,
    isFinite(ctx.hoursToLimit)
      ? `Without help, tank hits 92% in ${fmt.dur(ctx.hoursToLimit)}; wells forced off for ${fmt.dur(forcedOff)} → lose ${fmt.money(loss)} vs regular rate.`
      : `Tank never reaches 92% before repair → do-nothing loss is $0 vs regular rate.`,
  ].join(' ');
}

/** Expose simulate for offline scripts that want custom grids. */
export { simulate, truckArrivals };
