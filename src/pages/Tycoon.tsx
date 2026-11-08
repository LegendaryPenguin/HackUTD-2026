import { useEffect, useState } from 'react';
import { Droplets, Plus, RotateCcw, X } from 'lucide-react';
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
  fmtRate,
  oilRate,
  pickupNear,
  tick,
  upgrade,
  type TycoonState,
} from '../lib/tycoon';

export default function Tycoon() {
  const [state, setState] = useState<TycoonState>(() => createTycoon());
  const [prompt, setPrompt] = useState<Prompt>({ kind: 'idle' });

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

  const rate = oilRate(state);
  const waterPct = state.waterCap > 0 ? state.waterBbl / state.waterCap : 0;
  const tankCost = disposeCost(state.disposeLevel);
  const wells = state.pads.filter((p) => p.level > 0).length;
  const topPopup = state.popups[state.popups.length - 1] ?? null;

  const promptText = (() => {
    if (prompt.kind === 'buy') return prompt.canAfford ? `E · ${prompt.label} (${fmtCash(prompt.cost)})` : `Need ${fmtCash(prompt.cost)} — grab more coins!`;
    if (prompt.kind === 'upgrade') return prompt.canAfford ? `E · ${prompt.label} (${fmtCash(prompt.cost)})` : `Need ${fmtCash(prompt.cost)}`;
    if (prompt.kind === 'max') return 'This well is maxed — unlock another pad!';
    return 'WASD run · walk over coins · E on glow pads';
  })();

  return (
    <div className="tycoon-page">
      <div className="tycoon-stage">
        <FieldScene
          pads={state.pads}
          coins={state.coins}
          cash={state.cash}
          waterFill={waterPct}
          shutIn={state.shutIn}
          onBuyPad={(id) => setState((s) => drill(s, id))}
          onUpgradePad={(id) => setState((s) => upgrade(s, id))}
          onPickup={(x, z) => setState((s) => pickupNear(s, x, z))}
          onPrompt={setPrompt}
        />
      </div>

      <header className="ty-top">
        <div>
          <p className="ty-kicker">Extra · cute money sim</p>
          <h1 className="ty-title">Oil Tycoon</h1>
        </div>
        <div className="ty-cash">
          <span>Cash</span>
          <strong className={state.pops.length ? 'bump' : ''}>{fmtCash(state.cash)}</strong>
        </div>
      </header>

      <div className={`ty-meter ${state.shutIn ? 'critical' : waterPct > 0.7 ? 'hot' : ''}`}>
        <div className="ty-meter-fill" style={{ width: `${Math.min(100, waterPct * 100)}%` }} />
        <span>
          💧 {Math.round(waterPct * 100)}% · 🛢️ {wells} wells · ✨ {fmtRate(rate)} · earned {fmtCash(state.totalEarned)}
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

      <div className={`ty-prompt ${prompt.kind !== 'idle' ? 'live' : ''}`}>{promptText}</div>

      <div className="ty-pops" aria-hidden>
        {state.pops.map((p) => (
          <span key={p.id} className="ty-pop">+{fmtCash(p.amount)}</span>
        ))}
      </div>

      <aside className="ty-shop">
        <div className="ty-shop-head">
          <h2>Field shop 🛒</h2>
          <p>Grow the plot while coins pile up.</p>
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
            setState(createTycoon());
            setPrompt({ kind: 'idle' });
          }}
        >
          <RotateCcw size={16} /> Reset field
        </button>
      </aside>

      <div className="ty-keys" aria-hidden>
        <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
        <span>run</span>
        <kbd>E</kbd>
        <span>build</span>
      </div>
    </div>
  );
}
