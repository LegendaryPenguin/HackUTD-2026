import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useStore } from '../state/store';
import { facilities, fmt, indexAt, valueAt, CATEGORY_LABEL } from '../lib/model';
import type { FacilityCtx } from '../lib/types';
import { catHex, Confidence } from '../components/ui';
import { mapArt, mapBackgrounds, wellBadge } from '../components/MapMarkers';
import { FillingScene, LeakScene, WearScene, WellsScene } from '../components/trends/TrendScene';

type Mode = 'tank' | 'leak' | 'pump' | 'wells';

const MODES: { id: Mode; name: string; blurb: string; art: keyof typeof mapArt; tone: string }[] = [
  { id: 'tank', name: 'Filling', blurb: 'Tank race to 92%', art: 'tank', tone: 'aqua' },
  { id: 'leak', name: 'Leak', blurb: 'Send vs disposal', art: 'disposal', tone: 'amber' },
  { id: 'pump', name: 'Wear', blurb: 'Pump getting tired', art: 'well', tone: 'violet' },
  { id: 'wells', name: 'Wells', blurb: 'Who’s dumping water', art: 'well', tone: 'mint' },
];

const WINDOWS = [
  { l: '6h', s: 6 * 3600 },
  { l: '24h', s: 24 * 3600 },
  { l: '3d', s: 72 * 3600 },
  { l: 'Week', s: 8 * 86400 },
];

function keysFor(mode: Mode, f: FacilityCtx) {
  if (mode === 'tank') return { level: `${f.tank.id}|level_pct`, inflow: `${f.id}|inflow_bpd`, status: `${f.pump.id}|status` };
  if (mode === 'leak') return { send: `${f.pump.id}|flow_bpd`, recv: `${f.pipeline.id}|receive_flow_bpd`, psi: `${f.pipeline.id}|pressure_psi` };
  if (mode === 'pump') return { flow: `${f.pump.id}|flow_bpd`, discharge: `${f.pump.id}|discharge_psi`, status: `${f.pump.id}|status` };
  return { inflow: `${f.id}|inflow_bpd` };
}

