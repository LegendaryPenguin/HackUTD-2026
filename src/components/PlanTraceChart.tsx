import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FailureContext, PlanOption, Dataset } from '../lib/types';
import { traceFor, truckArrivals } from '../lib/planner';
import { fmt } from '../lib/model';

export function PlanTraceChart({
  ctx, ds, plan, height = 200, compact = false,
}: {
  ctx: FailureContext;
  ds: Dataset;
  plan: PlanOption;
  height?: number;
  /** Tighter chrome for ReflectiveCard faces (no clipped labels). */
  compact?: boolean;
}) {
  const nothing: PlanOption = {
    cost: ctx.doNothingCost, truckCost: 0, shutInCost: ctx.doNothingCost,
    trucks: 0, trips: 0, shutIns: [], tripAt: null, peakPct: 100, label: 'Do nothing',
  };
  // recompute do-nothing trip via empty plan
  const nothingTrace = traceFor(ctx, ds, nothing);
  const planTrace = traceFor(ctx, ds, plan);
  const H = ctx.horizonMin;
  const warn = ds.network.defaults.tank_limits_pct.warning;
  const shut = ds.network.defaults.tank_limits_pct.shutdown;
  const step = Math.max(1, Math.floor(H / 60));
  const data = [];
  for (let m = 0; m <= H; m += step) {
    data.push({
      m,
      t: ctx.event.onset ? undefined : m,
      nothing: nothingTrace[Math.min(m, nothingTrace.length - 1)],
      plan: planTrace[Math.min(m, planTrace.length - 1)],
    });
  }
  if (data[data.length - 1]?.m !== H) {
    data.push({
      m: H,
      nothing: nothingTrace[nothingTrace.length - 1],
      plan: planTrace[planTrace.length - 1],
    });
  }
  const arrivals = truckArrivals(plan.trucks, plan.trips, ctx.facility.response_min, ctx.facility.cycle_min);
  const margin = compact
    ? { top: 14, right: 40, left: 4, bottom: 4 }
    : { top: 18, right: 40, left: 6, bottom: 8 };

  return (
    <div className={`plan-trace-chart ${compact ? 'is-compact' : ''}`}>
      <div className="plan-trace-title">Now to repair</div>
      <div className="plan-trace-plot" style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={margin}>
            <XAxis
              dataKey="m"
              tickFormatter={(m) => (m === 0 ? 'Now' : m >= H ? '' : `+${Math.round(m / 60)}h`)}
              stroke="var(--ink-3)"
              fontSize={10}
              tickMargin={6}
              minTickGap={compact ? 28 : 18}
            />
            <YAxis domain={[0, 100]} unit="%" stroke="var(--ink-3)" fontSize={10} width={36} tickCount={3} />
            <Tooltip
              formatter={(v, name) => [`${Number(v ?? 0).toFixed(1)}%`, name === 'nothing' ? 'Do nothing' : 'This plan']}
              labelFormatter={(m) => `+${m} min`}
              contentStyle={{ fontSize: 12 }}
            />
            <ReferenceLine y={warn} stroke="var(--amber)" strokeDasharray="4 4" />
            <ReferenceLine
              y={shut}
              stroke="var(--coral)"
              strokeDasharray="4 4"
              label={{ value: '92%', fill: 'var(--coral)', fontSize: 10, position: 'insideTopLeft', offset: 6 }}
            />
            {arrivals[0] != null && arrivals[0] < H && (
              <ReferenceLine
                x={arrivals[0]}
                stroke="var(--aqua)"
                strokeDasharray="3 3"
                label={{ value: 'truck', fill: 'var(--aqua)', fontSize: 10, position: 'insideTop', offset: 8 }}
              />
            )}
            <ReferenceLine
              x={H}
              stroke="var(--ink-3)"
              strokeDasharray="3 3"
              label={{ value: 'repair', fill: 'var(--ink-2)', fontSize: 10, position: 'insideTopLeft', offset: 8 }}
            />
            <Line type="monotone" dataKey="nothing" stroke="var(--coral)" strokeDasharray="6 4" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="plan" stroke="var(--aqua)" dot={false} strokeWidth={2.5} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="plan-trace-legend">
        <span><i style={{ background: 'var(--coral)' }} /> Do nothing</span>
        <span><i style={{ background: 'var(--aqua)' }} /> This plan</span>
        <span className="dim">{fmt.dur(H / 60)} to repair</span>
      </div>
    </div>
  );
}
