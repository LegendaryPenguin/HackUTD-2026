import type { FacilityCtx, System } from './types';
import { facilities } from './model';
import type { Dataset } from './types';

export type DrivePoint = {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: 'yard' | 'tank' | 'disposal' | 'hub';
  responseMin?: number;
  capacityBbl?: number;
};

export type DriveRoad = {
  id: string;
  fromId: string;
  toId: string;
  from: [number, number];
  to: [number, number];
  kind: 'arterial' | 'spur' | 'lease';
};

const METERS_PER_DEG_LAT = 111_320;
const WORLD_SPAN = 180;

function lonScale(lat: number) {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function dist2(a: DrivePoint, b: DrivePoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Kruskal MST so the pad reads like a connected lease map, not only yard spokes. */
function buildMst(nodes: DrivePoint[]): DriveRoad[] {
  const edges: { a: DrivePoint; b: DrivePoint; w: number }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      edges.push({ a: nodes[i], b: nodes[j], w: dist2(nodes[i], nodes[j]) });
    }
  }
  edges.sort((x, y) => x.w - y.w);
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p !== id) parent.set(id, find(p));
    return parent.get(id)!;
  };
  const roads: DriveRoad[] = [];
  for (const e of edges) {
    const ra = find(e.a.id);
    const rb = find(e.b.id);
    if (ra === rb) continue;
    parent.set(ra, rb);
    const yardTouch = e.a.kind === 'yard' || e.b.kind === 'yard' || e.a.kind === 'hub' || e.b.kind === 'hub';
    roads.push({
      id: `${e.a.id}__${e.b.id}`,
      fromId: e.a.id,
      toId: e.b.id,
      from: [e.a.x, e.a.z],
      to: [e.b.x, e.b.z],
      kind: yardTouch ? 'arterial' : 'spur',
    });
    if (roads.length >= nodes.length - 1) break;
  }
  return roads;
}

/** Extra lease roads: each tank gets a short stub toward the hub for map texture. */
function leaseSpurs(tanks: DrivePoint[], hub: DrivePoint): DriveRoad[] {
  return tanks.map((t, i) => {
    const dx = hub.x - t.x;
    const dz = hub.z - t.z;
    const len = Math.hypot(dx, dz) || 1;
    const stub = Math.min(10, len * 0.22);
    const sx = t.x + (dx / len) * stub;
    const sz = t.z + (dz / len) * stub;
    // perpendicular offset so it isn't on top of MST edge
    const px = -dz / len;
    const pz = dx / len;
    const side = i % 2 === 0 ? 1 : -1;
    return {
      id: `lease-${t.id}`,
      fromId: t.id,
      toId: `${t.id}-lease`,
      from: [t.x + px * 2.2 * side, t.z + pz * 2.2 * side] as [number, number],
      to: [sx + px * 2.2 * side, sz + pz * 2.2 * side] as [number, number],
      kind: 'lease' as const,
    };
  });
}

export function shortestPathIds(roads: DriveRoad[], fromId: string, toId: string): Set<string> {
  const adj = new Map<string, { to: string; roadId: string; w: number }[]>();
  for (const r of roads) {
    if (r.kind === 'lease') continue;
    const w = Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]);
    if (!adj.has(r.fromId)) adj.set(r.fromId, []);
    if (!adj.has(r.toId)) adj.set(r.toId, []);
    adj.get(r.fromId)!.push({ to: r.toId, roadId: r.id, w });
    adj.get(r.toId)!.push({ to: r.fromId, roadId: r.id, w });
  }
  const dist = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<string, { node: string; roadId: string }>();
  const q = [fromId];
  while (q.length) {
    q.sort((a, b) => (dist.get(a) ?? 1e9) - (dist.get(b) ?? 1e9));
    const u = q.shift()!;
    if (u === toId) break;
    for (const e of adj.get(u) ?? []) {
      const nd = (dist.get(u) ?? 1e9) + e.w;
      if (nd < (dist.get(e.to) ?? 1e9)) {
        dist.set(e.to, nd);
        prev.set(e.to, { node: u, roadId: e.roadId });
        q.push(e.to);
      }
    }
  }
  const used = new Set<string>();
  let cur = toId;
  while (prev.has(cur)) {
    const p = prev.get(cur)!;
    used.add(p.roadId);
    cur = p.node;
  }
  return used;
}

