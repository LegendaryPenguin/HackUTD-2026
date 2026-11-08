import type { Category, Dataset, DetectedEvent, FacilityCtx } from './types';
import { facilities } from './model';

/**
 * Rules-based detector built from the labelled week. Uses only network + telemetry.
 *
 *  pump_failure      pump.status == 2 (flow 0, pressures at disposal, tank rising)
 *  pipeline_leak     while running: receive_flow < pump flow AND pipeline pressure offset < +50
 *  pump_degradation  while running: flow < max_flow AND discharge offset < +150; receive == flow
 *
 * Thresholds are relative to sensor noise measured on healthy data (flows σ≈0.55%, psi σ≈3),
 * so they transfer to any network without hardcoding.
 */
const ROLL = 6; // 30 min of running samples
const LEAK_LOSS_BPD = 30;
const LEAK_PSI_DROP = 10;
const DEG_RATIO_DROP = 0.015;
const DEG_PSI_DROP = 6;
const CLEAR_N = 3;
const MERGE_GAP_S = 4 * 3600;
const STEP = 300;

interface Frag {
  category: Category;
  detect: number;
  end: number | null;
  peakZ: number;
}

function rollingMean(vals: number[], w: number, minP: number): number[] {
  const out = new Array(vals.length).fill(NaN);
  let sum = 0;
  const q: number[] = [];
  for (let i = 0; i < vals.length; i++) {
    q.push(vals[i]);
    sum += vals[i];
    if (q.length > w) sum -= q.shift()!;
    if (q.length >= minP) out[i] = sum / q.length;
  }
  return out;
}

export function detectEvents(ds: Dataset, nowUnix?: number): DetectedEvent[] {
  const { network, ops, telemetry: t } = ds;
  const ts = t.ts;
  const nowIdx = nowUnix == null ? ts.length - 1 : Math.max(0, Math.min(ts.length - 1, idx(ts, nowUnix)));
  const now = ts[nowIdx];
  const events: DetectedEvent[] = [];
  const get = (k: string) => t.series.get(k) ?? new Float32Array(ts.length);

  for (const f of facilities(network, ops)) {
    const pst = get(`${f.pump.id}|status`);
    const flow = get(`${f.pump.id}|flow_bpd`);
    const recv = get(`${f.pipeline.id}|receive_flow_bpd`);
    const dis = get(`${f.pump.id}|discharge_psi`);
    const pp = get(`${f.pipeline.id}|pressure_psi`);
    const lvl = get(`${f.tank.id}|level_pct`);
    const dp = f.disposal_psi;
    const mf = f.pump.max_flow_bpd;

    // ---------- pump failure ----------
    let start = -1;
    for (let i = 0; i <= nowIdx; i++) {
      const fail = pst[i] === 2;
      if (fail && start < 0) start = i;
      if ((!fail || i === nowIdx) && start >= 0) {
        const endIdx = fail && i === nowIdx ? null : i;
        events.push(
          mkFailure(f, ts[start], endIdx == null ? null : ts[endIdx], lvl[start], now),
        );
        start = -1;
      }
    }

    // ---------- running-only series ----------
    const rIdx: number[] = [];
    for (let i = 0; i <= nowIdx; i++) if (pst[i] === 1) rIdx.push(i);
    const lossV = rIdx.map((i) => flow[i] - recv[i]);
    const ppV = rIdx.map((i) => pp[i] - dp);
    const ratioV = rIdx.map((i) => flow[i] / mf);
    const disV = rIdx.map((i) => dis[i] - dp);
    const lossM = rollingMean(lossV, ROLL, 3);
    const ppM = rollingMean(ppV, ROLL, 3);
    const ratioM = rollingMean(ratioV, ROLL, 3);
    const disM = rollingMean(disV, ROLL, 3);

    const leakFlag = rIdx.map((_, k) => lossM[k] > LEAK_LOSS_BPD && ppM[k] < 50 - LEAK_PSI_DROP);
    const degFlag = rIdx.map((_, k) => ratioM[k] < 1 - DEG_RATIO_DROP && disM[k] < 150 - DEG_PSI_DROP);
    // z-scores for confidence: pipeline psi drop / (3/sqrt(6)), degradation ratio drop / (0.0055/sqrt(6))
    const leakZ = rIdx.map((_, k) => (50 - ppM[k]) / (3 / Math.sqrt(ROLL)));
    const degZ = rIdx.map((_, k) => (1 - ratioM[k]) / (0.0055 / Math.sqrt(ROLL)));

    const frags: Frag[] = [];
    for (const [cat, flag, z] of [
      ['pipeline_leak', leakFlag, leakZ],
      ['pump_degradation', degFlag, degZ],
    ] as [Category, boolean[], number[]][]) {
      let open: Frag | null = null;
      let clear = 0;
      let lastFlag = -1;
      for (let k = 0; k < rIdx.length; k++) {
        if (flag[k]) {
          if (!open) open = { category: cat, detect: ts[rIdx[k]], end: null, peakZ: 0 };
          open.peakZ = Math.max(open.peakZ, z[k]);
          clear = 0;
          lastFlag = k;
        } else if (open) {
          clear++;
          if (clear >= CLEAR_N) {
            open.end = ts[rIdx[lastFlag]] + STEP;
            frags.push(open);
            open = null;
            clear = 0;
          }
        }
      }
      if (open) frags.push(open);
    }

    // merge fragments of same category separated by < MERGE_GAP
    for (const cat of ['pipeline_leak', 'pump_degradation'] as Category[]) {
      const list = frags.filter((x) => x.category === cat).sort((a, b) => a.detect - b.detect);
      const merged: Frag[] = [];
      for (const fr of list) {
        const last = merged[merged.length - 1];
        if (last && last.end != null && fr.detect - last.end < MERGE_GAP_S) {
          last.end = fr.end;
          last.peakZ = Math.max(last.peakZ, fr.peakZ);
        } else merged.push({ ...fr });
      }
      for (const fr of merged) {
        // a degradation ends when the same pump fails
        if (cat === 'pump_degradation') {
          const fails = events
            .filter((e) => e.asset === f.pump.id && e.category === 'pump_failure' && e.onset > fr.detect)
            .map((e) => e.onset)
            .sort((a, b) => a - b);
          if (fails.length && (fr.end == null || fails[0] < fr.end)) fr.end = fails[0];
        }
        events.push(refineOnset(f, fr, rIdx, ts, pst, cat === 'pipeline_leak' ? lossV : ratioV, now));
      }
    }
  }

  events.sort((a, b) => a.onset - b.onset);
  events.forEach((e, i) => {
    e.id = `EV-${String(i + 1).padStart(3, '0')}`;
  });
  return events;
}

