import type { Analysis } from './summary';
import type { Dataset, FailureContext } from './types';
import { fmt } from './model';

/** Day 06:00-18:00 UTC, night 18:00-06:00 UTC (dataset clock). */
export const DAY_HOUR = 6;
export const NIGHT_HOUR = 18;
export const SHIFT_HOURS = 12;

export type CrewRole = 'console' | 'driver' | 'inspector' | 'tech';
export type ShiftKind = 'day' | 'night';

export interface CrewPerson {
  id: string;
  name: string;
  initials: string;
  role: CrewRole;
  /** Home systems this person usually covers */
  systems: string[];
}

export interface ShiftAssignment {
  id: string;
  personId: string;
  startUnix: number;
  kind: ShiftKind;
  systems: string[];
  onCall?: boolean;
  note?: string;
}

export interface CrewState {
  people: CrewPerson[];
  assignments: ShiftAssignment[];
}

export interface CoverageGap {
  kind: 'console' | 'driver' | 'inspector';
  system?: string;
  message: string;
  severity: 'ok' | 'warn' | 'bad';
}

export interface HandoffDoNow {
  eventId: string;
  facilityId: string;
  system: string;
  label: string;
  levelPct: number;
  tripLine: string;
  planLine: string;
  /** One plain line for the card */
  blurb: string;
}

export interface HandoffWatch {
  eventId: string;
  label: string;
  confidence: number;
}

export interface HandoffPersonLine {
  name: string;
  role: CrewRole;
  detail: string;
}

export interface HandoffReport {
  boundaryUnix: number;
  fromKind: ShiftKind;
  toKind: ShiftKind;
  lead: string;
  outgoing: HandoffPersonLine[];
  incoming: HandoffPersonLine[];
  doNow: HandoffDoNow[];
  fleetChips: string[];
  watch: HandoffWatch[];
  coverage: CoverageGap[];
  lastShift: string[];
}

export const ROLE_LABEL: Record<CrewRole, string> = {
  console: 'console',
  driver: 'trucks',
  inspector: 'inspector',
  tech: 'tech',
};

const STORAGE_KEY = 'avon:crew';

export function utcParts(unix: number) {
  const d = new Date(unix * 1000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
  };
}

export function unixUtc(y: number, m: number, day: number, h: number, min = 0): number {
  return Math.floor(Date.UTC(y, m, day, h, min, 0) / 1000);
}

/** Start of the shift block that contains `unix`. */
export function shiftStartContaining(unix: number): number {
  const p = utcParts(unix);
  if (p.h >= NIGHT_HOUR) return unixUtc(p.y, p.m, p.day, NIGHT_HOUR);
  if (p.h >= DAY_HOUR) return unixUtc(p.y, p.m, p.day, DAY_HOUR);
  // early morning: night shift that started previous calendar day at 18:00
  const prev = new Date(Date.UTC(p.y, p.m, p.day) - 86400000);
  return unixUtc(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate(), NIGHT_HOUR);
}

export function shiftKindAt(unix: number): ShiftKind {
  const h = utcParts(unix).h;
  return h >= DAY_HOUR && h < NIGHT_HOUR ? 'day' : 'night';
}

export function shiftEnd(startUnix: number): number {
  return startUnix + SHIFT_HOURS * 3600;
}

/** Most recent boundary at or before `unix` (06:00 or 18:00). */
export function latestBoundaryAtOrBefore(unix: number): number {
  return shiftStartContaining(unix);
}

/** Next boundary strictly after `unix`. */
export function nextBoundaryAfter(unix: number): number {
  return shiftEnd(shiftStartContaining(unix));
}

/** All shift boundaries from telemetry start through end (inclusive of starts in range). */
export function boundariesInRange(t0: number, t1: number): number[] {
  const out: number[] = [];
  let b = shiftStartContaining(t0);
  if (b < t0) b = nextBoundaryAfter(t0 - 1);
  while (b <= t1) {
    out.push(b);
    b = nextBoundaryAfter(b);
  }
  return out;
}

