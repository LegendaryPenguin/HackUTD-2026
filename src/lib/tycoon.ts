/** Oil Tycoon — cute walkabout money sim (HackKU-inspired). */

export type Pad = {
  id: string;
  x: number;
  z: number;
  /** 0 = empty buy pad, 1+ = well level */
  level: number;
};

export type Coin = {
  id: number;
  x: number;
  z: number;
  value: number;
  born: number;
};

export type Popup = {
  id: number;
  title: string;
  body: string;
  tone: 'mint' | 'coral' | 'amber' | 'sky';
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
  popups: Popup[];
  dropPulse: number;
  totalEarned: number;
};

export const DRILL_COST = 400;
export const UPGRADE_BASE = 600;
export const PAD_COST = 900;
export const DISPOSE_COST = 700;
export const DISPOSE_GAIN = 200;
export const OIL_PER_LEVEL = 36;
export const WATER_RATIO = 0.4;
export const START_CASH = 450;
export const START_WATER_CAP = 280;
export const COIN_VALUE = 18;
export const PICKUP_R = 1.35;
export const MAX_COINS = 40;

const PAD_SLOTS: { x: number; z: number }[] = [
  { x: -6, z: 2.5 },
  { x: -2.5, z: 3.5 },
  { x: 1.5, z: 3.2 },
  { x: 5, z: 2.2 },
  { x: -5.5, z: -1.2 },
  { x: -1.5, z: -2.2 },
  { x: 2.5, z: -1.8 },
  { x: 5.5, z: -3.2 },
  { x: -3.5, z: -5 },
];

let seq = 1;

function pushPopup(state: TycoonState, title: string, body: string, tone: Popup['tone']): Popup[] {
  return [...state.popups.slice(-3), { id: seq++, title, body, tone, born: performance.now() }];
}

export function createTycoon(): TycoonState {
  return {
    cash: START_CASH,
    waterBbl: 30,
    waterCap: START_WATER_CAP,
    pads: [
      { id: 'pad-0', x: PAD_SLOTS[0].x, z: PAD_SLOTS[0].z, level: 1 },
      { id: 'pad-1', x: PAD_SLOTS[1].x, z: PAD_SLOTS[1].z, level: 0 },
    ],
    coins: [],
    disposeLevel: 1,
    tick: 0,
    shutIn: false,
    pops: [],
    popups: [{
      id: seq++,
      title: 'Welcome, field buddy!',
      body: 'Run with WASD · walk over coins · stand on a glow pad and press E',
      tone: 'sky',
      born: performance.now(),
    }],
    dropPulse: 0,
    totalEarned: 0,
  };
}

export function oilRate(state: TycoonState): number {
  if (state.shutIn) return 0;
  return state.pads.reduce((sum, p) => sum + (p.level > 0 ? OIL_PER_LEVEL * p.level : 0), 0);
}

export function upgradeCost(level: number): number {
  return Math.round(UPGRADE_BASE * Math.pow(1.45, Math.max(0, level - 1)));
}

export function disposeCost(level: number): number {
  return Math.round(DISPOSE_COST * Math.pow(1.35, level - 1));
}

export function canExpand(state: TycoonState): boolean {
  return state.pads.length < PAD_SLOTS.length;
}

export function drill(state: TycoonState, padId: string): TycoonState {
  const pad = state.pads.find((p) => p.id === padId);
  if (!pad || pad.level > 0) return state;
  if (state.cash < DRILL_COST) {
    return { ...state, popups: pushPopup(state, 'Oops!', `Need ${fmtCash(DRILL_COST)} first`, 'coral') };
  }
  return {
    ...state,
    cash: state.cash - DRILL_COST,
    pads: state.pads.map((p) => (p.id === padId ? { ...p, level: 1 } : p)),
    popups: pushPopup(state, 'New well!', 'Pumpjack online — coins incoming ✨', 'mint'),
  };
}

