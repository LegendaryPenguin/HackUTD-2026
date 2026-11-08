import type { FailureContext, PlanOption, Dataset } from './types';
import type { Analysis } from './summary';
import { fmt } from './model';
import { familyOf } from './scenarios';
import type { DrivePoint } from './driveMap';

export type DiffTier = 'standard' | 'urgent' | 'critical';

export type DriveDifficulty = {
  tier: DiffTier;
  label: string;
  tone: 'aqua' | 'amber' | 'coral';
  timeLimitSec: number;
  maxSpeed: number;
  accel: number;
  steer: number;
  arriveR: number;
  fogNear: number;
  fogFar: number;
};

export type DeliveryStop = {
  id: string;
  facilityId: string;
  label: string;
  systemId: string;
};

export type DriveMission = {
  id: string;
  kind: 'truck_run' | 'practice';
  atUnix: number;
  title: string;
  subtitle: string;
  facilityId: string;
  systemId: string;
  tankLabel: string;
  stops: DeliveryStop[];
  trucks: number;
  trips: number;
  planLabel: string;
  difficulty: DriveDifficulty;
  levelPct?: number;
  hoursToLimit?: number;
  responseMin?: number;
};

/** Mid-haul teaching beat — Tycoon-style popup lessons. */
export type DriveLesson = {
  id: string;
  title: string;
  body: string;
  tone: 'aqua' | 'amber' | 'mint' | 'coral';
};

const TIER_COPY: Record<DiffTier, Pick<DriveDifficulty, 'tier' | 'label' | 'tone'>> = {
  standard: { tier: 'standard', label: 'Haul', tone: 'aqua' },
  urgent: { tier: 'urgent', label: 'Urgent haul', tone: 'amber' },
  critical: { tier: 'critical', label: 'Critical haul', tone: 'coral' },
};

function tierFrom(hoursToLimit: number, levelPct: number, warn: number, shut: number): DiffTier {
  if (!isFinite(hoursToLimit) || hoursToLimit > 12) {
    if (levelPct >= shut - 2) return 'critical';
    if (levelPct >= warn) return 'urgent';
    return 'standard';
  }
  if (hoursToLimit <= 2 || levelPct >= shut - 1) return 'critical';
  if (hoursToLimit <= 6 || levelPct >= warn) return 'urgent';
  return 'standard';
}

function physicsFor(tier: DiffTier, stops: number, responseMin: number): Omit<DriveDifficulty, 'tier' | 'label' | 'tone'> {
  // Finishable clocks — short tours, generous arrive radius
  const base = tier === 'critical' ? 150 : tier === 'urgent' ? 170 : 190;
  const perStop = 55;
  const far = Math.max(0, Math.min(1, (responseMin - 20) / 80));
  return {
    timeLimitSec: Math.round(base + stops * perStop + far * 20),
    maxSpeed: tier === 'critical' ? 22 : tier === 'urgent' ? 24 : 26,
    accel: 18,
    steer: 2.4,
    arriveR: 11.5,
    fogNear: 55,
    fogFar: 300,
  };
}

function recPlan(analysis: Analysis, ctx: FailureContext): PlanOption | null {
  const sp = analysis.systemPlans[ctx.facility.system];
  if (!sp) return null;
  return sp.plans[ctx.event.id] ?? null;
}