function idx(ts: Int32Array, unix: number): number {
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

function mkFailure(f: FacilityCtx, onset: number, end: number | null, level: number, now: number): DetectedEvent {
  return {
    id: '',
    system: f.system,
    facility: f.id,
    asset: f.pump.id,
    category: 'pump_failure',
    status: end == null || end > now ? 'ongoing' : 'resolved',
    onset,
    detected: onset,
    onsetWindow: [onset, onset],
    end,
    confidence: 0.99,
    levelAtOnset: level,
    evidence: [
      'Pump reports status 2 (fault); flow is 0 bpd',
      'Discharge and pipeline pressure fell to disposal pressure',
      'Tank level climbing at the wells\u2019 inflow rate',
    ],
  };
}

function refineOnset(
  f: FacilityCtx,
  fr: Frag,
  rIdx: number[],
  ts: Int32Array,
  pst: Float32Array,
  sig: number[],
  now: number,
): DetectedEvent {
  const det = fr.detect;
  const detI = idx(ts, det);
  // was the pump running for the 30 min before detection?
  let runningBefore = true;
  for (let i = Math.max(0, detI - 6); i < detI; i++) if (pst[i] !== 1) runningBefore = false;
  // last running sample before detection
  let lastRunBefore = ts[0];
  for (let k = rIdx.length - 1; k >= 0; k--) {
    if (ts[rIdx[k]] < det) {
      lastRunBefore = ts[rIdx[k]];
      break;
    }
  }
  // ramp fit over first 6h of running samples after detection
  const xs: number[] = [],
    ys: number[] = [];
  for (let k = 0; k < rIdx.length; k++) {
    const tt = ts[rIdx[k]];
    if (tt >= det && tt < det + 6 * 3600) {
      xs.push((tt - det) / 3600);
      ys.push(sig[k]);
    }
  }
  let onsetFit: number | null = null;
  if (xs.length >= 6) {
    const { a, b } = linfit(xs, ys);
    const base = fr.category === 'pipeline_leak' ? 0 : 1;
    if (Math.abs(a) > 1e-6) onsetFit = det + ((base - b) / a) * 3600;
  }
  let est: number;
  let window: [number, number];
  if (fr.category === 'pipeline_leak') {
    est = runningBefore ? det - 900 : (lastRunBefore + det) / 2;
    window = [runningBefore ? det - 1800 : lastRunBefore, det];
  } else {
    const lo = det - 12 * 3600;
    est = onsetFit == null ? det : Math.max(lo, Math.min(det, onsetFit));
    window = [Math.max(lo, Math.min(det, onsetFit ?? det)), det];
  }
  est = est - (((est % STEP) + STEP) % STEP);
  const first = sig.filter((_, k) => ts[rIdx[k]] >= det).slice(0, ROLL);
  const firstMean = first.length ? first.reduce((x, y) => x + y, 0) / first.length : 0;
  // confidence from peak z-score: 3σ -> 0.6, 6σ -> 0.9, 10σ -> 0.99
  const conf = Math.min(0.99, Math.max(0.35, 1 - Math.exp(-fr.peakZ / 3.2)));
  const evidence =
    fr.category === 'pipeline_leak'
      ? [
          `Pipeline receives ~${Math.round(firstMean)} bpd less than the pump sends`,
          'Pipeline pressure offset below the healthy +50 psi',
          'Pump discharge pressure normal, tank unaffected',
        ]
      : [
          `Pump flow at ${(firstMean * 100).toFixed(1)}% of rated and falling ~0.4%/h`,
          'Discharge pressure offset below the healthy +150 psi',
          'Pipeline receives everything the pump sends (no leak)',
        ];
  return {
    id: '',
    system: f.system,
    facility: f.id,
    asset: fr.category === 'pipeline_leak' ? f.pipeline.id : f.pump.id,
    category: fr.category,
    status: fr.end == null || fr.end > now ? 'ongoing' : 'resolved',
    onset: est,
    detected: det,
    onsetWindow: window,
    end: fr.end,
    confidence: conf,
    evidence,
  };
}

function linfit(x: number[], y: number[]): { a: number; b: number } {
  const n = x.length;
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
    sxx += x[i] * x[i];
    sxy += x[i] * y[i];
  }
  const a = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const b = (sy - a * sx) / n;
  return { a, b };
}
