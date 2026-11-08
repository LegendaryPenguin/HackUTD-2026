import { motion } from 'framer-motion';
import {
  Area, AreaChart, CartesianGrid, Label, Line, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { mapArt } from '../MapMarkers';
import { fmt, CATEGORY_LABEL } from '../../lib/model';
import { catHex } from '../ui';
import type { DetectedEvent } from '../../lib/types';

export type TrendRow = Record<string, number>;

type SceneProps = {
  data: TrendRow[];
  events: DetectedEvent[];
  now: number;
  t0: number;
  t1: number;
  winLabel: string;
  facilityLabel: string;
  summary: string;
  onJump: (unix: number) => void;
};

function SoftTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="trend-tip">
      <div className="trend-tip-time">{fmt.dayTime(Number(label))}</div>
      {payload.map((p) => (
        <div key={p.name} className="trend-tip-row">
          <i style={{ background: p.color }} />
          <span>{p.name}</span>
          <b>{fmt.num(p.value, String(p.name).includes('%') || String(p.name).toLowerCase().includes('ratio') ? 1 : 0)}</b>
        </div>
      ))}
    </div>
  );
}

function EventBands({ events, t0, t1, now, onJump }: { events: DetectedEvent[]; t0: number; t1: number; now: number; onJump: (u: number) => void }) {
  return (
    <>
      {events.map((e) => (
        <ReferenceArea
          key={e.id}
          yAxisId="main"
          x1={Math.max(t0, e.onset)}
          x2={Math.min(t1, e.end ?? now)}
          fill={catHex[e.category]}
          fillOpacity={0.14}
          stroke={catHex[e.category]}
          strokeOpacity={0.45}
          label={{ value: CATEGORY_LABEL[e.category], fill: catHex[e.category], fontSize: 11, position: 'insideTop' }}
          onClick={() => onJump(Math.min(now, e.end ?? now))}
          style={{ cursor: 'pointer' }}
        />
      ))}
    </>
  );
}

function ChartSummary({ text }: { text: string }) {
  return <p className="trend-summary">{text}</p>;
}

/** Filling — tank level % with warning (85%) and shutdown (92%) lines. */
export function FillingScene({
  data, events, now, t0, t1, winLabel, levelKey, warn, shut, levelNow, summary, onJump,
}: SceneProps & { levelKey: string; warn: number; shut: number; levelNow: number }) {
  const danger = levelNow >= shut;
  const warnTone = levelNow >= warn;
  return (
    <div className="trend-scene filling">
      <div className="trend-scene-label">
        <span className={`chip ${danger ? 'coral' : warnTone ? 'amber' : 'aqua'}`}>Tank level · {winLabel}</span>
        <div className="trend-legend">
          <span><i className="lg amber" /> Warning {warn}%</span>
          <span><i className="lg coral" /> Shutdown {shut}%</span>
        </div>
      </div>
      <motion.div
        className="trend-hero-sticker xl"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <img src={mapArt.tank} alt="" />
        <div className={`trend-hero-bubble ${danger ? 'coral' : warnTone ? 'amber' : 'aqua'}`}>
          {levelNow.toFixed(0)}%
        </div>
      </motion.div>
      <div className="trend-bubbles" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.i
            key={i}
            className="trend-bubble"
            style={{ left: `${10 + i * 16}%` }}
            animate={{ y: [40, -160], opacity: [0, 0.7, 0], scale: [0.6, 1, 0.75] }}
            transition={{ duration: 3.5 + i * 0.35, repeat: Infinity, delay: i * 0.45, ease: 'easeOut' }}
          />
        ))}
      </div>
      <div className="trend-scene-chart">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 28, right: 24, bottom: 28, left: 12 }}>
            <defs>
              <linearGradient id={`tideFill-${levelKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={danger ? '#f08a9a' : '#5ec8d8'} stopOpacity={0.6} />
                <stop offset="100%" stopColor={danger ? '#f08a9a' : '#5ec8d8'} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(140,190,210,0.1)" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmt.time(v)} tickCount={7} stroke="var(--ink-3)" fontSize={11}>
              <Label value="Time" position="insideBottom" offset={-16} fill="var(--ink-2)" fontSize={11} />
            </XAxis>
            <YAxis yAxisId="main" domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={48} stroke="var(--ink-3)" fontSize={11}>
              <Label value="Tank level (%)" angle={-90} position="insideLeft" offset={10} fill="var(--ink-2)" fontSize={11} />
            </YAxis>
            <Tooltip content={<SoftTip />} />
            <EventBands events={events} t0={t0} t1={t1} now={now} onJump={onJump} />
            <ReferenceLine yAxisId="main" x={now} stroke="var(--aqua-2)" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine
              yAxisId="main"
              y={warn}
              stroke="var(--amber)"
              strokeDasharray="6 5"
              strokeWidth={1.6}
              label={{ value: `Warning ${warn}%`, fill: 'var(--amber)', fontSize: 11, position: 'insideTopRight' }}
            />
            <ReferenceLine
              yAxisId="main"
              y={shut}
              stroke="var(--coral)"
              strokeDasharray="6 5"
              strokeWidth={1.6}
              label={{ value: `Shutdown ${shut}%`, fill: 'var(--coral)', fontSize: 11, position: 'insideTopRight' }}
            />
            <Area
              yAxisId="main"
              type="monotone"
              dataKey={levelKey}
              name="Tank %"
              stroke={danger ? 'var(--coral)' : 'var(--aqua)'}
              strokeWidth={3}
              fill={`url(#tideFill-${levelKey})`}
              dot={false}
              isAnimationActive
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartSummary text={summary} />
      <div className="trend-wave" aria-hidden />
    </div>
  );
}

