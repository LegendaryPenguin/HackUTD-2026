/** Oil Tycoon — snappy walkabout money sim. */

export type Pad = {
  id: string;
  x: number;
  z: number;
  level: number;
};

export type Coin = {
  id: number;
  x: number;
  z: number;
  value: number;
  born: number;
  wellX: number;
  wellZ: number;
};

export type Popup = {
  id: number;
  title: string;
  body: string;
  tone: 'mint' | 'coral' | 'amber' | 'sky';
  born: number;
};

export type FloatText = {
  id: number;
  amount: number;
  x: number;
  z: number;
  born: number;
};

export type TycoonState = {
  cash: number;
  waterBbl: number;
  waterCap: number;
  pads: Pad[];
  coins: Coin[];
  disposeLevel: number;
  tick: number;
  shutIn: boolean;
  pops: { id: number; amount: number; born: number }[];
  floats: FloatText[];
  popups: Popup[];
  dropPulse: number;
  totalEarned: number;
  sessionSec: number;
};

export const DRILL_COST = 350;
export const UPGRADE_BASE = 500;
export const PAD_COST = 800;
export const DISPOSE_COST = 650;
export const DISPOSE_GAIN = 220;
export const OIL_PER_LEVEL = 40;
export const WATER_RATIO = 0.32;
export const START_CASH = 500;
export const START_WATER_CAP = 320;
export const COIN_VALUE = 22;
export const PICKUP_R = 1.6;
export const MAGNET_R = 3.8;
export const MAX_COINS = 48;

const PAD_SLOTS: { x: number; z: number }[] = [
  { x: -5.5, z: 2 },
  { x: -2, z: 3 },
  { x: 1.5, z: 2.8 },
  { x: 5, z: 1.8 },
  { x: -5, z: -1.5 },
  { x: -1.2, z: -2.4 },
  { x: 2.4, z: -2 },
  { x: 5.2, z: -3.4 },
  { x: -3, z: -5.2 },
];

let seq = 1;

function pushPopup(state: TycoonState, title: string, body: string, tone: Popup['tone']): Popup[] {
  return [...state.popups.slice(-3), { id: seq++, title, body, tone, born: performance.now() }];
}

function seedCoins(pads: Pad[]): Coin[] {
  const well = pads.find((p) => p.level > 0);
  if (!well) return [];
  const out: Coin[] = [];
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    out.push({
      id: seq++,
      x: well.x + Math.cos(ang) * 1.4,
      z: well.z + Math.sin(ang) * 1.4,
      value: COIN_VALUE,
      born: performance.now() - 500,
      wellX: well.x,
      wellZ: well.z,
    });
  }
  return out;
}

export function createTycoon(): TycoonState {
  const pads: Pad[] = [
    { id: 'pad-0', x: PAD_SLOTS[0].x, z: PAD_SLOTS[0].z, level: 1 },
    { id: 'pad-1', x: PAD_SLOTS[1].x, z: PAD_SLOTS[1].z, level: 0 },
  ];
  return {
    cash: START_CASH,
    waterBbl: 24,
    waterCap: START_WATER_CAP,
    pads,
    coins: seedCoins(pads),
    disposeLevel: 1,
    tick: 0,
    shutIn: false,
    pops: [],
    floats: [],
    popups: [{
      id: seq++,
      title: 'Let\'s get rich!',
      body: 'WASD to run · coins fly to you · hold E on a glow pad to build',
      tone: 'sky',
      born: performance.now(),
    }],
    dropPulse: 0,
    totalEarned: 0,
    sessionSec: 0,
  };
}

export function oilRate(state: TycoonState): number {
  if (state.shutIn) return 0;
  return state.pads.reduce((sum, p) => sum + (p.level > 0 ? OIL_PER_LEVEL * p.level : 0), 0);
}

/** Approximate $/sec from coin drip rate. */
export function incomePerSec(state: TycoonState): number {
  const wells = state.pads.filter((p) => p.level > 0);
  if (!wells.length || state.shutIn) return 0;
  const interval = Math.max(0.22, 0.55 / wells.length);
  const avgValue = wells.reduce((s, w) => s + COIN_VALUE * w.level, 0) / wells.length;
  return avgValue / interval;
}

export function upgradeCost(level: number): number {
  return Math.round(UPGRADE_BASE * Math.pow(1.42, Math.max(0, level - 1)));
}

export function disposeCost(level: number): number {
  return Math.round(DISPOSE_COST * Math.pow(1.32, level - 1));
}

export function canExpand(state: TycoonState): boolean {
  return state.pads.length < PAD_SLOTS.length;
}

export function drill(state: TycoonState, padId: string): TycoonState {
  const pad = state.pads.find((p) => p.id === padId);
  if (!pad || pad.level > 0) return state;
  if (state.cash < DRILL_COST) {
    return { ...state, popups: pushPopup(state, 'Need more cash!', `Grab coins · need ${fmtCash(DRILL_COST)}`, 'coral') };
  }
  return {
    ...state,
    cash: state.cash - DRILL_COST,
    pads: state.pads.map((p) => (p.id === padId ? { ...p, level: 1 } : p)),
    popups: pushPopup(state, 'Well drilled!', 'New pumpjack · watch the coins fly ✨', 'mint'),
  };
}

export function upgrade(state: TycoonState, padId: string): TycoonState {
  const pad = state.pads.find((p) => p.id === padId);
  if (!pad || pad.level < 1) return state;
  if (pad.level >= 5) {
    return { ...state, popups: pushPopup(state, 'Max level!', 'Unlock another pad instead', 'amber') };
  }
  const cost = upgradeCost(pad.level);
  if (state.cash < cost) {
    return { ...state, popups: pushPopup(state, 'Almost!', `Need ${fmtCash(cost)} more`, 'coral') };
  }
  return {
    ...state,
    cash: state.cash - cost,
    pads: state.pads.map((p) => (p.id === padId ? { ...p, level: p.level + 1 } : p)),
    popups: pushPopup(state, 'Power up!', `Well → Lv ${pad.level + 1} · faster coins`, 'amber'),
  };
}

