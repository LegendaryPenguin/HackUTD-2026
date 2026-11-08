import type { Analysis } from './summary';
import type { Dataset } from './types';
import type { DispatchedPlan } from './dispatch';
import { fmt } from './model';
import { planImpact } from './planImpact';
import { cumulativeProfitTo, fieldFinancialsAt } from './financials';

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cols: Array<string | number | boolean | null | undefined>): string {
  return cols.map(csvEscape).join(',');
}

/**
 * Week record-keeping CSV: every detected event + any committed plan impacts.
 * Driven entirely from dataset / analysis / dispatched — no fixed scenario rows.
 */
export function buildDecisionsCsv(
  ds: Dataset,
  analysis: Analysis,
  dispatched: Record<string, DispatchedPlan>,
): string {
  const endUnix = analysis.now;
  const fin = fieldFinancialsAt(ds, endUnix, analysis.ongoing, dispatched);
  const weekProfit = cumulativeProfitTo(ds, endUnix, dispatched);

  const header = [
    'record_type',
    'event_id',
    'system_id',
    'facility_id',
    'asset_id',
    'category',
    'event_status',
    'onset_iso',
    'onset_unix',
    'end_iso',
    'end_unix',
    'duration_min',
    'acted',
    'commit_iso',
    'commit_unix',
    'plan_label',
    'recommended_label',
    'matched_recommended',
    'trucks',
    'trips',
    'shut_in_wells',
    'shut_in_start_min',
    'do_nothing_cost_usd',
    'plan_cost_usd',
    'truck_cost_usd',
    'shut_in_cost_usd',
    'savings_usd',
    'rev_per_hour_usd',
    'oil_bpd_at_risk',
    'oil_bbl_lost_do_nothing',
    'oil_bbl_lost_plan',
    'oil_bbl_saved',
    'gas_mcf_saved',
    'peak_tank_pct',
    'trip_at_min',
    'level_pct_at_commit',
    'inflow_bpd_at_commit',
    'horizon_min',
    'confidence',
    'evidence',
    'week_end_iso',
    'week_rate_per_hour_usd',
    'week_cumulative_profit_usd',
    'week_active_plans',
    'dataset',
  ];

  const lines: string[] = [row(header)];
  const weekMeta = {
    week_end_iso: fmt.iso(endUnix),
    week_rate_per_hour_usd: Math.round(fin.ratePerHour),
    week_cumulative_profit_usd: Math.round(weekProfit),
    week_active_plans: fin.activePlans,
    dataset: ds.name,
  };

  // Summary rollup first — one row for the whole week.
  const acted = Object.values(dispatched);
  const totalSavings = acted.reduce((s, d) => {
    const ctx = analysis.failures.find((c) => c.event.id === d.eventId);
    if (!ctx) return s;
    return s + Math.max(0, ctx.doNothingCost - d.plan.cost);
  }, 0);
  lines.push(row([
    'week_summary',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    acted.length > 0,
    '',
    '',
    `${acted.length} decisions`,
    '',
    '',
    acted.reduce((n, d) => n + d.plan.trucks, 0),
    '',
    '',
    '',
    '',
    Math.round(acted.reduce((n, d) => n + d.plan.cost, 0)),
    Math.round(acted.reduce((n, d) => n + d.plan.truckCost, 0)),
    Math.round(acted.reduce((n, d) => n + d.plan.shutInCost, 0)),
    Math.round(totalSavings),
    Math.round(fin.ratePerHour),
    Math.round(fin.oilBpd),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    weekMeta.week_end_iso,
    weekMeta.week_rate_per_hour_usd,
    weekMeta.week_cumulative_profit_usd,
    weekMeta.week_active_plans,
    weekMeta.dataset,
  ]));

  for (const e of analysis.events) {
    const ctx = analysis.failures.find((c) => c.event.id === e.id);
    const recommended = ctx ? analysis.systemPlans[e.system]?.plans[e.id] : undefined;
    const d = dispatched[e.id];
    const plan = d?.plan ?? recommended;
    const imp = ctx && plan ? planImpact(ctx, ds, plan) : null;
    const durationMin = e.end != null
      ? Math.round((e.end - e.onset) / 60)
      : Math.round((endUnix - e.onset) / 60);
    const matched = !!(d && recommended && d.plan.label === recommended.label);

    lines.push(row([
      'event',
      e.id,
      e.system,
      e.facility,
      e.asset,
      e.category,
      e.status,
      fmt.iso(e.onset),
      e.onset,
      e.end == null ? null : fmt.iso(e.end),
      e.end,
      durationMin,
      !!d,
      d ? fmt.iso(d.commitUnix) : null,
      d?.commitUnix ?? null,
      plan?.label ?? null,
      recommended?.label ?? null,
      d ? matched : null,
      plan?.trucks ?? null,
      plan?.trips ?? null,
      plan?.shutIns.map((s) => s.well).join('|') || null,
      plan?.shutIns.map((s) => s.startMin).join('|') || null,
      ctx ? Math.round(ctx.doNothingCost) : null,
      plan ? Math.round(plan.cost) : null,
      plan ? Math.round(plan.truckCost) : null,
      plan ? Math.round(plan.shutInCost) : null,
      imp ? Math.round(imp.savings) : null,
      ctx ? Math.round(ctx.revPerHour) : null,
      imp ? Math.round(imp.oilBpdAtRisk) : null,
      imp ? +imp.before.oilLostBbl.toFixed(1) : null,
      imp ? +imp.after.oilLostBbl.toFixed(1) : null,
      imp ? +imp.oilSavedBbl.toFixed(1) : null,
      imp ? +imp.gasSavedMcf.toFixed(1) : null,
      plan?.peakPct != null ? +plan.peakPct.toFixed(1) : null,
      plan?.tripAt ?? null,
      d ? +d.levelPct0.toFixed(1) : ctx ? +ctx.levelPct.toFixed(1) : null,
      ctx ? Math.round(ctx.inflowBpd) : null,
      d?.horizonMin ?? ctx?.horizonMin ?? null,
      +e.confidence.toFixed(2),
      e.evidence.join('; '),
      weekMeta.week_end_iso,
      weekMeta.week_rate_per_hour_usd,
      weekMeta.week_cumulative_profit_usd,
      weekMeta.week_active_plans,
      weekMeta.dataset,
    ]));
  }

  return `${lines.join('\n')}\n`;
}

export function downloadDecisionsCsv(
  ds: Dataset,
  analysis: Analysis,
  dispatched: Record<string, DispatchedPlan>,
): void {
  const csv = buildDecisionsCsv(ds, analysis, dispatched);
  const stamp = fmt.iso(analysis.now).replace(/[:.]/g, '-');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `decisions-${ds.name}-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
