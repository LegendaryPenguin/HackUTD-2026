import { useEffect, useState } from 'react';
import { Droplets, LifeBuoy, Lock, Plus, RotateCcw, Timer, Truck, Workflow, X, Zap } from 'lucide-react';
import { FieldScene, type Prompt } from '../components/tycoon/FieldScene';
import {
  MAX_PADS,
  PAD_COST,
  SHUT_THRESHOLD,
  DUMP_COST,
  TRUCK_COST,
  buyTruck,
  calendarParts,
  canExpand,
  capStats,
  chapterMeta,
  chooseWait,
  createTycoon,
  dismissPopup,
  dismissTip,
  dispatchTruck,
  drill,
  emergencyDump,
  expandPad,
  expandPipe,
  expandTank,
  fmtCash,
  fmtPerDay,
  fmtSec,
  isSoftlocked,
  oilBpd,
  pickupNear,
  profitPerDay,
  pipeCost,
  recommendedPlan,
  shutInWells,
  tankCost,
  tick,
  timeToShut,
  truckFleetCost,
  upgrade,
  type TycoonState,
} from '../lib/tycoon';

function StatBar({
  label,
  value,
  hint,
  hot,
}: {
  label: string;
  value: number;
  hint: string;
  hot?: boolean;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={`ty-stat ${hot ? 'hot' : ''}`}>
      <div className="ty-stat-row">
        <span>{label}</span>
        <b>{pct}%</b>
      </div>
      <div className="ty-stat-track">
        <i style={{ width: `${pct}%` }} />
      </div>
      <small>{hint}</small>
    </div>
  );
}