/** Leak — send vs receive with pipe gap. */
export function LeakScene({
  data, events, now, t0, t1, winLabel, sendKey, recvKey, psiKey, lossNow, summary, onJump,
}: SceneProps & { sendKey: string; recvKey: string; psiKey?: string; lossNow: number }) {
  const dripping = lossNow > 20;
  const gid = `${sendKey}-${recvKey}`;
  return (
    <div className="trend-scene leak">
      <div className="trend-scene-label">
        <span className="chip amber">Send vs receive · {winLabel}</span>
        <div className="trend-legend">
          <span><i className="lg aqua" /> Pump send</span>
          <span><i className="lg amber" /> Disposal receive</span>
          {psiKey && <span><i className="lg violet" /> Pipe pressure</span>}
        </div>
      </div>
      <div className="trend-pipe-stage xl">
        <motion.div className="trend-pipe-end send" animate={{ y: [0, -4, 0] }} transition={{ duration: 2.6, repeat: Infinity }}>
          <img src={mapArt.tank} alt="" />
          <span>Send</span>
        </motion.div>
        <div className="trend-pipe-body">
          <svg className="trend-pipe-svg" viewBox="0 0 420 90" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id={`pipeGrad-${gid}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#5ec8d8" />
                <stop offset="48%" stopColor="#5ec8d8" />
                <stop offset="52%" stopColor="#e8c07a" />
                <stop offset="100%" stopColor="#e8c07a" />
              </linearGradient>
            </defs>
            <path d="M0 28 H175 L190 18 H230 L245 28 H420 V62 H245 L230 72 H190 L175 62 H0 Z" fill={`url(#pipeGrad-${gid})`} opacity="0.35" />
            <path d="M0 34 H172 L188 24 H232 L248 34 H420" fill="none" stroke={`url(#pipeGrad-${gid})`} strokeWidth="10" strokeLinecap="round" />
            <path className="trend-pipe-flow-path" d="M8 34 H165" fill="none" stroke="#9ee7f0" strokeWidth="4" strokeDasharray="10 14" />
          </svg>
          {dripping && (
            <>
              <motion.span className="trend-drip" animate={{ y: [0, 28], opacity: [1, 0] }} transition={{ duration: 1.05, repeat: Infinity, ease: 'easeIn' }} />
              <motion.span className="trend-drip trend-drip-2" animate={{ y: [0, 28], opacity: [0.9, 0] }} transition={{ duration: 1.3, repeat: Infinity, ease: 'easeIn', delay: 0.4 }} />
            </>
          )}
          <span className="trend-loss-pill">{fmt.num(lossNow)} bpd lost</span>
        </div>
        <motion.div className="trend-pipe-end recv" animate={{ y: [0, -3, 0] }} transition={{ duration: 2.9, repeat: Infinity, delay: 0.35 }}>
          <img src={mapArt.disposal} alt="" />
          <span>Disposal</span>
        </motion.div>
      </div>
      <div className="trend-scene-chart compact">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 18, right: 48, bottom: 28, left: 12 }}>
            <defs>
              <linearGradient id={`sendFill-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5ec8d8" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#5ec8d8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`recvFill-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e8c07a" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#e8c07a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(140,190,210,0.1)" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmt.time(v)} tickCount={7} stroke="var(--ink-3)" fontSize={11}>
              <Label value="Time" position="insideBottom" offset={-16} fill="var(--ink-2)" fontSize={11} />
            </XAxis>
            <YAxis yAxisId="main" tickFormatter={(v) => fmt.num(v, 0)} width={56} stroke="var(--ink-3)" fontSize={11}>
              <Label value="Flow (bpd)" angle={-90} position="insideLeft" offset={8} fill="var(--ink-2)" fontSize={11} />
            </YAxis>
            {psiKey && (
              <YAxis yAxisId="psi" orientation="right" width={48} stroke="var(--violet)" fontSize={11}>
                <Label value="Pressure (psi)" angle={90} position="insideRight" offset={8} fill="var(--violet)" fontSize={11} />
              </YAxis>
            )}
            <Tooltip content={<SoftTip />} />
            <EventBands events={events} t0={t0} t1={t1} now={now} onJump={onJump} />
            <ReferenceLine yAxisId="main" x={now} stroke="var(--aqua-2)" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Area yAxisId="main" type="monotone" dataKey={sendKey} name="Pump send" stroke="var(--aqua)" fill={`url(#sendFill-${gid})`} strokeWidth={2.6} dot={false} isAnimationActive animationDuration={800} />
            <Area yAxisId="main" type="monotone" dataKey={recvKey} name="Disposal receive" stroke="var(--amber)" fill={`url(#recvFill-${gid})`} strokeWidth={2.6} dot={false} isAnimationActive animationDuration={800} />
            {psiKey && (
              <Line yAxisId="psi" type="monotone" dataKey={psiKey} name="Pipe psi" stroke="var(--violet)" strokeWidth={1.8} strokeDasharray="5 4" dot={false} isAnimationActive animationDuration={850} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartSummary text={summary} />
    </div>
  );
}

/** Wear — flow / nameplate ratio. */
export function WearScene({
  data, events, now, t0, t1, winLabel, ratioKey, flowKey, ratioNow, summary, onJump,
}: SceneProps & { ratioKey: string; flowKey: string; ratioNow: number }) {
  const weak = ratioNow < 0.95;
  const gid = flowKey;
  return (
    <div className="trend-scene wear">
      <div className="trend-scene-label">
        <span className="chip violet">Flow vs max · {winLabel}</span>
        <div className="trend-legend">
          <span><i className="lg violet" /> Flow / nameplate</span>
          <span><i className="lg ghost" /> Nameplate 100%</span>
        </div>
      </div>
      <motion.div
        className="trend-hero-sticker xl pump"
        animate={{ scale: weak ? [1, 0.94, 1] : [1, 1.05, 1] }}
        transition={{ duration: weak ? 2.8 : 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <img src={mapArt.well} alt="" />
        <div className={`trend-hero-bubble ${weak ? 'violet' : 'mint'}`}>{(ratioNow * 100).toFixed(0)}%</div>
      </motion.div>
      <div className="trend-scene-chart">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 28, right: 24, bottom: 28, left: 12 }}>
            <defs>
              <linearGradient id={`wearFill-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a8b8e0" stopOpacity={0.48} />
                <stop offset="100%" stopColor="#a8b8e0" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(140,190,210,0.1)" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmt.time(v)} tickCount={7} stroke="var(--ink-3)" fontSize={11}>
              <Label value="Time" position="insideBottom" offset={-16} fill="var(--ink-2)" fontSize={11} />
            </XAxis>
            <YAxis yAxisId="main" domain={[0.8, 1.02]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={52} stroke="var(--ink-3)" fontSize={11}>
              <Label value="Flow / max (%)" angle={-90} position="insideLeft" offset={8} fill="var(--ink-2)" fontSize={11} />
            </YAxis>
            <Tooltip content={<SoftTip />} />
            <EventBands events={events} t0={t0} t1={t1} now={now} onJump={onJump} />
            <ReferenceLine yAxisId="main" x={now} stroke="var(--aqua-2)" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine yAxisId="main" y={1} stroke="var(--ink-3)" strokeDasharray="4 4" label={{ value: 'Nameplate 100%', fill: 'var(--ink-3)', fontSize: 11 }} />
            <ReferenceLine yAxisId="main" y={0.985} stroke="var(--violet)" strokeDasharray="3 3" label={{ value: 'Wear threshold', fill: 'var(--violet)', fontSize: 11 }} />
            <Area yAxisId="main" type="monotone" dataKey={ratioKey} name="Flow / max" stroke="var(--violet)" fill={`url(#wearFill-${gid})`} strokeWidth={2.8} dot={false} isAnimationActive animationDuration={900} />
            <Line yAxisId="main" type="monotone" dataKey={flowKey} hide />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartSummary text={summary} />
    </div>
  );
}

/** Wells — water by well. */
export function WellsScene({
  wells,
  summary,
}: {
  wells: { id: string; label: string; badge: string; water: number; max: number; on: boolean }[];
  facilityLabel: string;
  summary: string;
}) {
  return (
    <div className="trend-scene wells">
      <div className="trend-scene-label">
        <span className="chip mint">Water by well</span>
      </div>
      <div className="trend-wells">
        {wells.map((w, i) => (
          <motion.div
            key={w.id}
            className={`trend-well-card ${w.on ? 'on' : 'off'}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
          >
            <div className="trend-well-art">
              <motion.img
                src={mapArt.well}
                alt=""
                animate={w.on ? { y: [0, -4, 0] } : { y: 0 }}
                transition={{ duration: 2.1 + (i % 3) * 0.3, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span className="trend-well-badge">{w.badge}</span>
            </div>
            <div className="trend-well-meta">
              <b>{w.label}</b>
              <span className={w.on ? '' : 'shut'}>{w.on ? `${fmt.num(w.water)} bpd` : 'Shut in'}</span>
            </div>
            <div className="trend-well-bar">
              <motion.i
                initial={{ width: 0 }}
                animate={{ width: w.on ? `${Math.min(100, (w.water / Math.max(1, w.max)) * 100)}%` : '0%' }}
                transition={{ duration: 0.75, delay: 0.08 + i * 0.03 }}
              />
            </div>
          </motion.div>
        ))}
      </div>
      <ChartSummary text={summary} />
    </div>
  );
}
