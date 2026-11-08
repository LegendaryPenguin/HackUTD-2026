import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, Check, History, Send, Wrench } from 'lucide-react';
import { useStore } from '../state/store';
import { facilityRevPerHour, fmt, wellRevPerHour } from '../lib/model';
import { planSystem, traceFor, truckArrivals } from '../lib/planner';
import type { Dataset, FailureContext, PlanOption } from '../lib/types';
import { WaterJug3D } from '../components/WaterJug3D';
import { Countdown, fadeUp } from '../components/ui';
import { TruckIcon } from '../components/Icons';
import './plan.css';

const PALETTE = ['var(--aqua)', 'var(--amber)', 'var(--violet)', 'var(--mint)', 'var(--lagoon)', 'var(--coral)'];

export default function Plan() {
  const { id } = useParams();
  const { dataset, analysis, now, setNow, dispatched } = useStore();
  const [fleetDelta, setFleetDelta] = useState(0);
  const [repairDelta, setRepairDelta] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const ctx = analysis?.failures.find((c) => c.event.id === id);
  const event = analysis?.events.find((e) => e.id === id);

  const whatIf = useMemo(() => {
    if (!dataset || !analysis || !ctx) return null;
    const ds: Dataset = {
      ...dataset,
      ops: {
        ...dataset.ops,
        expected_repair_hours: { pump_failure: dataset.ops.expected_repair_hours.pump_failure + repairDelta },
        systems: {
          ...dataset.ops.systems,
          [ctx.facility.system]: {
            ...dataset.ops.systems[ctx.facility.system],
            emergency_fleet_size: Math.max(0, dataset.ops.systems[ctx.facility.system].emergency_fleet_size + fleetDelta),
          },
        },
      },
    };
    const ctxs = analysis.failures
      .filter((c) => c.facility.system === ctx.facility.system)
      .map((c) => ({ ...c, horizonMin: Math.max(0, c.horizonMin + repairDelta * 60) }));
    return { ds, ctxs, plan: planSystem(ctxs, ds) };
  }, [dataset, analysis, ctx, fleetDelta, repairDelta]);

  if (!dataset || !analysis) return null;

  if (!ctx || !whatIf) {
    return (
      <div className="page plan-page">
        <div className="plan-hero">
          <div>
            <h1 className="page-title">Plan</h1>
            <p className="page-sub">Cost comparison for a pump failure: trucks, early shut-ins, or letting the tank trip.</p>
          </div>
        </div>

        {event && event.category === 'pump_failure' && event.status === 'resolved' && (
          <motion.div className="plan-replay-banner" {...fadeUp}>
            <History size={18} color="var(--violet)" />
            <div>
              <b>{event.asset}</b> failed {fmt.dayTime(event.onset)} and was repaired {event.end ? fmt.dayTime(event.end) : ''}.
              Replay from onset to see the right call.
            </div>
            <button className="btn primary sm" style={{ marginLeft: 'auto' }} onClick={() => setNow(event.onset + 300)}>
              Replay from onset
            </button>
          </motion.div>
        )}

        {analysis.orderedFailures.length === 0 ? (
          <div className="plan-empty">
            <h2 className="page-title" style={{ fontSize: 16 }}>No tanks are filling right now</h2>
            <p>When a pump fails you’ll see every option here with its cost. Use the time slider to replay a past failure.</p>
            <div className="plan-empty-actions">
              {analysis.events
                .filter((e) => e.category === 'pump_failure')
                .slice(-6)
                .map((e) => (
                  <button key={e.id} className="btn sm" onClick={() => setNow(e.onset + 300)}>
                    {e.asset} · {fmt.dayTime(e.onset)}
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <div className="plan-picker-grid">
            {analysis.orderedFailures.map((c, i) => (
              <Link key={c.event.id} to={`/?f=${c.facility.id}&flow=decide`} className="plan-picker-card">
                <div className="plan-picker-rank">{i + 1}</div>
                <WaterJug3D
                  level={c.levelPct}
                  warn={dataset.network.defaults.tank_limits_pct.warning}
                  shut={dataset.network.defaults.tank_limits_pct.shutdown}
                  failed
                  size="sm"
                />
                <div className="plan-picker-body">
                  <div className="plan-picker-title">{c.facility.id}</div>
                  <Countdown hours={c.hoursToLimit} tripsAt={c.tripsAtUnix} />
                  <div className="plan-picker-meta">
                    {analysis.systemPlans[c.facility.system]?.plans[c.event.id]?.label} ·{' '}
                    {fmt.money(analysis.systemPlans[c.facility.system]?.plans[c.event.id]?.cost ?? 0)}
                  </div>
                </div>
                <ArrowRight size={16} color="var(--ink-3)" />
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const sys = ctx.facility.system;
  const sp = whatIf.plan;
  const myCtx = whatIf.ctxs.find((c) => c.event.id === ctx.event.id)!;
  const options = sp.options[ctx.event.id] ?? [];
  const rec = sp.plans[ctx.event.id];
  const limits = dataset.network.defaults.tank_limits_pct;
  const repairEnd = ctx.event.onset + (dataset.ops.expected_repair_hours.pump_failure + repairDelta) * 3600;
  const selectedLabels = picked.size ? [...picked] : [rec.label];
  const chartOpts = options.filter((o) => selectedLabels.includes(o.label)).slice(0, 6);
  const nothing = options.find((o) => o.trucks === 0 && o.shutIns.length === 0);
  if (nothing && !chartOpts.includes(nothing) && chartOpts.length < 6) chartOpts.push(nothing);

  const traces = chartOpts.map((o) => traceFor(myCtx, whatIf.ds, o));
  const H = myCtx.horizonMin;
  const data = Array.from({ length: Math.floor(H / 5) + 1 }, (_, k) => {
    const m = Math.min(H, k * 5);
    const row: Record<string, number> = { m, t: now + m * 60 };
    chartOpts.forEach((o, j) => (row[o.label] = traces[j][m]));
    return row;
  });

  const wellRows = ctx.facility.wells
    .map((w) => ({
      w,
      revH: wellRevPerHour(w, dataset.ops),
      perBbl: (wellRevPerHour(w, dataset.ops) * 24) / w.baseline_water_bpd,
      producing: ctx.producingWells.includes(w.id),
    }))
    .sort((a, b) => a.perBbl - b.perBbl);

  const toggle = (l: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });

  const countdownTone =
    ctx.hoursToLimit < 1.5 ? 'var(--coral)' : ctx.hoursToLimit < 3 ? 'var(--amber)' : undefined;

  return (
    <div className="page plan-page">
      <div className="plan-hero">
        <div>
          <div className="plan-crumb">
            <Link to="/plan">Plan</Link>
            <span>/</span>
            <span>{ctx.event.id}</span>
          </div>
          <h1 className="page-title">
            {ctx.facility.id}
            <span className="plan-asset">
              {ctx.event.asset} failed {fmt.time(ctx.event.onset)}
            </span>
          </h1>
          <p className="page-sub">
            Planned from {fmt.dayTime(now)} with the tank at {ctx.levelPct.toFixed(1)}%. Repair expected {fmt.time(repairEnd)}.
          </p>
        </div>
        <div className="plan-hero-actions">
          {dispatched[ctx.event.id] ? (
            <span className="chip mint" style={{ padding: '8px 12px' }}>
              <Check size={13} /> Dispatched: {dispatched[ctx.event.id].label}
            </span>
          ) : (
            <Link to={`/?f=${ctx.facility.id}&flow=decide`} className="btn primary">
              <Send size={14} /> Choose plan on map
            </Link>
          )}
          <Link to={`/?f=${ctx.facility.id}&flow=act`} className="btn">
            Open glass card
          </Link>
        </div>
      </div>

      <div className="plan-metrics">
        <div className="plan-metric">
          <div className="plan-metric-label">Countdown</div>
          <div className="plan-metric-value" style={{ color: countdownTone }}>
            {isFinite(ctx.hoursToLimit) ? fmt.dur(ctx.hoursToLimit) : 'never'}
          </div>
          <div className="plan-metric-sub">
            {ctx.tripsAtUnix ? `trips at ${fmt.time(ctx.tripsAtUnix)} if nothing is done` : 'tank stays under the limit'}
          </div>
        </div>
        <div className="plan-metric">
          <div className="plan-metric-label">Filling at</div>
          <div className="plan-metric-value">{fmt.num(ctx.inflowBpd / 24)} bbl/h</div>
          <div className="plan-metric-sub">
            {fmt.num(ctx.inflowBpd)} bpd from {ctx.producingWells.length} wells · {fmt.num(ctx.facility.tank.capacity_bbl)} bbl tank
          </div>
        </div>
        <div className="plan-metric">
          <div className="plan-metric-label">Recommended</div>
          <div className="plan-metric-value" style={{ color: 'var(--aqua-2)' }}>
            {fmt.money(rec.cost)}
          </div>
          <div className="plan-metric-sub">{rec.label}</div>
        </div>
        <div className="plan-metric">
          <div className="plan-metric-label">Doing nothing</div>
          <div className="plan-metric-value" style={{ color: 'var(--coral)' }}>
            {fmt.money(myCtx.doNothingCost)}
          </div>
          <div className="plan-metric-sub">
            {fmt.money(ctx.revPerHour)}/h × {fmt.dur(Math.max(0, myCtx.horizonMin / 60 - ctx.hoursToLimit))} shut in
          </div>
        </div>
      </div>

      <div className="plan-layout">
        <div className="plan-panel plan-panel-pad">
          <h3 className="plan-panel-title">
            <span className="plan-panel-heading">What-if replay</span>
            <span className="plan-panel-meta">tank level from now until repair</span>
          </h3>
          <div className="plan-chart">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 10, right: 44, bottom: 0, left: -10 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmt.time(v)} tickCount={8} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  labelFormatter={(v) => `${fmt.time(Number(v))} (+${Math.round((Number(v) - now) / 60)} min)`}
                  formatter={(v) => [`${Number(v ?? 0).toFixed(1)}%`]}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine
                  y={limits.warning}
                  stroke="var(--amber)"
                  strokeDasharray="4 4"
                  label={{ value: 'warning', fill: 'var(--amber)', fontSize: 10, position: 'insideTopRight' }}
                />
                <ReferenceLine
                  y={limits.shutdown}
                  stroke="var(--coral)"
                  strokeDasharray="4 4"
                  label={{ value: 'shutdown', fill: 'var(--coral)', fontSize: 10, position: 'insideTopRight' }}
                />
                <ReferenceLine
                  x={repairEnd}
                  stroke="var(--mint)"
                  label={{ value: 'repair', fill: 'var(--mint)', fontSize: 10, position: 'insideTopLeft' }}
                />
                {chartOpts.map((o, j) => (
                  <Line
                    key={o.label}
                    type="linear"
                    dataKey={o.label}
                    stroke={o === nothing && !picked.has(o.label) ? 'var(--ink-3)' : PALETTE[j % PALETTE.length]}
                    strokeWidth={o.label === rec.label ? 3 : 2}
                    dot={false}
                    strokeDasharray={o === nothing && !picked.has(o.label) ? '5 5' : undefined}
                    isAnimationActive
                    animationDuration={700}
                  />
                ))}
                {chartOpts.flatMap((o, j) =>
                  truckArrivals(o.trucks, o.trips, ctx.facility.response_min, ctx.facility.cycle_min)
                    .filter((m) => m < H)
                    .map((m, k) => (
                      <ReferenceDot
                        key={`${o.label}-${k}`}
                        x={now + m * 60}
                        y={traces[j][m]}
                        r={5}
                        fill={PALETTE[j % PALETTE.length]}
                        stroke="var(--bg-1)"
                        strokeWidth={2}
                      />
                    )),
                )}
                {chartOpts.flatMap((o, j) =>
                  o.shutIns.slice(0, 1).map((s) => (
                    <ReferenceDot
                      key={`${o.label}-s`}
                      x={now + s.startMin * 60}
                      y={traces[j][s.startMin]}
                      r={5}
                      fill="var(--bg-1)"
                      stroke={PALETTE[j % PALETTE.length]}
                      strokeWidth={2}
                    />
                  )),
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="plan-legend">
            <span className="plan-legend-item">
              <svg width="12" height="12">
                <circle cx="6" cy="6" r="5" fill="var(--aqua)" />
              </svg>
              truck arrives (−{dataset.ops.emergency_trucking.truck_capacity_bbl} bbl)
            </span>
            <span className="plan-legend-item">
              <svg width="12" height="12">
                <circle cx="6" cy="6" r="4.5" fill="var(--bg-1)" stroke="var(--aqua)" strokeWidth="2" />
              </svg>
              wells shut in
            </span>
            <span className="dim">Tick an option below to overlay it.</span>
          </div>
        </div>

        <div className="plan-side">
          <div className="plan-panel plan-panel-pad">
            <h3 className="plan-panel-title">
              <span className="plan-panel-heading">
                <TruckIcon size={14} /> {sys} fleet
              </span>
              <span className="plan-panel-meta">
                {sp.fleet} trucks · {ctx.facility.response_min} min out · {ctx.facility.cycle_min} min cycle
              </span>
            </h3>
            {Object.keys(sp.plans).length > 1 ? (
              <>
                <p className="plan-fleet-note">
                  {Object.keys(sp.plans).length} tanks in {sys} are filling at once and share these trucks. Total{' '}
                  {fmt.money(sp.totalCost)}.
                </p>
                <div className="plan-fleet-list">
                  {whatIf.ctxs.map((c) => (
                    <Link
                      key={c.event.id}
                      to={`/plan/${c.event.id}`}
                      className={`plan-fleet-row${c.event.id === ctx.event.id ? ' is-active' : ''}`}
                    >
                      <span className="plan-fleet-trucks">
                        {Array.from({ length: sp.fleet }, (_, i) => (
                          <TruckIcon
                            key={i}
                            size={14}
                            color={i < (sp.allocation[c.event.id] ?? 0) ? 'var(--aqua)' : 'var(--ink-3)'}
                          />
                        ))}
                      </span>
                      <span className="plan-fleet-name">{fmt.short(c.facility.id)}</span>
                      <span className="plan-fleet-label">{sp.plans[c.event.id].label}</span>
                      <b className="plan-fleet-cost">{fmt.money(sp.plans[c.event.id].cost)}</b>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <p className="plan-fleet-note">Only this tank is filling in {sys}; all {sp.fleet} trucks are available.</p>
            )}
            <div className="hr" />
            <div className="plan-whatif">
              <WhatIf
                label="Trucks in fleet"
                value={sp.fleet}
                onChange={(d) => setFleetDelta((x) => Math.max(-dataset.ops.systems[sys].emergency_fleet_size, x + d))}
              />
              <WhatIf
                label="Repair time (h)"
                value={dataset.ops.expected_repair_hours.pump_failure + repairDelta}
                onChange={(d) =>
                  setRepairDelta((x) => Math.max(-dataset.ops.expected_repair_hours.pump_failure + 1, x + d))
                }
              />
            </div>
            {(fleetDelta || repairDelta) ? (
              <div className="chip violet plan-whatif-chip">
                What-if:{' '}
                {fleetDelta ? `${fleetDelta > 0 ? '+' : ''}${fleetDelta} trucks ` : ''}
                {repairDelta ? `${repairDelta > 0 ? '+' : ''}${repairDelta}h repair` : ''}
                <button
                  className="btn ghost sm"
                  style={{ padding: '0 6px', marginLeft: 4 }}
                  onClick={() => {
                    setFleetDelta(0);
                    setRepairDelta(0);
                  }}
                >
                  reset
                </button>
              </div>
            ) : null}
          </div>

          <div className="plan-panel plan-panel-pad plan-wells">
            <h3 className="plan-panel-title">
              <span className="plan-panel-heading">
                <Wrench size={14} /> Wells
              </span>
              <span className="plan-panel-meta">cheapest water to turn off first</span>
            </h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Well</th>
                  <th>Water</th>
                  <th>Revenue/h</th>
                  <th>$/bbl</th>
                </tr>
              </thead>
              <tbody>
                {wellRows.map((r) => (
                  <tr key={r.w.id} className="row" style={{ opacity: r.producing ? 1 : 0.45 }}>
                    <td className="mono">
                      {r.w.id.replace(/^S\d+_WELL_/, '')}{' '}
                      {!r.producing && <span className="chip ghost" style={{ fontSize: 10 }}>shut in</span>}
                    </td>
                    <td className="num">{fmt.num(r.w.baseline_water_bpd)}</td>
                    <td className="num">{fmt.money(r.revH)}</td>
                    <td className="num">
                      <b>${r.perBbl.toFixed(2)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="plan-wells-foot">
              Facility {fmt.money(facilityRevPerHour(ctx.facility, dataset.ops))}/h · oil $
              {dataset.ops.prices.oil_per_bbl}/bbl · gas ${dataset.ops.prices.gas_per_mcf}/mcf
            </div>
          </div>
        </div>
      </div>

      <div className="plan-panel plan-options">
        <div className="plan-options-head">
          <h3 className="plan-panel-title" style={{ margin: 0 }}>
            <span className="plan-panel-heading">Every option</span>
            <span className="plan-panel-meta">
              {options.length} plans · {sp.allocation[ctx.event.id] ?? 0} truck
              {(sp.allocation[ctx.event.id] ?? 0) === 1 ? '' : 's'} available · sorted by cost
            </span>
          </h3>
        </div>
        <OptionsTable options={options} rec={rec} picked={picked} toggle={toggle} ctx={myCtx} now={now} />
      </div>
    </div>
  );
}

function WhatIf({ label, value, onChange }: { label: string; value: number; onChange: (d: number) => void }) {
  return (
    <div className="plan-whatif-box">
      <div className="plan-whatif-label">{label}</div>
      <div className="plan-whatif-controls">
        <button className="btn sm" onClick={() => onChange(-1)}>
          −
        </button>
        <span className="plan-whatif-value">{value}</span>
        <button className="btn sm" onClick={() => onChange(1)}>
          +
        </button>
      </div>
    </div>
  );
}

function OptionsTable({
  options,
  rec,
  picked,
  toggle,
  ctx,
  now,
}: {
  options: PlanOption[];
  rec: PlanOption;
  picked: Set<string>;
  toggle: (l: string) => void;
  ctx: FailureContext;
  now: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? options : options.slice(0, 8);
  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>Plan</th>
            <th>Trucks</th>
            <th>Shut-in</th>
            <th>Prevents trip</th>
            <th>Peak</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr
              key={o.label}
              className={`row ${o.label === rec.label ? 'rec' : ''}`}
              onClick={() => toggle(o.label)}
            >
              <td>
                <input
                  type="checkbox"
                  readOnly
                  checked={picked.has(o.label) || (picked.size === 0 && o.label === rec.label)}
                  style={{ accentColor: 'var(--aqua)' }}
                />
              </td>
              <td>
                <div className="plan-option-name">
                  {o.label}{' '}
                  {o.label === rec.label && (
                    <span className="chip aqua" style={{ marginLeft: 6 }}>
                      recommended
                    </span>
                  )}
                </div>
              </td>
              <td className="num">
                {o.trucks
                  ? `${o.trucks} × ${o.trips} · first ${fmt.time(now + ctx.facility.response_min * 60)}`
                  : '-'}
              </td>
              <td className="num">
                {o.shutIns.length
                  ? `${o.shutIns.map((s) => s.well.replace(/^S\d+_WELL_/, '')).join(', ')} @ ${fmt.time(now + o.shutIns[0].startMin * 60)}`
                  : '-'}
              </td>
              <td>
                {o.tripAt == null ? (
                  <span className="chip mint">
                    <Check size={11} /> yes
                  </span>
                ) : (
                  <span className="chip coral">trips {fmt.time(now + o.tripAt * 60)}</span>
                )}
              </td>
              <td className="num">{(Math.floor(o.peakPct * 10) / 10).toFixed(1)}%</td>
              <td className="num">
                <b>{fmt.money(o.cost)}</b>
                <span className="plan-option-cost-break">
                  {o.truckCost ? `${fmt.money(o.truckCost)} trucks` : ''}
                  {o.truckCost && o.shutInCost ? ' + ' : ''}
                  {o.shutInCost ? `${fmt.money(o.shutInCost)} lost production` : ''}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {options.length > 8 && (
        <div className="plan-options-more">
          <button className="btn ghost sm" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Show fewer' : `Show all ${options.length} options`}
          </button>
        </div>
      )}
    </>
  );
}
