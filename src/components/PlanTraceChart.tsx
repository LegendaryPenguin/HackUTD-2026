import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
  /** Tighter chrome for small faces. */
  compact?: boolean;
}) {
  const nothing: PlanOption = {
    cost: ctx.doNothingCost, truckCost: 0, shutInCost: ctx.doNothingCost,
    trucks: 0, trips: 0, shutIns: [], tripAt: null, peakPct: 100, label: 'Do nothing',
  };
  const nothingTrace = traceFor(ctx, ds, nothing);
  const planTrace = traceFor(ctx, ds, plan);
  const H = ctx.horizonMin;
  const warn = ds.network.defaults.tank_limits_pct.warning;
  const shut = ds.network.defaults.tank_limits_pct.shutdown;
  const step = Math.max(1, Math.floor(H / 72));
  const data = [];
  for (let m = 0; m <= H; m += step) {
    data.push({
      m,
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
    ? { top: 14, right: 18, left: 0, bottom: 4 }
    : { top: 18, right: 22, left: 2, bottom: 6 };
  const yMax = Math.min(100, Math.max(shut + 4, ...data.map((d) => Math.max(d.nothing, d.plan))) + 6);

  return (
    <div className={`plan-trace-chart ${compact ? 'is-compact' : ''}`}>
      <div className="plan-trace-head">
        <div className="plan-trace-title">Now to repair</div>
        <div className="plan-trace-legend">
          <span className="is-nothing"><i /> Do nothing</span>
          <span className="is-plan"><i /> Recommended plan</span>
          <span className="dim">{fmt.dur(H / 60)} to repair</span>
        </div>
      </div>
      <div className="plan-trace-plot" style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={margin}>
            <defs>
              <linearGradient id="traceNothingFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f08a9a" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#f08a9a" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="tracePlanFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5ec8d8" stopOpacity={0.38} />
                <stop offset="100%" stopColor="#5ec8d8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="m"
              tickFormatter={(m) => (m === 0 ? '0' : String(m))}
              stroke="rgba(186, 210, 228, 0.45)"
              fontSize={10}
              tickMargin={6}
              minTickGap={compact ? 36 : 28}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, yMax]}
              unit="%"
              stroke="rgba(186, 210, 228, 0.45)"
              fontSize={10}
              width={34}
              tickCount={4}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v, name) => [`${Number(v ?? 0).toFixed(1)}%`, name === 'nothing' ? 'Do nothing' : 'Recommended plan']}
              labelFormatter={(m) => `+${m} min`}
              contentStyle={{
                fontSize: 12,
                background: 'rgba(12, 24, 36, 0.96)',
                border: '1px solid rgba(148, 184, 220, 0.28)',
                borderRadius: 10,
              }}
            />
            <ReferenceLine y={warn} stroke="rgba(224,168,74,0.55)" strokeDasharray="4 4" />
            <ReferenceLine
              y={shut}
              stroke="rgba(240,138,154,0.7)"
              strokeDasharray="4 4"
              label={{ value: '92%', fill: '#f08a9a', fontSize: 10, position: 'insideTopLeft', offset: 4 }}
            />
            {arrivals[0] != null && arrivals[0] < H && (
              <ReferenceLine
                x={arrivals[0]}
                stroke="rgba(148, 184, 220, 0.55)"
                strokeDasharray="3 3"
                label={{ value: 'truck', fill: 'rgba(186,210,228,0.85)', fontSize: 10, position: 'insideTop', offset: 6 }}
              />
            )}
            <ReferenceLine
              x={H}
              stroke="rgba(148, 184, 220, 0.4)"
              strokeDasharray="3 3"
              label={{ value: 'repair', fill: 'rgba(186,210,228,0.75)', fontSize: 10, position: 'insideTopLeft', offset: 6 }}
            />
            <Area
              type="monotone"
              dataKey="nothing"
              stroke="none"
              fill="url(#traceNothingFill)"
              isAnimationActive
              animationDuration={900}
            />
            <Area
              type="monotone"
              dataKey="plan"
              stroke="none"
              fill="url(#tracePlanFill)"
              isAnimationActive
              animationDuration={1100}
            />
            <Line
              type="monotone"
              dataKey="nothing"
              stroke="#f08a9a"
              strokeDasharray="6 4"
              dot={false}
              strokeWidth={2.2}
              isAnimationActive
              animationDuration={900}
            />
            <Line
              type="monotone"
              dataKey="plan"
              stroke="#5ec8d8"
              dot={false}
              strokeWidth={2.6}
              isAnimationActive
              animationDuration={1100}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
