import type { Dataset, FailureContext, PlanOption } from './types';
import { hoursToLimit } from './model';
import { traceFor } from './planner';
import type { LiveFacility } from './status';

/** A plan the operator committed — failures stay from telemetry; stats follow this sim. */
export interface DispatchedPlan {
  eventId: string;
  facilityId: string;
  label: string;
  plan: PlanOption;
  /** "now" when Dispatch was clicked */
  commitUnix: number;
  /** tank % / volume / wells frozen at commit (plan start) */
  levelPct0: number;
  volumeBbl0: number;
  producingWells: string[];
  horizonMin: number;
  /** minute-by-minute tank % from commit → repair */
  levelTracePct: number[];
}

export function buildDispatchedPlan(
  ctx: FailureContext,
  ds: Dataset,
  plan: PlanOption,
  commitUnix: number,
): DispatchedPlan {
  const tr = traceFor(ctx, ds, plan);
  return {
    eventId: ctx.event.id,
    facilityId: ctx.facility.id,
    label: plan.label,
    plan,
    commitUnix,
    levelPct0: ctx.levelPct,
    volumeBbl0: ctx.volumeBbl,
    producingWells: [...ctx.producingWells],
    horizonMin: ctx.horizonMin,
    levelTracePct: Array.from(tr),
  };
}

export function minutesIntoPlan(d: DispatchedPlan, now: number): number {
  if (now < d.commitUnix) return -1;
  return Math.floor((now - d.commitUnix) / 60);
}

export function planStillActive(d: DispatchedPlan, now: number): boolean {
  const m = minutesIntoPlan(d, now);
  return m >= 0 && m <= d.horizonMin;
}

/** Overlay plan physics onto live facility readings. Pump fault / event status stay from telemetry. */
export function applyDispatchOverlay(
  live: LiveFacility,
  d: DispatchedPlan,
  now: number,
  ds: Dataset,
): LiveFacility {
  if (d.facilityId !== live.f.id || !planStillActive(d, now)) return live;
  const m = Math.min(minutesIntoPlan(d, now), d.levelTracePct.length - 1);
  if (m < 0) return live;

  const level = d.levelTracePct[m] ?? live.level;
  const shut = new Set<string>();
  for (const s of d.plan.shutIns) {
    if (s.startMin <= m) shut.add(s.well);
  }
  if (d.plan.tripAt != null && m >= d.plan.tripAt) {
    for (const id of d.producingWells) shut.add(id);
  }

  const wells = live.f.wells.map((w) => {
    const wasProducing = d.producingWells.includes(w.id);
    const closed = shut.has(w.id);
    const on = wasProducing && !closed;
    return {
      id: w.id,
      status: on ? 1 : 0,
      water: on ? w.baseline_water_bpd : 0,
    };
  });
  const inflow = wells.reduce((a, w) => a + (w.status === 1 ? w.water : 0), 0);
  const limit = ds.network.defaults.tank_limits_pct.shutdown;
  const remainingMin = Math.max(0, d.horizonMin - m);
  const htl = hoursToLimit(level, live.f.tank.capacity_bbl, inflow, limit);

  return {
    ...live,
    level,
    inflow,
    wells,
    // pump stays faulted while failure ongoing — don't invent flow
    pumpFlow: 0,
    recv: 0,
    planOverlay: {
      label: d.label,
      commitUnix: d.commitUnix,
      minute: m,
      remainingMin,
      hoursToLimit: htl,
      cost: d.plan.cost,
      peakPct: d.plan.peakPct,
      trucks: d.plan.trucks,
      trips: d.plan.trips,
    },
  };
}

/** Find dispatch for a facility (by facility id). */
export function dispatchForFacility(
  dispatched: Record<string, DispatchedPlan>,
  facilityId: string,
): DispatchedPlan | undefined {
  return Object.values(dispatched).find((d) => d.facilityId === facilityId);
}
