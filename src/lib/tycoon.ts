/**
 * Oil Tycoon — 10-year curriculum teaching Avon’s four levers:
 * Wells → Tanks → Pipelines → Trucks. One goal: maximize decade profit.
 *
 * Pace: 5 real seconds = 1 game month → 120 months ≈ 10 minutes.
 * Every 2 real seconds ≈ 12 game days. Clock starts Nov 8, 2026.
 */

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

export type Incident = {
  id: string;
  padId: string;
  kind: 'pump_fail' | 'leak' | 'wear';
  tankPct: number;
  fillPerSec: number;
  repairLeft: number;
  repairTotal: number;
  plan: 'none' | 'truck' | 'shut_in' | 'wait';
  trucks: number;
  shutIn: boolean;
  spent: number;
  doNothingCost: number;
  status: 'open' | 'managed' | 'cleared' | 'shutdown';
};

export type Chapter = 'wells' | 'tanks' | 'pipes' | 'trucks' | 'scale' | 'decade';

export type Tip = {
  id: string;
  title: string;
  body: string;
};

export type CapStats = {
  wells: number;
  tank: number;
  pipe: number;
  truck: number;
};

export type TycoonState = {
  cash: number;
  waterBbl: number;
  waterCap: number;
  pads: Pad[];
  coins: Coin[];
  /** Disposal tank upgrade tier */
  tankLevel: number;
  /** Pipeline capacity tier */
  pipeLevel: number;
  trucksOwned: number;
  tick: number;
  overflowShut: boolean;
  pops: { id: number; amount: number; born: number }[];
  floats: FloatText[];
  popups: Popup[];
  tip: Tip | null;
  tipsSeen: string[];
  dropPulse: number;
  totalEarned: number;
  sessionSec: number;
  /** Absolute game-days since Nov 8 2026 */
  gameDay: number;
  chapter: Chapter;
  unlocked: { tanks: boolean; pipes: boolean; trucks: boolean };
  incident: Incident | null;
  nextCrisisIn: number;
  crisesCleared: number;
  crisesFailed: number;
  savedTotal: number;
  reliefUsed: boolean;
  softlockSec: number;
  decadeDone: boolean;
  /** Visual: trucks currently hauling on the ring */
  trucksBusy: number;
  haulPulse: number;
};

/** Real seconds per game month → 120 months ≈ 10 minutes */
export const REAL_SEC_PER_MONTH = 5;
export const DAYS_PER_MONTH = 30;
export const DECADE_MONTHS = 120;
/** ~12 game days every 2 real seconds */
export const DAYS_PER_REAL_SEC = DAYS_PER_MONTH / REAL_SEC_PER_MONTH;

export const START_Y = 2026;
export const START_M = 10; // November (0-indexed)
export const START_D = 8;

/** Field-scale costs (Permian-ish teaching numbers, simplified) */
export const DRILL_COST = 85_000;
export const UPGRADE_BASE = 95_000;
export const PAD_COST = 140_000;
export const TANK_COST = 110_000;
export const TANK_GAIN = 1_800; // bbl tank capacity
export const PIPE_COST = 125_000;
/** Produced-water disposal capacity per pipe level (bbl/game-day) */
export const PIPE_RATE = 160;
export const TRUCK_FLEET_BASE = 95_000;
/** Oil barrels per game-day per well level */
export const OIL_BPD_PER_LEVEL = 42;
export const WATER_RATIO = 0.32;
export const START_CASH = 220_000;
export const START_WATER_CAP = 2_400;
export const CASH_FLOOR = 35_000;
/** Small bonus scoop. Main money is daily oil sales. */
export const COIN_VALUE = 1_250;
export const PICKUP_R = 1.85;
export const MAGNET_R = 4.6;
export const MAX_COINS = 28;
/** One emergency truck haul */
export const TRUCK_COST = 4_800;
/** Pay to dump water when tanks overflow (not free). */
export const DUMP_COST = 9_600;
export const TRUCK_DROP_PCT = 22;
export const SHUT_THRESHOLD = 92;
/** $/bbl realized oil price */
export const OIL_PRICE_BBL = 68;

/** Central tank farm. Pipes connect pads here. */
export const TANK_POS = { x: -8.5, z: -4.5 };

/** Lease ring radius (matches FieldScene teal ring) */
export const LEASE_R = 14.5;

