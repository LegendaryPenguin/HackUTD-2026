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

/** One tank pad the water truck must deliver to. */
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
  const base = tier === 'critical' ? 110 : tier === 'urgent' ? 140 : 170;
  const perStop = 42;
  const far = Math.max(0, Math.min(1, (responseMin - 20) / 80));
  return {
    timeLimitSec: Math.round(base + stops * perStop + far * 30),
    maxSpeed: tier === 'critical' ? 23 : tier === 'urgent' ? 25 : 27,
    accel: tier === 'critical' ? 14 : 16,
    steer: 2.1,
    arriveR: 7.2,
    fogNear: 48,
    fogFar: 280,
  };
}

function recPlan(analysis: Analysis, ctx: FailureContext): PlanOption | null {
  const sp = analysis.systemPlans[ctx.facility.system];
  if (!sp) return null;
  return sp.plans[ctx.event.id] ?? null;
}

/** Nearest-neighbor tour from yard so pads are spread and the route isn't a straight line. */
function tourStops(
  primary: FailureContext,
  truckFailures: FailureContext[],
  allTankPoints: DrivePoint[],
  yard: DrivePoint | undefined,
  minStops: number,
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
  }

  // Fill with farthest tanks first so the loop covers the field
  const origin = yard ?? byId.get(primary.facility.id);
  const extras = tanks
    .filter((t) => !must.includes(t.id))
    .map((t) => ({
      id: t.id,
      d: origin ? Math.hypot(t.x - origin.x, t.z - origin.z) : 0,
    }))
    .sort((a, b) => b.d - a.d);

  const want = Math.min(Math.max(minStops, 4), Math.max(must.length, tanks.length));
  const pool = [...must];
  for (const e of extras) {
    if (pool.length >= want) break;
    pool.push(e.id);
  }

  // Order: start at primary, then NN around the field
  const remaining = new Set(pool);
  const ordered: string[] = [];
  let cur = byId.get(primary.facility.id) ?? (origin ? { x: origin.x, z: origin.z, id: '' } : null);
  if (remaining.has(primary.facility.id)) {
    ordered.push(primary.facility.id);
    remaining.delete(primary.facility.id);
  }
  while (remaining.size) {
    let bestId = '';
    let bestD = Infinity;
    for (const id of remaining) {
      const t = byId.get(id)!;
      const d = cur ? Math.hypot(t.x - cur.x, t.z - cur.z) : 0;
      // Prefer mid-distance hops so we don't collapse to a micro-cluster
      const score = Math.abs(d - 35) + d * 0.15;
      if (score < bestD) {
        bestD = score;
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

/**
 * Haul moments where the recommended plan actually sends water trucks.
 * Cards are stamped with failure onset time.
 */
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
    const trips = Math.max(1, plan.trips);
    const minStops = Math.min(7, Math.max(4, plan.trucks + trips + 1));
    const stops = tourStops(ctx, truckFailures, allTankPoints, yard, minStops);
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

  const stops = tourStops(fakePrimary, [], allTankPoints, yard, Math.min(5, tanks.length));
  const phys = physicsFor('standard', stops.length, 40);
  return [{
    id: 'practice-field',
    kind: 'practice',
    atUnix: 0,
    title: 'Practice field loop',
    subtitle: 'No truck call right now — drill the pad tour',
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
  const routeClean = stats.onRoadPct >= 0.72;

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
      + stats.padsHit * 80
      + Math.min(50, stats.peakSpeed * 1.5),
  );

  if (!pads) return { label: 'Incomplete · missed a tank pad', tone: 'coral', stars, score };
  if (!onTime) return { label: 'Late · tank would’ve tripped', tone: 'coral', stars, score };
  if (fast && routeClean) return { label: 'Clean multi-pad haul', tone: 'mint', stars, score };
  if (routeClean) return { label: 'Delivered on roads', tone: 'aqua', stars, score };
  return { label: 'Delivered', tone: 'amber', stars, score };
}
