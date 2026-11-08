import { fmt } from '../lib/model';
import { planImpact } from '../lib/planImpact';
import type { Dataset, FailureContext, PlanOption } from '../lib/types';

/**
 * Before / after snapshot for a selected plan — shown after choose, before Act.
 * Numbers come from the live failure context + selected PlanOption (not hardcoded).
 */
export function PlanImpactCompare({
  ctx,
  ds,
  plan,
  compact = false,
}: {
  ctx: FailureContext;
  ds: Dataset;
  plan: PlanOption;
  compact?: boolean;
}) {
  const imp = planImpact(ctx, ds, plan);
  const rows: { label: string; before: string; after: string; better?: 'after' | 'before' | 'neutral' }[] = [
    {
      label: 'Cost / loss',
      before: fmt.money(imp.before.cost),
      after: fmt.money(imp.after.cost),
      better: imp.after.cost <= imp.before.cost ? 'after' : 'before',
    },
    {
      label: '$/h still earning',
      before: `${fmt.money(imp.before.revPerHour)}/h`,
      after: `${fmt.money(imp.after.revPerHour)}/h`,
      better: imp.after.revPerHour >= imp.before.revPerHour ? 'after' : 'before',
    },
    {
      label: 'Oil lost (repair window)',
      before: `${fmt.num(imp.before.oilLostBbl, 0)} bbl`,
      after: `${fmt.num(imp.after.oilLostBbl, 0)} bbl`,
      better: imp.after.oilLostBbl <= imp.before.oilLostBbl ? 'after' : 'before',
    },
    {
      label: 'Peak tank',
      before: `${imp.before.peakPct.toFixed(0)}%`,
      after: `${imp.after.peakPct.toFixed(0)}%`,
      better: imp.after.peakPct <= imp.before.peakPct ? 'after' : 'before',
    },
    {
      label: 'Wells online now',
      before: String(imp.before.wellsOnlineStart),
      after: String(imp.after.wellsOnlineStart),
      better: 'neutral',
    },
  ];

  return (
    <div className={`plan-impact ${compact ? 'is-compact' : ''}`} aria-label="Before and after plan impact">
      <div className="plan-impact__head">
        <div>
          <div className="plan-impact__eyebrow">Before vs after</div>
          <div className="plan-impact__title">If you put this plan into action</div>
        </div>
        {imp.savings > 0 && (
          <div className="plan-impact__save">
            <span>Saves</span>
            <b>{fmt.money(imp.savings)}</b>
          </div>
        )}
      </div>

      <div className="plan-impact__bars" aria-hidden>
        <ImpactBar
          label="Money kept"
          before={Math.max(0, imp.revPerHourAtRisk * (ctx.horizonMin / 60) - imp.before.cost)}
          after={Math.max(0, imp.revPerHourAtRisk * (ctx.horizonMin / 60) - imp.after.cost)}
          format={(v) => fmt.money(v)}
        />
        <ImpactBar
          label="Oil preserved"
          before={Math.max(0, imp.oilBpdAtRisk * (ctx.horizonMin / 60 / 24) - imp.before.oilLostBbl)}
          after={Math.max(0, imp.oilBpdAtRisk * (ctx.horizonMin / 60 / 24) - imp.after.oilLostBbl)}
          format={(v) => `${fmt.num(v, 0)} bbl`}
        />
      </div>

      <div className="plan-impact__table" role="table" aria-label="Impact comparison">
        <div className="plan-impact__row plan-impact__row--head" role="row">
          <span role="columnheader">Metric</span>
          <span role="columnheader">Do nothing</span>
          <span role="columnheader">This plan</span>
        </div>
        {rows.map((r) => (
          <div key={r.label} className="plan-impact__row" role="row">
            <span role="cell">{r.label}</span>
            <span role="cell" className={r.better === 'before' ? 'is-win' : 'is-lose'}>{r.before}</span>
            <span role="cell" className={r.better === 'after' ? 'is-win' : r.better === 'before' ? 'is-lose' : ''}>{r.after}</span>
          </div>
        ))}
      </div>

      {!compact && (
        <p className="plan-impact__note">
          At stake now: {fmt.money(imp.revPerHourAtRisk)}/h · {fmt.num(imp.oilBpdAtRisk, 0)} oil bpd from{' '}
          {ctx.producingWells.length} wells. Oil/gas lost is over the ~{fmt.dur(ctx.horizonMin / 60)} repair window.
        </p>
      )}
    </div>
  );
}

function ImpactBar({
  label,
  before,
  after,
  format,
}: {
  label: string;
  before: number;
  after: number;
  format: (v: number) => string;
}) {
  const max = Math.max(before, after, 1);
  return (
    <div className="plan-impact__bar">
      <div className="plan-impact__bar-label">{label}</div>
      <div className="plan-impact__bar-track">
        <div className="plan-impact__bar-fill is-before" style={{ width: `${(before / max) * 100}%` }} />
        <span>{format(before)}</span>
      </div>
      <div className="plan-impact__bar-track">
        <div className="plan-impact__bar-fill is-after" style={{ width: `${(after / max) * 100}%` }} />
        <span>{format(after)}</span>
      </div>
    </div>
  );
}