function buildPadSlots(): { x: number; z: number }[] {
  const slots: { x: number; z: number }[] = [
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
  const minDist = 2.55;
  for (const r of [3.6, 5.8, 8.1, 10.4, 12.2]) {
    const count = Math.max(6, Math.round(r * 2.1));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r * 0.17;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x, z) > LEASE_R - 1.6) continue;
      if (Math.hypot(x - TANK_POS.x, z - TANK_POS.z) < 3.6) continue;
      if (slots.some((s) => Math.hypot(s.x - x, s.z - z) < minDist)) continue;
      slots.push({ x, z });
    }
  }
  return slots;
}

const PAD_SLOTS = buildPadSlots();
export const MAX_PADS = PAD_SLOTS.length;

let seq = 1;

function pushPopup(state: TycoonState, title: string, body: string, tone: Popup['tone']): Popup[] {
  return [...state.popups.slice(-4), { id: seq++, title, body, tone, born: performance.now() }];
}

function withTip(state: TycoonState, id: string, title: string, body: string): TycoonState {
  if (state.tipsSeen.includes(id) || state.tip?.id === id) return state;
  return { ...state, tip: { id, title, body } };
}

function seedCoins(pads: Pad[]): Coin[] {
  const well = pads.find((p) => p.level > 0);
  if (!well) return [];
  return [0, 1, 2].map((i) => {
    const ang = (i / 3) * Math.PI * 2;
    return {
      id: seq++,
      x: well.x + Math.cos(ang) * 1.4,
      z: well.z + Math.sin(ang) * 1.4,
      value: COIN_VALUE,
      born: performance.now() - 500,
      wellX: well.x,
      wellZ: well.z,
    };
  });
}

export function createTycoon(): TycoonState {
  const pads: Pad[] = [
    { id: 'pad-0', x: PAD_SLOTS[0].x, z: PAD_SLOTS[0].z, level: 1 },
    { id: 'pad-1', x: PAD_SLOTS[1].x, z: PAD_SLOTS[1].z, level: 1 },
    { id: 'pad-2', x: PAD_SLOTS[2].x, z: PAD_SLOTS[2].z, level: 0 },
  ];
  return {
    cash: START_CASH,
    waterBbl: 36,
    waterCap: START_WATER_CAP,
    pads,
    coins: seedCoins(pads),
    tankLevel: 1,
    pipeLevel: 0,
    trucksOwned: 0,
    tick: 0,
    overflowShut: false,
    pops: [],
    floats: [],
    popups: [],
    tip: {
      id: 'welcome',
      title: 'Welcome to Nov 2026',
      body: 'You run this field for 10 years. Make as much profit as you can. Walk into coins. Hold E to drill or upgrade a well. Tanks, pipes, and trucks unlock later.',
    },
    tipsSeen: [],
    dropPulse: 0,
    totalEarned: 0,
    sessionSec: 0,
    gameDay: 0,
    chapter: 'wells',
    unlocked: { tanks: false, pipes: false, trucks: false },
    incident: null,
    nextCrisisIn: 22,
    crisesCleared: 0,
    crisesFailed: 0,
    savedTotal: 0,
    reliefUsed: false,
    softlockSec: 0,
    decadeDone: false,
    trucksBusy: 0,
    haulPulse: 0,
  };
}

export function monthsElapsed(state: TycoonState): number {
  return state.sessionSec / REAL_SEC_PER_MONTH;
}

export function calendarParts(state: TycoonState): { y: number; m: number; d: number; label: string; monthIdx: number } {
  const monthIdx = Math.min(DECADE_MONTHS, monthsElapsed(state));
  const totalDays = Math.floor(monthIdx * DAYS_PER_MONTH) + START_D - 1;
  // Build from Nov 8 2026 without Date TZ surprises
  let y = START_Y;
  let m = START_M; // 0-11
  let d = START_D;
  let left = Math.floor(state.gameDay);
  const dim = (yy: number, mm: number) => {
    if (mm === 1) return yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0) ? 29 : 28;
    return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm];
  };
  while (left > 0) {
    const daysLeftInMonth = dim(y, m) - d + 1;
    if (left < daysLeftInMonth) {
      d += left;
      left = 0;
    } else {
      left -= daysLeftInMonth;
      d = 1;
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }
  void totalDays;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return { y, m, d, label: `${months[m]} ${d}, ${y}`, monthIdx };
}

