/**
 * Offline scenario sweep — enumerates every planner option for every pump failure
 * across shipped datasets and writes a comparison JSON for UX design.
 *
 * Run: node --experimental-strip-types scripts/sweep-scenarios.mjs
 *   or: npx tsx scripts/sweep-scenarios.ts  (if using the .ts twin)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Use the built-in approach: spawn via vite-node/tsx by compiling inline isn't ideal.
// Instead we duplicate a thin runner that imports from dist after tsc — OR use tsx.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function main() {
  // Dynamic import of TS via tsx register if available
  let detectEvents, failureContext, sweepCase, caseSweepJson, sweepAllFailures, parseTelemetry, planSystem;
  try {
    await import('tsx/esm');
  } catch {
    /* tsx may be invoked externally */
  }
  const loader = await import(pathToFileUrl(path.join(root, 'src/lib/loader.ts')));
  const detector = await import(pathToFileUrl(path.join(root, 'src/lib/detector.ts')));
  const planner = await import(pathToFileUrl(path.join(root, 'src/lib/planner.ts')));
  const scenarios = await import(pathToFileUrl(path.join(root, 'src/lib/scenarios.ts')));
  parseTelemetry = loader.parseTelemetry;
  detectEvents = detector.detectEvents;
  failureContext = planner.failureContext;
  planSystem = planner.planSystem;
  sweepCase = scenarios.sweepCase;
  caseSweepJson = scenarios.caseSweepJson;
  sweepAllFailures = scenarios.sweepAllFailures;

  const dataRoot = path.join(root, 'data');
  const folders = fs.readdirSync(dataRoot).filter((d) => {
    const p = path.join(dataRoot, d);
    return fs.statSync(p).isDirectory() &&
      ['network.json', 'ops.json', 'telemetry.csv'].every((f) => fs.existsSync(path.join(p, f)));
  });

  const outDir = path.join(root, 'docs', 'scenario_sweeps');
  fs.mkdirSync(outDir, { recursive: true });

  const summary = [];

  for (const folder of folders) {
    const dir = path.join(dataRoot, folder);
    console.log('\n===', folder, '===');
    const network = JSON.parse(fs.readFileSync(path.join(dir, 'network.json'), 'utf8'));
    const ops = JSON.parse(fs.readFileSync(path.join(dir, 'ops.json'), 'utf8'));
    const telemetry = parseTelemetry(fs.readFileSync(path.join(dir, 'telemetry.csv'), 'utf8'));
    const ds = { name: folder, network, ops, telemetry };
    const events = detectEvents(ds);
    const sweep = sweepAllFailures(ds, events, 300);

    // ranking table for humans
    const rows = sweep.singles.map((c) => ({
      event: c.eventId,
      facility: c.facility,
      level: +c.levelPct.toFixed(1),
      fill_bbl_h: +c.fillBblPerHour.toFixed(1),
      hours_to_92: isFinite(c.hoursToLimit) ? +c.hoursToLimit.toFixed(2) : null,
      baseline_6hish: Math.round(c.baselineRevenue),
      do_nothing: Math.round(c.doNothingCost),
      best: c.recommended.label,
      best_cost: Math.round(c.recommended.cost),
      save_vs_nothing: Math.round(c.recommended.savingsVsDoNothing),
      kept_pct: +(c.recommended.productionKeptPct * 100).toFixed(1),
      options: c.counts.total,
      families: { ...c.counts },
    }));

    fs.writeFileSync(path.join(outDir, `${folder}.json`), JSON.stringify({ folder, generated_at: new Date().toISOString(), rows, ...sweep }, null, 2));
    fs.writeFileSync(path.join(outDir, `${folder}_table.json`), JSON.stringify(rows, null, 2));
    console.log(rows.map((r) => `${r.event} ${r.facility}  nothing=$${r.do_nothing}  best=${r.best} ($${r.best_cost})  save=$${r.save_vs_nothing}  opts=${r.options}`).join('\n'));
    summary.push({ folder, failures: rows.length, joints: sweep.joints.length, rows });
  }

  fs.writeFileSync(path.join(outDir, 'INDEX.json'), JSON.stringify(summary, null, 2));
  console.log('\nWrote', outDir);
}

function pathToFileUrl(p) {
  let s = path.resolve(p).replace(/\\/g, '/');
  if (!s.startsWith('/')) s = '/' + s; // windows
  return 'file://' + s;
}

main().catch((e) => { console.error(e); process.exit(1); });