export function defaultPeople(systemIds: string[]): CrewPerson[] {
  const s = systemIds.length ? systemIds : ['S1', 'S2', 'S3', 'S4', 'S5'];
  const all = s;
  const mid = s.slice(Math.floor(s.length / 2));
  const early = s.slice(0, Math.ceil(s.length / 2));
  return [
    { id: 'jon', name: 'Jon', initials: 'JO', role: 'console', systems: all },
    { id: 'priya', name: 'Priya', initials: 'PR', role: 'console', systems: all },
    { id: 'maya', name: 'Maya', initials: 'MA', role: 'driver', systems: mid.length ? mid : [s[s.length - 1]] },
    { id: 'sam', name: 'Sam', initials: 'SA', role: 'driver', systems: mid.length ? mid : [s[s.length - 1]] },
    { id: 'omar', name: 'Omar', initials: 'OM', role: 'driver', systems: early },
    { id: 'reese', name: 'Reese', initials: 'RE', role: 'driver', systems: early.slice(0, 1) },
    { id: 'lena', name: 'Lena', initials: 'LE', role: 'inspector', systems: mid.length ? mid : s },
    { id: 'kai', name: 'Kai', initials: 'KA', role: 'inspector', systems: early },
    { id: 'devon', name: 'Devon', initials: 'DE', role: 'tech', systems: all },
  ];
}

function seedAssignments(people: CrewPerson[], t0: number, t1: number): ShiftAssignment[] {
  const starts = boundariesInRange(t0, t1);
  // Also include the block containing t0 if its start is before t0
  const first = shiftStartContaining(t0);
  const blocks = starts[0] === first ? starts : [first, ...starts];
  const byRole = {
    console: people.filter((p) => p.role === 'console'),
    driver: people.filter((p) => p.role === 'driver'),
    inspector: people.filter((p) => p.role === 'inspector'),
    tech: people.filter((p) => p.role === 'tech'),
  };
  const out: ShiftAssignment[] = [];
  let i = 0;
  for (const start of blocks) {
    if (start > t1) break;
    const kind = shiftKindAt(start + 60);
    const night = kind === 'night';
    const consoleP = byRole.console[night ? 0 : 1] ?? byRole.console[0];
    if (consoleP) {
      out.push({
        id: `${consoleP.id}-${start}`,
        personId: consoleP.id,
        startUnix: start,
        kind,
        systems: [...consoleP.systems],
      });
    }
    // rotate drivers: night gets maya+omar, day gets sam+reese (when present)
    const drivers = night
      ? [byRole.driver[0], byRole.driver[2]].filter(Boolean)
      : [byRole.driver[1], byRole.driver[3] ?? byRole.driver[2]].filter(Boolean);
    for (const d of drivers) {
      out.push({
        id: `${d!.id}-${start}`,
        personId: d!.id,
        startUnix: start,
        kind,
        systems: [...d!.systems],
        onCall: d!.id === 'reese' || d!.id === 'omar',
      });
    }
    const insp = byRole.inspector[i % byRole.inspector.length];
    if (insp) {
      out.push({
        id: `${insp.id}-${start}`,
        personId: insp.id,
        startUnix: start,
        kind,
        systems: [...insp.systems],
      });
    }
    if (i % 2 === 0 && byRole.tech[0]) {
      out.push({
        id: `${byRole.tech[0].id}-${start}`,
        personId: byRole.tech[0].id,
        startUnix: start,
        kind,
        systems: [...byRole.tech[0].systems],
      });
    }
    i++;
  }
  return out;
}

export function loadCrewState(systemIds: string[], t0: number, t1: number): CrewState {
  const people = defaultPeople(systemIds);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CrewState;
      if (parsed?.people?.length && parsed?.assignments) {
        return {
          people: parsed.people,
          assignments: parsed.assignments,
        };
      }
    }
  } catch {
    /* seed */
  }
  return { people, assignments: seedAssignments(people, t0, t1) };
}