export function chapterMeta(chapter: Chapter): { title: string; goal: string } {
  switch (chapter) {
    case 'wells':
      return { title: 'Chapter 1. Wells', goal: 'Drill and upgrade wells. Oil makes money.' };
    case 'tanks':
      return { title: 'Chapter 2. Tanks', goal: 'Buy more tank space before water hits 92%.' };
    case 'pipes':
      return { title: 'Chapter 3. Pipelines', goal: 'Buy pipes so water drains out of the tanks.' };
    case 'trucks':
      return { title: 'Chapter 4. Trucks', goal: 'Hire trucks for overflow and pump failures.' };
    case 'scale':
      return { title: 'Chapter 5. Scale', goal: 'Grow wells, tanks, pipes, and trucks together.' };
    case 'decade':
      return { title: 'Decade done', goal: 'Score is locked. Reset to play again.' };
  }
}

function padBlocked(state: TycoonState, padId: string): boolean {
  const inc = state.incident;
  if (!inc || inc.padId !== padId) return false;
  if (inc.status === 'shutdown') return true;
  if (inc.kind === 'pump_fail' && (inc.status === 'open' || inc.status === 'managed')) return true;
  return false;
}

/** Oil production in barrels per game-day */
export function oilBpd(state: TycoonState): number {
  if (state.overflowShut || state.decadeDone) return 0;
  return state.pads.reduce((sum, p) => {
    if (p.level < 1) return sum;
    if (padBlocked(state, p.id)) return sum;
    return sum + OIL_BPD_PER_LEVEL * p.level;
  }, 0);
}

/** @deprecated use oilBpd */
export function oilRate(state: TycoonState): number {
  return oilBpd(state);
}

export function pipeCapacity(state: TycoonState): number {
  return state.pipeLevel * PIPE_RATE;
}

/** Net oil profit per game-day (what the HUD shows) */
export function profitPerDay(state: TycoonState): number {
  if (state.overflowShut || state.decadeDone) return 0;
  return oilBpd(state) * OIL_PRICE_BBL;
}

/** @deprecated use profitPerDay */
export function incomePerSec(state: TycoonState): number {
  return profitPerDay(state);
}

export function capStats(state: TycoonState): CapStats {
  const wellsOn = state.pads.filter((p) => p.level > 0 && !padBlocked(state, p.id)).length;
  const waterIn = oilBpd(state) * WATER_RATIO;
  const pipeCap = Math.max(1, pipeCapacity(state));
  return {
    wells: Math.min(1, wellsOn / Math.max(1, PAD_SLOTS.length * 0.55)),
    tank: state.waterCap > 0 ? Math.min(1, state.waterBbl / state.waterCap) : 0,
    pipe: state.pipeLevel <= 0 ? (waterIn > 0 ? 1 : 0) : Math.min(1, waterIn / pipeCap),
    truck: state.trucksOwned <= 0 ? 0 : Math.min(1, state.trucksBusy / state.trucksOwned),
  };
}

export function dismissTip(state: TycoonState): TycoonState {
  if (!state.tip) return state;
  return {
    ...state,
    tipsSeen: state.tipsSeen.includes(state.tip.id) ? state.tipsSeen : [...state.tipsSeen, state.tip.id],
    tip: null,
  };
}

export function emergencyDump(state: TycoonState): TycoonState {
  if (!state.overflowShut) {
    return { ...state, popups: pushPopup(state, 'Tanks are fine', 'Emergency dump only when disposal is full.', 'sky') };
  }
  const need = tankCost(state.tankLevel);
  if (state.reliefUsed && state.cash >= need) {
    return {
      ...state,
      popups: pushPopup(state, 'Buy Bigger tank', `You can afford ${fmtCash(need)}.`, 'amber'),
    };
  }
  const dumped = Math.max(80, state.waterCap * 0.45);
  const fee = Math.min(DUMP_COST, Math.max(0, state.cash));
  return {
    ...state,
    waterBbl: Math.max(0, state.waterBbl - dumped),
    overflowShut: false,
    reliefUsed: true,
    softlockSec: 0,
    cash: Math.max(0, state.cash - fee),
    tip: state.tipsSeen.includes('relief')
      ? state.tip
      : {
          id: 'relief',
          title: 'Back online',
          body: `Dump cost ${fmtCash(fee)}. Buy a bigger tank or more pipe so this does not happen again.`,
        },
    popups: pushPopup(state, 'Emergency dump', `Water cleared for ${fmtCash(fee)}. Produce again, then upgrade disposal.`, 'mint'),
  };
}

