/**
 * Offline scenario sweep — every planner option for every pump failure,
 * with cost framed vs regular production rate + timeline marks.
 *
 *   npx tsx scripts/sweep-scenarios.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTelemetry } from '../src/lib/loader';
import { detectEvents } from '../src/lib/detector';
import { caseSweepJson, sweepAllFailures, sweepCase, explainRelativeToRegular } from '../src/lib/scenarios';
import { failureContext } from '../src/lib/planner';
import type { Dataset } from '../src/lib/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, 'data');
const outDir = path.join(root, 'docs', 'scenario_sweeps');

function loadDataset(folder: string): Dataset {
  const dir = path.join(dataRoot, folder);
  return {
    name: folder,
    network: JSON.parse(fs.readFileSync(path.join(dir, 'network.json'), 'utf8')),
    ops: JSON.parse(fs.readFileSync(path.join(dir, 'ops.json'), 'utf8')),
    telemetry: parseTelemetry(fs.readFileSync(path.join(dir, 'telemetry.csv'), 'utf8')),
  };
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const folders = fs.readdirSync(dataRoot).filter((d) => {
    const p = path.join(dataRoot, d);
    return fs.statSync(p).isDirectory() &&
      ['network.json', 'ops.json', 'telemetry.csv'].every((f) => fs.existsSync(path.join(p, f)));
  });

  const index: unknown[] = [];

  for (const folder of folders) {
    console.log(`\n=== ${folder} ===`);
    const ds = loadDataset(folder);
    const events = detectEvents(ds);
    const sweep = sweepAllFailures(ds, events, 300);

    // Deep-dive card for EVENT_9-style teaching when present
    const teach = sweep.singles.find((c) => c.facility === 'S1_FACILITY_C' && c.onsetUnix);
    if (teach && folder === 'full_week') {
      const e = events.find((x) => x.id === teach.eventId)!;
      const ctx = failureContext(e, ds, e.onset + 300);
      console.log('\n[teach]', explainRelativeToRegular(ctx));
      console.log('[teach] top 8 by cost:');
      for (const s of teach.scenarios.slice(0, 8)) {
        console.log(
          `  $${Math.round(s.cost).toString().padStart(5)}  keep ${(s.productionKeptPct * 100).toFixed(0)}%` +
          `  save$${Math.round(s.savingsVsDoNothing).toString().padStart(5)}  [${s.family}] ${s.label}`,
        );
      }
    }

    const rows = sweep.singles.map((c) => ({
      event: c.eventId,
      facility: c.facility,
      system: c.system,
      level_pct: +c.levelPct.toFixed(1),
      fill_bbl_h: +c.fillBblPerHour.toFixed(1),
      hours_to_92: isFinite(c.hoursToLimit) ? +c.hoursToLimit.toFixed(2) : null,
      baseline_revenue: Math.round(c.baselineRevenue),
      do_nothing_loss: Math.round(c.doNothingCost),
      best_label: c.recommended.label,
      best_cost: Math.round(c.recommended.cost),
      save_vs_nothing: Math.round(c.recommended.savingsVsDoNothing),
      production_kept_pct: +(c.recommended.productionKeptPct * 100).toFixed(1),
      option_count: c.counts.total,
      families: {
        wait_safe: c.counts.waitSafe,
        do_nothing: c.counts.doNothing,
        trucks_only: c.counts.trucksOnly,
        shut_in_only: c.counts.shutInOnly,
        mixed: c.counts.mixed,
      },
      timeline_best: c.recommended.timeline.map((m) => ({
        t: m.atMin,
        kind: m.kind,
        label: m.label,
      })),
    }));

    // Also dump one fully enriched case (smallest cost spread interesting) for UX prototyping
    const rich = sweep.singles
      .map((c) => caseSweepJson(c as never))
      .sort((a, b) => b.doNothingCost - a.doNothingCost)[0];

    // Full per-event option lists (for UX prototyping) — one file per event would be huge;
    // keep the ranked table + joints + the single richest case with every option expanded.
    fs.writeFileSync(path.join(outDir, `${folder}.json`), JSON.stringify({
      folder,
      generated_at: new Date().toISOString(),
      note: 'cost = lost production vs regular well revenue + truck fees. baselineRevenue = rev/h × hours until repair.',
      rows,
      joints: sweep.joints,
      richest_example: rich,
    }, null, 2));
    fs.writeFileSync(path.join(outDir, `${folder}_table.json`), JSON.stringify(rows, null, 2));
    // Optional deep dump of every option (gitignored if large workflows prefer)
    fs.writeFileSync(path.join(outDir, `${folder}_all.json`), JSON.stringify(sweep.singles, null, 2));

    for (const r of rows) {
      console.log(
        `${r.event.padEnd(8)} ${r.facility.padEnd(16)} nothing=$${String(r.do_nothing_loss).padStart(5)}  ` +
        `best=$${String(r.best_cost).padStart(5)}  save=$${String(r.save_vs_nothing).padStart(5)}  ` +
        `opts=${String(r.option_count).padStart(2)}  ${r.best_label}`,
      );
    }
    index.push({ folder, failures: rows.length, joints: sweep.joints.length, rows });
  }

  fs.writeFileSync(path.join(outDir, 'INDEX.json'), JSON.stringify(index, null, 2));
  console.log(`\nWrote ${outDir}`);
}

main();
