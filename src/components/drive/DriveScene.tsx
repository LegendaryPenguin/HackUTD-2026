import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Stars } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DrivePoint } from '../../lib/driveMap';
import type { DriveDifficulty } from '../../lib/driveMission';
import type { CoachAllow } from './DriveCoach';

export type DriveTelemetry = {
  speed: number;
  dist: number;
  heading: number;
  bearing: number;
  aligned: boolean;
  x: number;
  z: number;
  steered: boolean;
};

type SceneProps = {
  points: DrivePoint[];
  targetId: string | null;
  playing: boolean;
  difficulty: DriveDifficulty;
  allow: CoachAllow | 'all';
  onArrive: () => void;
  onTelemetry: (t: DriveTelemetry) => void;
  resetKey: number;
};

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.04, 0]}>
        <planeGeometry args={[560, 560]} />
        <meshStandardMaterial color="#081210" roughness={1} metalness={0} />
      </mesh>
      {/* faint map grid */}
      {Array.from({ length: 29 }, (_, i) => {
        const v = -140 + i * 10;
        return (
          <group key={i}>
            <mesh position={[0, 0.01, v]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[280, 0.08]} />
              <meshBasicMaterial color="#143028" transparent opacity={0.35} />
            </mesh>
            <mesh position={[v, 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
              <planeGeometry args={[280, 0.08]} />
              <meshBasicMaterial color="#143028" transparent opacity={0.35} />
            </mesh>
          </group>
        );
      })}
      {/* scrub patches */}
      {Array.from({ length: 48 }, (_, i) => {
        const a = (i * 2.17) % (Math.PI * 2);
        const r = 22 + (i * 9) % 160;
        return (
          <mesh key={`b${i}`} position={[Math.cos(a) * r, 0.02, Math.sin(a) * r]} rotation={[-Math.PI / 2, 0, a]}>
            <circleGeometry args={[0.9 + (i % 4) * 0.4, 7]} />
            <meshStandardMaterial color="#0f1c16" roughness={1} />
          </mesh>
        );
      })}
    </group>
  );
}

function Road({
  from,
  to,
  active,
}: {
  from: [number, number];
  to: [number, number];
  active?: boolean;
}) {
  const mid = useMemo(() => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    return { len, angle, cx: (from[0] + to[0]) / 2, cz: (from[1] + to[1]) / 2, dx, dz };
  }, [from, to]);

  const dashes = useMemo(() => {
    const n = Math.max(2, Math.floor(mid.len / 6));
    const out: { x: number; z: number }[] = [];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      out.push({
        x: from[0] + (to[0] - from[0]) * t,
        z: from[1] + (to[1] - from[1]) * t,
      });
    }
    return out;
  }, [from, to, mid.len]);

  return (
    <group>
      {/* asphalt */}
      <mesh position={[mid.cx, 0.035, mid.cz]} rotation={[-Math.PI / 2, 0, -mid.angle]} receiveShadow>
        <planeGeometry args={[5.4, mid.len]} />
        <meshStandardMaterial
          color={active ? '#222c38' : '#161e28'}
          roughness={0.88}
          metalness={0.12}
        />
      </mesh>
      {/* soft shoulder glow when this is the mission road */}
      {active && (
        <mesh position={[mid.cx, 0.05, mid.cz]} rotation={[-Math.PI / 2, 0, -mid.angle]}>
          <planeGeometry args={[6.4, mid.len]} />
          <meshBasicMaterial color="#5ec8d8" transparent opacity={0.07} />
        </mesh>
      )}
      {/* edge lines */}
      <mesh position={[mid.cx, 0.045, mid.cz]} rotation={[-Math.PI / 2, 0, -mid.angle]}>
        <planeGeometry args={[0.12, mid.len * 0.98]} />
        <meshBasicMaterial color={active ? '#7eb8ff' : '#3a4a58'} transparent opacity={active ? 0.55 : 0.35} />
      </mesh>
      {/* center dashes */}
      {dashes.map((d, i) => (
        <mesh
          key={i}
          position={[d.x, 0.048, d.z]}
          rotation={[-Math.PI / 2, 0, -mid.angle]}
        >
          <planeGeometry args={[0.18, 2.2]} />
          <meshBasicMaterial color={active ? '#9ae4ef' : '#5a6a78'} transparent opacity={active ? 0.85 : 0.45} />
        </mesh>
      ))}
    </group>
  );
}