export function isSoftlocked(state: TycoonState): boolean {
  return state.overflowShut && state.cash < tankCost(state.tankLevel);
}

export function upgradeCost(level: number): number {
  return Math.round(UPGRADE_BASE * Math.pow(1.42, Math.max(0, level - 1)));
}

export function tankCost(level: number): number {
  return Math.round(TANK_COST * Math.pow(1.3, level - 1));
}

export function pipeCost(level: number): number {
  return Math.round(PIPE_COST * Math.pow(1.34, Math.max(0, level)));
}

export function truckFleetCost(owned: number): number {
  return Math.round(TRUCK_FLEET_BASE + owned * 45_000);
}

export function canExpand(state: TycoonState): boolean {
  return state.pads.length < PAD_SLOTS.length;
}

export function timeToShut(inc: Incident): number {
  if (inc.fillPerSec <= 0) return 999;
  return Math.max(0, (SHUT_THRESHOLD - inc.tankPct) / inc.fillPerSec);
}

export function recommendedPlan(inc: Incident): 'truck' | 'shut_in' | 'wait' {
  const tts = timeToShut(inc);
  if (tts > inc.repairLeft + 1.5) return 'wait';
  if (inc.tankPct + inc.fillPerSec * Math.min(inc.repairLeft, 8) < SHUT_THRESHOLD - 5) return 'truck';
  return 'shut_in';
}

function resolveChapter(state: TycoonState): Chapter {
  const m = monthsElapsed(state);
  if (m >= DECADE_MONTHS) return 'decade';
  if (m >= 24 && state.unlocked.trucks) return 'scale';
  if (state.unlocked.trucks || m >= 14) return 'trucks';
  if (state.unlocked.pipes || m >= 7) return 'pipes';
  if (state.unlocked.tanks || m >= 2.5) return 'tanks';
  return 'wells';
}

function spawnPumpFail(state: TycoonState): TycoonState {
  const candidates = state.pads.filter((p) => p.level > 0);
  if (!candidates.length) return state;
  const pad = candidates[Math.floor(Math.random() * candidates.length)];
  const fillPerSec = 1.6 + pad.level * 0.5;
  const repairTotal = 18 + Math.random() * 8;
  const tankPct = 50 + Math.random() * 12;
  const tts = (SHUT_THRESHOLD - tankPct) / fillPerSec;
  const doNothingCost = Math.round(48_000 + tts * 2_200 + pad.level * 18_000);

  const incident: Incident = {
    id: `inc-${seq++}`,
    padId: pad.id,
    kind: 'pump_fail',
    tankPct,
    fillPerSec,
    repairLeft: repairTotal,
    repairTotal,
    plan: 'none',
    trucks: 0,
    shutIn: false,
    spent: 0,
    doNothingCost,
    status: 'open',
  };

  let next: TycoonState = {
    ...state,
    incident,
    nextCrisisIn: 28 + Math.random() * 18,
    popups: pushPopup(
      state,
      'Pump failure',
      `${pad.id.replace('-', ' ').toUpperCase()} is filling. About ${tts.toFixed(0)}s until 92%. Pick a plan.`,
      'coral',
    ),
  };
  next = withTip(
    next,
    'crisis',
    'Pick a plan',
    'Truck empties some water. Shut in slows the fill but stops oil on that well. Wait only if repair finishes before 92%.',
  );
  return next;
}

export function dispatchTruck(state: TycoonState): TycoonState {
  const inc = state.incident;
  if (!inc || (inc.status !== 'open' && inc.status !== 'managed')) return state;
  if (state.trucksOwned < 1) {
    return { ...state, popups: pushPopup(state, 'No trucks yet', 'Unlock Hire truck in the shop first.', 'amber') };
  }
  if (state.cash < TRUCK_COST) {
    return { ...state, popups: pushPopup(state, 'Need cash', `Haul costs ${fmtCash(TRUCK_COST)}`, 'coral') };
  }
  if (inc.trucks >= state.trucksOwned) {
    return { ...state, popups: pushPopup(state, 'Fleet busy', `Only ${state.trucksOwned} trucks on shift`, 'amber') };
  }
  return {
    ...state,
    cash: state.cash - TRUCK_COST,
    trucksBusy: Math.min(state.trucksOwned, state.trucksBusy + 1),
    incident: {
      ...inc,
      tankPct: Math.max(28, inc.tankPct - TRUCK_DROP_PCT),
      trucks: inc.trucks + 1,
      spent: inc.spent + TRUCK_COST,
      plan: 'truck',
      status: 'managed',
    },
    popups: pushPopup(state, 'Trucks rolling', `Tank down ${TRUCK_DROP_PCT}%. Spent ${fmtCash(TRUCK_COST)}.`, 'mint'),
  };
}

