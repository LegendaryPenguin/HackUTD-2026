import type { Dataset, DetectedEvent, FailureContext, PlanOption } from './types';
import { facilities, indexAt, wellRevPerHour } from './model';
import type { DispatchedPlan } from './dispatch';
import { applyDispatchOverlay, dispatchForFacility, minutesIntoPlan, planStillActive } from './dispatch';
import { liveFacility } from './status';
import { simulate, truckArrivals } from './planner';

export interface FieldFinancials {
  oilBpd: number;
  gasMcfd: number;
  waterBpd: number;
  ratePerHour: number;
  /** Revenue earned week-start → now, minus truck fees already incurred under live plans. */
  cumulativeProfit: number;
  activePlans: number;
}

/** Snapshot of production at `now`, applying committed plan overlays. */
export function fieldFinancialsAt(
  ds: Dataset,
  now: number,
  ongoing: DetectedEvent[],
  dispatched: Record<string, DispatchedPlan>,
): FieldFinancials {
  const facs = facilities(ds.network, ds.ops);
  let oilBpd = 0;
  let gasMcfd = 0;
  let waterBpd = 0;
  let ratePerHour = 0;
  let activePlans = 0;

  for (const f of facs) {
    let live = liveFacility(ds, f, now, ongoing);
    const d = dispatchForFacility(dispatched, f.id);
    if (d && planStillActive(d, now)) {
      live = applyDispatchOverlay(live, d, now, ds);
      activePlans++;
    }
    for (const w of f.wells) {
      const row = live.wells.find((x) => x.id === w.id);
      const on = (row?.status ?? 1) === 1;
      if (!on) continue;
      oilBpd += w.oil_bpd;
      gasMcfd += w.gas_mcfd;
      waterBpd += w.baseline_water_bpd;
      ratePerHour += wellRevPerHour(w, ds.ops);
    }
  }

  return {
    oilBpd,
    gasMcfd,
    waterBpd,
    ratePerHour,
    cumulativeProfit: cumulativeProfitTo(ds, now, dispatched),
    activePlans,
  };
}

/** Integrate well revenue from telemetry start → `now`, overlaying dispatched shut-ins; subtract truck fees due by `now`. */
export function cumulativeProfitTo(
  ds: Dataset,
  now: number,
  dispatched: Record<string, DispatchedPlan>,
): number {
  const t = ds.telemetry;
  const iEnd = indexAt(t, now);
  if (iEnd < 0) return 0;

  const facs = facilities(ds.network, ds.ops);
  const byFac = new Map(facs.map((f) => [f.id, dispatchForFacility(dispatched, f.id)]));
  let earned = 0;

  for (const f of facs) {
    const d = byFac.get(f.id) ?? null;
    for (const w of f.wells) {
      const status = t.series.get(`${w.id}|status`);
      if (!status) continue;
      const revH = wellRevPerHour(w, ds.ops);
      const last = Math.min(iEnd, status.length - 1);
      // Stride long weeks so scrubbing stays smooth (~5‑min telemetry → ~30‑min steps).
      const stride = last > 900 ? 6 : last > 400 ? 3 : 1;
      for (let i = 0; i <= last; ) {
        const tA = t.ts[i];
        const j = i >= last ? last : Math.min(last, i + stride);
        const tB = j < last ? t.ts[j] : Math.max(tA, now);
        const end = Math.min(tB, now);
        const dtH = Math.max(0, end - tA) / 3600;
        if (dtH > 0) {
          let on = status[i] === 1;
          if (d && tA >= d.commitUnix) {
            const m = minutesIntoPlan(d, tA);
            if (m >= 0) {
              const shut = d.plan.shutIns.some((s) => s.well === w.id && s.startMin <= m);
              const trip = d.plan.tripAt != null && m >= d.plan.tripAt;
              const was = d.producingWells.includes(w.id);
              on = was && !shut && !trip;
            }
          }
          if (on) earned += revH * dtH;
        }
        if (i >= last) break;
        i = j > i ? j : i + 1;
      }
    }
  }

  let truckFees = 0;
  for (const d of Object.values(dispatched)) {
    if (now < d.commitUnix) continue;
    const m = minutesIntoPlan(d, now);
    if (m < 0) continue;
    // Fee is owed once the plan is committed (trucks rolled).
    truckFees += d.plan.truckCost;
  }

  return earned - truckFees;
}

/** $ earned from plan start → minute m under a plan (voluntary + auto shut-ins). */
export function earningsThroughMinute(ctx: FailureContext, ds: Dataset, plan: PlanOption, minute: number): number {
  const f = ctx.facility;
  const wells = f.wells
    .filter((w) => ctx.producingWells.includes(w.id))
    .map((w) => ({ id: w.id, water: w.baseline_water_bpd, revH: wellRevPerHour(w, ds.ops) }));
  const H = Math.min(minute, ctx.horizonMin);
  const shutAt = new Map(plan.shutIns.map((s) => [s.well, s.startMin]));
  let earned = 0;
  for (let t = 0; t < H; t++) {
    const tripped = plan.tripAt != null && t >= plan.tripAt;
    for (const w of wells) {
      const s = shutAt.get(w.id);
      const off = tripped || (s != null && t >= s);
      if (!off) earned += w.revH / 60;
    }
  }
  return earned;
}

export function calcBreakdown(
  ctx: FailureContext,
  plan: PlanOption,
) {
  const hoursShut = isFinite(ctx.hoursToLimit)
    ? Math.max(0, ctx.horizonMin / 60 - ctx.hoursToLimit)
    : 0;
  return {
    doNothing: {
      total: ctx.doNothingCost,
      lines: [
        { label: 'Revenue at risk', value: `$${Math.round(ctx.revPerHour).toLocaleString()}/h` },
        { label: 'Hours shut after trip', value: hoursShut.toFixed(2) },
        { label: 'Lost production', value: `$${Math.round(ctx.doNothingCost).toLocaleString()}` },
      ],
    },
    plan: {
      total: plan.cost,
      savings: ctx.doNothingCost - plan.cost,
      lines: [
        { label: 'Truck fees', value: `$${Math.round(plan.truckCost).toLocaleString()} (${plan.trucks}×${plan.trips}×$${dsTruck(ctx)})` },
        { label: 'Shut-in loss', value: `$${Math.round(plan.shutInCost).toLocaleString()}` },
        { label: 'Plan total', value: `$${Math.round(plan.cost).toLocaleString()}` },
        { label: 'vs doing nothing', value: `$${Math.round(ctx.doNothingCost - plan.cost).toLocaleString()}` },
      ],
    },
  };
}

function dsTruck(_ctx: FailureContext): number {
  return 905;
}

/** Verify planner do-nothing cost matches simulate for a failure context. */
export function verifyDoNothing(ctx: FailureContext, ds: Dataset): { ok: boolean; sim: number; reported: number } {
  const f = ctx.facility;
  const wells = f.wells
    .filter((w) => ctx.producingWells.includes(w.id))
    .map((w) => ({ id: w.id, water: w.baseline_water_bpd, revH: wellRevPerHour(w, ds.ops) }));
  const r = simulate(
    ctx.volumeBbl,
    f.tank.capacity_bbl,
    ds.network.defaults.tank_limits_pct.shutdown,
    wells,
    ctx.horizonMin,
    truckArrivals(0, 0, f.response_min, f.cycle_min),
    [],
    ds.ops.emergency_trucking.truck_capacity_bbl,
  );
  const reported = ctx.doNothingCost;
  const sim = r.shutInCost;
  return { ok: Math.abs(sim - reported) < 20, sim, reported };
}