/** Vertical searchlight / nav beacon over the target tank. */
function TargetBeacon({ point }: { point: DrivePoint }) {
  const beam = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt;
    if (beam.current) {
      const mat = beam.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.18 + Math.sin(t.current * 2.4) * 0.06;
    }
    if (ring.current) {
      const s = 1 + Math.sin(t.current * 3.2) * 0.1;
      ring.current.scale.set(s, s, s);
      ring.current.rotation.z = t.current * 0.6;
    }
  });

  return (
    <group position={[point.x, 0, point.z]}>
      <mesh ref={beam} position={[0, 22, 0]}>
        <cylinderGeometry args={[0.35, 3.8, 44, 20, 1, true]} />
        <meshBasicMaterial color="#5ec8d8" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 44, 0]}>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshBasicMaterial color="#dff6ff" />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
        <ringGeometry args={[5.4, 6.4, 48]} />
        <meshBasicMaterial color="#5ec8d8" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[7.2, 7.6, 48]} />
        <meshBasicMaterial color="#7eb8ff" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 10, 0]} intensity={28} distance={36} color="#5ec8d8" />
      <pointLight position={[0, 30, 0]} intensity={12} distance={50} color="#9ae4ef" />
      <Html position={[0, 12, 0]} center distanceFactor={26} style={{ pointerEvents: 'none' }}>
        <div className="drive-beacon-tag">TARGET · {point.label}</div>
      </Html>
    </group>
  );
}

/** Floating chevron ahead of the truck that always points at the target. */
function NavArrow({
  truckRef,
  target,
}: {
  truckRef: React.MutableRefObject<{ x: number; z: number; yaw: number } | null>;
  target: DrivePoint | undefined;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current || !truckRef.current || !target) {
      if (group.current) group.current.visible = false;
      return;
    }
    const s = truckRef.current;
    const dist = Math.hypot(target.x - s.x, target.z - s.z);
    if (dist < 8) {
      group.current.visible = false;
      return;
    }
    group.current.visible = true;
    const bearing = Math.atan2(target.x - s.x, target.z - s.z);
    const ahead = 7.5;
    group.current.position.set(
      s.x + Math.sin(bearing) * ahead,
      2.4 + Math.sin(performance.now() * 0.004) * 0.25,
      s.z + Math.cos(bearing) * ahead,
    );
    group.current.rotation.y = bearing;
  });

  return (
    <group ref={group}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.55, 1.6, 3]} />
        <meshBasicMaterial color="#5ec8d8" />
      </mesh>
      <mesh position={[0, -0.15, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.28, 1.1, 0.12]} />
        <meshBasicMaterial color="#9ae4ef" transparent opacity={0.85} />
      </mesh>
      <pointLight intensity={6} distance={12} color="#5ec8d8" />
    </group>
  );
}

function TankPad({ point, isTarget }: { point: DrivePoint; isTarget: boolean }) {
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} receiveShadow>
        <circleGeometry args={[6.5, 28]} />
        <meshStandardMaterial color="#121c24" roughness={0.92} />
      </mesh>
      {/* pad ring like a map marker */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[6.2, 6.55, 36]} />
        <meshBasicMaterial color={isTarget ? '#5ec8d8' : '#2a3844'} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 3.2, 0]} castShadow>
        <cylinderGeometry args={[2.4, 2.4, 6.4, 24]} />
        <meshStandardMaterial color={isTarget ? '#3a5058' : '#2a3840'} metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 6.45, 0]} castShadow>
        <cylinderGeometry args={[2.55, 2.55, 0.35, 24]} />
        <meshStandardMaterial color="#1e2a32" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[2.55, 3.2, 0]}>
        <boxGeometry args={[0.12, 6.2, 0.55]} />
        <meshStandardMaterial color="#5a6a72" metalness={0.6} roughness={0.4} />
      </mesh>
      {!isTarget && (
        <Html position={[0, 8.2, 0]} center distanceFactor={28} style={{ pointerEvents: 'none' }}>
          <div className="drive-pin">{point.label}</div>
        </Html>
      )}
    </group>
  );
}

function Yard({ point }: { point: DrivePoint }) {
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
        <planeGeometry args={[22, 18]} />
        <meshStandardMaterial color="#1a2430" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <ringGeometry args={[10.5, 11, 48]} />
        <meshBasicMaterial color="#3a5060" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      {[-6, 0, 6].map((x) => (
        <mesh key={x} position={[x, 1.1, -6]} castShadow>
          <boxGeometry args={[3.4, 2.2, 2.6]} />
          <meshStandardMaterial color="#243038" metalness={0.2} roughness={0.7} />
        </mesh>
      ))}
      {/* yard lamp */}
      <mesh position={[8, 4, 6]}>
        <cylinderGeometry args={[0.12, 0.12, 8, 8]} />
        <meshStandardMaterial color="#1a2228" />
      </mesh>
      <pointLight position={[8, 8, 6]} intensity={14} distance={30} color="#e8c07a" />
      <Html position={[0, 4.5, 0]} center distanceFactor={30} style={{ pointerEvents: 'none' }}>
        <div className="drive-pin yard">{point.label}</div>
      </Html>
    </group>
  );
}

