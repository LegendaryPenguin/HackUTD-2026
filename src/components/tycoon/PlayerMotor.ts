/**
 * Tycoon locomotion — patterns adapted from open-source browser tycoons:
 * - GastroCity / restaurant-city-threejs: instant wish*speed*dt, click-to-move,
 *   dampAlpha camera follow, shift sprint
 * - NanoBotsIdle: yaw-independent ground motion, camera lerp
 */
import { MathUtils, Vector3 } from 'three';

export function dampAlpha(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export type MotorKeys = {
  f: boolean;
  b: boolean;
  l: boolean;
  r: boolean;
  sprint: boolean;
  e: boolean;
};

export type MotorState = {
  x: number;
  z: number;
  facing: number;
  moving: boolean;
  /** Click-to-move target in XZ; undefined when idle / keyboard takes over */
  target: { x: number; z: number } | null;
};

export const WALK_SPEED = 5.4;
export const SPRINT_SPEED = 8.2;
export const ARRIVE_EPS = 0.12;

/** World-space WASD for a south-elevated isometric camera (W = -Z into the field). */
export function wishFromKeys(keys: MotorKeys): Vector3 {
  const v = new Vector3();
  if (keys.f) v.z -= 1;
  if (keys.b) v.z += 1;
  if (keys.l) v.x -= 1;
  if (keys.r) v.x += 1;
  if (v.lengthSq() > 1e-6) v.normalize();
  return v;
}

export function stepMotor(
  state: MotorState,
  keys: MotorKeys,
  dt: number,
  bounds: number,
): MotorState {
  const step = Math.min(0.05, Math.max(0, dt));
  let { x, z, facing, target } = state;
  let moving = false;

  const wish = wishFromKeys(keys);
  if (wish.lengthSq() > 1e-6) {
    target = null;
    const speed = keys.sprint ? SPRINT_SPEED : WALK_SPEED;
    x = MathUtils.clamp(x + wish.x * speed * step, -bounds, bounds);
    z = MathUtils.clamp(z + wish.z * speed * step, -bounds, bounds);
    facing = Math.atan2(wish.x, wish.z);
    moving = true;
  } else if (target) {
    const dx = target.x - x;
    const dz = target.z - z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE_EPS) {
      x = target.x;
      z = target.z;
      target = null;
    } else {
      const speed = keys.sprint ? SPRINT_SPEED : WALK_SPEED;
      const nx = dx / dist;
      const nz = dz / dist;
      const travel = Math.min(dist, speed * step);
      x = MathUtils.clamp(x + nx * travel, -bounds, bounds);
      z = MathUtils.clamp(z + nz * travel, -bounds, bounds);
      facing = Math.atan2(nx, nz);
      moving = true;
    }
  }

  return { x, z, facing, moving, target };
}

/** Isometric chase offset — GastroCity uses ~(9.8, 10.4, 11.2); we bias south for WASD clarity. */
export const ISO_OFFSET = new Vector3(6.5, 11.2, 12.5);

export function stepIsoCamera(
  camPos: Vector3,
  camTarget: Vector3,
  playerX: number,
  playerZ: number,
  zoom: number,
  dt: number,
): void {
  const desiredTarget = new Vector3(playerX, 0.55, playerZ);
  camTarget.lerp(desiredTarget, dampAlpha(5.2, dt));
  const offset = ISO_OFFSET.clone().multiplyScalar(zoom);
  const desiredCam = camTarget.clone().add(offset);
  camPos.lerp(desiredCam, dampAlpha(4.0, dt));
}
