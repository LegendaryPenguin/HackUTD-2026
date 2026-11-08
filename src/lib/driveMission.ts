import type { FailureContext } from './types';
import { CATEGORY_LABEL, fmt } from './model';
import type { DrivePoint } from './driveMap';

export type DiffTier = 'standard' | 'urgent' | 'critical';

export type DriveDifficulty = {
  tier: DiffTier;
  label: string;
  tone: 'aqua' | 'amber' | 'coral';
  /** soft clock for the graded run */
  timeLimitSec: number;
  maxSpeed: number;
  accel: number;
  steer: number;
  arriveR: number;
  fogNear: number;
  fogFar: number;
  stakes: string[];
  why: string[];
};

export type DriveMission = {
  id: string;
  kind: 'failure' | 'practice';
  title: string;
  subtitle: string;
  facilityId: string;
  systemId: string;
  tankLabel: string;
  difficulty: DriveDifficulty;
  levelPct?: number;
  hoursToLimit?: number;
  responseMin?: number;
  evidence: string[];
};

const TIER_COPY: Record<DiffTier, Pick<DriveDifficulty, 'tier' | 'label' | 'tone'>> = {
  standard: { tier: 'standard', label: 'Standard run', tone: 'aqua' },
  urgent: { tier: 'urgent', label: 'Urgent run', tone: 'amber' },
  critical: { tier: 'critical', label: 'Critical run', tone: 'coral' },
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

function physicsFor(tier: DiffTier, responseMin: number): Omit<DriveDifficulty, 'tier' | 'label' | 'tone' | 'stakes' | 'why'> {
  const far = Math.max(0, Math.min(1, (responseMin - 20) / 80));
  if (tier === 'critical') {
    return {
      timeLimitSec: Math.round(38 + far * 10),
      maxSpeed: 24,
      accel: 16,
      steer: 2.35,
      arriveR: 5.5,
      fogNear: 28,
      fogFar: 150,
    };
  }
  if (tier === 'urgent') {
    return {
      timeLimitSec: Math.round(55 + far * 12),
      maxSpeed: 26,
      accel: 17,
      steer: 2.2,
      arriveR: 6.2,
      fogNear: 34,
      fogFar: 180,
    };
  }
  return {
    timeLimitSec: Math.round(75 + far * 18),
    maxSpeed: 29,
    accel: 19,
    steer: 2.05,
    arriveR: 7.2,
    fogNear: 42,
    fogFar: 220,
  };
}

export function missionFromFailure(
  ctx: FailureContext,
  limits: { warning: number; shutdown: number },
): DriveMission {
  const f = ctx.facility;
  const tier = tierFrom(ctx.hoursToLimit, ctx.levelPct, limits.warning, limits.shutdown);
  const meta = TIER_COPY[tier];
  const phys = physicsFor(tier, f.response_min);
  const stakes: string[] = [];
  const why: string[] = [];

  why.push(`${CATEGORY_LABEL[ctx.event.category]} on ${fmt.short(f.id)} — tank is filling with nowhere to send water.`);
  why.push(`Tank at ${fmt.pct(ctx.levelPct)} of ${fmt.num(f.tank.capacity_bbl)} bbl.`);
  if (isFinite(ctx.hoursToLimit)) {
    why.push(`About ${fmt.dur(ctx.hoursToLimit)} until shutdown if nobody hauls.`);
  } else {
    why.push('Fill rate is low right now, but the pad still needs a truck path drilled into muscle memory.');
  }
  why.push(`Field response ETA for this pad: ${f.response_min} min.`);

  stakes.push(`Beat the ${phys.timeLimitSec}s training clock (compressed night run).`);
  if (tier === 'critical') stakes.push('Tight pad + heavier fog — miss the ring and the tank trips in the real plan.');
  if (tier === 'urgent') stakes.push('Levels are climbing through warning — every second costs production.');
  stakes.push(`Haul goal: keep wells online while repair runs (~${fmt.durMin(ctx.horizonMin)} left).`);
  if (ctx.doNothingCost > 0) stakes.push(`Do-nothing loss on this case: ${fmt.money(ctx.doNothingCost)}.`);

  return {
    id: ctx.event.id,
    kind: 'failure',
    title: `Haul to ${fmt.short(f.id)}`,
    subtitle: `${f.system} · ${CATEGORY_LABEL[ctx.event.category]}`,
    facilityId: f.id,
    systemId: f.system,
    tankLabel: fmt.short(f.id),
    difficulty: { ...phys, ...meta, stakes, why },
    levelPct: ctx.levelPct,
    hoursToLimit: ctx.hoursToLimit,
    responseMin: f.response_min,
    evidence: ctx.event.evidence.slice(0, 3),
  };
}

export function practiceMissions(points: DrivePoint[], systemId: string): DriveMission[] {
  return points
    .filter((p) => p.kind === 'tank')
    .map((p, i) => {
      const responseMin = p.responseMin ?? 30;
      const tier: DiffTier = i % 3 === 0 ? 'urgent' : 'standard';
      const meta = TIER_COPY[tier];
      const phys = physicsFor(tier, responseMin);
      return {
        id: `practice:${p.id}`,
        kind: 'practice' as const,
        title: `Drill · ${p.label}`,
        subtitle: `${systemId} · practice pad`,
        facilityId: p.id,
        systemId,
        tankLabel: p.label,
        difficulty: {
          ...phys,
          ...meta,
          stakes: [`Hit the pad inside ${phys.timeLimitSec}s.`, 'Practice runs still grade your clock discipline.'],
          why: [
            'No active pump failure on this pad right now.',
            'Use it to learn the yard → tank route before the next night goes loud.',
            `Catalog response for this facility: ${responseMin} min.`,
          ],
        },
        responseMin,
        evidence: ['Quiet pad — training only.'],
      };
    });
}

export type RunStats = {
  sec: number;
  onRoadPct: number;
  checkpointsHit: number;
  checkpointsTotal: number;
  alignedArrival: boolean;
  peakSpeed: number;
};

export type Objective = {
  id: string;
  label: string;
  done: boolean;
  hint: string;
};

export type GradeResult = {
  label: string;
  tone: 'mint' | 'aqua' | 'amber' | 'coral';
  stars: number;
  score: number;
  objectives: Objective[];
};

/** Grade a finished haul: time, route discipline, checkpoints, approach. */
export function gradeRun(stats: RunStats, limit: number): GradeResult {
  const onTime = stats.sec <= limit;
  const fast = stats.sec <= limit * 0.72;
  const routeClean = stats.onRoadPct >= 0.72;
  const checks = stats.checkpointsTotal === 0 || stats.checkpointsHit >= stats.checkpointsTotal;
  const approach = stats.alignedArrival;

  const objectives: Objective[] = [
    {
      id: 'deliver',
      label: 'Deliver to the tank pad',
      done: true,
      hint: 'Drive into the aqua ring',
    },
    {
      id: 'clock',
      label: onTime ? (fast ? 'Beat the training clock' : 'Inside the time window') : 'Missed the training clock',
      done: onTime,
      hint: `Window ${limit}s · you ${stats.sec.toFixed(1)}s`,
    },
    {
      id: 'route',
      label: routeClean ? 'Stayed on the lit roads' : 'Wandered off the lease roads',
      done: routeClean,
      hint: `${Math.round(stats.onRoadPct * 100)}% of the run on pavement`,
    },
    {
      id: 'checks',
      label: checks ? 'Hit every route checkpoint' : 'Skipped a checkpoint',
      done: checks,
      hint: `${stats.checkpointsHit} / ${stats.checkpointsTotal} gates`,
    },
    {
      id: 'approach',
      label: approach ? 'Clean lined-up approach' : 'Came in crooked',
      done: approach,
      hint: 'Face the tank when you enter the ring',
    },
  ];

  let stars = 1;
  if (onTime) stars++;
  if (routeClean) stars++;
  if (checks && approach) stars++;
  if (fast && routeClean && checks) stars = 5;
  stars = Math.min(5, Math.max(1, stars));

  let score = Math.round(
    400
      + Math.max(0, (limit - stats.sec) * 12)
      + stats.onRoadPct * 220
      + (checks ? 120 : stats.checkpointsHit * 40)
      + (approach ? 80 : 0)
      + Math.min(60, stats.peakSpeed * 2),
  );

  let label = 'Delivered';
  let tone: GradeResult['tone'] = 'aqua';
  if (!onTime) {
    label = 'Late delivery · tank would’ve tripped';
    tone = 'coral';
  } else if (stars >= 5) {
    label = 'Perfect haul';
    tone = 'mint';
  } else if (stars >= 4) {
    label = 'Clean night run';
    tone = 'mint';
  } else if (stars >= 3) {
    label = 'Solid haul';
    tone = 'aqua';
  } else if (onTime) {
    label = 'Inside window';
    tone = 'amber';
  }

  if (stars < 5) {
    const tip = !onTime ? 'Cut the clock first'
      : !routeClean ? 'Hug the lit roads harder'
        : !checks ? 'Sweep every amber gate'
          : !approach ? 'Square up before the ring'
            : !fast ? 'Push a cleaner, faster line'
              : 'One more clean pass';
    objectives.push({
      id: 'next',
      label: `Next star: ${tip}`,
      done: false,
      hint: `${stars}/5 · chase a cleaner grade`,
    });
  }

  return { label, tone, stars, score, objectives };
}

export const COACH_STORAGE_KEY = 'avon-drive-coach-v1';
