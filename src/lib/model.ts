import type { Dataset, FacilityCtx, Network, Ops, Telemetry, Well } from './types';

export function facilities(network: Network, ops: Ops): FacilityCtx[] {
  const out: FacilityCtx[] = [];
  for (const s of network.systems) {
    for (const f of s.facilities) {
      const o = ops.systems[s.id]?.facilities[f.id] ?? { response_min: 0, cycle_min: 0 };
      out.push({ ...f, system: s.id, disposal_psi: s.disposal_site.pressure_psi, ...o });
    }
  }
  return out;
}

export function facilityMap(network: Network, ops: Ops): Map<string, FacilityCtx> {
  return new Map(facilities(network, ops).map((f) => [f.id, f]));
}

export function wellRevPerHour(w: Well, ops: Ops): number {
  return (w.oil_bpd * ops.prices.oil_per_bbl + w.gas_mcfd * ops.prices.gas_per_mcf) / 24;
}

export function facilityRevPerHour(f: FacilityCtx, ops: Ops, wells?: string[]): number {
  return f.wells.filter((w) => !wells || wells.includes(w.id)).reduce((a, w) => a + wellRevPerHour(w, ops), 0);
}

/** hours until the tank reaches `limitPct` at the given inflow; Infinity if inflow <= 0 */
export function hoursToLimit(levelPct: number, capacity: number, inflowBpd: number, limitPct: number): number {
  if (inflowBpd <= 0) return Infinity;
  return (((limitPct - levelPct) / 100) * capacity) / (inflowBpd / 24);
}

export function series(t: Telemetry, asset: string, metric: string): Float32Array | undefined {
  return t.series.get(`${asset}|${metric}`);
}

/** index of the last timestamp <= unix */
export function indexAt(t: Telemetry, unix: number): number {
  const ts = t.ts;
  let lo = 0,
    hi = ts.length - 1;
  if (unix >= ts[hi]) return hi;
  if (unix < ts[0]) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ts[mid] <= unix) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function valueAt(t: Telemetry, asset: string, metric: string, unix: number): number {
  const s = series(t, asset, metric);
  if (!s) return NaN;
  return s[indexAt(t, unix)];
}

export const fmt = {
  time(unix: number): string {
    const d = new Date(unix * 1000);
    return d.toISOString().slice(11, 16);
  },
  dayTime(unix: number): string {
    const d = new Date(unix * 1000);
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    return `${day} ${d.toISOString().slice(5, 10).replace('-', '/')} ${d.toISOString().slice(11, 16)}`;
  },
  date(unix: number): string {
    const d = new Date(unix * 1000);
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    return `${day}, ${mon} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
  },
  iso(unix: number): string {
    return new Date(unix * 1000).toISOString().replace('.000Z', 'Z');
  },
  money(v: number): string {
    return '$' + Math.round(v).toLocaleString('en-US');
  },
  dur(hours: number): string {
    if (!isFinite(hours)) return '—';
    if (hours < 0) hours = 0;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m}m`;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  },
  durMin(min: number): string {
    return fmt.dur(min / 60);
  },
  pct(v: number, d = 1): string {
    return `${v.toFixed(d)}%`;
  },
  num(v: number, d = 0): string {
    return v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  },
  short(id: string): string {
    // S2_FACILITY_B -> Facility B ; S2_WELL_A1 -> Well A1 ; S2_PUMP_C -> Pump C
    const m = id.match(/^S\d+_([A-Z]+)_([A-Z0-9]+)$/);
    if (!m) return id;
    const kind = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    return `${kind} ${m[2]}`;
  },
  sys(id: string): string {
    const m = id.match(/^(S\d+)_/);
    return m ? m[1] : id;
  },
};

export const CATEGORY_LABEL: Record<string, string> = {
  pump_failure: 'Pump failure',
  pipeline_leak: 'Pipeline leak',
  pump_degradation: 'Pump wearing out',
};

export function nowOf(d: Dataset): number {
  return d.telemetry.ts[d.telemetry.ts.length - 1];
}
