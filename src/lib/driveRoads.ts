/**
 * Plant road ribbons — Catmull-Rom strips (the-long-way-round style).
 * Full-field: one big tank ring + yard access + per-tank spurs + disposal links.
 */
import * as THREE from 'three';
import type { DrivePoint, DriveRoad } from './driveMap';

export const ROAD_HALF_WIDTH = 8.5;
export const ROAD_WIDTH = ROAD_HALF_WIDTH * 2;

export type RoadRibbon = {
  id: string;
  kind: 'ring' | 'access' | 'spur' | 'active';
  samples: THREE.Vector3[];
  tangents: THREE.Vector3[];
  length: number;
};

function v2(x: number, z: number) {
  return new THREE.Vector3(x, 0, z);
}

export function makeRibbon(
  id: string,
  kind: RoadRibbon['kind'],
  waypoints: [number, number][],
  closed: boolean,
  divisions = 48,
): RoadRibbon | null {
  if (waypoints.length < 2) return null;
  const pts = waypoints.map(([x, z]) => v2(x, z));
  if (!closed && pts.length === 2) {
    const a = pts[0];
    const b = pts[1];
    pts.splice(1, 0, a.clone().lerp(b, 0.5));
  }
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.35);
  const samples = curve.getSpacedPoints(Math.max(12, divisions));
  const tangents = samples.map((_, i) => {
    const t = i / Math.max(1, samples.length - (closed ? 0 : 1));
    return curve.getTangentAt(closed ? (t % 1) : Math.min(1, t)).normalize();
  });
  return { id, kind, samples, tangents, length: curve.getLength() };
}

/**
 * Full-field plant:
 * 1) Ring visiting every tank (angle order around field centroid)
 * 2) Access from primary yard into the ring
 * 3) Spur pad into each tank
 * 4) Optional disposal / extra yard links
 */
export function buildPlantRibbons(points: DrivePoint[]): {
  ribbons: RoadRibbon[];
  roads: DriveRoad[];
} {
  const yards = points.filter((p) => p.kind === 'yard');
  const tanks = points.filter((p) => p.kind === 'tank');
  const disposals = points.filter((p) => p.kind === 'disposal');
  const yard = yards[0];
  if (!yard || tanks.length === 0) {
    return { ribbons: [], roads: [] };
  }

  // Field hub = centroid of tanks (no fictional hub node)
  const cx = tanks.reduce((s, t) => s + t.x, 0) / tanks.length;
  const cz = tanks.reduce((s, t) => s + t.z, 0) / tanks.length;

  const ordered = [...tanks].sort(
    (a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx),
  );

  const ringPts: [number, number][] = ordered.map((t) => {
    const dx = t.x - cx;
    const dz = t.z - cz;
    const len = Math.hypot(dx, dz) || 1;
    const inset = Math.min(14, Math.max(6, len * 0.22));
    return [t.x - (dx / len) * inset, t.z - (dz / len) * inset];
  });

  const ribbons: RoadRibbon[] = [];
  const ringDiv = Math.min(96, Math.max(48, ordered.length * 10));
  const ring = makeRibbon('plant-ring', 'ring', ringPts, true, ringDiv);
  if (ring) ribbons.push(ring);

  let nearestRing: [number, number] = ringPts[0];
  let best = Infinity;
  for (const p of ringPts) {
    const d = Math.hypot(p[0] - yard.x, p[1] - yard.z);
    if (d < best) {
      best = d;
      nearestRing = p;
    }
  }

  // S-curve access so the first leg isn't a straight shot
  const midX = yard.x * 0.45 + nearestRing[0] * 0.55;
  const midZ = yard.z * 0.45 + nearestRing[1] * 0.55;
  const perpX = -(nearestRing[1] - yard.z);
  const perpZ = nearestRing[0] - yard.x;
  const plen = Math.hypot(perpX, perpZ) || 1;
  const bulge = Math.min(28, Math.max(12, best * 0.22));
  const accessPts: [number, number][] = [
    [yard.x, yard.z],
    [yard.x * 0.7 + midX * 0.3 + (perpX / plen) * bulge, yard.z * 0.7 + midZ * 0.3 + (perpZ / plen) * bulge],
    [midX - (perpX / plen) * bulge * 0.55, midZ - (perpZ / plen) * bulge * 0.55],
    [cx * 0.25 + nearestRing[0] * 0.75, cz * 0.25 + nearestRing[1] * 0.75],
    nearestRing,
  ];
  const access = makeRibbon('plant-access', 'access', accessPts, false, 48);
  if (access) ribbons.push(access);

  // Extra yards → ring (short connectors)
  for (let yi = 1; yi < yards.length; yi++) {
    const y = yards[yi];
    let nr: [number, number] = ringPts[0];
    let bd = Infinity;
    for (const p of ringPts) {
      const d = Math.hypot(p[0] - y.x, p[1] - y.z);
      if (d < bd) {
        bd = d;
        nr = p;
      }
    }
    const spur = makeRibbon(
      `yard-link-${y.id}`,
      'access',
      [[y.x, y.z], [(y.x + nr[0]) / 2, (y.z + nr[1]) / 2], nr],
      false,
      20,
    );
    if (spur) ribbons.push(spur);
  }

  for (let i = 0; i < ordered.length; i++) {
    const t = ordered[i];
    const rp = ringPts[i];
    const spur = makeRibbon(
      `spur-${t.id}`,
      'spur',
      [rp, [rp[0] * 0.3 + t.x * 0.7, rp[1] * 0.3 + t.z * 0.7], [t.x, t.z]],
      false,
      14,
    );
    if (spur) ribbons.push(spur);
  }

  for (const disposal of disposals) {
    const dspur = makeRibbon(
      `spur-${disposal.id}`,
      'spur',
      [
        [cx, cz],
        [(cx + disposal.x) / 2 + 8, (cz + disposal.z) / 2],
        [disposal.x, disposal.z],
      ],
      false,
      16,
    );
    if (dspur) ribbons.push(dspur);
  }

  const roads: DriveRoad[] = [];
  for (const r of ribbons) {
    for (let i = 0; i < r.samples.length - 1; i++) {
      const a = r.samples[i];
      const b = r.samples[i + 1];
      roads.push({
        id: `${r.id}:${i}`,
        fromId: `${r.id}:n${i}`,
        toId: `${r.id}:n${i + 1}`,
        from: [a.x, a.z],
        to: [b.x, b.z],
        kind: r.kind === 'spur' ? 'spur' : 'arterial',
      });
    }
    if (r.kind === 'ring' && r.samples.length > 2) {
      const a = r.samples[r.samples.length - 1];
      const b = r.samples[0];
      roads.push({
        id: `${r.id}:close`,
        fromId: `${r.id}:n${r.samples.length - 1}`,
        toId: `${r.id}:n0`,
        from: [a.x, a.z],
        to: [b.x, b.z],
        kind: 'arterial',
      });
    }
  }

  return { ribbons, roads };
}

