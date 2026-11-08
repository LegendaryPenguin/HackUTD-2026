import type { Dataset, FailureContext, PlanOption } from './types';
import { wellRevPerHour } from './model';

export type SideImpact = {
  cost: number;
  /** $/h still earning at plan start (before voluntary shut-ins fire). */
  revPerHour: number;
  /** Oil barrels lost over the repair horizon. */
  oilLostBbl: number;
  /** Gas mcf lost over the repair horizon. */
  gasLostMcf: number;
  /** Water still entering tank at t=0 under this plan (bpd). */
  inflowBpd: number;
  peakPct: number;
  tripAtMin: number | null;
  wellsOnlineStart: number;
  wellsForcedOff: number;
};

export type PlanImpact = {
  before: SideImpact; // do nothing
  after: SideImpact;  // selected plan
  savings: number;
  oilSavedBbl: number;
  gasSavedMcf: number;
  oilBpdAtRisk: number;
  revPerHourAtRisk: number;
};

function doNothingPlan(ctx: FailureContext): PlanOption {
  const tripAt = isFinite(ctx.hoursToLimit) ? Math.round(ctx.hoursToLimit * 60) : null;
  return {
    label: 'Do nothing',
    cost: ctx.doNothingCost,
    truckCost: 0,
    shutInCost: ctx.doNothingCost,
    trucks: 0,
    trips: 0,
    shutIns: [],
    peakPct: tripAt != null ? 92 : ctx.levelPct,
    tripAt,
    recommended: false,
  };
}

function lostOverHorizon(ctx: FailureContext, plan: PlanOption) {
  const wells = ctx.facility.wells.filter((w) => ctx.producingWells.includes(w.id));
  const shutAt = new Map(plan.shutIns.map((s) => [s.well, s.startMin]));
  let oil = 0;
  let gas = 0;
  const H = Math.max(0, ctx.horizonMin);
  for (let t = 0; t < H; t++) {
    const tripped = plan.tripAt != null && t >= plan.tripAt;
    for (const w of wells) {
      const s = shutAt.get(w.id);
      const off = tripped || (s != null && t >= s);
      if (!off) continue;
      oil += w.oil_bpd / (24 * 60);
      gas += w.gas_mcfd / (24 * 60);
    }
  }
  return { oil, gas };
}

function sideImpact(ctx: FailureContext, ds: Dataset, plan: PlanOption, cost: number): SideImpact {
  const wells = ctx.facility.wells.filter((w) => ctx.producingWells.includes(w.id));
  const earlyShut = new Set(plan.shutIns.filter((s) => s.startMin <= 0).map((s) => s.well));
  const online = wells.filter((w) => !earlyShut.has(w.id));
  const lost = lostOverHorizon(ctx, plan);
  const forced = plan.tripAt != null
    ? wells.length
    : plan.shutIns.length;
  return {
    cost,
    revPerHour: online.reduce((a, w) => a + wellRevPerHour(w, ds.ops), 0),
    oilLostBbl: lost.oil,
    gasLostMcf: lost.gas,
    inflowBpd: online.reduce((a, w) => a + w.baseline_water_bpd, 0),
    peakPct: plan.peakPct,
    tripAtMin: plan.tripAt,
    wellsOnlineStart: online.length,
    wellsForcedOff: forced,
  };
}

/** Before (do nothing) vs after (selected plan) impact for the repair horizon. */
export function planImpact(ctx: FailureContext, ds: Dataset, plan: PlanOption): PlanImpact {
  const nothing = doNothingPlan(ctx);
  const before = sideImpact(ctx, ds, nothing, ctx.doNothingCost);
  const after = sideImpact(ctx, ds, plan, plan.cost);
  const oilBpdAtRisk = ctx.facility.wells
    .filter((w) => ctx.producingWells.includes(w.id))
    .reduce((a, w) => a + w.oil_bpd, 0);
  return {
    before,
    after,
    savings: Math.max(0, ctx.doNothingCost - plan.cost),
    oilSavedBbl: Math.max(0, before.oilLostBbl - after.oilLostBbl),
    gasSavedMcf: Math.max(0, before.gasLostMcf - after.gasLostMcf),
    oilBpdAtRisk,
    revPerHourAtRisk: ctx.revPerHour,
  };
}
