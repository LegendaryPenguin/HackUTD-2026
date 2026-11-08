import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Download } from 'lucide-react';
import { useStore } from '../state/store';
import { facilities, fmt, indexAt, valueAt, CATEGORY_LABEL } from '../lib/model';
import { downloadDecisionsCsv } from '../lib/decisionsExport';
import type { Dataset, FacilityCtx } from '../lib/types';
import { catHex } from '../components/ui';
import { mapArt, mapBackgrounds, wellBadge } from '../components/MapMarkers';
import { FillingScene, LeakScene, WearScene, WellsScene } from '../components/trends/TrendScene';

type Mode = 'tank' | 'leak' | 'pump' | 'wells';

const MODES: { id: Mode; name: string; blurb: string; art: keyof typeof mapArt; tone: string }[] = [
  { id: 'tank', name: 'Filling', blurb: 'Tank level %', art: 'tank', tone: 'aqua' },
  { id: 'leak', name: 'Leak', blurb: 'Send vs receive', art: 'disposal', tone: 'amber' },
  { id: 'pump', name: 'Wear', blurb: 'Flow vs max', art: 'well', tone: 'violet' },
  { id: 'wells', name: 'Wells', blurb: 'Water by well', art: 'well', tone: 'mint' },
];

const WINDOWS = [
  { l: '6h', s: 6 * 3600 },
  { l: '24h', s: 24 * 3600 },
  { l: '3d', s: 72 * 3600 },
  { l: 'Week', s: 8 * 86400 },
];

function seriesKeysFor(mode: Mode, f: FacilityCtx) {
  if (mode === 'tank') return [`${f.tank.id}|level_pct`, `${f.id}|inflow_bpd`, `${f.pump.id}|status`];
  if (mode === 'leak') return [`${f.pump.id}|flow_bpd`, `${f.pipeline.id}|receive_flow_bpd`, `${f.pipeline.id}|pressure_psi`];
  if (mode === 'pump') return [`${f.pump.id}|flow_bpd`, `${f.pump.id}|discharge_psi`, `${f.pump.id}|status`];
  return [`${f.id}|inflow_bpd`];
}

function buildRows(
  dataset: Dataset,
  f: FacilityCtx,
  mode: Mode,
  now: number,
  winSec: number,
  center: number | null,
) {
  const t = dataset.telemetry;
  const end = center != null ? Math.min(now, center + winSec / 2) : now;
  const start = end - winSec;
  const i0 = Math.max(0, indexAt(t, start));
  const i1 = indexAt(t, end);
  const step = Math.max(1, Math.floor((i1 - i0) / 480));
  const keys = seriesKeysFor(mode, f);
  const maxFlow = f.pump.max_flow_bpd || 1;
  const rows: Record<string, number>[] = [];
  for (let i = i0; i <= i1; i += step) {
    const row: Record<string, number> = { t: t.ts[i] };
    for (const k of keys) {
      const s = t.series.get(k);
      if (s) row[k] = s[i];
    }
    if (mode === 'pump') {
      const flow = t.series.get(`${f.pump.id}|flow_bpd`)?.[i] ?? 0;
      row.ratio = flow / maxFlow;
    }
    if (mode === 'leak') {
      const send = t.series.get(`${f.pump.id}|flow_bpd`)?.[i] ?? 0;
      const recv = t.series.get(`${f.pipeline.id}|receive_flow_bpd`)?.[i] ?? 0;
      row.loss = Math.max(0, send - recv);
    }
    rows.push(row);
  }
  return rows;
}

