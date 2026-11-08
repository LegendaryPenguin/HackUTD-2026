import type { Dataset, DetectedEvent, FailureContext, SystemPlan } from './types';
import { CATEGORY_LABEL, fmt } from './model';

export interface Analysis {
  now: number;
  events: DetectedEvent[];
  ongoing: DetectedEvent[];
  failures: FailureContext[];
  systemPlans: Record<string, SystemPlan>;
  /** ordered per SPEC alerts view */
  orderedFailures: FailureContext[];
}

export function shiftSummary(ds: Dataset, a: Analysis, hoursBack = 12): string {
  const since = a.now - hoursBack * 3600;
  const recent = a.events.filter((e) => e.onset >= since || e.status === 'ongoing' || (e.end != null && e.end >= since));
  const lines: string[] = [];
  lines.push(`Shift handoff, ${fmt.time(a.now)} UTC. Dataset ${ds.name}.`);
  if (!recent.length) {
    lines.push(`Quiet shift. No problems in the last ${hoursBack} hours; all ${ds.network.systems.reduce((n, s) => n + s.facilities.length, 0)} facilities normal.`);
    return lines.join('\n');
  }
  const fails = recent.filter((e) => e.category === 'pump_failure');
  const leaks = recent.filter((e) => e.category === 'pipeline_leak');
  const degs = recent.filter((e) => e.category === 'pump_degradation');

  if (fails.length) {
    const bySys = groupBy(fails, (e) => e.system);
    for (const [sys, list] of Object.entries(bySys)) {
      const names = list.map((e) => fmt.short(e.facility)).join(', ');
      const t0 = Math.min(...list.map((e) => e.onset));
      const t1 = Math.max(...list.map((e) => e.onset));
      lines.push(
        `${sys}: ${list.length} pump failure${list.length > 1 ? 's' : ''} (${names}) ${list.length > 1 ? `between ${fmt.time(t0)} and ${fmt.time(t1)}` : `at ${fmt.time(t0)}`}.`,
      );
      for (const e of list) {
        const ctx = a.failures.find((c) => c.event.id === e.id);
        if (e.status === 'ongoing' && ctx) {
          const plan = a.systemPlans[sys]?.plans[e.id];
          const trip = ctx.hoursToLimit === 0 ? 'already shut in' : isFinite(ctx.hoursToLimit) ? `trips ${fmt.time(ctx.tripsAtUnix!)} if nothing is done` : 'never trips';
          lines.push(`  • ${fmt.short(e.facility)} tank at ${ctx.levelPct.toFixed(0)}%, ${trip}; repair ends ${fmt.time(e.onset + ds.ops.expected_repair_hours.pump_failure * 3600)}. Recommended: ${plan ? `${plan.label} (${fmt.money(plan.cost)})` : 'wait for repair'}.`);
        } else if (e.end != null) {
          lines.push(`  • ${fmt.short(e.facility)} repaired ${fmt.time(e.end)}.`);
        }
      }
    }
  }
  for (const e of leaks) {
    lines.push(
      `${CATEGORY_LABEL[e.category]} on ${e.asset} (${e.system}) since ~${fmt.time(e.onset)}${e.status === 'ongoing' ? ', still leaking, inspector needed' : `, stopped ${fmt.time(e.end!)}`}.`,
    );
  }
  for (const e of degs) {
    lines.push(
      `${e.asset} (${e.system}) wearing out since ~${fmt.time(e.onset)}${e.status === 'ongoing' ? '. Schedule inspection.' : e.end != null ? `, ended ${fmt.time(e.end)}` : ''}.`,
    );
  }
  const total = Object.values(a.systemPlans).reduce((s, p) => s + p.totalCost, 0);
  if (a.failures.length) lines.push(`Estimated cost of recommended actions: ${fmt.money(total)}.`);
  return lines.join('\n');
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of arr) (out[key(x)] ||= []).push(x);
  return out;
}

export function eventsJson(ds: Dataset, a: Analysis): unknown[] {
  return a.events.map((e) => {
    const ctx = a.failures.find((c) => c.event.id === e.id);
    const plan = ctx ? a.systemPlans[e.system]?.plans[e.id] : undefined;
    const actions: unknown[] = [];
    if (e.category === 'pump_failure') {
      if (ctx && plan) {
        if (plan.trucks) actions.push({ type: 'dispatch_truck', facility_id: e.facility, trucks: plan.trucks, trips_per_truck: plan.trips });
        if (plan.shutIns.length) actions.push({ type: 'shut_in_wells', wells: plan.shutIns.map((s) => s.well), start_after_min: plan.shutIns[0].startMin });
        if (!actions.length) actions.push({ type: 'none' });
      }
    } else actions.push({ type: 'field_inspection', asset_id: e.asset });
    const i = ds.telemetry.ts.length - 1;
    return {
      event_id: e.id,
      system_id: e.system,
      facility_id: e.facility,
      asset_id: e.asset,
      category: e.category,
      status: e.status,
      onset_ts: fmt.iso(e.onset),
      onset_unix: e.onset,
      end_ts: e.end == null ? null : fmt.iso(e.end),
      end_unix: e.end,
      confidence: +e.confidence.toFixed(2),
      evidence: e.evidence,
      level_pct: e.category === 'pump_failure' && e.status === 'ongoing' ? +(ds.telemetry.series.get(`${e.facility.replace('FACILITY', 'TANK')}|level_pct`)?.[i] ?? 0).toFixed(1) : undefined,
      hours_to_limit: e.category === 'pump_failure' && e.status === 'ongoing' && ctx ? { p50: isFinite(ctx.hoursToLimit) ? +ctx.hoursToLimit.toFixed(2) : null } : null,
      recommended_actions: actions,
      est_cost: plan ? Math.round(plan.cost) : undefined,
    };
  });
}