export function distToRibbons(x: number, z: number, ribbons: RoadRibbon[]): number {
  let best = Infinity;
  const p = new THREE.Vector3(x, 0, z);
  for (const r of ribbons) {
    const n = r.samples.length;
    const last = r.kind === 'ring' && n > 2 ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = r.samples[i];
      const b = r.samples[(i + 1) % n];
      const ab = b.clone().sub(a);
      const len2 = ab.lengthSq() || 1;
      let t = p.clone().sub(a).dot(ab) / len2;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, a.clone().addScaledVector(ab, t).distanceTo(p));
    }
  }
  return best;
}

export function isOnRoad(x: number, z: number, ribbons: RoadRibbon[], margin = 0.8): boolean {
  return distToRibbons(x, z, ribbons) <= ROAD_HALF_WIDTH + margin;
}

export function getYardPose(ribbons: RoadRibbon[]): { x: number; z: number; yaw: number } {
  const access = ribbons.find((r) => r.kind === 'access') ?? ribbons[0];
  if (!access || access.samples.length < 2) return { x: 0, z: 4, yaw: 0 };
  const i = Math.min(2, access.samples.length - 1);
  const p = access.samples[i];
  const t = access.tangents[i] ?? access.samples[i + 1].clone().sub(p).normalize();
  return { x: p.x, z: p.z, yaw: Math.atan2(t.x, t.z) };
}

export function activeRibbonPath(
  _ribbons: RoadRibbon[],
  points: DrivePoint[],
  targetId: string,
): Set<string> {
  const target = points.find((p) => p.id === targetId);
  const yard = points.find((p) => p.kind === 'yard');
  const ids = new Set<string>();
  if (!target || !yard) return ids;
  ids.add('plant-access');
  ids.add('plant-ring');
  ids.add(`spur-${target.id}`);
  return ids;
}

export function buildRibbonGeometry(samples: THREE.Vector3[], halfWidth: number, closed: boolean): THREE.BufferGeometry {
  const pts = closed && samples.length > 2
    ? [...samples, samples[0].clone(), samples[1].clone()]
    : samples;
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const tan = next.clone().sub(prev).setY(0);
    if (tan.lengthSq() < 1e-8) tan.set(0, 0, 1);
    else tan.normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x).multiplyScalar(halfWidth);
    left.push(pts[i].clone().add(side));
    right.push(pts[i].clone().sub(side));
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let dist = 0;
  for (let i = 0; i < left.length; i++) {
    if (i > 0) dist += left[i].distanceTo(left[i - 1]);
    positions.push(left[i].x, 0.08, left[i].z, right[i].x, 0.08, right[i].z);
    uvs.push(0, dist * 0.15, 1, dist * 0.15);
    if (i < left.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
