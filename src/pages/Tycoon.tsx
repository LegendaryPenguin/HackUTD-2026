import { useEffect, useState } from 'react';
import { Droplets, Plus, RotateCcw, X, Zap } from 'lucide-react';
import { FieldScene, type Prompt } from '../components/tycoon/FieldScene';
import {
  PAD_COST,
  canExpand,
  createTycoon,
  dismissPopup,
  disposeCost,
  drill,
  expandDisposal,
  expandPad,
  fmtCash,
  fmtPerSec,
  incomePerSec,
  oilRate,
  pickupNear,
  tick,
  upgrade,
  type TycoonState,
} from '../lib/tycoon';

export default function Tycoon() {
  const [state, setState] = useState<TycoonState>(() => createTycoon());
  const [prompt, setPrompt] = useState<Prompt>({ kind: 'idle' });
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

  // Smooth cash counter
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

  const rate = oilRate(state);
  const ips = incomePerSec(state);
  const waterPct = state.waterCap > 0 ? state.waterBbl / state.waterCap : 0;
  const tankCost = disposeCost(state.disposeLevel);
  const wells = state.pads.filter((p) => p.level > 0).length;
  const topPopup = state.popups[state.popups.length - 1] ?? null;
  const hold =
    prompt.kind === 'buy' || prompt.kind === 'upgrade' ? prompt.progress : 0;

  const promptText = (() => {
    if (prompt.kind === 'buy') {
      return prompt.canAfford
        ? `Hold E · ${prompt.label} (${fmtCash(prompt.cost)})`
        : `Need ${fmtCash(prompt.cost)} — scoop more coins!`;
    }
    if (prompt.kind === 'upgrade') {
      return prompt.canAfford
        ? `Hold E · ${prompt.label} (${fmtCash(prompt.cost)})`
        : `Need ${fmtCash(prompt.cost)}`;
    }
    if (prompt.kind === 'max') return 'Maxed — unlock another pad in the shop!';
    return 'WASD run · coins auto-magnet · Hold E on glow pads';
  })();

  return (
    <div className="tycoon-page">
      <div className="tycoon-stage">
        <FieldScene
          pads={state.pads}
          coins={state.coins}
          floats={state.floats}
          cash={state.cash}
          waterFill={waterPct}
          shutIn={state.shutIn}
          onBuyPad={(id) => setState((s) => drill(s, id))}
          onUpgradePad={(id) => setState((s) => upgrade(s, id))}
          onPickup={(x, z, dt) => setState((s) => pickupNear(s, x, z, dt))}
          onPrompt={setPrompt}
        />
      </div>

      <header className="ty-top">
        <div>
          <p className="ty-kicker">Extra · money island</p>
          <h1 className="ty-title">Oil Tycoon</h1>
        </div>
        <div className="ty-earn-stack">
          <div className={`ty-cash ${state.pops.length ? 'hot' : ''}`}>
            <span>Cash</span>
            <strong>{fmtCash(displayCash)}</strong>
          </div>
          <div className={`ty-ips ${ips > 0 ? 'live' : ''}`}>
            <Zap size={14} />
            <strong>{fmtPerSec(ips)}</strong>
            <span>income</span>
          </div>
        </div>
      </header>

      <div className={`ty-meter ${state.shutIn ? 'critical' : waterPct > 0.7 ? 'hot' : ''}`}>
        <div className="ty-meter-fill" style={{ width: `${Math.min(100, waterPct * 100)}%` }} />
        <span>
          Water {Math.round(waterPct * 100)}% · {wells} wells · drip {Math.round(rate)}/min · banked {fmtCash(state.totalEarned)}
        </span>
      </div>

      {topPopup && (
        <div className={`ty-popup ty-popup-${topPopup.tone}`} role="status">
          <button
            type="button"
            className="ty-popup-x"
            aria-label="Dismiss"
            onClick={() => setState((s) => dismissPopup(s, topPopup.id))}
          >
            <X size={14} />
          </button>
          <p className="ty-popup-title">{topPopup.title}</p>
          <p className="ty-popup-body">{topPopup.body}</p>
        </div>
      )}

      <div className={`ty-prompt ${prompt.kind !== 'idle' ? 'live' : ''}`}>
        {promptText}
        {hold > 0 && (
          <i className="ty-hold-bar" style={{ width: `${hold * 100}%` }} />
        )}
      </div>

      <div className="ty-pops" aria-hidden>
        {state.pops.map((p) => (
          <span key={p.id} className="ty-pop">+{fmtCash(p.amount)}</span>
        ))}
      </div>

      <aside className="ty-shop">
        <div className="ty-shop-head">
          <h2>Shop</h2>
          <p>Expand while coins magnet to you.</p>
        </div>
        <button
          type="button"
          className="ty-buy mint"
          disabled={!canExpand(state) || state.cash < PAD_COST}
          onClick={() => setState((s) => expandPad(s))}
        >
          <Plus size={18} />
          <span>
            <b>Unlock pad</b>
            <small>{fmtCash(PAD_COST)}</small>
          </span>
        </button>
        <button
          type="button"
          className="ty-buy aqua"
          disabled={state.cash < tankCost}
          onClick={() => setState((s) => expandDisposal(s))}
        >
          <Droplets size={18} />
          <span>
            <b>Tank upgrade</b>
            <small>{fmtCash(tankCost)}</small>
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
          <RotateCcw size={16} /> Reset
        </button>
      </aside>

      <div className="ty-keys" aria-hidden>
        <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
        <span>run</span>
        <kbd>E</kbd>
        <span>hold to build</span>
      </div>
    </div>
  );
}
