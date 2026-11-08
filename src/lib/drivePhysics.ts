/**
 * Arcade water-truck chassis.
 * Longitudinal speed stays locked to heading. Grip comes from the surface
 * under the truck (asphalt, tank pad, dirt). Solids slide the body out
 * and the speed is rebuilt from the motion that actually happened, so a
 * graze does not snap the truck to a stop and a wall does not oscillate.
 */
import type { DrivePoint } from './driveMap';
import { ROAD_HALF_WIDTH, type RoadRibbon } from './driveRoads';

export const TRUCK_RADIUS = 1.55;
export const TANK_SOLID_R = 2.9;

/** Wellheads beside the tank, perpendicular to the spur in from the field center. */
export function wellheadOffsets(x: number, z: number): { x: number; z: number; r: number }[] {
  const len = Math.hypot(x, z) || 1;
  const ox = x / len;
  const oz = z / len;
  const px = -oz;
  const pz = ox;
  return [
    { x: px * 6.5, z: pz * 6.5, r: 1.15 },
    { x: -px * 5.4 + ox * 1.6, z: -pz * 5.4 + oz * 1.6, r: 1.05 },
  ];
}
export const PAD_RADIUS = 11.2;
export const YARD_RADIUS = 13;
export const LEASE_RADIUS = 206;

export type Surface = 'asphalt' | 'pad' | 'dirt';

export type Solid = { x: number; z: number; r: number };

export type RoadSeg = { ax: number; az: number; bx: number; bz: number };

export type Chassis = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  steer: number;
};

export type ChassisInput = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
};

export type ChassisTune = {
  maxSpeed: number;
  accel: number;
  steer: number;
};

export function roadSegments(ribbons: RoadRibbon[]): RoadSeg[] {
  const out: RoadSeg[] = [];
  for (const r of ribbons) {
    const n = r.samples.length;
    if (n < 2) continue;
    const last = r.kind === 'ring' ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = r.samples[i];
      const b = r.samples[(i + 1) % n];
      out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
    }
  }
  return out;
}

export function plantSolids(points: DrivePoint[]): Solid[] {
  const solids: Solid[] = [];
  for (const p of points) {
    if (p.kind !== 'tank') continue;
    solids.push({ x: p.x, z: p.z, r: TANK_SOLID_R });
    for (const w of wellheadOffsets(p.x, p.z)) {
      solids.push({ x: p.x + w.x, z: p.z + w.z, r: w.r });
    }
  }
  return solids;
}

function distToSegs(x: number, z: number, segs: RoadSeg[]): number {
  let best = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const abx = s.bx - s.ax;
    const abz = s.bz - s.az;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - s.ax) * abx + (z - s.az) * abz) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const dx = x - (s.ax + abx * t);
    const dz = z - (s.az + abz * t);
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function surfaceAt(x: number, z: number, segs: RoadSeg[], points: DrivePoint[]): Surface {
  if (distToSegs(x, z, segs) <= ROAD_HALF_WIDTH + 0.6) return 'asphalt';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const r = p.kind === 'tank' ? PAD_RADIUS : p.kind === 'yard' ? YARD_RADIUS : 0;
    if (r <= 0) continue;
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz <= r * r) return 'pad';
  }
  return 'dirt';
}

const GRIP: Record<Surface, { accel: number; top: number; coast: number }> = {
  asphalt: { accel: 1, top: 1, coast: 7 },
  pad: { accel: 0.92, top: 0.88, coast: 8 },
  dirt: { accel: 0.32, top: 0.38, coast: 16 },
};

/**
 * One simulation step. Mutates chassis. Returns the surface and whether
 * a solid (tank, rock, lease edge) blocked the step.
 */
export function stepChassis(
  body: Chassis,
  input: ChassisInput,
  dt: number,
  tune: ChassisTune,
  segs: RoadSeg[],
  points: DrivePoint[],
  solids: Solid[],
): { surface: Surface; blocked: boolean } {
  const h = Math.min(Math.max(dt, 0), 0.05);
  const surface = surfaceAt(body.x, body.z, segs, points);
  const g = GRIP[surface];
  const top = tune.maxSpeed * g.top;
  const accel = tune.accel * g.accel;

  if (input.forward && !input.back) {
    body.speed = Math.min(top, body.speed + accel * h);
  } else if (input.back && !input.forward) {
    if (body.speed > 0.5) body.speed = Math.max(0, body.speed - accel * 2.1 * h);
    else body.speed = Math.max(-top * 0.4, body.speed - accel * 0.85 * h);
  } else {
    const coast = g.coast;
    if (body.speed > 0) body.speed = Math.max(0, body.speed - coast * h);
    else if (body.speed < 0) body.speed = Math.min(0, body.speed + coast * h);
  }

  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  body.steer += (steerTarget - body.steer) * Math.min(1, h * 12);

  const sp = Math.abs(body.speed);
  if (sp > 0.2 && Math.abs(body.steer) > 0.01) {
    const authority = 1.05 - 0.5 * Math.min(1, sp / tune.maxSpeed);
    const grip = surface === 'dirt' ? 0.5 : 1;
    let yawRate = body.steer * tune.steer * authority * grip;
    if (body.speed < 0) yawRate = -yawRate;
    body.yaw += yawRate * h;
  }

  const sin = Math.sin(body.yaw);
  const cos = Math.cos(body.yaw);
  let x = body.x + sin * body.speed * h;
  let z = body.z + cos * body.speed * h;
  let blocked = false;

  const truckR = TRUCK_RADIUS;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < solids.length; i++) {
      const b = solids[i];
      let dx = x - b.x;
      let dz = z - b.z;
      let d = Math.hypot(dx, dz);
      const need = b.r + truckR;
      if (d >= need) continue;
      if (d < 1e-4) {
        dx = 1;
        dz = 0;
        d = 1;
      }
      const push = need - d;
      x += (dx / d) * push;
      z += (dz / d) * push;
      blocked = true;
    }
    const lease = Math.hypot(x, z);
    if (lease > LEASE_RADIUS - truckR) {
      const k = (LEASE_RADIUS - truckR) / (lease || 1);
      x *= k;
      z *= k;
      blocked = true;
    }
  }

  if (blocked) {
    const along = ((x - body.x) * sin + (z - body.z) * cos) / h;
    const cap = top * (body.speed < 0 ? 0.4 : 1);
    body.speed = Math.max(-top * 0.4, Math.min(cap, along));
  }

  body.x = x;
  body.z = z;
  return { surface, blocked };
}
