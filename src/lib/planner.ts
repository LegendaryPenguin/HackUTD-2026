import type { Dataset, DetectedEvent, FacilityCtx, FailureContext, PlanOption, ShutIn, SystemPlan } from './types';
import { facilityMap, facilityRevPerHour, hoursToLimit, indexAt, wellRevPerHour } from './model';

interface WellSim { id: string; water: number; revH: number }

/**
 * Simulate tank volume minute by minute from plan start.
 *  - trucks remove `truckCap` at each arrival (< horizon), never more than is in the tank
 *  - wells shut in at startMin stop contributing
 *  - at V >= limit the tank trips: all wells shut, level holds
 * Returns the voluntary+automatic shut-in cost, the trip minute, the peak %, and a level trace.
 */
export function simulate(
  V0: number,
  cap: number,
  limitPct: number,
  wells: WellSim[],
  H: number,
  arrivals: number[],
  shutIns: ShutIn[],
  truckCap: number,
  trace?: Float32Array,
): { shutInCost: number; tripAt: number | null; peakPct: number } {
  const limit = (limitPct / 100) * cap;
  let V = V0;
  let peak = V0;
  let ai = 0;
  let tripAt: number | null = null;
  const shutAt = new Map<string, number>();
  for (const s of shutIns) shutAt.set(s.well, s.startMin);
  if (trace) trace[0] = V;
  for (let t = 0; t < H; t++) {
    while (ai < arrivals.length && arrivals[ai] <= t) {
      if (arrivals[ai] < H) V = Math.max(0, V - truckCap);
      ai++;
    }
    let inflow = 0;
    for (const w of wells) {
      const s = shutAt.get(w.id);
      if (s == null || s > t) inflow += w.water;
    }
    V += inflow / 1440;
    if (V > peak) peak = V;
    if (V >= limit) {
      tripAt = t + 1;
      V = limit;
      if (trace) for (let k = t + 1; k <= H; k++) trace[k] = V;
      break;
    }
    if (trace) trace[t + 1] = V;
  }
  let cost = 0;
  for (const w of wells) {
    let from = shutAt.get(w.id) ?? null;
    if (tripAt != null) from = from == null ? tripAt : Math.min(from, tripAt);
    if (from != null) cost += (w.revH * (H - from)) / 60;
  }
  return { shutInCost: cost, tripAt, peakPct: (peak / cap) * 100 };
}

export function truckArrivals(nTrucks: number, trips: number, response: number, cycle: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < trips; k++) for (let i = 0; i < nTrucks; i++) out.push(response + k * cycle);
  return out.sort((a, b) => a - b);
}