export default function Trends() {
  const { dataset, analysis, now, setNow } = useStore();
  const [params, setParams] = useSearchParams();
  const facs = useMemo(() => (dataset ? facilities(dataset.network, dataset.ops) : []), [dataset]);
  const fid = params.get('f') ?? facs[0]?.id;
  const mode = ((params.get('preset') as Mode) in { tank: 1, leak: 1, pump: 1, wells: 1 }
    ? (params.get('preset') as Mode)
    : 'tank');
  const [win, setWin] = useState(1);

  const f = facs.find((x) => x.id === fid) ?? facs[0];

  const seriesKeys = useMemo(() => {
    if (!f) return [] as string[];
    return Object.values(keysFor(mode, f));
  }, [f, mode]);

  const data = useMemo(() => {
    if (!dataset || !f) return [];
    const t = dataset.telemetry;
    const centerParam = params.get('t');
    const end = centerParam ? Math.min(now, +centerParam + WINDOWS[win].s / 2) : now;
    const start = end - WINDOWS[win].s;
    const i0 = Math.max(0, indexAt(t, start));
    const i1 = indexAt(t, end);
    const step = Math.max(1, Math.floor((i1 - i0) / 720));
    const rows: Record<string, number>[] = [];
    const maxFlow = f.pump.max_flow_bpd || 1;
    for (let i = i0; i <= i1; i += step) {
      const row: Record<string, number> = { t: t.ts[i] };
      for (const k of seriesKeys) {
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
  }, [dataset, f, seriesKeys, now, win, params, mode]);

  if (!dataset || !analysis || !f) return null;

  const limits = dataset.network.defaults.tank_limits_pct;
  const t0 = data[0]?.t ?? now;
  const t1 = data[data.length - 1]?.t ?? now;
  const evs = analysis.events.filter((e) => e.facility === f.id && e.onset <= t1 && (e.end ?? now) >= t0);
  const focusEv = evs.find((e) => e.status === 'ongoing') ?? evs[evs.length - 1];
  const modeMeta = MODES.find((m) => m.id === mode)!;

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

  const navParams = (next: { f?: string; preset?: Mode }) => {
    const p = new URLSearchParams();
    p.set('f', next.f ?? f.id);
    p.set('preset', next.preset ?? mode);
    const t = params.get('t');
    if (t) p.set('t', t);
    setParams(p);
  };
  const setMode = (m: Mode) => navParams({ preset: m });

  return (
    <div className="trends-page">
      <div className="trends-sky" aria-hidden>
        <img src={mapBackgrounds.moonlit} alt="" />
        <div className="trends-sky-wash" />
        <div className="trends-sky-aurora" />
      </div>

      <header className="trends-chrome">
        <div className="trends-chrome-top">
          <div>
            <h1 className="trends-title">Trends</h1>
            <p className="trends-sub">Sensor stories for the night guard · {modeMeta.name} signature</p>
          </div>
          <div className="trends-chrome-tools">
            <div className="select">
              <select
                value={f.id}
                onChange={(e) => navParams({ f: e.target.value })}
              >
                {dataset.network.systems.map((s) => (
                  <optgroup key={s.id} label={s.id}>
                    {s.facilities.map((x) => (
                      <option key={x.id} value={x.id}>{fmt.short(x.id)} · {s.id}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
            <div className="seg">
              {WINDOWS.map((w, i) => (
                <button key={w.l} type="button" className={win === i ? 'on' : ''} onClick={() => setWin(i)}>{w.l}</button>
              ))}
            </div>
            <Link to={`/?f=${encodeURIComponent(f.id)}`} className="btn sm ghost">
              Map <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        <div className="trend-mode-row">
          {MODES.map((m) => (
            <motion.button
              key={m.id}
              type="button"
              className={`trend-mode-card ${m.tone} ${mode === m.id ? 'on' : ''}`}
              onClick={() => setMode(m.id)}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              layout
            >
              <img src={mapArt[m.art]} alt="" />
              <div>
                <b>{m.name}</b>
                <span>{m.blurb}</span>
              </div>
            </motion.button>
          ))}
        </div>

        {focusEv && (
          <motion.div
            className="trend-case"
            key={focusEv.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="chip ghost" style={{ color: catHex[focusEv.category] }}>
              <i className="dot" style={{ background: catHex[focusEv.category] }} />
              {CATEGORY_LABEL[focusEv.category]}
            </span>
            <Confidence value={focusEv.confidence} />
            <span className="dim" style={{ fontSize: 12.5 }}>
              since {fmt.dayTime(focusEv.onset)}{focusEv.end ? ` → ${fmt.time(focusEv.end)}` : ' · ongoing'}
            </span>
            <span className="trend-case-ev">{focusEv.evidence[0]}</span>
          </motion.div>
        )}
      </header>

      <section className="trends-stage">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${mode}-${f.id}-${win}`}
            className="trends-stage-inner"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
          >
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
                inflowKey={`${f.id}|inflow_bpd`}
                warn={limits.warning}
                shut={limits.shutdown}
                levelNow={Number.isFinite(levelNow) ? levelNow : 0}
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
                lossNow={Number.isFinite(lossNow) ? lossNow : 0}
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
                ratioNow={Number.isFinite(ratioNow) ? ratioNow : 1}
                onJump={setNow}
              />
            )}
            {mode === 'wells' && <WellsScene wells={wellCards} facilityLabel={fmt.short(f.id)} />}
          </motion.div>
        </AnimatePresence>
      </section>

      <footer className="trends-foot">
        {evs.map((e) => (
          <button
            key={e.id}
            type="button"
            className="chip ghost"
            style={{ color: catHex[e.category], cursor: 'pointer' }}
            onClick={() => setNow(Math.min(now, e.onset + 300))}
          >
            <i className="dot" style={{ background: catHex[e.category] }} />
            {CATEGORY_LABEL[e.category]} · {fmt.dayTime(e.onset)}
          </button>
        ))}
        {evs.length === 0 && (
          <span className="dim" style={{ fontSize: 12.5 }}>
            Quiet window for {fmt.short(f.id)} — scrub the TideDock if you need an older story.
          </span>
        )}
      </footer>
    </div>
  );
}