export function buildDrivePoints(ds: Dataset, systemId?: string): {
  system: System;
  points: DrivePoint[];
  roads: DriveRoad[];
  scale: number;
} {
  const system = ds.network.systems.find((s) => s.id === systemId) ?? ds.network.systems[0];
  const facs = facilities(ds.network, ds.ops).filter((f) => f.system === system.id);
  const [yardLat, yardLon] = system.truck_yard;
  const [cLat, cLon] = system.center;

  const raw: { id: string; label: string; mx: number; mz: number; kind: DrivePoint['kind']; f?: FacilityCtx }[] = [
    { id: `${system.id}_YARD`, label: 'Truck yard', mx: 0, mz: 0, kind: 'yard' },
    {
      id: `${system.id}_HUB`,
      label: `${system.id} hub`,
      mx: (cLon - yardLon) * lonScale(yardLat),
      mz: -(cLat - yardLat) * METERS_PER_DEG_LAT,
      kind: 'hub',
    },
    {
      id: system.disposal_site.id,
      label: 'Disposal',
      mx: (system.disposal_site.lon - yardLon) * lonScale(yardLat),
      mz: -(system.disposal_site.lat - yardLat) * METERS_PER_DEG_LAT,
      kind: 'disposal',
    },
    ...facs.map((f) => ({
      id: f.id,
      label: shortFacility(f.id),
      mx: (f.lon - yardLon) * lonScale(yardLat),
      mz: -(f.lat - yardLat) * METERS_PER_DEG_LAT,
      kind: 'tank' as const,
      f,
    })),
  ];

  let maxR = 1;
  for (const p of raw) maxR = Math.max(maxR, Math.hypot(p.mx, p.mz));
  const scale = WORLD_SPAN / (2 * maxR);

  const points: DrivePoint[] = raw.map((p) => ({
    id: p.id,
    label: p.label,
    x: p.mx * scale,
    z: p.mz * scale,
    kind: p.kind,
    responseMin: p.f?.response_min,
    capacityBbl: p.f?.tank.capacity_bbl,
  }));

  const core = points.filter((p) => p.kind !== 'lease' as never);
  const mst = buildMst(core);
  const hub = points.find((p) => p.kind === 'hub')!;
  const tanks = points.filter((p) => p.kind === 'tank');
  const roads = [...mst, ...leaseSpurs(tanks, hub)];

  return { system, points, roads, scale };
}

export function shortFacility(id: string) {
  const m = id.match(/FACILITY_([A-Z0-9]+)$/i) ?? id.match(/_([A-Z0-9]+)$/);
  return m ? `Tank ${m[1]}` : id.replace(/_/g, ' ');
}

export function pickTarget(points: DrivePoint[], avoidId?: string): DrivePoint {
  const tanks = points.filter((p) => p.kind === 'tank' && p.id !== avoidId);
  return tanks[Math.floor(Math.random() * tanks.length)] ?? points.find((p) => p.kind === 'tank')!;
}

/** Sample gate positions along the lit route (yard → target). */
export function routeCheckpoints(
  roads: DriveRoad[],
  yardId: string,
  targetId: string,
  count = 2,
): { id: string; x: number; z: number }[] {
  const used = shortestPathIds(roads, yardId, targetId);
  const segs = roads.filter((r) => used.has(r.id) && r.kind !== 'lease');
  if (!segs.length) return [];
  // order roughly by distance from yard
  const yard = { x: 0, z: 0 };
  const yardRoad = roads.find((r) => r.fromId === yardId || r.toId === yardId);
  if (yardRoad) {
    if (yardRoad.fromId === yardId) {
      yard.x = yardRoad.from[0];
      yard.z = yardRoad.from[1];
    } else {
      yard.x = yardRoad.to[0];
      yard.z = yardRoad.to[1];
    }
  }
  type Sample = { x: number; z: number; d: number };
  const samples: Sample[] = [];
  for (const r of segs) {
    const len = Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]) || 1;
    for (const t of [0.35, 0.65]) {
      const x = r.from[0] + (r.to[0] - r.from[0]) * t;
      const z = r.from[1] + (r.to[1] - r.from[1]) * t;
      samples.push({ x, z, d: Math.hypot(x - yard.x, z - yard.z) + len * 0.01 });
    }
  }
  samples.sort((a, b) => a.d - b.d);
  const picked: { id: string; x: number; z: number }[] = [];
  const minGap = 18;
  for (const s of samples) {
    if (picked.length >= count) break;
    if (picked.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < minGap)) continue;
    picked.push({ id: `cp-${picked.length}`, x: s.x, z: s.z });
  }
  return picked;
}

/** Distance from point to nearest road centerline. */
export function distToRoads(x: number, z: number, roads: DriveRoad[]): number {
  let best = Infinity;
  for (const r of roads) {
    if (r.kind === 'lease') continue;
    const ax = r.from[0];
    const az = r.from[1];
    const bx = r.to[0];
    const bz = r.to[1];
    const abx = bx - ax;
    const abz = bz - az;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - ax) * abx + (z - az) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + abx * t;
    const pz = az + abz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}