function latestShutIn(
  V0: number, cap: number, limitPct: number, wells: WellSim[], H: number,
  arrivals: number[], subset: string[], truckCap: number,
): number | null {
  const ok = (s: number) =>
    simulate(V0, cap, limitPct, wells, H, arrivals, subset.map((w) => ({ well: w, startMin: s })), truckCap).tripAt == null;
  if (!ok(0)) return null;
  let lo = 0, hi = H - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ok(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function subsets<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  const n = arr.length;
  for (let m = 1; m < 1 << n; m++) out.push(arr.filter((_, i) => m & (1 << i)));
  return out;
}

export function planOptions(ctx: FailureContext, ds: Dataset, trucksAvail: number, maxTrips = 3): PlanOption[] {
  const { facility: f, volumeBbl: V0, horizonMin: H } = ctx;
  const cap = f.tank.capacity_bbl;
  const limitPct = ds.network.defaults.tank_limits_pct.shutdown;
  const { truck_capacity_bbl: tcap, cost_per_trip: tcost } = ds.ops.emergency_trucking;
  const wells: WellSim[] = f.wells
    .filter((w) => ctx.producingWells.includes(w.id))
    .map((w) => ({ id: w.id, water: w.baseline_water_bpd, revH: wellRevPerHour(w, ds.ops) }));
  const results: PlanOption[] = [];
  if (H <= 0) return results;
  for (let nT = 0; nT <= trucksAvail; nT++) {
    const tripsRange = nT ? Array.from({ length: maxTrips }, (_, i) => i + 1) : [0];
    for (const trips of tripsRange) {
      const arr = truckArrivals(nT, trips, f.response_min, f.cycle_min);
      if (arr.length && arr[arr.length - 1] >= H) continue;
      const truckCost = nT * trips * tcost;
      const base = simulate(V0, cap, limitPct, wells, H, arr, [], tcap);
      results.push({
        cost: truckCost + base.shutInCost, truckCost, shutInCost: base.shutInCost,
        trucks: nT, trips, shutIns: [], tripAt: base.tripAt, peakPct: base.peakPct,
        label: label(nT, trips, [], base.tripAt),
      });
      for (const sub of subsets(wells.map((w) => w.id))) {
        const s = latestShutIn(V0, cap, limitPct, wells, H, arr, sub, tcap);
        if (s == null) continue;
        const shutIns = sub.map((w) => ({ well: w, startMin: s }));
        const r = simulate(V0, cap, limitPct, wells, H, arr, shutIns, tcap);
        results.push({
          cost: truckCost + r.shutInCost, truckCost, shutInCost: r.shutInCost,
          trucks: nT, trips, shutIns, tripAt: r.tripAt, peakPct: r.peakPct,
          label: label(nT, trips, shutIns, r.tripAt),
        });
      }
    }
  }
  results.sort((a, b) => a.cost - b.cost);
  // de-duplicate identical labels (keep cheapest)
  const seen = new Set<string>();
  const out = results.filter((r) => (seen.has(r.label) ? false : (seen.add(r.label), true)));
  if (out.length) out[0].recommended = true;
  return out;
}

function label(nT: number, trips: number, shutIns: ShutIn[], tripAt: number | null): string {
  const parts: string[] = [];
  if (nT) parts.push(`${nT} truck${nT > 1 ? 's' : ''} × ${trips} trip${trips > 1 ? 's' : ''}`);
  if (shutIns.length) {
    const names = shutIns.map((s) => s.well.replace(/^S\d+_WELL_/, '')).join(', ');
    parts.push(`shut in well${shutIns.length > 1 ? 's' : ''} ${names} at +${shutIns[0].startMin} min`);
  }
  if (!parts.length) parts.push(tripAt == null ? 'Do nothing (never trips)' : 'Do nothing (auto shut-in)');
  else if (tripAt != null) parts.push('still trips');
  return parts.join(' + ');
}

/** Build the decision context for an ongoing pump failure at `now`. */
export function failureContext(e: DetectedEvent, ds: Dataset, now: number): FailureContext {
  const fmap = facilityMap(ds.network, ds.ops);
  const f = fmap.get(e.facility) as FacilityCtx;
  const t = ds.telemetry;
  const i = indexAt(t, now);
  const level = t.series.get(`${f.tank.id}|level_pct`)?.[i] ?? 0;
  const producing = f.wells.filter((w) => (t.series.get(`${w.id}|status`)?.[i] ?? 1) === 1).map((w) => w.id);
  const inflow = f.wells.filter((w) => producing.includes(w.id)).reduce((a, w) => a + w.baseline_water_bpd, 0);
  const limit = ds.network.defaults.tank_limits_pct.shutdown;
  const repairEnd = e.onset + ds.ops.expected_repair_hours.pump_failure * 3600;
  const H = Math.max(0, Math.round((repairEnd - now) / 60));
  let htl = level >= limit - 0.05 ? 0 : hoursToLimit(level, f.tank.capacity_bbl, inflow, limit);
  if (level >= limit - 0.05 && producing.length === 0) htl = 0;
  const revH = facilityRevPerHour(f, ds.ops);
  const doNothing = isFinite(htl) ? revH * Math.max(0, H / 60 - htl) : 0;
  return {
    event: e, facility: f, levelPct: level, volumeBbl: (level / 100) * f.tank.capacity_bbl,
    inflowBpd: inflow, producingWells: producing, horizonMin: H, hoursToLimit: htl,
    tripsAtUnix: isFinite(htl) && htl > 0 ? Math.round(now + htl * 3600) : htl === 0 ? now : null,
    revPerHour: revH, doNothingCost: doNothing,
  };
}

/** Joint plan for all ongoing failures in one system (they share the fleet). */
export function planSystem(ctxs: FailureContext[], ds: Dataset): SystemPlan {
  const system = ctxs[0].facility.system;
  const fleet = ds.ops.systems[system]?.emergency_fleet_size ?? 0;
  // per-event option lists for each possible truck count
  const optionsByK: Record<string, PlanOption[][]> = {};
  for (const c of ctxs) {
    optionsByK[c.event.id] = [];
    for (let k = 0; k <= fleet; k++) optionsByK[c.event.id].push(planOptions(c, ds, k));
  }
  let best: { total: number; alloc: number[] } | null = null;
  const n = ctxs.length;
  const alloc = new Array(n).fill(0);
  const rec = (i: number, left: number) => {
    if (i === n) {
      let total = 0;
      for (let j = 0; j < n; j++) {
        const opts = optionsByK[ctxs[j].event.id][alloc[j]];
        total += opts.length ? opts[0].cost : ctxs[j].doNothingCost;
      }
      if (!best || total < best.total - 1e-6) best = { total, alloc: [...alloc] };
      return;
    }
    for (let k = 0; k <= left; k++) {
      alloc[i] = k;
      rec(i + 1, left - k);
    }
  };
  rec(0, fleet);
  const b = best as { total: number; alloc: number[] } | null;
  const plans: Record<string, PlanOption> = {};
  const options: Record<string, PlanOption[]> = {};
  const allocation: Record<string, number> = {};
  ctxs.forEach((c, j) => {
    const k = b ? b.alloc[j] : 0;
    const opts = optionsByK[c.event.id][k];
    allocation[c.event.id] = k;
    // show the full option list computed with the allocated trucks (incl. do-nothing)
    options[c.event.id] = opts.map((o, idx) => ({ ...o, recommended: idx === 0 }));
    plans[c.event.id] = opts[0] ?? {
      cost: c.doNothingCost, truckCost: 0, shutInCost: c.doNothingCost, trucks: 0, trips: 0,
      shutIns: [], tripAt: null, peakPct: c.levelPct, label: 'Wait for repair', recommended: true,
    };
  });
  return { system, fleet, totalCost: b?.total ?? 0, allocation, plans, options };
}

/** Level trace (percent) for a given option, length H+1 minutes */
export function traceFor(ctx: FailureContext, ds: Dataset, opt: PlanOption): Float32Array {
  const f = ctx.facility;
  const cap = f.tank.capacity_bbl;
  const H = ctx.horizonMin;
  const wells: WellSim[] = f.wells
    .filter((w) => ctx.producingWells.includes(w.id))
    .map((w) => ({ id: w.id, water: w.baseline_water_bpd, revH: wellRevPerHour(w, ds.ops) }));
  const tr = new Float32Array(H + 1);
  simulate(
    ctx.volumeBbl, cap, ds.network.defaults.tank_limits_pct.shutdown, wells, H,
    truckArrivals(opt.trucks, opt.trips, f.response_min, f.cycle_min), opt.shutIns,
    ds.ops.emergency_trucking.truck_capacity_bbl, tr,
  );
  for (let i = 0; i < tr.length; i++) tr[i] = (tr[i] / cap) * 100;
  return tr;
}