export function saveCrewState(state: CrewState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function peopleOnShift(
  state: CrewState,
  atUnix: number,
): { person: CrewPerson; assignment: ShiftAssignment }[] {
  const start = shiftStartContaining(atUnix);
  return state.assignments
    .filter((a) => a.startUnix === start)
    .map((a) => {
      const person = state.people.find((p) => p.id === a.personId);
      return person ? { person, assignment: a } : null;
    })
    .filter(Boolean) as { person: CrewPerson; assignment: ShiftAssignment }[];
}

export function coverageAt(
  state: CrewState,
  dataset: Dataset,
  analysis: Analysis | null,
  atUnix: number,
): CoverageGap[] {
  const on = peopleOnShift(state, atUnix);
  const gaps: CoverageGap[] = [];
  const consoles = on.filter((x) => x.person.role === 'console');
  if (consoles.length === 0) {
    gaps.push({ kind: 'console', message: 'No console operator on shift', severity: 'bad' });
  } else {
    gaps.push({ kind: 'console', message: 'Console covered', severity: 'ok' });
  }

  const truckNeed: Record<string, number> = {};
  if (analysis) {
    for (const ctx of analysis.orderedFailures) {
      const plan = analysis.systemPlans[ctx.facility.system]?.plans[ctx.event.id];
      const n = plan?.trucks ?? 0;
      if (n > 0) truckNeed[ctx.facility.system] = (truckNeed[ctx.facility.system] ?? 0) + n;
    }
  }
  for (const [sys, need] of Object.entries(truckNeed)) {
    const drivers = on.filter(
      (x) => x.person.role === 'driver' && (x.assignment.systems.includes(sys) || x.person.systems.includes(sys)),
    );
    const have = drivers.length;
    if (have < need) {
      gaps.push({
        kind: 'driver',
        system: sys,
        message: `${sys} needs ${need} driver${need === 1 ? '' : 's'} · ${have} on shift`,
        severity: 'bad',
      });
    } else {
      gaps.push({
        kind: 'driver',
        system: sys,
        message: `${sys} drivers ok (${have}/${need})`,
        severity: 'ok',
      });
    }
  }

  const inspectSystems = new Set(
    (analysis?.ongoing ?? [])
      .filter((e) => e.category === 'pipeline_leak' || e.category === 'pump_degradation')
      .map((e) => e.system),
  );
  for (const sys of inspectSystems) {
    const insp = on.filter(
      (x) => x.person.role === 'inspector' && (x.assignment.systems.includes(sys) || x.person.systems.includes(sys)),
    );
    if (!insp.length) {
      gaps.push({
        kind: 'inspector',
        system: sys,
        message: `${sys} inspector gap`,
        severity: 'warn',
      });
    } else {
      gaps.push({
        kind: 'inspector',
        system: sys,
        message: `${sys} inspector covered`,
        severity: 'ok',
      });
    }
  }

  // Quiet fleet note when no truck demand
  if (!Object.keys(truckNeed).length) {
    const fleetSys = dataset.network.systems.map((s) => s.id);
    const anyDriver = on.some((x) => x.person.role === 'driver');
    if (!anyDriver && fleetSys.length) {
      gaps.push({ kind: 'driver', message: 'No truck drivers on shift', severity: 'warn' });
    }
  }

  return gaps;
}

function tripLine(ctx: FailureContext): string {
  if (ctx.hoursToLimit === 0) return 'Already at shut-in.';
  if (!isFinite(ctx.hoursToLimit) || ctx.tripsAtUnix == null) return 'Never trips at current inflow.';
  return `Trips ~${fmt.time(ctx.tripsAtUnix)} if we wait.`;
}

function planLine(analysis: Analysis, ctx: FailureContext): string {
  const plan = analysis.systemPlans[ctx.facility.system]?.plans[ctx.event.id];
  if (!plan) return 'Wait for repair.';
  if (!plan.trucks && !plan.shutIns.length) return `Do nothing (${fmt.money(plan.cost)}).`;
  if (plan.trucks) {
    return `Send ${plan.trucks} truck${plan.trucks === 1 ? '' : 's'} (~${fmt.money(plan.cost)}).`;
  }
  return `${plan.label} (~${fmt.money(plan.cost)}).`;
}

export function buildHandoff(
  dataset: Dataset,
  analysis: Analysis,
  state: CrewState,
  boundaryUnix: number,
): HandoffReport {
  const toKind = shiftKindAt(boundaryUnix + 60);
  const fromKind: ShiftKind = toKind === 'day' ? 'night' : 'day';
  const outgoingStart = shiftStartContaining(boundaryUnix - 60);
  const incomingStart = boundaryUnix;

  const mapLines = (start: number): HandoffPersonLine[] => {
    const rows = state.assignments
      .filter((a) => a.startUnix === start)
      .map((a) => {
        const p = state.people.find((x) => x.id === a.personId);
        if (!p || p.role === 'tech') return null;
        const detail =
          p.role === 'console'
            ? 'console'
            : p.role === 'inspector'
              ? `${a.systems[0] ?? p.systems[0] ?? ''} inspector`.trim()
              : `${a.systems[0] ?? p.systems[0] ?? ''} trucks`.trim();
        return { name: p.name, role: p.role, detail, sort: p.role === 'console' ? 0 : p.role === 'driver' ? 1 : 2 };
      })
      .filter(Boolean) as (HandoffPersonLine & { sort: number })[];
    return rows.sort((a, b) => a.sort - b.sort).map(({ name, role, detail }) => ({ name, role, detail }));
  };

  const outgoing = mapLines(outgoingStart).slice(0, 3);
  const incoming = mapLines(incomingStart).slice(0, 3);

  const doNow: HandoffDoNow[] = analysis.orderedFailures.map((ctx) => {
    const label = `${ctx.facility.system} ${fmt.short(ctx.facility.id)}`;
    const trip = tripLine(ctx);
    const plan = planLine(analysis, ctx);
    return {
      eventId: ctx.event.id,
      facilityId: ctx.facility.id,
      system: ctx.facility.system,
      label,
      levelPct: ctx.levelPct,
      tripLine: trip,
      planLine: plan,
      blurb: `${label} · tank ${ctx.levelPct.toFixed(0)}%. ${trip} ${plan}`,
    };
  });

  const fleetChips: string[] = [];
  const truckUse: Record<string, number> = {};
  for (const sp of Object.values(analysis.systemPlans)) {
    truckUse[sp.system] = Object.values(sp.allocation).reduce((a, b) => a + b, 0);
  }
  for (const s of dataset.network.systems) {
    const fleet = dataset.ops.systems[s.id]?.emergency_fleet_size ?? 0;
    const used = truckUse[s.id] ?? 0;
    if (used > 0 || analysis.orderedFailures.some((c) => c.facility.system === s.id)) {
      fleetChips.push(`${s.id} trucks ${Math.max(0, fleet - used)}/${fleet} free`);
    }
  }

  const watch: HandoffWatch[] = analysis.ongoing
    .filter((e) => e.category !== 'pump_failure')
    .map((e) => {
      const conf = Math.round(e.confidence * 100);
      if (e.category === 'pipeline_leak') {
        return {
          eventId: e.id,
          label: `${e.system} pipeline may be leaking (about ${conf}% sure). Send an inspector when you can.`,
          confidence: e.confidence,
        };
      }
      return {
        eventId: e.id,
        label: `${fmt.short(e.asset)} is wearing out (about ${conf}% sure). Schedule an inspection.`,
        confidence: e.confidence,
      };
    });

  const coverage = coverageAt(state, dataset, analysis, boundaryUnix + 60);

  const prevEnd = boundaryUnix;
  const prevStart = outgoingStart;
  const resolved = analysis.events.filter(
    (e) => e.end != null && e.end >= prevStart && e.end <= prevEnd,
  );
  const lastShift: string[] = [];
  if (resolved.length) {
    lastShift.push(
      `${resolved.length} problem${resolved.length === 1 ? '' : 's'} resolved last shift.`,
    );
  } else {
    lastShift.push('No problems closed last shift.');
  }
  const fails = resolved.filter((e) => e.category === 'pump_failure').length;
  if (fails) lastShift.push(`${fails} pump repair${fails === 1 ? '' : 's'} finished.`);

  const failSystems = [...new Set(doNow.map((d) => d.system))];
  let lead: string;
  if (doNow.length === 0 && watch.length === 0) {
    lead = 'Quiet handoff. No tanks filling and nothing flagged for inspection.';
  } else if (doNow.length === 0) {
    lead = `Quiet on tank fill. ${watch.length} item${watch.length === 1 ? '' : 's'} still need an inspector.`;
  } else if (doNow.length === 1) {
    lead = `One tank is filling on ${doNow[0].system}. Act before shut-in.`;
  } else {
    lead = `${doNow.length} tanks are filling${failSystems.length === 1 ? ` on ${failSystems[0]}` : ''}. Prioritize soonest shut-in first.`;
  }

  return {
    boundaryUnix,
    fromKind,
    toKind,
    lead,
    outgoing,
    incoming,
    doNow,
    fleetChips,
    watch,
    coverage,
    lastShift,
  };
}

export function handoffPlainText(r: HandoffReport): string {
  const lines: string[] = [];
  lines.push(`Shift handoff`);
  lines.push(`${fmt.time(r.boundaryUnix)} UTC · ${cap(r.fromKind)} → ${cap(r.toKind)}`);
  lines.push('');
  lines.push(r.lead);
  lines.push('');
  lines.push('DO NOW');
  if (!r.doNow.length) lines.push('· Nothing filling right now.');
  for (const d of r.doNow) {
    lines.push(`· ${d.blurb}`);
  }
  if (r.fleetChips.length) lines.push(r.fleetChips.join(' · '));
  lines.push('');
  lines.push('WATCH');
  if (!r.watch.length) lines.push('· No leaks or wear alerts.');
  for (const w of r.watch) lines.push(`· ${w.label}`);
  lines.push('');
  lines.push('LAST SHIFT');
  for (const x of r.lastShift) lines.push(`· ${x}`);
  return lines.join('\n');
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function weekDays(t0: number, t1: number): number[] {
  /** Midnight UTC for each calendar day that overlaps [t0, t1]. */
  const days: number[] = [];
  const p = utcParts(t0);
  let cursor = unixUtc(p.y, p.m, p.day, 0, 0);
  const endDay = shiftStartContaining(t1);
  while (cursor <= endDay + 86400) {
    if (cursor + 86400 > t0 && cursor <= t1) days.push(cursor);
    cursor += 86400;
    if (days.length > 14) break;
  }
  return days;
}

export function blocksForDay(dayMidnight: number): { start: number; kind: ShiftKind }[] {
  const p = utcParts(dayMidnight);
  const dayStart = unixUtc(p.y, p.m, p.day, DAY_HOUR);
  const nightStart = unixUtc(p.y, p.m, p.day, NIGHT_HOUR);
  return [
    { start: dayStart, kind: 'day' },
    { start: nightStart, kind: 'night' },
  ];
}

export function assignmentConflicts(state: CrewState, startUnix: number): string[] {
  const on = state.assignments.filter((a) => a.startUnix === startUnix);
  const warns: string[] = [];
  const consoles = on.filter((a) => state.people.find((p) => p.id === a.personId)?.role === 'console');
  if (consoles.length === 0) warns.push('No console operator on this block.');
  if (consoles.length > 2) warns.push('More than two console operators overlapping.');
  const byPerson = new Map<string, number>();
  for (const a of on) byPerson.set(a.personId, (byPerson.get(a.personId) ?? 0) + 1);
  for (const [id, n] of byPerson) {
    if (n > 1) {
      const name = state.people.find((p) => p.id === id)?.name ?? id;
      warns.push(`${name} is listed twice on this block.`);
    }
  }
  return warns;
}
