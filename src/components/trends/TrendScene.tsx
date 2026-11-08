import { motion } from 'framer-motion';
import {
  Area, AreaChart, CartesianGrid, Line, ReferenceArea, ReferenceLine,
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

function SceneHead({ chip, chipTone, title, sub }: { chip: string; chipTone: string; title: string; sub: string }) {
  return (
    <div className="trend-scene-label">
      <div>
        <h2 className="trend-scene-title">{title}</h2>
        <p className="trend-scene-sub">{sub}</p>
      </div>
      <span className={`chip ${chipTone}`}>{chip}</span>
    </div>
  );
}

/** Filling — full-bleed tide chart + bobbing tank. */
export function FillingScene({
  data, events, now, t0, t1, winLabel, facilityLabel, levelKey, inflowKey, warn, shut, levelNow, onJump,
}: SceneProps & { levelKey: string; inflowKey?: string; warn: number; shut: number; levelNow: number }) {
  const danger = levelNow >= shut;
  const warnTone = levelNow >= warn;
  return (
    <div className="trend-scene filling">
      <SceneHead
        title={facilityLabel}
        sub="Watch the tide climb toward 92%"
        chip={`Tank fill · ${winLabel}`}
        chipTone={danger ? 'coral' : warnTone ? 'amber' : 'aqua'}
      />
      <motion.div
        className="trend-hero-sticker xl"
        animate={{ y: [0, -10, 0], rotate: [-2.5, 2.5, -2.5] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <img src={mapArt.tank} alt="" />
        <motion.div
          className={`trend-hero-bubble ${danger ? 'coral' : warnTone ? 'amber' : 'aqua'}`}
          animate={danger ? { scale: [1, 1.1, 1] } : { scale: 1 }}
          transition={{ duration: 1.15, repeat: Infinity }}
        >
          {levelNow.toFixed(0)}%
        </motion.div>
      </motion.div>
      <div className="trend-bubbles" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <motion.i
            key={i}
            className="trend-bubble"
            style={{ left: `${8 + i * 15}%` }}
            animate={{ y: [50, -180], opacity: [0, 0.75, 0], scale: [0.55, 1.05, 0.7] }}
            transition={{ duration: 3.6 + i * 0.35, repeat: Infinity, delay: i * 0.45, ease: 'easeOut' }}
          />
        ))}
      </div>
      <div className="trend-scene-chart">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 24, right: 20, bottom: 8, left: 4 }}>
            <defs>
              <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={danger ? '#f08a9a' : '#5ec8d8'} stopOpacity={0.65} />
                <stop offset="55%" stopColor={danger ? '#f08a9a' : '#5ec8d8'} stopOpacity={0.22} />
                <stop offset="100%" stopColor={danger ? '#f08a9a' : '#5ec8d8'} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(140,190,210,0.1)" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmt.time(v)} tickCount={8} stroke="var(--ink-3)" fontSize={12} />
            <YAxis yAxisId="main" domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={44} stroke="var(--ink-3)" fontSize={12} />
            <Tooltip content={<SoftTip />} />
            <EventBands events={events} t0={t0} t1={t1} now={now} onJump={onJump} />
            <ReferenceLine yAxisId="main" x={now} stroke="var(--aqua-2)" strokeDasharray="3 3" strokeOpacity={0.55} />
            <ReferenceLine yAxisId="main" y={warn} stroke="var(--amber)" strokeDasharray="6 5" strokeWidth={1.5} label={{ value: '85%', fill: 'var(--amber)', fontSize: 12 }} />
            <ReferenceLine yAxisId="main" y={shut} stroke="var(--coral)" strokeDasharray="6 5" strokeWidth={1.5} label={{ value: '92%', fill: 'var(--coral)', fontSize: 12 }} />
            <Area
              yAxisId="main"
              type="monotone"
              dataKey={levelKey}
              name="Tank %"
              stroke={danger ? 'var(--coral)' : 'var(--aqua)'}
              strokeWidth={3.2}
              fill="url(#tideFill)"
              dot={false}
              isAnimationActive
              animationDuration={1000}
              animationEasing="ease-out"
            />
            {inflowKey && <Line yAxisId="main" type="monotone" dataKey={inflowKey} hide />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="trend-wave" aria-hidden />
    </div>
  );
}