export default function Tycoon() {
  const [state, setState] = useState<TycoonState>(() => createTycoon());
  const [, setPrompt] = useState<Prompt>({ kind: 'idle' });
  const [displayCash, setDisplayCash] = useState(state.cash);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setState((s) => tick(s, dt));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let raf = 0;
    const step = () => {
      setDisplayCash((c) => {
        const diff = state.cash - c;
        if (Math.abs(diff) < 0.5) return state.cash;
        return c + diff * 0.22;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [state.cash]);

  const bpd = oilBpd(state);
  const dayProfit = profitPerDay(state);
  const waterPct = state.waterCap > 0 ? state.waterBbl / state.waterCap : 0;
  const cal = calendarParts(state);
  const ch = chapterMeta(state.chapter);
  const stats = capStats(state);
  const tankBuy = tankCost(state.tankLevel);
  const pipeBuy = pipeCost(state.pipeLevel);
  const truckBuy = truckFleetCost(state.trucksOwned);
  const topPopup = state.popups[state.popups.length - 1] ?? null;
  const inc = state.incident;
  const rec = inc ? recommendedPlan(inc) : null;
  const tts = inc ? timeToShut(inc) : 0;
  const crisisPads = inc && inc.status !== 'cleared' ? [inc.padId] : [];
  const stuck = isSoftlocked(state);
  const yearProg = Math.min(100, (cal.monthIdx / 120) * 100);

  return (
    <div className="tycoon-page">
      <div className="tycoon-stage">
        <FieldScene
          pads={state.pads}
          coins={state.coins}
          floats={state.floats}
          cash={state.cash}
          waterFill={waterPct}
          shutIn={state.overflowShut}
          pipeLevel={state.pipeLevel}
          trucksOwned={state.trucksOwned}
          trucksBusy={state.trucksBusy}
          crisisPadIds={crisisPads}
          crisisTankPct={inc?.tankPct ?? 0}
          onBuyPad={(id) => setState((s) => drill(s, id))}
          onUpgradePad={(id) => setState((s) => upgrade(s, id))}
          onPickup={(x, z, dt) => setState((s) => pickupNear(s, x, z, dt))}
          onPrompt={setPrompt}
        />
      </div>

      <header className="ty-top">
        <div>
          <p className="ty-kicker">Extra · decade sim</p>
          <h1 className="ty-title">Oil Tycoon</h1>
        </div>
        <div className="ty-earn-stack">
          <div className={`ty-cash ${state.pops.length ? 'hot' : ''}`}>
            <span>Cash</span>
            <strong>{fmtCash(displayCash)}</strong>
          </div>
          <div className={`ty-ips ${dayProfit > 0 ? 'live' : ''}`}>
            <Zap size={14} />
            <strong>{state.overflowShut ? '$0/day' : fmtPerDay(dayProfit)}</strong>
            <span>{state.overflowShut ? 'paused' : 'game day'}</span>
          </div>
        </div>
      </header>

      <div className="ty-clock" aria-label="Field calendar">
        <p className="ty-clock-kicker">Field calendar</p>
        <strong>{cal.label}</strong>
        <div className="ty-clock-bar">
          <i style={{ width: `${yearProg}%` }} />
        </div>
        <span>Year {Math.min(10, Math.floor(cal.monthIdx / 12) + 1)} of 10. {ch.title}</span>
      </div>

      {state.tip && (
        <div className="ty-tip" role="dialog" aria-label="Pro tip">
          <p className="ty-tip-kicker">Pro tip</p>
          <h2>{state.tip.title}</h2>
          <p>{state.tip.body}</p>
          <button type="button" className="ty-tip-ok" onClick={() => setState((s) => dismissTip(s))}>
            Got it
          </button>
        </div>
      )}

      {inc && (inc.status === 'open' || inc.status === 'managed') && (
        <aside className="ty-crisis" role="dialog" aria-label="Facility triage">
          <div className="ty-crisis-head">
            <p className="ty-crisis-kicker">Pump failure</p>
            <h2>{inc.padId.replace('-', ' ').toUpperCase()}</h2>
            <p>
              Tank at {Math.round(inc.tankPct)}%. Hits {SHUT_THRESHOLD}% in <b>{fmtSec(tts)}</b>.
              Repair finishes in <b>{fmtSec(inc.repairLeft)}</b>.
            </p>
          </div>
          <div className="ty-crisis-bars">
            <div className="ty-crisis-bar">
              <span>Tank</span>
              <i style={{ width: `${Math.min(100, (inc.tankPct / SHUT_THRESHOLD) * 100)}%` }} />
            </div>
            <div className="ty-crisis-bar repair">
              <span>Repair</span>
              <i style={{ width: `${Math.min(100, (1 - inc.repairLeft / inc.repairTotal) * 100)}%` }} />
            </div>
          </div>
          <p className="ty-crisis-meta">
            Doing nothing costs about {fmtCash(inc.doNothingCost)}. Trucks used: {inc.trucks}/{state.trucksOwned || 0}.
            {rec && <> Best pick: <b>{rec === 'shut_in' ? 'shut in' : rec}</b>.</>}
          </p>
          <div className="ty-crisis-actions">
            <button
              type="button"
              className={`ty-plan ${rec === 'truck' ? 'rec' : ''}`}
              disabled={state.trucksOwned < 1 || state.cash < TRUCK_COST || inc.trucks >= state.trucksOwned}
              onClick={() => setState((s) => dispatchTruck(s))}
            >
              <Truck size={16} />
              <span><b>Truck</b><small>{fmtCash(TRUCK_COST)}. Empties some water.</small></span>
            </button>
            <button
              type="button"
              className={`ty-plan ${rec === 'shut_in' ? 'rec' : ''}`}
              disabled={inc.shutIn}
              onClick={() => setState((s) => shutInWells(s))}
            >
              <Zap size={16} />
              <span><b>Shut in</b><small>Slows the fill. Stops oil on this pad.</small></span>
            </button>
            <button
              type="button"
              className={`ty-plan ${rec === 'wait' ? 'rec' : ''}`}
              disabled={inc.plan !== 'none'}
              onClick={() => setState((s) => chooseWait(s))}
            >
              <Timer size={16} />
              <span><b>Wait</b><small>Only if you stay under 92%.</small></span>
            </button>
          </div>
        </aside>
      )}

      {!state.tip && topPopup && (
        <div className={`ty-popup ty-popup-${topPopup.tone}`} role="status">
          <button type="button" className="ty-popup-x" aria-label="Dismiss" onClick={() => setState((s) => dismissPopup(s, topPopup.id))}>
            <X size={14} />
          </button>
          <p className="ty-popup-title">{topPopup.title}</p>
          <p className="ty-popup-body">{topPopup.body}</p>
        </div>
      )}

      <div className="ty-pops" aria-hidden>
        {state.pops.map((p) => (
          <span key={p.id} className="ty-pop">+{fmtCash(p.amount)}</span>
        ))}
      </div>

      <aside className="ty-shop">
        <div className="ty-shop-head">
          <h2>Grow the field</h2>
          <p>{ch.goal}</p>
        </div>

        <div className="ty-stats">
          <StatBar label="Wells" value={stats.wells} hint={`${Math.round(bpd)} bbl/day`} />
          <StatBar label="Tank" value={stats.tank} hint={`${Math.round(waterPct * 100)}% full`} hot={waterPct > 0.85} />
          <StatBar
            label="Pipe"
            value={stats.pipe}
            hint={state.pipeLevel < 1 ? 'none yet' : `Lv ${state.pipeLevel}`}
            hot={stats.pipe > 0.9}
          />
          <StatBar
            label="Trucks"
            value={stats.truck}
            hint={state.trucksOwned < 1 ? 'none yet' : `${state.trucksOwned} fleet`}
          />
        </div>

        {stuck && (
          <button type="button" className="ty-buy rescue" onClick={() => setState((s) => emergencyDump(s))}>
            <LifeBuoy size={18} />
            <span>
              <b>Emergency dump</b>
              <small>{fmtCash(DUMP_COST)}. Clears water so you can produce again.</small>
            </span>
          </button>
        )}

        <button type="button" className="ty-buy mint" disabled={!canExpand(state) || state.cash < PAD_COST || state.decadeDone} onClick={() => setState((s) => expandPad(s))}>
          <Plus size={18} />
          <span>
            <b>New well</b>
            <small>
              {canExpand(state)
                ? `${fmtCash(PAD_COST)}. Sites left ${MAX_PADS - state.pads.length}.`
                : 'Lease circle is full.'}
            </small>
          </span>
        </button>

        <button
          type="button"
          className={`ty-buy aqua ${state.overflowShut ? 'pulse' : ''}`}
          disabled={!state.unlocked.tanks || state.cash < tankBuy || state.decadeDone}
          onClick={() => setState((s) => expandTank(s))}
        >
          {state.unlocked.tanks ? <Droplets size={18} /> : <Lock size={18} />}
          <span>
            <b>Bigger tank</b>
            <small>{state.unlocked.tanks ? `${fmtCash(tankBuy)}. More room.` : 'Unlocks in chapter 2'}</small>
          </span>
        </button>

        <button
          type="button"
          className="ty-buy sky"
          disabled={!state.unlocked.pipes || state.cash < pipeBuy || state.decadeDone}
          onClick={() => setState((s) => expandPipe(s))}
        >
          {state.unlocked.pipes ? <Workflow size={18} /> : <Lock size={18} />}
          <span>
            <b>Pipeline</b>
            <small>{state.unlocked.pipes ? `${fmtCash(pipeBuy)}. Drains faster.` : 'Unlocks in chapter 3'}</small>
          </span>
        </button>

        <button
          type="button"
          className="ty-buy amber"
          disabled={!state.unlocked.trucks || state.cash < truckBuy || state.decadeDone}
          onClick={() => setState((s) => buyTruck(s))}
        >
          {state.unlocked.trucks ? <Truck size={18} /> : <Lock size={18} />}
          <span>
            <b>Hire truck</b>
            <small>{state.unlocked.trucks ? `${fmtCash(truckBuy)}. Fleet size ${state.trucksOwned}.` : 'Unlocks in chapter 4'}</small>
          </span>
        </button>

        <button
          type="button"
          className="ty-buy ghost"
          onClick={() => {
            const next = createTycoon();
            setState(next);
            setDisplayCash(next.cash);
            setPrompt({ kind: 'idle' });
          }}
        >
          <RotateCcw size={16} /> Reset decade
        </button>
      </aside>

      <div className="ty-keys" aria-hidden>
        <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
        <span>run</span>
        <kbd>⇧</kbd>
        <span>sprint</span>
        <span className="ty-keys-click">click sand to go</span>
      </div>
    </div>
  );
}