export function shutInWells(state: TycoonState): TycoonState {
  const inc = state.incident;
  if (!inc || (inc.status !== 'open' && inc.status !== 'managed')) return state;
  if (inc.shutIn) return state;
  return {
    ...state,
    incident: {
      ...inc,
      shutIn: true,
      fillPerSec: inc.fillPerSec * 0.32,
      plan: 'shut_in',
      status: 'managed',
    },
    popups: pushPopup(state, 'Wells shut in', 'Fill is slower now. This pad stops making coins until repair finishes.', 'amber'),
  };
}

export function chooseWait(state: TycoonState): TycoonState {
  const inc = state.incident;
  if (!inc || inc.status !== 'open') return state;
  const tts = timeToShut(inc);
  if (tts < inc.repairLeft + 1) {
    return {
      ...state,
      popups: pushPopup(
        state,
        'Cannot wait',
        `Only ${tts.toFixed(0)}s left to 92%. Repair needs ${inc.repairLeft.toFixed(0)}s. Use a truck or shut in.`,
        'coral',
      ),
    };
  }
  return {
    ...state,
    incident: { ...inc, plan: 'wait', status: 'managed' },
    popups: pushPopup(state, 'Waiting it out', 'You should stay under 92%. This is the cheapest plan.', 'mint'),
  };
}

export function drill(state: TycoonState, padId: string): TycoonState {
  const pad = state.pads.find((p) => p.id === padId);
  if (!pad || pad.level > 0) return state;
  if (state.cash < DRILL_COST) {
    return { ...state, popups: pushPopup(state, 'Need more cash', `Need ${fmtCash(DRILL_COST)}`, 'coral') };
  }
  return {
    ...state,
    cash: state.cash - DRILL_COST,
    pads: state.pads.map((p) => (p.id === padId ? { ...p, level: 1 } : p)),
    popups: pushPopup(state, 'Well drilled', 'More oil. Also more water to manage.', 'mint'),
  };
}

export function upgrade(state: TycoonState, padId: string): TycoonState {
  const pad = state.pads.find((p) => p.id === padId);
  if (!pad || pad.level < 1) return state;
  if (pad.level >= 5) {
    return { ...state, popups: pushPopup(state, 'Max level', 'Unlock another pad', 'amber') };
  }
  const cost = upgradeCost(pad.level);
  if (state.cash < cost) {
    return { ...state, popups: pushPopup(state, 'Almost!', `Need ${fmtCash(cost)}`, 'coral') };
  }
  return {
    ...state,
    cash: state.cash - cost,
    pads: state.pads.map((p) => (p.id === padId ? { ...p, level: p.level + 1 } : p)),
    popups: pushPopup(state, 'Well upgraded', `This well is now level ${pad.level + 1}.`, 'amber'),
  };
}

export function expandPad(state: TycoonState): TycoonState {
  if (!canExpand(state)) {
    return {
      ...state,
      popups: pushPopup(state, 'Lease full', `All ${MAX_PADS} pad sites on this circle are claimed.`, 'coral'),
    };
  }
  if (state.cash < PAD_COST) {
    return { ...state, popups: pushPopup(state, 'Need cash', `New well ${fmtCash(PAD_COST)}`, 'coral') };
  }
  const slot = PAD_SLOTS[state.pads.length];
  return {
    ...state,
    cash: state.cash - PAD_COST,
    pads: [...state.pads, { id: `pad-${state.pads.length}`, x: slot.x, z: slot.z, level: 0 }],
    popups: pushPopup(state, 'New pad!', 'Hold E at the ring to drill', 'sky'),
  };
}

export function expandTank(state: TycoonState): TycoonState {
  if (!state.unlocked.tanks) {
    return { ...state, popups: pushPopup(state, 'Locked', 'Tanks unlock in chapter 2.', 'amber') };
  }
  const cost = tankCost(state.tankLevel);
  if (state.cash < cost) {
    return { ...state, popups: pushPopup(state, 'Need cash', `A bigger tank costs ${fmtCash(cost)}.`, 'coral') };
  }
  return {
    ...state,
    cash: state.cash - cost,
    waterCap: state.waterCap + TANK_GAIN,
    tankLevel: state.tankLevel + 1,
    overflowShut: false,
    waterBbl: Math.min(state.waterBbl, state.waterCap + TANK_GAIN - 20),
    popups: pushPopup(state, 'Bigger tank', `Tank capacity is now ${state.waterCap + TANK_GAIN} barrels.`, 'mint'),
  };
}

