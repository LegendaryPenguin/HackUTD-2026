/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Dataset, DetectedEvent, FailureContext, PlanOption, SystemPlan } from '../lib/types';
import { datasetFromFiles, fetchDataset, listDatasets } from '../lib/loader';
import { detectEvents } from '../lib/detector';
import { failureContext, planSystem } from '../lib/planner';
import { facilityRevPerHour } from '../lib/model';
import type { Analysis } from '../lib/summary';
import { buildDispatchedPlan, type DispatchedPlan } from '../lib/dispatch';

interface Store {
  datasets: string[];
  dataset: Dataset | null;
  loading: string | null;
  error: string | null;
  load: (name: string) => void;
  loadFiles: (files: FileList) => void;
  /** "now" used for all analysis (time travel); defaults to last telemetry ts */
  now: number;
  liveNow: number;
  isLive: boolean;
  setNow: (unix: number) => void;
  resetNow: () => void;
  analysis: Analysis | null;
  /** operator-acknowledged events (session only) */
  acked: Set<string>;
  ack: (id: string) => void;
  /** dispatched plans — drive live stats overlay; failures still from telemetry */
  dispatched: Record<string, DispatchedPlan>;
  dispatch: (eventId: string, plan?: PlanOption) => void;
  clearDispatch: (eventId: string) => void;
  /** Preview a plan on the main map timeline (not committed). */
  simulating: { eventId: string; facilityId: string; plan: PlanOption; onsetUnix: number } | null;
  startSimulate: (eventId: string, plan: PlanOption) => void;
  exitSimulate: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<string[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState<string | null>('Looking for datasets…');
  const [error, setError] = useState<string | null>(null);
  const [nowOverride, setNowOverride] = useState<number | null>(null);
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [dispatched, setDispatched] = useState<Record<string, DispatchedPlan>>({});
  const [simulating, setSimulating] = useState<Store['simulating']>(null);
  const reqId = useRef(0);

  const load = useCallback((name: string) => {
    const id = ++reqId.current;
    setError(null);
    setLoading('Loading ' + name + '…');
    localStorage.setItem('avon:dataset', name);
    fetchDataset(name, (m) => id === reqId.current && setLoading(m))
      .then((d) => {
        if (id !== reqId.current) return;
        setDataset(d);
        setNowOverride(null);
        setAcked(new Set());
        setDispatched({});
        setSimulating(null);
        setLoading(null);
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        setError(String(e?.message ?? e));
        setLoading(null);
      });
  }, []);

  const loadFiles = useCallback((files: FileList) => {
    const id = ++reqId.current;
    setError(null);
    setLoading('Reading folder…');
    datasetFromFiles(files, (m) => id === reqId.current && setLoading(m))
      .then((d) => {
        if (id !== reqId.current) return;
        setDataset(d);
        setNowOverride(null);
        setAcked(new Set());
        setDispatched({});
        setSimulating(null);
        setLoading(null);
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        setError(String(e?.message ?? e));
        setLoading(null);
      });
  }, []);

  useEffect(() => {
    listDatasets().then((list) => {
      setDatasets(list);
      const saved = localStorage.getItem('avon:dataset');
      const pick = list.includes(saved ?? '') ? saved! : list.find((x) => x.startsWith('mock_test')) ?? list[0];
      if (pick) load(pick);
      else setLoading(null);
    });
  }, [load]);

  // refresh dataset list periodically so a dropped-in test/ folder appears
  useEffect(() => {
    const t = setInterval(() => listDatasets().then((l) => setDatasets((p) => (JSON.stringify(p) === JSON.stringify(l) ? p : l))), 5000);
    return () => clearInterval(t);
  }, []);

  const liveNow = dataset ? dataset.telemetry.ts[dataset.telemetry.ts.length - 1] : 0;
  const now = nowOverride ?? liveNow;

  const analysis = useMemo<Analysis | null>(() => {
    if (!dataset) return null;
    const events = detectEvents(dataset, now);
    const ongoing = events.filter((e) => e.status === 'ongoing');
    const failures: FailureContext[] = ongoing
      .filter((e) => e.category === 'pump_failure')
      .map((e) => failureContext(e, dataset, now));
    const bySys: Record<string, FailureContext[]> = {};
    for (const c of failures) (bySys[c.facility.system] ||= []).push(c);
    const systemPlans: Record<string, SystemPlan> = {};
    for (const [sys, ctxs] of Object.entries(bySys)) systemPlans[sys] = planSystem(ctxs, dataset);
    const orderedFailures = [...failures].sort((a, b) => {
      const ha = isFinite(a.hoursToLimit) ? a.hoursToLimit : 1e9;
      const hb = isFinite(b.hoursToLimit) ? b.hoursToLimit : 1e9;
      if (ha !== hb) return ha - hb;
      return facilityRevPerHour(b.facility, dataset.ops) - facilityRevPerHour(a.facility, dataset.ops);
    });
    return { now, events, ongoing, failures, systemPlans, orderedFailures };
  }, [dataset, now]);

  const dispatch = useCallback((eventId: string, plan?: PlanOption) => {
    if (!dataset) return;
    const events = detectEvents(dataset, now);
    const e = events.find((x) => x.id === eventId);
    if (!e || e.category !== 'pump_failure') return;
    const sysPlan = planSystem(
      events.filter((x) => x.status === 'ongoing' && x.category === 'pump_failure' && x.system === e.system)
        .map((x) => failureContext(x, dataset, now)),
      dataset,
    );
    const chosen = plan ?? sysPlan.plans[eventId];
    if (!chosen) return;
    const commitAt = simulating?.eventId === eventId ? simulating.onsetUnix : now;
    const commitCtx = failureContext(e, dataset, commitAt);
    setDispatched((d) => ({
      ...d,
      [eventId]: buildDispatchedPlan(commitCtx, dataset, { ...chosen, label: chosen.label }, commitAt),
    }));
    setSimulating(null);
  }, [dataset, now, simulating]);

  const startSimulate = useCallback((eventId: string, plan: PlanOption) => {
    if (!dataset) return;
    const events = detectEvents(dataset, liveNow);
    const e = events.find((x) => x.id === eventId) ?? detectEvents(dataset, now).find((x) => x.id === eventId);
    if (!e) return;
    const onset = e.onset + 300;
    setNowOverride(Math.min(onset, liveNow));
    setSimulating({ eventId, facilityId: e.facility, plan, onsetUnix: onset });
  }, [dataset, liveNow, now]);

  const exitSimulate = useCallback(() => {
    setSimulating(null);
  }, []);

  const value: Store = {
    datasets, dataset, loading, error, load, loadFiles,
    now, liveNow, isLive: nowOverride == null && !simulating,
    setNow: (u) => setNowOverride(u >= liveNow ? null : u),
    resetNow: () => { setNowOverride(null); },
    analysis,
    acked, ack: (id) => setAcked((s) => new Set(s).add(id)),
    dispatched,
    dispatch,
    clearDispatch: (id) => setDispatched((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    }),
    simulating,
    startSimulate,
    exitSimulate,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export function useEventById(id?: string): DetectedEvent | undefined {
  const { analysis } = useStore();
  return analysis?.events.find((e) => e.id === id);
}