function Disposal({ point }: { point: DrivePoint }) {
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <circleGeometry args={[5, 20]} />
        <meshStandardMaterial color="#1a1520" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[1.6, 2.1, 2.4, 6]} />
        <meshStandardMaterial color="#3a2a38" metalness={0.3} roughness={0.6} />
      </mesh>
      <Html position={[0, 4, 0]} center distanceFactor={32} style={{ pointerEvents: 'none' }}>
        <div className="drive-pin disposal">{point.label}</div>
      </Html>
    </group>
  );
}

function normAngle(a: number) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function Truck({
  points,
  targetId,
  playing,
  difficulty,
  allow,
  onArrive,
  onTelemetry,
  resetKey,
  poseRef,
}: SceneProps & { poseRef: React.MutableRefObject<{ x: number; z: number; yaw: number } | null> }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const keys = useRef({ f: false, b: false, l: false, r: false });
  const state = useRef({ x: 0, z: 0, yaw: 0, speed: 0, arrived: false, steered: false, yawAtReset: 0 });
  const camTarget = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());
  const telemAcc = useRef(0);
  const allowRef = useRef(allow);
  const diffRef = useRef(difficulty);
  allowRef.current = allow;
  diffRef.current = difficulty;
  const [ready, setReady] = useState(false);

  const yard = points.find((p) => p.kind === 'yard');
  const target = points.find((p) => p.id === targetId);

  useEffect(() => {
    const permitted = (code: string) => {
      const a = allowRef.current;
      if (a === 'all') return true;
      if (code === 'KeyW' || code === 'ArrowUp') return !!a.f;
      if (code === 'KeyS' || code === 'ArrowDown') return !!a.b;
      if (code === 'KeyA' || code === 'ArrowLeft') return !!a.l;
      if (code === 'KeyD' || code === 'ArrowRight') return !!a.r;
      return false;
    };
    const down = (e: KeyboardEvent) => {
      if (!permitted(e.code)) return;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.f = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.b = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.l = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.r = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.f = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.b = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.l = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.r = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    keys.current = { f: false, b: false, l: false, r: false };
    state.current.steered = false;
    state.current.yawAtReset = state.current.yaw;
  }, [allow]);

  useEffect(() => {
    if (!yard) return;
    state.current = { x: yard.x, z: yard.z + 4, yaw: 0, speed: 0, arrived: false, steered: false, yawAtReset: 0 };
    poseRef.current = { x: yard.x, z: yard.z + 4, yaw: 0 };
    setReady(true);
  }, [yard, resetKey, poseRef]);

  useFrame((_, dt) => {
    if (!group.current || !ready) return;
    const s = state.current;
    const d = diffRef.current;
    const a = allowRef.current;
    const clamped = Math.min(dt, 0.05);
    const can = (k: keyof CoachAllow) => a === 'all' || !!a[k];

    if (playing && !s.arrived) {
      if (keys.current.f && can('f')) s.speed = Math.min(d.maxSpeed, s.speed + d.accel * clamped);
      else if (keys.current.b && can('b')) s.speed = Math.max(-d.maxSpeed * 0.45, s.speed - 28 * clamped);
      else {
        if (s.speed > 0) s.speed = Math.max(0, s.speed - 6 * clamped);
        if (s.speed < 0) s.speed = Math.min(0, s.speed + 6 * clamped);
      }
      const steerAmt = (keys.current.l && can('l') ? 1 : 0) - (keys.current.r && can('r') ? 1 : 0);
      if (Math.abs(s.speed) > 0.4 && steerAmt !== 0) {
        s.yaw += steerAmt * d.steer * (s.speed / d.maxSpeed) * clamped;
        if (Math.abs(s.yaw - s.yawAtReset) > 0.35) s.steered = true;
      }
      s.x += Math.sin(s.yaw) * s.speed * clamped;
      s.z += Math.cos(s.yaw) * s.speed * clamped;
      s.x = THREE.MathUtils.clamp(s.x, -200, 200);
      s.z = THREE.MathUtils.clamp(s.z, -200, 200);

      if (target) {
        const dist = Math.hypot(s.x - target.x, s.z - target.z);
        if (dist < d.arriveR) {
          s.arrived = true;
          s.speed = 0;
          onArrive();
        }
      }
    }

    poseRef.current = { x: s.x, z: s.z, yaw: s.yaw };
    group.current.position.set(s.x, 0, s.z);
    group.current.rotation.y = s.yaw;

    const back = 14;
    const height = 7.5;
    camTarget.current.set(s.x - Math.sin(s.yaw) * back, height, s.z - Math.cos(s.yaw) * back);
    camera.position.lerp(camTarget.current, 1 - Math.pow(0.001, clamped));
    lookAt.current.set(s.x, 2.2, s.z);
    camera.lookAt(lookAt.current);

    telemAcc.current += clamped;
    if (telemAcc.current >= 0.08) {
      telemAcc.current = 0;
      const bearing = target ? Math.atan2(target.x - s.x, target.z - s.z) : s.yaw;
      const aligned = Math.abs(normAngle(bearing - s.yaw)) < 0.4;
      const dist = target ? Math.hypot(s.x - target.x, s.z - target.z) : 0;
      onTelemetry({
        speed: Math.abs(s.speed),
        dist,
        heading: s.yaw,
        bearing,
        aligned,
        x: s.x,
        z: s.z,
        steered: s.steered,
      });
    }
  });

  return (
    <group ref={group}>
      <mesh position={[0, 1.35, 0.9]} castShadow>
        <boxGeometry args={[2.2, 1.5, 2.2]} />
        <meshStandardMaterial color="#5ec8d8" metalness={0.35} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.45, -2.4]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[1.05, 1.05, 4.6, 16]} />
        <meshStandardMaterial color="#2c3a44" metalness={0.55} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0.55, -0.6]} castShadow>
        <boxGeometry args={[2.0, 0.35, 6.2]} />
        <meshStandardMaterial color="#121a20" metalness={0.4} roughness={0.6} />
      </mesh>
      {[
        [1.05, 0.45, 1.4],
        [-1.05, 0.45, 1.4],
        [1.05, 0.45, -1.2],
        [-1.05, 0.45, -1.2],
        [1.05, 0.45, -3.4],
        [-1.05, 0.45, -3.4],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.35, 12]} />
          <meshStandardMaterial color="#0a0e12" roughness={0.9} />
        </mesh>
      ))}
      <spotLight position={[0, 1.4, 2.2]} angle={0.45} penumbra={0.5} intensity={28} distance={48} color="#dff6ff" castShadow />
    </group>
  );
}