export default function Trends() {
  const { dataset, analysis, now, setNow, dispatched } = useStore();
  const [params, setParams] = useSearchParams();
  const facs = useMemo(() => (dataset ? facilities(dataset.network, dataset.ops) : []), [dataset]);
  const mode = ((params.get('preset') as Mode) in { tank: 1, leak: 1, pump: 1, wells: 1 }
    ? (params.get('preset') as Mode)
    : 'tank');
  const focusId = params.get('f');
  const [win, setWin] = useState(1);
  const panelRefs = useRef<Record<string, HTMLElement | null>>({});
  const decisionCount = Object.keys(dispatched).length;

  useEffect(() => {
    if (!focusId) return;
    const el = panelRefs.current[focusId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusId, mode, facs.length]);

  if (!dataset || !analysis) return null;

  const limits = dataset.network.defaults.tank_limits_pct;
  const center = params.get('t') ? +params.get('t')! : null;
  const setMode = (m: Mode) => {
    const p = new URLSearchParams();
    p.set('preset', m);
    if (focusId) p.set('f', focusId);
    if (center != null) p.set('t', String(center));
    setParams(p);
  };

  return (
    <div className="trends-page">
      <div className="trends-sky" aria-hidden>
        <img src={mapBackgrounds.moonlit} alt="" />
        <div className="trends-sky-wash" />
        <div className="trends-sky-aurora" />
      </div>

      <header className="trends-chrome">
        <div className="trends-chrome-top">
          <h1 className="trends-title">Trends</h1>
          <div className="trends-chrome-tools">
            <div className="seg">
              {WINDOWS.map((w, i) => (
                <button key={w.l} type="button" className={win === i ? 'on' : ''} onClick={() => setWin(i)}>{w.l}</button>
              ))}
            </div>
            <button
              type="button"
              className="btn sm"
              title="Export week events, decisions, and impacts as CSV"
              onClick={() => downloadDecisionsCsv(dataset, analysis, dispatched)}
            >
              <Download size={14} /> decisions.csv
              {decisionCount > 0 ? ` · ${decisionCount}` : ''}
            </button>
          </div>
        </div>

        <div className="trend-mode-row">
          {MODES.map((m) => (
            <motion.button
              key={m.id}
              type="button"
              className={`trend-mode-card ${m.tone} ${mode === m.id ? 'on' : ''}`}
              onClick={() => setMode(m.id)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <img src={mapArt[m.art]} alt="" />
              <div>
                <b>{m.name}</b>
                <span>{m.blurb}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </header>

      <div className="trends-scroll">
        {facs.map((f) => {
          const data = buildRows(dataset, f, mode, now, WINDOWS[win].s, center);
          const t0 = data[0]?.t ?? now;
          const t1 = data[data.length - 1]?.t ?? now;
          const evs = analysis.events.filter((e) => e.facility === f.id && e.onset <= t1 && (e.end ?? now) >= t0);
          const levelNow = valueAt(dataset.telemetry, f.tank.id, 'level_pct', now);
          const sendNow = valueAt(dataset.telemetry, f.pump.id, 'flow_bpd', now);
          const recvNow = valueAt(dataset.telemetry, f.pipeline.id, 'receive_flow_bpd', now);
          const lossNow = Math.max(0, sendNow - recvNow);
          const ratioNow = f.pump.max_flow_bpd > 0 ? sendNow / f.pump.max_flow_bpd : 1;
          const wellCards = f.wells.map((w) => {
            const water = valueAt(dataset.telemetry, w.id, 'water_bpd', now);
            const st = valueAt(dataset.telemetry, w.id, 'status', now);
            return {
              id: w.id,
              label: fmt.short(w.id),
              badge: wellBadge(w.id),
              water: Number.isFinite(water) ? water : w.baseline_water_bpd,
              max: Math.max(...f.wells.map((x) => x.baseline_water_bpd), 1),
              on: st === 1,
            };
          });
          const online = wellCards.filter((w) => w.on).length;
          const level = Number.isFinite(levelNow) ? levelNow : 0;
          const loss = Number.isFinite(lossNow) ? lossNow : 0;
          const ratio = Number.isFinite(ratioNow) ? ratioNow : 1;

          let summary = '';
          if (mode === 'tank') {
            summary = level >= limits.shutdown
              ? `Tank is at ${level.toFixed(0)}%, at or above the 92% shutdown line.`
              : level >= limits.warning
                ? `Tank is at ${level.toFixed(0)}%, past the 85% warning line, heading toward 92% shutdown.`
                : `Tank is at ${level.toFixed(0)}%, below the 85% warning line.`;
          } else if (mode === 'leak') {
            summary = loss > 20
              ? `About ${fmt.num(loss)} bpd is missing between pump send and disposal receive.`
              : `Send and receive are roughly matched (${fmt.num(loss)} bpd gap).`;
          } else if (mode === 'pump') {
            summary = `Pump is running at ${(ratio * 100).toFixed(0)}% of nameplate max flow.`;
          } else {
            summary = `${online} of ${wellCards.length} wells online, dumping water into the tank.`;
          }

          return (
            <article
              key={f.id}
              className={`trends-facility ${focusId === f.id ? 'focus' : ''}`}
              ref={(el) => { panelRefs.current[f.id] = el; }}
              id={`trend-${f.id}`}
            >
              <div className="trends-facility-head">
                <div>
                  <h2 className="trends-facility-title">{fmt.short(f.id)}</h2>
                  <p className="trends-facility-meta">{f.system} · {f.wells.length} wells</p>
                </div>
                <div className="trends-facility-actions">
                  {evs.slice(0, 2).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="chip ghost"
                      style={{ color: catHex[e.category], cursor: 'pointer' }}
                      onClick={() => setNow(Math.min(now, e.onset + 300))}
                    >
                      <i className="dot" style={{ background: catHex[e.category] }} />
                      {CATEGORY_LABEL[e.category]}
                    </button>
                  ))}
                  <Link to={`/?f=${encodeURIComponent(f.id)}`} className="btn sm ghost">
                    Map <ArrowRight size={13} />
                  </Link>
                </div>
              </div>

              <div className="trends-stage">
                {mode === 'tank' && (
                  <FillingScene
                    data={data}
                    events={evs}
                    now={now}
                    t0={t0}
                    t1={t1}
                    winLabel={WINDOWS[win].l}
                    facilityLabel={fmt.short(f.id)}
                    levelKey={`${f.tank.id}|level_pct`}
                    warn={limits.warning}
                    shut={limits.shutdown}
                    levelNow={level}
                    summary={summary}
                    onJump={setNow}
                  />
                )}
                {mode === 'leak' && (
                  <LeakScene
                    data={data}
                    events={evs}
                    now={now}
                    t0={t0}
                    t1={t1}
                    winLabel={WINDOWS[win].l}
                    facilityLabel={fmt.short(f.id)}
                    sendKey={`${f.pump.id}|flow_bpd`}
                    recvKey={`${f.pipeline.id}|receive_flow_bpd`}
                    psiKey={`${f.pipeline.id}|pressure_psi`}
                    lossNow={loss}
                    summary={summary}
                    onJump={setNow}
                  />
                )}
                {mode === 'pump' && (
                  <WearScene
                    data={data.map((r) => ({ ...r, ratio: r.ratio ?? 0 }))}
                    events={evs}
                    now={now}
                    t0={t0}
                    t1={t1}
                    winLabel={WINDOWS[win].l}
                    facilityLabel={fmt.short(f.id)}
                    ratioKey="ratio"
                    flowKey={`${f.pump.id}|flow_bpd`}
                    ratioNow={ratio}
                    summary={summary}
                    onJump={setNow}
                  />
                )}
                {mode === 'wells' && (
                  <WellsScene wells={wellCards} facilityLabel={fmt.short(f.id)} summary={summary} />
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
