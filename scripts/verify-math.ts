/**
 * Verify detector + planner numbers on a dataset folder.
 * Usage: npx tsx scripts/verify-math.ts [full_week|mock_test_...]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTelemetry } from '../src/lib/loader';
import { detectEvents } from '../src/lib/detector';
import { failureContext, planSystem, simulate, truckArrivals, traceFor } from '../src/lib/planner';
import { wellRevPerHour } from '../src/lib/model';
import type { Dataset } from '../src/lib/types';

const name = process.argv[2] ?? 'full_week';
const base = join(process.cwd(), 'data', name);
const network = JSON.parse(readFileSync(join(base, 'network.json'), 'utf8'));
const ops = JSON.parse(readFileSync(join(base, 'ops.json'), 'utf8'));
const csv = readFileSync(join(base, 'telemetry.csv'), 'utf8');
const telemetry = parseTelemetry(csv);
const ds: Dataset = { name, network, ops, telemetry };
const now = telemetry.ts[telemetry.ts.length - 1];

const events = detectEvents(ds, now);
const failures = events.filter((e) => e.category === 'pump_failure' && e.status === 'ongoing')
  .map((e) => failureContext(e, ds, now));

console.log(`now=${new Date(now * 1000).toISOString()} events=${events.length} ongoingFailures=${failures.length}`);

let fails = 0;
for (const ctx of failures) {
  const wells = ctx.facility.wells
    .filter((w) => ctx.producingWells.includes(w.id))
    .map((w) => ({ id: w.id, water: w.baseline_water_bpd, revH: wellRevPerHour(w, ops) }));
  const sim = simulate(
    ctx.volumeBbl,
    ctx.facility.tank.capacity_bbl,
    network.defaults.tank_limits_pct.shutdown,
    wells,
    ctx.horizonMin,
    truckArrivals(0, 0, ctx.facility.response_min, ctx.facility.cycle_min),
    [],
    ops.emergency_trucking.truck_capacity_bbl,
  );
  const delta = Math.abs(sim.shutInCost - ctx.doNothingCost);
  const ok = delta < 50;
  if (!ok) fails++;
  console.log(
    `${ok ? 'OK' : 'FAIL'} ${ctx.facility.id} doNothing sim=$${sim.shutInCost.toFixed(0)} ctx=$${ctx.doNothingCost.toFixed(0)} Δ=$${delta.toFixed(0)} htl=${ctx.hoursToLimit.toFixed(2)}`,
  );

  const sp = planSystem([ctx], ds);
  const rec = sp.plans[ctx.event.id];
  if (rec) {
    const tr = traceFor(ctx, ds, rec);
    if (tr.length !== ctx.horizonMin + 1) {
      console.log(`FAIL ${ctx.facility.id} trace length ${tr.length} != ${ctx.horizonMin + 1}`);
      fails++;
    } else {
      console.log(`OK ${ctx.facility.id} rec="${rec.label}" cost=$${rec.cost.toFixed(0)} peak=${rec.peakPct.toFixed(1)}%`);
    }
  }
}

// Also sample a few historical failures at onset+5m
const hist = events.filter((e) => e.category === 'pump_failure').slice(0, 5);
for (const e of hist) {
  const t = e.onset + 300;
  const ctx = failureContext(e, ds, t);
  const wells = ctx.facility.wells
    .filter((w) => ctx.producingWells.includes(w.id))
    .map((w) => ({ id: w.id, water: w.baseline_water_bpd, revH: wellRevPerHour(w, ops) }));
  const sim = simulate(
    ctx.volumeBbl,
    ctx.facility.tank.capacity_bbl,
    network.defaults.tank_limits_pct.shutdown,
    wells,
    ctx.horizonMin,
    [],
    [],
    ops.emergency_trucking.truck_capacity_bbl,
  );
  const delta = Math.abs(sim.shutInCost - ctx.doNothingCost);
  // level_pct sensor noise can move do-nothing $ by tens of dollars
  const ok = delta < 50 || ctx.horizonMin <= 0;
  if (!ok) fails++;
  console.log(`${ok ? 'OK' : 'FAIL'} hist ${e.id} @+5m doNothing Δ=$${delta.toFixed(0)}`);
}

if (fails) {
  console.error(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