/** Short finishable tour: primary tank first, then 1–2 nearby pads. */
function tourStops(
  primary: FailureContext,
  truckFailures: FailureContext[],
  allTankPoints: DrivePoint[],
  yard: DrivePoint | undefined,
  maxStops: number,
): DeliveryStop[] {
  const tanks = allTankPoints.filter((p) => p.kind === 'tank');
  const byId = new Map(tanks.map((t) => [t.id, t]));

  const must: string[] = [];
  const pushMust = (id: string) => {
    if (!byId.has(id) || must.includes(id)) return;
    must.push(id);
  };
  pushMust(primary.facility.id);
  for (const c of truckFailures) {
    if (c.event.id === primary.event.id) continue;
    pushMust(c.facility.id);
    if (must.length >= maxStops) break;
  }

  const origin = byId.get(primary.facility.id) ?? yard;
  const extras = tanks
    .filter((t) => !must.includes(t.id))
    .map((t) => ({
      id: t.id,
      d: origin ? Math.hypot(t.x - origin.x, t.z - origin.z) : 0,
    }))
    .sort((a, b) => a.d - b.d); // nearest extras — finishable hops

  const pool = [...must];
  for (const e of extras) {
    if (pool.length >= maxStops) break;
    pool.push(e.id);
  }

  const remaining = new Set(pool);
  const ordered: string[] = [];
  let cur = byId.get(primary.facility.id) ?? origin ?? null;
  if (remaining.has(primary.facility.id)) {
    ordered.push(primary.facility.id);
    remaining.delete(primary.facility.id);
  }
  while (remaining.size) {
    let bestId = '';
    let bestD = Infinity;
    for (const id of remaining) {
      const t = byId.get(id)!;
      const d = cur ? Math.hypot(t.x - (cur as DrivePoint).x, t.z - (cur as DrivePoint).z) : 0;
      if (d < bestD) {
        bestD = d;
        bestId = id;
      }
    }
    if (!bestId) break;
    ordered.push(bestId);
    remaining.delete(bestId);
    cur = byId.get(bestId)!;
  }

  return ordered.map((id) => {
    const t = byId.get(id)!;
    return {
      id: `pad-${id}`,
      facilityId: id,
      label: t.label,
      systemId: t.systemId,
    };
  });
}

export function truckRecommendedMissions(
  ds: Dataset,
  analysis: Analysis,
  allTankPoints: DrivePoint[],
  yard?: DrivePoint,
): DriveMission[] {
  const limits = ds.network.defaults.tank_limits_pct;
  const truckFailures = analysis.orderedFailures.filter((c) => {
    const plan = recPlan(analysis, c);
    return !!plan && plan.trucks > 0;
  });

  return truckFailures.map((ctx) => {
    const plan = recPlan(analysis, ctx)!;
    const f = ctx.facility;
    const tier = tierFrom(ctx.hoursToLimit, ctx.levelPct, limits.warning, limits.shutdown);
    const meta = TIER_COPY[tier];
    const maxStops = Math.min(3, Math.max(2, plan.trucks));
    const stops = tourStops(ctx, truckFailures, allTankPoints, yard, maxStops);
    const phys = physicsFor(tier, stops.length, f.response_min);
    const fam = familyOf(plan);

    return {
      id: ctx.event.id,
      kind: 'truck_run' as const,
      atUnix: ctx.event.onset,
      title: fmt.short(f.id),
      subtitle: plan.label || (fam === 'trucks_only' ? 'Trucks recommended' : 'Trucks in best plan'),
      facilityId: f.id,
      systemId: f.system,
      tankLabel: fmt.short(f.id),
      stops,
      trucks: plan.trucks,
      trips: plan.trips,
      planLabel: plan.label,
      difficulty: { ...phys, ...meta },
      levelPct: ctx.levelPct,
      hoursToLimit: ctx.hoursToLimit,
      responseMin: f.response_min,
    };
  });
}

export function practiceMissions(allTankPoints: DrivePoint[], systemId: string, yard?: DrivePoint): DriveMission[] {
  const tanks = allTankPoints.filter((p) => p.kind === 'tank');
  if (!tanks.length) return [];

  const fakePrimary = {
    facility: { id: tanks[0].id, system: systemId, response_min: 40 },
    event: { id: 'practice' },
  } as unknown as FailureContext;

  const stops = tourStops(fakePrimary, [], allTankPoints, yard, Math.min(3, tanks.length));
  const phys = physicsFor('standard', stops.length, 40);
  return [{
    id: 'practice-field',
    kind: 'practice',
    atUnix: 0,
    title: 'Practice field loop',
    subtitle: 'No truck call right now. Drill the pad tour.',
    facilityId: stops[0].facilityId,
    systemId,
    tankLabel: stops[0].label,
    stops,
    trucks: 1,
    trips: stops.length,
    planLabel: 'Practice loop',
    difficulty: { ...phys, ...TIER_COPY.standard },
    responseMin: 40,
  }];
}