export function expandPipe(state: TycoonState): TycoonState {
  if (!state.unlocked.pipes) {
    return { ...state, popups: pushPopup(state, 'Locked', 'Pipelines unlock in chapter 3.', 'amber') };
  }
  const cost = pipeCost(state.pipeLevel);
  if (state.cash < cost) {
    return { ...state, popups: pushPopup(state, 'Need cash', `Pipeline costs ${fmtCash(cost)}.`, 'coral') };
  }
  const nextLevel = state.pipeLevel + 1;
  let next: TycoonState = {
    ...state,
    cash: state.cash - cost,
    pipeLevel: nextLevel,
    popups: pushPopup(state, 'Pipeline laid', `Pipes can drain ${nextLevel * PIPE_RATE} barrels per game day. Watch them grow on the field.`, 'sky'),
  };
  next = withTip(
    next,
    'pipes-built',
    'Pipes are online',
    'Yellow lines move water from wells to the tanks. If the pipe bar stays red, buy more pipeline.',
  );
  return next;
}

export function buyTruck(state: TycoonState): TycoonState {
  if (!state.unlocked.trucks) {
    return { ...state, popups: pushPopup(state, 'Locked', 'Trucks unlock in chapter 4.', 'amber') };
  }
  const cost = truckFleetCost(state.trucksOwned);
  if (state.cash < cost) {
    return { ...state, popups: pushPopup(state, 'Need cash', `A truck costs ${fmtCash(cost)}.`, 'coral') };
  }
  return {
    ...state,
    cash: state.cash - cost,
    trucksOwned: state.trucksOwned + 1,
    popups: pushPopup(state, 'Truck hired', `Fleet size is now ${state.trucksOwned + 1}. Watch trucks on the ring road.`, 'amber'),
  };
}

export function pickupNear(state: TycoonState, x: number, z: number, dt: number): TycoonState {
  if (state.decadeDone) return state;
  const now = performance.now();
  let cash = state.cash;
  let gained = 0;
  const floats = [...state.floats];
  const kept: Coin[] = [];

  for (const c of state.coins) {
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < PICKUP_R) {
      cash += c.value;
      gained += c.value;
      floats.push({ id: seq++, amount: c.value, x: c.x, z: c.z, born: now });
    } else if (d < MAGNET_R) {
      const pull = Math.min(1, (1 - d / MAGNET_R) * 10 * dt);
      kept.push({
        ...c,
        x: c.x + dx * pull,
        z: c.z + dz * pull,
      });
    } else {
      kept.push(c);
    }
  }

  if (gained <= 0) {
    return { ...state, coins: kept };
  }

  return {
    ...state,
    cash,
    coins: kept,
    totalEarned: state.totalEarned + gained,
    pops: gained > 0 ? [...state.pops.slice(-12), { id: seq++, amount: gained, born: now }] : state.pops,
    floats: floats.filter((f) => now - f.born < 900).slice(-16),
  };
}

