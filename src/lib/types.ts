// ---------- network.json ----------
export interface Well {
  id: string;
  baseline_water_bpd: number;
  oil_bpd: number;
  gas_mcfd: number;
}
export interface Tank { id: string; capacity_bbl: number }
export interface Pump {
  id: string;
  max_flow_bpd: number;
  start_level_pct: number;
  stop_level_pct: number;
}
export interface Pipeline { id: string; max_bpd: number; max_pressure_psi: number }
export interface Facility {
  id: string;
  lat: number;
  lon: number;
  wells: Well[];
  tank: Tank;
  pump: Pump;
  pipeline: Pipeline;
}
export interface DisposalSite { id: string; lat: number; lon: number; pressure_psi: number }
export interface System {
  id: string;
  center: [number, number];
  truck_yard: [number, number];
  disposal_site: DisposalSite;
  facilities: Facility[];
}
export interface Network {
  meta?: unknown;
  defaults: { tank_limits_pct: { warning: number; shutdown: number } };
  systems: System[];
}

// ---------- ops.json ----------
export interface Ops {
  dataset_id?: string;
  prices: { oil_per_bbl: number; gas_per_mcf: number };
  expected_repair_hours: { pump_failure: number };
  emergency_trucking: { truck_capacity_bbl: number; cost_per_trip: number };
  systems: Record<
    string,
    {
      emergency_fleet_size: number;
      facilities: Record<string, { response_min: number; cycle_min: number }>;
    }
  >;
}

// ---------- telemetry (wide) ----------
export interface Telemetry {
  /** unix seconds, ascending, 5-min grid */
  ts: Int32Array;
  /** key = `${asset_id}|${metric}` */
  series: Map<string, Float32Array>;
  /** asset_id -> metrics */
  metrics: Map<string, string[]>;
}

export interface Dataset {
  name: string;
  network: Network;
  ops: Ops;
  telemetry: Telemetry;
}

// ---------- flattened model ----------
export interface FacilityCtx extends Facility {
  system: string;
  disposal_psi: number;
  response_min: number;
  cycle_min: number;
}

// ---------- events ----------
export type Category = 'pump_failure' | 'pipeline_leak' | 'pump_degradation';

export interface DetectedEvent {
  id: string;
  system: string;
  facility: string;
  asset: string;
  category: Category;
  status: 'ongoing' | 'resolved';
  /** estimated onset (unix s) */
  onset: number;
  /** when the detector first saw it (unix s) */
  detected: number;
  /** window of uncertainty for onset [lo, hi] */
  onsetWindow: [number, number];
  end: number | null;
  confidence: number;
  evidence: string[];
  /** pump failure only */
  levelAtOnset?: number;
}

// ---------- plans ----------
export interface ShutIn { well: string; startMin: number }
export interface PlanOption {
  cost: number;
  truckCost: number;
  shutInCost: number;
  trucks: number;
  trips: number;
  shutIns: ShutIn[];
  /** minute (from plan start) the tank trips, or null */
  tripAt: number | null;
  peakPct: number;
  label: string;
  recommended?: boolean;
}

export interface FailureContext {
  event: DetectedEvent;
  facility: FacilityCtx;
  levelPct: number;
  volumeBbl: number;
  inflowBpd: number;
  producingWells: string[];
  /** minutes of repair remaining from "now" */
  horizonMin: number;
  hoursToLimit: number;
  tripsAtUnix: number | null;
  revPerHour: number;
  doNothingCost: number;
}

export interface SystemPlan {
  system: string;
  fleet: number;
  totalCost: number;
  allocation: Record<string, number>;
  plans: Record<string, PlanOption>;
  options: Record<string, PlanOption[]>;
}
