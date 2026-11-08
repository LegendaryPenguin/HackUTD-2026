import type { Dataset, DetectedEvent, FacilityCtx } from './types';
import { indexAt } from './model';

export type FacStatus = 'failure' | 'leak' | 'wear' | 'warning' | 'normal';

export const statusColor: Record<FacStatus, string> = {
  failure: 'var(--coral)',
  leak: 'var(--amber)',
  wear: 'var(--violet)',
  warning: 'var(--amber)',
  normal: 'var(--aqua)',
};
export const statusLabel: Record<FacStatus, string> = {
  failure: 'Pump failed',
  leak: 'Pipeline leak',
  wear: 'Pump wearing out',
  warning: 'Tank above warning',
  normal: 'Normal',
};

export interface LiveFacility {
  f: FacilityCtx;
  status: FacStatus;
  level: number;
  pumpStatus: number;
  pumpFlow: number;
  inflow: number;
  recv: number;
  discharge: number;
  pipePsi: number;
  wells: { id: string; status: number; water: number }[];
  events: DetectedEvent[];
}

export function liveFacility(ds: Dataset, f: FacilityCtx, now: number, ongoing: DetectedEvent[]): LiveFacility {
  const t = ds.telemetry;
  const i = indexAt(t, now);
  const g = (k: string) => t.series.get(k)?.[i] ?? NaN;
  const level = g(`${f.tank.id}|level_pct`);
  const evs = ongoing.filter((e) => e.facility === f.id);
  const warn = ds.network.defaults.tank_limits_pct.warning;
  let status: FacStatus = 'normal';
  if (evs.some((e) => e.category === 'pump_failure')) status = 'failure';
  else if (evs.some((e) => e.category === 'pipeline_leak')) status = 'leak';
  else if (evs.some((e) => e.category === 'pump_degradation')) status = 'wear';
  else if (level >= warn) status = 'warning';
  return {
    f, status, level,
    pumpStatus: g(`${f.pump.id}|status`),
    pumpFlow: g(`${f.pump.id}|flow_bpd`),
    inflow: g(`${f.id}|inflow_bpd`),
    recv: g(`${f.pipeline.id}|receive_flow_bpd`),
    discharge: g(`${f.pump.id}|discharge_psi`),
    pipePsi: g(`${f.pipeline.id}|pressure_psi`),
    wells: f.wells.map((w) => ({ id: w.id, status: g(`${w.id}|status`), water: g(`${w.id}|water_bpd`) })),
    events: evs,
  };
}