export function tick(state: TycoonState, dt: number): TycoonState {
  const step = Math.min(0.25, Math.max(0, dt));
  if (step <= 0) return state;
  if (state.decadeDone) return state;

  let next: TycoonState = {
    ...state,
    sessionSec: state.sessionSec + step,
    gameDay: state.gameDay + DAYS_PER_REAL_SEC * step,
    tick: state.tick + 1,
  };
  let popups = next.popups;

  // --- Curriculum unlocks by month ---
  const m = monthsElapsed(next);
  const unlocked = { ...next.unlocked };
  if (!unlocked.tanks && m >= 2.2) {
    unlocked.tanks = true;
    next = withTip(
      { ...next, unlocked, popups: pushPopup(next, 'Chapter 2', 'Tanks are unlocked. Store the water your wells make.', 'sky') },
      'ch-tanks',
      'Buy tank space',
      'Wells make oil and water. Buy a bigger tank in the shop. If the tank bar hits 92%, wells can shut down.',
    );
    popups = next.popups;
  } else if (!unlocked.pipes && m >= 6.5) {
    unlocked.pipes = true;
    next = withTip(
      { ...next, unlocked, popups: pushPopup(next, 'Chapter 3', 'Pipelines are unlocked. Water can drain every second.', 'sky') },
      'ch-pipes',
      'Lay a pipeline',
      'Pipes pull water out of the tanks. Without pipes, water just piles up. Buy Pipeline and watch lines connect wells to tanks.',
    );
    popups = next.popups;
  } else if (!unlocked.trucks && m >= 12) {
    unlocked.trucks = true;
    next = withTip(
      { ...next, unlocked, popups: pushPopup(next, 'Chapter 4', 'Trucks are unlocked. Use them for emergencies.', 'sky') },
      'ch-trucks',
      'Hire trucks',
      'When a pump fails or pipes cannot keep up, trucks haul water. Your fleet drives on the ring road.',
    );
    popups = next.popups;
  } else {
    next = { ...next, unlocked };
  }

  if (m >= DECADE_MONTHS) {
    return {
      ...next,
      decadeDone: true,
      chapter: 'decade',
      overflowShut: false,
      tip: {
        id: 'decade',
        title: 'Decade complete. 2036',
        body: `Final cash is ${fmtCash(next.cash)}. You earned ${fmtCash(next.totalEarned)} total. Crises cleared: ${next.crisesCleared}. Reset to play again.`,
      },
      popups: pushPopup(next, '2036', 'Ten years are done. Your score is locked.', 'mint'),
    };
  }

  next = { ...next, chapter: resolveChapter(next) };

  // --- Crisis ---
  if (next.incident && next.incident.status !== 'cleared') {
    let inc = { ...next.incident };
    if (inc.status === 'open' || inc.status === 'managed') {
      inc.tankPct = Math.min(100, inc.tankPct + inc.fillPerSec * step);
      inc.repairLeft = Math.max(0, inc.repairLeft - step);

      if (inc.tankPct >= SHUT_THRESHOLD) {
        inc = { ...inc, status: 'shutdown', tankPct: SHUT_THRESHOLD, shutIn: true, fillPerSec: 0 };
        const penalty = Math.round(inc.doNothingCost * 0.85);
        next = {
          ...next,
          cash: Math.max(CASH_FLOOR, next.cash - penalty),
          crisesFailed: next.crisesFailed + 1,
          trucksBusy: Math.max(0, next.trucksBusy - 1),
          popups: pushPopup(next, '92% shut in', `You lost about ${fmtCash(penalty)}. Keep some cash so you can recover.`, 'coral'),
        };
        popups = next.popups;
      } else if (inc.repairLeft <= 0 && inc.tankPct < SHUT_THRESHOLD) {
        const saved = Math.max(0, inc.doNothingCost - inc.spent);
        inc = { ...inc, status: 'cleared', repairLeft: 0 };
        next = {
          ...next,
          crisesCleared: next.crisesCleared + 1,
          savedTotal: next.savedTotal + saved,
          trucksBusy: Math.max(0, next.trucksBusy - inc.trucks),
          incident: inc,
          popups: pushPopup(next, 'Repair complete', `You saved ${fmtCash(saved)} compared to doing nothing.`, 'mint'),
        };
        popups = next.popups;
      }
    } else if (inc.status === 'shutdown') {
      inc.repairLeft = Math.max(0, inc.repairLeft - step);
      if (inc.repairLeft <= 0) {
        inc = { ...inc, status: 'cleared' };
        popups = pushPopup(next, 'Pad recovering', 'The pump is fixed. Production can start again.', 'amber');
      }
    }
    next = { ...next, incident: inc.status === 'cleared' ? null : inc, popups };
  } else if (unlocked.trucks || m >= 10) {
    next = { ...next, nextCrisisIn: next.nextCrisisIn - step };
    if (next.nextCrisisIn <= 0 && next.pads.some((p) => p.level > 0)) {
      next = spawnPumpFail(next);
    }
  }

  // --- Water balance in game-days (bbl) ---
  const days = DAYS_PER_REAL_SEC * step;
  const waterIn = oilBpd(next) * WATER_RATIO * days;
  const drain = pipeCapacity(next) * days;
  let water = next.waterBbl + waterIn - drain;
  let overflowShut = next.overflowShut;
  let reliefUsed = next.reliefUsed;
  let trucksBusy = next.trucksBusy;
  let haulPulse = next.haulPulse;

  // Passive truck skim when tank high
  if (next.trucksOwned > 0 && water / next.waterCap > 0.72 && !overflowShut) {
    haulPulse += step;
    if (haulPulse > 3.2) {
      haulPulse = 0;
      const haul = Math.min(water * 0.12, 40 + next.trucksOwned * 18);
      water -= haul;
      trucksBusy = Math.min(next.trucksOwned, Math.max(1, trucksBusy));
    }
  } else {
    haulPulse = Math.max(0, haulPulse - step);
    if (haulPulse <= 0) trucksBusy = next.incident ? trucksBusy : Math.max(0, trucksBusy - step * 0.4);
  }

  if (water >= next.waterCap) {
    water = next.waterCap;
    if (!overflowShut) {
      overflowShut = true;
      reliefUsed = false;
      popups = pushPopup(next, 'Tanks full', 'Production paused. Buy a bigger tank, more pipe, or use Emergency dump.', 'coral');
      next = withTip(
        { ...next, popups },
        'disposal',
        'Tanks are full',
        'Water has nowhere to go. Buy more tank or pipe space. If you are out of cash, tap Emergency dump.',
      );
      popups = next.popups;
    }
  }
  if (overflowShut) {
    water = Math.max(0, water - next.waterCap * 0.055 * step);
    if (water < next.waterCap * 0.84) {
      overflowShut = false;
      popups = pushPopup({ ...next, popups }, 'Tanks OK', 'Producing again. Invest in pipes or tanks.', 'mint');
    }
  }
  water = Math.max(0, water);

  // Oil sales accrue by game-day, not real seconds
  const dayProfit = overflowShut ? 0 : profitPerDay({ ...next, overflowShut });
  const passive = dayProfit * days;
  next = {
    ...next,
    cash: next.cash + passive,
    totalEarned: next.totalEarned + passive,
  };

  next = {
    ...next,
    waterBbl: water,
    overflowShut,
    reliefUsed,
    trucksBusy,
    haulPulse,
    popups,
  };

  if (isSoftlocked(next)) {
    next = withTip(
      next,
      'stuck',
      'You are stuck',
      'Tap Emergency dump in the shop. It clears water for a fee so you can produce again.',
    );
    next = { ...next, softlockSec: next.softlockSec + step };
    if (next.softlockSec > 8) next = emergencyDump({ ...next, tip: null });
  } else {
    next = { ...next, softlockSec: 0 };
  }

  let coins = next.coins;
  let dropPulse = next.dropPulse;
  const liveBpd = oilBpd(next);
  if (!next.overflowShut && liveBpd > 0) {
    dropPulse += step;
    const wells = next.pads.filter((p) => p.level > 0 && !padBlocked(next, p.id));
    // Coins are sparse bonus tickets, not the main income stream
    const interval = Math.max(1.1, 2.4 / Math.max(1, wells.length));
    while (dropPulse >= interval && coins.length < MAX_COINS && wells.length) {
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
  if (!next.tipsSeen.includes('coins') && next.totalEarned > 12_000 && !next.tip) {
    next = withTip(
      next,
      'coins',
      'How you earn',
      'Wells sell oil every game day. That is your real profit. Coins on the ground are just a small bonus when you walk into them.',
    );
  }

  return {
    ...next,
    coins,
    dropPulse,
    popups: next.popups.filter((p) => now - p.born < 4200).slice(-4),
    pops: next.pops.filter((p) => now - p.born < 1100),
    floats: next.floats.filter((f) => now - f.born < 900),
  };
}

export function dismissPopup(state: TycoonState, id: number): TycoonState {
  return { ...state, popups: state.popups.filter((p) => p.id !== id) };
}

export function fmtCash(n: number): string {
  const v = Math.max(0, n);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.floor(v).toLocaleString()}`;
}

/** Profit rate in game-days (not real seconds) */
export function fmtPerDay(n: number): string {
  const v = Math.max(0, n);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M/day`;
  if (v >= 10_000) return `$${(v / 1_000).toFixed(1)}K/day`;
  return `$${Math.round(v).toLocaleString()}/day`;
}

/** @deprecated use fmtPerDay */
export function fmtPerSec(n: number): string {
  return fmtPerDay(n);
}

export function fmtSec(n: number): string {
  return `${Math.max(0, Math.ceil(n))}s`;
}

/** Back-compat aliases used by older UI bits */
export const DISPOSE_COST = TANK_COST;
export function disposeCost(level: number): number {
  return tankCost(level);
}
export function expandDisposal(state: TycoonState): TycoonState {
  return expandTank(state);
}