export function expandPad(state: TycoonState): TycoonState {
  if (!canExpand(state)) {
    return { ...state, popups: pushPopup(state, 'Plot full!', 'All pads unlocked', 'coral') };
  }
  if (state.cash < PAD_COST) {
    return { ...state, popups: pushPopup(state, 'Need cash!', `Unlock costs ${fmtCash(PAD_COST)}`, 'coral') };
  }
  const slot = PAD_SLOTS[state.pads.length];
  return {
    ...state,
    cash: state.cash - PAD_COST,
    pads: [...state.pads, { id: `pad-${state.pads.length}`, x: slot.x, z: slot.z, level: 0 }],
    popups: pushPopup(state, 'New pad!', 'Run over · hold E to drill', 'sky'),
  };
}

export function expandDisposal(state: TycoonState): TycoonState {
  const cost = disposeCost(state.disposeLevel);
  if (state.cash < cost) {
    return { ...state, popups: pushPopup(state, 'Need cash!', `Tank upgrade is ${fmtCash(cost)}`, 'coral') };
  }
  const nextCap = state.waterCap + DISPOSE_GAIN;
  return {
    ...state,
    cash: state.cash - cost,
    waterCap: nextCap,
    disposeLevel: state.disposeLevel + 1,
    shutIn: false,
    popups: pushPopup(state, 'Tanks expanded!', 'Keep those wells dripping', 'mint'),
  };
}

/** Magnet + pickup. Mutates coin positions toward player when in magnet range. */
export function pickupNear(state: TycoonState, x: number, z: number, dt = 0.05): TycoonState {
  if (state.coins.length === 0) return state;

  let cash = state.cash;
  let gained = 0;
  const floats = [...state.floats];
  const kept: Coin[] = [];
  const now = performance.now();

  for (const c of state.coins) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d <= PICKUP_R) {
      cash += c.value;
      gained += c.value;
      floats.push({ id: seq++, amount: c.value, x, z, born: now });
      continue;
    }
    if (d <= MAGNET_R) {
      const pull = Math.min(1, 10 * dt / Math.max(d, 0.2));
      kept.push({
        ...c,
        x: c.x + (x - c.x) * pull,
        z: c.z + (z - c.z) * pull,
      });
    } else {
      kept.push(c);
    }
  }

  if (gained <= 0 && kept.length === state.coins.length) {
    // still update magnet positions
    const moved = kept.some((c, i) => c.x !== state.coins[i]?.x || c.z !== state.coins[i]?.z);
    if (!moved) return state;
    return { ...state, coins: kept };
  }

  return {
    ...state,
    cash,
    coins: kept,
    totalEarned: state.totalEarned + gained,
    pops: gained > 0
      ? [...state.pops.slice(-12), { id: seq++, amount: gained, born: now }]
      : state.pops,
    floats: floats.filter((f) => now - f.born < 900).slice(-16),
  };
}

export function tick(state: TycoonState, dt: number): TycoonState {
  const step = Math.min(0.25, Math.max(0, dt));
  if (step <= 0) return state;

  const rate = oilRate(state);
  const oilGain = (rate / 60) * step * 16;
  const waterGain = oilGain * WATER_RATIO;

  let water = state.waterBbl + waterGain;
  let shutIn = state.shutIn;
  let popups = state.popups;

  if (water >= state.waterCap) {
    water = state.waterCap;
    if (!shutIn) {
      shutIn = true;
      popups = pushPopup(state, 'Tanks full!', 'Buy Tank Upgrade — wells pause until you do', 'coral');
    }
  } else if (shutIn && water < state.waterCap * 0.88) {
    shutIn = false;
    popups = pushPopup(state, 'We\'re back!', 'Coins dripping again', 'mint');
  }

  let coins = state.coins;
  let dropPulse = state.dropPulse;
  if (!shutIn && rate > 0) {
    dropPulse += step;
    const wells = state.pads.filter((p) => p.level > 0);
    const interval = Math.max(0.22, 0.55 / Math.max(1, wells.length));
    while (dropPulse >= interval && coins.length < MAX_COINS) {
      dropPulse -= interval;
      const well = wells[Math.floor(Math.random() * wells.length)];
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.7 + Math.random() * 1.1;
      coins = [
        ...coins,
        {
          id: seq++,
          x: well.x + Math.cos(ang) * rad,
          z: well.z + Math.sin(ang) * rad,
          value: COIN_VALUE * well.level,
          born: performance.now(),
          wellX: well.x,
          wellZ: well.z,
        },
      ];
    }
  }

  const now = performance.now();
  return {
    ...state,
    tick: state.tick + 1,
    sessionSec: state.sessionSec + step,
    waterBbl: water,
    shutIn,
    coins,
    dropPulse,
    popups: popups.filter((p) => now - p.born < 3800).slice(-4),
    pops: state.pops.filter((p) => now - p.born < 1100),
    floats: state.floats.filter((f) => now - f.born < 900),
  };
}

export function dismissPopup(state: TycoonState, id: number): TycoonState {
  return { ...state, popups: state.popups.filter((p) => p.id !== id) };
}

export function fmtCash(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.floor(n).toLocaleString()}`;
}

export function fmtRate(n: number): string {
  return `${Math.round(n)}/min`;
}

export function fmtPerSec(n: number): string {
  if (n >= 100) return `$${Math.round(n)}/s`;
  return `$${n.toFixed(1)}/s`;
}