/** Leak — big broken-pipe hero + send/recv chart. */
export function LeakScene({
  data, events, now, t0, t1, winLabel, facilityLabel, sendKey, recvKey, psiKey, lossNow, onJump,
}: SceneProps & { sendKey: string; recvKey: string; psiKey?: string; lossNow: number }) {
  const dripping = lossNow > 20;
  return (
    <div className="trend-scene leak">
      <SceneHead
        title={facilityLabel}
        sub="Send should match disposal — the gap is the story"
        chip={`Leak watch · ${winLabel}`}
        chipTone="amber"
      />
      <div className="trend-pipe-stage xl">
        <motion.div className="trend-pipe-end send" animate={{ y: [0, -4, 0] }} transition={{ duration: 2.6, repeat: Infinity }}>
          <img src={mapArt.tank} alt="" />
          <span>Send</span>
        </motion.div>

        <div className="trend-pipe-body">
          <svg className="trend-pipe-svg" viewBox="0 0 420 90" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="pipeGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#5ec8d8" />
                <stop offset="48%" stopColor="#5ec8d8" />
                <stop offset="52%" stopColor="#e8c07a" />
                <stop offset="100%" stopColor="#e8c07a" />
              </linearGradient>
            </defs>
            <path d="M0 28 H175 L190 18 H230 L245 28 H420 V62 H245 L230 72 H190 L175 62 H0 Z" fill="url(#pipeGrad)" opacity="0.35" />
            <path d="M0 34 H172 L188 24 H232 L248 34 H420" fill="none" stroke="url(#pipeGrad)" strokeWidth="10" strokeLinecap="round" />
            <path className="trend-pipe-flow-path" d="M8 34 H165" fill="none" stroke="#9ee7f0" strokeWidth="4" strokeDasharray="10 14" />
            {dripping && (
              <g>
                <path d="M200 40 L208 52 L196 52 Z" fill="#e8c07a" opacity="0.9" />
                <path d="M218 42 L224 54 L212 54 Z" fill="#e8c07a" opacity="0.7" />
              </g>
            )}
          </svg>
          {dripping && (
            <>
              <motion.span className="trend-drip" animate={{ y: [0, 28], opacity: [1, 0] }} transition={{ duration: 1.05, repeat: Infinity, ease: 'easeIn' }} />
              <motion.span className="trend-drip trend-drip-2" animate={{ y: [0, 28], opacity: [0.9, 0] }} transition={{ duration: 1.3, repeat: Infinity, ease: 'easeIn', delay: 0.4 }} />
              <motion.span className="trend-drip trend-drip-3" animate={{ y: [0, 28], opacity: [0.8, 0] }} transition={{ duration: 1.15, repeat: Infinity, ease: 'easeIn', delay: 0.75 }} />
            </>
          )}
          <motion.span className="trend-loss-pill" animate={dripping ? { y: [0, -3, 0] } : {}} transition={{ duration: 1.7, repeat: Infinity }}>
            {fmt.num(lossNow)} bpd lost
          </motion.span>
        </div>

        <motion.div className="trend-pipe-end recv" animate={{ y: [0, -3, 0] }} transition={{ duration: 2.9, repeat: Infinity, delay: 0.35 }}>
          <img src={mapArt.disposal} alt="" />
          <span>Disposal</span>
        </motion.div>
      </div>

      <div className="trend-scene-chart compact">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 16, right: 48, bottom: 6, left: 4 }}>
            <defs>
              <linearGradient id="sendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5ec8d8" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#5ec8d8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="recvFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e8c07a" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#e8c07a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(140,190,210,0.1)" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmt.time(v)} tickCount={7} stroke="var(--ink-3)" fontSize={12} />
            <YAxis yAxisId="main" tickFormatter={(v) => fmt.num(v, 0)} width={52} stroke="var(--ink-3)" fontSize={12} />
            {psiKey && <YAxis yAxisId="psi" orientation="right" width={42} stroke="var(--violet)" fontSize={11} />}
            <Tooltip content={<SoftTip />} />
            <EventBands events={events} t0={t0} t1={t1} now={now} onJump={onJump} />
            <ReferenceLine yAxisId="main" x={now} stroke="var(--aqua-2)" strokeDasharray="3 3" strokeOpacity={0.55} />
            <Area yAxisId="main" type="monotone" dataKey={sendKey} name="Pump send" stroke="var(--aqua)" fill="url(#sendFill)" strokeWidth={2.8} dot={false} isAnimationActive animationDuration={850} />
            <Area yAxisId="main" type="monotone" dataKey={recvKey} name="Disposal receive" stroke="var(--amber)" fill="url(#recvFill)" strokeWidth={2.8} dot={false} isAnimationActive animationDuration={850} />
            {psiKey && (
              <Line yAxisId="psi" type="monotone" dataKey={psiKey} name="Pipe psi" stroke="var(--violet)" strokeWidth={1.8} strokeDasharray="5 4" dot={false} isAnimationActive animationDuration={900} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Wear — sleepy pump + nameplate ratio curve. */
export function WearScene({
  data, events, now, t0, t1, winLabel, facilityLabel, ratioKey, flowKey, ratioNow, onJump,
}: SceneProps & { ratioKey: string; flowKey: string; ratioNow: number }) {
  const weak = ratioNow < 0.95;
  return (
    <div className="trend-scene wear">
      <SceneHead
        title={facilityLabel}
        sub={weak ? 'Getting sleepy… flow vs nameplate' : 'Still spry — keeping pace with nameplate'}
        chip={`Pump wear · ${winLabel}`}
        chipTone="violet"
      />
      <motion.div
        className="trend-hero-sticker xl pump"
        animate={{
          scale: weak ? [1, 0.93, 1] : [1, 1.07, 1],
          rotate: weak ? [0, -4, 4, 0] : [0, 0, 0],
          filter: weak
            ? ['brightness(0.88)', 'brightness(1)', 'brightness(0.88)']
            : ['brightness(1)', 'brightness(1.1)', 'brightness(1)'],
        }}
        transition={{ duration: weak ? 2.9 : 1.55, repeat: Infinity, ease: 'easeInOut' }}
      >
        <img src={mapArt.well} alt="" />
        <div className={`trend-hero-bubble ${weak ? 'violet' : 'mint'}`}>{(ratioNow * 100).toFixed(0)}%</div>
      </motion.div>
      <div className="trend-sparkles" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <motion.i
            key={i}
            className="trend-sparkle"
            style={{ left: `${68 + i * 7}%`, top: `${14 + (i % 3) * 12}%` }}
            animate={{ opacity: weak ? [0.15, 0.55, 0.15] : [0.45, 1, 0.45], scale: [0.75, 1.25, 0.75] }}
            transition={{ duration: 1.7 + i * 0.25, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
      <div className="trend-scene-chart">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 24, right: 20, bottom: 8, left: 4 }}>
            <defs>
              <linearGradient id="wearFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a8b8e0" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#a8b8e0" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(140,190,210,0.1)" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmt.time(v)} tickCount={8} stroke="var(--ink-3)" fontSize={12} />
            <YAxis yAxisId="main" domain={[0.8, 1.02]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={52} stroke="var(--ink-3)" fontSize={12} />
            <Tooltip content={<SoftTip />} />
            <EventBands events={events} t0={t0} t1={t1} now={now} onJump={onJump} />
            <ReferenceLine yAxisId="main" x={now} stroke="var(--aqua-2)" strokeDasharray="3 3" strokeOpacity={0.55} />
            <ReferenceLine yAxisId="main" y={1} stroke="var(--ink-3)" strokeDasharray="4 4" label={{ value: 'nameplate 100%', fill: 'var(--ink-3)', fontSize: 11 }} />
            <ReferenceLine yAxisId="main" y={0.985} stroke="var(--violet)" strokeDasharray="3 3" label={{ value: 'wear threshold', fill: 'var(--violet)', fontSize: 11 }} />
            <Area yAxisId="main" type="monotone" dataKey={ratioKey} name="Flow / max" stroke="var(--violet)" fill="url(#wearFill)" strokeWidth={3} dot={false} isAnimationActive animationDuration={950} />
            <Line yAxisId="main" type="monotone" dataKey={flowKey} hide />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Wells — full-page chorus grid. */
export function WellsScene({
  wells,
  facilityLabel,
}: {
  wells: { id: string; label: string; badge: string; water: number; max: number; on: boolean }[];
  facilityLabel: string;
}) {
  return (
    <div className="trend-scene wells">
      <SceneHead
        title={`${facilityLabel} · Well chorus`}
        sub="Who’s dumping water into the tank tonight"
        chip={`${wells.filter((w) => w.on).length} online`}
        chipTone="mint"
      />
      <div className="trend-wells">
        {wells.map((w, i) => (
          <motion.div
            key={w.id}
            className={`trend-well-card ${w.on ? 'on' : 'off'}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.05, duration: 0.35 }}
            whileHover={{ y: -4 }}
          >
            <div className="trend-well-art">
              <motion.img
                src={mapArt.well}
                alt=""
                animate={w.on ? { y: [0, -5, 0] } : { y: 0 }}
                transition={{ duration: 2.1 + (i % 3) * 0.35, repeat: Infinity, ease: 'easeInOut' }}
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
                transition={{ duration: 0.85, delay: 0.12 + i * 0.04 }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