export function openingLesson(m: DriveMission): DriveLesson {
  return {
    id: 'open',
    title: m.kind === 'practice' ? 'Night drill' : 'Why you are driving',
    body: m.kind === 'practice'
      ? 'Quiet night on the lease. Follow the dark asphalt to each glowing pad. Stay on the road. Bushes and tanks will stop you.'
      : `Console called trucks. Waiting would fill ${m.tankLabel} past the trip line. Your job: hit every pad before the clock runs out.`,
    tone: 'aqua',
  };
}

export function lessonAfterPad(m: DriveMission, padIndex: number, stop: DeliveryStop): DriveLesson {
  if (padIndex === 0) {
    return {
      id: `pad-${stop.id}`,
      title: `First drop · ${stop.label}`,
      body: 'Water left the tank. In a real plan, truck size times trips is how you keep the level under shutdown. Next pad is lit. Keep rolling.',
      tone: 'mint',
    };
  }
  if (padIndex >= m.stops.length - 2) {
    return {
      id: `pad-${stop.id}`,
      title: `Almost done · ${stop.label}`,
      body: 'One more pad after this stretch. On a live shift you would radio console after the last drop, then head back to the yard.',
      tone: 'amber',
    };
  }
  return {
    id: `pad-${stop.id}`,
    title: `Pad clear · ${stop.label}`,
    body: 'Good haul. Soft sand off the asphalt slows a loaded truck. Stay on the lit road to the next tank.',
    tone: 'aqua',
  };
}

export function offRoadLesson(): DriveLesson {
  return {
    id: 'offroad',
    title: 'You left the road',
    body: 'Sand and scrub kill speed. Pull back onto the asphalt. Emergency water trucks stick to lease roads for a reason.',
    tone: 'coral',
  };
}

/** Near the next pad: short radio beat. */
export function approachLesson(stop: DeliveryStop): DriveLesson {
  return {
    id: `approach-${stop.id}`,
    title: `Coming up · ${stop.label}`,
    body: 'Pad is close. Slow into the glowing ring. Line up clean. Dump. Then move to the next tank if there is one.',
    tone: 'aqua',
  };
}

export type RunStats = {
  sec: number;
  onRoadPct: number;
  padsHit: number;
  padsTotal: number;
  peakSpeed: number;
};

export type GradeResult = {
  label: string;
  tone: 'mint' | 'aqua' | 'amber' | 'coral';
  stars: number;
  score: number;
};

export function gradeRun(stats: RunStats, limit: number): GradeResult {
  const onTime = stats.sec <= limit;
  const fast = stats.sec <= limit * 0.78;
  const pads = stats.padsTotal === 0 || stats.padsHit >= stats.padsTotal;
  const routeClean = stats.onRoadPct >= 0.65;

  let stars = 1;
  if (pads) stars++;
  if (onTime) stars++;
  if (routeClean) stars++;
  if (fast && pads && routeClean) stars = 5;
  stars = Math.min(5, Math.max(1, stars));

  const score = Math.round(
    350
      + Math.max(0, (limit - stats.sec) * 10)
      + stats.onRoadPct * 200
      + stats.padsHit * 100
      + Math.min(50, stats.peakSpeed * 1.5),
  );

  if (!pads) return { label: 'Incomplete. Missed a tank pad', tone: 'coral', stars, score };
  if (!onTime) return { label: 'Late. The tank would have tripped', tone: 'coral', stars, score };
  if (fast && routeClean) return { label: 'Clean multi-pad haul', tone: 'mint', stars, score };
  if (routeClean) return { label: 'Delivered on roads', tone: 'aqua', stars, score };
  return { label: 'Delivered', tone: 'amber', stars, score };
}