export function upgrade(state: TycoonState, padId: string): TycoonState {
  const pad = state.pads.find((p) => p.id === padId);
  if (!pad || pad.level < 1) return state;
  if (pad.level >= 5) {
    return { ...state, popups: pushPopup(state, 'Maxed out!', 'This well is already Lv 5', 'amber') };
  }
  const cost = upgradeCost(pad.level);
  if (state.cash < cost) {
    return { ...state, popups: pushPopup(state, 'Not enough!', `Need ${fmtCash(cost)}`, 'coral') };
  }
  return {
    ...state,
    cash: state.cash - cost,
    pads: state.pads.map((p) => (p.id === padId ? { ...p, level: p.level + 1 } : p)),
    popups: pushPopup(state, 'Upgrade!', `Well is now Lv ${pad.level + 1} 💛`, 'amber'),
  };
}

export function expandPad(state: TycoonState): TycoonState {
  if (!canExpand(state)) {
    return { ...state, popups: pushPopup(state, 'Full plot!', 'No more pad slots', 'coral') };
  }
  if (state.cash < PAD_COST) {
    return { ...state, popups: pushPopup(state, 'Not enough!', `Need ${fmtCash(PAD_COST)}`, 'coral') };
  }
  const slot = PAD_SLOTS[state.pads.length];
  return {
    ...state,
    cash: state.cash - PAD_COST,
    pads: [...state.pads, { id: `pad-${state.pads.length}`, x: slot.x, z: slot.z, level: 0 }],
    popups: pushPopup(state, 'New pad!', 'Run over and press E to drill', 'sky'),
  };
}

export function expandDisposal(state: TycoonState): TycoonState {
  const cost = disposeCost(state.disposeLevel);
  if (state.cash < cost) {
    return { ...state, popups: pushPopup(state, 'Not enough!', `Need ${fmtCash(cost)}`, 'coral') };
  }
  const nextCap = state.waterCap + DISPOSE_GAIN;
  return {
    ...state,
    cash: state.cash - cost,
    waterCap: nextCap,
    disposeLevel: state.disposeLevel + 1,
    shutIn: false,
    popups: pushPopup(state, 'Tank upgrade!', `Water roomy again · cap ${nextCap}`, 'mint'),
  };
}

/** Walk-over pickup — call from the scene with player position. */
export function pickupNear(state: TycoonState, x: number, z: number): TycoonState {
  if (state.coins.length === 0) return state;
  let cash = state.cash;
  let gained = 0;
  const kept: Coin[] = [];
  for (const c of state.coins) {
    if (Math.hypot(c.x - x, c.z - z) <= PICKUP_R) {
      cash += c.value;
      gained += c.value;
    } else {
      kept.push(c);
    }
  }
  if (gained <= 0) return state;
  const now = performance.now();
  return {
    ...state,
    cash,
    coins: kept,
    totalEarned: state.totalEarned + gained,
    pops: [...state.pops.slice(-10), { id: seq++, amount: gained, born: now }],
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
      popups = pushPopup(state, 'Tanks full!', 'Buy a Tank Upgrade so wells keep dripping', 'coral');
    }
  } else if (shutIn && water < state.waterCap * 0.88) {
    shutIn = false;
    popups = pushPopup(state, 'Back online!', 'Wells are dripping coins again', 'mint');
  }

  let coins = state.coins;
  let dropPulse = state.dropPulse;
  if (!shutIn && rate > 0) {
    dropPulse += step;
    // Spawn a coin every ~0.55s scaled by well count
    const interval = Math.max(0.28, 0.7 / Math.max(1, state.pads.filter((p) => p.level > 0).length));
    while (dropPulse >= interval && coins.length < MAX_COINS) {
      dropPulse -= interval;
      const wells = state.pads.filter((p) => p.level > 0);
      const well = wells[Math.floor(Math.random() * wells.length)];
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.9 + Math.random() * 1.4;
      coins = [
        ...coins,
        {
          id: seq++,
          x: well.x + Math.cos(ang) * rad,
          z: well.z + Math.sin(ang) * rad,
          value: COIN_VALUE * well.level,
          born: performance.now(),
        },
      ];
    }
  }

  const now = performance.now();
  return {
    ...state,
    tick: state.tick + 1,
    waterBbl: water,
    shutIn,
    coins,
    dropPulse,
    popups: popups.filter((p) => now - p.born < 4200).slice(-4),
    pops: state.pops.filter((p) => now - p.born < 1200),
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