function WorldInner(props: SceneProps) {
  const yard = props.points.find((p) => p.kind === 'yard');
  const tanks = props.points.filter((p) => p.kind === 'tank');
  const disposal = props.points.find((p) => p.kind === 'disposal');
  const target = props.points.find((p) => p.id === props.targetId);
  const fog = props.difficulty;
  const poseRef = useRef<{ x: number; z: number; yaw: number } | null>(null);

  const roads = useMemo(() => {
    if (!yard) return [] as { from: [number, number]; to: [number, number]; id: string }[];
    const tankRoads = tanks.map((t) => ({
      from: [yard.x, yard.z] as [number, number],
      to: [t.x, t.z] as [number, number],
      id: t.id,
    }));
    if (disposal) {
      tankRoads.push({
        from: [yard.x, yard.z],
        to: [disposal.x, disposal.z],
        id: disposal.id,
      });
    }
    return tankRoads;
  }, [yard, tanks, disposal]);

  return (
    <>
      <color attach="background" args={['#050c14']} />
      <fog attach="fog" args={['#050c14', fog.fogNear, fog.fogFar]} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[50, 70, 25]} intensity={0.5} castShadow color="#9bb8c8" />
      <hemisphereLight args={['#2a4a5a', '#080e0c', 0.4]} />
      <Stars radius={200} depth={70} count={2200} factor={3.2} saturation={0.15} fade speed={0.35} />
      <Ground />
      {roads.map((r) => (
        <Road key={r.id} from={r.from} to={r.to} active={r.id === props.targetId} />
      ))}
      {yard && <Yard point={yard} />}
      {disposal && <Disposal point={disposal} />}
      {tanks.map((t) => (
        <TankPad key={t.id} point={t} isTarget={t.id === props.targetId} />
      ))}
      {target && <TargetBeacon point={target} />}
      <Truck {...props} poseRef={poseRef} />
      <NavArrow truckRef={poseRef} target={target} />
    </>
  );
}

export function DriveScene(props: SceneProps) {
  return (
    <Canvas shadows camera={{ position: [0, 10, 16], fov: 55, near: 0.1, far: 400 }} dpr={[1, 1.75]}>
      <WorldInner {...props} />
    </Canvas>
  );
}
